/**
 * The Revalue note (plan Task 11, spec §6.2 and §6.4): the rule-based Demo-mode parser, the server-side checks of a
 * model answer, and POST /api/revalue.
 *
 * The context is built from the real sample deal (extraction → rent estimator → engine → flags), as the review screen
 * builds it. No API key is set: the live path runs against a stubbed `beta.messages.parse` and against the real SDK
 * over a fake `fetch`. `getClient` is mocked and throws unless a test hands it one of those, so no test can reach the
 * Claude API.
 */
import { Anthropic, AnthropicError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, maxDuration } from "@/app/api/revalue/route";
import comparablesJson from "@/lib/data/comparables.json";
import { dealFromExtractions } from "@/lib/deal/fromExtraction";
import { buildFlags } from "@/lib/flags/rules";
import { lookupLandValue } from "@/lib/lookups/boris";
import { ANNEX3 } from "@/lib/lookups/costs";
import { lookupCapRate } from "@/lib/lookups/marketReport";
import { estimateBuilding, type Comparable } from "@/lib/rent/estimator";
import { parseNote } from "@/lib/revalue/parser";
import { REVALUE_SYSTEM, revalueUserMessage } from "@/lib/revalue/prompt";
import {
  DEFAULT_CLARIFYING_QUESTION,
  RANGES,
  RevalueOutputSchema,
  buildRevalueContext,
  type RevalueContext,
  type RevalueOutput,
  type RevalueResult,
} from "@/lib/revalue/schema";
import { validateChanges } from "@/lib/revalue/validate";
import { applyChanges, type ParamChange } from "@/lib/revisions/history";
import { MODEL, getClient } from "@/lib/server/anthropic";
import { checkRate } from "@/lib/server/limits";
import { computeValuation, remainingLife, type ValuationInput, type ValuationParams } from "@/lib/valuation/engine";
import { computeSensitivities } from "@/lib/valuation/sensitivity";
import { TEST_SKELETON, sampleInputs } from "./fixtures/sampleExtractions";

vi.mock("@/lib/server/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/anthropic")>()),
  getClient: vi.fn(),
}));

const comps = comparablesJson as Comparable[];
const ACCESS_CODE = "letmein";

/** The rehearsed note for check 1 (spec §5.3.6 and §6.2). */
const REHEARSED =
  "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";

// ---------------------------------------------------------------------------------------------------------------------
// The sample deal as the pipeline computes it (Tasks 2–8), at v1 or with patched parameters.

function samplePipeline(patch: Partial<ValuationParams> = {}) {
  const deal = dealFromExtractions(TEST_SKELETON, sampleInputs());
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
    ...patch,
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
  const flags = buildFlags({ deal, valuation, rent, capRate, land, sensitivities, params });
  return { deal, rent, params, input, valuation, flags };
}

function sampleContext(flagId: string | null = null, patch: Partial<ValuationParams> = {}): RevalueContext {
  return buildRevalueContext(samplePipeline(patch), flagId);
}

function only(r: RevalueResult): ParamChange {
  expect(r.intent).toBe("change_parameters");
  expect(r.changes).toHaveLength(1);
  return r.changes[0];
}

function expectUnclear(r: RevalueResult): string {
  expect(r.intent).toBe("unclear");
  expect(r.changes).toEqual([]);
  expect(r.answer).toBeNull();
  expect(r.clarifyingQuestion).toEqual(expect.any(String));
  return r.clarifyingQuestion!;
}

/** A model answer in the shape of RevalueOutputSchema. */
function modelAnswer(patch: Partial<RevalueOutput> = {}): RevalueOutput {
  return {
    intent: "change_parameters",
    changes: [
      {
        parameter: "capRate",
        unitId: null,
        to: 0.034,
        reason: "The committee range for pre-war houses in this district is 3.25–3.75 %.",
        sourceKind: "valuer_judgement",
        documentId: null,
      },
    ],
    explanation: "I raised the cap rate from 3.0 % to 3.4 % as you asked; rent, costs and land value stay the same.",
    answer: null,
    clarifyingQuestion: null,
    ...patch,
  };
}

