import { describe, expect, it } from "vitest";
import comparablesJson from "@/lib/data/comparables.json";
import type { Unit } from "@/lib/deal/types";
import {
  adjustedRent,
  estimateBuilding,
  estimateUnitRent,
  FEATURE_ADJ,
  FLOOR_ADJ,
  locationBase,
  type Comparable,
} from "@/lib/rent/estimator";

/** The 38 bundled listings of spec §5.3.7 (the JSON types floor and features as plain strings). */
const comps = comparablesJson as Comparable[];

type RentUnit = Pick<Unit, "id" | "floor" | "areaM2" | "features">;

/** The 8 units of spec §5.3.3 with the features from the tenant list. */
const UNITS: RentUnit[] = [
  { id: "u1", floor: "GF", areaM2: 62, features: ["courtyard"] },
  { id: "u2", floor: "GF", areaM2: 68, features: ["street"] },
  { id: "u3", floor: "1F", areaM2: 71, features: ["renovated_bath"] },
  { id: "u4", floor: "1F", areaM2: 75, features: ["balcony"] },
  { id: "u5", floor: "2F", areaM2: 62, features: ["courtyard"] },
  { id: "u6", floor: "2F", areaM2: 68, features: ["balcony"] },
  { id: "u7", floor: "3F", areaM2: 71, features: ["renovated_bath"] },
  { id: "u8", floor: "attic", areaM2: 88, features: ["roof_terrace"] },
];

/** A synthetic listing for rule-level tests; recent unless monthsAgo says otherwise. */
function listing(id: string, areaM2: number, rentPerM2: number, monthsAgo = 0): Comparable {
  return { id, lat: 51.3352, lng: 12.3747, areaM2, floor: "1F", features: [], rentPerM2, monthsAgo };
}

/** A 1st-floor unit without features, so only the size adjustment applies. */
function plainUnit(areaM2: number): RentUnit {
  return { id: "x", floor: "1F", areaM2, features: [] };
}

