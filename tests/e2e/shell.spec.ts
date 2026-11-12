import { expect, test, type Page } from "@playwright/test";

// Next.js keeps pages visited earlier in the DOM, hidden (React Activity): prefer getByRole, which skips hidden
// elements, and scope text queries to a visible landmark.

/** The persisted demo store (src/lib/store/demoStore.ts). */
const STORE_KEY = "censio-demo-v1";

type SavedStore = { state: Record<string, unknown> & { deals: Record<string, Record<string, unknown>> }; version: number };

async function savedStore(page: Page): Promise<SavedStore> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), STORE_KEY);
}

/** The orientation overlay opens on the first visit; most tests close it first. */
async function dismissOrientation(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "How this demo works" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toBeHidden();
}

function demoBar(page: Page) {
  return page.getByRole("region", { name: "Demo controls" });
}

async function signInAsClient(page: Page): Promise<void> {
  await page.goto("/");
  await dismissOrientation(page);
  await page.getByRole("button", { name: "Continue as Demo Capital GmbH" }).click();
  await expect(page).toHaveURL(/\/client$/);
}

test("sign in as the client shows the dashboard with New valuation and the delivered report", async ({ page }) => {
  await signInAsClient(page);
  await expect(page.getByRole("button", { name: "New valuation" })).toBeVisible();
  await expect(page.getByText("CEN-2026-0131")).toBeVisible();
  await expect(page.getByText("Beispielweg 3, 04155 Leipzig")).toBeVisible();
  await expect(page.getByText("€870,000")).toBeVisible();
  // The seeded deal is the client's request, ready for the senior valuer.
  const seeded = page.getByRole("listitem").filter({ hasText: "CEN-2026-0147" });
  await expect(seeded).toBeVisible();
  await expect(seeded.getByText("With senior valuer")).toBeVisible();
  const earlier = page.getByRole("listitem").filter({ hasText: "CEN-2026-0131" });
  await expect(earlier.getByText("Delivered", { exact: true })).toBeVisible();
  await expect(page.getByRole("banner").getByText("Sample data", { exact: true })).toBeVisible();
});

test("the valuer button on the sign-in page goes to the review queue", async ({ page }) => {
  await page.goto("/");
  await dismissOrientation(page);
  await page.getByRole("button", { name: "Continue as Senior Valuer" }).click();
  await expect(page).toHaveURL(/\/valuer$/);
  expect((await savedStore(page)).state.role).toBe("valuer");
});

test("the role switch lands on /valuer and the role survives a reload", async ({ page }) => {
  await signInAsClient(page);
  const bar = demoBar(page);
  await expect(bar.getByRole("button", { name: "Client" })).toHaveAttribute("aria-pressed", "true");

  await bar.getByRole("button", { name: "Senior Valuer" }).click();
  await expect(page).toHaveURL(/\/valuer$/);
  await expect(bar.getByRole("button", { name: "Senior Valuer" })).toHaveAttribute("aria-pressed", "true");
  await expect(bar.getByRole("button", { name: "Client" })).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await expect(bar.getByRole("button", { name: "Senior Valuer" })).toHaveAttribute("aria-pressed", "true");
  expect((await savedStore(page)).state.role).toBe("valuer");

  // A page outside both areas shows the saved role, not one read from the URL.
  await page.goto("/how-it-works");
  await expect(bar.getByRole("button", { name: "Senior Valuer" })).toHaveAttribute("aria-pressed", "true");

  await bar.getByRole("button", { name: "Client" }).click();
  await expect(page).toHaveURL(/\/client$/);
  expect((await savedStore(page)).state.role).toBe("client");
});

