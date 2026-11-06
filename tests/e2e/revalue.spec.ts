import { expect, test, type Page } from "@playwright/test";
import { blockMapTiles, skipOrientation } from "./helpers";

// V3 revisions and V4 approval (plan Task 17, spec §5.2 V3/V4 and §6.2), in Demo mode: without an access code the
// rule-based parser reads the notes. Next.js keeps pages visited earlier in the DOM, hidden: queries go through roles
// or are scoped to a landmark.

const STORE_KEY = "censio-demo-v1";
const DEAL_ID = "CEN-2026-0147";

/** The rehearsed note for check 1 (spec §6.2): cap rate 3.4 %, exactly v2. */
const REHEARSED =
  "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";

type SavedVersion = {
  n: number;
  undone: boolean;
  note: string | null;
  flagId: string | null;
  aiMode: string | null;
  durationMs: number | null;
  params: { capRate: number; underRentYears: number };
};

type SavedDeal = {
  deal: { status: string };
  history: { versions: SavedVersion[] };
  openedFlags: string[];
  approval: { version: number; signer: string; acceptedAtSignOff: string[] } | null;
};

test.beforeEach(async ({ page }) => {
  await skipOrientation(page);
  await blockMapTiles(page);
});

async function savedDeal(page: Page): Promise<SavedDeal> {
  return page.evaluate(
    ([key, id]) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.state?.deals?.[id],
    [STORE_KEY, DEAL_ID] as const,
  );
}

/** The header button of flag `n` (1-based) in Needs your eye. */
function flagButton(page: Page, n: number) {
  return page.getByRole("region", { name: "Needs your eye" }).getByRole("button", { name: new RegExp(`^${n} · `) });
}

async function openSeededDeal(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as Senior Valuer" }).click();
  await expect(page).toHaveURL(/\/valuer$/);
  await page.getByRole("list", { name: "Deals in your queue" }).getByRole("link", { name: new RegExp(DEAL_ID) }).click();
  await expect(page).toHaveURL(new RegExp(`/valuer/deals/${DEAL_ID}$`));
  await expect(page.getByRole("region", { name: "Verdict" })).toBeVisible();
}

