import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { extractText } from "unpdf";
import { blockMapTiles, skipOrientation } from "./helpers";

// The demo path of the video (spec §5.2, "Demo script for the video"; plan Task 20) as one take: Reset demo, the
// client's new valuation, AI at work, the senior valuer's note, revision and sign-off, and the client's PDF. E2E runs
// in Demo mode, as a take without an access code does: the sample PDFs come back as the committed extraction results
// and the rule-based parser reads the note.
//
// Next.js keeps pages visited earlier in the DOM, hidden: queries go through roles or are scoped to a landmark.

/** The persisted demo store (src/lib/store/demoStore.ts). */
const STORE_KEY = "censio-demo-v1";
const DEAL_ID = "CEN-2026-0147";
const DISCLAIMER = "Prototype with sample data — not a valuation report.";
/** The rehearsed note for check 1 (spec §5.3.6 and §6.2), one of the example notes in Demo mode. */
const REHEARSED =
  "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";
/** Checks 2–4 and their accept buttons. */
const ACCEPTS = [
  [2, "Accept 9.60 €/m²"],
  [3, "Accept 5 years"],
  [4, "Accept ±€0"],
] as const;

type Take = {
  /** Shot with `?recording=1`, which hides the demo bar for the whole take. */
  recording: boolean;
  /** On a 390 px phone: the valuer's screens must not scroll sideways. */
  phone: boolean;
};

test.beforeEach(async ({ page }) => {
  await skipOrientation(page);
  await blockMapTiles(page);
});

test("the video script runs end to end, from Reset demo to the downloaded PDF", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await demoTake(page, { recording: true, phone: false });
});

test("the same take on a 390 px phone: the valuer's screens do not scroll sideways", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await demoTake(page, { recording: false, phone: true });
});

