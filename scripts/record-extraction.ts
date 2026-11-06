/**
 * Records the committed extraction results of the five sample PDFs from a real Live AI run (spec §6.4, plan Task 20).
 * Run it once, locally, with the prototype's API key and access code:
 *
 *   ANTHROPIC_API_KEY=sk-ant-… DEMO_ACCESS_CODE=… npm run record:extraction
 *   npm run record:extraction -- --env-file=.env.local
 *
 * Each PDF in public/sample goes through the extraction route's own POST handler (src/app/api/extract/route.ts) in
 * this process, with the access code, so the prompt, schema, limits and quote check are the deployed app's. A result
 * counts only when the route answered `source: "live"` (a failed live call falls back to the committed fixture), kept
 * the document type of the committed fixture, found every quote on its page and marked no field as low confidence:
 * an unverified or low-confidence field would raise an extraction flag in the demo. Nothing is written unless all
 * five pass. Then each fixtures/extraction/<sha256>.json gets the bare ExtractionResult and index.json marks the file
 * "recorded-live", which the route serves as a cached AI result ("Cached result" in the wizard). Values that differ
 * from the committed fixture are listed; `npm test` then checks that the recorded results still reproduce the
 * sample's facts.
 *
 * Options: --env-file=<path> (load the variables from a .env file first), --dry-run (write nothing), --help.
 * Exit codes: 0 recorded (or a dry run passed, or --help), 1 refused or a document did not pass, 2 unknown arguments.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExtractResponse } from "@/app/api/extract/route";
import { citedFields } from "@/lib/deal/fromExtraction";
import { ExtractionResultSchema, type ExtractionResult } from "@/lib/extraction/schemas";

const ROOT = process.cwd();
const SAMPLE_DIR = path.join(ROOT, "public", "sample");
const FIXTURE_DIR = path.join(ROOT, "fixtures", "extraction");
const INDEX_PATH = path.join(FIXTURE_DIR, "index.json");
const REQUIRED_ENV = ["ANTHROPIC_API_KEY", "DEMO_ACCESS_CODE"] as const;
/** Differences listed per document; the rest are counted. */
const MAX_DIFFS_SHOWN = 8;

const USAGE = `Usage: npm run record:extraction [-- options]

Reads the five sample PDFs in public/sample with Live AI, through the extraction route's own code, and overwrites
their committed results in fixtures/extraction (marked "recorded-live"). Needs ANTHROPIC_API_KEY and
DEMO_ACCESS_CODE; one run costs about $0.30–0.45.

Options:
  --env-file=<path>  load the variables from a .env file first, e.g. .env.local (variables already set win)
  --dry-run          read and check the documents with Live AI, but write nothing
  -h, --help         show this help`;

interface Options {
  help: boolean;
  dryRun: boolean;
  envFile: string | null;
}

interface IndexEntry {
  sha256: string;
  source: "demo-fixture" | "recorded-live";
}

interface Outcome {
  fileName: string;
  sha256: string;
  result: ExtractionResult | null;
  /** Why this document's result cannot be recorded; empty when it can. */
  problems: string[];
  /** Cited values that differ from the committed fixture, as "path: before → after". */
  differences: string[];
}

