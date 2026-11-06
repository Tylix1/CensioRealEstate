import type { Page } from "@playwright/test";

/**
 * Marks the orientation overlay as seen before any page script runs, so the first-visit dialog does not block clicks.
 * The guard keeps state across reloads: it only seeds when nothing is stored yet.
 */
export async function skipOrientation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem("censio-demo-v1")) {
      localStorage.setItem("censio-demo-v1", JSON.stringify({ state: { orientationSeen: true }, version: 1 }));
    }
  });
}

/** The sandbox cannot reach the OSM tile servers; abort tile requests so tests assert on vector layers only. */
export async function blockMapTiles(page: Page): Promise<void> {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
}
