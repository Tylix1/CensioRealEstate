/**
 * The PDF viewer's highlight matching (plan Task 14): a quote is found across text items with the same folding as the
 * server's quote check, and every quote of the committed sample fixtures is found on its cited page.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { findHighlight, markText, type TextRun } from "@/components/pdf/highlight";
import { citedFields } from "@/lib/deal/fromExtraction";
import type { ExtractionResult } from "@/lib/extraction/schemas";

const ROOT = process.cwd();

function rangesOf(runs: object[], highlight: string | null) {
  return Object.fromEntries(findHighlight(runs, highlight).ranges);
}

describe("findHighlight", () => {
  it("marks a quote that is one text item", () => {
    const runs = [{ str: "Gebäude- und Freifläche" }, { str: " " }, { str: "480 m²", hasEOL: true }];
    expect(findHighlight(runs, "480 m²").matches).toBe(1);
    expect(rangesOf(runs, "480 m²")).toEqual({ 2: [[0, 6]] });
  });

  it("marks a quote that spans several text items", () => {
    const runs = [{ str: "Größe: 480" }, { str: " " }, { str: "m²", hasEOL: true }, { str: "Flur 12" }];
    expect(rangesOf(runs, "480 m²")).toEqual({ 0: [[7, 10]], 2: [[0, 2]] });
  });

  it("ignores whitespace, line ends, case and compatibility forms", () => {
    expect(rangesOf([{ str: "480m²" }], "480 m²")).toEqual({ 0: [[0, 5]] });
    expect(rangesOf([{ str: "480 m²" }], "480 m2")).toEqual({ 0: [[0, 6]] });
    expect(rangesOf([{ str: "480", hasEOL: true }, { str: "m²" }], "480 m²")).toEqual({ 0: [[0, 3]], 1: [[0, 2]] });
    expect(rangesOf([{ str: "Dienstbarkeit (Leitungsrecht) für" }], "leitungsrecht")).toEqual({ 0: [[15, 28]] });
    expect(rangesOf([{ str: "Grundstücksﬂäche" }], "flache")).toEqual({});
    expect(rangesOf([{ str: "Grundstücksﬂäche" }], "fläche")).toEqual({ 0: [[11, 16]] });
  });

  it("prefers whole words and falls back to a partial match", () => {
    const runs = [{ str: "Gesamt 1480 m²" }, { str: " · " }, { str: "Flurstück 480 m²" }];
    expect(rangesOf(runs, "480 m²")).toEqual({ 2: [[10, 16]] });
    expect(rangesOf([{ str: "Gesamt 1480 m²" }], "480 m²")).toEqual({ 0: [[8, 14]] });
  });

  it("marks every occurrence and keeps item indexes when marked content has no text", () => {
    const runs: TextRun[] = [{ str: "keine", hasEOL: true }, {}, { str: "Löschungen: keine" }];
    expect(findHighlight(runs, "keine").matches).toBe(2);
    expect(rangesOf(runs, "keine")).toEqual({ 0: [[0, 5]], 2: [[12, 17]] });
  });

  it("matches nothing for an empty or missing highlight", () => {
    expect(findHighlight([{ str: "480 m²" }], null).matches).toBe(0);
    expect(findHighlight([{ str: "480 m²" }], "  ").matches).toBe(0);
    expect(findHighlight([{ str: "480 m²" }], "Leitungsrecht").matches).toBe(0);
  });
});

describe("markText", () => {
  it("wraps the ranges in marks and escapes the text", () => {
    expect(markText("a < b & c", [[4, 5]])).toBe('a &lt; <mark class="censio-hl">b</mark> &amp; c');
    expect(markText("Größe 480 m²", undefined)).toBe("Größe 480 m²");
    expect(markText("480 m² und 480 m²", [[0, 6], [11, 17]])).toBe(
      '<mark class="censio-hl">480 m²</mark> und <mark class="censio-hl">480 m²</mark>',
    );
  });
});

describe("the sample documents", () => {
  const index = JSON.parse(readFileSync(path.join(ROOT, "fixtures/extraction/index.json"), "utf8")) as Record<
    string,
    { sha256: string }
  >;

  it.each(Object.entries(index))("finds every quote of %s on its cited page", async (fileName, { sha256 }) => {
    const result = JSON.parse(
      readFileSync(path.join(ROOT, "fixtures/extraction", `${sha256}.json`), "utf8"),
    ) as ExtractionResult;
    const doc = await getDocumentProxy(new Uint8Array(readFileSync(path.join(ROOT, "public/sample", fileName))));
    try {
      const pages: object[][] = [];
      for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items);
      const missing = citedFields(result)
        .filter(({ field }) => field.quote.trim() !== "")
        .filter(({ field }) => findHighlight(pages[field.page - 1] ?? [], field.quote).matches === 0)
        .map(({ path: fieldPath, field }) => `${fieldPath}: "${field.quote}" on p. ${field.page}`);
      expect(missing).toEqual([]);
    } finally {
      await doc.loadingTask.destroy();
    }
  });

  it("highlights the plot area on page 1 of the land register", async () => {
    const doc = await getDocumentProxy(
      new Uint8Array(readFileSync(path.join(ROOT, "public/sample/Grundbuch_Musterstrasse12.pdf"))),
    );
    try {
      const items = (await (await doc.getPage(1)).getTextContent()).items;
      const { matches, ranges } = findHighlight(items, "480 m²");
      expect(matches).toBe(1);
      const [[item, [[start, end]]]] = [...ranges];
      const run = items[item];
      expect("str" in run ? run.str.slice(start, end) : null).toBe("480 m²");
    } finally {
      await doc.loadingTask.destroy();
    }
  });
});
