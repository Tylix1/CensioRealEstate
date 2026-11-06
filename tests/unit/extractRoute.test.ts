/**
 * The extraction route and its server helpers (plan Task 10, spec §6.1 and §6.4).
 *
 * No API key is set in this environment, so the route runs in Demo mode. The live path is exercised with a stubbed
 * `messages.parse`, and with the real SDK over a fake `fetch`: `getClient` is mocked and throws unless a test hands it
 * one of those, so no test can reach the Claude API.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Anthropic, AnthropicError } from "@anthropic-ai/sdk";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { POST, maxDuration, type ExtractResponse } from "@/app/api/extract/route";
import { GET as getMode } from "@/app/api/mode/route";
import { citedFields } from "@/lib/deal/fromExtraction";
import { cachedExtraction } from "@/lib/extraction/cache";
import { EXTRACTION_INSTRUCTION, EXTRACTION_SYSTEM } from "@/lib/extraction/prompt";
import { ExtractionResultSchema, type ExtractionResult } from "@/lib/extraction/schemas";
import { verifyQuotes } from "@/lib/extraction/validate";
import { MODEL, accessCodeValid, getClient, liveAiConfigured } from "@/lib/server/anthropic";
import { checkRate } from "@/lib/server/limits";
import { countPages, pageTexts } from "@/lib/server/pdfText";

vi.mock("@/lib/server/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/anthropic")>()),
  getClient: vi.fn(),
}));

const ROOT = process.cwd();
const SAMPLE_DIR = path.join(ROOT, "public", "sample");
const FIXTURE_DIR = path.join(ROOT, "fixtures", "extraction");
const TENANT_LIST = "Mieterliste_Musterstrasse12.pdf";
const ACCESS_CODE = "letmein";
const HOUR_MS = 60 * 60 * 1000;

const index: Record<string, { sha256: string; source: "demo-fixture" | "recorded-live" }> = JSON.parse(
  readFileSync(path.join(FIXTURE_DIR, "index.json"), "utf8"),
);
/**
 * How the route labels a cached sample: "demo-fixture" for the committed demo fixtures, "cache" once
 * `npm run record:extraction` has replaced a fixture with a recorded Live AI result.
 */
const cachedSource = (fileName: string) => (index[fileName].source === "recorded-live" ? "cache" : "demo-fixture");

type Ok = Extract<ExtractResponse, { ok: true }>;
type Failed = Extract<ExtractResponse, { ok: false }>;

function sample(fileName: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(path.join(SAMPLE_DIR, fileName)));
}