/** A model result as the route hands it to validateChanges (the model does not return `from`). */
function liveResult(changes: Omit<ParamChange, "from">[], patch: Partial<RevalueResult> = {}): RevalueResult {
  return {
    intent: "change_parameters",
    changes: changes.map((c) => ({ ...c, from: 0 })),
    explanation: "I changed it as you asked.",
    answer: null,
    clarifyingQuestion: null,
    mode: "live",
    durationMs: 4200,
    ...patch,
  };
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("DEMO_ACCESS_CODE", "");
  vi.mocked(getClient).mockImplementation(() => {
    throw new Error("The tests never call the Claude API");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getClient).mockReset();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------------------------------

describe("the revalue context", () => {
  it("describes the current version: parameters, units with their market rent, documents and flags", () => {
    const ctx = sampleContext("cap_rate");
    expect(ctx.flagId).toBe("cap_rate");
    expect(ctx.params.capRate).toBe(0.03);
    expect(ctx.baseAvgRent).toBeCloseTo(9.6, 9);
    expect(ctx.units.map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
    expect(ctx.units[7]).toEqual({ id: "u8", label: "Attic", marketRentPerM2: 9.92 });
    expect(ctx.documents.map((d) => d.type)).toEqual([
      "tenant_list",
      "land_register",
      "energy_certificate",
      "refurbishment_sheet",
      "zoning_plan",
    ]);
    expect(ctx.flags.map((f) => f.id)).toEqual(["cap_rate", "market_rent", "under_rent", "easement-1"]);
  });

  it("uses the effective market rent of the version (after the valuer's factor and overrides)", () => {
    const ctx = sampleContext(null, { marketRentOverrides: { u8: 9.5 } });
    expect(ctx.units.find((u) => u.id === "u8")!.marketRentPerM2).toBe(9.5);
  });

  it("has the plan's ranges", () => {
    expect(RANGES).toEqual({
      capRate: [0.02, 0.06],
      marketRentAvg: [6, 15],
      marketRentUnit: [6, 15],
      underRentYears: [1, 10],
      easementDeduction: [0, 50000],
      remainingLifeYears: [20, 60],
    });
  });
});

describe("parseNote: the plan's cases", () => {
  it("maps the rehearsed note to cap rate 3.4 % as valuer judgement, citing the valuer's range", () => {
    const r = parseNote(REHEARSED, sampleContext("cap_rate"));
    const c = only(r);
    expect(c.parameter).toBe("capRate");
    expect(c.to).toBeCloseTo(0.034, 12);
    expect(c.from).toBe(0.03);
    expect(c.sourceKind).toBe("valuer_judgement");
    expect(c.documentId).toBeUndefined();
    expect(c.unitId).toBeUndefined();
    expect(c.reason).not.toBe("");
    expect(r.explanation).toContain("3.25–3.75 %");
    expect(r.explanation).toBe(
      "I changed the cap rate from 3.0 % to 3.4 % as you asked. Rent, costs and land value are unchanged. " +
        "A higher cap rate means buyers expect more return, so the same rent is worth less today. " +
        "Your range (3.25–3.75 %) is not in the loaded market report, so the report cites it as valuer judgement.",
    );
    expect(r.answer).toBeNull();
    expect(r.clarifyingQuestion).toBeNull();
    expect(r.mode).toBe("demo");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("gives exactly v2 (€1,210,000) for the rehearsed note, with or without the focused flag", () => {
    const out = samplePipeline();
    for (const flagId of ["cap_rate", null]) {
      const ctx = buildRevalueContext(out, flagId);
      const r = parseNote(REHEARSED, ctx);
      const params = applyChanges(ctx.params, r.changes, ctx.baseAvgRent);
      expect(computeValuation({ ...out.input, params }).marketValue).toBe(1210000);
    }
  });

  it("reads `attic rent 9,50` as the attic's market rent with a German decimal comma", () => {
    const c = only(parseNote("attic rent 9,50", sampleContext()));
    expect(c).toMatchObject({ parameter: "marketRentUnit", unitId: "u8", from: 9.92, to: 9.5 });
    expect(c.sourceKind).toBe("valuer_judgement");
  });

  it("asks back for `use 12 %` on the cap-rate flag, naming the allowed range", () => {
    const question = expectUnclear(parseNote("use 12 %", sampleContext("cap_rate")));
    expect(question).toContain("2.0–6.0 %");
  });

  it("answers `why 3.0 %?` as a question from the focused flag, without a change", () => {
    const ctx = sampleContext("cap_rate");
    const r = parseNote("why 3.0 %?", ctx);
    expect(r.intent).toBe("question");
    expect(r.changes).toEqual([]);
    expect(r.clarifyingQuestion).toBeNull();
    expect(r.answer).toContain(ctx.flags.find((f) => f.id === "cap_rate")!.whyFlagged);
  });

  it("asks back for `make it nicer`", () => {
    for (const flagId of [null, "cap_rate", "market_rent"]) {
      expect(expectUnclear(parseNote("make it nicer", sampleContext(flagId)))).toBe(DEFAULT_CLARIFYING_QUESTION);
    }
    expect(DEFAULT_CLARIFYING_QUESTION).toBe(
      'Which value should I change, and to what? For example: "use 3.4 %" or "attic rent 9.50".',
    );
  });
});

describe("parseNote: arbitrary notes in Demo mode (review focus 1)", () => {
  const ctx = sampleContext();

  it("reads a unit named in passing and a German decimal comma", () => {
    expect(only(parseNote("the attic looks overpriced, use 9,50", ctx))).toMatchObject({
      parameter: "marketRentUnit",
      unitId: "u8",
      to: 9.5,
    });
  });

  it.each([
    ["DG 9,50", "u8", 9.5],
    ["Dachgeschoss: 9,50 €/m²", "u8", 9.5],
    ["unit 8 rent 9.50", "u8", 9.5],
    ["WE 8 9,50", "u8", 9.5],
    ["Attic 9.5 €/m2", "u8", 9.5],
    ["GF left 9.00", "u1", 9],
    ["EG links 9,00 €/m²", "u1", 9],
    ["1F right 9.80", "u4", 9.8],
    ["1. OG rechts: Marktmiete 9,80", "u4", 9.8],
    ["ground floor right 9.30", "u2", 9.3],
    ["9.70 for unit 3", "u3", 9.7],
    ["set apartment 5 to 9.40", "u5", 9.4],
  ])("%s → the market rent of %s", (note, unitId, to) => {
    expect(only(parseNote(note, ctx))).toMatchObject({ parameter: "marketRentUnit", unitId, to });
  });

  it("asks which unit when a floor holds more than one, or the unit does not exist", () => {
    const floor = expectUnclear(parseNote("ground floor 9.00", ctx));
    expect(floor).toContain("GF left");
    expect(floor).toContain("GF right");
    expect(expectUnclear(parseNote("unit 12 9.50", ctx))).toContain("Attic");
  });

  it.each([
    ["market rent 9.80", 9.8],
    ["Miete 9,80 €/m²", 9.8],
    ["Marktmiete auf 9,80", 9.8],
    ["The market rent should be 9.80 €/m²", 9.8],
  ])("%s → the average market rent", (note, to) => {
    const c = only(parseNote(note, ctx));
    expect(c).toMatchObject({ parameter: "marketRentAvg", to });
    expect(c.from).toBeCloseTo(9.6, 9);
    expect(c.unitId).toBeUndefined();
  });

  it("reads the under-rent example note and years on the under-rent flag", () => {
    expect(only(parseNote("Under-rent will close in 8 years", ctx))).toMatchObject({
      parameter: "underRentYears",
      from: 5,
      to: 8,
    });
    expect(only(parseNote("8 Jahre", sampleContext("under_rent")))).toMatchObject({
      parameter: "underRentYears",
      to: 8,
    });
    expect(only(parseNote("assume 18 months", sampleContext("under_rent")))).toMatchObject({ to: 1.5 });
  });

  it("asks whether bare years mean the under-rent or the remaining life", () => {
    const question = expectUnclear(parseNote("8 years", ctx));
    expect(question).toContain("under-rent");
    expect(question).toContain("remaining");
  });

  it.each([
    ["easement 12k", 12000],
    ["Leitungsrecht 12.000 €", 12000],
    ["Dienstbarkeit: Abschlag 12,5 T€", 12500],
    ["deduct €12,480 for the easement", 12480],
  ])("%s → the easement deduction", (note, to) => {
    expect(only(parseNote(note, ctx))).toMatchObject({ parameter: "easementDeduction", from: 0, to });
  });

  it("takes an amount on the easement flag, and asks back for an amount without a unit", () => {
    expect(only(parseNote("use 12.000 €", sampleContext("easement-1")))).toMatchObject({
      parameter: "easementDeduction",
      to: 12000,
    });
    expect(expectUnclear(parseNote("easement 12", ctx))).toContain("12k");
  });

  it.each(["remaining life 35 years", "RND 35", "Restnutzungsdauer 35 Jahre"])("%s → the remaining life", (note) => {
    expect(only(parseNote(note, ctx))).toMatchObject({ parameter: "remainingLifeYears", from: 42, to: 35 });
  });

  it.each([
    ["LZ 3,4 %", null],
    ["Liegenschaftszins 3,4", null],
    ["use 3.4 %", null],
    ["use 3.4", "cap_rate"],
    ["cap rate from 3.0 % to 3.4 %", null],
    ["3.4 % instead of 3.0 %", "cap_rate"],
  ])("%s → cap rate 3.4 %%", (note, flagId) => {
    const c = only(parseNote(note, sampleContext(flagId)));
    expect(c.parameter).toBe("capRate");
    expect(c.to).toBeCloseTo(0.034, 12);
  });

  it("does not turn a percentage on another flag into a cap rate", () => {
    expect(expectUnclear(parseNote("use 3.4 %", sampleContext("market_rent")))).toContain("cap rate");
  });

  it("applies several changes from one note", () => {
    const r = parseNote("cap rate 3.4 % and attic 9.50", ctx);
    expect(r.intent).toBe("change_parameters");
    expect(r.changes.map((c) => [c.parameter, c.unitId, c.to])).toEqual([
      ["capRate", undefined, 0.034],
      ["marketRentUnit", "u8", 9.5],
    ]);
    expect(r.explanation).toContain("3.4 %");
    expect(r.explanation).toContain("9.50 €/m²");
  });

  it("gives the same value to units listed together", () => {
    const r = parseNote("GF left and GF right 9.00", ctx);
    expect(r.changes.map((c) => [c.unitId, c.to])).toEqual([
      ["u1", 9],
      ["u2", 9],
    ]);
  });

  it("asks back when a value is ambiguous or only a range is given", () => {
    expect(expectUnclear(parseNote("attic 9.50 or 9.70", ctx))).toContain("9.50");
    expect(expectUnclear(parseNote("cap rate 3.25–3.75 %", ctx))).toContain("3.25–3.75 %");
  });

  it("names the allowed range for any out-of-range value", () => {
    expect(expectUnclear(parseNote("attic rent 20", ctx))).toContain("6.00–15.00 €/m²");
    expect(expectUnclear(parseNote("market rent 5", ctx))).toContain("6.00–15.00 €/m²");
    expect(expectUnclear(parseNote("remaining life 70 years", ctx))).toContain("20–60 years");
    expect(expectUnclear(parseNote("easement 80k", ctx))).toContain("€0–€50,000");
    expect(expectUnclear(parseNote("under-rent 12 years", ctx))).toContain("1–10 years");
  });

  it("refuses to change sourced facts: areas, in-place rents and the land value", () => {
    for (const note of ["plot area 500 m²", "land value 600 €/m²", "in-place rent of the attic 10.00", "attic 95 m²"]) {
      expect(expectUnclear(parseNote(note, ctx))).toContain("cannot");
    }
    expect(expectUnclear(parseNote("use 600", sampleContext("land_value")))).toContain("cannot");
  });

  it("applies relative changes", () => {
    expect(only(parseNote("market rent 5 % lower", ctx))).toMatchObject({ parameter: "marketRentAvg", to: 9.12 });
    expect(only(parseNote("reduce the attic rent by 0,40", ctx))).toMatchObject({ unitId: "u8", to: 9.52 });
    expect(only(parseNote("cap rate +40 bp", ctx)).to).toBeCloseTo(0.034, 12);
    expect(only(parseNote("raise the remaining life by 3 years", ctx))).toMatchObject({ to: 45 });
    expect(only(parseNote("lower the cap rate to 2.8 %", ctx)).to).toBeCloseTo(0.028, 12);
    expect(expectUnclear(parseNote("change the cap rate by 40 bp", ctx))).toContain("up or down");
  });

  it("asks for an input when a note asks for a different market value", () => {
    const notes = [
      "lower the value by 10%",
      "the value should be 10 % lower",
      "Ertragswert um 10 % senken",
      "lower the value by 10",
      "reduce the market value by €50,000",
    ];
    for (const flag of ["cap_rate", "market_rent", null]) {
      for (const note of notes) {
        expect(expectUnclear(parseNote(note, sampleContext(flag))), `${note} (${flag})`).toContain("result of the calculation");
      }
    }
    // A named input still changes when the value is only the reason; on the easement flag the drop is the deduction.
    const capRate = only(parseNote("lower the cap rate by 0.2 % to bring the value down", sampleContext("cap_rate")));
    expect(capRate.to).toBeCloseTo(0.028, 12);
    expect(only(parseNote("it lowers the value by €10,000", sampleContext("easement-1")))).toMatchObject({
      parameter: "easementDeduction",
      to: 10000,
    });
  });

  it("does not create a version that changes nothing", () => {
    expect(expectUnclear(parseNote("use 3.0 %", sampleContext("cap_rate")))).toContain("already");
  });

  it("treats questions as questions, in English and German", () => {
    const ctx2 = sampleContext("market_rent");
    for (const note of ["Warum 3,0 %?", "What drives the market rent", "Use 3.4 %?"]) {
      const r = parseNote(note, ctx2);
      expect(r.intent).toBe("question");
      expect(r.changes).toEqual([]);
      expect(r.answer).toEqual(expect.any(String));
    }
    // Without a focused flag, the answer comes from the flag the question is about.
    const capRate = parseNote("why 3.0 %?", ctx);
    expect(capRate.answer).toContain(ctx.flags.find((f) => f.id === "cap_rate")!.whyFlagged);
  });

  it("never cites a document as the source of a demo change", () => {
    const r = parseNote("The tenant list shows unit 4 re-let at 9.40; use 9.40 for unit 4", ctx);
    expect(only(r)).toMatchObject({ unitId: "u4", to: 9.4, sourceKind: "valuer_judgement" });
  });

  it("treats an empty note as unclear", () => {
    expect(expectUnclear(parseNote("   ", ctx))).toBe(DEFAULT_CLARIFYING_QUESTION);
  });

  it.each([
    // German word order, verbs after the number
    ["LZ von 3,0 auf 3,4 % erhöhen", "capRate", undefined, 0.034],
    ["Restnutzungsdauer um 5 Jahre kürzen", "remainingLifeYears", undefined, 37],
    ["Die Marktmiete für das DG ist zu hoch, 9,50 €/m² ansetzen", "marketRentUnit", "u8", 9.5],
    // a unit named for comparison, and evidence about what was, are no targets
    ["the attic at 9.92 is too high vs unit 4, set it to 9.64", "marketRentUnit", "u8", 9.64],
    ["Unit 4 was re-let in 2025 at 9.40, so the attic should be 9.60 like unit 4", "marketRentUnit", "u8", 9.6],
    ["Attic: 9.50 (was 9.92)", "marketRentUnit", "u8", 9.5],
    // parameters the note keeps, and rent law, take no value
    ["Use 3.4 %. Keep the attic.", "capRate", undefined, 0.034],
    ["keep the cap rate but use 9.80 for the attic", "marketRentUnit", "u8", 9.8],
    ["The rent increase is capped by § 558 BGB, so use 8 years for the under-rent", "underRentYears", undefined, 8],
    // by how much the easement lowers the value is the deduction
    ["Leitungsrecht mindert den Wert um 10.000 €", "easementDeduction", undefined, 10000],
    // a bare number inside the range the note states
    ["the committee range is 3.25 to 3.75 %, use 3.4", "capRate", undefined, 0.034],
  ])("%s → %s %s %s", (note, parameter, unitId, to) => {
    const c = only(parseNote(note, ctx));
    expect([c.parameter, c.unitId]).toEqual([parameter, unitId]);
    expect(c.to).toBeCloseTo(to as number, 9);
  });

  it("leaves a percentage about something else unread", () => {
    expect(expectUnclear(parseNote("Mietausfallwagnis 2 %, cap rate stays", ctx))).toBe(DEFAULT_CLARIFYING_QUESTION);
    expect(only(parseNote("Kappungsgrenze 15 %, Mindermiete in 8 Jahren abgebaut", ctx))).toMatchObject({
      parameter: "underRentYears",
      to: 8,
    });
    expect(expectUnclear(parseNote("Unit 4 was re-let in 2025 at 9.40 €/m² against 9.64 estimated", ctx))).toBe(
      DEFAULT_CLARIFYING_QUESTION,
    );
  });

  it("reads thousands grouped by spaces, as German typography writes them", () => {
    const v2 = sampleContext("easement-1", { easementDeduction: 12000 });
    for (const note of ["easement 15 000 €", "Leitungsrecht 15\u202F000 €", "Dienstbarkeit 15 000 Euro", "15 000"]) {
      expect(only(parseNote(note, v2))).toMatchObject({ parameter: "easementDeduction", from: 12000, to: 15000 });
    }
    expect(expectUnclear(parseNote("easement 15 000–20 000 €", ctx))).toContain("€15,000–€20,000");
  });

  it("asks back when a change is measured against something other than the current value", () => {
    const notes: [string, string | null][] = [
      ["asking rents are 5 % above leases", "market_rent"],
      ["Asking rents are typically 5 % higher than leases", null],
      ["leases are 5 % below asking rents", "market_rent"],
      ["attic 0.30 below 1F right", null],
      ["the attic should be 0.30 higher than the 3F", null],
      ["set the attic 5 % below the other units", null],
      ["cap rate should be 50 bp above the city median", "cap_rate"],
    ];
    for (const [note, flagId] of notes) expectUnclear(parseNote(note, sampleContext(flagId)));
    // Measured against the current value, the change stands.
    expect(only(parseNote("market rent 5 % lower than estimated", ctx))).toMatchObject({
      parameter: "marketRentAvg",
      to: 9.12,
    });
    expect(only(parseNote("market rent 5 % below, please", ctx))).toMatchObject({ to: 9.12 });
  });

  it("never applies a value the note rejects", () => {
    const rejected: [string, string | null][] = [
      ["do not use 3.5 %", null],
      ["don't use 3.5 %", "cap_rate"],
      ["do not set the cap rate to 3.5 %", null],
      ["the cap rate should not be 3.5 %", null],
      ["keine 3,5 %", "cap_rate"],
      ["3.5 % is too high", "cap_rate"],
      ["3,5 % wäre zu hoch", "cap_rate"],
      ["9.20 would be wrong for the attic", null],
    ];
    for (const [note, flagId] of rejected) expectUnclear(parseNote(note, sampleContext(flagId)));
    // The value the note asks for instead still counts.
    expect(only(parseNote("cap rate not 3.5 % but 3.4 %", ctx)).to).toBeCloseTo(0.034, 12);
    expect(only(parseNote("3.5 % is too high, use 3.4 %", sampleContext("cap_rate"))).to).toBeCloseTo(0.034, 12);
    expect(only(parseNote("The report has no district figure so use 3.4 %", ctx)).to).toBeCloseTo(0.034, 12);
    expect(only(parseNote("Mindermiete wird nicht in 5 Jahren abgebaut, sondern in 8", ctx))).toMatchObject({
      parameter: "underRentYears",
      to: 8,
    });
  });

  it("does not take a unit whose label names the other side", () => {
    expect(expectUnclear(parseNote("3F right 9.80", ctx))).toContain("3F right");
    expect(only(parseNote("attic left 9.80", ctx))).toMatchObject({ unitId: "u8", to: 9.8 });
  });

  it("does not suggest a parameter that cannot take the value", () => {
    expect(expectUnclear(parseNote("the market value should be €1,250,000", ctx))).toBe(DEFAULT_CLARIFYING_QUESTION);
    expect(expectUnclear(parseNote("5 %", sampleContext("easement-1")))).toContain("in euro");
  });
});

describe("validateChanges", () => {
  const ctx = sampleContext("cap_rate");

  it("downgrades a change citing an unknown document to valuer judgement", () => {
    const r = validateChanges(
      liveResult([
        { parameter: "capRate", to: 0.034, reason: "Committee", sourceKind: "document", documentId: "doc-unknown" },
      ]),
      ctx,
    );
    expect(r.intent).toBe("change_parameters");
    expect(r.changes[0].sourceKind).toBe("valuer_judgement");
    expect(r.changes[0].documentId).toBeUndefined();
  });

  it("keeps a change citing one of the deal's documents", () => {
    const r = validateChanges(
      liveResult([
        {
          parameter: "marketRentUnit",
          unitId: "u4",
          to: 9.4,
          reason: "Re-let in 2025 per the tenant list",
          sourceKind: "document",
          documentId: "doc-tenant-list",
        },
      ]),
      ctx,
    );
    expect(r.changes[0]).toMatchObject({ sourceKind: "document", documentId: "doc-tenant-list", from: 9.64 });
  });

  it("fills `from` from the context and keeps the result's mode, duration and explanation", () => {
    const r = validateChanges(
      liveResult([
        { parameter: "capRate", to: 0.034, reason: "r", sourceKind: "valuer_judgement" },
        { parameter: "marketRentAvg", to: 9.8, reason: "r", sourceKind: "valuer_judgement" },
        { parameter: "marketRentUnit", unitId: "u8", to: 9.5, reason: "r", sourceKind: "valuer_judgement" },
        { parameter: "underRentYears", to: 8, reason: "r", sourceKind: "valuer_judgement" },
        { parameter: "easementDeduction", to: 12000, reason: "r", sourceKind: "valuer_judgement" },
        { parameter: "remainingLifeYears", to: 35, reason: "r", sourceKind: "valuer_judgement" },
      ]),
      ctx,
    );
    expect(r.changes.map((c) => c.from)).toEqual([0.03, 9.6, 9.92, 5, 0, 42]);
    expect(r).toMatchObject({ mode: "live", durationMs: 4200, explanation: "I changed it as you asked." });
  });

  it("lets explicit numbers in the note override the model's value, and rewrites the explanation", () => {
    const r = validateChanges(
      liveResult([{ parameter: "capRate", to: 0.035, reason: "r", sourceKind: "valuer_judgement" }], {
        explanation: "I changed the cap rate from 3.0 % to 3.5 %.",
      }),
      ctx,
      REHEARSED,
    );
    expect(only(r).to).toBeCloseTo(0.034, 12);
    expect(r.explanation).toContain("3.4 %");
    expect(r.explanation).not.toContain("3.5 %");
  });

  it("adds the valuer's range to an explanation that leaves it out", () => {
    const r = validateChanges(
      liveResult([{ parameter: "capRate", to: 0.034, reason: "r", sourceKind: "valuer_judgement" }]),
      ctx,
      REHEARSED,
    );
    expect(r.explanation).toContain("I changed it as you asked.");
    expect(r.explanation).toContain("3.25–3.75 %");
  });

  it("keeps the model's value when the note states no value for that parameter", () => {
    const r = validateChanges(
      liveResult([
        { parameter: "marketRentAvg", to: 9.12, reason: "Asking rents overstate leases", sourceKind: "valuer_judgement" },
      ]),
      sampleContext("market_rent"),
      "asking rents are 5 % above leases",
    );
    expect(only(r)).toMatchObject({ parameter: "marketRentAvg", from: 9.6, to: 9.12 });
  });

  it("reads a cap rate given in percent as a fraction", () => {
    const r = validateChanges(
      liveResult([{ parameter: "capRate", to: 3.4, reason: "r", sourceKind: "valuer_judgement" }]),
      ctx,
    );
    expect(only(r).to).toBeCloseTo(0.034, 12);
  });

  it("turns an out-of-range value into a clarifying question naming the range", () => {
    const r = validateChanges(
      liveResult([{ parameter: "remainingLifeYears", to: 75, reason: "r", sourceKind: "valuer_judgement" }]),
      ctx,
    );
    expect(expectUnclear(r)).toContain("20–60 years");
  });

  it("asks which unit when a unit change names no unit of the deal", () => {
    for (const unitId of ["u99", undefined]) {
      const r = validateChanges(
        liveResult([{ parameter: "marketRentUnit", unitId, to: 9.5, reason: "r", sourceKind: "valuer_judgement" }]),
        ctx,
      );
      expect(expectUnclear(r)).toContain("Attic");
    }
  });

  it("drops a unit id on a building-wide parameter, and a change that changes nothing", () => {
    const r = validateChanges(
      liveResult([
        { parameter: "capRate", unitId: "u8", to: 0.034, reason: "r", sourceKind: "valuer_judgement" },
        { parameter: "underRentYears", to: 5, reason: "r", sourceKind: "valuer_judgement" },
      ]),
      ctx,
    );
    expect(only(r)).toMatchObject({ parameter: "capRate" });
    expect(only(r).unitId).toBeUndefined();
    const unchanged = liveResult([{ parameter: "capRate", to: 0.03, reason: "r", sourceKind: "valuer_judgement" }]);
    expect(expectUnclear(validateChanges(unchanged, ctx))).toContain("already");
  });

  it("keeps questions and clarifying questions free of changes", () => {
    const q = validateChanges(
      liveResult([{ parameter: "capRate", to: 0.034, reason: "r", sourceKind: "valuer_judgement" }], {
        intent: "question",
        answer: "The report has no district figure.",
        clarifyingQuestion: "Stray?",
      }),
      ctx,
    );
    expect(q).toMatchObject({
      intent: "question",
      changes: [],
      answer: "The report has no district figure.",
      clarifyingQuestion: null,
    });

    const u = validateChanges(liveResult([], { intent: "unclear", clarifyingQuestion: null }), ctx);
    expect(expectUnclear(u)).toBe(DEFAULT_CLARIFYING_QUESTION);

    const empty = validateChanges(liveResult([]), ctx);
    expect(expectUnclear(empty)).toBe(DEFAULT_CLARIFYING_QUESTION);
  });
});

describe("the structured output schema and prompt", () => {
  it("parses a valid answer and rejects an off-list parameter", () => {
    const format = zodOutputFormat(RevalueOutputSchema);
    expect(format.type).toBe("json_schema");
    expect(format.parse(JSON.stringify(modelAnswer()))).toEqual(modelAnswer());
    const offList = JSON.stringify(modelAnswer()).replace('"capRate"', '"landValue"');
    expect(() => format.parse(offList)).toThrow();
  });

  it("tells Claude the parameters, their units and ranges, and the guardrails", () => {
    for (const text of [
      "capRate",
      "marketRentAvg",
      "marketRentUnit",
      "underRentYears",
      "easementDeduction",
      "remainingLifeYears",
      "0.02",
      "0.06",
      "50000",
      "valuer_judgement",
      "change_parameters",
      "clarifyingQuestion",
    ]) {
      expect(REVALUE_SYSTEM).toContain(text);
    }
    expect(REVALUE_SYSTEM.toLowerCase()).toContain("in-place rent");
    expect(REVALUE_SYSTEM.toLowerCase()).toContain("land value");
  });

  it("sends the note and the version's context in the user turn", () => {
    const text = revalueUserMessage(REHEARSED, sampleContext("cap_rate"));
    expect(text).toContain(REHEARSED);
    for (const s of ["cap_rate", "u8", "Attic", "9.92", "doc-tenant-list", "0.03", "3.0 %"]) expect(text).toContain(s);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The route

function revalueRequest(body: unknown, opts: { ip?: string; raw?: string } = {}): Request {
  return new Request("http://localhost/api/revalue", {
    method: "POST",
    body: opts.raw ?? JSON.stringify(body),
    headers: { "content-type": "application/json", ...(opts.ip ? { "x-forwarded-for": opts.ip } : {}) },
  });
}

async function call(request: Request) {
  const res = await POST(request);
  return { status: res.status, headers: res.headers, body: await res.json() };
}

function enableLiveAi() {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-not-a-real-key");
  vi.stubEnv("DEMO_ACCESS_CODE", ACCESS_CODE);
}

/** Hands the route a fake client whose `beta.messages.parse` is `parse`. */
function stubClaude(parse: (...args: unknown[]) => Promise<unknown>) {
  const fn = vi.fn(parse);
  vi.mocked(getClient).mockReturnValue({ beta: { messages: { parse: fn } } } as unknown as Anthropic);
  return fn;
}

describe("POST /api/revalue in Demo mode", () => {
  it("answers the rehearsed note with the rule-based parser", async () => {
    const { status, headers, body } = await call(
      revalueRequest({ note: REHEARSED, context: sampleContext("cap_rate"), code: null }),
    );
    expect(status).toBe(200);
    expect(headers.get("cache-control")).toBe("no-store");
    expect(headers.get("x-revalue-fallback")).toBeNull();
    const r = body as RevalueResult;
    expect(r.mode).toBe("demo");
    expect(only(r)).toMatchObject({ parameter: "capRate", from: 0.03, sourceKind: "valuer_judgement" });
    expect(r.changes[0].to).toBeCloseTo(0.034, 12);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("answers the plan's other notes", async () => {
    const ctx = sampleContext("cap_rate");
    const unclear = (await call(revalueRequest({ note: "make it nicer", context: ctx }))).body as RevalueResult;
    expect(unclear.clarifyingQuestion).toContain("Which value should I change");
    const question = (await call(revalueRequest({ note: "why 3.0 %?", context: ctx }))).body as RevalueResult;
    expect(question.intent).toBe("question");
  });

  it("rejects a note longer than 1,000 characters", async () => {
    const { status, body } = await call(revalueRequest({ note: "x".repeat(1001), context: sampleContext() }));
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: "note_too_long" });
    expect((await call(revalueRequest({ note: "a".repeat(1000), context: sampleContext() }))).status).toBe(200);
  });

  it("rejects a request without a valid note and context", async () => {
    expect((await call(revalueRequest({ note: "use 3.4 %" }))).status).toBe(400);
    expect((await call(revalueRequest({ note: 3.4, context: sampleContext() }))).status).toBe(400);
    expect((await call(revalueRequest(null, { raw: "{not json" }))).status).toBe(400);
    const { body } = await call(revalueRequest({ context: sampleContext() }));
    expect(body).toMatchObject({ ok: false, error: "bad_request" });
    const huge = await call(revalueRequest(null, { raw: JSON.stringify({ note: "x", pad: "y".repeat(300_000) }) }));
    expect(huge.status).toBe(413);
  });

  it("stays in Demo mode when the access code does not match", async () => {
    enableLiveAi();
    const parse = stubClaude(async () => {
      throw new Error("must not be called");
    });
    const { body } = await call(revalueRequest({ note: "attic rent 9,50", context: sampleContext(), code: "wrong" }));
    expect(parse).not.toHaveBeenCalled();
    expect((body as RevalueResult).mode).toBe("demo");
  });

  it("stays in Demo mode with the matching access code but no API key", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", ACCESS_CODE);
    const parse = stubClaude(async () => {
      throw new Error("must not be called");
    });
    const { body } = await call(revalueRequest({ note: "attic rent 9,50", context: sampleContext(), code: ACCESS_CODE }));
    expect(parse).not.toHaveBeenCalled();
    expect((body as RevalueResult).mode).toBe("demo");
  });

  it("allows 60 seconds per request", () => {
    expect(maxDuration).toBe(60);
  });
});

describe("POST /api/revalue with Live AI (stubbed client)", () => {
  beforeEach(enableLiveAi);

  it("asks Claude for structured output at medium effort, then validates the answer", async () => {
    const parse = stubClaude(async () => ({ stop_reason: "end_turn", content: [], parsed_output: modelAnswer() }));
    const ctx = sampleContext("cap_rate");
    const { status, headers, body } = await call(
      revalueRequest({ note: REHEARSED, context: ctx, code: ACCESS_CODE }, { ip: "192.0.2.31" }),
    );

    expect(status).toBe(200);
    expect(headers.get("x-revalue-fallback")).toBeNull();
    const r = body as RevalueResult;
    expect(r.mode).toBe("live");
    expect(only(r)).toMatchObject({ parameter: "capRate", from: 0.03, sourceKind: "valuer_judgement" });
    expect(r.changes[0].to).toBeCloseTo(0.034, 12);
    expect(r.changes[0].unitId).toBeUndefined();
    expect(r.changes[0].documentId).toBeUndefined();
    expect(r.explanation).toContain("3.4 %");
    // Neither secret ever reaches the client.
    expect(JSON.stringify(body)).not.toContain(ACCESS_CODE);
    expect(JSON.stringify(body)).not.toContain("sk-ant-test-not-a-real-key");

    expect(parse).toHaveBeenCalledTimes(1);
    const [params, options] = parse.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(params).toMatchObject({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: REVALUE_SYSTEM,
    });
    expect(MODEL).toBe("claude-opus-5-5");
    const config = params.output_config as { effort: string; format: { type: string } };
    expect(config.effort).toBe("medium");
    expect(config.format.type).toBe("json_schema");
    for (const key of ["temperature", "thinking", "top_p", "top_k"]) expect(params).not.toHaveProperty(key);
    expect(JSON.stringify(params)).not.toContain("budget_tokens");
    expect(params.messages).toEqual([{ role: "user", content: revalueUserMessage(REHEARSED, ctx) }]);
    expect(options).toEqual({ signal: expect.any(AbortSignal) });
  });

  it("falls back to the rule-based parser when Claude declines, without reading the output", async () => {
    stubClaude(async () => ({
      stop_reason: "refusal",
      content: [],
      get parsed_output(): never {
        throw new Error("parsed_output must not be read after a refusal");
      },
    }));
    const { status, headers, body } = await call(
      revalueRequest({ note: "attic rent 9,50", context: sampleContext(), code: ACCESS_CODE }, { ip: "192.0.2.32" }),
    );
    expect(status).toBe(200);
    expect(headers.get("x-revalue-fallback")).toBe("ai_refused");
    expect(body).toMatchObject({ mode: "demo", intent: "change_parameters" });
    expect((body as RevalueResult).changes[0]).toMatchObject({ unitId: "u8", to: 9.5 });
  });

  it("falls back to the parser when the answer does not parse or the call fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubClaude(async () => {
      throw new AnthropicError("Failed to parse structured output: parameter: Invalid option");
    });
    const { headers, body } = await call(
      revalueRequest({ note: "attic rent 9,50", context: sampleContext(), code: ACCESS_CODE }, { ip: "192.0.2.33" }),
    );
    expect(headers.get("x-revalue-fallback")).toBe("ai_error");
    expect((body as RevalueResult).mode).toBe("demo");
  });

  it("uses the parser once the hourly limit is reached", async () => {
    const ip = "198.51.100.40";
    for (let i = 0; i < 15; i++) checkRate(ip, "revalue");
    const parse = stubClaude(async () => {
      throw new Error("must not be called");
    });
    const { status, headers, body } = await call(
      revalueRequest({ note: REHEARSED, context: sampleContext("cap_rate"), code: ACCESS_CODE }, { ip }),
    );
    expect(parse).not.toHaveBeenCalled();
    expect(status).toBe(200);
    expect(headers.get("x-revalue-fallback")).toBe("rate_limited");
    expect(Number(headers.get("retry-after"))).toBeGreaterThan(0);
    expect((body as RevalueResult).mode).toBe("demo");
    expect((body as RevalueResult).changes[0].to).toBeCloseTo(0.034, 12);
  });

  it("does not spend a live call on an empty note", async () => {
    const parse = stubClaude(async () => {
      throw new Error("must not be called");
    });
    const request = revalueRequest({ note: "  ", context: sampleContext(), code: ACCESS_CODE }, { ip: "192.0.2.34" });
    const { body } = await call(request);
    expect(parse).not.toHaveBeenCalled();
    expect((body as RevalueResult).intent).toBe("unclear");
  });

  it("validates the model's answer against the deal", async () => {
    stubClaude(async () => ({
      stop_reason: "end_turn",
      content: [],
      parsed_output: modelAnswer({
        changes: [
          {
            parameter: "marketRentUnit",
            unitId: "u8",
            to: 9.5,
            reason: "Per the energy certificate",
            sourceKind: "document",
            documentId: "doc-invented",
          },
        ],
      }),
    }));
    const note = "the attic looks overpriced, use 9,50";
    const { body } = await call(revalueRequest({ note, context: sampleContext(), code: ACCESS_CODE }, { ip: "192.0.2.35" }));
    expect(only(body as RevalueResult)).toMatchObject({
      parameter: "marketRentUnit",
      unitId: "u8",
      from: 9.92,
      to: 9.5,
      sourceKind: "valuer_judgement",
    });
  });
});

describe("POST /api/revalue through the real SDK (fake transport, no network)", () => {
  beforeEach(enableLiveAi);

  function fakeTransport(reply: Record<string, unknown>) {
    const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      sent.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return Response.json(reply, { headers: { "request-id": "req_test" } });
    };
    vi.mocked(getClient).mockReturnValue(new Anthropic({ apiKey: "sk-ant-test-not-a-real-key", fetch, maxRetries: 0 }));
    return sent;
  }

  function message(content: unknown[], stopReason = "end_turn") {
    return {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: MODEL,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 1800, output_tokens: 600 },
    };
  }

  it("sends one Messages request with structured output, effort medium and the fallback opt-in", async () => {
    const sent = fakeTransport(
      message([
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: JSON.stringify(modelAnswer()) },
      ]),
    );
    const { body } = await call(
      revalueRequest({ note: REHEARSED, context: sampleContext("cap_rate"), code: ACCESS_CODE }, { ip: "192.0.2.40" }),
    );
    expect((body as RevalueResult).mode).toBe("live");
    expect((body as RevalueResult).changes[0].to).toBeCloseTo(0.034, 12);

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/v1\/messages$/);
    expect(sent[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const req = sent[0].body;
    expect(req).toMatchObject({ model: "claude-opus-5-5", max_tokens: 8000, fallbacks: "default" });
    expect(req.output_config).toEqual({
      effort: "medium",
      format: { type: "json_schema", schema: expect.any(Object) },
    });
    for (const key of ["temperature", "thinking", "betas"]) expect(req).not.toHaveProperty(key);
  });

  it("falls back to the parser for an answer outside the schema", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const offList = JSON.stringify(modelAnswer()).replace('"capRate"', '"landValue"');
    fakeTransport(message([{ type: "text", text: offList }]));
    const { headers, body } = await call(
      revalueRequest({ note: REHEARSED, context: sampleContext("cap_rate"), code: ACCESS_CODE }, { ip: "192.0.2.41" }),
    );
    expect(headers.get("x-revalue-fallback")).toBe("ai_error");
    expect((body as RevalueResult).mode).toBe("demo");
    expect((body as RevalueResult).changes[0].to).toBeCloseTo(0.034, 12);
  });

  it("falls back to the parser for a declined request", async () => {
    fakeTransport(message([], "refusal"));
    const { headers } = await call(
      revalueRequest({ note: REHEARSED, context: sampleContext("cap_rate"), code: ACCESS_CODE }, { ip: "192.0.2.42" }),
    );
    expect(headers.get("x-revalue-fallback")).toBe("ai_refused");
  });
});
