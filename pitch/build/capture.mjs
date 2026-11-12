// Captures the pitch assets from the running prototype in demo mode (no API key needed):
//   node pitch/build/capture.mjs <baseUrl> <assetsDir> <outDir>
// 1. Screenshots at deviceScaleFactor 2 (2880 x 1800) of the key screens -> <assetsDir>/*.png
// 2. A human-paced recording of the demo path -> <outDir>/demo-raw.webm plus demo-marks.json (step timestamps),
//    which make-demo-video.py cuts and speeds to 30 seconds.
// Selectors follow tests/e2e/demo-path.spec.ts.
import { chromium } from "playwright";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const [baseUrl = "http://localhost:3100", assetsDir = "pitch/assets", outDir = "pitch/out"] = process.argv.slice(2);
const VIEWPORT = { width: 1440, height: 900 };
const DEAL_ID = "CEN-2026-0147";
const REHEARSED =
  "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";
const ACCEPTS = [
  [2, "Accept 9.60 €/m²"],
  [3, "Accept 5 years"],
  [4, "Accept ±€0"],
];

/** Marks the orientation dialog as seen and blocks map tiles (the sandbox cannot reach them). */
async function prepare(context) {
  await context.addInitScript(() => {
    if (!localStorage.getItem("censio-demo-v1")) {
      localStorage.setItem("censio-demo-v1", JSON.stringify({ state: { orientationSeen: true }, version: 1 }));
    }
  });
  await context.route(/tile\.openstreetmap\.org/, (route) => route.abort());
}

