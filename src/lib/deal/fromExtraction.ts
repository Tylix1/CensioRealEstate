/**
 * Builds a Deal from the extraction results of its documents (spec §5.3, §6.1). Pure and deterministic.
 *
 * - Each section (tenant list, land register, …) is read from the first document that carries it.
 * - Every extracted fact keeps its citation as a Quote. `verified` comes from the quote check, keyed by field path
 *   (e.g. "tenantList.units.0.areaM2"), and defaults to true.
 * - A cited field with low confidence or an unverified quote is listed by its path in its document's
 *   `uncertainFields`, which raises an extraction flag.
 * - `findings` holds one English line per section read, templated from the data (the run-log results of §5.3.4).
 */
import type { Deal, DealDocument, Easement, PropertyFacts, Quote, RefurbMeasure, Unit } from "@/lib/deal/types";
import { measurePoints, totalModernisationPoints } from "@/lib/extraction/points";
import type { Cited, ExtractionResult } from "@/lib/extraction/schemas";
import { eur, num, round2 } from "@/lib/format";

export interface DealSkeleton {
  id: string;
  clientName: string;
  address: Deal["address"];
  usageType: Deal["usageType"];
  scope: Deal["scope"];
  valuationDate: string;
  requestedAt: string;
}

/** One read document: its wizard row, its extraction result and the quote check (field path → quote found on its page). */
export interface ExtractedDocument {
  doc: DealDocument;
  result: ExtractionResult;
  verified: Record<string, boolean>;
}

type SectionKey = "tenantList" | "landRegister" | "energyCertificate" | "refurbishmentSheet" | "zoningPlan";
type SectionData<K extends SectionKey> = NonNullable<ExtractionResult[K]>;

interface Section<K extends SectionKey> {
  data: SectionData<K>;
  /** The Quote for a cited field of this section; `path` is relative to the section, e.g. "units.0.label". */
  quote(field: Cited<unknown>, path: string): Quote;
}

function findSection<K extends SectionKey>(docs: ExtractedDocument[], key: K): Section<K> | null {
  for (const { doc, result, verified } of docs) {
    const data = result[key];
    if (data) {
      return {
        data: data as SectionData<K>,
        quote: (field, path) => ({
          documentId: doc.id,
          page: field.page,
          quote: field.quote,
          confidence: field.confidence,
          verified: verified[`${key}.${path}`] ?? true,
        }),
      };
    }
  }
  return null;
}

export function dealFromExtractions(skel: DealSkeleton, docs: ExtractedDocument[]): Deal {
  return {
    id: skel.id,
    clientName: skel.clientName,
    clientSide: "buy-side",
    address: { ...skel.address },
    usageType: skel.usageType,
    scope: skel.scope,
    valuationDate: skel.valuationDate,
    requestedAt: skel.requestedAt,
    documents: docs.map(({ doc, result, verified }) => ({
      ...doc,
      type: result.documentType,
      findings: findingsOf(result),
      uncertainFields: uncertainFieldsOf(result, verified),
    })),
    photos: [],
    property: propertyFrom(docs),
    units: unitsFrom(findSection(docs, "tenantList")),
    status: "draft",
    runLog: [],
  };
}

/** Units `u1…un` in tenant-list order; a vacant unit (or one without a readable rent) has no in-place rent. */
function unitsFrom(tenantList: Section<"tenantList"> | null): Unit[] {
  if (!tenantList) return [];
  return tenantList.data.units.map((row, i): Unit => {
    const rent = row.vacant ? null : row.rentPerMonth;
    const area = row.areaM2.value;
    return {
      id: `u${i + 1}`,
      label: row.label.value,
      floor: row.floor.value,
      areaM2: area,
      rooms: row.rooms.value,
      inPlaceRentPerM2: rent && area > 0 ? round2(rent.value / area) : null,
      leaseSinceYear: row.vacant ? null : (row.leaseSinceYear?.value ?? null),
      features: Array.from(new Set(row.features)),
      photoIds: [],
      origin: "extracted",
      clientEdited: [],
      source: tenantList.quote(row.label, `units.${i}.label`),
    };
  });
}

