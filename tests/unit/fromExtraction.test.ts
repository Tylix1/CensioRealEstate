import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import comparablesJson from "@/lib/data/comparables.json";
import type { Deal, MeasureCategory, Unit } from "@/lib/deal/types";
import { runCrossChecks, type CrossCheck } from "@/lib/deal/crossChecks";
import { citedFields, dealFromExtractions } from "@/lib/deal/fromExtraction";
import { measurePoints, totalModernisationPoints } from "@/lib/extraction/points";
import { cited, ExtractionResultSchema } from "@/lib/extraction/schemas";
import { estimateBuilding, type Comparable } from "@/lib/rent/estimator";
import { EASEMENT_TEXT, SAMPLE_EXTRACTIONS, TEST_SKELETON, sampleInputs } from "./fixtures/sampleExtractions";

/** The 38 bundled listings of spec §5.3.7. */
const comps = comparablesJson as Comparable[];

function sampleDeal(): Deal {
  return dealFromExtractions(TEST_SKELETON, sampleInputs());
}

/** The rent estimator's market rents (Task 4): 9.25, 9.17, 9.61, 9.64, 9.65, 9.72, 9.71, 9.92 for the sample units. */
function marketRents(deal: Deal): Record<string, number> {
  return Object.fromEntries(estimateBuilding(deal.units, comps).units.map((e) => [e.unitId, e.rentPerM2]));
}

function byId(checks: CrossCheck[]): Record<CrossCheck["id"], CrossCheck> {
  return Object.fromEntries(checks.map((c) => [c.id, c])) as Record<CrossCheck["id"], CrossCheck>;
}

function checksFor(deal: Deal): Record<CrossCheck["id"], CrossCheck> {
  return byId(runCrossChecks(deal, marketRents(deal)));
}

