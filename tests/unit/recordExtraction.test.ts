/**
 * scripts/record-extraction.ts (plan Task 20): its argument and environment handling only. With both
 * ANTHROPIC_API_KEY and DEMO_ACCESS_CODE set the script calls the Claude API, so no run here gets both: each one must
 * stop before any document is read. The script runs as `npm run record:extraction` does, with tsx.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SCRIPT = path.join(ROOT, "scripts", "record-extraction.ts");
const FIXTURE_DIR = path.join(ROOT, "fixtures", "extraction");
const TEMP_DIR = mkdtempSync(path.join(tmpdir(), "censio-record-"));

afterAll(() => rmSync(TEMP_DIR, { recursive: true, force: true }));

/** Runs the script with the given arguments and variables; the two Live AI variables are unset unless given. */
function record(args: string[], vars: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.DEMO_ACCESS_CODE;
  const run = spawnSync(process.execPath, [TSX_CLI, SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...env, ...vars },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** The committed fixtures, file name → content. */
function fixtures(): Record<string, string> {
  return Object.fromEntries(readdirSync(FIXTURE_DIR).map((name) => [name, readFileSync(path.join(FIXTURE_DIR, name), "utf8")]));
}

function envFile(name: string, content: string): string {
  const file = path.join(TEMP_DIR, name);
  writeFileSync(file, content);
  return file;
}

describe("npm run record:extraction", () => {
  it("refuses to run without ANTHROPIC_API_KEY and DEMO_ACCESS_CODE, and writes nothing", () => {
    const before = fixtures();
    const run = record([]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      "record:extraction reads the sample PDFs with Live AI, but ANTHROPIC_API_KEY and DEMO_ACCESS_CODE are not set.",
    );
    expect(run.stderr).toContain("npm run record:extraction -- --env-file=.env.local");
    expect(run.stderr).toContain("Nothing was read or written.");
    expect(run.stdout).toBe("");
    expect(fixtures()).toEqual(before);
  });

  it("names the one variable that is missing, and a blank value counts as missing", () => {
    const keyOnly = record([], { ANTHROPIC_API_KEY: "sk-ant-test-not-a-real-key" });
    expect(keyOnly.status).toBe(1);
    expect(keyOnly.stderr).toContain("but DEMO_ACCESS_CODE is not set.");

    const blankKey = record(["--dry-run"], { ANTHROPIC_API_KEY: "  ", DEMO_ACCESS_CODE: "letmein" });
    expect(blankKey.status).toBe(1);
    expect(blankKey.stderr).toContain("but ANTHROPIC_API_KEY is not set.");
  });

  it("--env-file loads the variables from a file; variables already set win", () => {
    const codeOnly = envFile("code.env", "DEMO_ACCESS_CODE=from-file\n");
    const loaded = record([`--env-file=${codeOnly}`]);
    expect(loaded.status).toBe(1);
    expect(loaded.stderr).toContain("but ANTHROPIC_API_KEY is not set.");
    expect(record(["--env-file", codeOnly]).stderr).toContain("but ANTHROPIC_API_KEY is not set.");

    // The blank key set in the environment is kept over the file's.
    const keyOnly = envFile("key.env", "ANTHROPIC_API_KEY=sk-ant-test-not-a-real-key\n");
    const kept = record([`--env-file=${keyOnly}`], { ANTHROPIC_API_KEY: "" });
    expect(kept.status).toBe(1);
    expect(kept.stderr).toContain("but ANTHROPIC_API_KEY and DEMO_ACCESS_CODE are not set.");
  });

  it("--help prints the usage without needing the variables", () => {
    const run = record(["--help"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Usage: npm run record:extraction [-- options]");
    expect(run.stdout).toContain("--dry-run");
    expect(run.stdout).toContain("--env-file=<path>");
  });

  it("refuses unknown arguments with exit code 2", () => {
    const unknown = record(["--bogus"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("Unknown argument: --bogus");
    expect(unknown.stderr).toContain("Usage: npm run record:extraction");

    const noPath = record(["--env-file"]);
    expect(noPath.status).toBe(2);
    expect(noPath.stderr).toContain("--env-file needs a path");
  });
});