/** A visible cursor for the recording: a dot that follows mouse moves and pulses on click. */
async function addCursor(context) {
  await context.addInitScript(() => {
    const draw = () => {
      if (document.getElementById("pitch-cursor")) return;
      const dot = document.createElement("div");
      dot.id = "pitch-cursor";
      Object.assign(dot.style, {
        position: "fixed", left: "-40px", top: "-40px", width: "22px", height: "22px", marginLeft: "-11px",
        marginTop: "-11px", borderRadius: "50%", background: "rgba(16,24,40,0.28)", border: "2px solid #ffffff",
        boxShadow: "0 1px 4px rgba(16,24,40,0.45)", zIndex: "2147483647", pointerEvents: "none",
        transition: "transform 120ms ease-out",
      });
      document.body.appendChild(dot);
      window.addEventListener("mousemove", (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
      window.addEventListener("mousedown", () => { dot.style.transform = "scale(0.7)"; }, true);
      window.addEventListener("mouseup", () => { dot.style.transform = "scale(1)"; }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw);
    else draw();
  });
}

/** Moves the cursor to the element like a person would, then clicks it. */
async function humanClick(page, locator, pause = 250) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await page.waitForTimeout(pause);
  }
  await locator.click();
}

const flagButton = (page, n) =>
  page.getByRole("region", { name: "Needs your eye" }).getByRole("button", { name: new RegExp(`^${n} · `) });
const stepHeading = (page, name) => page.getByRole("heading", { name, level: 2, exact: true });

/** The demo path. `shot(name)` is called at the screens the deck uses; `mark(name)` records step timestamps. */
async function demoPath(page, { shot = async () => {}, mark = () => {}, human = false }) {
  const click = (locator) => (human ? humanClick(page, locator) : locator.click());
  const wait = (ms) => (human ? page.waitForTimeout(ms) : Promise.resolve());

  await page.goto(`${baseUrl}/?recording=1`);
  await page.getByRole("button", { name: "Continue as Demo Capital GmbH" }).waitFor();
  mark("start");
  await wait(600);
  await click(page.getByRole("button", { name: "Continue as Demo Capital GmbH" }));
  await page.waitForURL(/\/client$/);
  await wait(500);
  await click(page.getByRole("button", { name: "New valuation" }));
  await stepHeading(page, "Property").waitFor();
  await wait(700);
  await click(page.getByRole("button", { name: "Next", exact: true }));
  await stepHeading(page, "Documents").waitFor();
  mark("documents");
  await wait(400);
  await click(page.getByRole("button", { name: "Use sample documents" }));
  await page.getByText("plot 480 m²").waitFor();
  await wait(1800);
  await shot("wizard-documents");
  mark("documents-read");
  await click(page.getByRole("button", { name: "Next", exact: true }));
  await page.getByText("The AI created 8 units from your tenant list.").waitFor();
  await wait(1200);
  await click(page.getByRole("button", { name: "Next", exact: true }));
  await stepHeading(page, "Review & submit").waitFor();
  await wait(500);
  await click(page.getByRole("button", { name: "Submit", exact: true }));
  await page.waitForURL(new RegExp(`/client/deals/${DEAL_ID}/processing$`));
  mark("ai-at-work");
  await page.getByRole("heading", { name: "With senior valuer for review" }).waitFor({ timeout: 30_000 });
  mark("ai-done");
  await wait(900);
  await shot("ai-at-work");
  await click(page.getByRole("link", { name: "Open as Senior Valuer" }));
  await page.waitForURL(new RegExp(`/valuer/deals/${DEAL_ID}$`));
  const verdict = page.getByRole("region", { name: "Verdict" });
  await verdict.getByText("€1,300,000", { exact: true }).waitFor();
  mark("review");
  await wait(1500);
  await shot("hero-review");
  await click(flagButton(page, 1));
  const eye = page.getByRole("region", { name: "Needs your eye" });
  await eye.getByText("3.5 % → €1.19 M (−€111k)").waitFor();
  await wait(1600);
  await shot("flag-evidence");
  mark("revalue");
  await click(eye.getByRole("list", { name: "Example notes" }).getByRole("button", { name: REHEARSED, exact: true }));
  await wait(700);
  await click(eye.getByRole("button", { name: "Send note & revalue" }));
  await verdict.getByText("€1,210,000", { exact: true }).waitFor();
  await wait(1700);
  await shot("revision");
  mark("accept");
  for (const [n, label] of ACCEPTS) {
    await click(flagButton(page, n));
    await click(eye.getByRole("button", { name: label }));
    await wait(250);
  }
  await click(verdict.getByRole("button", { name: "Approve & send report" }));
  const sheet = page.getByRole("dialog", { name: "Approve & send report" });
  await sheet.getByRole("button", { name: "Sign & send" }).waitFor();
  mark("sign");
  await wait(900);
  await shot("approve-sheet");
  await click(sheet.getByRole("button", { name: "Sign & send" }));
  await sheet.getByText("Report sent to Demo Capital GmbH").waitFor();
  await wait(1000);
  await click(sheet.getByRole("link", { name: "View as the client" }));
  await page.waitForURL(/\/client$/);
  const request = page.getByRole("listitem").filter({ hasText: DEAL_ID });
  await wait(700);
  await click(request.getByRole("link", { name: "Open report" }));
  await page.getByRole("article", { name: "Valuation report", exact: true }).waitFor();
  mark("report");
  await wait(2200);
  await shot("report");
  mark("end");
}

/** Clears the demo store so each run starts from the seeded state. */
async function resetStore(page) {
  await page.goto(baseUrl);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("censio-demo-v1", JSON.stringify({ state: { orientationSeen: true }, version: 1 }));
  });
}

const browser = await chromium.launch();
await mkdir(assetsDir, { recursive: true });
await mkdir(outDir, { recursive: true });

// 1. Screenshots, crisp (deviceScaleFactor 2).
{
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await prepare(context);
  const page = await context.newPage();
  await resetStore(page);
  await demoPath(page, {
    shot: (name) => page.screenshot({ path: path.join(assetsDir, `${name}.png`) }),
  });
  await context.close();
  console.log("screenshots written to", assetsDir);
}

// 2. The recording, human-paced, with a visible cursor.
{
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    recordVideo: { dir: outDir, size: VIEWPORT },
  });
  await prepare(context);
  const setup = await context.newPage();
  await resetStore(setup);
  await setup.close();
  await addCursor(context);
  const page = await context.newPage();
  const t0 = Date.now();
  const marks = {};
  await demoPath(page, { human: true, mark: (name) => { marks[name] = (Date.now() - t0) / 1000; } });
  await page.waitForTimeout(500);
  const video = page.video();
  await context.close();
  const raw = path.join(outDir, "demo-raw.webm");
  await rename(await video.path(), raw);
  await writeFile(path.join(outDir, "demo-marks.json"), JSON.stringify(marks, null, 2));
  console.log("recording written to", raw, marks);
}

await browser.close();
