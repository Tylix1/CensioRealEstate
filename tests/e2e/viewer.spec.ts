import { expect, test } from "@playwright/test";
import { blockMapTiles, skipOrientation } from "./helpers";

// The sandbox cannot reach the OSM tile servers, so tiles are aborted and the tests assert on vector layers only.
test.beforeEach(async ({ page }) => {
  await skipOrientation(page);
  await blockMapTiles(page);
});

test("the PDF viewer highlights the quoted text on the cited page", async ({ page }) => {
  await page.goto("/dev/viewer?dev=1");

  const viewer = page.getByTestId("pdf-viewer");
  await expect(viewer.locator("canvas").first()).toBeVisible();
  const mark = viewer.locator("mark.censio-hl", { hasText: "480" });
  await expect(mark.first()).toBeVisible();
  await expect(viewer.getByText("Page 1 of 4")).toBeVisible();
});

test("the PDF viewer reads a Blob and follows a new page and passage", async ({ page }) => {
  await page.goto("/dev/viewer?dev=1");

  const viewer = page.getByTestId("pdf-viewer");
  await expect(viewer.locator("mark.censio-hl", { hasText: "480" }).first()).toBeVisible();
  await page.getByLabel("Load as Blob").check();
  await expect(page.getByText(/^Source: Blob \(/)).toBeVisible();
  await page.getByLabel("Page", { exact: true }).fill("4");
  await page.getByLabel("Highlight").fill("Leitungsrecht");

  await expect(viewer.getByText("Page 4 of 4")).toBeVisible();
  await expect(viewer.locator("mark.censio-hl", { hasText: "Leitungsrecht" }).first()).toBeVisible();
  await expect(viewer.locator("mark.censio-hl", { hasText: "480" })).toHaveCount(0);

  await viewer.getByRole("button", { name: "Previous page" }).click();
  await expect(viewer.getByText("Page 3 of 4")).toBeVisible();
  await viewer.getByRole("button", { name: "Go to page 4" }).click();
  await expect(viewer.locator("mark.censio-hl", { hasText: "Leitungsrecht" }).first()).toBeVisible();
});

test("the comparables map draws 38 listings, solid when recent and hollow when older", async ({ page }) => {
  await page.goto("/dev/viewer?dev=1");

  await expect(page.locator("path.leaflet-interactive")).toHaveCount(38);
  const comps = page.getByTestId("comparables-map");
  await expect(comps.locator('path.leaflet-interactive[fill="#344054"]')).toHaveCount(23);
  await expect(comps.locator('path.leaflet-interactive[fill="#FFFFFF"]')).toHaveCount(15);
  await expect(comps.getByText("© OpenStreetMap contributors")).toBeAttached();
});

test("the deal map draws the plot outline and the BORIS zone", async ({ page }) => {
  await page.goto("/dev/viewer?dev=1");

  const dealMap = page.getByTestId("deal-map").first();
  await expect(dealMap.locator("path")).not.toHaveCount(0);
  await expect(dealMap.getByText("zone 0412 · 520 €/m²")).toBeVisible();
});

test("the harness is hidden in production builds without ?dev=1", async ({ page }) => {
  await page.goto("/dev/viewer");

  await expect(page.getByText("This harness is only available in development or with ?dev=1.")).toBeVisible();
  await expect(page.getByTestId("pdf-viewer")).toHaveCount(0);
});
