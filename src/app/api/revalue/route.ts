/**
 * POST /api/revalue: reads a valuer's Revalue note on the current version (spec §6.2 and §6.4, plan Task 11).
 *
 * Takes JSON `{ note, context, code }`: the note (at most 1,000 characters), the version it revises
 * (`RevalueContext`, built with `buildRevalueContext`) and the access code. Answers a `RevalueResult`:
 * - with Live AI allowed and the hourly limit not reached, Claude reads the note (structured output, effort medium,
 *   server-side refusal fallback) and `validateChanges` checks the answer against the deal (`mode: "live"`);
 * - otherwise, or when the live call is declined or fails, the rule-based parser reads it (`mode: "demo"`). The header
 *   `X-Revalue-Fallback` then says why Live AI was not used: `rate_limited` (with `Retry-After`), `ai_refused` or
 *   `ai_error`.
 * `durationMs` is the time the route took. A request without a usable note and context gets 400, a body over 256 KB
 * 413; neither creates anything.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { parseNote } from "@/lib/revalue/parser";
import { REVALUE_SYSTEM, revalueUserMessage } from "@/lib/revalue/prompt";
import {
  RevalueOutputSchema,
  RevalueRequestSchema,
  type RevalueContext,
  type RevalueOutput,
  type RevalueResult,
} from "@/lib/revalue/schema";
import { validateChanges } from "@/lib/revalue/validate";
import { MODEL, REFUSAL_FALLBACK, getClient, liveAccess } from "@/lib/server/anthropic";
import { MAX_NOTE_CHARS, checkRate, clientIp } from "@/lib/server/limits";

export const maxDuration = 60;

export type RevalueError = "bad_request" | "too_large" | "note_too_long";
export type RevalueFailure = { ok: false; error: RevalueError; message: string };
/** A RevalueResult with status 200, or a failure with status 400 or 413. */
export type RevalueResponse = RevalueResult | RevalueFailure;
/** Why a request that could have used Live AI was answered by the rule-based parser. */
export type RevalueFallback = "rate_limited" | "ai_refused" | "ai_error";

/** The whole Claude call, retries included, has to end this long after the request arrived (`maxDuration` is 60 s). */
const AI_DEADLINE_MS = 55_000;
/** Room for the thinking that effort "medium" spends before the short JSON answer. */
const MAX_TOKENS = 8000;
const MAX_BODY_CHARS = 256 * 1024;

const REVALUE_FORMAT = zodOutputFormat(RevalueOutputSchema);

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  if (Number(request.headers.get("content-length")) > MAX_BODY_CHARS) return tooLarge();
  const body = await request.text().catch(() => null);
  if (body === null) return fail(400, "bad_request", "The request could not be read.");
  if (body.length > MAX_BODY_CHARS) return tooLarge();
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail(400, "bad_request", "Send JSON with the note and its context.");
  }
  const parsed = RevalueRequestSchema.safeParse(json);
  if (!parsed.success) return fail(400, "bad_request", "Send JSON with the note and its context.");
  const { note, context, code } = parsed.data;
  if (note.length > MAX_NOTE_CHARS) {
    const length = note.length.toLocaleString("en-US");
    return fail(400, "note_too_long", `A note can have up to 1,000 characters; this one has ${length}.`);
  }

  let fallback: RevalueFallback | null = null;
  let retryAfterSec: number | undefined;
  if (note.trim() && liveAccess(code ?? null).live) {
    const rate = checkRate(clientIp(request), "revalue");
    if (rate.ok) {
      const deadline = AbortSignal.timeout(Math.max(0, startedAt + AI_DEADLINE_MS - Date.now()));
      const live = await readWithClaude(note, context, AbortSignal.any([request.signal, deadline]));
      if (live.ok) return respond(validateChanges(live.result, context, note), startedAt);
      fallback = live.reason;
    } else {
      fallback = "rate_limited";
      retryAfterSec = rate.retryAfterSec;
    }
  }
  return respond(parseNote(note, context), startedAt, fallback, retryAfterSec);
}

/** One structured-output call per note (spec §6.2): the version's context, then the note. */
async function readWithClaude(
  note: string,
  context: RevalueContext,
  signal: AbortSignal,
): Promise<{ ok: true; result: RevalueResult } | { ok: false; reason: "ai_refused" | "ai_error" }> {
  try {
    const response = await getClient().beta.messages.parse(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        ...REFUSAL_FALLBACK,
        output_config: { effort: "medium", format: REVALUE_FORMAT },
        system: REVALUE_SYSTEM,
        messages: [{ role: "user", content: revalueUserMessage(note, context) }],
      },
      { signal },
    );

    // A declined request (after the server-side fallback) carries no usable output: check before reading it.
    if (response.stop_reason === "refusal") return { ok: false, reason: "ai_refused" };
    const output = response.parsed_output;
    if (!output) return { ok: false, reason: "ai_error" };
    return { ok: true, result: fromModel(output) };
  } catch (error) {
    // API errors, timeouts, and answers that do not parse into the schema (e.g. a parameter outside the enum).
    console.error("[api/revalue] Claude revalue failed:", error);
    return { ok: false, reason: "ai_error" };
  }
}

/** The model's answer as a RevalueResult; `validateChanges` fills in each change's `from`. */
function fromModel(output: RevalueOutput): RevalueResult {
  return {
    intent: output.intent,
    changes: output.changes.map((c) => ({
      parameter: c.parameter,
      ...(c.unitId ? { unitId: c.unitId } : {}),
      from: 0,
      to: c.to,
      reason: c.reason,
      sourceKind: c.sourceKind,
      ...(c.documentId ? { documentId: c.documentId } : {}),
    })),
    explanation: output.explanation,
    answer: output.answer,
    clarifyingQuestion: output.clarifyingQuestion,
    mode: "live",
    durationMs: 0,
  };
}

function respond(
  result: RevalueResult,
  startedAt: number,
  fallback: RevalueFallback | null = null,
  retryAfterSec?: number,
): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (fallback) headers["X-Revalue-Fallback"] = fallback;
  if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
  return Response.json({ ...result, durationMs: Date.now() - startedAt } satisfies RevalueResponse, { headers });
}

function tooLarge(): Response {
  return fail(413, "too_large", "This request is too large.");
}

function fail(status: number, error: RevalueError, message: string): Response {
  return Response.json({ ok: false, error, message } satisfies RevalueResponse, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
