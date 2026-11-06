/**
 * Hand-written extraction results for the 5 sample documents (spec §5.3.2, units of §5.3.3), shaped exactly like
 * the extraction route's `result`. Values are normalised English; every quote is the verbatim German text on the
 * cited 1-based page of the generated sample PDF, so the generated fixtures (Task 9) can be compared with these.
 *
 * Page layout the citations assume (pages as in the valuer-review mockup):
 * - Mieterliste, 2 pp.: p. 1 cover with the object address; p. 2 the rows WE 1–8 and the total rows.
 * - Grundbuch, 4 pp.: p. 1 Bestandsverzeichnis (Flurstück 123/4, Musterstraße 12, 480 m²); p. 4 Abteilung II and III.
 * - Energieausweis, Sanierungsübersicht and B-Plan: 1 p. each.
 */
import type { Confidence, DealDocument, Feature, FloorCode } from "@/lib/deal/types";
import type { DealSkeleton } from "@/lib/deal/fromExtraction";
import type { ExtractionResult } from "@/lib/extraction/schemas";

function c<T>(value: T, page: number, quote: string, confidence: Confidence = "high") {
  return { value, page, quote, confidence };
}

const NO_SECTIONS = {
  tenantList: null,
  landRegister: null,
  energyCertificate: null,
  refurbishmentSheet: null,
  zoningPlan: null,
};

/** One row of the tenant list on p. 2: `WE 1 | EG links | 62,0 m² | 2 Zi. | 520,80 € | seit 2009 | Hofseite`. */
function row(r: {
  label: string;
  floor: FloorCode;
  lage: string;
  area: [number, string];
  rooms: [number, string];
  rent: [number, string];
  since: [number, string];
  features: Feature[];
}) {
  return {
    label: c(r.label, 2, r.lage),
    floor: c(r.floor, 2, r.lage),
    areaM2: c(r.area[0], 2, r.area[1]),
    rooms: c(r.rooms[0], 2, r.rooms[1]),
    rentPerMonth: c(r.rent[0], 2, r.rent[1]),
    leaseSinceYear: c(r.since[0], 2, r.since[1]),
    features: r.features,
    vacant: false,
  };
}

export const TENANT_LIST_RESULT: ExtractionResult = {
  ...NO_SECTIONS,
  documentType: "tenant_list",
  summary: "Tenant list · 8 units · 565 m² · €5,040.30 net cold rent per month",
  tenantList: {
    units: [
      row({ label: "GF left", floor: "GF", lage: "EG links", area: [62, "62,0 m²"], rooms: [2, "2 Zi."], rent: [520.8, "520,80 €"], since: [2009, "seit 2009"], features: ["courtyard"] }),
      row({ label: "GF right", floor: "GF", lage: "EG rechts", area: [68, "68,0 m²"], rooms: [2.5, "2,5 Zi."], rent: [591.6, "591,60 €"], since: [2012, "seit 2012"], features: ["street"] }),
      row({ label: "1F left", floor: "1F", lage: "1. OG links", area: [71, "71,0 m²"], rooms: [3, "3 Zi."], rent: [653.2, "653,20 €"], since: [2022, "seit 2022"], features: ["renovated_bath"] }),
      row({ label: "1F right", floor: "1F", lage: "1. OG rechts", area: [75, "75,0 m²"], rooms: [3, "3 Zi."], rent: [705, "705,00 €"], since: [2025, "seit 2025"], features: ["balcony"] }),
      row({ label: "2F left", floor: "2F", lage: "2. OG links", area: [62, "62,0 m²"], rooms: [2, "2 Zi."], rent: [533.2, "533,20 €"], since: [2011, "seit 2011"], features: ["courtyard"] }),
      row({ label: "2F right", floor: "2F", lage: "2. OG rechts", area: [68, "68,0 m²"], rooms: [2.5, "2,5 Zi."], rent: [598.4, "598,40 €"], since: [2016, "seit 2016"], features: ["balcony"] }),
      row({ label: "3F left", floor: "3F", lage: "3. OG links", area: [71, "71,0 m²"], rooms: [3, "3 Zi."], rent: [646.1, "646,10 €"], since: [2021, "seit 2021"], features: ["renovated_bath"] }),
      row({ label: "Attic", floor: "attic", lage: "DG", area: [88, "88,0 m²"], rooms: [3.5, "3,5 Zi."], rent: [792, "792,00 €"], since: [2019, "seit 2019"], features: ["roof_terrace"] }),
    ],
    totalAreaM2: c(565, 2, "Wohnfläche gesamt 565,0 m²"),
    totalRentPerMonth: c(5040.3, 2, "Summe Nettokaltmiete / Monat 5.040,30 €"),
    address: c("Musterstraße 12, 04109 Leipzig", 1, "Musterstraße 12, 04109 Leipzig"),
  },
};

export const EASEMENT_TEXT =
  "Beschränkte persönliche Dienstbarkeit (Leitungsrecht) für die städtischen Versorgungsbetriebe; eingetragen am 14.03.1998.";

export const LAND_REGISTER_RESULT: ExtractionResult = {
  ...NO_SECTIONS,
  documentType: "land_register",
  summary: "Land register · plot 480 m² · 1 easement in section II",
  landRegister: {
    kind: "Grundbuch",
    parcel: c("Gemarkung Leipzig, Flur 12, Flurstück 123/4", 1, "Flurstück 123/4"),
    plotM2: c(480, 1, "480 m²"),
    address: c("Musterstraße 12", 1, "Musterstraße 12"),
    easements: [
      {
        text: c(EASEMENT_TEXT, 4, EASEMENT_TEXT),
        translationEn: "Limited personal easement (utility line right) for the municipal utility; registered 14 Mar 1998.",
      },
    ],
    // Abteilung III: one Grundschuld (financing, not value-relevant)
    landChargesCount: 1,
  },
};