function parseArgs(argv: string[]): Options | { error: string } {
  const options: Options = { help: false, dryRun: false, envFile: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--env-file" || arg.startsWith("--env-file=")) {
      const value = arg === "--env-file" ? argv[++i] : arg.slice("--env-file=".length);
      if (!value) return { error: "--env-file needs a path, e.g. --env-file=.env.local" };
      options.envFile = value;
    } else return { error: `Unknown argument: ${arg}` };
  }
  return options;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if ("error" in options) {
    console.error(`${options.error}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  if (options.envFile) {
    try {
      process.loadEnvFile(options.envFile);
    } catch (error) {
      const reason = error instanceof Error && "code" in error ? ` (${String(error.code)})` : "";
      console.error(`Cannot read the env file ${options.envFile}${reason}. Nothing was read or written.`);
      return 1;
    }
  }
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(
      [
        `record:extraction reads the sample PDFs with Live AI, but ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set.`,
        "Set both, the prototype's API key and its access code, for example:",
        "  ANTHROPIC_API_KEY=sk-ant-… DEMO_ACCESS_CODE=… npm run record:extraction",
        "  npm run record:extraction -- --env-file=.env.local",
        "Nothing was read or written.",
      ].join("\n"),
    );
    return 1;
  }

  const index = readIndex();
  if (!index) {
    console.error(`${path.relative(ROOT, INDEX_PATH)} is missing or unreadable. Run npm run generate:samples first.`);
    return 1;
  }

  // Loaded only now: the route pulls in the SDK and the PDF reader, which a refused run does not need.
  const { POST } = await import("@/app/api/extract/route");
  const code = process.env.DEMO_ACCESS_CODE ?? "";
  const outcomes: Outcome[] = [];
  for (const [fileName, entry] of Object.entries(index)) {
    const bytes = new Uint8Array(readFileSync(path.join(SAMPLE_DIR, fileName)));
    const form = new FormData();
    form.append("file", new File([bytes], fileName, { type: "application/pdf" }));
    form.append("code", code);
    const startedAt = Date.now();
    const response = await POST(new Request("http://localhost/api/extract", { method: "POST", body: form }));
    const body = (await response.json()) as ExtractResponse;
    const outcome = checkReading(fileName, entry, body);
    outcomes.push(outcome);
    report(outcome, body, Date.now() - startedAt);
  }

  const failed = outcomes.filter((o) => o.problems.length > 0);
  if (failed.length > 0) {
    console.error(
      `\nNothing was written: ${failed.length} of ${outcomes.length} documents did not pass. The committed fixtures are unchanged.`,
    );
    return 1;
  }
  if (options.dryRun) {
    console.log(`\nDry run: all ${outcomes.length} documents passed. Nothing was written.`);
    return 0;
  }

  for (const { sha256, result } of outcomes) {
    // Parsing orders the keys as in the schema, like the fixtures written by generate:samples.
    writeFileSync(path.join(FIXTURE_DIR, `${sha256}.json`), `${JSON.stringify(ExtractionResultSchema.parse(result), null, 2)}\n`);
  }
  const recorded: Record<string, IndexEntry> = Object.fromEntries(
    Object.entries(index).map(([fileName, entry]) => [fileName, { sha256: entry.sha256, source: "recorded-live" }]),
  );
  writeFileSync(INDEX_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
  console.log(
    [
      `\nRecorded ${outcomes.length} live results in ${path.relative(ROOT, FIXTURE_DIR)} (index.json: "recorded-live").`,
      "Next: run npm test and npm run e2e, which check that the recorded results still reproduce the sample's facts,",
      "then commit fixtures/extraction. To go back to the demo fixtures: git checkout fixtures/extraction.",
    ].join("\n"),
  );
  return 0;
}

/** fixtures/extraction/index.json: sample file name → its SHA-256 and the source of its committed result. */
function readIndex(): Record<string, IndexEntry> | null {
  try {
    const index = JSON.parse(readFileSync(INDEX_PATH, "utf8")) as Record<string, IndexEntry>;
    return Object.keys(index).length > 0 ? index : null;
  } catch {
    return null;
  }
}

/** Whether the route's answer for one sample PDF can replace its committed result. */
function checkReading(fileName: string, entry: IndexEntry, body: ExtractResponse): Outcome {
  const outcome: Outcome = { fileName, sha256: entry.sha256, result: null, problems: [], differences: [] };
  if (!body.ok) {
    outcome.problems.push(`not read (${body.error}): ${body.message}`);
    return outcome;
  }
  if (body.source !== "live") {
    outcome.problems.push(`answered from the committed result ("${body.source}"): the live call failed, see the error above`);
    return outcome;
  }
  if (body.sha256 !== entry.sha256) {
    outcome.problems.push("the PDF does not match fixtures/extraction/index.json: run npm run generate:samples first");
    return outcome;
  }

  outcome.result = body.result;
  const committed = committedResult(entry.sha256);
  if (committed && committed.documentType !== body.result.documentType) {
    outcome.problems.push(`classified as ${body.result.documentType}, not ${committed.documentType}`);
  }
  const fields = citedFields(body.result);
  const unverified = Object.entries(body.verified)
    .filter(([, ok]) => !ok)
    .map(([fieldPath]) => fieldPath);
  if (unverified.length > 0) {
    outcome.problems.push(`quote not found on its page: ${unverified.join(", ")}`);
  }
  const lowConfidence = fields.filter(({ field }) => field.confidence === "low").map(({ path: fieldPath }) => fieldPath);
  if (lowConfidence.length > 0) {
    outcome.problems.push(`low confidence: ${lowConfidence.join(", ")}`);
  }

  if (committed) {
    const before = new Map(citedFields(committed).map(({ path: fieldPath, field }) => [fieldPath, field.value]));
    for (const { path: fieldPath, field } of fields) {
      const old = before.get(fieldPath);
      if (!before.has(fieldPath)) outcome.differences.push(`${fieldPath}: new → ${JSON.stringify(field.value)}`);
      else if (JSON.stringify(old) !== JSON.stringify(field.value)) {
        outcome.differences.push(`${fieldPath}: ${JSON.stringify(old)} → ${JSON.stringify(field.value)}`);
      }
      before.delete(fieldPath);
    }
    for (const [fieldPath, old] of before) outcome.differences.push(`${fieldPath}: ${JSON.stringify(old)} → missing`);
  }
  return outcome;
}

/** The committed result for a SHA-256, or null when there is none or it does not parse. */
function committedResult(sha256: string): ExtractionResult | null {
  try {
    return ExtractionResultSchema.parse(JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${sha256}.json`), "utf8")));
  } catch {
    return null;
  }
}

function report(outcome: Outcome, body: ExtractResponse, elapsedMs: number): void {
  const seconds = `${(elapsedMs / 1000).toFixed(1)} s`;
  const name = outcome.fileName.padEnd(42);
  if (!body.ok || !outcome.result) {
    console.log(`✗ ${name} ${seconds}`);
  } else {
    const checks = Object.values(body.verified);
    const verified = `${checks.filter(Boolean).length}/${checks.length} quotes verified`;
    const mark = outcome.problems.length > 0 ? "✗" : "✓";
    console.log(`${mark} ${name} ${body.source} · ${body.pages} p. · ${seconds} · ${verified} · ${outcome.result.summary}`);
  }
  for (const problem of outcome.problems) console.log(`    problem: ${problem}`);
  if (outcome.differences.length > 0) {
    console.log(`    ${outcome.differences.length} cited value(s) differ from the committed fixture:`);
    for (const difference of outcome.differences.slice(0, MAX_DIFFS_SHOWN)) console.log(`      ${difference}`);
    if (outcome.differences.length > MAX_DIFFS_SHOWN) {
      console.log(`      … and ${outcome.differences.length - MAX_DIFFS_SHOWN} more`);
    }
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
