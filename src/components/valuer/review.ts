/**
 * Shared, pure helpers of the valuer screens (V1 queue, V2 review): labels, number formats and the focus model. No
 * hooks, no clock: every text is derived from the deal and its pipeline output.
 */
import { DOCUMENT_TYPE_LABEL, type Deal, type DealDocument, type Feature, type FloorCode } from "@/lib/deal/types";
import type { Flag } from "@/lib/flags/rules";
import { kEur, num } from "@/lib/format";
import type { PipelineOutput } from "@/lib/pipeline/run";
import type { Figure } from "@/lib/registry/registry";
import type { FlagReviewStatus } from "@/lib/store/demoStore";

/** What the evidence pane shows: a judgement call, the spot-check, or (nothing focused) an overview. */
export type ReviewFocus = { kind: "flag"; flagId: string } | { kind: "spot" } | null;

/** The signing valuer's initials (plan "Sample world": K. Vogel). */
export const VALUER_INITIALS = "KV";

/**
 * DOM ids of a deal's review screen, e.g. to scroll a call into view. They carry the deal id: Next.js may keep the
 * review of another deal mounted (hidden) after a visit.
 */
export function flagDomId(dealId: string, flagId: string): string {
  return `flag-${dealId}-${flagId}`;
}

export function evidenceDomId(dealId: string): string {
  return `evidence-${dealId}`;
}

/** Scrolls an element of the review screen into view, after the browser has laid out the latest render. */
export function scrollToId(id: string, block: ScrollLogicalPosition = "start"): void {
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block, behavior: "smooth" }));
}

