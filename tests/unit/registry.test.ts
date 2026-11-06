import { describe, expect, it } from "vitest";
import comparablesJson from "@/lib/data/comparables.json";
import type { Deal, Unit } from "@/lib/deal/types";
import { dealFromExtractions } from "@/lib/deal/fromExtraction";
import { buildFlags, type FlagContext } from "@/lib/flags/rules";
import { lookupLandValue } from "@/lib/lookups/boris";
import { ANNEX3 } from "@/lib/lookups/costs";
import { lookupCapRate } from "@/lib/lookups/marketReport";
import {
  buildRegistry,
  countBySource,
  dependentsOf,
  FIGURE_IDS,
  PARAM_FIGURE,
  SOURCE_TYPES,
  type Figure,
} from "@/lib/registry/registry";
import { estimateBuilding, type Comparable } from "@/lib/rent/estimator";
import {
  computeValuation,
  remainingLife,
  type ValuationInput,
  type ValuationParams,
} from "@/lib/valuation/engine";
import { computeSensitivities } from "@/lib/valuation/sensitivity";
import { TEST_SKELETON, sampleInputs } from "./fixtures/sampleExtractions";

/** The 38 bundled listings of spec §5.3.7. */
const comps = comparablesJson as Comparable[];

const VALUATION_YEAR = 2026;

function sampleDeal(): Deal {
  return dealFromExtractions(TEST_SKELETON, sampleInputs());
}

/** The flag context as the pipeline builds it (same as tests/unit/flags.test.ts). */
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

function registryFor(deal: Deal, patch: Partial<ValuationParams> = {}, valuerChanged: string[] = []): Figure[] {
  const ctx = contextFor(deal, patch);
  return buildRegistry({ ...ctx, flags: buildFlags(ctx), valuerChanged });
}

function fig(figs: Figure[], id: string): Figure {
  const found = figs.find((f) => f.id === id);
  if (!found) throw new Error(`No figure ${id}; got ${figs.map((f) => f.id).join(", ")}`);
  return found;
}

