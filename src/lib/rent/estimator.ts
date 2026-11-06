/**
 * Comparables-based market-rent estimator (spec §6.3). Deterministic, no AI call, and it works for any unit,
 * including one added by hand. Rents are €/m² per month; unit estimates are rounded half-up with round2.
 */
import type { Confidence, Feature, FloorCode, Unit } from "@/lib/deal/types";
import { round2 } from "@/lib/format";

/** One bundled listing (spec §5.3.7). */
export interface Comparable {
  id: string;
  lat: number;
  lng: number;
  areaM2: number;
  floor: FloorCode;
  features: Feature[];
  /** raw asking rent, €/m² per month */
  rentPerM2: number;
  monthsAgo: number;
}

export interface RentEstimate {
  unitId: string;
  /** round2(base + floorAdj + sizeAdj + featureAdj) */
  rentPerM2: number;
  /** the location base L the estimate starts from */
  base: number;
  floorAdj: number;
  sizeAdj: number;
  featureAdj: number;
  /** listings within ±15 m² of the unit's area, in comparables order */
  comparableIds: string[];
  confidence: Confidence;
}

export interface BuildingRentSummary {
  /** location base L: median of the adjusted rents */
  base: number;
  /** area-weighted mean of the unit estimates (unrounded) */
  average: number;
  /** plausible range of the average, rounded with round2 */
  range: [number, number];
  /** Σ estimate × area: the building's market rent per month, rounded with round2 */
  total: number;
  /** listings at most 12 months old */
  recentCount: number;
  /** listings older than 12 months, which are index-adjusted */
  olderCount: number;
  /** olderCount / number of listings, as a fraction */
  olderShare: number;
  units: RentEstimate[];
}

type EstimatorUnit = Pick<Unit, "id" | "floor" | "areaM2" | "features">;

export const FLOOR_ADJ: Record<FloorCode, number> = { GF: -0.35, "1F": 0, "2F": 0.05, "3F": 0.1, "4F": 0.15, attic: 0.2 };

export const FEATURE_ADJ: Record<Feature, number> = {
  balcony: 0.1,
  roof_terrace: 0.25,
  renovated_bath: 0.05,
  street: -0.05,
  courtyard: 0,
};

/** Listings older than 12 months are index-adjusted and count as older listings. */
function isOlderListing(c: Comparable): boolean {
  return c.monthsAgo > 12;
}

/** Index-adjusted rent: `rentPerM2 × (1 + 0.025 × monthsAgo / 12)` if older than 12 months, otherwise `rentPerM2`. */
export function adjustedRent(c: Comparable): number {
  return isOlderListing(c) ? c.rentPerM2 * (1 + (0.025 * c.monthsAgo) / 12) : c.rentPerM2;
}

function sortedAdjustedRents(comps: Comparable[]): number[] {
  return comps.map(adjustedRent).sort((a, b) => a - b);
}

function medianOfSorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) throw new Error("The rent estimator needs at least one comparable.");
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Nearest-rank percentile of an ascending list: the value at 1-based rank ⌈p·n/100⌉ (p10 → 4th, p90 → 35th of 38). */
function nearestRank(sorted: number[], p: number): number {
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p * sorted.length) / 100)));
  return sorted[rank - 1];
}

/** Location base L: the median of the adjusted rents (mean of the two middle values for an even count). */
export function locationBase(comps: Comparable[]): number {
  return medianOfSorted(sortedAdjustedRents(comps));
}

function confidenceFor(comparableCount: number): Confidence {
  if (comparableCount >= 12) return "high";
  if (comparableCount >= 6) return "medium";
  return "low";
}

/** `round2(L + floorAdj + sizeAdj + featureAdj)`, with the comparables within ±15 m² deciding the confidence. */
export function estimateUnitRent(u: EstimatorUnit, comps: Comparable[], base: number = locationBase(comps)): RentEstimate {
  const floorAdj = FLOOR_ADJ[u.floor];
  // −0.005 × (m² − 70), written mirrored so that exactly 70 m² gives 0 rather than −0.
  const sizeAdj = 0.005 * (70 - u.areaM2);
  // Features are a set: a feature listed twice still counts once.
  const featureAdj = Array.from(new Set(u.features)).reduce((sum, f) => sum + FEATURE_ADJ[f], 0);
  // ±15 m² inclusive; the tolerance keeps decimal areas exactly 15 m² apart inside (45.2 − 30.2 = 15.000000000000004).
  const comparableIds = comps.filter((c) => Math.abs(c.areaM2 - u.areaM2) <= 15 + 1e-9).map((c) => c.id);
  return {
    unitId: u.id,
    rentPerM2: round2(base + floorAdj + sizeAdj + featureAdj),
    base,
    floorAdj,
    sizeAdj,
    featureAdj,
    comparableIds,
    confidence: confidenceFor(comparableIds.length),
  };
}

/**
 * Estimates every unit and the building figures: the area-weighted average and its plausible range
 * `[round2(avg − (L − p10)), round2(avg + (p90 − L))]`, with p10/p90 the nearest-rank adjusted rents.
 */
export function estimateBuilding(units: EstimatorUnit[], comps: Comparable[]): BuildingRentSummary {
  const sorted = sortedAdjustedRents(comps);
  const base = medianOfSorted(sorted);
  const estimates = units.map((u) => estimateUnitRent(u, comps, base));

  let rentTimesArea = 0;
  let totalArea = 0;
  for (let i = 0; i < units.length; i++) {
    rentTimesArea += estimates[i].rentPerM2 * units[i].areaM2;
    totalArea += units[i].areaM2;
  }
  // A building without area (no units yet) falls back to the location base.
  const average = totalArea > 0 ? rentTimesArea / totalArea : base;

  const p10 = nearestRank(sorted, 10);
  const p90 = nearestRank(sorted, 90);
  const olderCount = comps.filter(isOlderListing).length;

  return {
    base,
    average,
    range: [round2(average - (base - p10)), round2(average + (p90 - base))],
    total: round2(rentTimesArea),
    recentCount: comps.length - olderCount,
    olderCount,
    olderShare: olderCount / comps.length,
    units: estimates,
  };
}