const MINUS = "−";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "06 Nov 2026" from an ISO date or date-time (its calendar date as written; no clock, no time zone). */
export function dateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${match[3]} ${month} ${match[1]}` : iso;
}

/** "565" or "565.5": areas to one decimal, without a trailing ".0". */
export function areaLabel(m2: number): string {
  return Number.isInteger(m2) ? num(m2) : num(m2, 1);
}

/** "−9.2 %", "+3.0 %", "0.0 %" for a fraction. */
export function signedPct(fraction: number): string {
  const value = Math.abs(fraction * 100).toFixed(1);
  if (value === "0.0") return "0.0 %";
  return `${fraction < 0 ? MINUS : "+"}${value} %`;
}

/** "+0.04", "−0.35", "±0.00": a rent adjustment in €/m². */
export function signedRent(n: number): string {
  const value = Math.abs(n).toFixed(2);
  if (value === "0.00") return "±0.00";
  return `${n < 0 ? MINUS : "+"}${value}`;
}

/** "9.60": a rent in €/m² without its unit. */
export function rentNumber(n: number): string {
  return (Math.round(n * 100 + 1e-7) / 100).toFixed(2);
}

/** "€1.19 M": a value in millions, for the ends of a swing. */
export function millions(eurValue: number): string {
  return `€${(eurValue / 1_000_000).toFixed(2)} M`;
}

/** "<1 ms", "2.5 ms", "12.4 s", "3 min 40 s". */
export function durationLabel(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${(Math.round(ms * 10) / 10).toLocaleString("en-US")} ms`;
  if (ms < 60_000) return `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** "~1:30" for 90 seconds. */
export function reviewTimeLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `~${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "1 check", "4 checks"; also for other nouns. */
export function countLabel(n: number, noun: string, plural = `${noun}s`): string {
  return `${num(n)} ${n === 1 ? noun : plural}`;
}

export const FLOOR_NAMES: Record<FloorCode, string> = {
  GF: "Ground floor",
  "1F": "1st floor",
  "2F": "2nd floor",
  "3F": "3rd floor",
  "4F": "4th floor",
  attic: "Attic",
};

export const FEATURE_NAMES: Record<Feature, string> = {
  balcony: "Balcony",
  roof_terrace: "Roof terrace",
  renovated_bath: "Bathroom renovated",
  street: "Street side",
  courtyard: "Courtyard side",
};

/** "tenant list", "land register": a document type in running text. */
const DOCUMENT_SHORT: Record<DealDocument["type"], string> = {
  tenant_list: "tenant list",
  land_register: "land register",
  condo_land_register: "condominium land register",
  energy_certificate: "energy certificate",
  refurbishment_sheet: "refurbishment sheet",
  zoning_plan: "zoning plan",
  unknown: "document",
};

export function documentById(deal: Deal, documentId: string): DealDocument | undefined {
  return deal.documents.find((d) => d.id === documentId);
}

/** "land register p. 1". */
export function citationShort(deal: Deal, documentId: string, page: number): string {
  const doc = documentById(deal, documentId);
  return `${doc ? DOCUMENT_SHORT[doc.type] : "document"} p. ${page}`;
}

/** "Land register (Grundbuch)", or the file name of an unclassified document. */
export function documentTitle(doc: DealDocument): string {
  return doc.type === "unknown" ? doc.fileName : DOCUMENT_TYPE_LABEL[doc.type];
}

/** Multi-family house, Apartment, Hotel, Commercial: the kind of property in a facts line. */
export function propertyKind(deal: Pick<Deal, "usageType" | "scope">): string {
  if (deal.usageType === "hotel") return "Hotel";
  if (deal.usageType === "commercial") return "Commercial";
  return deal.scope === "building" ? "Multi-family house" : "Apartment";
}

/** "Multi-family", "Apartment", "Hotel", "Commercial": the short type of a queue row. */
export function queueType(deal: Pick<Deal, "usageType" | "scope">): string {
  if (deal.usageType === "hotel") return "Hotel";
  if (deal.usageType === "commercial") return "Commercial";
  return deal.scope === "building" ? "Multi-family" : "Apartment";
}

/** "2014–2019", "2016", or null without refurbishments. */
export function yearSpan(years: number[]): string | null {
  if (years.length === 0) return null;
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first}–${last}`;
}

/** "123/4" from "Gemarkung Leipzig, Flur 12, Flurstück 123/4". */
export function parcelNumber(parcel: string | null): string | null {
  const match = parcel ? /Flurstück\s+(\S+)/.exec(parcel) : null;
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Judgement calls

/** The 1-based number of each flag ("check 2"), in buildFlags order. */
export function flagNumbers(flags: Flag[]): Record<string, number> {
  return Object.fromEntries(flags.map((f, i) => [f.id, i + 1]));
}

/**
 * The shared scale of the swing bars: the largest end of any swing, rounded up to the next €10,000, so the caption reads
 * a round number (±€130k for the sample, whose largest end is +€127,765).
 */
export function swingScale(flags: Flag[]): number {
  const largest = Math.max(0, ...flags.map((f) => (f.swing ? Math.max(Math.abs(f.swing.low), Math.abs(f.swing.high)) : 0)));
  return Math.max(10_000, Math.ceil(largest / 10_000) * 10_000);
}

/** "−€111k at 3.5 %", or "±€0 · value-neutral" for an end without effect. */
export function swingEndLabel(delta: number, input: string): string {
  const k = kEur(delta, true);
  return k === "±€0" ? `±€0 · ${input}` : `${k} at ${input}`;
}

/** "3.5 % → €1.19 M (−€111k)": the input at one end of the range, the value there and the change. */
export function swingEndDetail(delta: number, input: string, exactValue: number): [where: string, change: string] {
  return [`${input} → ${millions(exactValue + delta)}`, `(${kEur(delta, true)})`];
}

/** The registry figure a flag questions (e.g. capRate for cap_rate), if any. */
export function figureOfFlag(out: PipelineOutput, flagId: string): Figure | undefined {
  return out.registry.find((f) => f.flagId === flagId);
}

/** The status words of a call: "≈ AI · medium confidence", "Accepted · KV", "Changed by KV · 3.4 %". */
export function flagStatusText(flag: Flag, status: FlagReviewStatus, out: PipelineOutput): string {
  if (status === "accepted") return `Accepted · ${VALUER_INITIALS}`;
  if (status === "changed_by_valuer") {
    const figure = figureOfFlag(out, flag.id);
    return `Changed by ${VALUER_INITIALS}${figure ? ` · ${figure.display}` : ""}`;
  }
  return `AI · ${flag.confidence} confidence`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Figures of the deal

/** Rent in use, averaged over the living area (€/m² per month): 9.60 for the sample. */
export function marketRentInUse(out: PipelineOutput): number {
  const { grossIncome, livingAreaM2 } = out.valuation;
  return livingAreaM2 > 0 ? grossIncome / 12 / livingAreaM2 : 0;
}

/** The let units' in-place rent per m² (8.92 for the sample), and their market rent per month; null without let units. */
export function inPlaceSummary(out: PipelineOutput): { perM2: number; perMonth: number; marketPerMonth: number } | null {
  let area = 0;
  let perMonth = 0;
  let marketPerMonth = 0;
  out.deal.units.forEach((u, i) => {
    if (u.inPlaceRentPerM2 === null) return;
    area += u.areaM2;
    perMonth += out.valuation.units[i]?.inPlaceRentPerMonth ?? 0;
    marketPerMonth += out.valuation.units[i]?.marketRentPerMonth ?? 0;
  });
  return area > 0 ? { perM2: perMonth / area, perMonth, marketPerMonth } : null;
}
