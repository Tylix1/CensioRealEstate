/**
 * Pure helpers of the client wizard (C3.1–C3.4) and the AI-at-work log (C4). No React, no browser APIs, no clock:
 * the step components call these from render and handlers, and tests/unit/wizardModel.test.ts covers them.
 *
 * Units. The tenant list states each unit's rent per month; the deal keeps it per m² (`inPlaceRentPerM2`). An edited
 * area therefore keeps the monthly rent and changes the rent per m², so the tenant list's total row still adds up. A
 * field is in `clientEdited` while it differs from what the AI read; units added by hand are client input as a whole
 * (`origin: "manual"`) and keep `clientEdited` empty.
 */
import { citedFields, dealFromExtractions, type ExtractedDocument } from "@/lib/deal/fromExtraction";
import {
  DOCUMENT_TYPE_LABEL,
  type Deal,
  type DealDocument,
  type DocumentType,
  type EditableUnitField,
  type Feature,
  type FloorCode,
  type Unit,
} from "@/lib/deal/types";
import type { ExtractionResult } from "@/lib/extraction/schemas";
import { REQUIRED_DOCS } from "@/lib/flags/rules";
import { eur, num } from "@/lib/format";
import { MAX_FILES_PER_DEAL, MAX_PDF_BYTES } from "@/lib/server/limits";
import type { DemoDraft } from "@/lib/store/demoStore";
import type { PillTone } from "@/components/ui/Pill";

// ---------------------------------------------------------------------------------------------------------------------
// Draft

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Whether a saved draft has the shape the wizard works with; a malformed one is replaced by a new draft. */
export function isUsableDraft(draft: unknown): draft is DemoDraft {
  if (!isRecord(draft) || !isRecord(draft.skeleton) || !isRecord(draft.skeleton.address)) return false;
  return (
    Array.isArray(draft.documents) &&
    isRecord(draft.extractions) &&
    (draft.units === null || Array.isArray(draft.units)) &&
    Array.isArray(draft.photos) &&
    [1, 2, 3, 4].includes(draft.step as number)
  );
}

type DraftDocuments = Pick<DemoDraft, "documents" | "extractions">;

/** The draft's documents that were read, with their results, in upload order. */
export function readDocuments(draft: DraftDocuments): ExtractedDocument[] {
  return draft.documents.flatMap((doc) => {
    const extraction = draft.extractions[doc.id];
    return extraction ? [{ doc, result: extraction.result, verified: extraction.verified }] : [];
  });
}