function column<K extends keyof Figure>(figs: Figure[], key: K): Record<string, Figure[K]> {
  return Object.fromEntries(figs.map((f) => [f.id, f[key]]));
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

/** Figure ids and source types of the plan's Task 7 table, in this order. */
const CANONICAL: [string, Figure["sourceType"]][] = [
  ["unitsCount", "client_document"],
  ["livingArea", "client_document"],
  ["inPlaceIncome", "client_document"],
  ["plotArea", "client_document"],
  ["builtYear", "client_document"],
  ["modernisationMeasures", "client_document"],
  ["heatingYear", "client_document"],
  ["zoning", "client_document"],
  ["easements", "client_document"],
  ["landValuePerM2", "public_data"],
  ["capRateRange", "public_data"],
  ["comparables", "public_data"],
  ["managementCost", "regulation"],
  ["maintenanceCost", "regulation"],
  ["rentLossRisk", "regulation"],
  ["totalLife", "regulation"],
  ["remainingLife", "regulation"],
  ["marketRent", "ai_estimate"],
  ["capRate", "ai_estimate"],
  ["underRentYears", "ai_estimate"],
  ["easementImpact", "ai_estimate"],
  ["grossIncome", "calculated"],
  ["operatingCosts", "calculated"],
  ["netIncome", "calculated"],
  ["landValue", "calculated"],
  ["landInterest", "calculated"],
  ["buildingNetIncome", "calculated"],
  ["pvFactor", "calculated"],
  ["buildingValue", "calculated"],
  ["underRentDeduction", "calculated"],
  ["marketValue", "calculated"],
];

const CANONICAL_COUNTS = {
  client_document: 9,
  public_data: 3,
  regulation: 5,
  ai_estimate: 4,
  calculated: 10,
  client_input: 0,
  valuer: 0,
};

describe("buildRegistry on the sample deal (spec §5.5)", () => {
  const ctx = contextFor(sampleDeal());
  const figs = buildRegistry({ ...ctx, flags: buildFlags(ctx), valuerChanged: [] });

  it("counts the canonical figures per source type", () => {
    expect(countBySource(figs)).toEqual(CANONICAL_COUNTS);
  });

  it("lists the figures in the plan's order, each with its default source type", () => {
    expect(figs.map((f) => [f.id, f.sourceType])).toEqual(CANONICAL);
    expect(FIGURE_IDS).toEqual(CANONICAL.map(([id]) => id));
  });

  it("finds every figure that depends on the cap rate, in registry order", () => {
    expect(dependentsOf(figs, ["capRate"])).toEqual([
      "landInterest",
      "buildingNetIncome",
      "pvFactor",
      "buildingValue",
      "underRentDeduction",
      "marketValue",
    ]);
  });

  it("records the engine's dependencies (spec §5.3.5)", () => {
    expect(Object.fromEntries(figs.filter((f) => f.dependsOn.length > 0).map((f) => [f.id, f.dependsOn]))).toEqual({
      remainingLife: ["builtYear", "modernisationMeasures", "totalLife"],
      grossIncome: ["marketRent", "livingArea", "unitsCount"],
      operatingCosts: ["managementCost", "maintenanceCost", "rentLossRisk", "grossIncome"],
      netIncome: ["grossIncome", "operatingCosts"],
      landValue: ["plotArea", "landValuePerM2"],
      landInterest: ["landValue", "capRate"],
      buildingNetIncome: ["netIncome", "landInterest"],
      pvFactor: ["capRate", "remainingLife"],
      buildingValue: ["buildingNetIncome", "pvFactor"],
      underRentDeduction: ["grossIncome", "inPlaceIncome", "underRentYears", "capRate"],
      marketValue: ["buildingValue", "landValue", "underRentDeduction", "easementImpact"],
    });
  });

  it("lists every figure after the figures it depends on", () => {
    const position = new Map(figs.map((f, i) => [f.id, i]));
    for (const [i, f] of figs.entries()) {
      for (const dep of f.dependsOn) {
        expect(position.get(dep), `${f.id} depends on ${dep}`).toBeLessThan(i);
      }
    }
  });

  it("shows the canonical values of spec §5.3", () => {
    expect(column(figs, "display")).toEqual({
      unitsCount: "8",
      livingArea: "565 m²",
      inPlaceIncome: "€60,484/yr",
      plotArea: "480 m²",
      builtYear: "1912",
      modernisationMeasures: "13",
      heatingYear: "2019",
      zoning: "General residential area (WA)",
      easements: "1",
      landValuePerM2: "520 €/m²",
      capRateRange: "2.5–3.5 %",
      comparables: "38",
      managementCost: "€367 per unit",
      maintenanceCost: "€14.40 per m²",
      rentLossRisk: "2.0 %",
      totalLife: "80 years",
      remainingLife: "42 years",
      marketRent: "9.60 €/m²",
      capRate: "3.0 %",
      underRentYears: "5 years",
      easementImpact: "±€0",
      grossIncome: "€65,088",
      operatingCosts: "€12,374",
      netIncome: "€52,714",
      landValue: "€249,600",
      landInterest: "€7,488",
      buildingNetIncome: "€45,226",
      pvFactor: "23.7014",
      buildingValue: "€1,071,923",
      underRentDeduction: "−€21,087",
      marketValue: "€1,300,000",
    });
  });

  it("labels every figure in English", () => {
    expect(column(figs, "label")).toEqual({
      unitsCount: "Units",
      livingArea: "Living area",
      inPlaceIncome: "In-place rent",
      plotArea: "Plot area",
      builtYear: "Year of construction",
      modernisationMeasures: "Modernisation points",
      heatingYear: "Heating year",
      zoning: "Zoning",
      easements: "Easements (section II)",
      landValuePerM2: "Standard land value",
      capRateRange: "Cap rate range",
      comparables: "Comparable listings",
      managementCost: "Management cost",
      maintenanceCost: "Maintenance cost",
      rentLossRisk: "Rent-loss risk",
      totalLife: "Total economic life",
      remainingLife: "Remaining economic life",
      marketRent: "Market rent (avg.)",
      capRate: "Cap rate",
      underRentYears: "Under-rent closing",
      easementImpact: "Easement impact",
      grossIncome: "Gross income",
      operatingCosts: "Operating costs",
      netIncome: "Net income",
      landValue: "Land value",
      landInterest: "Land-value interest",
      buildingNetIncome: "Building net income",
      pvFactor: "Present-value factor",
      buildingValue: "Building value",
      underRentDeduction: "Under-rent deduction",
      marketValue: "Market value",
    });
  });

  it("states each figure's source: document and page, table and row, annex, or formula", () => {
    expect(column(figs, "sourceDetail")).toEqual({
      unitsCount: "Tenant list (Mieterliste), p. 2: 8 unit rows",
      livingArea: "Tenant list (Mieterliste), p. 2: sum of the 8 unit rows",
      inPlaceIncome: "Tenant list (Mieterliste), p. 2: rent of the 8 let units × 12; total row €5,040.30 a month",
      plotArea: "Land register (Grundbuch), p. 1: Gemarkung Leipzig, Flur 12, Flurstück 123/4",
      builtYear: "Energy certificate (Energieausweis), p. 1",
      modernisationMeasures:
        "Refurbishment sheet (Sanierungsübersicht), p. 1: 6 measures 2014–2019; ImmoWertV Annex 2 points (simplified): roof 4, windows 2, pipes 2, heating 2, bathrooms 2, interior 1",
      heatingYear: "Energy certificate (Energieausweis); matches the refurbishment sheet",
      zoning: "Zoning plan (B-Plan), p. 1: residential use permitted",
      easements:
        "Land register (Grundbuch), p. 4, section II; the land charge in section III is financing and not value-relevant",
      landValuePerM2: "BORIS Sachsen (sample), zone 0412, as of 01 Jan 2026",
      capRateRange:
        "Market report 2026 (sample), valuation committee Leipzig, p. 47, table 12: multi-family houses built up to 1948, median 3.0 %, n = 64; no district figure",
      comparables:
        "Sample asking-rent listings: 23 from the last 12 months, 15 older and index-adjusted; location base 9.56 €/m²",
      managementCost: "ImmoWertV Annex 3 model value (indexed, sample): €367 × 8 units = €2,936 a year",
      maintenanceCost: "ImmoWertV Annex 3 model value (indexed, sample): €14.40 × 565 m² = €8,136 a year",
      rentLossRisk: "ImmoWertV Annex 3 model value (sample): 2.0 % of gross income = €1,302 a year",
      totalLife: "ImmoWertV Annex 1 model value for multi-family houses",
      remainingLife: "ImmoWertV Annex 2 model (simplified): built 1912, valuation year 2026, 13 modernisation points",
      marketRent:
        "Rent estimator on 38 comparable listings: location base 9.56 €/m², adjusted per unit for floor, size and features; plausible range 9.10–10.20 €/m²",
      capRate: "Median of the market report's 2.5–3.5 % range for multi-family houses built up to 1948 (n = 64)",
      underRentYears:
        "AI assumption: the under-rent of €4,604 a year closes within 5 years, as rent increases in sitting tenancies are capped (§ 558 BGB)",
      easementImpact: "AI assumption: the easement in section II is value-neutral",
      grossIncome: "Market rent 9.60 €/m² × 565 m² × 12 months",
      operatingCosts: "Management €2,936 + maintenance €8,136 + rent-loss risk €1,302 (19.0 % of gross income)",
      netIncome: "Gross income €65,088 − operating costs €12,374",
      landValue: "Plot area 480 m² × 520 €/m²",
      landInterest: "Land value €249,600 × cap rate 3.0 %",
      buildingNetIncome: "Net income €52,714 − land-value interest €7,488",
      pvFactor: "Annuity factor for 42 years at 3.0 %",
      buildingValue: "Building net income €45,226 × present-value factor 23.7014",
      underRentDeduction: "Under-rent of €4,604 a year × annuity factor 4.5797 (5 years at 3.0 %)",
      marketValue:
        "Building value €1,071,923 + land value €249,600 − under-rent deduction €21,087 = €1,300,437, rounded to the nearest €10,000",
    });
  });

  it("links each AI estimate to its judgement call, and nothing else on the sample deal", () => {
    expect(figs.filter((f) => f.flagId !== null).map((f) => [f.id, f.flagId])).toEqual([
      ["marketRent", "market_rent"],
      ["capRate", "cap_rate"],
      ["underRentYears", "under_rent"],
      ["easementImpact", "easement-1"],
    ]);
  });

  it("cites the verbatim passage of each value read from a single place in a document", () => {
    const { property } = ctx.deal;
    expect(figs.filter((f) => f.quote !== null).map((f) => f.id)).toEqual([
      "inPlaceIncome",
      "plotArea",
      "builtYear",
      "zoning",
      "easements",
    ]);
    expect(fig(figs, "inPlaceIncome").quote).toEqual({
      documentId: "doc-tenant-list",
      page: 2,
      quote: "Summe Nettokaltmiete / Monat 5.040,30 €",
      confidence: "high",
      verified: true,
    });
    expect(fig(figs, "plotArea").quote).toEqual(property.plotSource);
    expect(fig(figs, "builtYear").quote).toEqual(property.builtYearSource);
    expect(fig(figs, "zoning").quote).toEqual(property.zoning!.source);
    expect(fig(figs, "easements").quote).toEqual(property.easements[0].source);
    // Copies, so the UI cannot change the deal through a figure.
    expect(fig(figs, "plotArea").quote).not.toBe(property.plotSource);
  });

  it("grades the figures the AI read or estimated, and the land-value lookup by its own confidence", () => {
    expect(column(figs, "confidence")).toEqual({
      unitsCount: "high",
      livingArea: "high",
      inPlaceIncome: "high",
      plotArea: "high",
      builtYear: "high",
      modernisationMeasures: "high",
      heatingYear: "high",
      zoning: "high",
      easements: "high",
      landValuePerM2: "high",
      capRateRange: null,
      comparables: null,
      managementCost: null,
      maintenanceCost: null,
      rentLossRisk: null,
      totalLife: null,
      remainingLife: null,
      marketRent: "medium",
      capRate: "medium",
      underRentYears: "medium",
      easementImpact: "low",
      grossIncome: null,
      operatingCosts: null,
      netIncome: null,
      landValue: null,
      landInterest: null,
      buildingNetIncome: null,
      pvFactor: null,
      buildingValue: null,
      underRentDeduction: null,
      marketValue: null,
    });
  });

  it("leaves its context untouched and hands out fresh arrays", () => {
    const fresh = contextFor(sampleDeal());
    const input = { ...fresh, flags: buildFlags(fresh), valuerChanged: ["capRate"] };
    const before = structuredClone(input);
    const first = buildRegistry(input);
    expect(input).toEqual(before);

    fig(first, "marketValue").dependsOn.push("nonsense");
    expect(fig(buildRegistry(input), "marketValue").dependsOn).toEqual([
      "buildingValue",
      "landValue",
      "underRentDeduction",
      "easementImpact",
    ]);
  });
});

describe("countBySource", () => {
  it("has a key for every source type, zero when unused", () => {
    expect(countBySource([])).toEqual({
      client_document: 0,
      public_data: 0,
      regulation: 0,
      calculated: 0,
      ai_estimate: 0,
      client_input: 0,
      valuer: 0,
    });
    expect(SOURCE_TYPES).toEqual([
      "client_document",
      "public_data",
      "regulation",
      "calculated",
      "ai_estimate",
      "client_input",
      "valuer",
    ]);
  });
});

describe("figures changed by the valuer", () => {
  it("makes the cap rate a valuer figure with valuerChanged ['capRate'] (plan Task 7)", () => {
    const figs = registryFor(sampleDeal(), {}, ["capRate"]);
    expect(fig(figs, "capRate").sourceType).toBe("valuer");
    expect(countBySource(figs)).toEqual({ ...CANONICAL_COUNTS, ai_estimate: 3, valuer: 1 });
  });

  it("makes the cap rate a valuer figure in v2 (cap rate 3.4 %), with the values recomputed", () => {
    const figs = registryFor(sampleDeal(), { capRate: 0.034 }, ["capRate"]);
    expect(fig(figs, "capRate").sourceType).toBe("valuer");
    expect(fig(figs, "capRate")).toEqual({
      id: "capRate",
      label: "Cap rate",
      display: "3.4 %",
      sourceType: "valuer",
      sourceDetail:
        "Set by the valuer; the AI proposed 3.0 %, the median of the market report's 2.5–3.5 % range for multi-family houses built up to 1948",
      quote: null,
      confidence: null,
      dependsOn: [],
      flagId: "cap_rate",
    });
    expect(countBySource(figs)).toEqual({ ...CANONICAL_COUNTS, ai_estimate: 3, valuer: 1 });

    // Its dependents are recomputed but stay calculated.
    const dependents = dependentsOf(figs, ["capRate"]);
    expect(dependents.map((id) => fig(figs, id).sourceType)).toEqual(Array(6).fill("calculated"));
    expect(dependents.map((id) => fig(figs, id).display)).toEqual([
      "€8,486",
      "€44,228",
      "22.1897",
      "€981,405",
      "−€20,848",
      "€1,210,000",
    ]);
    expect(fig(figs, "pvFactor").sourceDetail).toBe("Annuity factor for 42 years at 3.4 %");
  });

  it("names what the AI proposed for each revisable figure", () => {
    const figs = registryFor(
      sampleDeal(),
      { marketRentFactor: 10 / 9.6, underRentYears: 8, easementDeduction: 12000, remainingLifeYears: 45 },
      ["marketRent", "underRentYears", "easementImpact", "remainingLife"],
    );
    expect(
      ["marketRent", "underRentYears", "easementImpact", "remainingLife"].map((id) => [
        fig(figs, id).sourceType,
        fig(figs, id).display,
        fig(figs, id).sourceDetail,
      ]),
    ).toEqual([
      ["valuer", "10.00 €/m²", "Set by the valuer; the rent estimator gives 9.60 €/m² (plausible range 9.10–10.20 €/m²)"],
      ["valuer", "8 years", expect.stringMatching(/^Set by the valuer; the under-rent is €[\d,]+ a year$/)],
      ["valuer", "−€12,000", "Set by the valuer for the easement in section II"],
      ["valuer", "45 years", "Set by the valuer; the ImmoWertV Annex 2 model gives 42 years"],
    ]);
    expect(countBySource(figs)).toEqual({ ...CANONICAL_COUNTS, regulation: 4, ai_estimate: 1, valuer: 4 });
  });

  it("accepts the revision's parameter keys for the figures they set", () => {
    expect(PARAM_FIGURE).toEqual({
      capRate: "capRate",
      marketRentAvg: "marketRent",
      marketRentUnit: "marketRent",
      underRentYears: "underRentYears",
      easementDeduction: "easementImpact",
      remainingLifeYears: "remainingLife",
    });
    const figs = registryFor(sampleDeal(), { marketRentOverrides: { u8: 9.5 } }, [
      "marketRentUnit",
      "easementDeduction",
      "remainingLifeYears",
    ]);
    expect(figs.filter((f) => f.sourceType === "valuer").map((f) => f.id)).toEqual([
      "remainingLife",
      "marketRent",
      "easementImpact",
    ]);
  });

  it("never marks a calculated figure as changed by the valuer: it follows from its inputs", () => {
    const figs = registryFor(sampleDeal(), { capRate: 0.034 }, ["marketValue", "landInterest", "capRate", "unknown"]);
    expect(figs.filter((f) => f.sourceType === "valuer").map((f) => f.id)).toEqual(["capRate"]);
    expect(fig(figs, "marketValue").sourceType).toBe("calculated");
  });
});

describe("units edited or added by the client", () => {
  it("makes living area and in-place rent client input when a unit's area is edited", () => {
    const deal = sampleDeal();
    deal.units[0] = { ...deal.units[0], areaM2: 70, clientEdited: ["areaM2"] };
    const figs = registryFor(deal);
    expect(fig(figs, "livingArea")).toMatchObject({
      sourceType: "client_input",
      display: "573 m²",
      sourceDetail: "Tenant list (Mieterliste), p. 2: sum of the 8 unit rows; changed by the client: area of GF left",
      quote: null,
      confidence: null,
    });
    expect(fig(figs, "inPlaceIncome")).toMatchObject({
      sourceType: "client_input",
      display: "€61,290/yr",
      sourceDetail:
        "Tenant list (Mieterliste), p. 2: rent of the 8 let units × 12; total row €5,040.30 a month; changed by the client: area of GF left",
      quote: null,
      confidence: null,
    });
    expect(fig(figs, "unitsCount").sourceType).toBe("client_document");
    expect(countBySource(figs)).toEqual({ ...CANONICAL_COUNTS, client_document: 7, client_input: 2 });
  });

  it("makes only the in-place rent client input when a rent is edited or a unit is marked vacant", () => {
    const deal = sampleDeal();
    deal.units[1] = { ...deal.units[1], inPlaceRentPerM2: 9, clientEdited: ["inPlaceRentPerM2"] };
    deal.units[7] = { ...deal.units[7], inPlaceRentPerM2: null, leaseSinceYear: null, clientEdited: ["inPlaceRentPerM2", "leaseSinceYear"] };
    const figs = registryFor(deal);
    expect(fig(figs, "livingArea").sourceType).toBe("client_document");
    expect(fig(figs, "inPlaceIncome")).toMatchObject({
      sourceType: "client_input",
      sourceDetail:
        "Tenant list (Mieterliste), p. 2: rent of the 7 let units × 12; total row €5,040.30 a month; changed by the client: rent of GF right, Attic",
    });
    expect(countBySource(figs)).toEqual({ ...CANONICAL_COUNTS, client_document: 8, client_input: 1 });
  });

  it("keeps the provenance when the client edits only facts that feed the AI's rent estimate", () => {
    const deal = sampleDeal();
    deal.units[3] = { ...deal.units[3], features: ["balcony", "renovated_bath"], floor: "2F", clientEdited: ["features", "floor"] };
    expect(countBySource(registryFor(deal))).toEqual(CANONICAL_COUNTS);
  });

  it("makes units and living area client input for a vacant unit added by hand, linked to its call", () => {
    const deal = sampleDeal();
    deal.units.push(manualUnit());
    const figs = registryFor(deal);
    expect(fig(figs, "unitsCount")).toMatchObject({
      sourceType: "client_input",
      display: "9",
      sourceDetail: "Tenant list (Mieterliste), p. 2: 8 unit rows; added by hand: Unit m1",
      flagId: "manual_unit-m1",
    });
    expect(fig(figs, "livingArea")).toMatchObject({
      sourceType: "client_input",
      display: "620 m²",
      sourceDetail: "Tenant list (Mieterliste), p. 2: sum of the 8 unit rows; added by hand: Unit m1",
      flagId: "manual_unit-m1",
    });
    // A vacant unit adds no in-place rent.
    expect(fig(figs, "inPlaceIncome")).toMatchObject({ sourceType: "client_document", display: "€60,484/yr", flagId: null });
    // (5,424.00 + 9.79 × 55) / 620 = 9.6169 €/m²
    expect(fig(figs, "grossIncome").sourceDetail).toBe(
      "Market rent 9.62 €/m² × 620 m² × 12 months; vacant units count at market rent",
    );
    expect(fig(figs, "marketValue").sourceDetail).toMatch(/ − vacancy deduction €3,231 = €[\d,]+, rounded to the nearest €10,000$/);
  });

  it("makes the in-place rent client input too for a let unit added by hand", () => {
    const deal = sampleDeal();
    deal.units.push(manualUnit({ label: "Attic 2", inPlaceRentPerM2: 9.5, leaseSinceYear: 2026 }));
    const figs = registryFor(deal);
    expect(fig(figs, "inPlaceIncome")).toMatchObject({
      sourceType: "client_input",
      sourceDetail:
        "Tenant list (Mieterliste), p. 2: rent of the 8 let units × 12; total row €5,040.30 a month; added by hand: Attic 2",
      flagId: "manual_unit-m1",
    });
    expect(countBySource(figs)).toEqual({ ...CANONICAL_COUNTS, client_document: 6, client_input: 3 });
  });
});

describe("missing and doubtful sources", () => {
  it("links the figures of a missing document to its flag", () => {
    const deal = dealFromExtractions(
      TEST_SKELETON,
      sampleInputs().filter((d) => d.doc.id !== "doc-zoning-plan"),
    );
    const figs = registryFor(deal);
    expect(fig(figs, "zoning")).toEqual({
      id: "zoning",
      label: "Zoning",
      display: "—",
      sourceType: "client_document",
      sourceDetail: "Zoning plan (B-Plan) missing",
      quote: null,
      confidence: null,
      dependsOn: [],
      flagId: "missing_document-zoning_plan",
    });
    expect(countBySource(figs)).toEqual(CANONICAL_COUNTS);
  });

  it("shows a missing land register in the plot, the easements and the land value", () => {
    const deal = dealFromExtractions(
      TEST_SKELETON,
      sampleInputs().filter((d) => d.doc.id !== "doc-land-register"),
    );
    const figs = registryFor(deal);
    for (const id of ["plotArea", "easements"]) {
      expect(fig(figs, id)).toMatchObject({
        display: "—",
        sourceDetail: "Land register (Grundbuch) missing",
        quote: null,
        confidence: null,
        flagId: "missing_document-land_register",
      });
    }
    expect(fig(figs, "landValue")).toMatchObject({ display: "€0", sourceDetail: "No plot area, so no land value" });
    // Without a land register the easements are unknown: the missing document questions the assumption.
    expect(fig(figs, "easementImpact")).toMatchObject({
      sourceType: "ai_estimate",
      display: "±€0",
      sourceDetail: "AI assumption: value-neutral; without a land register, no easements are known",
      confidence: "low",
      flagId: "missing_document-land_register",
    });
  });

  it("takes the heating year from the refurbishment sheet without an energy certificate", () => {
    const inputs = sampleInputs().filter((d) => d.doc.id !== "doc-energy-certificate");
    // The heating measure (row 3 of the sheet) read with low confidence.
    inputs[2].result.refurbishmentSheet!.measures[3].year.confidence = "low";
    const figs = registryFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(fig(figs, "builtYear")).toMatchObject({
      display: "—",
      sourceDetail: "Energy certificate (Energieausweis) missing",
      flagId: "missing_document-energy_certificate",
    });
    expect(fig(figs, "heatingYear")).toMatchObject({
      sourceType: "client_document",
      display: "2019",
      sourceDetail: "Refurbishment sheet (Sanierungsübersicht), p. 1: heating measure",
      quote: null,
      confidence: "low",
      flagId: "extraction-doc-refurbishment-sheet-refurbishmentSheet.measures.3.year",
    });
  });

  it("links a reading whose quote was not found to its extraction flag, with low confidence", () => {
    const inputs = sampleInputs();
    inputs[1].verified["landRegister.plotM2"] = false;
    const figs = registryFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(fig(figs, "plotArea")).toMatchObject({
      sourceType: "client_document",
      display: "480 m²",
      confidence: "low",
      flagId: "extraction-doc-land-register-landRegister.plotM2",
      quote: { documentId: "doc-land-register", page: 1, quote: "480 m²", verified: false },
    });
  });

  it("links a doubtful unit area to the living area only", () => {
    const inputs = sampleInputs();
    inputs[0].result.tenantList!.units[2].areaM2.confidence = "low";
    const figs = registryFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(fig(figs, "livingArea")).toMatchObject({
      confidence: "low",
      flagId: "extraction-doc-tenant-list-tenantList.units.2.areaM2",
    });
    expect(fig(figs, "unitsCount")).toMatchObject({ confidence: "high", flagId: null });
    expect(fig(figs, "inPlaceIncome")).toMatchObject({ confidence: "high", flagId: null });
  });

  it("takes the lowest confidence of the citations behind a figure when nothing doubts it", () => {
    const inputs = sampleInputs();
    // A medium-confidence reading raises no extraction flag.
    inputs[3].result.refurbishmentSheet!.measures[4].name.confidence = "medium";
    const figs = registryFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(fig(figs, "modernisationMeasures")).toMatchObject({ confidence: "medium", flagId: null });
  });

  it("links an unreadable rent to the in-place rent", () => {
    const inputs = sampleInputs();
    inputs[0].result.tenantList!.units[0].rentPerMonth = null;
    const figs = registryFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(fig(figs, "inPlaceIncome")).toMatchObject({
      confidence: "low",
      flagId: "extraction-doc-tenant-list-tenantList.units.0.rentPerMonth",
      sourceDetail: "Tenant list (Mieterliste), p. 2: rent of the 7 let units × 12; total row €5,040.30 a month",
    });
  });

  it("links the land value fallback for an address without a sample BORIS zone", () => {
    const deal = sampleDeal();
    deal.address = { ...deal.address, zip: "10115" };
    const figs = registryFor(deal);
    expect(fig(figs, "landValuePerM2")).toMatchObject({
      sourceType: "public_data",
      display: "400 €/m²",
      sourceDetail: "BORIS Sachsen (sample): no sample data for this address; fallback value as of 01 Jan 2026",
      confidence: "low",
      flagId: "land_value",
    });
    expect(fig(figs, "landValue").display).toBe("€192,000");
  });

  it("stays well-formed for a deal without any documents", () => {
    const figs = registryFor(dealFromExtractions(TEST_SKELETON, []));
    expect(figs.map((f) => f.id)).toEqual(FIGURE_IDS);
    expect(countBySource(figs)).toEqual(CANONICAL_COUNTS);
    for (const f of figs) {
      expect(`${f.display} | ${f.sourceDetail}`, f.id).not.toMatch(/NaN|undefined|Infinity|null/);
      expect(f.display, f.id).not.toBe("");
    }
    expect(column(figs, "flagId")).toMatchObject({
      unitsCount: "missing_document-tenant_list",
      livingArea: "missing_document-tenant_list",
      inPlaceIncome: "missing_document-tenant_list",
      plotArea: "missing_document-land_register",
      builtYear: "missing_document-energy_certificate",
      modernisationMeasures: "missing_document-refurbishment_sheet",
      heatingYear: "missing_document-energy_certificate",
      zoning: "missing_document-zoning_plan",
      easements: "missing_document-land_register",
    });
    expect(fig(figs, "unitsCount")).toMatchObject({ display: "0", sourceDetail: "Tenant list (Mieterliste) missing" });
    expect(fig(figs, "modernisationMeasures")).toMatchObject({
      display: "0",
      sourceDetail: "Refurbishment sheet (Sanierungsübersicht) missing: no modernisation credited",
    });
    expect(fig(figs, "marketRent").display).toBe("—");
  });
});

describe("dependentsOf", () => {
  const ctx = contextFor(sampleDeal());
  const figs = buildRegistry({ ...ctx, flags: buildFlags(ctx), valuerChanged: [] });

  it("follows the dependencies transitively, in registry order", () => {
    expect(dependentsOf(figs, ["marketRent"])).toEqual([
      "grossIncome",
      "operatingCosts",
      "netIncome",
      "buildingNetIncome",
      "buildingValue",
      "underRentDeduction",
      "marketValue",
    ]);
    expect(dependentsOf(figs, ["builtYear"])).toEqual(["remainingLife", "pvFactor", "buildingValue", "marketValue"]);
    expect(dependentsOf(figs, ["easementImpact"])).toEqual(["marketValue"]);
    expect(dependentsOf(figs, ["marketValue"])).toEqual([]);
  });

  it("excludes the ids themselves, even when one depends on another", () => {
    expect(dependentsOf(figs, ["capRate", "landInterest"])).toEqual([
      "buildingNetIncome",
      "pvFactor",
      "buildingValue",
      "underRentDeduction",
      "marketValue",
    ]);
    expect(dependentsOf(figs, ["underRentYears", "easementImpact"])).toEqual(["underRentDeduction", "marketValue"]);
  });

  it("ignores unknown ids and maps the revision's parameter keys to their figures", () => {
    expect(dependentsOf(figs, [])).toEqual([]);
    expect(dependentsOf(figs, ["nope"])).toEqual([]);
    expect(dependentsOf(figs, ["marketRentAvg"])).toEqual(dependentsOf(figs, ["marketRent"]));
    expect(dependentsOf(figs, ["remainingLifeYears"])).toEqual(["pvFactor", "buildingValue", "marketValue"]);
    expect(dependentsOf(figs, ["easementDeduction"])).toEqual(["marketValue"]);
  });
});
