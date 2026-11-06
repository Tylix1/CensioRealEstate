/**
 * Text for the PDF report's fonts. The report uses the PDF's built-in Helvetica, which needs no font file and so no
 * network request. Helvetica encodes text in WinAnsi (Windows-1252), which covers the euro sign, the German umlauts and
 * the sharp s, and the typography the app uses (en and em dashes, middle dot, ellipsis, curly quotes, multiplication
 * sign, superscript two, plus-minus, section sign). A character outside it would print as a wrong glyph, so every text
 * of the PDF goes through `toWinAnsi`: the true minus sign becomes an en dash, arrows and comparison signs become
 * ASCII, other letters lose their accents, and anything else becomes "?".
 */

const char = (code: number): string => String.fromCharCode(code);

/** Characters of Windows-1252 outside Latin-1 (pdfkit's WIN_ANSI_MAP): Œ œ Š š Ÿ Ž ž ƒ ˆ ˜ – — ‘ ’ ‚ “ ” „ † ‡ • … ‰ ‹ › € ™. */
const WIN_ANSI_EXTRA = new Set(
  [
    0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6, 0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a,
    0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
  ].map(char),
);

const EN_DASH = char(0x2013);
const EM_DASH = char(0x2014);
const NO_BREAK_SPACE = char(0x00a0);

/** Replacements for characters outside WinAnsi, by code point. */
const REPLACEMENTS = new Map<string, string>(
  (
    [
      [0x2212, EN_DASH], // minus sign
      [0x2010, "-"], // hyphen
      [0x2011, "-"], // non-breaking hyphen
      [0x2012, EN_DASH], // figure dash
      [0x2015, EM_DASH], // horizontal bar
      [0x2192, "->"], // rightwards arrow
      [0x2190, "<-"], // leftwards arrow
      [0x2194, "<->"], // left right arrow
      [0x21d2, "=>"], // rightwards double arrow
      [0x2248, "~"], // almost equal to
      [0x2264, "<="], // less-than or equal to
      [0x2265, ">="], // greater-than or equal to
      [0x2260, "!="], // not equal to
      [0x2032, "'"], // prime
      [0x2033, '"'], // double prime
      [0x2713, "ok"], // check mark
      [0x2714, "ok"], // heavy check mark
      [0x2715, "x"], // multiplication x
      [0x2717, "x"], // ballot x
      [0x202f, NO_BREAK_SPACE], // narrow no-break space
      [0x2007, NO_BREAK_SPACE], // figure space
      [0x2002, " "], // en space
      [0x2003, " "], // em space
      [0x2009, " "], // thin space
      [0x200a, " "], // hair space
      [0x200b, ""], // zero-width space
      [0x2060, ""], // word joiner
      [0xfeff, ""], // byte order mark
    ] as const
  ).map(([code, replacement]): [string, string] => [char(code), replacement]),
);

/** Combining diacritical marks (U+0300 to U+036F), left over when an accented letter is decomposed. */
const COMBINING_MARKS = new RegExp(`[${char(0x0300)}-${char(0x036f)}]`, "g");

/** Letters with a stroke, which do not decompose: Ł ł Đ đ Ø ø stay readable as their base letter. */
const STROKED = new Map<string, string>([
  [char(0x0141), "L"],
  [char(0x0142), "l"],
  [char(0x0110), "D"],
  [char(0x0111), "d"],
]);

function isWinAnsiChar(ch: string): boolean {
  if (ch.length !== 1) return false;
  const code = ch.charCodeAt(0);
  return code === 0x0a || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch);
}

/** True when Helvetica can show every character of `text` (line breaks included). */
export function isWinAnsi(text: string): boolean {
  for (const ch of text) if (!isWinAnsiChar(ch)) return false;
  return true;
}

function replaceChar(ch: string): string {
  if (isWinAnsiChar(ch)) return ch;
  const replacement = REPLACEMENTS.get(ch) ?? STROKED.get(ch);
  if (replacement !== undefined) return replacement;
  if (ch === "\t" || ch === "\r") return " ";
  // Accented letters outside Latin-1 keep their base letter.
  const base = ch.normalize("NFKD").replace(COMBINING_MARKS, "");
  if (base !== "" && [...base].every(isWinAnsiChar)) return base;
  return "?";
}

/** `text` with every character Helvetica cannot show replaced. */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) out += replaceChar(ch);
  return out;
}

/** A copy of `value` with every string in it passed through `toWinAnsi` (plain data: arrays, objects, primitives). */
export function toWinAnsiDeep<T>(value: T): T {
  if (typeof value === "string") return toWinAnsi(value) as T;
  if (Array.isArray(value)) return value.map((item) => toWinAnsiDeep(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toWinAnsiDeep(v)])) as T;
  }
  return value;
}
