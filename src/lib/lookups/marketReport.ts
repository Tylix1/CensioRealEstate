/** Sample market report of the Leipzig valuation committee (Gutachterausschuss), 2026, p. 47, table 12. */
export interface CapRateRow {
  key: "efh" | "mfh_pre1949" | "mfh_post1949" | "mixed";
  label: string;
  labelDe: string;
  /** fractions, e.g. [0.025, 0.035] */
  range: [number, number];
  median: number;
  n: number;
}

export const MARKET_REPORT_2026: CapRateRow[] = [
  { key: "efh", label: "One- and two-family houses", labelDe: "Ein- und Zweifamilienhäuser", range: [0.015, 0.025], median: 0.02, n: 112 },
  { key: "mfh_pre1949", label: "Multi-family houses built up to 1948", labelDe: "Mehrfamilienhäuser bis Baujahr 1948", range: [0.025, 0.035], median: 0.03, n: 64 },
  { key: "mfh_post1949", label: "Multi-family houses built 1949 or later", labelDe: "Mehrfamilienhäuser ab Baujahr 1949", range: [0.03, 0.04], median: 0.035, n: 41 },
  { key: "mixed", label: "Mixed residential/commercial buildings", labelDe: "Wohn- und Geschäftshäuser", range: [0.035, 0.05], median: 0.042, n: 27 },
];

export interface CapRateLookup {
  row: CapRateRow;
  /** No district-level figure exists in the sample report. */
  districtValue: number | null;
  page: 47;
  table: 12;
  source: "Market report 2026 (sample), valuation committee Leipzig";
}

export function lookupCapRate(builtYear: number): CapRateLookup {
  const key = builtYear <= 1948 ? "mfh_pre1949" : "mfh_post1949";
  const row = MARKET_REPORT_2026.find((r) => r.key === key)!;
  return {
    row,
    districtValue: null,
    page: 47,
    table: 12,
    source: "Market report 2026 (sample), valuation committee Leipzig",
  };
}
