/**
 * Modernisation points after ImmoWertV Annex 2, simplified as in spec §5.3.5: a full measure scores its element's
 * maximum and a partial one half of it, rounded down; how long ago the measure was done is not weighted.
 */
import type { MeasureCategory } from "@/lib/deal/types";

/** Annex 2 maximum points per modernisation element (20 in total). */
export const ANNEX2_MAX_POINTS: Record<MeasureCategory, number> = {
  roof: 4,
  windows: 2,
  pipes: 2,
  heating: 2,
  exterior_walls: 4,
  bathrooms: 2,
  interior: 2,
  floor_plan: 2,
};

export function measurePoints(category: MeasureCategory, extent: "full" | "partial"): number {
  const max = ANNEX2_MAX_POINTS[category];
  return extent === "full" ? max : Math.floor(max / 2);
}

/**
 * Σ of the measures' points, with each element capped at its Annex 2 maximum: a sheet that lists the same element
 * twice (e.g. windows front and back) cannot score it twice and so cannot inflate the remaining economic life.
 */
export function totalModernisationPoints(measures: { category: MeasureCategory; points: number }[]): number {
  const byElement = new Map<MeasureCategory, number>();
  for (const m of measures) byElement.set(m.category, (byElement.get(m.category) ?? 0) + m.points);
  let total = 0;
  for (const [category, points] of byElement) total += Math.min(points, ANNEX2_MAX_POINTS[category]);
  return total;
}
