import { describe, expect, it } from "vitest";
import comparablesJson from "@/lib/data/comparables.json";
import type { Deal, Unit } from "@/lib/deal/types";
import { dealFromExtractions } from "@/lib/deal/fromExtraction";
import { buildFlags, REQUIRED_DOCS, type Flag, type FlagContext } from "@/lib/flags/rules";
import { lookupLandValue } from "@/lib/lookups/boris";
import { ANNEX3 } from "@/lib/lookups/costs";
import { lookupCapRate } from "@/lib/lookups/marketReport";
import { estimateBuilding, type Comparable } from "@/lib/rent/estimator";
import {
  computeValuation,
  remainingLife,
  type ValuationInput,
  type ValuationParams,
} from "@/lib/valuation/engine";
import { computeSensitivities, type Sensitivity } from "@/lib/valuation/sensitivity";
import { TEST_SKELETON, sampleInputs } from "./fixtures/sampleExtractions";

/** The 38 bundled listings of spec §5.3.7. */
const comps = comparablesJson as Comparable[];

const VALUATION_YEAR = 2026;

function sampleDeal(): Deal {
  return dealFromExtractions(TEST_SKELETON, sampleInputs());
}

/**
 * The flag context as the pipeline builds it (Tasks 2–5): estimator rents, the sample lookups, v1 parameters
 * (cap rate = committee median, 42 years, 5 years under-rent), the engine, and the sensitivities over the committee
 * range, the estimator's plausible range, 3–8 years and 5 % of land value.
 */