/** The document the units come from: the first read document with a tenant list (as `dealFromExtractions` picks). */
export function tenantListDocumentId(draft: DraftDocuments): string | null {
  return readDocuments(draft).find((d) => d.result.tenantList !== null)?.doc.id ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Units

export const FLOOR_OPTIONS: { value: FloorCode; label: string }[] = [
  { value: "GF", label: "Ground" },
  { value: "1F", label: "1st" },
  { value: "2F", label: "2nd" },
  { value: "3F", label: "3rd" },
  { value: "4F", label: "4th+" },
  { value: "attic", label: "Attic" },
];

/** The features of the rent estimator, in this order everywhere. */
export const FEATURE_OPTIONS: { value: Feature; label: string }[] = [
  { value: "balcony", label: "Balcony" },
  { value: "roof_terrace", label: "Roof terrace" },
  { value: "renovated_bath", label: "Renovated bathroom" },
  { value: "street", label: "Street side" },
  { value: "courtyard", label: "Courtyard side" },
];

const FEATURE_ORDER = FEATURE_OPTIONS.map((f) => f.value);

/** The order of `EditableUnitField`, which `clientEdited` keeps. */
const EDITABLE_FIELDS: EditableUnitField[] = ["areaM2", "rooms", "inPlaceRentPerM2", "leaseSinceYear", "features", "floor"];

/** The name screen readers and messages use: "Unit 1, GF left" for the tenant list's units, "Unit m1" for added ones. */
export function unitName(unit: Pick<Unit, "id" | "label" | "origin">): string {
  if (unit.origin === "manual") return `Unit ${unit.id}`;
  const n = /^u(\d+)$/.exec(unit.id)?.[1] ?? unit.id;
  return unit.label ? `Unit ${n}, ${unit.label}` : `Unit ${n}`;
}

/** The rent per month of a let unit; null when vacant. */
export function monthlyRent(unit: Pick<Unit, "inPlaceRentPerM2" | "areaM2">): number | null {
  return unit.inPlaceRentPerM2 === null ? null : unit.inPlaceRentPerM2 * unit.areaM2;
}

/** The units as the AI created them from the draft's tenant list, with the photos the draft assigns to them. */
export function unitsFromTenantList(draft: Pick<DemoDraft, "skeleton" | "documents" | "extractions" | "photos">): Unit[] {
  return withPhotoIds(dealFromExtractions(draft.skeleton, readDocuments(draft)).units, draft.photos);
}

/** Each unit's `photoIds` from the photos assigned to it. */
export function withPhotoIds(units: Unit[], photos: DemoDraft["photos"]): Unit[] {
  return units.map((u) => ({ ...u, photoIds: photos.filter((p) => p.unitId === u.id).map((p) => p.id) }));
}

/**
 * The units of step C3.3. The first visit creates them from the tenant list. Later visits keep the client's edits,
 * unless the tenant list they came from was removed or replaced: then the tenant list's units are created again and
 * the units added by hand stay.
 */
export function reconcileUnits(draft: Pick<DemoDraft, "skeleton" | "documents" | "extractions" | "photos" | "units">): {
  units: Unit[];
  recreated: boolean;
} {
  const fresh = unitsFromTenantList(draft);
  if (draft.units === null) return { units: fresh, recreated: false };
  const source = tenantListDocumentId(draft);
  const extracted = draft.units.filter((u) => u.origin === "extracted");
  const current =
    extracted.length === fresh.length && extracted.every((u) => (u.source?.documentId ?? null) === source);
  if (current) return { units: draft.units, recreated: false };
  return { units: [...fresh, ...draft.units.filter((u) => u.origin === "manual")], recreated: true };
}

function sameFeatures(a: Feature[], b: Feature[]): boolean {
  return a.length === b.length && a.every((f) => b.includes(f));
}

function sameRent(a: Unit, b: Unit): boolean {
  const ma = monthlyRent(a);
  const mb = monthlyRent(b);
  if (ma === null || mb === null) return ma === mb;
  return Math.abs(ma - mb) < 0.005;
}

/** The fields of `unit` that differ from what the AI read (`original`). */
export function editedFields(unit: Unit, original: Unit): EditableUnitField[] {
  const differs: Record<EditableUnitField, boolean> = {
    areaM2: unit.areaM2 !== original.areaM2,
    rooms: unit.rooms !== original.rooms,
    inPlaceRentPerM2: !sameRent(unit, original),
    leaseSinceYear: unit.leaseSinceYear !== original.leaseSinceYear,
    features: !sameFeatures(unit.features, original.features),
    floor: unit.floor !== original.floor,
  };
  return EDITABLE_FIELDS.filter((f) => differs[f]);
}

export type UnitPatch =
  | { field: "label"; value: string }
  | { field: "floor"; value: FloorCode }
  | { field: "areaM2"; value: number }
  | { field: "rooms"; value: number }
  /** Rent per month; on a vacant unit it lets the unit. */
  | { field: "rent"; value: number }
  | { field: "vacant"; value: boolean }
  | { field: "leaseSinceYear"; value: number | null }
  | { field: "features"; value: Feature[] };

const PATCHED_FIELD: Record<UnitPatch["field"], EditableUnitField | null> = {
  label: null,
  floor: "floor",
  areaM2: "areaM2",
  rooms: "rooms",
  rent: "inPlaceRentPerM2",
  vacant: "inPlaceRentPerM2",
  leaseSinceYear: "leaseSinceYear",
  features: "features",
};

/**
 * Applies one client edit. `original` is the unit as the AI read it (none for units added by hand). Ticking Vacant
 * clears the rent and the lease start; unticking it on a tenant-list unit brings the tenant list's back, while a unit
 * without a known rent stays vacant until a rent is entered.
 */
export function editUnit(unit: Unit, patch: UnitPatch, original?: Unit): Unit {
  let next: Unit;
  switch (patch.field) {
    case "label":
      next = { ...unit, label: patch.value };
      break;
    case "floor":
      next = { ...unit, floor: patch.value };
      break;
    case "rooms":
      next = { ...unit, rooms: patch.value };
      break;
    case "areaM2": {
      if (!(patch.value > 0)) return unit;
      const monthly = monthlyRent(unit);
      next = { ...unit, areaM2: patch.value, inPlaceRentPerM2: monthly === null ? null : monthly / patch.value };
      break;
    }
    case "rent":
      if (!(unit.areaM2 > 0) || !(patch.value >= 0)) return unit;
      next = { ...unit, inPlaceRentPerM2: patch.value / unit.areaM2 };
      break;
    case "vacant":
      if (patch.value) {
        next = { ...unit, inPlaceRentPerM2: null, leaseSinceYear: null };
      } else {
        const rent = original ? monthlyRent(original) : null;
        if (rent === null || !(unit.areaM2 > 0) || unit.inPlaceRentPerM2 !== null) return unit;
        next = { ...unit, inPlaceRentPerM2: rent / unit.areaM2, leaseSinceYear: original?.leaseSinceYear ?? null };
      }
      break;
    case "leaseSinceYear":
      next = { ...unit, leaseSinceYear: patch.value };
      break;
    case "features":
      next = { ...unit, features: FEATURE_ORDER.filter((f) => patch.value.includes(f)) };
      break;
  }
  if (next.origin === "manual") return { ...next, clientEdited: [] };
  if (original) return { ...next, clientEdited: editedFields(next, original) };
  const field = PATCHED_FIELD[patch.field];
  const edited = new Set([...unit.clientEdited, ...(field ? [field] : [])]);
  return { ...next, clientEdited: EDITABLE_FIELDS.filter((f) => edited.has(f)) };
}

/** The unit as the AI read it, keeping its photos. */
export function restoreUnit(unit: Unit, original: Unit): Unit {
  return { ...structuredClone(original), photoIds: [...unit.photoIds], clientEdited: [] };
}

/** A unit added by hand: `m1`, `m2`, … It starts vacant and needs its area and rooms. */
export function newManualUnit(units: Pick<Unit, "id">[]): Unit {
  const taken = units.map((u) => /^m(\d+)$/.exec(u.id)?.[1]).filter(Boolean).map(Number);
  const id = `m${taken.length > 0 ? Math.max(...taken) + 1 : 1}`;
  return {
    id,
    label: "",
    floor: "GF",
    areaM2: 0,
    rooms: 0,
    inPlaceRentPerM2: null,
    leaseSinceYear: null,
    features: [],
    photoIds: [],
    origin: "manual",
    clientEdited: [],
    source: null,
  };
}

/** What still blocks leaving the units step, as sentences. */
export function unitProblems(units: Unit[]): string[] {
  if (units.length === 0) return ["Add at least one unit to continue."];
  return units.flatMap((u) => [
    ...(u.areaM2 > 0 ? [] : [`Enter the area of ${unitName(u)}.`]),
    ...(u.rooms > 0 ? [] : [`Enter the number of rooms of ${unitName(u)}.`]),
  ]);
}

export interface UnitsSummary {
  count: number;
  areaM2: number;
  rentPerMonth: number;
  vacant: number;
  edited: number;
  manual: number;
}

export function unitsSummary(units: Unit[]): UnitsSummary {
  return {
    count: units.length,
    areaM2: units.reduce((sum, u) => sum + u.areaM2, 0),
    rentPerMonth: units.reduce((sum, u) => sum + (monthlyRent(u) ?? 0), 0),
    vacant: units.filter((u) => u.inPlaceRentPerM2 === null).length,
    edited: units.filter((u) => u.origin === "extracted" && u.clientEdited.length > 0).length,
    manual: units.filter((u) => u.origin === "manual").length,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Documents

const DOCUMENT_NOUN: Record<DocumentType, string> = {
  tenant_list: "tenant list",
  land_register: "land register",
  condo_land_register: "condominium land register",
  energy_certificate: "energy certificate",
  refurbishment_sheet: "refurbishment sheet",
  zoning_plan: "zoning plan",
  unknown: "document",
};

export function documentNoun(type: DocumentType): string {
  return DOCUMENT_NOUN[type];
}

/** A Wohnungsgrundbuch stands in for the land register (as in the flags). */
const COVERED_BY: Partial<Record<DocumentType, DocumentType[]>> = {
  land_register: ["land_register", "condo_land_register"],
};

/** The expected document types no read document covers, in the order of the flags. */
export function missingDocumentTypes(documents: Pick<DealDocument, "status" | "type">[]): DocumentType[] {
  const present = new Set(documents.filter((d) => d.status === "done").map((d) => d.type));
  return REQUIRED_DOCS.filter((type) => !(COVERED_BY[type] ?? [type]).some((t) => present.has(t)));
}

/** The read document that covers an expected type, if any. */
export function documentFor<D extends Pick<DealDocument, "status" | "type">>(documents: D[], type: DocumentType): D | null {
  const types = COVERED_BY[type] ?? [type];
  return documents.find((d) => d.status === "done" && types.includes(d.type)) ?? null;
}

export const CONDOMINIUM_NOTE = "This looks like a condominium — please add the Teilungserklärung.";

export function isCondominium(result: ExtractionResult): boolean {
  return result.documentType === "condo_land_register" || result.landRegister?.kind === "Wohnungsgrundbuch";
}

export function typeLabel(type: DocumentType): string {
  return DOCUMENT_TYPE_LABEL[type];
}

/**
 * The AI's one-line summary without its leading type when the row already names it: "Land register · plot 480 m² ·
 * 1 easement in section II" under "Land register (Grundbuch)" reads "plot 480 m² · 1 easement in section II".
 */
export function summaryDetail(summary: string, type: DocumentType): string {
  const parts = summary.split(" · ");
  if (parts.length > 1 && parts[0].trim().toLowerCase() === DOCUMENT_NOUN[type]) return parts.slice(1).join(" · ");
  return summary;
}

/** How a document was read: the words of its source marker. */
export function sourceLabel(source: DealDocument["extractionSource"]): string {
  switch (source) {
    case "live":
      return "Live AI";
    case "cache":
      return "Cached result";
    case "demo-fixture":
      return "Demo mode";
    case null:
      return "Not read";
  }
}

/** A passage the AI read a value from: a button in the document viewer. */
export interface Passage {
  /** The field path, e.g. "landRegister.plotM2". */
  key: string;
  label: string;
  page: number;
  quote: string;
  /** Whether the quote was found on that page. */
  verified: boolean;
}

function m2(area: number): string {
  return `${formatArea(area)} m²`;
}

/**
 * The passages worth showing for a read document, the main finding first (the one the viewer highlights when it
 * opens): the rent total of a tenant list, the plot area of a land register, the class of an energy certificate.
 */
export function passagesOf(result: ExtractionResult, verified: Record<string, boolean> = {}): Passage[] {
  const out: Passage[] = [];
  const add = (key: string, label: string, field: { page: number; quote: string }) =>
    out.push({ key, label, page: field.page, quote: field.quote, verified: verified[key] !== false });

  const t = result.tenantList;
  if (t) {
    add("tenantList.totalRentPerMonth", `Rent total · ${eur(t.totalRentPerMonth.value, { decimals: 2 })} per month`, t.totalRentPerMonth);
    add("tenantList.totalAreaM2", `Living area total · ${m2(t.totalAreaM2.value)}`, t.totalAreaM2);
    add("tenantList.address", `Address · ${t.address.value}`, t.address);
    t.units.forEach((u, i) => add(`tenantList.units.${i}.label`, `Unit ${i + 1} · ${u.label.value}`, u.label));
  }
  const l = result.landRegister;
  if (l) {
    add("landRegister.plotM2", `Plot area · ${m2(l.plotM2.value)}`, l.plotM2);
    add("landRegister.parcel", `Parcel · ${l.parcel.value}`, l.parcel);
    add("landRegister.address", `Address · ${l.address.value}`, l.address);
    l.easements.forEach((e, i) =>
      add(`landRegister.easements.${i}.text`, `Easement${l.easements.length > 1 ? ` ${i + 1}` : ""} in section II`, e.text),
    );
  }
  const e = result.energyCertificate;
  if (e) {
    add("energyCertificate.energyClass", `Energy class · ${e.energyClass.value}`, e.energyClass);
    add("energyCertificate.energyCarrier", `Energy carrier · ${e.energyCarrier.value}`, e.energyCarrier);
    add("energyCertificate.heatingYear", `Heating installed · ${e.heatingYear.value}`, e.heatingYear);
    add("energyCertificate.demandKwh", `Final energy demand · ${num(e.demandKwh.value)} kWh/(m²·a)`, e.demandKwh);
    add("energyCertificate.livingAreaM2", `Living area · ${m2(e.livingAreaM2.value)}`, e.livingAreaM2);
    add("energyCertificate.builtYear", `Year of construction · ${e.builtYear.value}`, e.builtYear);
    add("energyCertificate.address", `Address · ${e.address.value}`, e.address);
  }
  result.refurbishmentSheet?.measures.forEach((m, i) =>
    add(`refurbishmentSheet.measures.${i}.name`, `${m.name.value} · ${m.year.value}`, m.name),
  );
  const z = result.zoningPlan;
  if (z) {
    add("zoningPlan.areaType", `Area type · ${z.areaType.value}`, z.areaType);
    add(
      "zoningPlan.residentialAllowed",
      `Residential use · ${z.residentialAllowed.value ? "permitted" : "not permitted"}`,
      z.residentialAllowed,
    );
  }
  return out;
}

const UNIT_FIELD_LABEL: Record<string, string> = {
  label: "name",
  floor: "floor",
  areaM2: "area",
  rooms: "rooms",
  rentPerMonth: "rent",
  leaseSinceYear: "lease start",
};

const FIELD_LABEL: Record<string, string> = {
  "tenantList.totalAreaM2": "total living area",
  "tenantList.totalRentPerMonth": "rent total",
  "tenantList.address": "address",
  "landRegister.parcel": "parcel",
  "landRegister.plotM2": "plot area",
  "landRegister.address": "address",
  "energyCertificate.address": "address",
  "energyCertificate.builtYear": "year of construction",
  "energyCertificate.heatingYear": "heating year",
  "energyCertificate.energyCarrier": "energy carrier",
  "energyCertificate.energyClass": "energy class",
  "energyCertificate.demandKwh": "energy demand",
  "energyCertificate.livingAreaM2": "living area",
  "zoningPlan.areaType": "area type",
  "zoningPlan.residentialAllowed": "residential use",
};

/** "plot area", "unit 3 rent", "easement 1", "measure 2 year": a field path in words. */
export function fieldLabel(path: string): string {
  const unit = /^tenantList\.units\.(\d+)\.(\w+)$/.exec(path);
  if (unit) return `unit ${Number(unit[1]) + 1} ${UNIT_FIELD_LABEL[unit[2]] ?? unit[2]}`;
  const easement = /^landRegister\.easements\.(\d+)\.text$/.exec(path);
  if (easement) return `easement ${Number(easement[1]) + 1}`;
  const measure = /^refurbishmentSheet\.measures\.(\d+)\.(\w+)$/.exec(path);
  if (measure) return `measure ${Number(measure[1]) + 1} ${measure[2] === "year" ? "year" : "name"}`;
  return FIELD_LABEL[path] ?? path;
}

/**
 * The fields the AI was unsure of ("AI unsure — please confirm"): low confidence, a quote not found on its page, or a
 * let unit without a readable rent. They become extraction flags for the senior valuer.
 */
export function unsureFields(
  result: ExtractionResult,
  verified: Record<string, boolean>,
): { path: string; label: string; page: number; quote: string }[] {
  const fields = citedFields(result)
    .filter(({ path, field }) => field.confidence === "low" || verified[path] === false)
    .map(({ path, field }) => ({ path, label: fieldLabel(path), page: field.page, quote: field.quote }));
  result.tenantList?.units.forEach((row, i) => {
    if (!row.vacant && row.rentPerMonth === null) {
      const path = `tenantList.units.${i}.rentPerMonth`;
      fields.push({ path, label: fieldLabel(path), page: row.label.page, quote: row.label.quote });
    }
  });
  return fields;
}

// ---------------------------------------------------------------------------------------------------------------------
// Files

export type FileKind = "pdf" | "photo" | "other";

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export function fileKind(file: Pick<FileLike, "name" | "type">): FileKind {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (/^image\/(jpeg|png|webp)$/.test(file.type) || (file.type === "" && /\.(jpe?g|png|webp)$/i.test(file.name))) {
    return "photo";
  }
  return "other";
}

export const TOO_LARGE_MESSAGE = "This PDF is larger than 5 MB.";

export function isTooLarge(file: Pick<FileLike, "size">): boolean {
  return file.size > MAX_PDF_BYTES;
}

function nameList(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

export interface AdditionPlan<F extends FileLike> {
  pdfs: F[];
  photos: F[];
  /** Failed rows of the same file names, which the new files replace. */
  replaceDocumentIds: string[];
  /** What was skipped and why, for the status line; null when every file was taken. */
  notice: string | null;
}

/**
 * Which dropped files the request takes: PDFs and photos (JPEG, PNG, WebP), at most `limit` documents and `limit`
 * photos per request, no file name twice. A new file replaces a failed document of the same name.
 */
export function planAdditions<F extends FileLike>(
  current: { documents: Pick<DealDocument, "id" | "fileName" | "status">[]; photos: { fileName: string }[] },
  files: F[],
  limit: number = MAX_FILES_PER_DEAL,
): AdditionPlan<F> {
  const pdfs: F[] = [];
  const photos: F[] = [];
  const replaceDocumentIds: string[] = [];
  const unsupported: string[] = [];
  const duplicates: string[] = [];
  const overDocuments: string[] = [];
  const overPhotos: string[] = [];

  const docNames = new Set(current.documents.filter((d) => d.status !== "failed").map((d) => d.fileName));
  const photoNames = new Set(current.photos.map((p) => p.fileName));
  let documents = current.documents.length;
  let photoCount = current.photos.length;

  for (const file of files) {
    const kind = fileKind(file);
    if (kind === "other") {
      unsupported.push(file.name);
    } else if (kind === "pdf") {
      if (docNames.has(file.name)) {
        duplicates.push(file.name);
        continue;
      }
      const failed = current.documents.filter(
        (d) => d.fileName === file.name && d.status === "failed" && !replaceDocumentIds.includes(d.id),
      );
      if (documents - failed.length >= limit) {
        overDocuments.push(file.name);
        continue;
      }
      replaceDocumentIds.push(...failed.map((d) => d.id));
      documents += 1 - failed.length;
      docNames.add(file.name);
      pdfs.push(file);
    } else {
      if (photoNames.has(file.name)) {
        duplicates.push(file.name);
        continue;
      }
      if (photoCount >= limit) {
        overPhotos.push(file.name);
        continue;
      }
      photoCount += 1;
      photoNames.add(file.name);
      photos.push(file);
    }
  }

  const sentences = [
    unsupported.length > 0 &&
      `Skipped ${nameList(unsupported)}: only PDF documents and photos (JPEG, PNG or WebP) can be added.`,
    duplicates.length > 0 && `Already added: ${nameList(duplicates)}.`,
    overDocuments.length > 0 &&
      `Skipped ${nameList(overDocuments)}: a request takes up to ${limit} documents. Remove one to add another.`,
    overPhotos.length > 0 && `Skipped ${nameList(overPhotos)}: a request takes up to ${limit} photos.`,
  ].filter((s): s is string => typeof s === "string");
  return { pdfs, photos, replaceDocumentIds, notice: sentences.length > 0 ? sentences.join(" ") : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatting and parsing

/** "565" or "62.5". */
export function formatArea(area: number): string {
  const tenth = Math.round(area * 10) / 10;
  return num(tenth, Number.isInteger(tenth) ? 0 : 1);
}

/** "<1 ms", "12 ms", "1.4 s", "1 min 5 s"; "—" when not measured. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/**
 * A number typed by the client: "62", "62.5" or "62,5" (German decimal comma). Empty text is null; anything else
 * (letters, thousands separators, signs) is NaN.
 */
export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const normalised = /^\d+,\d+$/.test(t) ? t.replace(",", ".") : t;
  return /^\d+(\.\d+)?$/.test(normalised) ? Number(normalised) : Number.NaN;
}

// ---------------------------------------------------------------------------------------------------------------------
// Run log (C4)

export interface RunLogRow {
  step: number;
  label: string;
  /** Words of the step's marker: how a document was read, or which part of the pipeline ran. */
  kind: string;
  tone: PillTone;
  result: string;
  durationMs: number | null;
  failed: boolean;
}

const KIND_WORDS: Record<Deal["runLog"][number]["kind"], { kind: string; tone: PillTone }> = {
  live_ai: { kind: "Live AI", tone: "ai" },
  cache: { kind: "Cached result", tone: "neutral" },
  demo: { kind: "Demo mode", tone: "neutral" },
  lookup: { kind: "Lookup", tone: "ok" },
  estimator: { kind: "Rent estimator", tone: "ai" },
  rules: { kind: "Rules", tone: "neutral" },
  engine: { kind: "Engine", tone: "brand" },
};

/** The AI draft's value at the start of the engine step's result, e.g. "€1,300,000; …". */
const DRAFT_VALUE = /^[−-]?€[\d,.]+;\s*/;

/**
 * The rows of the AI-at-work log: one per document (spec §5.3.4 steps 1–5 for the sample), then the pipeline's steps
 * from `deal.runLog`. With `hideDraftValue` the client does not see the unsigned AI draft's value (C2 shows the value
 * only after sign-off).
 */
export function runLogRows(deal: Pick<Deal, "documents" | "runLog">, opts: { hideDraftValue?: boolean } = {}): RunLogRow[] {
  const documents = deal.documents.map((doc, i): RunLogRow => {
    const step = i + 1;
    if (doc.status === "done") {
      return {
        step,
        label: doc.type === "unknown" ? `Read ${doc.fileName}` : `Read ${documentNoun(doc.type)}`,
        kind: sourceLabel(doc.extractionSource),
        tone: doc.extractionSource === "live" ? "ai" : "neutral",
        result:
          doc.findings.length > 0 ? doc.findings.join("; ") : "Not a document type the valuation uses",
        durationMs: doc.durationMs,
        failed: false,
      };
    }
    return {
      step,
      label: `Read ${doc.fileName}`,
      kind: "Not read",
      tone: "neutral",
      result: doc.error ?? "The document was not read.",
      durationMs: doc.durationMs,
      failed: true,
    };
  });
  const pipeline = deal.runLog.map(
    (entry): RunLogRow => ({
      step: entry.step,
      label: entry.label,
      ...KIND_WORDS[entry.kind],
      result:
        opts.hideDraftValue && entry.kind === "engine" ? entry.result.replace(DRAFT_VALUE, "Value computed; ") : entry.result,
      durationMs: entry.durationMs,
      failed: false,
    }),
  );
  return [...documents, ...pipeline];
}
