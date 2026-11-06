/**
 * Domain types shared by every module. See docs/superpowers/specs/2026-11-06-censio-prototype-design.md §5.3 and §5.5.
 * Rates are fractions (0.03 = 3 %), money is in euro, areas in m².
 */

export type FloorCode = "GF" | "1F" | "2F" | "3F" | "4F" | "attic";
export type Feature = "balcony" | "roof_terrace" | "renovated_bath" | "street" | "courtyard";
export type Confidence = "high" | "medium" | "low";
export type DocumentType =
  | "tenant_list"
  | "land_register"
  | "condo_land_register"
  | "energy_certificate"
  | "refurbishment_sheet"
  | "zoning_plan"
  | "unknown";

/** A value's origin inside an uploaded document: 1-based page and the verbatim text it was read from. */
export interface Quote {
  documentId: string;
  page: number;
  quote: string;
  confidence: Confidence;
  /** true when the quote was found on that page of the PDF's text layer */
  verified: boolean;
}

export type EditableUnitField = "areaM2" | "rooms" | "inPlaceRentPerM2" | "leaseSinceYear" | "features" | "floor";

export interface Unit {
  id: string;
  label: string;
  floor: FloorCode;
  areaM2: number;
  rooms: number;
  /** null = vacant */
  inPlaceRentPerM2: number | null;
  leaseSinceYear: number | null;
  features: Feature[];
  photoIds: string[];
  origin: "extracted" | "manual";
  clientEdited: EditableUnitField[];
  source: Quote | null;
}

export interface Easement {
  id: string;
  text: string;
  translation: string;
  source: Quote;
}

export type MeasureCategory =
  | "roof"
  | "windows"
  | "pipes"
  | "heating"
  | "exterior_walls"
  | "bathrooms"
  | "interior"
  | "floor_plan";

export interface RefurbMeasure {
  name: string;
  category: MeasureCategory;
  extent: "full" | "partial";
  year: number;
  points: number;
  source: Quote;
}

export interface PropertyFacts {
  builtYear: number | null;
  builtYearSource: Quote | null;
  plotM2: number | null;
  plotSource: Quote | null;
  parcel: string | null;
  landRegisterKind: "Grundbuch" | "Wohnungsgrundbuch" | null;
  addressOnLandRegister: string | null;
  addressOnEnergyCert: string | null;
  livingAreaM2FromEnergyCert: number | null;
  heatingYear: number | null;
  heatingYearFromRefurb: number | null;
  energyClass: string | null;
  energyDemandKwh: number | null;
  energyCarrier: string | null;
  easements: Easement[];
  landChargesCount: number;
  zoning: { areaType: string; residentialAllowed: boolean; source: Quote } | null;
  refurbishments: RefurbMeasure[];
  modernisationPoints: number;
  tenantListTotalRentPerMonth: number | null;
  tenantListTotalAreaM2: number | null;
  tenantListTotalSource: Quote | null;
}

export interface DealDocument {
  id: string;
  fileName: string;
  sha256: string;
  pages: number;
  type: DocumentType;
  status: "pending" | "reading" | "done" | "failed";
  extractionSource: "live" | "cache" | "demo-fixture" | null;
  durationMs: number | null;
  findings: string[];
  uncertainFields: string[];
  error: string | null;
}

export interface RunLogEntry {
  step: number;
  label: string;
  kind: "live_ai" | "cache" | "demo" | "lookup" | "estimator" | "rules" | "engine";
  result: string;
  durationMs: number;
}

export interface DealAddress {
  street: string;
  zip: string;
  city: string;
  lat: number;
  lng: number;
}

export interface Deal {
  id: string;
  clientName: string;
  clientSide: "buy-side";
  address: DealAddress;
  usageType: "living" | "commercial" | "hotel";
  scope: "building" | "unit";
  /** ISO date, e.g. 2026-11-06 */
  valuationDate: string;
  /** ISO datetime */
  requestedAt: string;
  documents: DealDocument[];
  photos: { id: string; fileName: string; unitId: string | null }[];
  property: PropertyFacts;
  units: Unit[];
  status: "draft" | "processing" | "in_review" | "approved";
  runLog: RunLogEntry[];
}

/** Human labels for document types (English UI). */
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  tenant_list: "Tenant list (Mieterliste)",
  land_register: "Land register (Grundbuch)",
  condo_land_register: "Condominium land register (Wohnungsgrundbuch)",
  energy_certificate: "Energy certificate (Energieausweis)",
  refurbishment_sheet: "Refurbishment sheet (Sanierungsübersicht)",
  zoning_plan: "Zoning plan (B-Plan)",
  unknown: "Unknown document",
};
