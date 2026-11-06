/**
 * The figures the explainer (P1, spec §5.2) quotes, computed from the seeded sample deal by the app's own pipeline and
 * from the routes' own limits, so the page always agrees with the demo. Pure and deterministic: the page renders on
 * the server and is prerendered.
 */
import { seededDeal } from "@/lib/data/seed";
import { eur, num, pct, rentM2 } from "@/lib/format";
import { COMPARABLES, runPipeline } from "@/lib/pipeline/run";
import { RANGES } from "@/lib/revalue/schema";
import {
  FILES_PER_BATCH,
  MAX_FILES_PER_DEAL,
  MAX_NOTE_CHARS,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  RATE_LIMITS,
} from "@/lib/server/limits";

/**
 * The valuer's note in the learning-loop example: the second half of the rehearsed note for check 1 of the demo
 * (plan Task 11), which the Demo-mode parser reads as a 3.4 % cap rate.
 */
export const EXAMPLE_NOTE = "The committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";

/** The cap rate the example note asks for (spec §5.3.5, v2). */
export const EXAMPLE_CAP_RATE = 0.034;

export interface SampleFacts {
  dealId: string;
  /** The postcode the district defaults are kept for, e.g. "04109". */
  zip: string;
  documents: number;
  pages: number;
  photos: number;
  units: number;
  /** "565 m²" */
  livingArea: string;
  /** "520 €/m²", from the sample BORIS table */
  landValue: string;
  /** The AI's cap rate in v1, "3.0 %" */
  capRate: string;
  /** The market report's range the AI took the median of, "2.5–3.5 %" */
  capRateRange: string;
  comparables: number;
  /** The building's average market rent, "9.60 €/m²" */
  marketRent: string;
  /** v1, "€1,300,000" */
  marketValue: string;
  crossChecks: number;
  crossChecksPassed: number;
  /** Figures no judgement call questions: the ledger's "Verified automatically" count. */
  verifiedNumbers: number;
  /** The flags of v1. */
  judgementCalls: number;
  /** "3.4 %" */
  exampleCapRate: string;
  /** The value after the example note, "€1,210,000" */
  revisedValue: string;
  /** Its change against v1, "−6.9 %" */
  revisedChange: string;
}

/** A range of fractions as percentages: "2.5–3.5 %". */
function pctRange([low, high]: readonly [number, number]): string {
  return `${(low * 100).toFixed(1)}–${pct(high)}`;
}

/** A signed change in percent with a real minus sign: "−6.9 %", "+1.2 %". */
function signedChange(from: number, to: number): string {
  const change = (to - from) / from;
  return `${change < 0 ? "−" : "+"}${pct(Math.abs(change))}`;
}

/** The sample deal CEN-2026-0147 as the AI prepared it (v1), and after the example note (v2). */
export function sampleFacts(): SampleFacts {
  const deal = seededDeal();
  const out = runPipeline(deal);
  const revised = runPipeline(deal, { ...out.params, capRate: EXAMPLE_CAP_RATE }).valuation.marketValue;
  const area = deal.units.reduce((sum, u) => sum + u.areaM2, 0);

  return {
    dealId: deal.id,
    zip: deal.address.zip,
    documents: deal.documents.length,
    pages: deal.documents.reduce((sum, d) => sum + d.pages, 0),
    photos: deal.photos.length,
    units: deal.units.length,
    livingArea: `${num(area)} m²`,
    landValue: `${num(out.land.valuePerM2)} €/m²`,
    capRate: pct(out.params.capRate),
    capRateRange: pctRange(out.capRate.row.range),
    comparables: COMPARABLES.length,
    marketRent: rentM2(out.rent.average),
    marketValue: eur(out.valuation.marketValue),
    crossChecks: out.crossChecks.length,
    crossChecksPassed: out.crossChecks.filter((c) => c.passed).length,
    verifiedNumbers: out.registry.filter((f) => f.flagId === null).length,
    judgementCalls: out.flags.length,
    exampleCapRate: pct(EXAMPLE_CAP_RATE),
    revisedValue: eur(revised),
    revisedChange: signedChange(out.valuation.marketValue, revised),
  };
}

export interface LimitFacts {
  batchesPerHour: number;
  notesPerHour: number;
  filesPerDeal: number;
  pagesPerPdf: number;
  mbPerPdf: number;
  /** "1,000" */
  noteChars: string;
  /** What a note may set the cap rate to, "2.0–6.0 %" */
  capRateNoteRange: string;
}

/** The usage limits of Live AI (spec §6.4), per IP and rolling hour, and per request. */
export function limitFacts(): LimitFacts {
  return {
    batchesPerHour: RATE_LIMITS.extract / FILES_PER_BATCH,
    notesPerHour: RATE_LIMITS.revalue,
    filesPerDeal: MAX_FILES_PER_DEAL,
    pagesPerPdf: MAX_PDF_PAGES,
    mbPerPdf: MAX_PDF_BYTES / (1024 * 1024),
    noteChars: num(MAX_NOTE_CHARS),
    capRateNoteRange: pctRange(RANGES.capRate),
  };
}
