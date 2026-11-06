/**
 * Task 12: the deterministic pipeline (spec §5.3, §6.3), the seeded sample world and the persisted demo store
 * (plan Review Focus 3 and 4).
 *
 * The store tests run under Node: `window` and `localStorage` are stubbed with an in-memory Storage, and each test
 * loads a fresh copy of the store (`vi.resetModules`), so loading it again over the same storage is a browser reload.
 * Without `indexedDB`, files.ts keeps files in memory.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import comparablesJson from "@/lib/data/comparables.json";
import { DELIVERED_ROW, QUEUE_ROWS, SAMPLE_PHOTOS, SAMPLE_SKELETON, seededDeal } from "@/lib/data/seed";
import { dealFromExtractions } from "@/lib/deal/fromExtraction";
import type { Deal, DealDocument, Unit } from "@/lib/deal/types";
import { buildFlags, type FlagContext } from "@/lib/flags/rules";
import { lookupLandValue } from "@/lib/lookups/boris";
import { ANNEX3 } from "@/lib/lookups/costs";
import { lookupCapRate } from "@/lib/lookups/marketReport";
import {
  buildRunLog,
  flagsChangedByValuer,
  initialParams,
  runCurrentVersion,
  runPipeline,
  runVersion,
  valuerChangesOf,
  type PipelineOutput,
} from "@/lib/pipeline/run";
import { buildRegistry, countBySource, type Figure } from "@/lib/registry/registry";
import { estimateBuilding, type Comparable } from "@/lib/rent/estimator";
import { buildRevalueContext } from "@/lib/revalue/schema";
import {
  addRevision,
  applyChanges,
  currentVersion,
  initialHistory,
  undoLast,
  type History,
  type ParamChange,
} from "@/lib/revisions/history";
import {
  computeValuation,
  remainingLife,
  type ValuationInput,
  type ValuationParams,
} from "@/lib/valuation/engine";
import { computeSensitivities } from "@/lib/valuation/sensitivity";
import { TEST_SKELETON, sampleDocument, sampleInputs, SAMPLE_EXTRACTIONS } from "./fixtures/sampleExtractions";

const comps = comparablesJson as Comparable[];
const SEED_ID = "CEN-2026-0147";

const V1_PARAMS: ValuationParams = {
  capRate: 0.03,
  remainingLifeYears: 42,
  underRentYears: 5,
  easementDeduction: 0,
  marketRentFactor: 1,
  marketRentOverrides: {},
};

const CANONICAL_FLAGS = ["cap_rate", "market_rent", "under_rent", "easement-1"];

/** Registry counts of plan Task 7. */
const CANONICAL_COUNTS = {
  client_document: 9,
  public_data: 3,
  regulation: 5,
  ai_estimate: 4,
  calculated: 10,
  client_input: 0,
  valuer: 0,
};

function fig(out: PipelineOutput, id: string): Figure {
  const found = out.registry.find((f) => f.id === id);
  if (!found) throw new Error(`No figure ${id}`);
  return found;
}

function flagIds(out: PipelineOutput): string[] {
  return out.flags.map((f) => f.id);
}

function sumOfShares(out: PipelineOutput): number {
  return out.valuation.units.reduce((sum, u) => sum + u.value, 0);
}

