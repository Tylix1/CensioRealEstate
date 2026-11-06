/**
 * Finds a quoted passage in the text layer of a PDF page and says which characters of which text items to mark.
 *
 * The match follows the server's quote check (`src/lib/extraction/validate.ts`), so every quote the server verified is
 * found here too:
 * - whitespace, soft hyphens and zero-width characters are ignored, so "480 m²" matches "480m²" and a line break;
 * - compatibility forms are folded (NFKD per character, so "m²" matches "m2" and a ligature matches its letters).
 * Unlike the server, case is ignored as well.
 *
 * A match may span several text items. A match that starts or ends inside a word ("480 m²" inside "1480 m²") is used
 * only when the page has no whole-word match. Pure: no DOM, so it runs in unit tests.
 */

/**
 * The fields of a PDF.js text item that matter here. `findHighlight` takes PDF.js items as they are: marked-content
 * items have no `str` and are skipped, but keep their index.
 */
export interface TextRun {
  str?: string;
  hasEOL?: boolean;
}

/** Text item index → sorted, non-overlapping `[start, end)` UTF-16 offsets into that item's `str`. */
export type HighlightRanges = ReadonlyMap<number, readonly (readonly [number, number])[]>;

export interface HighlightMatch {
  /** Number of places on the page where the passage was found. */
  matches: number;
  ranges: HighlightRanges;
}

/** Class of the `<mark>` elements; styled in `globals.css`. */
export const HIGHLIGHT_CLASS = "censio-hl";

const IGNORED = /^[\s­​-‍⁠﻿]$/u;
const WORD = /^[\p{L}\p{N}\p{M}]$/u;

interface FoldedChar {
  ch: string;
  item: number;
  start: number;
  end: number;
  /** Whitespace or a line end separates this character from the previous one. */
  gapBefore: boolean;
}

function fold(codePoint: string): string[] {
  return Array.from(codePoint.normalize("NFKD").toLowerCase()).filter((ch) => !IGNORED.test(ch));
}

function foldText(text: string): string[] {
  return Array.from(text).flatMap((cp) => (IGNORED.test(cp) ? [] : fold(cp)));
}

function foldRuns(runs: readonly object[]): FoldedChar[] {
  const chars: FoldedChar[] = [];
  let gap = true;
  runs.forEach((run: TextRun, item) => {
    if (typeof run.str !== "string") return;
    let offset = 0;
    for (const cp of run.str) {
      const start = offset;
      offset += cp.length;
      if (IGNORED.test(cp)) {
        gap = true;
        continue;
      }
      for (const ch of fold(cp)) {
        chars.push({ ch, item, start, end: offset, gapBefore: gap });
        gap = false;
      }
    }
    if (run.hasEOL) gap = true;
  });
  return chars;
}

/** Start indexes of the non-overlapping occurrences of `needle` in `hay`, left to right. */
function findAll(hay: readonly string[], needle: readonly string[]): number[] {
  const hits: number[] = [];
  let k = 0;
  while (k + needle.length <= hay.length) {
    let j = 0;
    while (j < needle.length && hay[k + j] === needle[j]) j++;
    if (j === needle.length) {
      hits.push(k);
      k += needle.length;
    } else {
      k++;
    }
  }
  return hits;
}

function isWholeWord(chars: readonly FoldedChar[], needle: readonly string[], k: number): boolean {
  const end = k + needle.length;
  const startsInsideWord =
    WORD.test(needle[0]) && k > 0 && !chars[k].gapBefore && WORD.test(chars[k - 1].ch);
  const endsInsideWord =
    WORD.test(needle[needle.length - 1]) && end < chars.length && !chars[end].gapBefore && WORD.test(chars[end].ch);
  return !startsInsideWord && !endsInsideWord;
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Where `highlight` occurs in the text items of one page. An empty or missing highlight matches nothing. */
export function findHighlight(runs: readonly object[], highlight: string | null | undefined): HighlightMatch {
  const needle = foldText(highlight ?? "");
  if (needle.length === 0) return { matches: 0, ranges: new Map() };

  const chars = foldRuns(runs);
  const hits = findAll(
    chars.map((c) => c.ch),
    needle,
  );
  const wholeWords = hits.filter((k) => isWholeWord(chars, needle, k));
  const used = wholeWords.length > 0 ? wholeWords : hits;

  const ranges = new Map<number, [number, number][]>();
  for (const k of used) {
    for (let j = k; j < k + needle.length; j++) {
      const c = chars[j];
      let list = ranges.get(c.item);
      if (!list) {
        list = [];
        ranges.set(c.item, list);
      }
      // Within one item a match is one block, including any whitespace between its characters.
      if (j > k && chars[j - 1].item === c.item) list[list.length - 1][1] = c.end;
      else list.push([c.start, c.end]);
    }
  }
  for (const [item, list] of ranges) ranges.set(item, mergeRanges(list));
  return { matches: used.length, ranges };
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** HTML for one text item: its escaped text, with `ranges` wrapped in `<mark class="censio-hl">`. */
export function markText(str: string, ranges: readonly (readonly [number, number])[] | undefined): string {
  if (!ranges || ranges.length === 0) return escapeHtml(str);
  let html = "";
  let pos = 0;
  for (const [start, end] of ranges) {
    html += `${escapeHtml(str.slice(pos, start))}<mark class="${HIGHLIGHT_CLASS}">${escapeHtml(str.slice(start, end))}</mark>`;
    pos = end;
  }
  return html + escapeHtml(str.slice(pos));
}