test("a note on check 1 revises the valuation, undo restores it, and the valuer signs", async ({ page }) => {
  await openSeededDeal(page);
  const eye = page.getByRole("region", { name: "Needs your eye" });
  const verdict = page.getByRole("region", { name: "Verdict" });
  const path = page.getByRole("region", { name: "How the value is built" });
  const revision = page.getByRole("region", { name: "Revision" });
  const note = eye.getByRole("textbox", { name: "Note to the AI (Revalue)" });
  const send = eye.getByRole("button", { name: "Send note & revalue" });

  // Demo mode: three example notes to click; the rehearsed one fills the note box.
  await flagButton(page, 1).click();
  const examples = eye.getByRole("list", { name: "Example notes" });
  await expect(examples.getByRole("button")).toHaveCount(3);
  await expect(examples.getByRole("button", { name: "attic rent 9.50", exact: true })).toBeVisible();
  await expect(examples.getByRole("button", { name: "Under-rent will close in 8 years", exact: true })).toBeVisible();
  await examples.getByRole("button", { name: REHEARSED, exact: true }).click();
  await expect(note).toHaveValue(REHEARSED);
  await send.click();

  // The AI moment: "AI is revising…", with the figures that depend on the cap rate outlined.
  await expect(revision.getByRole("heading", { name: "AI is revising…" })).toBeVisible();
  await expect(revision).toContainText("Present-value factor");
  await expect(verdict.getByText("€1,300,000", { exact: true })).toHaveCSS("outline-style", "dashed");
  await expect(path.getByRole("button", { name: /^Cap rate · remaining life/ })).toHaveCSS("outline-style", "dashed");
  await expect(eye.getByRole("button", { name: "AI is revising…" })).toBeVisible();

  // Then revision 2: the banner with the note, the changes against v1 and the AI's note.
  const title = revision.getByRole("heading", { name: /^Revision 2/ });
  await expect(title).toHaveText("Revision 2 · revised in demo mode");
  await expect(verdict.getByText("€1,210,000", { exact: true })).toBeVisible();
  await expect(verdict.getByText("Proposed market value · v2 · revised after your note")).toBeVisible();
  await expect(verdict.getByText("€1,210,000", { exact: true })).toHaveCSS("outline-style", "none");
  await expect(verdict).toContainText("−6.9 % vs. v1");
  await expect(revision.getByText(`“${REHEARSED}”`)).toBeVisible();
  const table = revision.getByRole("table", { name: "What changed" });
  await expect(table.getByRole("columnheader", { name: "v1" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "v2" })).toBeVisible();
  const capRow = table.getByRole("row", { name: /^Cap rate/ });
  await expect(capRow).toContainText("3.0 %");
  await expect(capRow).toContainText("3.4 %");
  await expect(capRow).toContainText("changed by KV");
  await expect(table.getByRole("row", { name: /^Under-rent deduction/ })).toContainText("−€21,087");
  await expect(table.getByRole("row", { name: /^Market value/ })).toContainText("€1,300,000");
  await expect(table.getByRole("row", { name: /^Market value/ })).toContainText("€1,210,000 (−6.9 %)");
  await expect(revision).toContainText("from 3.0 % to 3.4 %");
  await expect(flagButton(page, 1)).toHaveAccessibleName(/^1 · Cap rate 3\.4 % \(was 3\.0 %\) Changed by KV · 3\.4 %/);
  await expect(note).toHaveValue("");

  let saved = await savedDeal(page);
  expect(saved.history.versions.map((v) => [v.n, v.undone])).toEqual([
    [1, false],
    [2, false],
  ]);
  expect(saved.history.versions[1]).toMatchObject({ note: REHEARSED, flagId: "cap_rate", aiMode: "demo" });
  expect(saved.history.versions[1].params.capRate).toBeCloseTo(0.034, 10);

  // The revision survives a reload.
  await page.reload();
  await expect(page.getByRole("region", { name: "Revision" }).getByRole("heading", { name: /^Revision 2/ })).toBeVisible();
  await expect(verdict.getByText("€1,210,000", { exact: true })).toBeVisible();

  // Undo: back to the AI draft; the history keeps v2, marked undone.
  await revision.getByRole("button", { name: "Undo last revision" }).click();
  await expect(verdict.getByText("€1,300,000", { exact: true })).toBeVisible();
  await expect(verdict.getByText("Proposed market value · AI draft v1")).toBeVisible();
  await expect(page.getByRole("region", { name: "Revision" })).toHaveCount(0);
  saved = await savedDeal(page);
  expect(saved.history.versions.map((v) => [v.n, v.undone])).toEqual([
    [1, false],
    [2, true],
  ]);

  // A note the parser cannot map to a change gets a question back, and no version.
  await flagButton(page, 1).click();
  await note.fill("make it nicer");
  await send.click();
  await expect(eye.getByText(/^Which value should I change/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Revision" })).toHaveCount(0);
  expect((await savedDeal(page)).history.versions).toHaveLength(2);

  // Revalue again: version numbers are never reused, so this is revision 3.
  await examples.getByRole("button", { name: REHEARSED, exact: true }).click();
  await send.click();
  await expect(revision.getByRole("heading", { name: /^Revision 3/ })).toHaveText("Revision 3 · revised in demo mode");
  await expect(verdict.getByText("€1,210,000", { exact: true })).toBeVisible();
  await expect(eye.getByText(/^Which value should I change/)).toHaveCount(0);

  // Approve: the sheet shows the value, the version and every call with its status.
  await verdict.getByRole("button", { name: "Approve & send report" }).click();
  const sheet = page.getByRole("dialog", { name: "Approve & send report" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("€1,210,000");
  await expect(sheet).toContainText("v3 · revised after your note");
  const calls = sheet.getByRole("list", { name: "AI judgement calls" }).getByRole("listitem");
  await expect(calls).toHaveCount(4);
  await expect(calls.nth(0)).toContainText("Changed by valuer · KV");
  await expect(calls.nth(0)).toContainText(REHEARSED);
  await expect(calls.nth(1)).toContainText("Not opened");
  await expect(calls.nth(3)).toContainText("Not opened");
  await expect(sheet.getByRole("button", { name: "Sign & send" })).toHaveAttribute("aria-disabled", "true");
  await sheet.getByRole("button", { name: "Accept remaining" }).click();
  await expect(calls.nth(1)).toContainText("Accepted at sign-off without opening");
  await expect(sheet.getByRole("button", { name: "Accept remaining" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Sign & send" }).click();
  await expect(sheet.getByText("Report sent to Demo Capital GmbH")).toBeVisible();

  saved = await savedDeal(page);
  expect(saved.deal.status).toBe("approved");
  expect(saved.approval).toMatchObject({
    version: 3,
    signer: "K. Vogel",
    acceptedAtSignOff: ["market_rent", "under_rent", "easement-1"],
  });

  // Afterwards the review is read-only.
  await sheet.getByRole("button", { name: "Back to the review" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("region", { name: "Deal" }).getByText("Signed · report sent")).toBeVisible();
  await expect(verdict.getByText("Signed market value · v3")).toBeVisible();
  await expect(verdict.getByText("Report sent to Demo Capital GmbH")).toBeVisible();
  await expect(verdict).toContainText("1 of 4 reviewed · 3 accepted at sign-off without opening");
  await expect(verdict.getByRole("button", { name: "Approve & send report" })).toHaveCount(0);
  await expect(verdict.getByRole("button", { name: "Revalue…" })).toHaveCount(0);
  await expect(verdict.getByRole("link", { name: /^Preview/ })).toHaveAttribute(
    "href",
    `/client/deals/${DEAL_ID}/report?preview=1`,
  );
  await expect(revision.getByRole("heading", { name: /^Revision 3/ })).toBeVisible();
  await expect(revision.getByRole("button", { name: "Undo last revision" })).toHaveCount(0);
  await flagButton(page, 2).click();
  await expect(flagButton(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect(flagButton(page, 2)).toHaveAccessibleName(/Accepted at sign-off · KV$/);
  await expect(eye.getByRole("textbox")).toHaveCount(0);
  await expect(eye.getByRole("button", { name: /^Accept/ })).toHaveCount(0);
  await expect(eye.getByRole("button", { name: "Matches" })).toHaveCount(0);
  // Reading a call after signing leaves the signed record as it was.
  expect((await savedDeal(page)).openedFlags).toEqual(["cap_rate"]);

  // The client sees the report as delivered.
  await page.getByRole("region", { name: "Demo controls" }).getByRole("button", { name: "Client" }).click();
  await expect(page).toHaveURL(/\/client$/);
  const row = page.getByRole("listitem").filter({ hasText: DEAL_ID });
  await expect(row.getByText("Delivered", { exact: true })).toBeVisible();
  await expect(row.getByText("€1,210,000")).toBeVisible();
});

test("Revalue… sends a general note: a question gets an answer, a change a new version", async ({ page }) => {
  await openSeededDeal(page);
  const verdict = page.getByRole("region", { name: "Verdict" });
  const revision = page.getByRole("region", { name: "Revision" });

  // The preview link points at the report draft.
  await expect(verdict.getByRole("link", { name: "Preview report draft" })).toHaveAttribute(
    "href",
    `/client/deals/${DEAL_ID}/report?preview=1`,
  );

  await verdict.getByRole("button", { name: "Revalue…" }).click();
  const note = verdict.getByRole("textbox", { name: "General note to the AI (Revalue)" });
  await expect(verdict.getByRole("list", { name: "Example notes" }).getByRole("button")).toHaveCount(3);

  // A question is answered without a new version.
  await note.fill("What is the cap rate?");
  await verdict.getByRole("button", { name: "Send note & revalue" }).click();
  await expect(verdict.getByText(/^Cap rate 3\.0 %:/)).toBeVisible();
  await expect(revision).toHaveCount(0);
  expect((await savedDeal(page)).history.versions).toHaveLength(1);

  // An example note changes the under-rent period: v2 at €1,290,000.
  await verdict.getByRole("list", { name: "Example notes" }).getByRole("button", { name: "Under-rent will close in 8 years" }).click();
  await expect(note).toHaveValue("Under-rent will close in 8 years");
  await verdict.getByRole("button", { name: "Send note & revalue" }).click();
  await expect(revision.getByRole("heading", { name: /^Revision 2/ })).toBeVisible();
  await expect(verdict.getByText("€1,290,000", { exact: true })).toBeVisible();
  const table = revision.getByRole("table", { name: "What changed" });
  await expect(table.getByRole("row", { name: /^Under-rent closing/ })).toContainText("5 years");
  await expect(table.getByRole("row", { name: /^Under-rent closing/ })).toContainText("8 years");
  await expect(verdict.getByText(/^Cap rate 3\.0 %:/)).toHaveCount(0);

  const saved = await savedDeal(page);
  expect(saved.history.versions[1]).toMatchObject({ n: 2, flagId: null, note: "Under-rent will close in 8 years" });
  expect(saved.history.versions[1].params.underRentYears).toBe(8);

  // Check 3 now reads as changed by the valuer.
  await expect(flagButton(page, 3)).toHaveAccessibleName(/Changed by KV · 8 years/);
});

test("the revision banner and the approval sheet fit a 390 px phone and log no errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  await openSeededDeal(page);
  const eye = page.getByRole("region", { name: "Needs your eye" });
  await flagButton(page, 2).click();
  await eye.getByRole("list", { name: "Example notes" }).getByRole("button", { name: "attic rent 9.50" }).click();
  await eye.getByRole("button", { name: "Send note & revalue" }).click();
  const revision = page.getByRole("region", { name: "Revision" });
  await expect(revision.getByRole("heading", { name: /^Revision 2/ })).toBeVisible();
  // The change of one unit's market rent is listed with the unit.
  await expect(revision.getByRole("row", { name: /^Market rent · Attic/ })).toContainText("9.50 €/m²");
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByRole("region", { name: "Verdict" }).getByRole("button", { name: "Approve & send report" }).click();
  const sheet = page.getByRole("dialog", { name: "Approve & send report" });
  await expect(sheet.getByRole("list", { name: "AI judgement calls" }).getByRole("listitem")).toHaveCount(4);
  expect(await overflow()).toBeLessThanOrEqual(0);
  const box = await sheet.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(390);

  // Cancel closes the sheet and signs nothing.
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  expect((await savedDeal(page)).approval).toBeNull();
  expect(problems).toEqual([]);
});
