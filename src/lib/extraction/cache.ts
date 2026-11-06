/**
 * Committed extraction results, keyed by the PDF's SHA-256 (spec §6.4). The five sample PDFs ship with one each:
 * `fixtures/extraction/<sha256>.json` holds the bare `ExtractionResult`, and `fixtures/extraction/index.json` maps
 * each file name to `{ sha256, source }`, where `source` is "demo-fixture" (written with the samples) or
 * "recorded-live" (recorded from a real Live AI run).
 *
 * The files are read from disk at request time; next.config.ts traces `fixtures/extraction` into the extract route's
 * deployment bundle, because `fixtures/` lies outside `public/`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ExtractionResultSchema, type ExtractionResult } from "@/lib/extraction/schemas";

export type CachedSource = "demo-fixture" | "recorded-live";

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "extraction");
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The committed result for a PDF with this SHA-256 (lowercase hex), or null when there is none or it is invalid. */
export function cachedExtraction(sha256: string): { result: ExtractionResult; source: CachedSource } | null {
  if (!SHA256_HEX.test(sha256)) return null;
  const json = readJson(path.join(FIXTURE_DIR, `${sha256}.json`));
  if (json === undefined) return null;
  const parsed = ExtractionResultSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`[extraction cache] ${sha256}.json is not a valid extraction result`, parsed.error.issues.slice(0, 3));
    return null;
  }
  return { result: parsed.data, source: sourceOf(sha256) };
}

/** The index entry's source; a fixture missing from the index counts as a demo fixture. */
function sourceOf(sha256: string): CachedSource {
  const index = readJson(path.join(FIXTURE_DIR, "index.json"));
  if (typeof index !== "object" || index === null) return "demo-fixture";
  const entry = Object.values(index as Record<string, { sha256?: unknown; source?: unknown }>).find(
    (e) => e?.sha256 === sha256,
  );
  return entry?.source === "recorded-live" ? "recorded-live" : "demo-fixture";
}

/** Parsed JSON of a file, or undefined when it is missing or unreadable. */
function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}
