import { expect, test } from "@playwright/test";

test("home page renders the Censio brand", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Censio").first()).toBeVisible();
});