function fixture(fileName: string): ExtractionResult {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${index[fileName].sha256}.json`), "utf8"));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A PDF that is not one of the sample documents: fresh random text on every page. */
async function randomPdf(pages = 1): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    doc.addPage().drawText(`Kein Musterdokument ${Math.random()}`, { x: 50, y: 700, size: 12, font });
  }
  return new Uint8Array(await doc.save());
}

/** The multipart request the wizard sends: fields `file` and `code`. */
function upload(file: Blob | null, opts: { code?: string; ip?: string } = {}): Request {
  const form = new FormData();
  if (file) form.set("file", file);
  if (opts.code !== undefined) form.set("code", opts.code);
  return new Request("http://localhost/api/extract", {
    method: "POST",
    body: form,
    headers: opts.ip ? { "x-forwarded-for": `${opts.ip}, 10.0.0.1` } : {},
  });
}

function pdfFile(bytes: Uint8Array<ArrayBuffer>, name = "upload.pdf"): File {
  return new File([bytes], name, { type: "application/pdf" });
}

async function extract(request: Request): Promise<{ status: number; headers: Headers; body: ExtractResponse }> {
  const response = await POST(request);
  return { status: response.status, headers: response.headers, body: (await response.json()) as ExtractResponse };
}

function ok(body: ExtractResponse): Ok {
  if (!body.ok) throw new Error(`expected ok:true, got ${body.error}: ${body.message}`);
  return body;
}

function failed(body: ExtractResponse): Failed {
  if (body.ok) throw new Error(`expected ok:false, got source ${body.source}`);
  return body;
}

/** Hands the route a fake client whose `beta.messages.parse` is `parse`. */
function stubClaude(parse: (...args: unknown[]) => Promise<unknown>) {
  const fn = vi.fn(parse);
  vi.mocked(getClient).mockReturnValue({ beta: { messages: { parse: fn } } } as unknown as Anthropic);
  return fn;
}

function enableLiveAi() {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-not-a-real-key");
  vi.stubEnv("DEMO_ACCESS_CODE", ACCESS_CODE);
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("DEMO_ACCESS_CODE", "");
  vi.mocked(getClient).mockImplementation(() => {
    throw new Error("The tests never call the Claude API");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getClient).mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/extract without Live AI (no key set)", () => {
  it("reads the sample tenant list from its demo fixture, with every quote verified", async () => {
    const bytes = sample(TENANT_LIST);
    const { status, body } = await extract(upload(pdfFile(bytes, TENANT_LIST)));

    expect(status).toBe(200);
    const res = ok(body);
    expect(res.source).toBe(cachedSource(TENANT_LIST)); // "demo-fixture" for the committed fixtures
    expect(res.sha256).toBe(sha256(bytes));
    expect(res.sha256).toBe(index[TENANT_LIST].sha256);
    expect(res.pages).toBe(2);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
    expect(res.result).toEqual(fixture(TENANT_LIST));
    expect(Object.keys(res.verified)).toEqual(citedFields(res.result).map((f) => f.path));
    expect(Object.keys(res.verified).length).toBeGreaterThan(40);
    expect(Object.values(res.verified).every(Boolean)).toBe(true);
    expect(getClient).not.toHaveBeenCalled();
  });

  it("reads all five sample documents from the cache", async () => {
    for (const fileName of Object.keys(index)) {
      const res = ok((await extract(upload(pdfFile(sample(fileName), fileName)))).body);
      expect(res.source, fileName).toBe(cachedSource(fileName));
      expect(res.result.documentType, fileName).toBe(fixture(fileName).documentType);
      expect(Object.values(res.verified).every(Boolean), fileName).toBe(true);
    }
  });

  it("says Live AI is needed for a PDF that is not a sample document", async () => {
    const { status, body } = await extract(upload(pdfFile(await randomPdf(1), "Kaufvertrag.pdf")));

    expect(status).toBe(422);
    expect(body).toEqual({ ok: false, error: "live_ai_required", message: "Live AI is needed to read this document." });
    expect(getClient).not.toHaveBeenCalled();
  });

  it("refuses a PDF over 5 MB", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(new TextEncoder().encode("%PDF-1.7\n"));
    const { status, body } = await extract(upload(pdfFile(big, "scan.pdf")));

    expect(status).toBe(413);
    expect(failed(body).error).toBe("too_large");
  });

  it("refuses a file that is not a PDF", async () => {
    const text = new File(["WE 1 | EG links | 62,0 m² | 520,80 €"], "Mieterliste.txt", { type: "text/plain" });
    const { status, body } = await extract(upload(text));

    expect(status).toBe(415);
    expect(failed(body).error).toBe("not_pdf");
  });

  it("refuses a PDF with more than 10 pages", async () => {
    const { status, body } = await extract(upload(pdfFile(await randomPdf(11))));

    expect(status).toBe(422);
    const res = failed(body);
    expect(res.error).toBe("too_many_pages");
    expect(res.message).toContain("11 pages");
  });

  it("refuses a damaged PDF and a request without a file", async () => {
    const damaged = new TextEncoder().encode("%PDF-1.7\nthis is not really a PDF\n%%EOF\n");
    expect(failed((await extract(upload(pdfFile(new Uint8Array(damaged))))).body).error).toBe("not_pdf");

    const { status, body } = await extract(upload(null, { code: ACCESS_CODE }));
    expect(status).toBe(400);
    expect(failed(body).error).toBe("not_pdf");
  });

  it("stays in Demo mode when the access code does not match", async () => {
    enableLiveAi();
    const sampleRes = ok((await extract(upload(pdfFile(sample(TENANT_LIST)), { code: "guess" }))).body);
    expect(sampleRes.source).toBe(cachedSource(TENANT_LIST));

    const unknown = failed((await extract(upload(pdfFile(await randomPdf()), { code: "guess" }))).body);
    expect(unknown.error).toBe("live_ai_required");
    expect(getClient).not.toHaveBeenCalled();
  });

  it("allows 60 seconds per request", () => {
    expect(maxDuration).toBe(60);
  });
});

describe("POST /api/extract with Live AI (stubbed client)", () => {
  beforeEach(enableLiveAi);

  it("sends the PDF to Claude with structured output, then checks every quote against the text layer", async () => {
    const bytes = sample(TENANT_LIST);
    const answer = fixture(TENANT_LIST);
    answer.tenantList!.units[0].areaM2.quote = "63,5 m²"; // not on page 2
    const parse = stubClaude(async () => ({ stop_reason: "end_turn", content: [], parsed_output: answer }));

    const { status, body } = await extract(upload(pdfFile(bytes, TENANT_LIST), { code: ACCESS_CODE, ip: "192.0.2.10" }));

    expect(status).toBe(200);
    const res = ok(body);
    expect(res.source).toBe("live");
    expect(res.result).toEqual(answer);
    expect(res.verified["tenantList.units.0.areaM2"]).toBe(false);
    expect(Object.entries(res.verified).filter(([, found]) => !found)).toEqual([["tenantList.units.0.areaM2", false]]);

    expect(parse).toHaveBeenCalledTimes(1);
    const params = parse.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: MODEL,
      max_tokens: 8000,
      system: EXTRACTION_SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema" } },
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
            { type: "text", text: EXTRACTION_INSTRUCTION },
          ],
        },
      ],
    });
    expect(MODEL).toBe("claude-opus-5-5");
    for (const forbidden of ["temperature", "thinking", "budget_tokens", "top_p", "top_k"]) {
      expect(params).not.toHaveProperty(forbidden);
    }
    // Server-side refusal fallback (client.beta.messages.parse accepts it in the installed SDK).
    expect(params).toMatchObject({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    // Bounded by the route's time budget and cancelled when the browser goes away.
    expect(parse.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) });
    expect((parse.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(false);
  });

  it("returns ai_refused when Claude declines, without reading the output", async () => {
    stubClaude(async () => ({
      stop_reason: "refusal",
      content: [],
      get parsed_output(): never {
        throw new Error("parsed_output must not be read after a refusal");
      },
    }));
    const { status, body } = await extract(upload(pdfFile(await randomPdf()), { code: ACCESS_CODE, ip: "192.0.2.11" }));

    expect(status).toBe(422);
    expect(failed(body).error).toBe("ai_refused");
  });

  it("maps an answer that does not fit the schema to ai_error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubClaude(async () => {
      throw new AnthropicError("Failed to parse structured output: floor: Invalid option");
    });
    const { status, body } = await extract(upload(pdfFile(await randomPdf()), { code: ACCESS_CODE, ip: "192.0.2.12" }));

    expect(status).toBe(502);
    expect(failed(body).error).toBe("ai_error");
  });

  it("falls back to the cached result when the live call fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const parse = stubClaude(async () => {
      throw new Error("529 overloaded");
    });
    const res = ok((await extract(upload(pdfFile(sample(TENANT_LIST)), { code: ACCESS_CODE, ip: "192.0.2.13" }))).body);

    expect(parse).toHaveBeenCalledTimes(1);
    expect(res.source).toBe(cachedSource(TENANT_LIST));
    expect(res.result).toEqual(fixture(TENANT_LIST));
  });

  it("uses the cache once the hourly limit is reached, and says so for other files", async () => {
    const ip = "198.51.100.23";
    for (let i = 0; i < 15; i++) checkRate(ip, "extract");
    const parse = stubClaude(async () => {
      throw new Error("must not be called");
    });

    const sampleRes = ok((await extract(upload(pdfFile(sample(TENANT_LIST)), { code: ACCESS_CODE, ip }))).body);
    expect(sampleRes.source).toBe(cachedSource(TENANT_LIST));

    const { status, headers, body } = await extract(upload(pdfFile(await randomPdf()), { code: ACCESS_CODE, ip }));
    expect(status).toBe(429);
    expect(Number(headers.get("retry-after"))).toBeGreaterThan(0);
    const res = failed(body);
    expect(res.error).toBe("rate_limited");
    expect(res.message).toContain("Live AI is needed to read this document.");
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("POST /api/extract through the real SDK (fake transport, no network)", () => {
  beforeEach(enableLiveAi);

  /** A real client whose HTTP layer answers every request with `reply` and records what was sent. */
  function fakeTransport(reply: Record<string, unknown>) {
    const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      sent.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return Response.json(reply, { headers: { "request-id": "req_test" } });
    };
    vi.mocked(getClient).mockReturnValue(new Anthropic({ apiKey: "sk-ant-test-not-a-real-key", fetch, maxRetries: 0 }));
    return sent;
  }

  function message(content: unknown[], stopReason = "end_turn") {
    return {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: MODEL,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 2400, output_tokens: 900 },
    };
  }

  it("sends one beta Messages request with the fallback opt-in and parses the JSON answer", async () => {
    const answer = fixture(TENANT_LIST);
    const sent = fakeTransport(message([{ type: "text", text: JSON.stringify(answer) }]));

    const res = ok((await extract(upload(pdfFile(sample(TENANT_LIST)), { code: ACCESS_CODE, ip: "192.0.2.20" }))).body);
    expect(res.source).toBe("live");
    expect(res.result).toEqual(answer);
    expect(Object.values(res.verified).every(Boolean)).toBe(true);

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/v1\/messages$/);
    expect(sent[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const body = sent[0].body;
    expect(body).toMatchObject({ model: "claude-opus-5-5", max_tokens: 8000, fallbacks: "default" });
    expect(body).not.toHaveProperty("betas");
    expect(body.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: expect.any(Object) } });
  });

  it("maps an answer outside the schema (an off-list enum value) to ai_error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = fixture(TENANT_LIST);
    const offList = JSON.stringify(answer).replace('"value":"GF"', '"value":"EG"');
    fakeTransport(message([{ type: "text", text: offList }]));

    const { status, body } = await extract(upload(pdfFile(await randomPdf()), { code: ACCESS_CODE, ip: "192.0.2.21" }));
    expect(status).toBe(502);
    expect(failed(body).error).toBe("ai_error");
  });

  it("returns ai_refused for a declined request", async () => {
    fakeTransport(message([], "refusal"));
    const { body } = await extract(upload(pdfFile(await randomPdf()), { code: ACCESS_CODE, ip: "192.0.2.22" }));
    expect(failed(body).error).toBe("ai_refused");
  });
});

describe("GET /api/mode", () => {
  async function mode(query: string) {
    const response = getMode(new Request(`http://localhost/api/mode${query}`));
    return (await response).json();
  }

  it("reports Demo mode without a key", async () => {
    expect(await mode("?code=letmein")).toEqual({ live: false, reason: "no_key" });
  });

  it("reports Live AI only for the matching access code", async () => {
    enableLiveAi();
    expect(await mode("")).toEqual({ live: false, reason: "no_code" });
    expect(await mode("?code=guess")).toEqual({ live: false, reason: "bad_code" });
    expect(await mode(`?code=${ACCESS_CODE}`)).toEqual({ live: true, reason: "ok" });
  });
});

