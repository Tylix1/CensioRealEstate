// Renders the one pager HTML to an A4 PDF (fonts embedded) and a PNG preview.
//   node pitch/onepager/render.mjs <in.html> <out.pdf> [preview.png]
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [input, output, preview] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.resolve(input)).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => {
  const sheet = document.querySelector(".page");
  return { scroll: sheet.scrollHeight, client: sheet.clientHeight };
});
if (overflow.scroll > overflow.client + 1) {
  console.error(`content overflows the page: ${overflow.scroll}px > ${overflow.client}px`);
  process.exitCode = 2;
}
await page.pdf({ path: output, format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
if (preview) await page.screenshot({ path: preview, fullPage: true });
await browser.close();
console.log("wrote", output, preview ?? "", JSON.stringify(overflow));
