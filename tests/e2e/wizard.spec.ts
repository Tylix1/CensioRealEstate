import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { blockMapTiles, skipOrientation } from "./helpers";

// The client wizard (C3.1–C3.4) and AI at work (C4), in Demo mode: e2e runs without an API key, so the sample PDFs
// come back from /api/extract as the committed demo fixtures and any other PDF needs Live AI.
//
// Next.js keeps pages visited earlier mounted but hidden (React Activity): queries use roles or are scoped to the
// visible step.

test.beforeEach(async ({ page }) => {
  await skipOrientation(page);
  await blockMapTiles(page);
});

/** The persisted demo store (src/lib/store/demoStore.ts). */
const STORE_KEY = "censio-demo-v1";

async function savedState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null").state, STORE_KEY);
}

async function startNewValuation(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as Demo Capital GmbH" }).click();
  await expect(page).toHaveURL(/\/client$/);
  await page.getByRole("button", { name: "New valuation" }).click();
  await expect(page).toHaveURL(/\/client\/new$/);
  await expect(page.getByRole("heading", { name: "Property", level: 2 })).toBeVisible();
}

function stepHeading(page: Page, name: string) {
  return page.getByRole("heading", { name, level: 2, exact: true });
}

function documentRows(page: Page) {
  return page.getByRole("list", { name: "Uploaded documents" }).getByRole("listitem");
}

async function next(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

/** Step C3.2 with the five sample PDFs (and three photos) read. */
async function addSampleDocuments(page: Page): Promise<void> {
  await expect(stepHeading(page, "Documents")).toBeVisible();
  await page.getByRole("button", { name: "Use sample documents" }).click();
  const rows = documentRows(page);
  await expect(rows).toHaveCount(5);
  for (const row of await rows.all()) {
    await expect(row.getByText(/^(Demo mode|Cached result)$/)).toBeVisible();
  }
}

/** A one-page PDF that is none of the sample documents. */
async function unknownPdf(text = "Kaufvertrag (purchase agreement) — not a sample document"): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([595, 842]).drawText(text, { x: 56, y: 760, size: 12, font });
  return Buffer.from(await pdf.save());
}

test("the sample documents are read, the AI creates 8 units and the request goes to the senior valuer", async ({
  page,
}) => {
  await startNewValuation(page);
  await expect(page.getByLabel("Street and number")).toHaveValue("Musterstraße 12");
  await next(page);

  await addSampleDocuments(page);
  await expect(page.getByText("plot 480 m²")).toBeVisible();
  const photos = page.getByRole("list", { name: "Photos" }).getByRole("listitem");
  await expect(photos).toHaveCount(3);
  await next(page);

  await expect(stepHeading(page, "Units")).toBeVisible();
  await expect(page.getByText("The AI created 8 units from your tenant list.")).toBeVisible();
  await next(page);

  await expect(stepHeading(page, "Review & submit")).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();

  await expect(page).toHaveURL(/\/client\/deals\/CEN-2026-0147\/processing$/);
  await expect(page.getByRole("heading", { name: "AI at work", level: 1 })).toBeVisible();
  const log = page.getByRole("list", { name: "Run log" });
  // The extraction rows come first, with the source of each reading.
  await expect(log.getByRole("listitem").first()).toContainText("Read tenant list");
  await expect(log.getByRole("listitem").first()).toContainText("Demo mode");
  await expect(page.getByText("With senior valuer for review")).toBeVisible({ timeout: 15_000 });
  await expect(log.getByRole("listitem")).toHaveCount(11);
  await expect(log.getByRole("listitem").nth(5)).toContainText("Look up land value");
  // The client sees that the value was computed; the figure itself waits for the senior valuer's sign-off.
  await expect(log.getByRole("listitem").nth(9)).toContainText("6 of 6 cross-checks passed");
  await expect(log).not.toContainText("€1,300,000");

  const state = await savedState(page);
  expect(state.draft).toBeNull();
  const deals = state.deals as Record<string, { deal: { status: string; documents: unknown[]; photos: unknown[] } }>;
  expect(deals["CEN-2026-0147"].deal.status).toBe("in_review");
  expect(deals["CEN-2026-0147"].deal.documents).toHaveLength(5);
  expect(deals["CEN-2026-0147"].deal.photos).toHaveLength(3);

  // The link opens the deal as the senior valuer.
  await page.getByRole("link", { name: "Open as Senior Valuer" }).click();
  await expect(page).toHaveURL(/\/valuer\/deals\/CEN-2026-0147$/);
  const bar = page.getByRole("region", { name: "Demo controls" });
  await expect(bar.getByRole("button", { name: "Senior Valuer" })).toHaveAttribute("aria-pressed", "true");
  expect((await savedState(page)).role).toBe("valuer");

  // On the dashboard the request waits for the senior valuer.
  await bar.getByRole("button", { name: "Client" }).click();
  await expect(page).toHaveURL(/\/client$/);
  const request = page.getByRole("listitem").filter({ hasText: "CEN-2026-0147" });
  await expect(request.getByText("With senior valuer")).toBeVisible();
  await expect(page.getByText("Unfinished request")).toHaveCount(0);
});

