import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { extractText } from "unpdf";
import { buildRevalueContext } from "@/lib/revalue/schema";
import { parseNote } from "@/lib/revalue/parser";
import { addRevision, applyChanges, currentVersion } from "@/lib/revisions/history";
import { DEMO_STORE_KEY, currentPipeline, useDemoStore } from "@/lib/store/demoStore";
import { blockMapTiles, skipOrientation } from "./helpers";

// C5 · Report delivered (plan Task 18, spec §5.2 and §5.6), and the valuer's draft preview of the same page.
// The approval is not driven through the valuer's screens here: the state is built with the demo store's own actions in
// this test process (the rehearsed note as v2, check 1 opened, Sign & send) and saved to the browser's storage.

const DEAL_ID = "CEN-2026-0147";
const REPORT_URL = `/client/deals/${DEAL_ID}/report`;
const DISCLAIMER = "Prototype with sample data — not a valuation report.";

/** The rehearsed note for check 1 (spec §5.3.6 and §6.2). */
const REHEARSED =
  "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";

/** The saved demo state after the demo path: v2 from the rehearsed note, signed by the valuer. */
async function approvedV2State(): Promise<string> {
  const store = useDemoStore.getState();
  await store.reset();
  const stored = useDemoStore.getState().deals[DEAL_ID];
  const out = currentPipeline(stored);
  const result = parseNote(REHEARSED, buildRevalueContext(out, "cap_rate"));
  if (result.intent !== "change_parameters") throw new Error("The rehearsed note changed nothing");
  store.markOpened(DEAL_ID, "cap_rate");
  store.setHistory(
    DEAL_ID,
    addRevision(stored.history, {
      params: applyChanges(currentVersion(stored.history).params, result.changes, out.rent.average),
      note: REHEARSED,
      flagId: "cap_rate",
      changes: result.changes,
      explanation: result.explanation,
      aiMode: result.mode,
      createdAt: new Date().toISOString(),
      durationMs: result.durationMs,
    }),
  );
  store.approve(DEAL_ID, false);
  const { deals } = useDemoStore.getState();
  expect(deals[DEAL_ID].deal.status).toBe("approved");
  return JSON.stringify({
    state: { role: "client", accessCode: null, orientationSeen: true, deals, draft: null, submittedCount: 0 },
    version: 1,
  });
}

/** Saves `saved` as the demo state before the app loads, once: later loads keep what the app saved since. */
async function seedState(page: Page, saved: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      const current = window.localStorage.getItem(key);
      if (current === null || !JSON.parse(current)?.state?.deals) window.localStorage.setItem(key, value);
    },
    [DEMO_STORE_KEY, saved] as const,
  );
}

/** The text of a downloaded PDF, with whitespace collapsed. */
async function pdfText(download: Download): Promise<string> {
  const path = await download.path();
  const { text } = await extractText(new Uint8Array(await readFile(path)), { mergePages: true });
  return text.replace(/\s+/g, " ");
}

test.beforeEach(async ({ page }) => {
  await skipOrientation(page);
  await blockMapTiles(page);
});

test("after approval the client opens the delivered report and downloads the PDF", async ({ page }) => {
  await seedState(page, await approvedV2State());
  await page.goto("/client");

  const row = page.getByRole("listitem").filter({ hasText: DEAL_ID });
  await expect(row.getByText("Delivered", { exact: true })).toBeVisible();
  await expect(row.getByText("€1,210,000")).toBeVisible();
  await row.getByRole("link", { name: "Open report" }).click();
  await expect(page).toHaveURL(new RegExp(`${REPORT_URL}$`));

  const email = page.getByRole("article", { name: "Your valuation report is ready — Musterstraße 12" });
  await expect(email).toBeVisible();
  await expect(email).toContainText("reports@censio.example");
  await expect(email).toContainText("€1,210,000");
  await expect(email).toContainText("Censio_Report_CEN-2026-0147_v2.pdf");

  const report = page.getByRole("article", { name: "Valuation report", exact: true });
  await expect(report).toContainText("€1,210,000");
  await expect(report).toContainText("v2 · KV · note:");
  await expect(report).toContainText("Changed by valuer");
  await expect(report).toContainText(DISCLAIMER);
  await expect(page.getByText("Draft — not signed")).toHaveCount(0);

  const downloading = page.waitForEvent("download");
  await email.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("Censio_Report_CEN-2026-0147_v2.pdf");
  const text = await pdfText(download);
  expect(text).toContain("€1,210,000");
  expect(text).toContain(DISCLAIMER);
  expect(text).toContain("Musterstraße 12, 04109 Leipzig");
  expect(text).toContain("v2 · KV · note:");
  expect(text).not.toContain("DRAFT");
});

test("the valuer's preview shows the unsigned draft, and its PDF carries a draft watermark", async ({ page }) => {
  await page.goto(`/valuer/deals/${DEAL_ID}/report`);

  // The preview stays in the valuer's role: previewing does not switch the demo to the client.
  await expect(page.getByRole("banner").getByRole("link", { name: /^Review queue/ })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Demo controls" }).getByRole("button", { name: "Senior Valuer" }),
  ).toHaveAttribute("aria-pressed", "true");
  const banner = page.getByRole("region", { name: "Draft — not signed" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: "Back to the review" })).toHaveAttribute(
    "href",
    `/valuer/deals/${DEAL_ID}`,
  );
  await expect(page.getByRole("article", { name: /Your valuation report is ready/ })).toHaveCount(0);
  const report = page.getByRole("article", { name: "Valuation report", exact: true });
  await expect(report).toContainText("€1,300,000");
  await expect(report).toContainText("v1 · AI draft");

  const downloading = page.waitForEvent("download");
  await banner.getByRole("button", { name: "Download draft PDF" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("Censio_Report_CEN-2026-0147_v1_draft.pdf");
  const text = await pdfText(download);
  expect(text).toContain("DRAFT");
  expect(text).toContain("Draft — not signed");
  expect(text).toContain("€1,300,000");
  expect(text).toContain(DISCLAIMER);
});

test("after sign-off the valuer's preview shows the report as sent, without the client's inbox", async ({ page }) => {
  await seedState(page, await approvedV2State());
  await page.goto(`/valuer/deals/${DEAL_ID}/report`);

  const banner = page.getByRole("region", { name: "Report sent to Demo Capital GmbH" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: "Back to the review" })).toHaveAttribute(
    "href",
    `/valuer/deals/${DEAL_ID}`,
  );
  await expect(page.getByRole("article", { name: /Your valuation report is ready/ })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Valuation report", exact: true })).toContainText("€1,210,000");
  await expect(page.getByText("Draft — not signed")).toHaveCount(0);
});

test("a request still with the valuer has no report yet", async ({ page }) => {
  await page.goto(REPORT_URL);
  await expect(page.getByRole("heading", { name: "Your report is not ready yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View progress" })).toHaveAttribute(
    "href",
    `/client/deals/${DEAL_ID}/processing`,
  );
  await expect(page.getByRole("button", { name: /Download/ })).toHaveCount(0);
});