function propertyFrom(docs: ExtractedDocument[]): PropertyFacts {
  const tenantList = findSection(docs, "tenantList");
  const land = findSection(docs, "landRegister");
  const energy = findSection(docs, "energyCertificate");
  const refurb = findSection(docs, "refurbishmentSheet");
  const zoning = findSection(docs, "zoningPlan");

  const refurbishments: RefurbMeasure[] = refurb
    ? refurb.data.measures.map((m, i) => ({
        name: m.name.value,
        category: m.category,
        extent: m.extent,
        year: m.year.value,
        points: measurePoints(m.category, m.extent),
        source: refurb.quote(m.name, `measures.${i}.name`),
      }))
    : [];
  const heatingYears = refurbishments.filter((m) => m.category === "heating").map((m) => m.year);

  // Ids are the 1-based positions of the extracted Abteilung II entries (the sample's lfd. Nr. 1 gets "1"), so its
  // easement flag reads "easement-1".
  const easements: Easement[] = land
    ? land.data.easements.map((e, i) => ({
        id: String(i + 1),
        text: e.text.value,
        translation: e.translationEn,
        source: land.quote(e.text, `easements.${i}.text`),
      }))
    : [];

  return {
    builtYear: energy?.data.builtYear.value ?? null,
    builtYearSource: energy ? energy.quote(energy.data.builtYear, "builtYear") : null,
    plotM2: land?.data.plotM2.value ?? null,
    plotSource: land ? land.quote(land.data.plotM2, "plotM2") : null,
    parcel: land?.data.parcel.value ?? null,
    landRegisterKind: land?.data.kind ?? null,
    addressOnLandRegister: land?.data.address.value ?? null,
    addressOnEnergyCert: energy?.data.address.value ?? null,
    livingAreaM2FromEnergyCert: energy?.data.livingAreaM2.value ?? null,
    heatingYear: energy?.data.heatingYear.value ?? null,
    heatingYearFromRefurb: heatingYears.length > 0 ? Math.max(...heatingYears) : null,
    energyClass: energy?.data.energyClass.value ?? null,
    energyDemandKwh: energy?.data.demandKwh.value ?? null,
    energyCarrier: energy?.data.energyCarrier.value ?? null,
    easements,
    landChargesCount: land?.data.landChargesCount ?? 0,
    zoning: zoning
      ? {
          areaType: zoning.data.areaType.value,
          residentialAllowed: zoning.data.residentialAllowed.value,
          source: zoning.quote(zoning.data.areaType, "areaType"),
        }
      : null,
    refurbishments,
    modernisationPoints: totalModernisationPoints(refurbishments),
    tenantListTotalRentPerMonth: tenantList?.data.totalRentPerMonth.value ?? null,
    tenantListTotalAreaM2: tenantList?.data.totalAreaM2.value ?? null,
    tenantListTotalSource: tenantList ? tenantList.quote(tenantList.data.totalRentPerMonth, "totalRentPerMonth") : null,
  };
}

function isCited(node: unknown): node is Cited<unknown> {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
  const o = node as Record<string, unknown>;
  return "value" in o && typeof o.page === "number" && typeof o.quote === "string" && typeof o.confidence === "string";
}

/**
 * Every cited field of an extraction result with its path, e.g. "tenantList.units.0.areaM2" or
 * "landRegister.easements.0.text". These paths are the keys of the quote check (`verified`) and of `uncertainFields`.
 */
export function citedFields(result: ExtractionResult): { path: string; field: Cited<unknown> }[] {
  const fields: { path: string; field: Cited<unknown> }[] = [];
  const walk = (node: unknown, path: string): void => {
    if (isCited(node)) {
      fields.push({ path, field: node });
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}.${i}`));
    } else if (typeof node === "object" && node !== null) {
      for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(result, "");
  return fields;
}

function uncertainFieldsOf(result: ExtractionResult, verified: Record<string, boolean>): string[] {
  const fields = citedFields(result)
    .filter(({ path, field }) => field.confidence === "low" || verified[path] === false)
    .map(({ path }) => path);
  // A let unit whose rent could not be read would otherwise pass silently as vacant.
  result.tenantList?.units.forEach((row, i) => {
    if (!row.vacant && row.rentPerMonth === null) fields.push(`tenantList.units.${i}.rentPerMonth`);
  });
  return fields;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** `565` or `565.5`: areas to one decimal, without a trailing `.0`. */
function m2(area: number): string {
  const tenth = Math.round(area * 10) / 10;
  return num(tenth, Number.isInteger(tenth) ? 0 : 1);
}

function capitalise(text: string): string {
  const t = text.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** One English line per section, e.g. "8 units, 565 m², €60,484/yr" for the sample tenant list. */
function findingsOf(result: ExtractionResult): string[] {
  const { tenantList, landRegister, energyCertificate, refurbishmentSheet, zoningPlan } = result;
  const lines: string[] = [];

  if (tenantList) {
    const rows = tenantList.units;
    const area = rows.reduce((sum, r) => sum + r.areaM2.value, 0);
    const rentPerMonth = rows.reduce((sum, r) => sum + (r.vacant || !r.rentPerMonth ? 0 : r.rentPerMonth.value), 0);
    const vacant = rows.filter((r) => r.vacant).length;
    lines.push(
      `${count(rows.length, "unit")}, ${m2(area)} m², ${eur(rentPerMonth * 12)}/yr${vacant > 0 ? `, ${vacant} vacant` : ""}`,
    );
  }

  if (landRegister) {
    const easements = landRegister.easements.length;
    const charges = landRegister.landChargesCount;
    const chargesText = charges === 0 ? "" : charges === 1 ? "; land charge ignored" : `; ${charges} land charges ignored`;
    lines.push(
      `Plot ${m2(landRegister.plotM2.value)} m², ${easements === 0 ? "no easements" : count(easements, "easement")}${chargesText}`,
    );
  }

  if (energyCertificate) {
    const e = energyCertificate;
    lines.push(
      `${capitalise(e.energyCarrier.value)}, ${e.heatingYear.value}, class ${e.energyClass.value}, ${m2(e.livingAreaM2.value)} m²`,
    );
  }

  if (refurbishmentSheet) {
    const measures = refurbishmentSheet.measures;
    if (measures.length === 0) {
      lines.push("No modernisation measures");
    } else {
      const years = measures.map((m) => m.year.value);
      const from = Math.min(...years);
      const to = Math.max(...years);
      const points = totalModernisationPoints(
        measures.map((m) => ({ category: m.category, points: measurePoints(m.category, m.extent) })),
      );
      lines.push(`${count(measures.length, "measure")} ${from === to ? from : `${from}–${to}`}, ${count(points, "point")}`);
    }
  }

  if (zoningPlan) {
    lines.push(
      zoningPlan.residentialAllowed.value
        ? "Residential, no value effect"
        : `${zoningPlan.areaType.value}: residential use not permitted`,
    );
  }

  return lines;
}