test("a PDF that is not a sample needs Live AI; the wizard continues and lists the missing documents", async ({
  page,
}) => {
  await startNewValuation(page);
  await next(page);
  await expect(stepHeading(page, "Documents")).toBeVisible();

  await page.getByLabel("Choose files").setInputFiles({
    name: "Kaufvertrag.pdf",
    mimeType: "application/pdf",
    buffer: await unknownPdf(),
  });
  const row = documentRows(page).filter({ hasText: "Kaufvertrag.pdf" });
  await expect(row.getByText("Live AI is needed to read this document.")).toBeVisible();
  for (const type of [
    "Tenant list (Mieterliste)",
    "Land register (Grundbuch)",
    "Energy certificate (Energieausweis)",
    "Refurbishment sheet (Sanierungsübersicht)",
    "Zoning plan (B-Plan)",
  ]) {
    await expect(page.getByText(`Missing: ${type}`)).toBeVisible();
  }

  // Missing documents do not block the request: the units are then added by hand.
  await next(page);
  await expect(stepHeading(page, "Units")).toBeVisible();
  await expect(page.getByText(/No tenant list was read/)).toBeVisible();
  // Without a unit there is nothing to value, so Next asks for one.
  await next(page);
  await expect(page.getByText("Add at least one unit to continue.")).toBeVisible();
  await expect(stepHeading(page, "Units")).toBeVisible();
});

test("the draft survives a reload and going back and forth; unit edits and a vacant unit added by hand", async ({
  page,
}) => {
  await startNewValuation(page);
  await next(page);
  await addSampleDocuments(page);

  // Reload in the middle of the wizard: the step, the documents and their readings are kept.
  await page.reload();
  await expect(stepHeading(page, "Documents")).toBeVisible();
  await expect(documentRows(page)).toHaveCount(5);
  await expect(page.getByText("plot 480 m²")).toBeVisible();
  await next(page);

  await expect(page.getByText("The AI created 8 units from your tenant list.")).toBeVisible();
  const area = page.getByLabel("Unit 1, GF left: area m²");
  await expect(area).toHaveValue("62");
  await area.fill("70");
  await area.press("Tab");
  const unit1 = page.getByRole("row").filter({ has: area });
  await expect(unit1.getByText("Changed by client")).toBeVisible();
  // The monthly rent stays as in the tenant list.
  await expect(page.getByLabel("Unit 1, GF left: rent € per month")).toHaveValue("520.80");

  // Add a vacant unit by hand: it starts vacant and needs its area and rooms.
  await page.getByRole("button", { name: "Add unit manually" }).click();
  const manualArea = page.getByLabel("Unit m1: area m²");
  await expect(manualArea).toBeVisible();
  await expect(page.getByLabel("Unit m1: vacant")).toBeChecked();
  await next(page);
  await expect(page.getByText("Enter the area of Unit m1.")).toBeVisible();
  await page.getByLabel("Unit m1: floor").selectOption("2F");
  await manualArea.fill("55");
  await page.getByLabel("Unit m1: rooms").fill("2");
  await page.getByLabel("Unit m1: balcony").check();

  // Reload again, then back to the documents and forward: the edits are kept.
  await page.reload();
  await expect(stepHeading(page, "Units")).toBeVisible();
  await expect(page.getByLabel("Unit 1, GF left: area m²")).toHaveValue("70");
  await expect(page.getByLabel("Unit m1: area m²")).toHaveValue("55");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(stepHeading(page, "Documents")).toBeVisible();
  await expect(documentRows(page)).toHaveCount(5);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(stepHeading(page, "Property")).toBeVisible();
  await next(page);
  await next(page);
  await expect(page.getByLabel("Unit 1, GF left: area m²")).toHaveValue("70");
  await expect(
    page.getByRole("row").filter({ has: page.getByLabel("Unit 1, GF left: area m²") }).getByText("Changed by client"),
  ).toBeVisible();
  await next(page);

  await expect(stepHeading(page, "Review & submit")).toBeVisible();
  await expect(page.getByText("9 units · 628 m²")).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("With senior valuer for review")).toBeVisible({ timeout: 15_000 });
  // The vacant unit added by hand raises its own two judgement calls on top of the sample's four.
  await expect(page.getByRole("list", { name: "Run log" })).toContainText("6 judgement calls flagged");

  const state = await savedState(page);
  const deal = (state.deals as Record<string, { deal: { units: Record<string, unknown>[] } }>)["CEN-2026-0147"].deal;
  expect(deal.units).toHaveLength(9);
  expect(deal.units[0]).toMatchObject({ id: "u1", areaM2: 70, clientEdited: ["areaM2"] });
  expect(deal.units[8]).toMatchObject({
    id: "m1",
    origin: "manual",
    floor: "2F",
    areaM2: 55,
    rooms: 2,
    inPlaceRentPerM2: null,
    features: ["balcony"],
  });
});

