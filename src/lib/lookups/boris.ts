import type { Confidence } from "@/lib/deal/types";

/** Sample stand-in for a BORIS (Bodenrichtwert) lookup. Real BORIS access is a non-goal of the prototype. */
export interface LandValueLookup {
  zone: string;
  valuePerM2: number;
  asOf: string;
  confidence: Confidence;
  note: string | null;
}

export const BORIS_SOURCE_LABEL = "BORIS Sachsen (sample)";

export function lookupLandValue(zip: string): LandValueLookup {
  if (zip.trim() === "04109") {
    return { zone: "0412", valuePerM2: 520, asOf: "2026-01-01", confidence: "high", note: null };
  }
  return {
    zone: "n/a",
    valuePerM2: 400,
    asOf: "2026-01-01",
    confidence: "low",
    note: "No sample data for this address",
  };
}