function contextFor(deal: Deal, patch: Partial<ValuationParams> = {}): FlagContext {
  const rent = estimateBuilding(deal.units, comps);
  const builtYear = deal.property.builtYear ?? 1912;
  const capRate = lookupCapRate(builtYear);
  const land = lookupLandValue(deal.address.zip);
  const params: ValuationParams = {
    capRate: capRate.row.median,
    remainingLifeYears: remainingLife(builtYear, VALUATION_YEAR, deal.property.modernisationPoints),
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
  return { deal, valuation, rent, capRate, land, sensitivities, params };
}

function flagsFor(deal: Deal, patch: Partial<ValuationParams> = {}): Flag[] {
  return buildFlags(contextFor(deal, patch));
}

function flag(flags: Flag[], id: string): Flag {
  const found = flags.find((f) => f.id === id);
  if (!found) throw new Error(`No flag ${id}; got ${flags.map((f) => f.id).join(", ")}`);
  return found;
}

/** The swing rounded to whole euros, as the plan's canonical table states it. */
function roundedSwing(f: Flag): [number, number] | null {
  return f.swing && [Math.round(f.swing.low), Math.round(f.swing.high)];
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

const CANONICAL_IDS = ["cap_rate", "market_rent", "under_rent", "easement-1"];

describe("buildFlags on the sample deal (spec §5.3.6)", () => {
  const ctx = contextFor(sampleDeal());
  const flags = buildFlags(ctx);

  it("raises exactly the 4 canonical judgement calls, biggest € impact first", () => {
    expect(flags.map((f) => f.id)).toEqual(CANONICAL_IDS);
    expect(flags.map((f) => f.kind)).toEqual(["cap_rate", "market_rent", "under_rent", "easement"]);
    expect(flags.map((f) => f.title)).toEqual([
      "Cap rate 3.0 %",
      "Market rent 9.60 €/m² (avg. of 8 units)",
      "Under-rent closes within 5 years",
      "Utility easement assumed value-neutral",
    ]);
    expect(flags.map((f) => f.confidence)).toEqual(["medium", "medium", "medium", "low"]);
    expect(flags.map(roundedSwing)).toEqual([
      [-111366, 127765],
      [-63215, 75859],
      [-11235, 8063],
      [-12480, 0],
    ]);
  });

  it("puts the downside in `low` and the upside in `high`, labelled with the input at that end", () => {
    expect(flags.map((f) => [f.swing?.lowLabel, f.swing?.highLabel])).toEqual([
      ["3.5 %", "2.5 %"],
      ["9.10 €/m²", "10.20 €/m²"],
      ["8 years", "3 years"],
      ["5 % of land value", "value-neutral"],
    ]);
  });

  it("takes the swings unrounded from the engine's sensitivities", () => {
    const byKey = Object.fromEntries(ctx.sensitivities.map((s) => [s.key, s])) as Record<Sensitivity["key"], Sensitivity>;
    expect(flag(flags, "cap_rate").swing).toMatchObject({ low: byKey.capRate.high.delta, high: byKey.capRate.low.delta });
    expect(flag(flags, "market_rent").swing).toMatchObject({
      low: byKey.marketRent.low.delta,
      high: byKey.marketRent.high.delta,
    });
    expect(flag(flags, "under_rent").swing).toMatchObject({
      low: byKey.underRentYears.high.delta,
      high: byKey.underRentYears.low.delta,
    });
    expect(flag(flags, "easement-1").swing).toMatchObject({ low: byKey.easement.low.delta, high: 0 });
  });

  it("offers to accept the AI's figure", () => {
    expect(flags.map((f) => f.acceptLabel)).toEqual(["Accept 3.0 %", "Accept 9.60 €/m²", "Accept 5 years", "Accept ±€0"]);
  });

  it("explains each call with the spec's sentences, numbers filled from the data", () => {
    expect(flags.map((f) => [f.whyFlagged, f.changeMind])).toEqual([
      [
        "The market report gives no district figure for 04109, so the AI used the city-wide median of the 2.5–3.5 % range for pre-war MFH.",
        "A district cap rate, or recent sales of pre-war houses in 04109.",
      ],
      // The spec gives no change-of-mind sentence for the market rent ("—"); its support takes that place.
      ["These are asking rents, not leases, and 15 of the 38 listings are older than 12 months.", ""],
      [
        "Rent increases in sitting tenancies are capped (§ 558 BGB, local rent index).",
        "The dates of the last rent increase per unit.",
      ],
      [
        "The route of the utility line is not documented; the AI assumes it runs along the boundary.",
        "A cadastral map showing the line crossing the buildable area.",
      ],
    ]);
  });

  it("supports the market rent with the most recent letting in the building", () => {
    expect(flag(flags, "market_rent").support).toBe(
      "Unit 4 was re-let in 2025 at 9.40 €/m² against an estimate of 9.64 €/m² (−2.5 %).",
    );
    expect(flags.filter((f) => f.id !== "market_rent").map((f) => f.support)).toEqual([null, null, null]);
  });

  it("summarises each call from the data", () => {
    expect(flags.map((f) => f.summary)).toEqual([
      "Median of the valuation committee's city-wide range for multi-family houses built up to 1948 (2.5–3.5 %, n = 64).",
      "Estimated per unit from 38 comparable listings (location base 9.56 €/m²); units range from 9.17 to 9.92 €/m².",
      "All 8 units pay below market (8.92 vs. 9.60 €/m²; unit gaps from −2.5 % to −10.9 %). The gap of €4,604 a year is deducted until it closes.",
      "Land register, section II: Limited personal easement (utility line right) for the municipal utility; registered 14 Mar 1998.",
    ]);
  });

  it("points each call to its evidence", () => {
    expect(flags.map((f) => f.evidence)).toEqual([
      { type: "market_report", rowKey: "mfh_pre1949" },
      { type: "comparables" },
      {
        type: "document",
        quote: {
          documentId: "doc-tenant-list",
          page: 2,
          quote: "Summe Nettokaltmiete / Monat 5.040,30 €",
          confidence: "high",
          verified: true,
        },
      },
      { type: "easement", easementId: "1" },
    ]);
  });

  it("ranks by the whole swing |low| + |high|: under-rent (−11,235 / +8,063) before the easement (−12,480 / 0)", () => {
    // By the larger end alone the easement (12,480) would outrank the under-rent (11,235), against the spec's order.
    const wider = buildFlags({
      ...ctx,
      sensitivities: ctx.sensitivities.map((s) =>
        s.key === "easement" ? { ...s, low: { input: -25000, delta: -25000 }, high: { input: 0, delta: 0 } } : s,
      ),
    });
    expect(wider.map((f) => f.id)).toEqual(["cap_rate", "market_rent", "easement-1", "under_rent"]);
    expect(flag(wider, "easement-1").swing?.lowLabel).toBe("10 % of land value");
  });

  it("leaves its context untouched", () => {
    const fresh = contextFor(sampleDeal());
    const before = structuredClone(fresh);
    buildFlags(fresh);
    expect(fresh).toEqual(before);
  });

  it("lists the required document types", () => {
    expect(REQUIRED_DOCS).toEqual(["tenant_list", "land_register", "energy_certificate", "refurbishment_sheet", "zoning_plan"]);
  });
});

describe("missing documents", () => {
  it("adds missing_document-zoning_plan when the zoning plan is removed", () => {
    const deal = dealFromExtractions(
      TEST_SKELETON,
      sampleInputs().filter((d) => d.doc.id !== "doc-zoning-plan"),
    );
    const flags = flagsFor(deal);
    expect(flags.map((f) => f.id)).toEqual([...CANONICAL_IDS, "missing_document-zoning_plan"]);
    expect(flag(flags, "missing_document-zoning_plan")).toEqual({
      id: "missing_document-zoning_plan",
      kind: "missing_document",
      title: "Zoning plan (B-Plan) missing",
      confidence: "medium",
      summary: "None of the 4 uploaded documents is a zoning plan.",
      whyFlagged: "Without a zoning plan, the AI assumes the current residential use is permitted.",
      changeMind: "An excerpt from the zoning plan (B-Plan) for the plot.",
      support: null,
      swing: null,
      evidence: { type: "none" },
      acceptLabel: "Accept without zoning plan",
    });
  });

  it("flags every required type without a readable document, in the order of REQUIRED_DOCS", () => {
    const ctx = contextFor(sampleDeal());
    const noDocs = buildFlags({ ...ctx, deal: { ...ctx.deal, documents: [] } });
    expect(noDocs.filter((f) => f.kind === "missing_document").map((f) => f.id)).toEqual(
      REQUIRED_DOCS.map((t) => `missing_document-${t}`),
    );
    expect(flag(noDocs, "missing_document-energy_certificate").summary).toBe("No documents were uploaded.");
    expect(flag(noDocs, "missing_document-tenant_list").confidence).toBe("low");

    // A failed or unclassified document does not count; a Wohnungsgrundbuch stands in for the land register.
    const documents = ctx.deal.documents.map((d) =>
      d.type === "tenant_list"
        ? { ...d, status: "failed" as const }
        : d.type === "energy_certificate"
          ? { ...d, type: "unknown" as const }
          : d.type === "land_register"
            ? { ...d, type: "condo_land_register" as const }
            : d,
    );
    const mixed = buildFlags({ ...ctx, deal: { ...ctx.deal, documents } });
    expect(mixed.filter((f) => f.kind === "missing_document").map((f) => f.id)).toEqual([
      "missing_document-tenant_list",
      "missing_document-energy_certificate",
    ]);
    expect(flag(mixed, "missing_document-energy_certificate").title).toBe("Energy certificate (Energieausweis) missing");
    expect(flag(mixed, "missing_document-energy_certificate").acceptLabel).toBe("Accept without energy certificate");
    expect(flag(mixed, "missing_document-energy_certificate").summary).toBe(
      "None of the 5 uploaded documents is an energy certificate.",
    );
  });
});

describe("vacant units", () => {
  it("adds vacancy-u8 with the vacancy deduction as its downside when u8 is vacant", () => {
    const deal = sampleDeal();
    deal.units[7] = { ...deal.units[7], inPlaceRentPerM2: null, leaseSinceYear: null };
    const ctx = contextFor(deal);
    expect(ctx.valuation.vacancyDeduction).toBeCloseTo(5237.76, 6);

    const flags = buildFlags(ctx);
    expect(flags.map((f) => f.id)).toEqual([...CANONICAL_IDS, "vacancy-u8"]);
    const vacancy = flag(flags, "vacancy-u8");
    expect(Math.abs(vacancy.swing!.low - -5238)).toBeLessThanOrEqual(1);
    expect(vacancy.swing!.low).toBeCloseTo(-5237.76, 6);
    expect(vacancy).toMatchObject({
      kind: "vacancy",
      title: "Attic vacant: re-let within 6 months",
      confidence: "medium",
      summary: "Valued at the market rent of 9.92 €/m² (€872.96 a month), less 6 months' rent for re-letting: −€5,238.",
      whyFlagged: "Attic is vacant, so the AI assumes it is re-let at market rent after 6 months.",
      support: null,
      swing: { high: 0, lowLabel: "6 months", highLabel: "0 months" },
      evidence: { type: "document", quote: deal.units[7].source },
      acceptLabel: "Accept 6 months",
    });
  });

  it("splits the vacancy deduction over several vacant units by their market rent", () => {
    const deal = sampleDeal();
    for (const i of [0, 7]) deal.units[i] = { ...deal.units[i], inPlaceRentPerM2: null, leaseSinceYear: null };
    const ctx = contextFor(deal);
    const flags = buildFlags(ctx);
    const lows = ["vacancy-u1", "vacancy-u8"].map((id) => flag(flags, id).swing!.low);
    expect(lows[0]).toBeCloseTo(-573.5 * 6, 6);
    expect(lows[1]).toBeCloseTo(-872.96 * 6, 6);
    expect(lows[0] + lows[1]).toBeCloseTo(-ctx.valuation.vacancyDeduction, 6);
    // Ranked by impact: the attic's larger deduction first.
    expect(flags.map((f) => f.id).slice(-2)).toEqual(["vacancy-u8", "vacancy-u1"]);
  });
});

describe("land value", () => {
  it("adds land_value for postcode 10115, which has no sample BORIS zone", () => {
    const deal = sampleDeal();
    deal.address = { ...deal.address, zip: "10115" };
    const flags = flagsFor(deal);
    expect(flags.map((f) => f.id)).toEqual([...CANONICAL_IDS, "land_value"]);
    expect(flag(flags, "land_value")).toEqual({
      id: "land_value",
      kind: "land_value",
      title: "Land value 400 €/m² assumed",
      confidence: "low",
      summary: "No sample data for this address: the AI applied a fallback of 400 €/m² to the 480 m² plot (€192,000).",
      whyFlagged:
        "The sample BORIS table has no standard land value (Bodenrichtwert) for 10115, so the AI used a fallback value.",
      changeMind: "The standard land value (Bodenrichtwert) for the address, from BORIS.",
      support: null,
      swing: null,
      evidence: { type: "land_value" },
      acceptLabel: "Accept 400 €/m²",
    });
    expect(flag(flags, "cap_rate").whyFlagged).toBe(
      "The market report gives no district figure for 10115, so the AI used the city-wide median of the 2.5–3.5 % range for pre-war MFH.",
    );
    // 5 % of the lower land value (192,000).
    expect(roundedSwing(flag(flags, "easement-1"))).toEqual([-9600, 0]);
  });
});

describe("units added by hand", () => {
  it("flags a manual unit with its estimated rent, and its vacancy", () => {
    const deal = sampleDeal();
    deal.units.push(manualUnit());
    const ctx = contextFor(deal);
    const estimate = ctx.rent.units.find((e) => e.unitId === "m1")!;
    expect(estimate.rentPerM2).toBe(9.79);

    const flags = buildFlags(ctx);
    expect(flags.map((f) => f.id)).toEqual([...CANONICAL_IDS, "vacancy-m1", "manual_unit-m1"]);
    expect(flag(flags, "market_rent").title).toMatch(/\(avg\. of 9 units\)$/);
    expect(flag(flags, "manual_unit-m1")).toEqual({
      id: "manual_unit-m1",
      kind: "manual_unit",
      title: "Unit m1 added by hand, market rent 9.79 €/m²",
      confidence: "low",
      summary: `55 m², 2nd floor, balcony; market rent estimated from ${estimate.comparableIds.length} comparable listings of similar size (${estimate.confidence} confidence).`,
      whyFlagged: "Unit m1 was added by hand and is not in the tenant list, so no document confirms it.",
      changeMind: "A tenant list or lease that includes the unit.",
      support: null,
      swing: null,
      evidence: { type: "comparables" },
      acceptLabel: "Accept 9.79 €/m²",
    });
    const vacancy = flag(flags, "vacancy-m1");
    expect(roundedSwing(vacancy)).toEqual([-Math.round(9.79 * 55 * 6), 0]);
    expect(vacancy.title).toBe("Unit m1 vacant: re-let within 6 months");
    expect(vacancy.evidence).toEqual({ type: "comparables" });
  });

  it("names a manual unit by its label when it has one", () => {
    const deal = sampleDeal();
    deal.units.push(manualUnit({ label: "Attic 2", inPlaceRentPerM2: 9.5, leaseSinceYear: 2026 }));
    const flags = flagsFor(deal);
    expect(flag(flags, "manual_unit-m1").title).toBe("Attic 2 added by hand, market rent 9.79 €/m²");
    expect(flags.some((f) => f.id === "vacancy-m1")).toBe(false);
    // A unit added by hand is no document evidence for the market rent.
    expect(flag(flags, "market_rent").support).toMatch(/^Unit 4 was re-let in 2025/);
  });
});

describe("extraction flags", () => {
  it("flags a field whose quote was not found on its page, pointing to that quote", () => {
    const inputs = sampleInputs();
    inputs[1].verified["landRegister.plotM2"] = false;
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    const flags = flagsFor(deal);
    expect(flags.map((f) => f.id)).toEqual([...CANONICAL_IDS, "extraction-doc-land-register-landRegister.plotM2"]);
    expect(flag(flags, "extraction-doc-land-register-landRegister.plotM2")).toEqual({
      id: "extraction-doc-land-register-landRegister.plotM2",
      kind: "extraction",
      title: "AI unsure: plot area in the land register",
      confidence: "low",
      summary: "Read from p. 1: “480 m²”.",
      whyFlagged: "The quote was not found on p. 1 of the land register, so the value could not be traced.",
      changeMind: "Confirmation that the value matches the land register, p. 1.",
      support: null,
      swing: null,
      evidence: { type: "document", quote: deal.property.plotSource },
      acceptLabel: "Confirm reading",
    });
  });

  it("flags a low-confidence field with the quote of its row", () => {
    const inputs = sampleInputs();
    inputs[0].result.tenantList!.units[2].areaM2.confidence = "low";
    inputs[3].result.refurbishmentSheet!.measures[0].name.confidence = "low";
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    const flags = flagsFor(deal);

    const area = flag(flags, "extraction-doc-tenant-list-tenantList.units.2.areaM2");
    expect(area.title).toBe("AI unsure: area of 1F left in the tenant list");
    expect(area.evidence).toEqual({ type: "document", quote: deal.units[2].source });
    expect(area.summary).toBe("Read from the tenant list, p. 2.");
    expect(area.whyFlagged).toBe("The AI marked this value as uncertain, or its quote was not found on the stated page.");
    expect(area.changeMind).toBe("Confirmation that the value matches the tenant list, p. 2.");

    const measure = flag(flags, "extraction-doc-refurbishment-sheet-refurbishmentSheet.measures.0.name");
    expect(measure.title).toBe("AI unsure: measure “Roof incl. insulation” in the refurbishment sheet");
    expect(measure.whyFlagged).toBe("The AI read this value with low confidence.");
    expect(measure.summary).toBe("Read from p. 1: “Dacherneuerung inkl. Wärmedämmung”.");

    // Without a swing they follow the swing flags, in document order.
    expect(flags.map((f) => f.id).slice(4)).toEqual([
      "extraction-doc-tenant-list-tenantList.units.2.areaM2",
      "extraction-doc-refurbishment-sheet-refurbishmentSheet.measures.0.name",
    ]);
  });

  it("explains an unreadable rent of a let unit, which is then valued as vacant", () => {
    const inputs = sampleInputs();
    inputs[0].result.tenantList!.units[0].rentPerMonth = null;
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    const flags = flagsFor(deal);
    const rent = flag(flags, "extraction-doc-tenant-list-tenantList.units.0.rentPerMonth");
    expect(rent.title).toBe("AI unsure: rent of GF left in the tenant list");
    expect(rent.summary).toBe("No rent could be read for GF left.");
    expect(rent.whyFlagged).toBe(
      "The tenant list shows GF left as let, but the AI could not read its rent, so the unit is valued as vacant.",
    );
    expect(rent.changeMind).toBe("The unit's rent per month from the tenant list or the lease.");
    expect(flag(flags, "vacancy-u1").title).toBe("GF left vacant: re-let within 6 months");
  });
});

describe("the rules follow the data", () => {
  it("drops the under-rent call when the gap is 3 % or less", () => {
    const deal = sampleDeal();
    const estimates = estimateBuilding(deal.units, comps).units;
    deal.units = deal.units.map((u, i) => ({ ...u, inPlaceRentPerM2: estimates[i].rentPerM2 }));
    expect(flagsFor(deal).map((f) => f.id)).toEqual(["cap_rate", "market_rent", "easement-1"]);
  });

  it("calls an in-place rent above market an over-rent", () => {
    const deal = sampleDeal();
    const estimates = estimateBuilding(deal.units, comps).units;
    deal.units = deal.units.map((u, i) => ({ ...u, inPlaceRentPerM2: Math.round(estimates[i].rentPerM2 * 110) / 100 }));
    const overRent = flag(flagsFor(deal), "under_rent");
    expect(overRent.title).toBe("Over-rent lasts 5 years");
    expect(overRent.whyFlagged).toBe("In-place rents above market last only until the tenants move out.");
    expect(overRent.changeMind).toBe("The remaining lease terms of the units let above market.");
    expect(overRent.summary).toMatch(
      /^All 8 units pay above market \(10\.\d\d vs\. 9\.60 €\/m²; unit gaps? (from )?\+[^)]*\)\. The surplus of €[\d,]+ a year is added until it ends\.$/,
    );
    // A shorter over-rent is the downside now.
    expect([overRent.swing?.lowLabel, overRent.swing?.highLabel]).toEqual(["3 years", "8 years"]);
    expect(overRent.swing!.low).toBeLessThan(0);
    expect(overRent.swing!.high).toBeGreaterThan(0);
  });

  it("does not raise the cap-rate call when the market report has a district figure", () => {
    const ctx = contextFor(sampleDeal());
    const flags = buildFlags({ ...ctx, capRate: { ...ctx.capRate, districtValue: 0.031 } });
    expect(flags.map((f) => f.id)).toEqual(["market_rent", "under_rent", "easement-1"]);
  });

  it("grades the market-rent call by the listings behind it", () => {
    const ctx = contextFor(sampleDeal());
    const recent = buildFlags({ ...ctx, rent: { ...ctx.rent, recentCount: 35, olderCount: 3, olderShare: 3 / 38 } });
    expect(recent.some((f) => f.kind === "market_rent")).toBe(false);

    const few = flag(buildFlags({ ...ctx, rent: { ...ctx.rent, recentCount: 8, olderCount: 1, olderShare: 1 / 9 } }), "market_rent");
    expect(few.confidence).toBe("medium");
    expect(few.whyFlagged).toBe("These are asking rents, not leases, and only 9 comparable listings were found.");

    const fewAndOld = flag(buildFlags({ ...ctx, rent: { ...ctx.rent, recentCount: 2, olderCount: 6, olderShare: 6 / 8 } }), "market_rent");
    expect(fewAndOld.confidence).toBe("low");
    expect(fewAndOld.whyFlagged).toBe(
      "These are asking rents, not leases, and only 8 comparable listings were found, 6 of them older than 12 months.",
    );
  });

  it("leaves out the support when no unit was let in the last two years, and takes the latest letting otherwise", () => {
    const old = sampleDeal();
    old.units[3] = { ...old.units[3], leaseSinceYear: 2015 };
    expect(flag(flagsFor(old), "market_rent").support).toBeNull();

    // Two years before the valuation year (2026) still counts: unit 3, let in 2024.
    old.units[2] = { ...old.units[2], leaseSinceYear: 2024 };
    expect(flag(flagsFor(old), "market_rent").support).toBe(
      "Unit 3 was re-let in 2024 at 9.20 €/m² against an estimate of 9.61 €/m² (−4.3 %).",
    );

    const latest = sampleDeal();
    latest.units[6] = { ...latest.units[6], leaseSinceYear: 2026 };
    expect(flag(flagsFor(latest), "market_rent").support).toBe(
      "Unit 7 was re-let in 2026 at 9.10 €/m² against an estimate of 9.71 €/m² (−6.3 %).",
    );
  });

  it("follows the valuer's parameters: cap rate 3.4 % (v2)", () => {
    const flags = flagsFor(sampleDeal(), { capRate: 0.034 });
    expect(flags.map((f) => f.id)).toEqual(CANONICAL_IDS);
    const capRate = flag(flags, "cap_rate");
    expect(capRate.title).toBe("Cap rate 3.4 %");
    expect(capRate.acceptLabel).toBe("Accept 3.4 %");
    expect(capRate.summary).toBe(
      "Set by the valuer; the AI proposed 3.0 %, the median of the valuation committee's city-wide range for multi-family houses built up to 1948 (2.5–3.5 %, n = 64).",
    );
    expect([capRate.swing?.lowLabel, capRate.swing?.highLabel]).toEqual(["3.5 %", "2.5 %"]);
    expect(capRate.swing!.low).toBeLessThan(0);
    expect(capRate.swing!.high).toBeGreaterThan(127765);
  });

  it("follows the valuer's parameters: market rent 10.00 and an easement deduction", () => {
    const flags = flagsFor(sampleDeal(), { marketRentFactor: 10 / 9.6, easementDeduction: 12000, underRentYears: 8 });
    expect(flag(flags, "market_rent").title).toBe("Market rent 10.00 €/m² (avg. of 8 units)");
    expect(flag(flags, "market_rent").acceptLabel).toBe("Accept 10.00 €/m²");
    expect(flag(flags, "market_rent").summary).toMatch(/ The valuer adjusted the market rent\.$/);
    expect(flag(flags, "under_rent").title).toBe("Under-rent closes within 8 years");
    expect(flag(flags, "easement-1").title).toBe("Utility easement deducted at €12,000");
    expect(flag(flags, "easement-1").acceptLabel).toBe("Accept −€12,000");
  });

  it("raises one easement call per section II entry, worded by the kind of right", () => {
    const inputs = sampleInputs();
    const land = inputs[1].result.landRegister!;
    land.easements.push({
      text: { value: "Geh- und Fahrtrecht für den jeweiligen Eigentümer von Flurstück 123/5", page: 4, quote: "Geh- und Fahrtrecht", confidence: "high" },
      translationEn: "Right of way on foot and by vehicle for the owner of parcel 123/5",
    });
    const flags = flagsFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(flags.filter((f) => f.kind === "easement").map((f) => f.id)).toEqual(["easement-1", "easement-2"]);
    const way = flag(flags, "easement-2");
    expect(way.title).toBe("Right of way assumed value-neutral");
    expect(way.whyFlagged).toBe("The route of the right of way is not documented; the AI assumes it runs along the boundary.");
    expect(way.summary).toBe("Land register, section II: Right of way on foot and by vehicle for the owner of parcel 123/5.");
    expect(way.evidence).toEqual({ type: "easement", easementId: "2" });
  });

  it("puts the calls without a swing last, in FlagKind order", () => {
    const inputs = sampleInputs().filter((d) => d.doc.id !== "doc-zoning-plan");
    inputs[1].verified["landRegister.plotM2"] = false;
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    deal.units.push(manualUnit());
    deal.address = { ...deal.address, zip: "10115" };
    expect(flagsFor(deal).map((f) => f.id)).toEqual([
      ...CANONICAL_IDS,
      "vacancy-m1",
      "missing_document-zoning_plan",
      "extraction-doc-land-register-landRegister.plotM2",
      "manual_unit-m1",
      "land_value",
    ]);
  });

  it("leaves the swing out when the sensitivities are missing", () => {
    const ctx = contextFor(sampleDeal());
    const flags = buildFlags({ ...ctx, sensitivities: [] });
    expect(flags.map((f) => f.id)).toEqual(CANONICAL_IDS);
    expect(flags.map((f) => f.swing)).toEqual([null, null, null, null]);
  });
});
