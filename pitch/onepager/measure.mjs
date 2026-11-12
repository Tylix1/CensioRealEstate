// Measures where every card and text block of the rendered one pager sits, so build_onepager_pptx.py can
// place native PowerPoint shapes at the same positions (CSS px; 96 px = 1 in).
//   node pitch/onepager/measure.mjs <onepager.html> <layout.json>
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [input, output] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(pathToFileURL(path.resolve(input)).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const layout = await page.evaluate(() => {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  };
  const pad = (el) => {
    const s = getComputedStyle(el);
    return { l: parseFloat(s.paddingLeft), t: parseFloat(s.paddingTop), r: parseFloat(s.paddingRight) };
  };
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const strip = qa(".strip > div").map((d) => ({ box: r(d), pad: pad(d), label: r(q(".label", d)) }));
  const cardOf = (sel) => {
    const el = q(sel);
    return { box: r(el), pad: pad(el), label: r(q(".label", el)) };
  };
  return {
    header: r(q("header")), mark: r(q("header img")), h1: r(q("header h1")), tag: r(q("header .tag")),
    meta: r(q("header .meta")),
    strip,
    vision: { ...cardOf(".vision"), statement: r(q(".vision .statement")) },
    mission: { ...cardOf(".mission"), statement: r(q(".mission .statement")),
               guard: qa(".mission .guard > div").map(r) },
    playbook: { ...cardOf(".playbook"), title: r(q(".playbook h2")),
                stages: qa(".stage").map((s) => ({ box: r(s), when: r(q(".when", s)), what: r(q(".what", s)),
                                                   ns: r(q(".ns", s)) })) },
    northstar: { ...cardOf(".northstar"), proxy: r(q(".northstar .proxy")),
                 blocks: qa(".nsblock").map((b) => ({ box: r(b), phase: r(q(".phase", b)),
                                                      statement: r(q(".statement", b)), parts: r(q(".parts", b)) })) },
    moat: { ...cardOf(".moat"), items: qa(".moat li").map(r), test: r(q(".moat .test")) },
    footer: { box: r(q("footer")), label: r(q("footer .label")),
              founders: qa(".founder").map((f) => ({ avatar: r(q(".avatar", f)), text: r(q(".founder > div:last-child", f)) })),
              model: r(q("footer .model")) },
  };
});
await writeFile(output, JSON.stringify(layout, null, 1));
await browser.close();
console.log("wrote", output);