function manualUnit(patch: Partial<Unit> = {}): Unit {
  return {
    id: "m1",
    label: "Added unit",
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

describe("extraction schema", () => {
  it("accepts the five hand-written sample results unchanged", () => {
    for (const s of SAMPLE_EXTRACTIONS) {
      const parsed = ExtractionResultSchema.safeParse(s.result);
      expect(parsed.success, s.fileName).toBe(true);
      expect(parsed.data).toEqual(s.result);
    }
  });

  it("cites every value with an integer page, a quote and a confidence", () => {
    const field = cited(z.number());
    expect(field.safeParse({ value: 480, page: 1, quote: "480 m²", confidence: "high" }).success).toBe(true);
    expect(field.safeParse({ value: 480, page: 1.5, quote: "480 m²", confidence: "high" }).success).toBe(false);
    expect(field.safeParse({ value: 480, page: 1, quote: "480 m²", confidence: "certain" }).success).toBe(false);
    expect(field.safeParse({ value: "480", page: 1, quote: "480 m²", confidence: "high" }).success).toBe(false);
  });

  it("rejects a floor outside the floor codes", () => {
    const result = structuredClone(SAMPLE_EXTRACTIONS[0].result) as unknown as {
      tenantList: { units: { floor: { value: string } }[] };
    };
    result.tenantList.units[0].floor.value = "EG";
    expect(ExtractionResultSchema.safeParse(result).success).toBe(false);
  });

  it("converts to a structured-output format for the Claude call", () => {
    const format = zodOutputFormat(ExtractionResultSchema);
    expect(format.type).toBe("json_schema");
    const landRegister = SAMPLE_EXTRACTIONS[1].result;
    expect(format.parse(JSON.stringify(landRegister))).toEqual(landRegister);
  });
});

describe("modernisation points (ImmoWertV Annex 2, simplified)", () => {
  it("gives a partial interior modernisation 1 point", () => {
    expect(measurePoints("interior", "partial")).toBe(1);
  });

  it("gives the element's maximum for a full measure and half of it, rounded down, for a partial one", () => {
    const max: Record<MeasureCategory, number> = {
      roof: 4,
      windows: 2,
      pipes: 2,
      heating: 2,
      exterior_walls: 4,
      bathrooms: 2,
      interior: 2,
      floor_plan: 2,
    };
    for (const category of Object.keys(max) as MeasureCategory[]) {
      expect(measurePoints(category, "full")).toBe(max[category]);
      expect(measurePoints(category, "partial")).toBe(Math.floor(max[category] / 2));
    }
  });

  it("sums the measures but caps each element at its maximum when it is listed twice", () => {
    expect(totalModernisationPoints([])).toBe(0);
    expect(
      totalModernisationPoints([
        { category: "roof", points: 4 },
        { category: "windows", points: 2 },
        { category: "interior", points: 1 },
      ]),
    ).toBe(7);
    expect(
      totalModernisationPoints([
        { category: "roof", points: 4 },
        { category: "roof", points: 4 },
      ]),
    ).toBe(4);
    expect(
      totalModernisationPoints([
        { category: "interior", points: 1 },
        { category: "interior", points: 1 },
      ]),
    ).toBe(2);
  });
});

describe("dealFromExtractions on the 5 sample documents", () => {
  const deal = sampleDeal();

  it("reads 8 units with 565 m² in total, u1 at 8.40 €/m²", () => {
    expect(deal.units).toHaveLength(8);
    expect(deal.units.reduce((sum, u) => sum + u.areaM2, 0)).toBe(565);
    expect(deal.units[0].inPlaceRentPerM2).toBe(8.4);
  });

  it("rounds in-place rents half-up to the cent", () => {
    const inputs = sampleInputs();
    inputs[0].result.tenantList!.units[1].rentPerMonth!.value = 513.06; // 68 m² → 7.545 €/m², 7.544999… in binary
    expect(dealFromExtractions(TEST_SKELETON, inputs).units[1].inPlaceRentPerM2).toBe(7.55);
  });

  it("reads plot 480 m², 13 modernisation points, built 1912, heating 2019", () => {
    expect(deal.property.plotM2).toBe(480);
    expect(deal.property.modernisationPoints).toBe(13);
    expect(deal.property.builtYear).toBe(1912);
    expect(deal.property.heatingYear).toBe(2019);
  });

  it("reads 1 easement and 1 land charge", () => {
    expect(deal.property.easements.length).toBe(1);
    expect(deal.property.landChargesCount).toBe(1);
  });

  it("maps the units of spec §5.3.3 in tenant-list order", () => {
    expect(deal.units.map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
    expect(deal.units.map((u) => u.label)).toEqual([
      "GF left",
      "GF right",
      "1F left",
      "1F right",
      "2F left",
      "2F right",
      "3F left",
      "Attic",
    ]);
    expect(deal.units.map((u) => u.floor)).toEqual(["GF", "GF", "1F", "1F", "2F", "2F", "3F", "attic"]);
    expect(deal.units.map((u) => u.areaM2)).toEqual([62, 68, 71, 75, 62, 68, 71, 88]);
    expect(deal.units.map((u) => u.rooms)).toEqual([2, 2.5, 3, 3, 2, 2.5, 3, 3.5]);
    expect(deal.units.map((u) => u.inPlaceRentPerM2)).toEqual([8.4, 8.7, 9.2, 9.4, 8.6, 8.8, 9.1, 9]);
    expect(deal.units.map((u) => u.leaseSinceYear)).toEqual([2009, 2012, 2022, 2025, 2011, 2016, 2021, 2019]);
    expect(deal.units.map((u) => u.features)).toEqual([
      ["courtyard"],
      ["street"],
      ["renovated_bath"],
      ["balcony"],
      ["courtyard"],
      ["balcony"],
      ["renovated_bath"],
      ["roof_terrace"],
    ]);
    for (const u of deal.units) {
      expect(u.origin).toBe("extracted");
      expect(u.clientEdited).toEqual([]);
      expect(u.photoIds).toEqual([]);
    }
  });

  it("cites each unit with its label's quote", () => {
    expect(deal.units[0].source).toEqual({
      documentId: "doc-tenant-list",
      page: 2,
      quote: "EG links",
      confidence: "high",
      verified: true,
    });
    expect(deal.units[7].source?.quote).toBe("DG");
  });

  it("keeps the facts of every document with their sources", () => {
    const p = deal.property;
    expect(p.parcel).toBe("Gemarkung Leipzig, Flur 12, Flurstück 123/4");
    expect(p.landRegisterKind).toBe("Grundbuch");
    expect(p.plotSource).toEqual({ documentId: "doc-land-register", page: 1, quote: "480 m²", confidence: "high", verified: true });
    expect(p.builtYearSource).toEqual({
      documentId: "doc-energy-certificate",
      page: 1,
      quote: "Baujahr Gebäude 1912",
      confidence: "high",
      verified: true,
    });
    expect(p.addressOnLandRegister).toBe("Musterstraße 12");
    expect(p.addressOnEnergyCert).toBe("Musterstraße 12, 04109 Leipzig");
    expect(p.livingAreaM2FromEnergyCert).toBe(565);
    expect(p.heatingYearFromRefurb).toBe(2019);
    expect(p.energyClass).toBe("D");
    expect(p.energyDemandKwh).toBe(128);
    expect(p.energyCarrier).toBe("Gas");
    expect(p.tenantListTotalRentPerMonth).toBe(5040.3);
    expect(p.tenantListTotalAreaM2).toBe(565);
    expect(p.tenantListTotalSource).toEqual({
      documentId: "doc-tenant-list",
      page: 2,
      quote: "Summe Nettokaltmiete / Monat 5.040,30 €",
      confidence: "high",
      verified: true,
    });
    expect(p.zoning).toEqual({
      areaType: "General residential area (WA)",
      residentialAllowed: true,
      source: { documentId: "doc-zoning-plan", page: 1, quote: "Allgemeines Wohngebiet (WA)", confidence: "high", verified: true },
    });
  });

  it("lists the easement with its translation and its section II quote", () => {
    expect(deal.property.easements[0]).toEqual({
      id: "1",
      text: EASEMENT_TEXT,
      translation: "Limited personal easement (utility line right) for the municipal utility; registered 14 Mar 1998.",
      source: { documentId: "doc-land-register", page: 4, quote: EASEMENT_TEXT, confidence: "high", verified: true },
    });
  });

  it("scores the 6 refurbishment measures 4 + 2 + 2 + 2 + 2 + 1", () => {
    expect(deal.property.refurbishments.map((m) => [m.name, m.category, m.extent, m.year, m.points])).toEqual([
      ["Roof incl. insulation", "roof", "full", 2016, 4],
      ["Windows", "windows", "full", 2014, 2],
      ["Pipes / electrics", "pipes", "full", 2014, 2],
      ["Heating", "heating", "full", 2019, 2],
      ["Bathrooms", "bathrooms", "full", 2014, 2],
      ["Interior, partial", "interior", "partial", 2014, 1],
    ]);
    expect(deal.property.refurbishments[0].source).toEqual({
      documentId: "doc-refurbishment-sheet",
      page: 1,
      quote: "Dacherneuerung inkl. Wärmedämmung",
      confidence: "high",
      verified: true,
    });
  });

  it("takes the deal header from the skeleton and starts as a draft", () => {
    expect(deal).toMatchObject({
      id: "CEN-2026-0147",
      clientName: "Demo Capital GmbH",
      clientSide: "buy-side",
      address: { street: "Musterstraße 12", zip: "04109", city: "Leipzig", lat: 51.3352, lng: 12.3747 },
      usageType: "living",
      scope: "building",
      valuationDate: "2026-11-06",
      requestedAt: "2026-11-06T09:00:00.000Z",
      status: "draft",
      photos: [],
      runLog: [],
    });
  });

  it("summarises each document with the run-log results of spec §5.3.4", () => {
    expect(deal.documents.map((d) => d.id)).toEqual(SAMPLE_EXTRACTIONS.map((s) => s.id));
    expect(deal.documents.map((d) => d.type)).toEqual([
      "tenant_list",
      "land_register",
      "energy_certificate",
      "refurbishment_sheet",
      "zoning_plan",
    ]);
    expect(deal.documents.map((d) => d.findings)).toEqual([
      ["8 units, 565 m², €60,484/yr"],
      ["Plot 480 m², 1 easement; land charge ignored"],
      ["Gas, 2019, class D, 565 m²"],
      ["6 measures 2014–2019, 13 points"],
      ["Residential, no value effect"],
    ]);
    expect(deal.documents.map((d) => d.uncertainFields)).toEqual([[], [], [], [], []]);
    expect(deal.documents[0]).toMatchObject({ fileName: "Mieterliste_Musterstrasse12.pdf", pages: 2, status: "done" });
  });

  it("takes each document's type from its extraction and leaves the inputs untouched", () => {
    const inputs = sampleInputs();
    for (const input of inputs) input.doc.type = "unknown";
    const before = structuredClone(inputs);
    const fresh = dealFromExtractions(TEST_SKELETON, inputs);
    expect(fresh.documents.map((d) => d.type)).toEqual(deal.documents.map((d) => d.type));
    expect(inputs).toEqual(before);
  });

  it("reads a Wohnungsgrundbuch like a land register", () => {
    const inputs = sampleInputs();
    inputs[1].result.documentType = "condo_land_register";
    inputs[1].result.landRegister!.kind = "Wohnungsgrundbuch";
    const condo = dealFromExtractions(TEST_SKELETON, inputs);
    expect(condo.documents[1].type).toBe("condo_land_register");
    expect(condo.property.landRegisterKind).toBe("Wohnungsgrundbuch");
    expect(condo.property.plotM2).toBe(480);
  });

  it("keeps an unknown document without findings", () => {
    const inputs = sampleInputs();
    inputs.push({
      doc: { ...inputs[4].doc, id: "doc-other", fileName: "Expose.pdf", type: "unknown" },
      result: {
        documentType: "unknown",
        summary: "Not a document type Censio reads",
        tenantList: null,
        landRegister: null,
        energyCertificate: null,
        refurbishmentSheet: null,
        zoningPlan: null,
      },
      verified: {},
    });
    const withOther = dealFromExtractions(TEST_SKELETON, inputs);
    expect(withOther.documents).toHaveLength(6);
    expect(withOther.documents[5]).toMatchObject({ id: "doc-other", type: "unknown", findings: [], uncertainFields: [] });
    expect(withOther.property).toEqual(deal.property);
    expect(withOther.units).toEqual(deal.units);
  });
});

describe("uncertain fields", () => {
  it("names every cited field by its path, the key of the quote check", () => {
    expect(citedFields(SAMPLE_EXTRACTIONS[1].result).map((f) => f.path)).toEqual([
      "landRegister.parcel",
      "landRegister.plotM2",
      "landRegister.address",
      "landRegister.easements.0.text",
    ]);
    const tenantListPaths = citedFields(SAMPLE_EXTRACTIONS[0].result).map((f) => f.path);
    expect(tenantListPaths).toHaveLength(8 * 6 + 3);
    expect(tenantListPaths.slice(0, 6)).toEqual([
      "tenantList.units.0.label",
      "tenantList.units.0.floor",
      "tenantList.units.0.areaM2",
      "tenantList.units.0.rooms",
      "tenantList.units.0.rentPerMonth",
      "tenantList.units.0.leaseSinceYear",
    ]);
    expect(tenantListPaths.slice(-3)).toEqual(["tenantList.totalAreaM2", "tenantList.totalRentPerMonth", "tenantList.address"]);
  });

  it("lists a field whose quote was not found on its page", () => {
    const inputs = sampleInputs();
    inputs[0].verified = { "tenantList.units.0.areaM2": false, "tenantList.units.1.areaM2": true };
    inputs[1].verified = { "landRegister.plotM2": false };
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    expect(deal.documents[0].uncertainFields).toEqual(["tenantList.units.0.areaM2"]);
    expect(deal.documents[1].uncertainFields).toEqual(["landRegister.plotM2"]);
    expect(deal.property.plotSource?.verified).toBe(false);
    expect(deal.units[0].source?.verified).toBe(true);
  });

  it("carries an unverified unit label to the unit's source", () => {
    const inputs = sampleInputs();
    inputs[0].verified = { "tenantList.units.7.label": false };
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    expect(deal.units[7].source?.verified).toBe(false);
    expect(deal.documents[0].uncertainFields).toEqual(["tenantList.units.7.label"]);
  });

  it("lists a low-confidence field but not a medium-confidence one", () => {
    const inputs = sampleInputs();
    inputs[1].result.landRegister!.easements[0].text.confidence = "low";
    inputs[3].result.refurbishmentSheet!.measures[4].year.confidence = "medium";
    inputs[3].result.refurbishmentSheet!.measures[5].year.confidence = "low";
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    expect(deal.documents[1].uncertainFields).toEqual(["landRegister.easements.0.text"]);
    expect(deal.property.easements[0].source.confidence).toBe("low");
    expect(deal.documents[3].uncertainFields).toEqual(["refurbishmentSheet.measures.5.year"]);
  });
});

describe("vacant units", () => {
  it("gives a vacant unit no in-place rent and no lease year", () => {
    const inputs = sampleInputs();
    const attic = inputs[0].result.tenantList!.units[7];
    attic.vacant = true;
    attic.leaseSinceYear = null;
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    expect(deal.units[7].inPlaceRentPerM2).toBeNull();
    expect(deal.units[7].leaseSinceYear).toBeNull();
    expect(deal.documents[0].findings).toEqual(["8 units, 565 m², €50,980/yr, 1 vacant"]);
    expect(deal.documents[0].uncertainFields).toEqual([]);
  });

  it("lists a let unit whose rent could not be read as uncertain", () => {
    const inputs = sampleInputs();
    inputs[0].result.tenantList!.units[2].rentPerMonth = null;
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    expect(deal.units[2].inPlaceRentPerM2).toBeNull();
    expect(deal.documents[0].uncertainFields).toEqual(["tenantList.units.2.rentPerMonth"]);
  });
});

describe("runCrossChecks", () => {
  it("labels the 6 checks as the spec does, in order", () => {
    expect(runCrossChecks(sampleDeal(), {}).map((c) => [c.id, c.label])).toEqual([
      ["rent_total", "Rent total equals the sum of the unit rows"],
      ["living_area", "Living area matches the energy certificate"],
      ["heating_year", "Heating year matches between refurbishment sheet and energy certificate"],
      ["address", "Energy certificate address matches the land register"],
      ["zoning", "Zoning plan permits residential use"],
      ["over_rent", "No implausible over-rent (> 30 % above market)"],
    ]);
  });

  it("passes all 6 on the sample deal with the rent estimator's market rents", () => {
    const deal = sampleDeal();
    const market = marketRents(deal);
    expect(market).toEqual({ u1: 9.25, u2: 9.17, u3: 9.61, u4: 9.64, u5: 9.65, u6: 9.72, u7: 9.71, u8: 9.92 });
    const checks = runCrossChecks(deal, market);
    expect(checks).toHaveLength(6);
    expect(checks.every((c) => c.passed)).toBe(true);
    const c = byId(checks);
    expect(c.rent_total.detail).toBe("The 8 unit rows add up to €5,040.30 a month; the total row says €5,040.30.");
    expect(c.living_area.detail).toBe("The 8 unit rows add up to 565 m²; the energy certificate says 565 m².");
    expect(c.heating_year.detail).toBe("Both documents give 2019.");
    expect(c.address.detail).toBe("Energy certificate: Musterstraße 12, 04109 Leipzig. Land register: Musterstraße 12.");
    expect(c.zoning.detail).toBe("General residential area (WA): residential use permitted.");
    expect(c.over_rent.detail).toBe("No unit is more than 30 % above market; the highest is 1F right at −2.5 %.");
  });

  it("fails rent_total and over_rent when u1's rent is 2,000 € a month", () => {
    const inputs = sampleInputs();
    inputs[0].result.tenantList!.units[0].rentPerMonth!.value = 2000;
    const c = checksFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(c.rent_total.passed).toBe(false);
    expect(c.over_rent.passed).toBe(false);
    expect([c.living_area, c.heating_year, c.address, c.zoning].every((x) => x.passed)).toBe(true);
    expect(c.rent_total.detail).toBe(
      "The 8 unit rows add up to €6,519.62 a month; the total row says €5,040.30. Difference: €1,479.32.",
    );
    expect(c.over_rent.detail).toBe("GF left: 32.26 €/m² in place against 9.25 €/m² market (+248.8 %).");
  });

  it("tolerates the rounding of in-place rents to the cent per m²", () => {
    const inputs = sampleInputs();
    const tenantList = inputs[0].result.tenantList!;
    tenantList.units[0].rentPerMonth!.value = 521.1; // 8.4048… €/m², stored as 8.40
    tenantList.totalRentPerMonth.value = 5040.6;
    const c = checksFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(c.rent_total.passed).toBe(true);
  });

  it("flags a client's area edit against the energy certificate", () => {
    const deal = sampleDeal();
    deal.units[0] = { ...deal.units[0], areaM2: 70, clientEdited: ["areaM2"] };
    const c = checksFor(deal);
    expect(c.living_area.passed).toBe(false);
    expect(c.living_area.detail).toBe(
      "The 8 unit rows add up to 573 m²; the energy certificate says 565 m² (+1.4 %).",
    );
  });

  it("leaves a unit added by hand out of the tenant-list checks", () => {
    const deal = sampleDeal();
    deal.units.push(manualUnit());
    deal.units.push(manualUnit({ id: "m2", inPlaceRentPerM2: 9.5, leaseSinceYear: 2026 }));
    expect(Object.values(checksFor(deal)).every((c) => c.passed)).toBe(true);
  });

  it("compares the heating year of both documents", () => {
    const inputs = sampleInputs();
    inputs[3].result.refurbishmentSheet!.measures[3].year.value = 2018;
    const c = checksFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(c.heating_year.passed).toBe(false);
    expect(c.heating_year.detail).toBe("Refurbishment sheet 2018, energy certificate 2019.");
  });

  it("fails the zoning check when residential use is not permitted", () => {
    const inputs = sampleInputs();
    inputs[4].result.zoningPlan!.residentialAllowed.value = false;
    const c = checksFor(dealFromExtractions(TEST_SKELETON, inputs));
    expect(c.zoning.passed).toBe(false);
    expect(c.zoning.detail).toBe("General residential area (WA): residential use not permitted.");
  });

  it("matches addresses across spelling variants but not across house numbers or postcodes", () => {
    const deal = sampleDeal();
    const matches = (energyCert: string, landRegister: string) => {
      const d = structuredClone(deal);
      d.property.addressOnEnergyCert = energyCert;
      d.property.addressOnLandRegister = landRegister;
      return byId(runCrossChecks(d, {})).address.passed;
    };
    expect(matches("Musterstr. 12, 04109 Leipzig", "Musterstraße 12")).toBe(true);
    expect(matches("MUSTERSTRASSE 12, 04109 Leipzig", "Gebäude- und Freifläche, Musterstraße 12")).toBe(true);
    expect(matches("Musterstraße 12a, 04109 Leipzig", "Musterstraße 12 a, 04109 Leipzig")).toBe(true);
    expect(matches("04109 Leipzig, Musterstraße 12", "Musterstraße 12")).toBe(true);
    expect(matches("Musterstraße 14, 04109 Leipzig", "Musterstraße 12")).toBe(false);
    expect(matches("Musterstraße 12, 04109 Leipzig", "Musterstraße 1")).toBe(false);
    expect(matches("Musterstraße 12, 04107 Leipzig", "Musterstraße 12, 04109 Leipzig")).toBe(false);
    expect(matches("Musterweg 12, 04109 Leipzig", "Musterstraße 12")).toBe(false);
  });

  it("allows an in-place rent up to exactly 30 % above market", () => {
    const deal = sampleDeal();
    const market = { ...marketRents(deal), u1: 10 };
    deal.units[0].inPlaceRentPerM2 = 13;
    expect(byId(runCrossChecks(deal, market)).over_rent.passed).toBe(true);
    deal.units[0].inPlaceRentPerM2 = 13.01;
    expect(byId(runCrossChecks(deal, market)).over_rent.passed).toBe(false);
  });

  it("cannot pass a check whose documents are missing", () => {
    const inputs = sampleInputs().filter((x) => x.result.documentType === "tenant_list");
    const deal = dealFromExtractions(TEST_SKELETON, inputs);
    expect(deal.property).toMatchObject({
      plotM2: null,
      builtYear: null,
      heatingYear: null,
      heatingYearFromRefurb: null,
      addressOnLandRegister: null,
      easements: [],
      landChargesCount: 0,
      refurbishments: [],
      modernisationPoints: 0,
      zoning: null,
    });
    const c = checksFor(deal);
    expect(c.rent_total.passed).toBe(true);
    expect(c.over_rent.passed).toBe(true);
    for (const id of ["living_area", "heating_year", "address", "zoning"] as const) {
      expect(c[id].passed, id).toBe(false);
      expect(c[id].detail, id).toMatch(/^Not checked: /);
    }
  });

  it("checks nothing on a deal without documents", () => {
    const checks = runCrossChecks(dealFromExtractions(TEST_SKELETON, []), {});
    expect(checks).toHaveLength(6);
    for (const c of checks) {
      expect(c.passed, c.id).toBe(false);
      expect(c.detail, c.id).toMatch(/^Not checked: /);
    }
  });

  it("passes the over-rent check when every unit is vacant", () => {
    const deal = sampleDeal();
    for (const u of deal.units) u.inPlaceRentPerM2 = null;
    expect(checksFor(deal).over_rent).toMatchObject({ passed: true, detail: "No let units to compare." });
  });

  it("does not pass the over-rent check without market rents", () => {
    const c = byId(runCrossChecks(sampleDeal(), {}));
    expect(c.over_rent.passed).toBe(false);
    expect(c.over_rent.detail).toMatch(/^Not checked: /);
  });
});
