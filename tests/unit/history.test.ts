import { describe, expect, it } from "vitest";
import { ANNEX3 } from "@/lib/lookups/costs";
import {
  computeValuation,
  type ValuationParams,
  type ValuationResult,
  type ValuationUnitInput,
} from "@/lib/valuation/engine";
import {
  addRevision,
  applyChanges,
  currentVersion,
  diffResults,
  initialHistory,
  previousVersion,
  undoLast,
  type History,
  type ParamChange,
  type ParamKey,
  type Version,
} from "@/lib/revisions/history";

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

/** The rent estimator's building average for the sample (spec §5.3.3). */
const BASE_AVG_RENT = 9.6;

/** v1, the AI draft (spec §5.3.5). */
const V1_PARAMS: ValuationParams = {
  capRate: 0.03,
  remainingLifeYears: 42,
  underRentYears: 5,
  easementDeduction: 0,
  marketRentFactor: 1,
  marketRentOverrides: {},
};

function valuationFor(params: ValuationParams): ValuationResult {
  return computeValuation({
    units: UNITS.map((u) => ({ ...u })),
    plotM2: 480,
    landValuePerM2: 520,
    managementPerUnit: ANNEX3.managementPerUnit,
    maintenancePerM2: ANNEX3.maintenancePerM2,
    rentLossRate: ANNEX3.rentLossRate,
    vacancyMonths: ANNEX3.vacancyMonths,
    params,
  });
}