function withUnit(deal: Deal, id: string, patch: Partial<Unit>): Deal {
  return { ...deal, units: deal.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
}

function manualUnit(patch: Partial<Unit> = {}): Unit {
  return {
    id: "m1",
    label: "",
    floor: "2F",
    areaM2: 55,
    rooms: 2,
    inPlaceRentPerM2: null,
    leaseSinceYear: null,
    features: ["balcony"],
    photoIds: [],
    origin: "manual",
    clientEdited: [],
    source: null,
    ...patch,
  };
}

/** The flag context exactly as tests/unit/flags.test.ts `contextFor` builds it (Tasks 2–7). */
function handBuiltContext(deal: Deal): FlagContext {
  const rent = estimateBuilding(deal.units, comps);
  const builtYear = deal.property.builtYear ?? 1912;
  const capRate = lookupCapRate(builtYear);
  const land = lookupLandValue(deal.address.zip);
  const params: ValuationParams = {
    capRate: capRate.row.median,
    remainingLifeYears: remainingLife(builtYear, 2026, deal.property.modernisationPoints),
    underRentYears: 5,
    easementDeduction: 0,
    marketRentFactor: 1,
    marketRentOverrides: {},
  };
  const estimates = new Map(rent.units.map((e) => [e.unitId, e.rentPerM2]));
  const input: ValuationInput = {
    units: deal.units.map((u) => ({
      id: u.id,
      areaM2: u.areaM2,
      inPlaceRentPerM2: u.inPlaceRentPerM2,
      marketRentPerM2: estimates.get(u.id)!,
    })),
    plotM2: deal.property.plotM2 ?? 0,
    landValuePerM2: land.valuePerM2,
    managementPerUnit: ANNEX3.managementPerUnit,
    maintenancePerM2: ANNEX3.maintenancePerM2,
    rentLossRate: ANNEX3.rentLossRate,
    vacancyMonths: ANNEX3.vacancyMonths,
    params,
  };
  const valuation = computeValuation(input);
  const sensitivities = computeSensitivities(input, rent.average, {
    capRate: capRate.row.range,
    marketRentAvg: rent.range,
    underRentYears: [3, 8],
    easementMax: 0.05 * valuation.landValue,
  });
  return { deal, valuation, rent, capRate, land, sensitivities, params };
}

/** A revision as the review screen adds it after a note (Task 17). */
function revise(h: History, deal: Deal, changes: ParamChange[], flagId: string | null, note: string): History {
  const out = runCurrentVersion(deal, h);
  return addRevision(h, {
    params: applyChanges(currentVersion(h).params, changes, out.rent.average),
    note,
    flagId,
    changes,
    explanation: "Test revision.",
    aiMode: "demo",
    createdAt: "2026-11-06T10:00:00.000Z",
    durationMs: 12,
  });
}

const CAP_RATE_34: ParamChange = {
  parameter: "capRate",
  from: 0.03,
  to: 0.034,
  reason: "Valuer judgement",
  sourceKind: "valuer_judgement",
};

const ATTIC_950: ParamChange = {
  parameter: "marketRentUnit",
  unitId: "u8",
  from: 9.92,
  to: 9.5,
  reason: "Valuer judgement",
  sourceKind: "valuer_judgement",
};

// ---------------------------------------------------------------------------------------------------------------------
// Pipeline

describe("initialParams", () => {
  it("proposes the committee median, the modernisation-based remaining life, 5 years under-rent and no deduction", () => {
    const deal = seededDeal();
    expect(initialParams(deal, lookupCapRate(1912))).toEqual(V1_PARAMS);
  });

  it("treats an unknown year of construction as pre-war and credits only the modernisation points", () => {
    const deal = seededDeal();
    const unknown: Deal = { ...deal, property: { ...deal.property, builtYear: null, builtYearSource: null } };
    expect(initialParams(unknown, lookupCapRate(1948)).remainingLifeYears).toBe(42);
    const unmodernised: Deal = { ...unknown, property: { ...unknown.property, modernisationPoints: 0 } };
    expect(initialParams(unmodernised, lookupCapRate(1948)).remainingLifeYears).toBe(10);
  });
});

describe("runPipeline on the seeded deal (spec §5.3)", () => {
  const deal = seededDeal();
  const out = runPipeline(deal);

  it("values the sample at €1,300,000 with the 4 canonical judgement calls", () => {
    expect(out.valuation.marketValue).toBe(1300000);
    expect(out.valuation.valuePerM2).toBe(2301);
    expect(out.valuation.grossMultiplier).toBe(20);
    expect(out.valuation.units.map((u) => u.value)).toEqual([
      137500, 149500, 163500, 173300, 143400, 158400, 165200, 209200,
    ]);
    expect(flagIds(out)).toEqual(CANONICAL_FLAGS);
  });

  it("passes all 6 cross-checks", () => {
    expect(out.crossChecks).toHaveLength(6);
    expect(out.crossChecks.filter((c) => !c.passed)).toEqual([]);
  });

  it("registers the canonical figures per source type (plan Task 7)", () => {
    expect(countBySource(out.registry)).toEqual(CANONICAL_COUNTS);
    expect(fig(out, "marketValue").display).toBe("€1,300,000");
  });

  it("starts from the v1 parameters and the sample lookups", () => {
    expect(out.params).toEqual(V1_PARAMS);
    expect(out.land).toEqual(lookupLandValue("04109"));
    expect(out.capRate.row.key).toBe("mfh_pre1949");
    expect(out.rent.average).toBeCloseTo(9.6, 9);
    expect(out.input.units.map((u) => u.marketRentPerM2)).toEqual([9.25, 9.17, 9.61, 9.64, 9.65, 9.72, 9.71, 9.92]);
    expect(out.input).toMatchObject({
      plotM2: 480,
      landValuePerM2: 520,
      managementPerUnit: 367,
      maintenancePerM2: 14.4,
      rentLossRate: 0.02,
      vacancyMonths: 6,
    });
    expect(out.input.params).toEqual(out.params);
  });

  it("builds exactly the flag context, flags and registry of the Task 6 and 7 tests", () => {
    const ctx = handBuiltContext(deal);
    const flags = buildFlags(ctx);
    expect(out.valuation).toEqual(ctx.valuation);
    expect(out.rent).toEqual(ctx.rent);
    expect(out.sensitivities).toEqual(ctx.sensitivities);
    expect(out.params).toEqual(ctx.params);
    expect(out.flags).toEqual(flags);
    expect(out.registry).toEqual(buildRegistry({ ...ctx, flags, valuerChanged: [] }));
  });

  it("fits the Revalue note's context (Task 11)", () => {
    const ctx = buildRevalueContext(out, "cap_rate");
    expect(ctx.flagId).toBe("cap_rate");
    expect(ctx.params).toEqual(V1_PARAMS);
    expect(ctx.baseAvgRent).toBeCloseTo(9.6, 9);
    expect(ctx.units.map((u) => [u.id, u.marketRentPerM2])).toEqual([
      ["u1", 9.25],
      ["u2", 9.17],
      ["u3", 9.61],
      ["u4", 9.64],
      ["u5", 9.65],
      ["u6", 9.72],
      ["u7", 9.71],
      ["u8", 9.92],
    ]);
    expect(ctx.documents.map((d) => d.id)).toEqual(deal.documents.map((d) => d.id));
    expect(ctx.flags.map((f) => f.id)).toEqual(CANONICAL_FLAGS);
  });

  it("recomputes v2 (cap rate 3.4 %) and marks the valuer's figure", () => {
    const v2 = runPipeline(deal, { ...V1_PARAMS, capRate: 0.034 }, ["capRate"]);
    expect(v2.valuation.marketValue).toBe(1210000);
    expect(v2.valuation.units.map((u) => u.value)).toEqual([
      127900, 139100, 152200, 161300, 133500, 147400, 153800, 194800,
    ]);
    expect(fig(v2, "capRate").sourceType).toBe("valuer");
    expect(countBySource(v2.registry)).toEqual({ ...CANONICAL_COUNTS, ai_estimate: 3, valuer: 1 });
    expect(v2.flags.find((f) => f.id === "cap_rate")?.title).toBe("Cap rate 3.4 %");
  });

  it("leaves its inputs untouched and hands out its own copy of the parameters", () => {
    const fresh = seededDeal();
    const params = { ...V1_PARAMS, marketRentOverrides: { u8: 9.5 } };
    const before = structuredClone({ fresh, params });
    const result = runPipeline(fresh, params, ["marketRentUnit"]);
    expect({ fresh, params }).toEqual(before);
    result.params.marketRentOverrides.u8 = 12;
    expect(params.marketRentOverrides.u8).toBe(9.5);
  });

  it("is deterministic", () => {
    const fresh = seededDeal();
    expect(runPipeline(fresh)).toEqual(runPipeline(structuredClone(fresh)));
  });
});

describe("runPipeline after client edits in the wizard (plan Review Focus 3)", () => {
  const seed = seededDeal();
  const base = runPipeline(seed);

  it("recomputes area, value, shares, flags and texts when a unit's area is edited", () => {
    const deal = withUnit(seed, "u1", { areaM2: 70, clientEdited: ["areaM2"] });
    const out = runPipeline(deal);
    expect(out.valuation.livingAreaM2).toBe(573);
    expect(out.valuation.marketValue).not.toBe(1300000);
    expect(out.valuation.marketValue).toBe(1320000);
    expect(sumOfShares(out)).toBe(out.valuation.marketValue);
    // The estimator re-prices the edited unit: 9.56 − 0.35 (GF) + 0 (70 m²) + 0 (courtyard).
    expect(out.input.units[0]).toEqual({ id: "u1", areaM2: 70, inPlaceRentPerM2: 8.4, marketRentPerM2: 9.21 });
    expect(flagIds(out)).toEqual(CANONICAL_FLAGS);
    const average = out.valuation.grossIncome / 12 / 573;
    expect(out.flags[1].title).toBe(`Market rent ${average.toFixed(2)} €/m² (avg. of 8 units)`);
    expect(out.flags[1].title).not.toBe(base.flags[1].title);
  });

  it("marks the edited figures as client input in the registry", () => {
    const out = runPipeline(withUnit(seed, "u1", { areaM2: 70, clientEdited: ["areaM2"] }));
    expect(fig(out, "livingArea")).toMatchObject({ display: "573 m²", sourceType: "client_input" });
    // In-place rents are kept per m², so the let unit's rent changes with its area.
    expect(fig(out, "inPlaceIncome").sourceType).toBe("client_input");
    expect(fig(out, "unitsCount").sourceType).toBe("client_document");
  });

  it("flags the edit against the documents through the cross-checks", () => {
    const out = runPipeline(withUnit(seed, "u1", { areaM2: 70, clientEdited: ["areaM2"] }));
    expect(out.crossChecks.filter((c) => !c.passed).map((c) => c.id)).toEqual(["rent_total", "living_area"]);
  });

  it("recomputes in-place income and the under-rent when a unit's rent is edited", () => {
    const out = runPipeline(withUnit(seed, "u1", { inPlaceRentPerM2: 9, clientEdited: ["inPlaceRentPerM2"] }));
    expect(out.valuation.inPlaceIncome).toBeCloseTo(60930, 6);
    expect(out.valuation.underRentDeduction).toBeLessThan(base.valuation.underRentDeduction);
    expect(fig(out, "inPlaceIncome")).toMatchObject({ display: "€60,930/yr", sourceType: "client_input" });
    expect(fig(out, "livingArea").sourceType).toBe("client_document");
    expect(out.crossChecks.filter((c) => !c.passed).map((c) => c.id)).toEqual(["rent_total"]);
  });

  it("values a vacant unit added by hand at market rent, less 6 months for re-letting, and flags it twice", () => {
    const deal: Deal = { ...seed, units: [...seed.units, manualUnit()] };
    const out = runPipeline(deal);
    expect(flagIds(out)).toEqual([...CANONICAL_FLAGS, "vacancy-m1", "manual_unit-m1"]);
    // Task 4: 9.56 + 0.05 (2F) + 0.075 (55 m²) + 0.10 (balcony) = 9.79 €/m².
    expect(out.input.units[8]).toEqual({ id: "m1", areaM2: 55, inPlaceRentPerM2: null, marketRentPerM2: 9.79 });
    expect(out.valuation.vacancyDeduction).toBeCloseTo(9.79 * 55 * 6, 6);
    expect(out.valuation.livingAreaM2).toBe(620);
    expect(out.valuation.marketValue).toBe(1420000);
    expect(sumOfShares(out)).toBe(out.valuation.marketValue);
    const vacancy = out.flags.find((f) => f.id === "vacancy-m1")!;
    expect(vacancy.swing?.low).toBeCloseTo(-3230.7, 6);
    expect(out.flags.find((f) => f.id === "manual_unit-m1")!.title).toContain("9.79 €/m²");
    expect(fig(out, "unitsCount")).toMatchObject({ display: "9", sourceType: "client_input", flagId: "manual_unit-m1" });
    expect(fig(out, "livingArea")).toMatchObject({ display: "620 m²", sourceType: "client_input" });
    // The vacant unit pays no rent, so the documents' in-place rent stands.
    expect(fig(out, "inPlaceIncome").sourceType).toBe("client_document");
    expect(out.crossChecks.every((c) => c.passed)).toBe(true);
  });

  it("turns a unit marked vacant into a vacancy deduction and takes it out of the under-rent", () => {
    const out = runPipeline(withUnit(seed, "u8", { inPlaceRentPerM2: null, leaseSinceYear: null, clientEdited: ["inPlaceRentPerM2"] }));
    expect(out.valuation.vacancyDeduction).toBeCloseTo(872.96 * 6, 6);
    expect(out.valuation.inPlaceIncome).toBeCloseTo(60483.6 - 792 * 12, 6);
    expect(flagIds(out)).toContain("vacancy-u8");
    expect(fig(out, "inPlaceIncome").sourceType).toBe("client_input");
  });

  it("flags a missing document and an address outside the sample BORIS zone", () => {
    const noZoning: Deal = { ...seed, documents: seed.documents.filter((d) => d.type !== "zoning_plan") };
    expect(flagIds(runPipeline(noZoning))).toContain("missing_document-zoning_plan");
    const berlin: Deal = { ...seed, address: { ...seed.address, zip: "10115" } };
    const out = runPipeline(berlin);
    expect(flagIds(out)).toContain("land_value");
    expect(out.input.landValuePerM2).toBe(400);
  });
});

describe("buildRunLog (spec §5.3.4, steps 6–11)", () => {
  const deal = seededDeal();
  const out = runPipeline(deal);

  it("logs the lookups, estimate, scoring, engine and report draft with their results", () => {
    expect(buildRunLog(deal, out).map(({ step, label, kind, result }) => ({ step, label, kind, result }))).toEqual([
      {
        step: 6,
        label: "Look up land value (sample BORIS table)",
        kind: "lookup",
        result: "520 €/m², zone 0412, as of 01 Jan 2026",
      },
      {
        step: 7,
        label: "Look up cap rate (sample market report 2026, p. 47, table 12)",
        kind: "lookup",
        result: "2.5–3.5 % for pre-war MFH, median 3.0 %, n = 64",
      },
      { step: 8, label: "Estimate market rent", kind: "estimator", result: "9.60 €/m² average" },
      { step: 9, label: "Score modernisation", kind: "rules", result: "13 points → 42 years remaining life" },
      {
        step: 10,
        label: "Compute value, run cross-checks, flag judgement calls",
        kind: "engine",
        result: "€1,300,000; 6 of 6 cross-checks passed; 4 judgement calls flagged",
      },
      { step: 11, label: "Draft the report", kind: "engine", result: "Report draft: 31 figures, each traced to its source" },
    ]);
  });

  it("measures each step's duration", () => {
    let t = 100;
    const clock = () => (t += 1.25);
    expect(buildRunLog(deal, out, clock).map((e) => e.durationMs)).toEqual([1.25, 1.25, 1.25, 1.25, 1.25, 1.25]);
    for (const entry of buildRunLog(deal, out)) {
      expect(Number.isFinite(entry.durationMs)).toBe(true);
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("numbers the steps after the deal's documents and words the fallbacks", () => {
    const partial: Deal = {
      ...deal,
      address: { ...deal.address, zip: "10115" },
      documents: deal.documents.filter((d) => d.type !== "energy_certificate" && d.type !== "refurbishment_sheet"),
      property: { ...deal.property, builtYear: null, builtYearSource: null, refurbishments: [], modernisationPoints: 0 },
    };
    const log = buildRunLog(partial, runPipeline(partial));
    expect(log.map((e) => e.step)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(log[0].result).toBe("400 €/m², fallback: no sample data for this address");
    expect(log[1].result).toBe("2.5–3.5 % for pre-war MFH, median 3.0 %, n = 64");
    expect(log[3].result).toBe("0 points → 10 years remaining life (year of construction unknown)");
  });
});

describe("version helpers", () => {
  const deal = seededDeal();
  const v1 = initialHistory(runPipeline(deal).params, "2026-11-06T09:00:00.000Z");
  const v2 = revise(v1, deal, [CAP_RATE_34], "cap_rate", "Use 3.4 %.");
  const v3 = revise(v2, deal, [ATTIC_950], null, "attic rent 9,50");

  it("lists the parameters the valuer changed in the active revisions", () => {
    expect(valuerChangesOf(v1)).toEqual([]);
    expect(valuerChangesOf(v3)).toEqual(["capRate", "marketRentUnit"]);
    expect(valuerChangesOf(undoLast(v3))).toEqual(["capRate"]);
    expect(valuerChangesOf(v3, 2)).toEqual(["capRate"]);
  });

  it("runs the current version, so undo returns to the previous value", () => {
    expect(runCurrentVersion(deal, v1).valuation.marketValue).toBe(1300000);
    const second = runCurrentVersion(deal, v2);
    expect(second.valuation.marketValue).toBe(1210000);
    expect(fig(second, "capRate").sourceType).toBe("valuer");
    const undone = runCurrentVersion(deal, undoLast(v2));
    expect(undone.valuation.marketValue).toBe(1300000);
    expect(fig(undone, "capRate").sourceType).toBe("ai_estimate");
  });

  it("runs any version of the log", () => {
    expect(runVersion(deal, v3, 1).valuation.marketValue).toBe(1300000);
    expect(runVersion(deal, v3, 2).valuation.marketValue).toBe(1210000);
    expect(fig(runVersion(deal, v3, 2), "marketRent").sourceType).toBe("ai_estimate");
    expect(fig(runVersion(deal, v3, 3), "marketRent").sourceType).toBe("valuer");
    expect(() => runVersion(deal, v3, 9)).toThrow();
  });

  it("marks the valuer's parameters in an undone version, whichever revisions it was built on", () => {
    // v3 (attic rent) was made on v2 (cap rate); then both were undone, v3 first.
    const stacked = runVersion(deal, undoLast(undoLast(v3)), 3);
    expect(stacked.params.capRate).toBe(0.034);
    expect(fig(stacked, "capRate").sourceType).toBe("valuer");
    expect(fig(stacked, "marketRent").sourceType).toBe("valuer");
    // v3 (attic rent) was made after v2 (cap rate) had been undone, so it holds the AI's cap rate.
    const separate = runVersion(deal, undoLast(revise(undoLast(v2), deal, [ATTIC_950], null, "attic rent 9,50")), 3);
    expect(separate.params.capRate).toBe(0.03);
    expect(fig(separate, "capRate").sourceType).toBe("ai_estimate");
    expect(fig(separate, "marketRent").sourceType).toBe("valuer");
  });

  it("names the judgement calls the valuer changed", () => {
    expect(flagsChangedByValuer(runCurrentVersion(deal, v1), v1)).toEqual([]);
    expect(flagsChangedByValuer(runCurrentVersion(deal, v2), v2)).toEqual(["cap_rate"]);
    expect(flagsChangedByValuer(runCurrentVersion(deal, v3), v3)).toEqual(["cap_rate", "market_rent"]);
    const undone = undoLast(v3);
    expect(flagsChangedByValuer(runCurrentVersion(deal, undone), undone)).toEqual(["cap_rate"]);
  });

  it("counts a call as changed only when a revision changed its parameter, whichever note box sent it", () => {
    // Sent from the under-rent call, the note changed the cap rate: the under-rent call is unchanged.
    const capFromUnderRent = revise(v1, deal, [CAP_RATE_34], "under_rent", "cap rate 3.4 %");
    expect(flagsChangedByValuer(runCurrentVersion(deal, capFromUnderRent), capFromUnderRent)).toEqual(["cap_rate"]);
    // The remaining life has no call of its own.
    const life: ParamChange = { ...CAP_RATE_34, parameter: "remainingLifeYears", from: 42, to: 45 };
    const lifeFromCapRate = revise(v1, deal, [life], "cap_rate", "RND 45");
    expect(flagsChangedByValuer(runCurrentVersion(deal, lifeFromCapRate), lifeFromCapRate)).toEqual([]);
    // A unit added by hand has its own call on its market rent.
    const withManual: Deal = { ...deal, units: [...deal.units, manualUnit()] };
    const m1Rent: ParamChange = { ...ATTIC_950, unitId: "m1", from: 9.79 };
    const draft = initialHistory(runPipeline(withManual).params, "2026-11-06T09:00:00.000Z");
    const h = revise(draft, withManual, [m1Rent], null, "m1 9.50");
    expect(flagsChangedByValuer(runCurrentVersion(withManual, h), h)).toEqual(["market_rent", "manual_unit-m1"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Seed

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "extraction");

/** What the valuation reads from the documents, without quotes or wording (as in tests/unit/samples.test.ts). */
function facts(deal: Deal) {
  const p = deal.property;
  return {
    documentTypes: deal.documents.map((d) => d.type),
    units: deal.units.map((u) => ({
      id: u.id,
      floor: u.floor,
      areaM2: u.areaM2,
      rooms: u.rooms,
      inPlaceRentPerM2: u.inPlaceRentPerM2,
      leaseSinceYear: u.leaseSinceYear,
      features: [...u.features].sort(),
    })),
    tenantListTotals: [p.tenantListTotalAreaM2, p.tenantListTotalRentPerMonth],
    plotM2: p.plotM2,
    easements: p.easements.length,
    landChargesCount: p.landChargesCount,
    energyCertificate: [p.builtYear, p.heatingYear, p.energyClass, p.energyDemandKwh, p.livingAreaM2FromEnergyCert],
    measures: p.refurbishments.map((m) => [m.category, m.extent, m.year]),
    modernisationPoints: p.modernisationPoints,
    residentialAllowed: p.zoning?.residentialAllowed,
  };
}

describe("seededDeal", () => {
  const deal = seededDeal();

  it("is the sample deal, ready in the valuer queue", () => {
    expect(SAMPLE_SKELETON).toEqual(TEST_SKELETON);
    expect(deal.id).toBe(SEED_ID);
    expect(deal.status).toBe("in_review");
    expect(deal.clientName).toBe("Demo Capital GmbH");
    expect(deal.valuationDate).toBe("2026-11-06");
  });

  it("reads the five committed extraction fixtures", () => {
    const index = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "index.json"), "utf8")) as Record<
      string,
      { sha256: string; source: string }
    >;
    expect(deal.documents.map((d) => [d.id, d.fileName, d.pages, d.type])).toEqual(
      SAMPLE_EXTRACTIONS.map((s) => [s.id, s.fileName, s.pages, s.result.documentType]),
    );
    for (const doc of deal.documents) {
      const entry = index[doc.fileName];
      expect(entry, doc.fileName).toBeDefined();
      expect(doc.sha256).toBe(entry.sha256);
      expect(existsSync(path.join(FIXTURE_DIR, `${entry.sha256}.json`))).toBe(true);
      expect(doc.extractionSource).toBe(entry.source === "recorded-live" ? "cache" : "demo-fixture");
      expect(doc).toMatchObject({ status: "done", durationMs: null, uncertainFields: [], error: null });
    }
  });

  it("carries the findings of run-log steps 1–5", () => {
    expect(deal.documents.map((d) => d.findings)).toEqual([
      ["8 units, 565 m², €60,484/yr"],
      ["Plot 480 m², 1 easement; land charge ignored"],
      ["Gas, 2019, class D, 565 m²"],
      ["6 measures 2014–2019, 13 points"],
      ["Residential, no value effect"],
    ]);
  });

  it("has the facts of the Task 5 hand-written extractions", () => {
    expect(facts(deal)).toEqual(facts(dealFromExtractions(TEST_SKELETON, sampleInputs())));
  });

  it("has the façade photo and the two attic photos on unit 8", () => {
    expect(deal.photos).toEqual(SAMPLE_PHOTOS);
    expect(deal.photos.map((p) => [p.fileName, p.unitId])).toEqual([
      ["foto_fassade.jpg", null],
      ["foto_dachterrasse.jpg", "u8"],
      ["foto_wohnzimmer_dg.jpg", "u8"],
    ]);
    const attic = deal.photos.filter((p) => p.unitId === "u8").map((p) => p.id);
    expect(deal.units.find((u) => u.id === "u8")?.photoIds).toEqual(attic);
    expect(deal.units.filter((u) => u.id !== "u8").every((u) => u.photoIds.length === 0)).toBe(true);
    for (const photo of deal.photos) {
      expect(existsSync(path.join(process.cwd(), "public", "sample", photo.fileName))).toBe(true);
    }
  });

  it("has the run log of steps 6–11", () => {
    expect(deal.runLog.map((e) => e.step)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(deal.runLog[4].result).toBe("€1,300,000; 6 of 6 cross-checks passed; 4 judgement calls flagged");
  });

  it("returns a fresh deal each time", () => {
    const a = seededDeal();
    a.units[0].areaM2 = 1;
    a.documents[0].findings.push("x");
    expect(seededDeal().units[0].areaM2).toBe(62);
    expect(seededDeal().documents[0].findings).toEqual(["8 units, 565 m², €60,484/yr"]);
  });
});

describe("static sample rows", () => {
  it("lists the other deals of the valuer queue", () => {
    expect(QUEUE_ROWS).toEqual([
      { id: "CEN-2026-0148", city: "Dresden", type: "Hotel", checks: 7, estReview: "~4:10" },
      { id: "CEN-2026-0149", city: "Halle", type: "Multi-family", checks: 1, estReview: "~0:40" },
      { id: "CEN-2026-0151", city: "Leipzig", type: "Apartment", checks: 0, estReview: "~0:20" },
      { id: "CEN-2026-0152", city: "Chemnitz", type: "Commercial", checks: 3, estReview: "~2:00" },
      { id: "CEN-2026-0153", city: "Erfurt", type: "Multi-family", checks: 2, estReview: "~1:00" },
    ]);
  });

  it("has the earlier delivered report", () => {
    expect(DELIVERED_ROW).toEqual({
      id: "CEN-2026-0131",
      address: "Beispielweg 3, 04155 Leipzig",
      value: 870000,
      deliveredAt: "2026-10-28",
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Store

const STORE_KEY = "censio-demo-v1";

/** A minimal in-memory Web Storage. */
class MemoryStorage {
  readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

/** A fresh store in a "browser" whose localStorage is `storage`; loading again over the same storage is a reload. */
async function browserStore(storage: MemoryStorage = new MemoryStorage()) {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  vi.resetModules();
  const store = await import("@/lib/store/demoStore");
  const files = await import("@/lib/store/files");
  return { ...store, files, storage };
}

/** What the wizard submits: the deal built from the five read documents. */
function wizardDeal(): Deal {
  return dealFromExtractions({ ...TEST_SKELETON, id: "draft", requestedAt: "2026-11-06T11:00:00.000Z" }, sampleInputs());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("idb-keyval");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("demo store: initial state", () => {
  it("starts signed out with the seeded deal ready for review", async () => {
    const { useDemoStore } = await browserStore();
    const s = useDemoStore.getState();
    expect(s.role).toBeNull();
    expect(s.accessCode).toBeNull();
    expect(s.orientationSeen).toBe(false);
    expect(s.draft).toBeNull();
    expect(Object.keys(s.deals)).toEqual([SEED_ID]);

    const stored = s.deals[SEED_ID];
    expect(stored.deal).toEqual({ ...seededDeal(), runLog: stored.deal.runLog });
    expect(stored.deal.status).toBe("in_review");
    expect(stored.history.versions).toHaveLength(1);
    expect(currentVersion(stored.history)).toMatchObject({ n: 1, params: V1_PARAMS, undone: false });
    expect(currentVersion(stored.history).createdAt).toBe(TEST_SKELETON.requestedAt);
    expect(stored.flagStatus).toEqual({ cap_rate: "open", market_rent: "open", under_rent: "open", "easement-1": "open" });
    expect(stored).toMatchObject({ openedFlags: [], spotCheck: "open", approval: null });
  });

  it("is hydrated once loaded in the browser", async () => {
    const { useDemoStore } = await browserStore();
    expect(useDemoStore.persist.hasHydrated()).toBe(true);
  });
});

describe("demo store: submitting drafts", () => {
  it("gives the first submitted deal CEN-2026-0147, replacing the seeded one, and later ones 0154, 0155", async () => {
    const { useDemoStore } = await browserStore();
    await useDemoStore.getState().reset();
    expect(useDemoStore.getState().submitDraft(wizardDeal())).toBe(SEED_ID);
    expect(useDemoStore.getState().deals[SEED_ID].deal.photos).toEqual([]);
    expect(useDemoStore.getState().submitDraft(wizardDeal())).toBe("CEN-2026-0154");
    expect(useDemoStore.getState().submitDraft(wizardDeal())).toBe("CEN-2026-0155");
    expect(Object.keys(useDemoStore.getState().deals)).toEqual([SEED_ID, "CEN-2026-0154", "CEN-2026-0155"]);
  });

  it("stores the submitted deal for review with its run log and AI draft v1, and closes the draft", async () => {
    const { useDemoStore } = await browserStore();
    const st = useDemoStore.getState();
    st.startDraft();
    const id = st.submitDraft(wizardDeal());
    const s = useDemoStore.getState();
    const stored = s.deals[id];
    expect(s.draft).toBeNull();
    expect(stored.deal.id).toBe(id);
    expect(stored.deal.status).toBe("in_review");
    expect(Date.parse(stored.deal.requestedAt)).not.toBeNaN();
    expect(stored.deal.runLog.map((e) => e.step)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(stored.history.versions).toHaveLength(1);
    expect(currentVersion(stored.history).params).toEqual(V1_PARAMS);
    expect(stored.flagStatus).toEqual({ cap_rate: "open", market_rent: "open", under_rent: "open", "easement-1": "open" });
    expect(stored).toMatchObject({ openedFlags: [], spotCheck: "open", approval: null });
  });

  it("keeps the client's unit edits of the submitted deal", async () => {
    const { useDemoStore } = await browserStore();
    const edited = withUnit(wizardDeal(), "u1", { areaM2: 70, clientEdited: ["areaM2"] });
    const id = useDemoStore.getState().submitDraft({ ...edited, units: [...edited.units, manualUnit()] });
    const stored = useDemoStore.getState().deals[id];
    const out = runCurrentVersion(stored.deal, stored.history);
    expect(out.valuation.livingAreaM2).toBe(628);
    expect(Object.keys(stored.flagStatus)).toEqual(expect.arrayContaining(["manual_unit-m1", "vacancy-m1"]));
  });
});

describe("demo store: the draft", () => {
  it("starts a draft on the sample address and patches it step by step", async () => {
    const { useDemoStore } = await browserStore();
    useDemoStore.getState().startDraft();
    const draft = useDemoStore.getState().draft!;
    expect(draft).toMatchObject({ documents: [], extractions: {}, units: null, step: 1, photos: [] });
    expect(draft.skeleton).toMatchObject({ ...TEST_SKELETON, id: "draft", requestedAt: expect.any(String) });
    useDemoStore.getState().updateDraft({ step: 2 });
    expect(useDemoStore.getState().draft).toEqual({ ...draft, step: 2 });
  });

  it("starts a draft when one is patched before it was started", async () => {
    const { useDemoStore } = await browserStore();
    useDemoStore.getState().updateDraft({ step: 3 });
    expect(useDemoStore.getState().draft).toMatchObject({ step: 3, documents: [], units: null });
  });

  it("builds the deal from the draft with its unit edits, photos and unread documents", async () => {
    const { dealFromDraft } = await browserStore();
    const inputs = sampleInputs();
    const failed: DealDocument = {
      ...sampleDocument(SAMPLE_EXTRACTIONS[0]),
      id: "doc-unknown",
      fileName: "Kaufvertrag.pdf",
      type: "unknown",
      status: "failed",
      extractionSource: null,
      error: "Live AI is needed to read this document.",
    };
    const extracted = dealFromExtractions(TEST_SKELETON, inputs);
    const units = extracted.units.map((u) => (u.id === "u1" ? { ...u, areaM2: 70, clientEdited: ["areaM2" as const] } : u));
    const photos = [{ id: "photo-1", fileName: "facade.jpg", unitId: null }];
    const draft = {
      skeleton: TEST_SKELETON,
      documents: [inputs[0].doc, failed, ...inputs.slice(1).map((i) => i.doc)],
      extractions: Object.fromEntries(inputs.map((i) => [i.doc.id, { result: i.result, verified: i.verified }])),
      units,
      step: 4 as const,
      photos,
    };
    const deal = dealFromDraft(draft);
    expect(deal.documents.map((d) => d.id)).toEqual(["doc-tenant-list", "doc-unknown", ...inputs.slice(1).map((i) => i.doc.id)]);
    expect(deal.documents[1]).toEqual(failed);
    expect(deal.documents[0].findings).toEqual(["8 units, 565 m², €60,484/yr"]);
    expect(deal.units).toEqual(units);
    expect(deal.photos).toEqual(photos);
    expect(deal.property).toEqual(extracted.property);
    expect(dealFromDraft({ ...draft, units: null }).units).toEqual(extracted.units);
  });
});

describe("demo store: review actions", () => {
  it("records the valuer's review of each call", async () => {
    const { useDemoStore } = await browserStore();
    const st = useDemoStore.getState();
    st.markOpened(SEED_ID, "cap_rate");
    st.markOpened(SEED_ID, "cap_rate");
    st.setFlagStatus(SEED_ID, "market_rent", "accepted");
    st.setSpotCheck(SEED_ID, "matches");
    const stored = useDemoStore.getState().deals[SEED_ID];
    expect(stored.openedFlags).toEqual(["cap_rate"]);
    expect(stored.flagStatus.market_rent).toBe("accepted");
    expect(stored.spotCheck).toBe("matches");
  });

  it("replaces the revision history", async () => {
    const { useDemoStore } = await browserStore();
    const stored = useDemoStore.getState().deals[SEED_ID];
    const h = revise(stored.history, stored.deal, [CAP_RATE_34], "cap_rate", "Use 3.4 %.");
    useDemoStore.getState().setHistory(SEED_ID, h);
    const after = useDemoStore.getState().deals[SEED_ID];
    expect(after.history).toEqual(h);
    expect(runCurrentVersion(after.deal, after.history).valuation.marketValue).toBe(1210000);
  });

  it("ignores actions on a deal it does not hold", async () => {
    const { useDemoStore } = await browserStore();
    const before = useDemoStore.getState().deals;
    const st = useDemoStore.getState();
    st.markOpened("CEN-2026-9999", "cap_rate");
    st.setFlagStatus("CEN-2026-9999", "cap_rate", "accepted");
    st.setSpotCheck("CEN-2026-9999", "matches");
    st.setHistory("CEN-2026-9999", initialHistory(V1_PARAMS, "2026-11-06T09:00:00.000Z"));
    st.approve("CEN-2026-9999", true);
    expect(useDemoStore.getState().deals).toEqual(before);
  });

  it("tells accepted, changed and open calls apart", async () => {
    const { useDemoStore, flagReviewStatuses, currentPipeline } = await browserStore();
    const st = useDemoStore.getState();
    st.setFlagStatus(SEED_ID, "market_rent", "accepted");
    const seeded = useDemoStore.getState().deals[SEED_ID];
    st.setHistory(SEED_ID, revise(seeded.history, seeded.deal, [CAP_RATE_34], "cap_rate", "Use 3.4 %."));
    const stored = useDemoStore.getState().deals[SEED_ID];
    const out = currentPipeline(stored);
    expect(out.valuation.marketValue).toBe(1210000);
    expect(flagReviewStatuses(stored, out)).toEqual({
      cap_rate: "changed_by_valuer",
      market_rent: "accepted",
      under_rent: "open",
      "easement-1": "open",
    });
  });

  it("leaves a call open when its note box sent a revision of another call's parameter", async () => {
    const { useDemoStore, flagReviewStatuses, currentPipeline } = await browserStore();
    const st = useDemoStore.getState();
    st.markOpened(SEED_ID, "under_rent");
    const seeded = useDemoStore.getState().deals[SEED_ID];
    st.setHistory(SEED_ID, revise(seeded.history, seeded.deal, [CAP_RATE_34], "under_rent", "cap rate 3.4 %"));
    const stored = useDemoStore.getState().deals[SEED_ID];
    expect(flagReviewStatuses(stored, currentPipeline(stored))).toEqual({
      cap_rate: "changed_by_valuer",
      market_rent: "open",
      under_rent: "open",
      "easement-1": "open",
    });
  });
});

describe("demo store: approval (spec §5.2 V4)", () => {
  it("accepts the remaining calls and logs the ones never opened as accepted at sign-off", async () => {
    const { useDemoStore, SIGNER } = await browserStore();
    const st = useDemoStore.getState();
    st.markOpened(SEED_ID, "cap_rate");
    st.setFlagStatus(SEED_ID, "cap_rate", "accepted");
    st.markOpened(SEED_ID, "market_rent");
    st.approve(SEED_ID, true);
    const stored = useDemoStore.getState().deals[SEED_ID];
    expect(stored.deal.status).toBe("approved");
    expect(stored.flagStatus).toEqual({
      cap_rate: "accepted",
      market_rent: "accepted",
      under_rent: "accepted",
      "easement-1": "accepted",
    });
    expect(stored.approval).toEqual({
      at: expect.any(String),
      version: 1,
      signer: "K. Vogel",
      acceptedAtSignOff: ["under_rent", "easement-1"],
    });
    expect(SIGNER).toBe("K. Vogel");
    expect(Date.parse(stored.approval!.at)).not.toBeNaN();
  });

  it("without Accept remaining, still logs unopened calls as accepted at sign-off but leaves opened ones open", async () => {
    const { useDemoStore } = await browserStore();
    const st = useDemoStore.getState();
    st.markOpened(SEED_ID, "market_rent");
    st.approve(SEED_ID, false);
    const stored = useDemoStore.getState().deals[SEED_ID];
    expect(stored.flagStatus).toEqual({
      cap_rate: "accepted",
      market_rent: "open",
      under_rent: "accepted",
      "easement-1": "accepted",
    });
    expect(stored.approval?.acceptedAtSignOff).toEqual(["cap_rate", "under_rent", "easement-1"]);
  });

  it("signs the current version and never logs a call the valuer changed", async () => {
    const { useDemoStore } = await browserStore();
    const st = useDemoStore.getState();
    const seeded = useDemoStore.getState().deals[SEED_ID];
    st.setHistory(SEED_ID, revise(seeded.history, seeded.deal, [CAP_RATE_34], "cap_rate", "Use 3.4 %."));
    st.approve(SEED_ID, true);
    const stored = useDemoStore.getState().deals[SEED_ID];
    expect(stored.approval?.version).toBe(2);
    expect(stored.approval?.acceptedAtSignOff).toEqual(["market_rent", "under_rent", "easement-1"]);
    expect(Object.values(stored.flagStatus)).toEqual(["accepted", "accepted", "accepted", "accepted"]);
  });

  it("without Accept remaining, leaves a call the valuer changed as it is", async () => {
    const { useDemoStore, flagReviewStatuses, currentPipeline } = await browserStore();
    const st = useDemoStore.getState();
    const seeded = useDemoStore.getState().deals[SEED_ID];
    st.setHistory(SEED_ID, revise(seeded.history, seeded.deal, [CAP_RATE_34], "cap_rate", "Use 3.4 %."));
    st.approve(SEED_ID, false);
    const stored = useDemoStore.getState().deals[SEED_ID];
    expect(stored.flagStatus.cap_rate).toBe("open");
    expect(stored.approval?.acceptedAtSignOff).toEqual(["market_rent", "under_rent", "easement-1"]);
    expect(flagReviewStatuses(stored, currentPipeline(stored)).cap_rate).toBe("changed_by_valuer");
  });

  it("signs once: signing again, e.g. a double click on Sign & send, keeps the first approval and its log", async () => {
    const { useDemoStore } = await browserStore();
    const st = useDemoStore.getState();
    st.markOpened(SEED_ID, "cap_rate");
    st.approve(SEED_ID, true);
    const signed = useDemoStore.getState().deals[SEED_ID];
    expect(signed.approval?.acceptedAtSignOff).toEqual(["market_rent", "under_rent", "easement-1"]);
    st.approve(SEED_ID, true);
    st.approve(SEED_ID, false);
    expect(useDemoStore.getState().deals[SEED_ID]).toBe(signed);
  });
});

describe("demo store: persistence and reset (plan Review Focus 4)", () => {
  it("persists to localStorage under censio-demo-v1 and survives a reload", async () => {
    const first = await browserStore();
    const st = first.useDemoStore.getState();
    st.signIn("valuer");
    st.setAccessCode(" XYZ ");
    st.dismissOrientation();
    const id = st.submitDraft(wizardDeal());
    st.markOpened(id, "cap_rate");
    st.startDraft();

    const saved = JSON.parse(first.storage.getItem(STORE_KEY)!);
    expect(Object.keys(saved.state).sort()).toEqual(
      ["accessCode", "deals", "draft", "orientationSeen", "role", "submittedCount"].sort(),
    );

    const second = await browserStore(first.storage);
    const before = first.useDemoStore.getState();
    const after = second.useDemoStore.getState();
    expect(after.role).toBe("valuer");
    expect(after.accessCode).toBe("XYZ");
    expect(after.orientationSeen).toBe(true);
    expect(after.deals).toEqual(before.deals);
    expect(after.draft).toEqual(before.draft);
    expect(after.submittedCount).toBe(1);
    expect(after.submitDraft(wizardDeal())).toBe("CEN-2026-0154");
  });

  it("switches roles", async () => {
    const { useDemoStore } = await browserStore();
    useDemoStore.getState().signIn("client");
    expect(useDemoStore.getState().role).toBe("client");
    useDemoStore.getState().setRole("valuer");
    expect(useDemoStore.getState().role).toBe("valuer");
    useDemoStore.getState().setAccessCode("");
    expect(useDemoStore.getState().accessCode).toBeNull();
  });

  it("resets to the seeded state, keeps the access code and clears the stored files", async () => {
    const { useDemoStore, files } = await browserStore();
    const st = useDemoStore.getState();
    st.setAccessCode("XYZ");
    st.dismissOrientation();
    st.signIn("client");
    st.submitDraft(wizardDeal());
    st.startDraft();
    await files.putFile("doc-upload", new Blob(["%PDF-1.7"]));
    expect(await files.getFile("doc-upload")).toBeDefined();

    await useDemoStore.getState().reset();
    const s = useDemoStore.getState();
    expect(s.role).toBeNull();
    expect(s.draft).toBeNull();
    expect(Object.keys(s.deals)).toEqual([SEED_ID]);
    expect(s.deals[SEED_ID].deal.photos).toHaveLength(3);
    expect(s.deals[SEED_ID].deal.status).toBe("in_review");
    expect(s.submittedCount).toBe(0);
    expect(s.accessCode).toBe("XYZ");
    expect(s.orientationSeen).toBe(true);
    expect(await files.getFile("doc-upload")).toBeUndefined();
  });

  it("falls back to the seeded state when the saved state is unreadable", async () => {
    const corrupt = new MemoryStorage();
    corrupt.setItem(STORE_KEY, "{not json");
    const a = await browserStore(corrupt);
    expect(a.useDemoStore.persist.hasHydrated()).toBe(true);
    expect(Object.keys(a.useDemoStore.getState().deals)).toEqual([SEED_ID]);

    const foreign = new MemoryStorage();
    foreign.setItem(STORE_KEY, JSON.stringify({ state: { role: "admin", deals: "oops", draft: 3 }, version: 1 }));
    const b = await browserStore(foreign);
    expect(b.useDemoStore.getState()).toMatchObject({ role: null, draft: null, submittedCount: 0 });
    expect(Object.keys(b.useDemoStore.getState().deals)).toEqual([SEED_ID]);

    const old = new MemoryStorage();
    old.setItem(STORE_KEY, JSON.stringify({ state: { role: "valuer", deals: {} }, version: 0 }));
    const c = await browserStore(old);
    expect(c.useDemoStore.getState().role).toBeNull();
    expect(Object.keys(c.useDemoStore.getState().deals)).toEqual([SEED_ID]);
  });
});

describe("demo store: server rendering", () => {
  it("never touches localStorage on the server and reports itself as not hydrated", async () => {
    const touched: string[] = [];
    const forbidden = new Proxy(
      {},
      {
        get(_target, prop) {
          touched.push(String(prop));
          throw new Error("localStorage used on the server");
        },
      },
    );
    vi.stubGlobal("localStorage", forbidden);
    vi.resetModules();
    const { useDemoStore, useDemoHydrated } = await import("@/lib/store/demoStore");
    expect(useDemoStore.getState().deals[SEED_ID].deal.status).toBe("in_review");
    useDemoStore.getState().setRole("valuer");

    const { createElement } = await import("react");
    const { renderToString } = await import("react-dom/server");
    function Probe() {
      return createElement("span", null, useDemoHydrated() ? "hydrated" : "loading");
    }
    expect(renderToString(createElement(Probe))).toBe("<span>loading</span>");
    expect(touched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Files

describe("files", () => {
  it("keeps files in memory where IndexedDB is unavailable (Node, server)", async () => {
    vi.resetModules();
    const { putFile, getFile, clearFiles } = await import("@/lib/store/files");
    expect(await getFile("a")).toBeUndefined();
    await putFile("a", new Blob(["hello"]));
    expect(await (await getFile("a"))!.text()).toBe("hello");
    await clearFiles();
    expect(await getFile("a")).toBeUndefined();
  });

  it("stores files in their own IndexedDB store via idb-keyval", async () => {
    const handle = vi.fn();
    const idb = {
      createStore: vi.fn(() => handle),
      get: vi.fn(async () => new Blob(["stored"])),
      set: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    };
    vi.doMock("idb-keyval", () => idb);
    vi.stubGlobal("indexedDB", {});
    vi.resetModules();
    const { putFile, getFile, clearFiles } = await import("@/lib/store/files");
    const blob = new Blob(["%PDF"]);
    await putFile("doc-1", blob);
    expect(idb.set).toHaveBeenCalledWith("doc-1", blob, handle);
    expect(await (await getFile("doc-1"))!.text()).toBe("stored");
    expect(idb.get).toHaveBeenCalledWith("doc-1", handle);
    await clearFiles();
    expect(idb.clear).toHaveBeenCalledWith(handle);
    expect(idb.createStore).toHaveBeenCalledTimes(1);
    expect(idb.createStore).toHaveBeenCalledWith("censio-demo-v1", "files");
  });

  it("keeps a file in memory for the session when IndexedDB refuses it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const idb = {
      createStore: vi.fn(() => vi.fn()),
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {
        throw new Error("QuotaExceededError");
      }),
      clear: vi.fn(async () => {
        throw new Error("InvalidStateError");
      }),
    };
    vi.doMock("idb-keyval", () => idb);
    vi.stubGlobal("indexedDB", {});
    vi.resetModules();
    const { putFile, getFile, clearFiles } = await import("@/lib/store/files");
    await putFile("doc-1", new Blob(["kept"]));
    expect(await (await getFile("doc-1"))!.text()).toBe("kept");
    await expect(clearFiles()).resolves.toBeUndefined();
    expect(await getFile("doc-1")).toBeUndefined();
  });
});