async function demoTake(page: Page, take: Take): Promise<void> {
  const problems = consoleProblems(page);
  const bar = page.getByRole("region", { name: "Demo controls" });
  const fitsPhone = async (screen: string) => {
    if (!take.phone) return;
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${screen} scrolls sideways`).toBeLessThanOrEqual(0);
  };

  // Reset demo, from wherever the last take ended: the bar returns to sign-in once the seeded state is back.
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as Demo Capital GmbH" }).click();
  await expect(page).toHaveURL(/\/client$/);
  await bar.getByRole("button", { name: "Reset demo" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await savedState(page)).toMatchObject({ role: null, draft: null, submittedCount: 0 });
  if (take.recording) {
    await page.goto("/?recording=1");
    await expect(page.getByRole("button", { name: "Continue as Demo Capital GmbH" })).toBeVisible();
    await expect(bar).toHaveCount(0);
  }

  // 1. Client: New valuation, the sample documents read by the AI, and the 8 units it created.
  await page.getByRole("button", { name: "Continue as Demo Capital GmbH" }).click();
  await expect(page).toHaveURL(/\/client$/);
  await expectSamplePill(page);
  await page.getByRole("button", { name: "New valuation" }).click();
  await expect(page).toHaveURL(/\/client\/new$/);
  await expect(stepHeading(page, "Property")).toBeVisible();
  await expect(page.getByLabel("Street and number")).toHaveValue("Musterstraße 12");
  await next(page);

  await expect(stepHeading(page, "Documents")).toBeVisible();
  await page.getByRole("button", { name: "Use sample documents" }).click();
  const documents = page.getByRole("list", { name: "Uploaded documents" }).getByRole("listitem");
  await expect(documents).toHaveCount(5);
  for (const row of await documents.all()) {
    await expect(row.getByText(/^(Demo mode|Cached result)$/)).toBeVisible();
  }
  await expect(page.getByText("plot 480 m²")).toBeVisible();
  await expect(page.getByRole("list", { name: "Photos" }).getByRole("listitem")).toHaveCount(3);
  await next(page);

  await expect(stepHeading(page, "Units")).toBeVisible();
  await expect(page.getByText("The AI created 8 units from your tenant list.")).toBeVisible();
  await expect(page.getByLabel(/: area m²$/)).toHaveCount(8);
  await next(page);

  // 2. Submit, and AI at work runs to the hand-over.
  await expect(stepHeading(page, "Review & submit")).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/client/deals/${DEAL_ID}/processing$`));
  await expect(page.getByRole("heading", { name: "AI at work", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "With senior valuer for review" })).toBeVisible({ timeout: 20_000 });
  const log = page.getByRole("list", { name: "Run log" });
  await expect(log.getByRole("listitem")).toHaveCount(11);
  await expect(log).toContainText("4 judgement calls flagged");

  // 3. The senior valuer opens the deal, then check 1 and its evidence.
  await page.getByRole("link", { name: "Open as Senior Valuer" }).click();
  await expect(page).toHaveURL(new RegExp(`/valuer/deals/${DEAL_ID}$`));
  await expectSamplePill(page);
  const verdict = page.getByRole("region", { name: "Verdict" });
  const eye = page.getByRole("region", { name: "Needs your eye" });
  await expect(verdict.getByText("€1,300,000", { exact: true })).toBeVisible();
  await expect(verdict).toContainText("You sign 4 AI judgement calls · 0 of 4 reviewed");
  await fitsPhone("The deal review");

  await flagButton(page, 1).click();
  await expect(flagButton(page, 1)).toHaveAttribute("aria-expanded", "true");
  await expect(eye.getByText("3.5 % → €1.19 M (−€111k)")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Evidence" }).getByText("Mehrfamilienhäuser bis Baujahr 1948"),
  ).toBeVisible();
  await fitsPhone("Check 1 with its evidence");

  // 4. The rehearsed note: revision 2 at €1,210,000.
  await eye.getByRole("list", { name: "Example notes" }).getByRole("button", { name: REHEARSED, exact: true }).click();
  await expect(eye.getByRole("textbox", { name: "Note to the AI (Revalue)" })).toHaveValue(REHEARSED);
  await eye.getByRole("button", { name: "Send note & revalue" }).click();
  const revision = page.getByRole("region", { name: "Revision" });
  await expect(revision.getByRole("heading", { name: "AI is revising…" })).toBeVisible();
  await expect(revision.getByRole("heading", { name: /^Revision 2/ })).toHaveText("Revision 2 · revised in demo mode");
  await expect(verdict.getByText("€1,210,000", { exact: true })).toBeVisible();
  await expect(verdict).toContainText("−6.9 % vs. v1");
  const capRate = revision.getByRole("table", { name: "What changed" }).getByRole("row", { name: /^Cap rate/ });
  await expect(capRate).toContainText("3.0 %");
  await expect(capRate).toContainText("3.4 %");
  await expect(flagButton(page, 1)).toHaveAccessibleName(/Changed by KV/);
  await fitsPhone("The revision banner");

  // 5. Accept checks 2–4: 4 of 4 reviewed, so the video never signs an unchecked AI call.
  for (const [n, label] of ACCEPTS) {
    await flagButton(page, n).click();
    await eye.getByRole("button", { name: label }).click();
    await expect(flagButton(page, n)).toHaveAccessibleName(/Accepted · KV/);
  }
  await expect(verdict).toContainText("4 of 4 reviewed");
  await fitsPhone("The review with every call checked");

  // 6. Approve & send report, then Sign & send.
  await verdict.getByRole("button", { name: "Approve & send report" }).click();
  const sheet = page.getByRole("dialog", { name: "Approve & send report" });
  await expect(sheet).toContainText("€1,210,000");
  await expect(sheet).toContainText("v2 · revised after your note");
  await expect(sheet).toContainText("4 of 4 reviewed");
  const calls = sheet.getByRole("list", { name: "AI judgement calls" }).getByRole("listitem");
  await expect(calls).toHaveCount(4);
  await expect(calls.nth(0)).toContainText("Changed by valuer · KV");
  await expect(calls.nth(0)).toContainText(REHEARSED);
  for (const i of [1, 2, 3]) await expect(calls.nth(i)).toContainText("Accepted · KV");
  await expect(sheet.getByRole("button", { name: "Accept remaining" })).toHaveCount(0);
  await fitsPhone("The approval sheet");
  if (take.phone) {
    expect((await sheet.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(390);
    expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  }
  const sign = sheet.getByRole("button", { name: "Sign & send" });
  await expect(sign).not.toHaveAttribute("aria-disabled", "true");
  await sign.click();
  await expect(sheet.getByText("Report sent to Demo Capital GmbH")).toBeVisible();
  await fitsPhone("The signed approval sheet");

  // The client receives the report, opens it and downloads the PDF.
  await sheet.getByRole("link", { name: "View as the client" }).click();
  await expect(page).toHaveURL(/\/client$/);
  const request = page.getByRole("listitem").filter({ hasText: DEAL_ID });
  await expect(request.getByText("Delivered", { exact: true })).toBeVisible();
  await expect(request.getByText("€1,210,000")).toBeVisible();
  await request.getByRole("link", { name: "Open report" }).click();
  await expect(page).toHaveURL(new RegExp(`/client/deals/${DEAL_ID}/report$`));
  await expectSamplePill(page);

  const email = page.getByRole("article", { name: "Your valuation report is ready — Musterstraße 12" });
  await expect(email).toContainText("€1,210,000");
  const report = page.getByRole("article", { name: "Valuation report", exact: true });
  await expect(report).toContainText("€1,210,000");
  await expect(report).toContainText(DISCLAIMER);

  const downloading = page.waitForEvent("download");
  await email.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`Censio_Report_${DEAL_ID}_v2.pdf`);
  const text = await pdfText(download);
  expect(text).toContain("€1,210,000");
  expect(text).toContain(DISCLAIMER);

  if (take.recording) await expect(bar).toHaveCount(0);
  expect(problems).toEqual([]);
}

/** Console errors and uncaught exceptions; the map tiles, aborted on purpose, do not count. */
function consoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  return problems;
}

async function savedState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.state, STORE_KEY);
}

/** Every screen carries the "Sample data" pill in its app bar. */
async function expectSamplePill(page: Page): Promise<void> {
  await expect(page.getByRole("banner").getByText("Sample data", { exact: true })).toBeVisible();
}

function stepHeading(page: Page, name: string) {
  return page.getByRole("heading", { name, level: 2, exact: true });
}

async function next(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

/** The header button of check `n` (1-based) in Needs your eye. */
function flagButton(page: Page, n: number) {
  return page.getByRole("region", { name: "Needs your eye" }).getByRole("button", { name: new RegExp(`^${n} · `) });
}

/** The text of a downloaded PDF, with whitespace collapsed. */
async function pdfText(download: Download): Promise<string> {
  const { text } = await extractText(new Uint8Array(await readFile(await download.path())), { mergePages: true });
  return text.replace(/\s+/g, " ");
}