test("readings cut off by a reload start again from the stored file", async ({ page }) => {
  await startNewValuation(page);
  await next(page);
  await addSampleDocuments(page);

  // As if the page was reloaded while the land register was being read, and while a file was still uploading.
  await page.evaluate((key) => {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "null");
    const draft = saved.state.draft;
    const land = draft.documents.find((d: { fileName: string }) => d.fileName === "Grundbuch_Musterstrasse12.pdf");
    Object.assign(land, { status: "reading", type: "unknown", extractionSource: null });
    delete draft.extractions[land.id];
    draft.documents.push({ ...land, id: "doc-lost", fileName: "Lost.pdf" });
    window.localStorage.setItem(key, JSON.stringify(saved));
  }, STORE_KEY);
  await page.reload();

  const land = documentRows(page).filter({ hasText: "Grundbuch_Musterstrasse12.pdf" });
  await expect(land.getByText("Demo mode")).toBeVisible();
  await expect(land.getByText("plot 480 m²")).toBeVisible();
  const lost = documentRows(page).filter({ hasText: "Lost.pdf" });
  await expect(lost.getByText("The upload was interrupted. Add the file again.")).toBeVisible();
  await lost.getByRole("button", { name: /^Remove/ }).click();
  await expect(documentRows(page)).toHaveCount(5);
  await next(page);
  await expect(page.getByText("The AI created 8 units from your tenant list.")).toBeVisible();
});

test("removing and re-adding the tenant list re-creates its units and keeps the ones added by hand", async ({
  page,
}) => {
  await startNewValuation(page);
  await next(page);
  await addSampleDocuments(page);
  await next(page);
  await page.getByLabel("Unit 1, GF left: area m²").fill("70");
  await page.getByRole("button", { name: "Add unit manually" }).click();
  await page.getByLabel("Unit m1: area m²").fill("40");
  await page.getByLabel("Unit m1: rooms").fill("1");

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await documentRows(page)
    .filter({ hasText: "Mieterliste_Musterstrasse12.pdf" })
    .getByRole("button", { name: /^Remove/ })
    .click();
  await expect(page.getByText("Missing: Tenant list (Mieterliste)")).toBeVisible();
  await next(page);
  await expect(page.getByText(/No tenant list was read/)).toBeVisible();
  await expect(page.getByText("The tenant list changed, so the AI created its units again.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Unit m1: area m²")).toHaveValue("40");
  await expect(page.getByLabel("Unit 1, GF left: area m²")).toHaveCount(0);

  // "Use sample documents" adds back only what is missing.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Use sample documents" }).click();
  await expect(documentRows(page)).toHaveCount(5);
  await expect(page.getByRole("list", { name: "Photos" }).getByRole("listitem")).toHaveCount(3);
  await next(page);
  await expect(page.getByText("The AI created 8 units from your tenant list.")).toBeVisible();
  await expect(page.getByLabel("Unit 1, GF left: area m²")).toHaveValue("62");
  await expect(page.getByLabel("Unit m1: area m²")).toHaveValue("40");
  await expect(page.getByRole("img", { name: "Unit 8, Attic: foto_dachterrasse.jpg" })).toBeVisible();
});

