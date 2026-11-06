import { describe, expect, it } from "vitest";
import { ANNEX3 } from "@/lib/lookups/costs";
import {
  computeValuation,
  effectiveMarketRent,
  presentValueFactor,
  remainingLife,
  type ValuationInput,
  type ValuationParams,
  type ValuationUnitInput,
} from "@/lib/valuation/engine";
import { computeSensitivities, type SensitivityRanges } from "@/lib/valuation/sensitivity";

/** The 8 units of spec §5.3.3: area, in-place €/m², estimator market €/m². */
const UNITS: ValuationUnitInput[] = [
  { id: "u1", areaM2: 62, inPlaceRentPerM2: 8.4, marketRentPerM2: 9.25 },
  { id: "u2", areaM2: 68, inPlaceRentPerM2: 8.7, marketRentPerM2: 9.17 },
  { id: "u3", areaM2: 71, inPlaceRentPerM2: 9.2, marketRentPerM2: 9.61 },
  { id: "u4", areaM2: 75, inPlaceRentPerM2: 9.4, marketRentPerM2: 9.64 },
  { id: "u5", areaM2: 62, inPlaceRentPerM2: 8.6, marketRentPerM2: 9.65 },
  { id: "u6", areaM2: 68, inPlaceRentPerM2: 8.8, marketRentPerM2: 9.72 },
  { id: "u7", areaM2: 71, inPlaceRentPerM2: 9.1, marketRentPerM2: 9.71 },
  { id: "u8", areaM2: 88, inPlaceRentPerM2: 9.0, marketRentPerM2: 9.92 },
];

const V1_PARAMS: ValuationParams = {
  capRate: 0.03,
  remainingLifeYears: 42,
  underRentYears: 5,
  easementDeduction: 0,
  marketRentFactor: 1,
  marketRentOverrides: {},
};

function canonicalInput(params: Partial<ValuationParams> = {}, units: ValuationUnitInput[] = UNITS): ValuationInput {
  return {
    units: units.map((u) => ({ ...u })),
    plotM2: 480,
    landValuePerM2: 520,
    managementPerUnit: ANNEX3.managementPerUnit,
    maintenancePerM2: ANNEX3.maintenancePerM2,
    rentLossRate: ANNEX3.rentLossRate,
    vacancyMonths: ANNEX3.vacancyMonths,
    params: { ...V1_PARAMS, ...params, marketRentOverrides: { ...(params.marketRentOverrides ?? {}) } },
  };
}