test("Reset demo returns to sign-in with the seeded state", async ({ page }) => {
  await signInAsClient(page);
  // Start a request so there is something to reset.
  await page.getByRole("button", { name: "New valuation" }).click();
  await expect(page).toHaveURL(/\/client\/new$/);
  expect((await savedStore(page)).state.draft).not.toBeNull();

  await demoBar(page).getByRole("button", { name: "Reset demo" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Continue as Demo Capital GmbH" })).toBeVisible();
  await expect(demoBar(page).getByRole("button", { name: "Client" })).toHaveAttribute("aria-pressed", "false");
  await expect(demoBar(page).getByRole("button", { name: "Senior Valuer" })).toHaveAttribute("aria-pressed", "false");

  const saved = await savedStore(page);
  expect(saved.state.role).toBeNull();
  expect(saved.state.draft).toBeNull();
  expect(Object.keys(saved.state.deals)).toEqual(["CEN-2026-0147"]);
  // Reset keeps the orientation as seen.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("?recording=1 hides the demo bar for the whole session", async ({ page }) => {
  await page.goto("/?recording=1");
  await expect(page.getByRole("banner").getByText("Sample data", { exact: true })).toBeVisible();
  // No orientation overlay in a recording take.
  await page.getByRole("button", { name: "Continue as Demo Capital GmbH" }).click();
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByText("CEN-2026-0131")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Reset demo")).toBeHidden();
  await expect(page.getByRole("banner").getByText("Sample data", { exact: true })).toBeVisible();

  // The flag is remembered in sessionStorage, so a reload without the parameter keeps the bar hidden.
  await page.reload();
  await expect(page.getByText("CEN-2026-0131")).toBeVisible();
  await expect(page.getByText("Reset demo")).toBeHidden();

  // ?recording=0 brings it back.
  await page.goto("/client?recording=0");
  await expect(demoBar(page).getByRole("button", { name: "Reset demo" })).toBeVisible();
});

test("the badge reads /api/mode and shows Demo mode without a key; ?code= is stored", async ({ page }) => {
  const modeRequest = page.waitForRequest(
    (request) => request.url().includes("/api/mode") && new URL(request.url()).searchParams.get("code") === "XYZ",
  );
  await page.goto("/?code=XYZ");
  await modeRequest;
  await expect(demoBar(page).getByText("Demo mode")).toBeVisible();
  await expect(demoBar(page).getByText("Live AI")).toHaveCount(0);
  expect((await savedStore(page)).state.accessCode).toBe("XYZ");
  // The code is kept out of the address bar once stored.
  await expect(page).toHaveURL(/\/$/);
});

test("the orientation overlay opens on the first visit only and reopens from the demo bar", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "How this demo works" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("AI reads and prepares")).toBeVisible();
  await expect(dialog.getByText("You check the flagged calls")).toBeVisible();
  await expect(dialog.getByText("You decide")).toBeVisible();
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole("button", { name: "Continue as Demo Capital GmbH" })).toBeVisible();
  await expect(demoBar(page).getByText("Demo mode")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await demoBar(page).getByRole("button", { name: "Orientation" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the dashboard shows an approved deal as Delivered with its value, and an unfinished request", async ({ page }) => {
  await signInAsClient(page);
  await page.getByRole("button", { name: "New valuation" }).click();
  await expect(page).toHaveURL(/\/client\/new$/);
  await page.goto("/client");
  await expect(page.getByText("CEN-2026-0131")).toBeVisible();

  // Sign the seeded deal off directly in the saved state, as the valuer's Sign & send would.
  await page.evaluate((key) => {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "null");
    const stored = saved.state.deals["CEN-2026-0147"];
    stored.deal.status = "approved";
    stored.approval = { at: "2026-11-06T15:30:00.000Z", version: 1, signer: "K. Vogel", acceptedAtSignOff: [] };
    window.localStorage.setItem(key, JSON.stringify(saved));
  }, STORE_KEY);
  await page.reload();

  const signed = page.getByRole("listitem").filter({ hasText: "CEN-2026-0147" });
  await expect(signed.getByText("Delivered", { exact: true })).toBeVisible();
  await expect(signed.getByText("€1,300,000")).toBeVisible();
  await expect(signed.getByRole("link", { name: "Open report" })).toHaveAttribute(
    "href",
    "/client/deals/CEN-2026-0147/report",
  );

  await expect(page.getByText("Unfinished request")).toBeVisible();
  await page.getByRole("link", { name: "Continue request" }).click();
  await expect(page).toHaveURL(/\/client\/new$/);
});

test("sign-in and dashboard fit a 390 px screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsClient(page);
  await expect(page.getByText("CEN-2026-0131")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue as Senior Valuer" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("?frame=1 draws a browser toolbar with the page address for the whole session", async ({ page }) => {
  await page.goto("/");
  const frame = page.locator("[data-browser-frame]");
  await expect(frame).toBeHidden();

  await page.goto("/?recording=1&frame=1");
  await expect(frame).toBeVisible();
  // Host only on the start page: the take's flags stay out of the address.
  const host = new URL(page.url()).host;
  await expect(frame).toHaveText(host);
  await expect(page.getByText("Reset demo")).toBeHidden();

  // The address follows the page, and the flag is remembered in sessionStorage across navigations and reloads.
  await page.getByRole("button", { name: "Continue as Demo Capital GmbH" }).click();
  await expect(page).toHaveURL(/\/client$/);
  await expect(frame).toHaveText(`${host}/client`);
  await page.reload();
  await expect(frame).toBeVisible();
  await expect(frame).toHaveText(`${host}/client`);

  await page.goto("/client?frame=0");
  await expect(frame).toBeHidden();
});

