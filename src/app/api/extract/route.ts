/**
 * POST /api/extract: reads one uploaded PDF (spec §6.1 and §6.4, plan Task 10).
 *
 * Takes multipart form data with the fields `file` (the PDF) and `code` (the access code), then:
 * 1. checks that the file is a PDF (magic bytes) of at most 5 MB;
 * 2. fingerprints it (SHA-256) and checks that it has at most 10 pages;
 * 3. with Live AI allowed and the hourly limit not reached, has Claude classify and extract it, checks every quote
 *    against the PDF's text layer and answers `source: "live"`;
 * 4. otherwise, or when the live call fails, answers with the committed result for this file if there is one
 *    (`"demo-fixture"`, or `"cache"` for a result recorded from a real run), its quotes checked the same way;
 * 5. otherwise reports why the document could not be read; an unknown file in Demo mode gets
 *    "Live AI is needed to read this document."
 */
import { createHash } from "node:crypto";
import { APIConnectionTimeoutError, APIUserAbortError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { cachedExtraction } from "@/lib/extraction/cache";
import { EXTRACTION_INSTRUCTION, EXTRACTION_SYSTEM } from "@/lib/extraction/prompt";
import { ExtractionResultSchema, type ExtractionResult } from "@/lib/extraction/schemas";
import { verifyQuotes } from "@/lib/extraction/validate";
import { MODEL, REFUSAL_FALLBACK, getClient, liveAccess } from "@/lib/server/anthropic";
import { MAX_PDF_BYTES, MAX_PDF_PAGES, checkRate, clientIp } from "@/lib/server/limits";
import { countPages, pageTexts } from "@/lib/server/pdfText";

export const maxDuration = 60;

export type ExtractError =
  | "too_large"
  | "too_many_pages"
  | "not_pdf"
  | "live_ai_required"
  | "rate_limited"
  | "ai_refused"
  | "ai_error";

export type ExtractResponse =
  | {
      ok: true;
      sha256: string;
      pages: number;
      source: "live" | "cache" | "demo-fixture";
      durationMs: number;
      result: ExtractionResult;
      /** Field path → whether its quote occurs on its stated page (keys as `citedFields`). */
      verified: Record<string, boolean>;
    }
  | { ok: false; error: ExtractError; message: string };

type Failure = Extract<ExtractResponse, { ok: false }>;

const LIVE_AI_REQUIRED = "Live AI is needed to read this document.";

const STATUS: Record<ExtractError, number> = {
  not_pdf: 415,
  too_large: 413,
  too_many_pages: 422,
  live_ai_required: 422,
  rate_limited: 429,
  ai_refused: 422,
  ai_error: 502,
};

/**
 * The whole Claude call, retries included, has to end this long after the request arrived, so the route still answers
 * (or falls back to the committed result) within its `maxDuration`.
 */
const AI_DEADLINE_MS = 55_000;
/** Room for the multipart framing and the `code` field on top of the PDF itself. */
const MULTIPART_SLACK_BYTES = 64 * 1024;
/** The PDF header `%PDF-`, which readers accept anywhere in the first 1,024 bytes. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PDF_HEADER_WINDOW = 1024;

const EXTRACTION_FORMAT = zodOutputFormat(ExtractionResultSchema);

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const tooLarge = () => fail({ ok: false, error: "too_large", message: "This PDF is larger than 5 MB." });

  // 1. One PDF of at most 5 MB.
  if (Number(request.headers.get("content-length")) > MAX_PDF_BYTES + MULTIPART_SLACK_BYTES) return tooLarge();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return fail({ ok: false, error: "not_pdf", message: "Upload one PDF file." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return tooLarge();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfHeader(bytes)) return fail({ ok: false, error: "not_pdf", message: "This file is not a PDF." });

  // 2. Fingerprint and page count; the text layer is read only for a document within the page limit.
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let pages: string[];
  try {
    const pageCount = await countPages(bytes);
    if (pageCount > MAX_PDF_PAGES) {
      return fail({
        ok: false,
        error: "too_many_pages",
        message: `This PDF has ${pageCount} pages; the prototype reads documents of up to ${MAX_PDF_PAGES} pages.`,
      });
    }
    pages = await pageTexts(bytes);
  } catch {
    return fail({ ok: false, error: "not_pdf", message: "This PDF could not be read." });
  }

  const succeed = (source: "live" | "cache" | "demo-fixture", result: ExtractionResult): Response =>
    Response.json({
      ok: true,
      sha256,
      pages: pages.length,
      source,
      durationMs: Date.now() - startedAt,
      result,
      verified: verifyQuotes(result, pages),
    } satisfies ExtractResponse);

  // 3. Live AI. What went wrong is reported only if no committed result can stand in.
  let liveFailure: { failure: Failure; retryAfterSec?: number } | null = null;
  const code = form?.get("code");
  if (liveAccess(typeof code === "string" ? code : null).live) {
    const rate = checkRate(clientIp(request), "extract");
    if (rate.ok) {
      // Cancelled when the browser goes away or the time budget, counted from the request's start, runs out.
      const deadline = AbortSignal.timeout(Math.max(0, startedAt + AI_DEADLINE_MS - Date.now()));
      const live = await readWithClaude(bytes, AbortSignal.any([request.signal, deadline]));
      if (live.ok) return succeed("live", live.result);
      liveFailure = { failure: live.failure };
    } else {
      const minutes = Math.ceil(rate.retryAfterSec / 60);
      liveFailure = {
        failure: {
          ok: false,
          error: "rate_limited",
          message: `${LIVE_AI_REQUIRED} The hourly Live AI limit is reached; try again in ${minutes} min.`,
        },
        retryAfterSec: rate.retryAfterSec,
      };
    }
  }

  // 4. The committed result for this exact file.
  const cached = cachedExtraction(sha256);
  if (cached) return succeed(cached.source === "recorded-live" ? "cache" : "demo-fixture", cached.result);

  // 5. Nothing could read it.
  if (liveFailure) return fail(liveFailure.failure, { retryAfterSec: liveFailure.retryAfterSec });
  return fail({ ok: false, error: "live_ai_required", message: LIVE_AI_REQUIRED });
}

/** One structured-output call per PDF: the document block first, then the instruction (spec §6.1). */
async function readWithClaude(
  pdf: Uint8Array,
  signal: AbortSignal,
): Promise<{ ok: true; result: ExtractionResult } | { ok: false; failure: Failure }> {
  try {
    const response = await getClient().beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 8000,
        ...REFUSAL_FALLBACK,
        output_config: { effort: "low", format: EXTRACTION_FORMAT },
        system: EXTRACTION_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") },
              },
              { type: "text", text: EXTRACTION_INSTRUCTION },
            ],
          },
        ],
      },
      { signal },
    );

    // A declined request (after the server-side fallback) carries no usable output: check before reading it.
    if (response.stop_reason === "refusal") {
      return { ok: false, failure: { ok: false, error: "ai_refused", message: "The AI declined to read this document." } };
    }
    const result = response.parsed_output;
    if (!result) {
      return { ok: false, failure: { ok: false, error: "ai_error", message: "The AI returned no result for this document." } };
    }
    return { ok: true, result };
  } catch (error) {
    // API errors, timeouts, and answers that do not parse into the schema (e.g. a value outside an enum).
    console.error("[api/extract] Claude extraction failed:", error);
    const timedOut = error instanceof APIUserAbortError || error instanceof APIConnectionTimeoutError;
    const message = timedOut
      ? "The AI took too long to read this document. Try again."
      : "The AI could not read this document. Try again.";
    return { ok: false, failure: { ok: false, error: "ai_error", message } };
  }
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, PDF_HEADER_WINDOW) - PDF_MAGIC.length;
  for (let i = 0; i <= end; i++) {
    if (PDF_MAGIC.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

function fail(failure: Failure, init: { status?: number; retryAfterSec?: number } = {}): Response {
  const headers: HeadersInit = init.retryAfterSec === undefined ? {} : { "Retry-After": String(init.retryAfterSec) };
  return Response.json(failure satisfies ExtractResponse, { status: init.status ?? STATUS[failure.error], headers });
}
