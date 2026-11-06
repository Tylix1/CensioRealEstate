import { expect, test, type Page } from "@playwright/test";
import { blockMapTiles, skipOrientation } from "./helpers";

// P1 · How Censio works (plan Task 19, spec §5.2 P1): the class explainer, and the links to it from the demo bar and
// from the sign-in page's footer.
// Next.js keeps pages visited earlier in the DOM, hidden: queries go through roles or are scoped to a landmark.

/** The pipeline of spec §5.2 P1, in order. */
const PIPELINE = [
  "Documents",
  "AI extraction",
  "Lookups & rent estimate",
  "Valuation engine",
  "Senior valuer",
  "Report",
];

/** The roadmap of spec §5.2 P1. */
const ROADMAP = ["Comparison approach", "Cost approach", "Commercial", "Hotel", "Condominiums"];

test.beforeEach(async ({ page }) => {
  await skipOrientation(page);
  await blockMapTiles(page);
});

function demoBar(page: Page) {
  return page.getByRole("region", { name: "Demo controls" });
}

/** Console errors that point at a hydration mismatch. */
function watchHydration(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|did not match|server rendered/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/hydrat/i.test(error.message)) errors.push(error.message);
  });
  return errors;
}

test("the explainer shows the pipeline, who does what, the learning loop and the roadmap", async ({ page }) => {
  const hydrationErrors = watchHydration(page);
  await page.goto("/how-it-works");

  await expect(page.getByRole("heading", { level: 1, name: "How Censio works" })).toBeVisible();
  await expect(page.getByRole("banner").getByText("Sample data", { exact: true })).toBeVisible();

  // The six pipeline steps, in order, each a box of an ordered list.
  const pipeline = page.getByRole("list", { name: "The pipeline" });
  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByRole("listitem")).toHaveCount(PIPELINE.length);
  await expect(pipeline.getByRole("heading", { level: 3 })).toHaveText(PIPELINE);
  for (const label of PIPELINE) {
    await expect(pipeline.getByRole("heading", { level: 3, name: label, exact: true })).toBeVisible();
  }
  // The sample deal runs through the boxes with the engine's own figures.
  await expect(pipeline.getByRole("listitem").nth(3)).toContainText("€1,300,000");

  // What is AI and what is human.
  await expect(page.getByRole("heading", { name: "What the AI does" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What the valuer does" })).toBeVisible();

  // The learning loop (case-insensitive, as in the plan).
  const loop = page.getByRole("region", { name: /learning loop/i });
  await expect(loop).toBeVisible();
  await expect(loop.getByRole("heading", { name: /learning loop/i })).toBeVisible();
  await expect(
    loop.getByText("Every valuer correction becomes training data and calibrates district defaults."),
  ).toBeVisible();
  // The worked example: the valuer's cap-rate note of the demo gives the engine's v2.
  await expect(loop).toContainText("€1,210,000");

  // Why it scales: any comparison is labelled as an illustration.
  const scale = page.getByRole("region", { name: "Why it scales" });
  await expect(scale).toBeVisible();
  await expect(scale.getByText(/illustrative/i).first()).toBeVisible();

  // Trust and accountability.
  const trust = page.getByRole("region", { name: "Trust & accountability" });
  await expect(trust).toBeVisible();
  await expect(trust).toContainText("signatory of record");
  await expect(trust).toContainText("1,000 characters");

  // The roadmap.
  const roadmap = page.getByRole("list", { name: "Roadmap" });
  await expect(roadmap.getByRole("heading", { level: 3 })).toHaveText(ROADMAP);

  await expect(page.getByRole("contentinfo").getByText("Sample data — prototype")).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});

test("the demo bar links to the explainer and marks it current there", async ({ page }) => {
  await page.goto("/client");
  await expect(page.getByRole("button", { name: "New valuation" })).toBeVisible();
  const link = demoBar(page).getByRole("link", { name: "How it works" });
  await expect(link).not.toHaveAttribute("aria-current", "page");
  await link.click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1, name: "How Censio works" })).toBeVisible();
  await expect(demoBar(page).getByRole("link", { name: "How it works" })).toHaveAttribute("aria-current", "page");

  // From the explainer back into the demo.
  await page.getByRole("main").getByRole("link", { name: "Try it as the senior valuer" }).click();
  await expect(page).toHaveURL(/\/valuer$/);
  await expect(demoBar(page).getByRole("button", { name: "Senior Valuer" })).toHaveAttribute("aria-pressed", "true");
});

test("the sign-in page's footer links to the explainer", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();
  await footer.getByRole("link", { name: "How Censio works" }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1, name: "How Censio works" })).toBeVisible();
});

test("the explainer fits a 390 px screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/how-it-works");
  await expect(page.getByRole("list", { name: "The pipeline" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // Touch targets: every link and button in the page body is at least 44 px tall.
  const small = await page.getByRole("main").evaluate((main) =>
    [...main.querySelectorAll("a, button")]
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => el.textContent?.trim()),
  );
  expect(small).toEqual([]);
});