describe("rent estimator on the sample deal (spec §5.3.3, §5.3.7)", () => {
  const summary = estimateBuilding(UNITS, comps);

  it("derives the location base 9.56 from the 38 adjusted rents", () => {
    expect(locationBase(comps)).toBe(9.56);
    expect(summary.base).toBe(9.56);
  });

  it("estimates the market rent of each of the 8 units", () => {
    const expected = [9.25, 9.17, 9.61, 9.64, 9.65, 9.72, 9.71, 9.92];
    expect(UNITS.map((u) => estimateUnitRent(u, comps).rentPerM2)).toEqual(expected);
    expect(summary.units.map((e) => e.rentPerM2)).toEqual(expected);
    expect(summary.units.map((e) => e.unitId)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
  });

  it("uses the comparables within ±15 m² and grades confidence by their count", () => {
    expect(summary.units.map((e) => e.comparableIds.length)).toEqual([9, 10, 11, 12, 9, 10, 11, 6]);
    expect(summary.units.map((e) => e.confidence)).toEqual([
      "medium",
      "medium",
      "medium",
      "high",
      "medium",
      "medium",
      "medium",
      "medium",
    ]);
    expect(summary.units[7].comparableIds).toEqual(["L05", "L10", "L18", "L19", "L22", "L38"]);
  });

  it("summarises the building: average 9.60, range 9.10–10.20, 5,424.00 € per month", () => {
    expect(Math.abs(summary.average - 9.6)).toBeLessThanOrEqual(1e-9);
    expect(summary.range).toEqual([9.1, 10.2]);
    expect(summary.total).toBe(5424);
  });

  it("counts 23 recent and 15 older listings", () => {
    expect(summary.recentCount).toBe(23);
    expect(summary.olderCount).toBe(15);
    expect(summary.olderShare).toBeCloseTo(15 / 38, 12);
  });

  it("estimates a unit added by hand: 9.56 + 0.05 + 0.075 + 0.10 = 9.79", () => {
    const e = estimateUnitRent({ id: "m1", floor: "2F", areaM2: 55, features: ["balcony"] }, comps);
    expect(e.rentPerM2).toBe(9.79);
    expect(e.unitId).toBe("m1");
    expect(e.base).toBe(9.56);
    expect(e.floorAdj).toBe(0.05);
    expect(e.sizeAdj).toBeCloseTo(0.075, 12);
    expect(e.featureAdj).toBe(0.1);
    expect(e.comparableIds).toHaveLength(13);
    expect(e.confidence).toBe("high");
  });
});

describe("rent estimator rules (spec §6.3)", () => {
  it("uses the spec's floor and feature adjustments", () => {
    expect(FLOOR_ADJ).toEqual({ GF: -0.35, "1F": 0, "2F": 0.05, "3F": 0.1, "4F": 0.15, attic: 0.2 });
    expect(FEATURE_ADJ).toEqual({ balcony: 0.1, roof_terrace: 0.25, renovated_bath: 0.05, street: -0.05, courtyard: 0 });
  });

  it("index-adjusts only listings older than 12 months, by 2.5 % a year", () => {
    expect(adjustedRent(listing("a", 70, 9.57, 12))).toBe(9.57);
    expect(adjustedRent(listing("b", 70, 9.25, 13))).toBeCloseTo(9.25 * (1 + (0.025 * 13) / 12), 12);
    expect(adjustedRent(listing("c", 70, 10, 24))).toBeCloseTo(10.5, 12);
  });

  it("matches the spec's 4th and 35th smallest adjusted rents for the bundled data", () => {
    const sorted = comps.map(adjustedRent).sort((a, b) => a - b);
    expect(sorted[3]).toBe(9.06);
    expect(sorted[34]).toBe(10.16);
  });

  it("takes the middle value for an odd count and the mean of the two middle values for an even count", () => {
    expect(locationBase([listing("a", 70, 11), listing("b", 70, 9), listing("c", 70, 10)])).toBe(10);
    expect(
      locationBase([listing("a", 70, 13), listing("b", 70, 9), listing("c", 70, 11), listing("d", 70, 10)]),
    ).toBe(10.5);
  });

  it("refuses to estimate without comparables", () => {
    expect(() => locationBase([])).toThrow();
    expect(() => estimateBuilding(UNITS, [])).toThrow();
  });

  it("adjusts size by −0.005 €/m² per m² above 70 m²", () => {
    expect(estimateUnitRent(plainUnit(70), comps).sizeAdj).toBe(0);
    expect(estimateUnitRent(plainUnit(90), comps).sizeAdj).toBeCloseTo(-0.1, 12);
    expect(estimateUnitRent(plainUnit(50), comps).sizeAdj).toBeCloseTo(0.1, 12);
  });

  it("grades confidence: 12 or more high, 6 to 11 medium, fewer than 6 low", () => {
    const pool = (n: number) => Array.from({ length: n }, (_, i) => listing(`c${i}`, 70, 9.5));
    expect(estimateUnitRent(plainUnit(70), pool(5)).confidence).toBe("low");
    expect(estimateUnitRent(plainUnit(70), pool(6)).confidence).toBe("medium");
    expect(estimateUnitRent(plainUnit(70), pool(11)).confidence).toBe("medium");
    expect(estimateUnitRent(plainUnit(70), pool(12)).confidence).toBe("high");
  });

  it("includes comparables exactly 15 m² away, also for decimal areas", () => {
    const pool = [listing("in-low", 55, 9), listing("out-low", 54.9, 9), listing("in-high", 85, 9), listing("out-high", 85.1, 9)];
    expect(estimateUnitRent(plainUnit(70), pool).comparableIds).toEqual(["in-low", "in-high"]);
    // 45.2 − 30.2 evaluates to 15.000000000000004 in floating point
    expect(estimateUnitRent(plainUnit(30.2), [listing("edge", 45.2, 9)]).comparableIds).toEqual(["edge"]);
  });

  it("uses a given location base instead of recomputing it", () => {
    const e = estimateUnitRent(plainUnit(70), comps, 10);
    expect(e.base).toBe(10);
    expect(e.rentPerM2).toBe(10);
  });

  it("counts a repeated feature once", () => {
    const e = estimateUnitRent({ id: "x", floor: "1F", areaM2: 70, features: ["balcony", "balcony"] }, comps);
    expect(e.featureAdj).toBe(0.1);
    expect(e.rentPerM2).toBe(9.66);
  });

  it("falls back to the location base when the building has no area", () => {
    const s = estimateBuilding([], comps);
    expect(s.units).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.average).toBe(9.56);
    expect(s.range).toEqual([9.06, 10.16]);
  });
});
