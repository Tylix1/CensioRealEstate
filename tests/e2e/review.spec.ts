import { expect, test, type Page } from "@playwright/test";
import { blockMapTiles, skipOrientation } from "./helpers";

// V1 review queue and V2 deal review (plan Task 16, spec §5.2 and §5.4), from the seeded state.
// Next.js keeps pages visited earlier in the DOM, hidden: queries go through roles or are scoped to a landmark.

/** The persisted demo store (src/lib/store/demoStore.ts). */
const STORE_KEY = "censio-demo-v1";
const DEAL_ID = "CEN-2026-0147";

/** The 4 canonical judgement calls, in buildFlags order (plan Task 6, spec §5.3.6). */
const FLAG_TITLES = [
  "Cap rate 3.0 %",
  "Market rent 9.60 €/m² (avg. of 8 units)",
  "Under-rent closes within 5 years",
  "Utility easement assumed value-neutral",
];

type SavedDeal = {
  flagStatus: Record<string, string>;
  openedFlags: string[];
  spotCheck: string;
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The header button of flag `n` (1-based) in Needs your eye. */
function flagButton(page: Page, n: number) {
  return page.getByRole("region", { name: "Needs your eye" }).getByRole("button", { name: new RegExp(`^${n} · `) });
}

async function signInAsValuer(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as Senior Valuer" }).click();
  await expect(page).toHaveURL(/\/valuer$/);
}

async function openSeededDeal(page: Page): Promise<void> {
  await signInAsValuer(page);
  await page.getByRole("list", { name: "Deals in your queue" }).getByRole("link", { name: new RegExp(DEAL_ID) }).click();
  await expect(page).toHaveURL(new RegExp(`/valuer/deals/${DEAL_ID}$`));
  await expect(page.getByRole("region", { name: "Verdict" })).toBeVisible();
}

test("the queue lists the deal in review first, then the static sample rows", async ({ page }) => {
  await signInAsValuer(page);
  await expect(page.getByRole("heading", { level: 1, name: "Review queue" })).toBeVisible();

  const rows = page.getByRole("list", { name: "Deals in your queue" }).getByRole("listitem");
  await expect(rows).toHaveCount(6);
  const first = rows.first();
  await expect(first.getByRole("link")).toHaveAttribute("href", `/valuer/deals/${DEAL_ID}`);
  await expect(first).toContainText("Leipzig · Multi-family");
  await expect(first).toContainText("4 checks");
  await expect(first).toContainText("~1:30");

  // The other deals are static sample rows: not clickable, with a tooltip.
  const sample = rows.nth(1);
  await expect(sample).toContainText("CEN-2026-0148");
  await expect(sample).toContainText("Dresden · Hotel");
  await expect(sample).toHaveAttribute("title", "Sample row");
  await expect(sample.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("main").getByText("+ 8 more deals")).toBeVisible();
  await expect(page.getByRole("main").getByText("14 deals · about 31 min of review")).toBeVisible();
});

test("the review screen shows the AI draft, its 4 judgement calls and their evidence", async ({ page }) => {
  await openSeededDeal(page);

  // Deal header: the client's photo, the mini map, facts and status.
  const header = page.getByRole("region", { name: "Deal" });
  await expect(header.getByRole("heading", { level: 1, name: "Musterstraße 12, 04109 Leipzig" })).toBeVisible();
  await expect(header.getByRole("img", { name: /facade/i })).toHaveAttribute("src", /foto_fassade\.jpg/);
  await expect(header.getByTestId("deal-map")).toBeVisible();
  await expect(header).toContainText("8 units · 565 m² living area · plot 480 m² · built 1912, modernised 2014–2019");
  await expect(header.getByText("Awaiting your review")).toBeVisible();

  // Verdict band.
  const verdict = page.getByRole("region", { name: "Verdict" });
  await expect(verdict.getByText("Proposed market value · AI draft v1")).toBeVisible();
  await expect(verdict.getByText("€1,300,000", { exact: true })).toBeVisible();
  await expect(verdict.getByText("2,301 €/m² · 20.0× gross market income")).toBeVisible();
  await expect(verdict.getByText("Where the 31 numbers come from")).toBeVisible();
  await expect(verdict.getByText("Client documents 9")).toBeVisible();
  await expect(verdict.getByText("You sign 4 AI judgement calls · 0 of 4 reviewed")).toBeVisible();

  // How the value is built.
  const path = page.getByRole("region", { name: "How the value is built" });
  await expect(path.getByText("€1,071,923 + €249,600")).toBeVisible();
  await expect(path.getByText("3.0 % · 42 yrs · ×23.70")).toBeVisible();

  // Needs your eye: the 4 calls in buildFlags order, each with its swing bar.
  const eye = page.getByRole("region", { name: "Needs your eye" });
  await expect(eye.getByRole("button", { name: /^\d+ · / })).toHaveCount(4);
  for (const [i, title] of FLAG_TITLES.entries()) {
    await expect(flagButton(page, i + 1)).toHaveAccessibleName(new RegExp(`^${i + 1} · ${escapeRegExp(title)}`));
    await expect(flagButton(page, i + 1)).toHaveAttribute("aria-expanded", "false");
  }

  // Units: expandable rows; the attic's market rent is 9.92 €/m².
  const units = page.getByRole("region", { name: "Units" });
  await expect(units.getByText(/The building is valued as one asset \(one plot, one cap rate\)/)).toBeVisible();
  await expect(units.getByText(/Market 9\.92 €\/m²/)).toHaveCount(0);
  await units.getByRole("button", { name: "Expand all units" }).click();
  await expect(units.getByText(/Market 9\.92 €\/m²/)).toBeVisible();
  await expect(units.getByRole("button", { name: /^8 · Attic/ })).toHaveAttribute("aria-expanded", "true");
  await expect(units.getByRole("button", { name: "Collapse all units" })).toBeVisible();

  // Focusing flag 1 shows its swing on the shared scale and the market report row; flag 2 the comparables map.
  const evidence = page.getByRole("region", { name: "Evidence" });
  await flagButton(page, 1).click();
  await expect(eye.getByRole("img", { name: "Value swing minus 111 thousand to plus 128 thousand euro" })).toBeVisible();
  await expect(eye.getByText("3.5 % → €1.19 M (−€111k)")).toBeVisible();
  await expect(evidence.getByText("Mehrfamilienhäuser bis Baujahr 1948")).toBeVisible();
  await flagButton(page, 2).click();
  await expect(flagButton(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect(evidence.getByTestId("comparables-map")).toBeVisible();
  await expect(evidence.locator("path.leaflet-interactive")).toHaveCount(38);
  await expect(evidence.getByText("Estimate 9.60 €/m² avg. (range 9.10–10.20)")).toBeVisible();

  // Flag 4: the land register page with the easement highlighted, and its translation.
  await flagButton(page, 4).click();
  await expect(evidence.getByTestId("pdf-viewer")).toBeVisible();
  await expect(evidence.locator("mark.censio-hl", { hasText: "Leitungsrecht" }).first()).toBeVisible();
  await expect(evidence.getByText(/Limited personal easement \(utility line right\) for the municipal utility/)).toBeVisible();

  // Every focused flag has a note box for the Revalue note.
  await expect(eye.getByRole("textbox", { name: "Note to the AI (Revalue)" })).toBeVisible();

  // Focusing a flag marks it as opened.
  expect((await savedDeal(page)).openedFlags).toEqual(["cap_rate", "market_rent", "easement-1"]);
});

test("accepting flags 2–4 shows 3 of 4 reviewed, and the review survives a reload", async ({ page }) => {
  await openSeededDeal(page);
  const eye = page.getByRole("region", { name: "Needs your eye" });
  const accepts: [number, string][] = [
    [2, "Accept 9.60 €/m²"],
    [3, "Accept 5 years"],
    [4, "Accept ±€0"],
  ];
  for (const [n, label] of accepts) {
    await flagButton(page, n).click();
    await eye.getByRole("button", { name: label }).click();
    await expect(flagButton(page, n)).toHaveAccessibleName(/Accepted · KV/);
  }
  const verdict = page.getByRole("region", { name: "Verdict" });
  await expect(verdict.getByText("3 of 4 reviewed")).toBeVisible();
  await expect(flagButton(page, 1)).toHaveAccessibleName(/medium confidence/);

  const saved = await savedDeal(page);
  expect(saved.flagStatus).toEqual({
    cap_rate: "open",
    market_rent: "accepted",
    under_rent: "accepted",
    "easement-1": "accepted",
  });

  await page.reload();
  await expect(page.getByRole("region", { name: "Verdict" }).getByText("3 of 4 reviewed")).toBeVisible();
  await expect(flagButton(page, 2)).toHaveAccessibleName(/Accepted · KV/);
});

test("the spot-check and the ledger of figures verified automatically", async ({ page }) => {
  await openSeededDeal(page);
  const eye = page.getByRole("region", { name: "Needs your eye" });
  const evidence = page.getByRole("region", { name: "Evidence" });

  // The spot-check picks the plot area on land register p. 1.
  await eye.getByRole("button", { name: /^Spot-check: Plot area 480 m²/ }).click();
  await expect(evidence.locator("mark.censio-hl", { hasText: "480" }).first()).toBeVisible();
  await eye.getByRole("button", { name: "Matches" }).click();
  await expect(eye.getByText("Matches · KV")).toBeVisible();
  expect((await savedDeal(page)).spotCheck).toBe("matches");

  // The ledger: 31 figures less the 4 judgement calls, and the 6 cross-checks.
  const ledgerToggle = eye.getByRole("button", { name: /^Verified automatically: 27 numbers · 6 cross-checks passed/ });
  await expect(ledgerToggle).toHaveAttribute("aria-expanded", "false");
  await ledgerToggle.click();
  await expect(ledgerToggle).toHaveAttribute("aria-expanded", "true");
  const ledger = eye.getByRole("table", { name: "Verified automatically" });
  await expect(ledger.getByRole("row", { name: /^Plot area/ })).toContainText("480 m²");
  await expect(ledger.getByRole("row", { name: /^Plot area/ })).toContainText("Land register (Grundbuch), p. 1");
  await expect(ledger.getByRole("row", { name: /Rent total equals the sum of the unit rows/ })).toContainText("passed");
  // A header row, 27 figures and 6 cross-checks.
  await expect(ledger.getByRole("row")).toHaveCount(1 + 27 + 6);
});

test("the review screen fits a 390 px phone and logs no errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await signInAsValuer(page);
  await expect(page.getByRole("list", { name: "Deals in your queue" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.goto(`/valuer/deals/${DEAL_ID}`);
  await expect(page.getByRole("region", { name: "Verdict" }).getByText("€1,300,000", { exact: true })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole("region", { name: "Units" }).getByRole("button", { name: "Expand all units" }).click();
  await flagButton(page, 2).click();
  await expect(page.getByRole("region", { name: "Evidence" }).getByTestId("comparables-map")).toBeVisible();
  await flagButton(page, 4).click();
  await expect(page.getByRole("region", { name: "Evidence" }).locator("mark.censio-hl").first()).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(problems).toEqual([]);
});

test("an unknown deal id shows a way back to the queue", async ({ page }) => {
  await page.goto("/valuer/deals/CEN-2026-9999");
  await expect(page.getByText("This deal is not in the review queue.")).toBeVisible();
  await page.getByRole("link", { name: "Back to the review queue" }).click();
  await expect(page).toHaveURL(/\/valuer$/);
});