test("C3.1 notes that only the Living whole-building sample is computed", async ({ page }) => {
  await startNewValuation(page);
  const note = "Prototype computes the Living whole-building sample only — continue with sample";
  await expect(page.getByText(note)).toHaveCount(0);
  await page.getByRole("radio", { name: "Hotel" }).check();
  await expect(page.getByText(note)).toBeVisible();
  await page.getByRole("radio", { name: "Living" }).check();
  await expect(page.getByText(note)).toHaveCount(0);
  await page.getByRole("radio", { name: "Single unit" }).check();
  await expect(page.getByText(note)).toBeVisible();
  await page.getByRole("button", { name: "Continue with sample" }).click();
  await expect(stepHeading(page, "Documents")).toBeVisible();
  const draft = (await savedState(page)).draft as { skeleton: { usageType: string; scope: string } };
  expect(draft.skeleton).toMatchObject({ usageType: "living", scope: "building" });
});

test("files the wizard cannot take: too large, not a PDF, more than 8 documents", async ({ page }) => {
  await startNewValuation(page);
  await next(page);
  await expect(stepHeading(page, "Documents")).toBeVisible();
  const input = page.getByLabel("Choose files");

  // Over 5 MB: refused in the browser, before any upload.
  const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024)]);
  await input.setInputFiles({ name: "Gutachten_gross.pdf", mimeType: "application/pdf", buffer: big });
  await expect(
    documentRows(page).filter({ hasText: "Gutachten_gross.pdf" }).getByText("This PDF is larger than 5 MB."),
  ).toBeVisible();

  // Neither a PDF nor a photo.
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("status").filter({ hasText: "notes.txt" })).toContainText(
    "only PDF documents and photos",
  );
  await expect(documentRows(page)).toHaveCount(1);

  // Eight documents at most: of nine more PDFs, seven fit.
  const pdfs = await Promise.all(
    Array.from({ length: 9 }, async (_, i) => ({
      name: `Anlage_${i + 1}.pdf`,
      mimeType: "application/pdf",
      buffer: await unknownPdf(`Anlage ${i + 1}`),
    })),
  );
  await input.setInputFiles(pdfs);
  await expect(documentRows(page)).toHaveCount(8);
  await expect(page.getByRole("status").filter({ hasText: "Anlage_9.pdf" })).toContainText("up to 8 documents");
  await expect(documentRows(page).getByText("Live AI is needed to read this document.")).toHaveCount(7);

  // A document can be removed again.
  await documentRows(page)
    .filter({ hasText: "Gutachten_gross.pdf" })
    .getByRole("button", { name: /^Remove/ })
    .click();
  await expect(documentRows(page)).toHaveCount(7);
});

test("View opens the document with the first finding highlighted", async ({ page }) => {
  await startNewValuation(page);
  await next(page);
  await addSampleDocuments(page);
  await documentRows(page)
    .filter({ hasText: "Grundbuch_Musterstrasse12.pdf" })
    .getByRole("button", { name: /^View/ })
    .click();
  const dialog = page.getByRole("dialog", { name: /Grundbuch_Musterstrasse12\.pdf/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("mark.censio-hl", { hasText: "480" }).first()).toBeVisible();
  // Another passage the AI read: the easement on page 4.
  await dialog.getByRole("button", { name: /Easement/ }).click();
  await expect(dialog.getByText("Page 4 of 4")).toBeVisible();
  await expect(dialog.locator("mark.censio-hl", { hasText: "Leitungsrecht" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the wizard and AI at work fit a 390 px screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fits = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await startNewValuation(page);
  await fits();
  await next(page);
  await addSampleDocuments(page);
  await fits();
  await next(page);
  await expect(page.getByText("The AI created 8 units from your tenant list.")).toBeVisible();
  await fits();
  await next(page);
  await expect(stepHeading(page, "Review & submit")).toBeVisible();
  await fits();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("With senior valuer for review")).toBeVisible({ timeout: 15_000 });
  await fits();
});