export const ENERGY_CERTIFICATE_RESULT: ExtractionResult = {
  ...NO_SECTIONS,
  documentType: "energy_certificate",
  summary: "Energy certificate · gas, heating from 2019 · class D · 128 kWh/(m²·a) · 565 m²",
  energyCertificate: {
    address: c("Musterstraße 12, 04109 Leipzig", 1, "Musterstraße 12, 04109 Leipzig"),
    builtYear: c(1912, 1, "Baujahr Gebäude 1912"),
    heatingYear: c(2019, 1, "Baujahr Wärmeerzeuger 2019"),
    energyCarrier: c("Gas", 1, "Erdgas"),
    energyClass: c("D", 1, "Effizienzklasse D"),
    demandKwh: c(128, 1, "128 kWh/(m²·a)"),
    livingAreaM2: c(565, 1, "Gebäudenutzfläche (Wohnfläche) 565 m²"),
  },
};

export const REFURBISHMENT_SHEET_RESULT: ExtractionResult = {
  ...NO_SECTIONS,
  documentType: "refurbishment_sheet",
  summary: "Refurbishment sheet · 6 measures 2014–2019",
  refurbishmentSheet: {
    measures: [
      { name: c("Roof incl. insulation", 1, "Dacherneuerung inkl. Wärmedämmung"), year: c(2016, 1, "2016"), category: "roof", extent: "full" },
      { name: c("Windows", 1, "Erneuerung der Fenster"), year: c(2014, 1, "2014"), category: "windows", extent: "full" },
      { name: c("Pipes / electrics", 1, "Erneuerung der Leitungssysteme (Strom, Wasser, Abwasser)"), year: c(2014, 1, "2014"), category: "pipes", extent: "full" },
      { name: c("Heating", 1, "Einbau Gas-Brennwertkessel"), year: c(2019, 1, "2019"), category: "heating", extent: "full" },
      { name: c("Bathrooms", 1, "Modernisierung der Bäder"), year: c(2014, 1, "2014"), category: "bathrooms", extent: "full" },
      { name: c("Interior, partial", 1, "Innenausbau teilweise (Böden, Türen)"), year: c(2014, 1, "2014"), category: "interior", extent: "partial" },
    ],
  },
};

export const ZONING_PLAN_RESULT: ExtractionResult = {
  ...NO_SECTIONS,
  documentType: "zoning_plan",
  summary: "Zoning plan · general residential area (WA) · residential use permitted",
  zoningPlan: {
    areaType: c("General residential area (WA)", 1, "Allgemeines Wohngebiet (WA)"),
    residentialAllowed: c(true, 1, "Wohnnutzung zulässig"),
  },
};

export interface SampleExtraction {
  id: string;
  fileName: string;
  pages: number;
  result: ExtractionResult;
}

/** In the order of the run log (spec §5.3.4, steps 1–5). */
export const SAMPLE_EXTRACTIONS: SampleExtraction[] = [
  { id: "doc-tenant-list", fileName: "Mieterliste_Musterstrasse12.pdf", pages: 2, result: TENANT_LIST_RESULT },
  { id: "doc-land-register", fileName: "Grundbuch_Musterstrasse12.pdf", pages: 4, result: LAND_REGISTER_RESULT },
  { id: "doc-energy-certificate", fileName: "Energieausweis_Musterstrasse12.pdf", pages: 1, result: ENERGY_CERTIFICATE_RESULT },
  { id: "doc-refurbishment-sheet", fileName: "Sanierungsuebersicht_Musterstrasse12.pdf", pages: 1, result: REFURBISHMENT_SHEET_RESULT },
  { id: "doc-zoning-plan", fileName: "B-Plan_Auszug_Musterstrasse12.pdf", pages: 1, result: ZONING_PLAN_RESULT },
];

/** The sample deal (plan "Sample world"). */
export const TEST_SKELETON: DealSkeleton = {
  id: "CEN-2026-0147",
  clientName: "Demo Capital GmbH",
  address: { street: "Musterstraße 12", zip: "04109", city: "Leipzig", lat: 51.3352, lng: 12.3747 },
  usageType: "living",
  scope: "building",
  valuationDate: "2026-11-06",
  requestedAt: "2026-11-06T09:00:00.000Z",
};

/** A read document as the wizard holds it before the deal is built (no findings or uncertain fields yet). */
export function sampleDocument(s: SampleExtraction): DealDocument {
  return {
    id: s.id,
    fileName: s.fileName,
    sha256: `fixture:${s.id}`,
    pages: s.pages,
    type: s.result.documentType,
    status: "done",
    extractionSource: "demo-fixture",
    durationMs: null,
    findings: [],
    uncertainFields: [],
    error: null,
  };
}

/** Fresh, mutable inputs for `dealFromExtractions`. `verified` is empty, so every quote defaults to verified. */
export function sampleInputs(): { doc: DealDocument; result: ExtractionResult; verified: Record<string, boolean> }[] {
  return SAMPLE_EXTRACTIONS.map((s) => ({ doc: sampleDocument(s), result: structuredClone(s.result), verified: {} }));
}