/** |actual − expected| ≤ tolerance, as the plan's "within x" assertions read. */
function expectWithin(actual: number, expected: number, tolerance: number) {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

const REHEARSED_NOTE =
  "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";

const CAP_RATE_CHANGE: ParamChange = {
  parameter: "capRate",
  from: 0.03,
  to: 0.034,
  reason: "Committee range 3.25–3.75 % for pre-war multi-family houses in this district",
  sourceKind: "valuer_judgement",
};

const ATTIC_CHANGE: ParamChange = {
  parameter: "marketRentUnit",
  unitId: "u8",
  from: 9.92,
  to: 9.5,
  reason: "The valuer considers the attic overpriced",
  sourceKind: "valuer_judgement",
};

function change(parameter: ParamKey, from: number, to: number): ParamChange {
  return { parameter, from, to, reason: "Valuer judgement", sourceKind: "valuer_judgement" };
}

/** A revision as the review screen records it: the changes applied to the current version's params. */
function revision(
  base: ValuationParams,
  changes: ParamChange[],
  note: string,
  flagId: string | null,
  createdAt: string,
): Omit<Version, "n" | "undone"> {
  return {
    params: applyChanges(base, changes, BASE_AVG_RENT),
    note,
    flagId,
    changes,
    explanation: "I changed the value as you asked.",
    aiMode: "demo",
    createdAt,
    durationMs: 1200,
  };
}

const T1 = "2026-11-06T09:00:00.000Z";
const T2 = "2026-11-06T09:05:00.000Z";
const T3 = "2026-11-06T09:07:00.000Z";
const T4 = "2026-11-06T09:09:00.000Z";

/** v1 (AI draft) → v2 (cap rate 3.4 %, from the cap-rate flag) → v3 (attic rent 9.50, general note). */
function threeVersions(): History {
  const h1 = initialHistory(V1_PARAMS, T1);
  const h2 = addRevision(h1, revision(currentVersion(h1).params, [CAP_RATE_CHANGE], REHEARSED_NOTE, "cap_rate", T2));
  return addRevision(h2, revision(currentVersion(h2).params, [ATTIC_CHANGE], "attic rent 9,50", null, T3));
}

describe("initialHistory", () => {
  it("holds the AI draft as the only, active version v1", () => {
    const h = initialHistory(V1_PARAMS, T1);
    expect(h.versions).toEqual([
      {
        n: 1,
        params: V1_PARAMS,
        note: null,
        flagId: null,
        changes: [],
        explanation: null,
        aiMode: null,
        createdAt: T1,
        durationMs: null,
        undone: false,
      },
    ]);
    expect(currentVersion(h)).toBe(h.versions[0]);
    expect(previousVersion(h)).toBeNull();
  });

  it("keeps its own copy of the parameters and changes in every version", () => {
    const params: ValuationParams = { ...V1_PARAMS, marketRentOverrides: {} };
    const h1 = initialHistory(params, T1);
    const nextParams: ValuationParams = { ...V1_PARAMS, capRate: 0.034, marketRentOverrides: {} };
    const changes: ParamChange[] = [{ ...CAP_RATE_CHANGE }];
    const h2 = addRevision(h1, { ...revision(V1_PARAMS, [], "note", null, T2), params: nextParams, changes });
    params.capRate = 0.05;
    params.marketRentOverrides.u8 = 9.5;
    nextParams.capRate = 0.05;
    nextParams.marketRentOverrides.u8 = 9.5;
    changes[0].to = 0.05;
    changes.push(ATTIC_CHANGE);
    expect(h2.versions[0].params).toEqual(V1_PARAMS);
    expect(h2.versions[1].params).toEqual({ ...V1_PARAMS, capRate: 0.034 });
    expect(h2.versions[1].changes).toEqual([CAP_RATE_CHANGE]);
  });
});

describe("currentVersion", () => {
  it("throws when no version is active (a corrupt history)", () => {
    expect(() => currentVersion({ versions: [] })).toThrow();
  });
});

describe("applyChanges", () => {
  it("maps the cap rate one-to-one", () => {
    expect(applyChanges(V1_PARAMS, [CAP_RATE_CHANGE], BASE_AVG_RENT)).toEqual({ ...V1_PARAMS, capRate: 0.034 });
  });

  it("turns an average market rent into a factor on the estimator's average, keeping per-unit overrides", () => {
    const base: ValuationParams = { ...V1_PARAMS, marketRentOverrides: { u8: 9.5 } };
    const p = applyChanges(base, [change("marketRentAvg", 9.6, 9.1)], BASE_AVG_RENT);
    expect(p.marketRentFactor).toBeCloseTo(0.9479166667, 10); // 9.10 / 9.60
    expect({ ...p, marketRentFactor: 1 }).toEqual(base);
  });

  it("sets a per-unit override and keeps the other overrides", () => {
    const base: ValuationParams = { ...V1_PARAMS, marketRentOverrides: { u1: 9 } };
    const p = applyChanges(base, [ATTIC_CHANGE], BASE_AVG_RENT);
    expect(p).toEqual({ ...V1_PARAMS, marketRentOverrides: { u1: 9, u8: 9.5 } });
  });

  it("maps under-rent years, easement deduction and remaining life one-to-one, applying every change", () => {
    const p = applyChanges(
      V1_PARAMS,
      [change("underRentYears", 5, 8), change("easementDeduction", 0, 12480), change("remainingLifeYears", 42, 45)],
      BASE_AVG_RENT,
    );
    expect(p).toEqual({ ...V1_PARAMS, underRentYears: 8, easementDeduction: 12480, remainingLifeYears: 45 });
  });

  it("leaves the given parameters untouched", () => {
    const base: ValuationParams = { ...V1_PARAMS, marketRentOverrides: { u1: 9 } };
    const snapshot = JSON.parse(JSON.stringify(base));
    applyChanges(base, [ATTIC_CHANGE, CAP_RATE_CHANGE], BASE_AVG_RENT);
    expect(base).toEqual(snapshot);
  });

  it("rejects a change it cannot apply instead of storing a broken version", () => {
    expect(() => applyChanges(V1_PARAMS, [{ ...ATTIC_CHANGE, unitId: undefined }], BASE_AVG_RENT)).toThrow();
    expect(() => applyChanges(V1_PARAMS, [change("marketRentAvg", 9.6, 9.1)], 0)).toThrow();
    expect(() => applyChanges(V1_PARAMS, [change("capRate", 0.03, Number.NaN)], BASE_AVG_RENT)).toThrow();
  });
});

describe("addRevision and previousVersion", () => {
  it("numbers the versions, records the note and builds each one on the current version", () => {
    const h = threeVersions();
    expect(h.versions.map((v) => v.n)).toEqual([1, 2, 3]);
    expect(h.versions.map((v) => v.undone)).toEqual([false, false, false]);
    expect(h.versions[1]).toMatchObject({
      note: REHEARSED_NOTE,
      flagId: "cap_rate",
      changes: [CAP_RATE_CHANGE],
      explanation: "I changed the value as you asked.",
      aiMode: "demo",
      createdAt: T2,
      durationMs: 1200,
    });
    // Revisions are cumulative: v3 keeps v2's cap rate.
    expect(currentVersion(h).n).toBe(3);
    expect(currentVersion(h).params).toEqual({ ...V1_PARAMS, capRate: 0.034, marketRentOverrides: { u8: 9.5 } });
    expect(previousVersion(h)?.n).toBe(2);
  });

  it("gives a revision after an undo the next number and skips the undone version as previous", () => {
    const undone = undoLast(threeVersions());
    const h = addRevision(
      undone,
      revision(currentVersion(undone).params, [change("underRentYears", 5, 8)], "Under-rent will close in 8 years", "under_rent", T4),
    );
    expect(h.versions.map((v) => v.n)).toEqual([1, 2, 3, 4]);
    expect(h.versions.map((v) => v.undone)).toEqual([false, false, true, false]);
    expect(currentVersion(h).n).toBe(4);
    expect(previousVersion(h)?.n).toBe(2);
    // v4 builds on v2: the undone attic override is gone.
    expect(currentVersion(h).params).toEqual({ ...V1_PARAMS, capRate: 0.034, underRentYears: 8 });
  });
});

describe("undoLast (undo after two revisions)", () => {
  const h3 = threeVersions();
  const afterOne = undoLast(h3);
  const afterTwo = undoLast(afterOne);
  const afterThree = undoLast(afterTwo);

  it("marks only v3 undone, and v2 becomes current", () => {
    expect(afterOne.versions.map((v) => v.undone)).toEqual([false, false, true]);
    expect(currentVersion(afterOne).n).toBe(2);
    expect(previousVersion(afterOne)?.n).toBe(1);
  });

  it("returns the value to the previous version", () => {
    expect(valuationFor(currentVersion(h3).params).marketValue).toBe(1200000);
    expect(valuationFor(currentVersion(afterOne).params).marketValue).toBe(1210000);
    expect(valuationFor(currentVersion(afterTwo).params).marketValue).toBe(1300000);
  });

  it("marks v2 undone on a second undo, and v1 becomes current", () => {
    expect(afterTwo.versions.map((v) => v.undone)).toEqual([false, true, true]);
    expect(currentVersion(afterTwo).n).toBe(1);
    expect(previousVersion(afterTwo)).toBeNull();
  });

  it("does nothing on a third undo: v1, the AI draft, cannot be undone", () => {
    expect(afterThree).toBe(afterTwo);
    expect(currentVersion(afterThree).n).toBe(1);
    const fresh = initialHistory(V1_PARAMS, T1);
    expect(undoLast(fresh)).toBe(fresh);
  });

  it("keeps every version in the log, including the undone ones", () => {
    expect(afterThree.versions.map((v) => v.n)).toEqual([1, 2, 3]);
    expect(afterThree.versions[1]).toMatchObject({ note: REHEARSED_NOTE, changes: [CAP_RATE_CHANGE], undone: true });
    expect(afterThree.versions[2]).toMatchObject({ note: "attic rent 9,50", changes: [ATTIC_CHANGE], undone: true });
  });

  it("does not change the history it is given", () => {
    const h = threeVersions();
    const snapshot = JSON.parse(JSON.stringify(h));
    undoLast(h);
    expect(h).toEqual(snapshot);
  });
});

describe("diffResults", () => {
  const v1R = valuationFor(V1_PARAMS);
  const v2P = applyChanges(V1_PARAMS, [CAP_RATE_CHANGE], BASE_AVG_RENT);
  const v2R = valuationFor(v2P);

  it("v1 → v2 (cap rate 3.4 %) lists the cap rate and the figures it moves, in table order", () => {
    const rows = diffResults(V1_PARAMS, v1R, v2P, v2R);
    expect(rows.map((r) => r.key)).toEqual([
      "capRate",
      "landInterest",
      "pvFactor",
      "buildingValue",
      "underRentDeduction",
      "marketValue",
    ]);
    const to = Object.fromEntries(rows.map((r) => [r.key, r.to]));
    expect(to.capRate).toBe(0.034);
    expect(to.landInterest).toBeCloseTo(8486.4, 6); // 249,600 × 0.034, exact up to float noise
    expect(to.pvFactor).toBeCloseTo(22.1897, 4);
    expectWithin(to.buildingValue, 981404.65, 1);
    expectWithin(to.underRentDeduction, 20848.12, 1);
    expect(to.marketValue).toBe(1210000);
  });

  it("labels and formats each row and carries the previous version's values as `from`", () => {
    const rows = diffResults(V1_PARAMS, v1R, v2P, v2R);
    expect(rows.map((r) => [r.label, r.format])).toEqual([
      ["Cap rate", "pct"],
      ["Land-value interest", "eur"],
      ["Present-value factor", "factor"],
      ["Building value", "eur"],
      ["Under-rent deduction", "eur"],
      ["Market value", "eur"],
    ]);
    const from = Object.fromEntries(rows.map((r) => [r.key, r.from]));
    expect(from.capRate).toBe(0.03);
    expect(from.landInterest).toBeCloseTo(7488, 6);
    expect(from.pvFactor).toBeCloseTo(23.7014, 4);
    expectWithin(from.buildingValue, 1071923.36, 1);
    expectWithin(from.underRentDeduction, 21086.8, 1);
    expect(from.marketValue).toBe(1300000);
  });

  it("shows a unit's rent change as the building-average market rent (v2 → v3, attic 9.50)", () => {
    const v3P = applyChanges(v2P, [ATTIC_CHANGE], BASE_AVG_RENT);
    const rows = diffResults(v2P, v2R, v3P, valuationFor(v3P));
    expect(rows.map((r) => r.key)).toEqual(["marketRentAvg", "buildingValue", "underRentDeduction", "marketValue"]);
    expect(rows[0]).toMatchObject({ label: "Market rent (avg.)", format: "eurPerM2" });
    expect(rows[0].from).toBeCloseTo(9.6, 9); // 5,424.00 €/month over 565 m²
    expect(rows[0].to).toBeCloseTo(9.534584, 6); // 5,387.04 €/month over 565 m²
    expectWithin(rows[1].to, 971759.88, 1);
    expectWithin(rows[2].to, 18839.92, 1);
    expect(rows[3]).toMatchObject({ from: 1210000, to: 1200000 });
  });

  it("lists under-rent closing, easement deduction and remaining life before the figures they move", () => {
    const p = applyChanges(
      V1_PARAMS,
      [change("underRentYears", 5, 8), change("easementDeduction", 0, 12480), change("remainingLifeYears", 42, 45)],
      BASE_AVG_RENT,
    );
    const rows = diffResults(V1_PARAMS, v1R, p, valuationFor(p));
    expect(rows.map((r) => [r.key, r.label, r.format])).toEqual([
      ["underRentYears", "Under-rent closing", "years"],
      ["easementDeduction", "Easement deduction", "eur"],
      ["remainingLifeYears", "Remaining life", "years"],
      ["pvFactor", "Present-value factor", "factor"],
      ["buildingValue", "Building value", "eur"],
      ["underRentDeduction", "Under-rent deduction", "eur"],
      ["marketValue", "Market value", "eur"],
    ]);
    expect(rows.slice(0, 3).map((r) => [r.from, r.to])).toEqual([
      [5, 8],
      [0, 12480],
      [42, 45],
    ]);
    expect(rows[3].to).toBeCloseTo(24.5187, 4);
    expectWithin(rows[4].to, 1108889.18, 1);
    expectWithin(rows[5].to, 32321.47, 1);
    expect(rows[6]).toMatchObject({ from: 1300000, to: 1310000 });
  });

  it("omits the market value when its rounded value does not move", () => {
    // €1,300,436.56 − €3,000 still rounds to €1,300,000.
    const p = applyChanges(V1_PARAMS, [change("easementDeduction", 0, 3000)], BASE_AVG_RENT);
    const rows = diffResults(V1_PARAMS, v1R, p, valuationFor(p));
    expect(rows).toEqual([{ key: "easementDeduction", label: "Easement deduction", from: 0, to: 3000, format: "eur" }]);
  });

  it("returns no rows when nothing changed", () => {
    const same: ValuationParams = { ...V1_PARAMS, marketRentOverrides: {} };
    expect(diffResults(V1_PARAMS, v1R, same, valuationFor(same))).toEqual([]);
  });
});