/** |actual − expected| ≤ tolerance, as the plan's "within x" assertions read. */
function expectWithin(actual: number, expected: number, tolerance: number) {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

const RANGES: SensitivityRanges = {
  capRate: [0.025, 0.035],
  marketRentAvg: [9.1, 10.2],
  underRentYears: [3, 8],
  easementMax: 12480,
};

describe("presentValueFactor", () => {
  it("is the annuity factor (1 − (1+r)^−n) / r", () => {
    expect(presentValueFactor(0.03, 42)).toBeCloseTo(23.7014, 4);
    expect(presentValueFactor(0.034, 42)).toBeCloseTo(22.1897, 4);
    expect(presentValueFactor(0.03, 5)).toBeCloseTo(4.5797, 4);
  });

  it("degrades to n at a zero rate and to 0 for zero years", () => {
    expect(presentValueFactor(0, 5)).toBe(5);
    expect(presentValueFactor(0.03, 0)).toBe(0);
  });
});

describe("remainingLife", () => {
  it("gives 42 years for the 1912 building with 13 modernisation points", () => {
    expect(remainingLife(1912, 2026, 13)).toBe(42);
  });

  it("uses total life minus age when that is longer, and never exceeds total life", () => {
    expect(remainingLife(2010, 2026, 0)).toBe(64);
    expect(remainingLife(2030, 2026, 0)).toBe(80);
    expect(remainingLife(1912, 2026, 30, 70)).toBe(70);
  });

  it("is monotonic in modernisation points", () => {
    const lives = [0, 4, 8, 13, 20].map((p) => remainingLife(1912, 2026, p));
    expect(lives).toEqual([10, 20, 30, 42, 60]);
  });
});

describe("effectiveMarketRent", () => {
  it("scales the estimator rent by the factor, rounded half-up to cents", () => {
    const u = UNITS[0];
    expect(effectiveMarketRent(u, V1_PARAMS)).toBe(9.25);
    expect(effectiveMarketRent(u, { ...V1_PARAMS, marketRentFactor: 9.1 / 9.6 })).toBe(8.77);
  });

  it("prefers a per-unit override over the factor", () => {
    const p = { ...V1_PARAMS, marketRentFactor: 1.1, marketRentOverrides: { u8: 9.5 } };
    expect(effectiveMarketRent(UNITS[7], p)).toBe(9.5);
    expect(effectiveMarketRent(UNITS[0], p)).toBe(10.18);
  });
});

describe("computeValuation — canonical v1 (spec §5.3.5)", () => {
  const r = computeValuation(canonicalInput());

  it("reproduces the income and cost lines", () => {
    expectWithin(r.grossIncome, 65088, 0.01);
    expectWithin(r.operatingCosts, 12373.76, 0.01);
    expectWithin(r.netIncome, 52714.24, 0.01);
    expectWithin(r.landInterest, 7488, 0.01);
    expectWithin(r.buildingNetIncome, 45226.24, 0.01);
    expect(r.pvFactor).toBeCloseTo(23.7014, 4);
    expectWithin(r.buildingValue, 1071923.36, 1);
    expectWithin(r.inPlaceIncome, 60483.6, 0.01);
    expectWithin(r.underRentDeduction, 21086.8, 1);
  });

  it("rounds the market value and derives €/m² and the gross multiplier", () => {
    expect(r.marketValue).toBe(1300000);
    expect(r.valuePerM2).toBe(2301);
    expect(r.grossMultiplier).toBe(20.0);
  });

  it("splits the value over the units by market-rent share, rounded to €100", () => {
    expect(r.units.map((u) => u.value)).toEqual([137500, 149500, 163500, 173300, 143400, 158400, 165200, 209200]);
    expect(r.units.reduce((s, u) => s + u.value, 0)).toBe(r.marketValue);
  });

  it("exposes the intermediate lines of the spec table", () => {
    expectWithin(r.management, 2936, 0.01);
    expectWithin(r.maintenance, 8136, 0.01);
    expectWithin(r.rentLoss, 1301.76, 0.01);
    expect(r.operatingCostRatio).toBeCloseTo(0.19, 3);
    expectWithin(r.landValue, 249600, 0.01);
    expectWithin(r.preliminaryValue, 1321523.36, 1);
    expectWithin(r.underRentPerYear, 4604.4, 0.01);
    expect(r.underRentAnnuityFactor).toBeCloseTo(4.5797, 4);
    expect(r.easementDeduction).toBe(0);
    expect(r.vacancyDeduction).toBe(0);
    expectWithin(r.marketValueExact, 1300436.56, 1);
    expect(r.livingAreaM2).toBe(565);
  });

  it("reports per-unit rents, gaps and shares (fractions)", () => {
    const u1 = r.units[0];
    expect(u1.unitId).toBe("u1");
    expect(u1.marketRentPerM2).toBe(9.25);
    expectWithin(u1.marketRentPerMonth, 573.5, 0.001);
    expectWithin(u1.inPlaceRentPerMonth!, 520.8, 0.001);
    expect(u1.gapPct!).toBeCloseTo(-0.092, 3);
    expect(r.units[3].gapPct!).toBeCloseTo(-0.025, 3);
    expect(r.units.reduce((s, u) => s + u.sharePct, 0)).toBeCloseTo(1, 9);
    expectWithin(r.units.reduce((s, u) => s + u.marketRentPerMonth, 0), 5424, 0.001);
  });
});

describe("computeValuation — v2 (cap rate 3.4 %)", () => {
  const r = computeValuation(canonicalInput({ capRate: 0.034 }));

  it("reproduces the v2 column", () => {
    expectWithin(r.landInterest, 8486.4, 0.01);
    expect(r.pvFactor).toBeCloseTo(22.1897, 4);
    expectWithin(r.buildingValue, 981404.65, 1);
    expectWithin(r.underRentDeduction, 20848.12, 1);
    expect(r.marketValue).toBe(1210000);
    expect(r.valuePerM2).toBe(2142);
    expect(r.grossMultiplier).toBe(18.6);
  });

  it("assigns the €100 rounding remainder to the unit with the largest share", () => {
    expect(r.units.map((u) => u.value)).toEqual([127900, 139100, 152200, 161300, 133500, 147400, 153800, 194800]);
    expect(r.units.reduce((s, u) => s + u.value, 0)).toBe(1210000);
  });
});

describe("computeValuation — deductions and overrides", () => {
  it("handles a vacant unit: income at market rent, 6-month re-letting deduction, no under-rent gap", () => {
    const units = UNITS.map((u) => (u.id === "u8" ? { ...u, inPlaceRentPerM2: null } : u));
    const r = computeValuation(canonicalInput({}, units));
    expectWithin(r.vacancyDeduction, 872.96 * 6, 0.01);
    expectWithin(r.vacancyDeduction, 5237.76, 0.01);
    expectWithin(r.grossIncome, 65088, 0.01);
    expectWithin(r.inPlaceIncome, 4248.3 * 12, 0.01);
    expectWithin(r.underRentPerYear, (4551.04 - 4248.3) * 12, 0.01);
    expectWithin(r.underRentDeduction, (4551.04 - 4248.3) * 12 * presentValueFactor(0.03, 5), 0.01);
    expectWithin(r.marketValueExact, r.preliminaryValue - r.underRentDeduction - r.easementDeduction - r.vacancyDeduction, 1e-6);
    const u8 = r.units[7];
    expect(u8.inPlaceRentPerMonth).toBeNull();
    expect(u8.gapPct).toBeNull();
    expect(r.units.reduce((s, u) => s + u.value, 0)).toBe(r.marketValue);
  });

  it("gives a negative under-rent deduction when the units are over-rented", () => {
    const units = UNITS.map((u) => ({ ...u, inPlaceRentPerM2: u.marketRentPerM2 + 0.5 }));
    const r = computeValuation(canonicalInput({}, units));
    expect(r.underRentPerYear).toBeLessThan(0);
    expect(r.underRentDeduction).toBeLessThan(0);
  });

  it("subtracts the easement deduction one-to-one", () => {
    const base = computeValuation(canonicalInput());
    const r = computeValuation(canonicalInput({ easementDeduction: 12480 }));
    expect(r.easementDeduction).toBe(12480);
    expectWithin(r.marketValueExact, base.marketValueExact - 12480, 1e-6);
  });

  it("applies a per-unit market-rent override", () => {
    const r = computeValuation(canonicalInput({ marketRentOverrides: { u8: 9.5 } }));
    expect(r.units[7].marketRentPerM2).toBe(9.5);
    expectWithin(r.grossIncome, (5424 - 872.96 + 9.5 * 88) * 12, 0.01);
  });

  it("does not mutate its input", () => {
    const input = canonicalInput({ capRate: 0.034 });
    const snapshot = JSON.parse(JSON.stringify(input));
    computeValuation(input);
    expect(input).toEqual(snapshot);
  });
});

describe("computeSensitivities", () => {
  const input = canonicalInput();
  const sens = computeSensitivities(input, 9.6, RANGES);
  const byKey = Object.fromEntries(sens.map((s) => [s.key, s]));

  it("returns one row per input, in spec order, with low = first range value", () => {
    expect(sens.map((s) => s.key)).toEqual(["capRate", "marketRent", "underRentYears", "easement"]);
    expect(byKey.capRate.low.input).toBe(0.025);
    expect(byKey.capRate.high.input).toBe(0.035);
    expect(byKey.marketRent.low.input).toBe(9.1);
    expect(byKey.marketRent.high.input).toBe(10.2);
    expect(byKey.underRentYears.low.input).toBe(3);
    expect(byKey.underRentYears.high.input).toBe(8);
    expect(byKey.easement.low.input).toBe(-12480);
    expect(byKey.easement.high.input).toBe(0);
  });

  it("reproduces the canonical deltas (exact value − base exact value)", () => {
    expectWithin(byKey.capRate.low.delta, 127765, 1);
    expectWithin(byKey.capRate.high.delta, -111366, 1);
    expectWithin(byKey.marketRent.low.delta, -63215, 1);
    expectWithin(byKey.marketRent.high.delta, 75859, 1);
    expectWithin(byKey.underRentYears.low.delta, 8063, 1);
    expectWithin(byKey.underRentYears.high.delta, -11235, 1);
    expect(byKey.easement.low.delta).toBe(-12480);
    expect(byKey.easement.high.delta).toBe(0);
  });

  it("does not mutate the base input", () => {
    const snapshot = JSON.parse(JSON.stringify(input));
    computeSensitivities(input, 9.6, RANGES);
    expect(input).toEqual(snapshot);
  });

  it("keeps the valuer's per-unit overrides when varying the market rent", () => {
    const overridden = canonicalInput({ marketRentOverrides: { u8: 9.5 } });
    const flat = computeSensitivities(overridden, 9.6, { ...RANGES, marketRentAvg: [9.6, 9.6] });
    const rent = flat.find((s) => s.key === "marketRent")!;
    expectWithin(rent.low.delta, 0, 1e-6);
    expectWithin(rent.high.delta, 0, 1e-6);
  });
});