describe("server helpers", () => {
  it("checkRate allows 3 extraction batches and then refuses", () => {
    const ip = "203.0.113.7";
    const t0 = Date.UTC(2026, 10, 6, 9, 0, 0);
    // A batch is one deal's documents, counted as 5 files: 3 batches are 15 extract calls per rolling hour.
    for (let i = 0; i < 15; i++) expect(checkRate(ip, "extract", t0 + i * 1000).ok, `file ${i + 1}`).toBe(true);

    const refused = checkRate(ip, "extract", t0 + 60_000);
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterSec).toBe(3540); // the first call leaves the window at t0 + 1 h

    expect(checkRate("203.0.113.8", "extract", t0 + 60_000).ok).toBe(true); // other IPs are counted apart
    expect(checkRate(ip, "revalue", t0 + 60_000).ok).toBe(true); // and so are notes
    expect(checkRate(ip, "extract", t0 + HOUR_MS).ok).toBe(true); // a rolling hour later
  });

  it("checkRate allows 15 revalue notes per hour", () => {
    const ip = "203.0.113.9";
    const t0 = Date.UTC(2026, 10, 6, 10, 0, 0);
    for (let i = 0; i < 15; i++) expect(checkRate(ip, "revalue", t0 + i).ok).toBe(true);
    expect(checkRate(ip, "revalue", t0 + 15)).toEqual({ ok: false, retryAfterSec: 3600 });
  });

  it("verifyQuotes marks a fabricated quote false", async () => {
    const pages = await pageTexts(sample(TENANT_LIST));
    const result = fixture(TENANT_LIST);
    expect(Object.values(verifyQuotes(result, pages)).every(Boolean)).toBe(true);

    result.tenantList!.units[7].rentPerMonth!.quote = "850,00 €"; // fabricated
    result.tenantList!.totalAreaM2.page = 1; // real text, wrong page
    result.tenantList!.address.quote = " "; // nothing quoted
    const verified = verifyQuotes(result, pages);
    expect(verified["tenantList.units.7.rentPerMonth"]).toBe(false);
    expect(verified["tenantList.totalAreaM2"]).toBe(false);
    expect(verified["tenantList.address"]).toBe(false);
    expect(Object.values(verified).filter((found) => !found)).toHaveLength(3);
  });

  it("verifyQuotes tolerates the text layer's line breaks and spacing, not other pages", () => {
    const cite = <T,>(value: T, page: number, quote: string) => ({ value, page, quote, confidence: "high" as const });
    const easement = "Beschränkte persönliche Dienstbarkeit (Leitungsrecht)";
    const result: ExtractionResult = {
      documentType: "land_register",
      summary: "Land register · plot 480 m² · 1 easement in section II",
      tenantList: null,
      landRegister: {
        kind: "Grundbuch",
        parcel: cite("Gemarkung Leipzig, Flur 12, Flurstück 123/4", 1, "Flurstück 123/4"),
        plotM2: cite(480, 1, "480 m²"),
        address: cite("Musterstraße 12", 1, "Musterstraße 12"),
        easements: [{ text: cite(easement, 4, easement), translationEn: "Limited personal easement (utility line right)" }],
        landChargesCount: 1,
      },
      energyCertificate: null,
      refurbishmentSheet: null,
      zoningPlan: null,
    };
    // As PDF.js may report page 1: runs split across lines, a no-break space, doubled spaces; page 4 lacks the entry.
    const pages = ["Flurstück\n123/4 Gebäude- und Freifläche 480\u00a0m²  Musterstraße\n12", "", "", "Beschränkte persönliche"];

    expect(verifyQuotes(result, pages)).toEqual({
      "landRegister.parcel": true,
      "landRegister.plotM2": true,
      "landRegister.address": true,
      "landRegister.easements.0.text": false,
    });

    result.landRegister!.plotM2.page = 7; // beyond the last page
    expect(verifyQuotes(result, pages)["landRegister.plotM2"]).toBe(false);
  });

  it("pageTexts and countPages read the text layer without consuming the caller's bytes", async () => {
    const bytes = sample("Grundbuch_Musterstrasse12.pdf");
    const before = sha256(bytes);
    expect(await countPages(bytes)).toBe(4);
    const pages = await pageTexts(bytes);
    expect(pages).toHaveLength(4);
    expect(pages[0]).toContain("Flurstück 123/4");
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(sha256(bytes)).toBe(before);
  });

  it("cachedExtraction finds the committed fixtures by sha256 only", () => {
    const entry = index[TENANT_LIST];
    expect(cachedExtraction(entry.sha256)).toEqual({ result: fixture(TENANT_LIST), source: entry.source });
    expect(cachedExtraction("0".repeat(64))).toBeNull();
    expect(cachedExtraction("../extraction/index")).toBeNull();
  });

  it("liveAiConfigured needs both variables and accessCodeValid the exact code", () => {
    expect(liveAiConfigured()).toBe(false);
    expect(accessCodeValid(ACCESS_CODE)).toBe(false);

    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-not-a-real-key");
    expect(liveAiConfigured()).toBe(false);
    vi.stubEnv("DEMO_ACCESS_CODE", ACCESS_CODE);
    expect(liveAiConfigured()).toBe(true);

    expect(accessCodeValid(ACCESS_CODE)).toBe(true);
    expect(accessCodeValid("letmein2")).toBe(false);
    expect(accessCodeValid("")).toBe(false);
    expect(accessCodeValid(null)).toBe(false);
  });

  it("tells Claude what the plan requires of the extraction prompt", () => {
    for (const type of [
      "tenant_list",
      "land_register",
      "condo_land_register",
      "energy_certificate",
      "refurbishment_sheet",
      "zoning_plan",
      "unknown",
    ]) {
      expect(EXTRACTION_SYSTEM).toContain(type);
    }
    for (const mapping of [
      "Hofseite → courtyard",
      "Straßenseite → street",
      "Balkon → balcony",
      "Dachterrasse → roof_terrace",
      "Bad saniert → renovated_bath",
    ]) {
      expect(EXTRACTION_SYSTEM).toContain(mapping);
    }
    for (const category of ["roof", "windows", "pipes", "heating", "exterior_walls", "bathrooms", "interior", "floor_plan"]) {
      expect(EXTRACTION_SYSTEM).toContain(category);
    }
    expect(EXTRACTION_SYSTEM).toContain("Abteilung III is financing — count it, never treat it as an easement");
    expect(EXTRACTION_SYSTEM).toContain("1-based page");
    expect(EXTRACTION_SYSTEM).toMatch(/confidence "?low"? when the value is unclear/);
    expect(EXTRACTION_INSTRUCTION).toBe("Classify and extract this document. Quotes must be copied verbatim from the page.");
  });

  it("spells out every allowed value of the schema's enums, which the SDK only describes and does not enforce", () => {
    const values = new Set<string>();
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(collect);
      } else if (typeof node === "object" && node !== null) {
        for (const [key, value] of Object.entries(node)) {
          if (key === "enum" && Array.isArray(value)) value.forEach((v) => values.add(String(v)));
          else collect(value);
        }
      }
    };
    collect(z.toJSONSchema(ExtractionResultSchema));

    expect(values.size).toBeGreaterThan(30);
    for (const value of values) expect(EXTRACTION_SYSTEM, value).toContain(value);
  });
});
