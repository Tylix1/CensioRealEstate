/**
 * The quote check of spec §6.1: a cited value counts as verified only when its quote occurs on its stated page of
 * the PDF's text layer. An unverified field is listed in its document's `uncertainFields` and raises an extraction
 * flag (see `dealFromExtractions`).
 */
import { citedFields } from "@/lib/deal/fromExtraction";
import type { ExtractionResult } from "@/lib/extraction/schemas";

/**
 * Field path (the `citedFields` key, e.g. "tenantList.units.0.areaM2") → whether the quote occurs on its 1-based
 * page of `pages`. An empty quote or a page outside the document is never verified.
 */
export function verifyQuotes(result: ExtractionResult, pages: string[]): Record<string, boolean> {
  const comparablePages = pages.map(comparable);
  return Object.fromEntries(
    citedFields(result).map(({ path, field }) => {
      const page = Number.isInteger(field.page) ? comparablePages[field.page - 1] : undefined;
      const quote = comparable(field.quote);
      return [path, page !== undefined && quote.length > 0 && page.includes(quote)];
    }),
  );
}

/**
 * Text reduced to what a quote must match. PDF.js decides where a text layer has spaces and line breaks (a table
 * row may come out as "62,0m²" or "62,0\nm²"), so whitespace is dropped altogether; NFKC folds ligatures (ﬂ → fl)
 * and other compatibility forms; soft hyphens and zero-width characters are removed. Case and punctuation count.
 */
function comparable(text: string): string {
  return text.normalize("NFKC").replace(/[\s\u00ad\u200b-\u200d\u2060\ufeff]+/g, "");
}
