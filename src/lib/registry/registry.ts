/**
 * The figure registry (spec §5.5): every figure the review screen and the report show, with its provenance. The
 * provenance bar, the ledger, the PDF highlights and the outlining of dependent figures during a revision read it.
 * Pure and deterministic: every figure, and every number in its texts, comes from the context.
 *
 * - **Figures** are a fixed list (`FIGURE_IDS`), grouped by their default source type: 9 from client documents,
 *   3 public data, 5 ImmoWertV rules, 4 AI estimates and 10 calculated. The order is also a dependency order: every
 *   figure comes after the figures it depends on.
 * - **Overrides.** A figure the valuer set (`valuerChanged`) becomes `valuer`. Calculated figures never do: they follow
 *   from their inputs, and `dependentsOf` finds them. Client edits are read from `Unit.clientEdited` and
 *   `Unit.origin`: an edited area makes the living area `client_input`, and the in-place rent too when the unit is let
 *   (rents are kept per m²); an edited rent, or a unit marked vacant, makes the in-place rent `client_input`; a unit
 *   added by hand makes the units, the living area and, if it is let, the in-place rent `client_input`. Edits of floor
 *   or features only move the AI's rent estimate, and rooms or lease start feed no figure, so they change no source.
 * - **`quote`** is the verbatim citation of the figure's own value, set only while the value is the document's.
 *   Figures summed or counted over several rows (units, living area, modernisation points) and values whose citation
 *   the deal does not keep (the energy certificate's heating year) have none; their `sourceDetail` names document and
 *   page instead.
 * - **`confidence`** is set for the figures the AI read or estimated. A document figure is `low` when an extraction
 *   flag doubts one of its fields, else it takes the lowest confidence of the citations behind it. An AI estimate takes
 *   its call's confidence, or `high` when the AI raised no call. The land-value lookup keeps its own (low for the
 *   fallback value).
 * - **`flagId`** links the flag that questions the figure's value: a missing document, an uncertain reading, a unit
 *   added by hand, the land-value fallback, or the AI's judgement call.
 */
import {
  DOCUMENT_TYPE_LABEL,
  type Confidence,
  type Deal,
  type DocumentType,
  type EditableUnitField,
  type MeasureCategory,
  type Quote,
  type RefurbMeasure,
  type Unit,
} from "@/lib/deal/types";
import { ANNEX2_MAX_POINTS } from "@/lib/extraction/points";
import type { Flag, FlagContext, FlagKind } from "@/lib/flags/rules";
import { eur, num, pct, rentM2, round2 } from "@/lib/format";
import { BORIS_SOURCE_LABEL } from "@/lib/lookups/boris";
import { ANNEX3 } from "@/lib/lookups/costs";
import type { ParamKey } from "@/lib/revisions/history";
import { remainingLife } from "@/lib/valuation/engine";

export type SourceType =
  | "client_document"
  | "public_data"
  | "regulation"
  | "calculated"
  | "ai_estimate"
  | "client_input"
  | "valuer";

/** Every source type, in the order of the union (e.g. for the provenance bar's legend). */
export const SOURCE_TYPES: SourceType[] = [
  "client_document",
  "public_data",
  "regulation",
  "calculated",
  "ai_estimate",
  "client_input",
  "valuer",
];

export interface Figure {
  /** One of FIGURE_IDS; stable across versions. */
  id: string;
  label: string;
  /** The value as shown, e.g. "€1,300,000", "9.60 €/m²", "3.0 %", "42 years"; "—" when no document provides it. */
  display: string;
  sourceType: SourceType;
  /** Where the value comes from, in words: document and page, table and row, annex, formula, or who changed it. */
  sourceDetail: string;
  /** The verbatim citation of the value in a client document, while the value is the document's. */
  quote: Quote | null;
  /** For figures the AI read or estimated. */
  confidence: Confidence | null;
  /** The figures this one is computed from (spec §5.3.5). */
  dependsOn: string[];
  /** The flag that questions this figure's value. */
  flagId: string | null;
}

/** What the registry is built from: the pipeline's flag context, its flags and the figures the valuer changed. */
export type RegistryContext = FlagContext & {
  flags: Flag[];
  /** Ids of the figures the valuer set in an active revision; a revision's parameter keys are accepted too. */
  valuerChanged: string[];
};

/** All figures, in registry order. */
export const FIGURE_IDS = [
  // client_document
  "unitsCount",
  "livingArea",
  "inPlaceIncome",
  "plotArea",
  "builtYear",
  "modernisationMeasures",
  "heatingYear",
  "zoning",
  "easements",
  // public_data
  "landValuePerM2",
  "capRateRange",
  "comparables",
  // regulation
  "managementCost",
  "maintenanceCost",
  "rentLossRisk",
  "totalLife",
  "remainingLife",
  // ai_estimate
  "marketRent",
  "capRate",
  "underRentYears",
  "easementImpact",
  // calculated
  "grossIncome",
  "operatingCosts",
  "netIncome",
  "landValue",
  "landInterest",
  "buildingNetIncome",
  "pvFactor",
  "buildingValue",
  "underRentDeduction",
  "marketValue",
] as const;

export type FigureId = (typeof FIGURE_IDS)[number];

/** The figure each revisable parameter sets (spec §6.2), e.g. for `valuerChanged` or the figures to outline. */
export const PARAM_FIGURE: Record<ParamKey, FigureId> = {
  capRate: "capRate",
  marketRentAvg: "marketRent",
  marketRentUnit: "marketRent",
  underRentYears: "underRentYears",
  easementDeduction: "easementImpact",
  remainingLifeYears: "remainingLife",
};

/** The engine's dependencies (spec §5.3.5). */
const DEPENDS_ON: Partial<Record<FigureId, FigureId[]>> = {
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
};

/** A figure before the valuer override and its dependencies; `valuerDetail` replaces the source once the valuer set it. */
type Draft = Omit<Figure, "id" | "dependsOn"> & { id: FigureId; valuerDetail?: string };

export function buildRegistry(ctx: RegistryContext): Figure[] {
  const byValuer = new Set(toFigureIds(ctx.valuerChanged));
  const drafts: Draft[] = [
    ...documentFigures(ctx),
    ...publicDataFigures(ctx),
    ...regulationFigures(ctx),
    ...aiEstimateFigures(ctx),
    ...calculatedFigures(ctx),
  ];
  return drafts.map(({ valuerDetail, ...draft }): Figure => {
    const valuer = draft.sourceType !== "calculated" && byValuer.has(draft.id);
    return {
      ...draft,
      ...(valuer
        ? {
            sourceType: "valuer" as const,
            sourceDetail: valuerDetail ?? `Set by the valuer; before: ${draft.sourceDetail}`,
            quote: null,
            confidence: null,
          }
        : {}),
      dependsOn: [...(DEPENDS_ON[draft.id] ?? [])],
    };
  });
}

/** Figures per source type; every type has a key. */
export function countBySource(figs: Figure[]): Record<SourceType, number> {
  const counts = Object.fromEntries(SOURCE_TYPES.map((t) => [t, 0])) as Record<SourceType, number>;
  for (const f of figs) counts[f.sourceType] += 1;
  return counts;
}

/**
 * Every figure that depends on one of `ids`, directly or through other figures, in registry order and without the ids
 * themselves. Unknown ids have no dependents; a revision's parameter keys stand for the figures they set.
 */
export function dependentsOf(figs: Figure[], ids: string[]): string[] {
  const start = new Set(toFigureIds(ids));
  const reached = new Set<string>();
  const queue = [...start];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const f of figs) {
      if (!start.has(f.id) && !reached.has(f.id) && f.dependsOn.includes(id)) {
        reached.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return figs.filter((f) => reached.has(f.id)).map((f) => f.id);
}

/** Maps a revision's parameter keys to their figures; figure ids pass through. */
function toFigureIds(ids: string[]): string[] {
  return ids.map((id) => (Object.prototype.hasOwnProperty.call(PARAM_FIGURE, id) ? PARAM_FIGURE[id as ParamKey] : id));
}

// ---------------------------------------------------------------------------------------------------------------------
// Client documents

/** A figure read from a client document, as `documentFigure` turns it into a draft. */
interface DocumentSource {
  id: FigureId;
  label: string;
  display: string;
  /** The required document type whose absence leaves the value open. */
  type: DocumentType;
  /** The document the value was read from; null when none provides it. */
  documentId: string | null;
  /** Document, page and what was read; null when no document provides the value. */
  detail: string | null;
  /** The source when no document provides the value; defaults to "<document> missing". */
  missingDetail?: string;
  quote: Quote | null;
  /** The citations behind the value, for its confidence. */
  citations: Quote[];
  /** The extracted field paths behind the value, for the extraction flags. */
  fields: RegExp;
  /** What the client changed or added, e.g. "changed by the client: area of GF left"; any makes it client input. */
  client: string[];
  /** The call on what the client added, e.g. a unit added by hand. */
  clientFlag?: Flag;
}

function documentFigure(ctx: RegistryContext, s: DocumentSource): Draft {
  const missing = flagById(ctx, `missing_document-${s.type}`);
  const doubt = extractionFlag(ctx, s.documentId, s.fields);
  const read = s.detail !== null;
  const clientInput = s.client.length > 0;
  const source = s.detail ?? s.missingDetail ?? `${DOCUMENT_TYPE_LABEL[s.type]} missing`;
  return {
    id: s.id,
    label: s.label,
    display: s.display,
    sourceType: clientInput ? "client_input" : "client_document",
    sourceDetail: [source, ...s.client].join("; "),
    quote: read && !clientInput && s.quote ? { ...s.quote } : null,
    confidence: !read || clientInput ? null : doubt ? "low" : lowest(s.citations),
    flagId: (missing ?? doubt ?? s.clientFlag)?.id ?? null,
  };
}

function documentFigures(ctx: RegistryContext): Draft[] {
  const { deal, valuation } = ctx;
  const p = deal.property;

  // Tenant list: units, living area, in-place rent.
  const rows = deal.units.filter((u) => u.origin === "extracted");
  const manual = deal.units.filter((u) => u.origin === "manual");
  const letRows = rows.filter((u) => u.inPlaceRentPerM2 !== null);
  const letManual = manual.filter((u) => u.inPlaceRentPerM2 !== null);
  const rowQuotes = rows.flatMap((u) => (u.source ? [u.source] : []));
  const totalRow = p.tenantListTotalSource;
  const tenantId = totalRow?.documentId ?? rowQuotes[0]?.documentId ?? null;
  const tenant =
    tenantId === null
      ? null
      : where(documentLabel(deal, tenantId, "tenant_list"), totalRow ? [...rowQuotes, totalRow] : rowQuotes);
  const addedByHand = (units: Unit[]): string[] => (units.length > 0 ? [`added by hand: ${names(units)}`] : []);
  const changedByClient = (changes: [string, Unit[]][]): string[] => {
    const parts = changes.filter(([, units]) => units.length > 0).map(([field, units]) => `${field} of ${names(units)}`);
    return parts.length > 0 ? [`changed by the client: ${parts.join(", ")}`] : [];
  };
  const totalRent = p.tenantListTotalRentPerMonth;

  // Refurbishment sheet; a sheet without measures still counts as read.
  const measures = p.refurbishments;
  const measureQuotes = measures.map((m) => m.source);
  const refurbId = measureQuotes[0]?.documentId ?? readDocumentId(deal, "refurbishment_sheet");
  const refurbLabel = documentLabel(deal, refurbId, "refurbishment_sheet");

  // Land register: plot area and easements.
  const landId = p.plotSource?.documentId ?? p.easements[0]?.source.documentId ?? null;
  const landLabel = documentLabel(deal, landId, "land_register");
  const easementQuotes = p.easements.map((e) => e.source);

  return [
    documentFigure(ctx, {
      id: "unitsCount",
      label: "Units",
      display: String(deal.units.length),
      type: "tenant_list",
      documentId: tenantId,
      detail: tenant && `${tenant}: ${count(rows.length, "unit row")}`,
      quote: null,
      citations: rowQuotes,
      fields: /^tenantList\.units\.\d+\.label$/,
      client: addedByHand(manual),
      clientFlag: manualUnitFlag(ctx, manual),
    }),
    documentFigure(ctx, {
      id: "livingArea",
      label: "Living area",
      display: `${m2(valuation.livingAreaM2)} m²`,
      type: "tenant_list",
      documentId: tenantId,
      detail:
        tenant &&
        `${tenant}: ${rows.length === 0 ? "no unit rows" : rows.length === 1 ? "the unit row" : `sum of the ${rows.length} unit rows`}`,
      quote: null,
      citations: rowQuotes,
      fields: /^tenantList\.(units\.\d+\.areaM2|totalAreaM2)$/,
      client: [...changedByClient([["area", rows.filter((u) => edited(u, "areaM2"))]]), ...addedByHand(manual)],
      clientFlag: manualUnitFlag(ctx, manual),
    }),
    documentFigure(ctx, {
      id: "inPlaceIncome",
      label: "In-place rent",
      display: `${eur(valuation.inPlaceIncome)}/yr`,
      type: "tenant_list",
      documentId: tenantId,
      detail:
        tenant &&
        [
          `${tenant}: ${letRows.length === 0 ? "no let units" : letRows.length === 1 ? "rent of the let unit × 12" : `rent of the ${letRows.length} let units × 12`}`,
          ...(totalRent === null ? [] : [`total row ${eur(totalRent, { decimals: 2 })} a month`]),
        ].join("; "),
      quote: totalRow,
      citations: totalRow ? [totalRow, ...rowQuotes] : rowQuotes,
      fields: /^tenantList\.(units\.\d+\.rentPerMonth|totalRentPerMonth)$/,
      // In-place rent is stored per m², so an edited area changes a let unit's rent too.
      client: [
        ...changedByClient([
          ["rent", rows.filter((u) => edited(u, "inPlaceRentPerM2"))],
          ["area", letRows.filter((u) => edited(u, "areaM2"))],
        ]),
        ...addedByHand(letManual),
      ],
      clientFlag: manualUnitFlag(ctx, letManual),
    }),
    documentFigure(ctx, {
      id: "plotArea",
      label: "Plot area",
      display: p.plotM2 === null ? DASH : `${m2(p.plotM2)} m²`,
      type: "land_register",
      documentId: landId,
      detail:
        p.plotSource && p.plotM2 !== null
          ? `${where(landLabel, [p.plotSource])}${p.parcel ? `: ${p.parcel}` : ""}`
          : null,
      quote: p.plotSource,
      citations: p.plotSource ? [p.plotSource] : [],
      fields: /^landRegister\.plotM2$/,
      client: [],
    }),
    documentFigure(ctx, {
      id: "builtYear",
      label: "Year of construction",
      display: p.builtYear === null ? DASH : String(p.builtYear),
      type: "energy_certificate",
      documentId: p.builtYearSource?.documentId ?? null,
      detail:
        p.builtYearSource && p.builtYear !== null
          ? where(documentLabel(deal, p.builtYearSource.documentId, "energy_certificate"), [p.builtYearSource])
          : null,
      quote: p.builtYearSource,
      citations: p.builtYearSource ? [p.builtYearSource] : [],
      fields: /^energyCertificate\.builtYear$/,
      client: [],
    }),
    documentFigure(ctx, {
      id: "modernisationMeasures",
      label: "Modernisation points",
      display: String(p.modernisationPoints),
      type: "refurbishment_sheet",
      documentId: refurbId,
      detail:
        refurbId === null
          ? null
          : measures.length === 0
            ? `${refurbLabel}: no measures listed`
            : `${where(refurbLabel, measureQuotes)}: ${count(measures.length, "measure")} ${yearSpan(measures)}; ImmoWertV Annex 2 points (simplified): ${pointsByElement(measures)}`,
      missingDetail: `${DOCUMENT_TYPE_LABEL.refurbishment_sheet} missing: no modernisation credited`,
      quote: null,
      citations: measureQuotes,
      fields: /^refurbishmentSheet\.measures\.\d+\.(name|year)$/,
      client: [],
    }),
    heatingYearFigure(ctx),
    documentFigure(ctx, {
      id: "zoning",
      label: "Zoning",
      display: p.zoning ? p.zoning.areaType : DASH,
      type: "zoning_plan",
      documentId: p.zoning?.source.documentId ?? null,
      detail: p.zoning
        ? `${where(documentLabel(deal, p.zoning.source.documentId, "zoning_plan"), [p.zoning.source])}: residential use ${p.zoning.residentialAllowed ? "permitted" : "not permitted"}`
        : null,
      quote: p.zoning?.source ?? null,
      citations: p.zoning ? [p.zoning.source] : [],
      fields: /^zoningPlan\.(areaType|residentialAllowed)$/,
      client: [],
    }),
    documentFigure(ctx, {
      id: "easements",
      label: "Easements (section II)",
      display: landId === null ? DASH : String(p.easements.length),
      type: "land_register",
      documentId: landId,
      detail:
        landId === null
          ? null
          : (p.easements.length > 0
              ? `${where(landLabel, easementQuotes)}, section II`
              : `${landLabel}: no entries in section II`) + landChargesNote(p.landChargesCount),
      // The first entry's text; each easement's own call points to its entry.
      quote: p.easements[0]?.source ?? null,
      citations: easementQuotes,
      fields: /^landRegister\.easements\.\d+\.text$/,
      client: [],
    }),
  ];
}

/** The energy certificate's heating year, or the refurbishment sheet's when the certificate gives none. */
function heatingYearFigure(ctx: RegistryContext): Draft {
  const { deal } = ctx;
  const p = deal.property;
  const base = { id: "heatingYear" as const, label: "Heating year", quote: null, client: [] };

  if (p.heatingYear !== null) {
    const energyId = p.builtYearSource?.documentId ?? readDocumentId(deal, "energy_certificate");
    const refurb = p.heatingYearFromRefurb;
    return documentFigure(ctx, {
      ...base,
      display: String(p.heatingYear),
      type: "energy_certificate",
      documentId: energyId,
      // The deal does not keep the certificate's citation of the heating year, so no page.
      detail: `${documentLabel(deal, energyId, "energy_certificate")}${refurb === null ? "" : refurb === p.heatingYear ? "; matches the refurbishment sheet" : `; the refurbishment sheet gives ${refurb}`}`,
      citations: [],
      fields: /^energyCertificate\.heatingYear$/,
    });
  }

  if (p.heatingYearFromRefurb !== null) {
    const rows = p.refurbishments
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.category === "heating" && m.year === p.heatingYearFromRefurb);
    const quotes = rows.map(({ m }) => m.source);
    const refurbId = quotes[0]?.documentId ?? null;
    return documentFigure(ctx, {
      ...base,
      display: String(p.heatingYearFromRefurb),
      type: "refurbishment_sheet",
      documentId: refurbId,
      detail: `${where(documentLabel(deal, refurbId, "refurbishment_sheet"), quotes)}: heating measure`,
      citations: quotes,
      fields: new RegExp(`^refurbishmentSheet\\.measures\\.(${rows.map(({ i }) => i).join("|")})\\.(name|year)$`),
    });
  }

  return documentFigure(ctx, {
    ...base,
    display: DASH,
    type: "energy_certificate",
    documentId: null,
    detail: null,
    citations: [],
    fields: /^energyCertificate\.heatingYear$/,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Public data and ImmoWertV rules

function publicDataFigures(ctx: RegistryContext): Draft[] {
  const { land, capRate, rent } = ctx;
  const { row } = capRate;
  return [
    {
      id: "landValuePerM2",
      label: "Standard land value",
      display: landRate(land.valuePerM2),
      sourceType: "public_data",
      sourceDetail:
        land.note === null
          ? `${BORIS_SOURCE_LABEL}, zone ${land.zone}, as of ${dayMonthYear(land.asOf)}`
          : `${BORIS_SOURCE_LABEL}: ${lowerFirst(land.note)}; fallback value as of ${dayMonthYear(land.asOf)}`,
      quote: null,
      confidence: land.confidence,
      flagId: flagOfKind(ctx, "land_value")?.id ?? null,
    },
    {
      id: "capRateRange",
      label: "Cap rate range",
      display: pctRange(row.range),
      sourceType: "public_data",
      sourceDetail: `${capRate.source}, p. ${capRate.page}, table ${capRate.table}: ${row.label.toLowerCase()}, median ${pct(row.median)}, n = ${row.n}; ${capRate.districtValue === null ? "no district figure" : `district figure ${pct(capRate.districtValue)}`}`,
      quote: null,
      confidence: null,
      flagId: null,
    },
    {
      id: "comparables",
      label: "Comparable listings",
      display: String(rent.recentCount + rent.olderCount),
      sourceType: "public_data",
      sourceDetail: `Sample asking-rent listings: ${rent.recentCount} from the last 12 months, ${rent.olderCount} older and index-adjusted; location base ${rentM2(rent.base)}`,
      quote: null,
      confidence: null,
      flagId: null,
    },
  ];
}

function regulationFigures(ctx: RegistryContext): Draft[] {
  const { deal, valuation: v, params } = ctx;
  const p = deal.property;
  const valuationYear = Number.parseInt(deal.valuationDate.slice(0, 4), 10);
  const known = Number.isFinite(valuationYear);
  const modelLife =
    p.builtYear !== null && known
      ? remainingLife(p.builtYear, valuationYear, p.modernisationPoints, ANNEX3.totalLifeYears)
      : null;
  const modelInputs = [
    p.builtYear === null ? "year of construction unknown" : `built ${p.builtYear}`,
    ...(known ? [`valuation year ${valuationYear}`] : []),
    count(p.modernisationPoints, "modernisation point"),
  ].join(", ");
  const maintenance = eur(ANNEX3.maintenancePerM2, { decimals: 2 });
  const rule = (id: FigureId, label: string, display: string, sourceDetail: string): Draft => ({
    id,
    label,
    display,
    sourceType: "regulation",
    sourceDetail,
    quote: null,
    confidence: null,
    flagId: null,
  });

  return [
    rule(
      "managementCost",
      "Management cost",
      `${eur(ANNEX3.managementPerUnit)} per unit`,
      `ImmoWertV Annex 3 model value (indexed, sample): ${eur(ANNEX3.managementPerUnit)} × ${count(deal.units.length, "unit")} = ${eur(v.management)} a year`,
    ),
    rule(
      "maintenanceCost",
      "Maintenance cost",
      `${maintenance} per m²`,
      `ImmoWertV Annex 3 model value (indexed, sample): ${maintenance} × ${m2(v.livingAreaM2)} m² = ${eur(v.maintenance)} a year`,
    ),
    rule(
      "rentLossRisk",
      "Rent-loss risk",
      pct(ANNEX3.rentLossRate),
      `ImmoWertV Annex 3 model value (sample): ${pct(ANNEX3.rentLossRate)} of gross income = ${eur(v.rentLoss)} a year`,
    ),
    rule(
      "totalLife",
      "Total economic life",
      years(ANNEX3.totalLifeYears),
      "ImmoWertV Annex 1 model value for multi-family houses",
    ),
    {
      ...rule(
        "remainingLife",
        "Remaining economic life",
        years(params.remainingLifeYears),
        `ImmoWertV Annex 2 model (simplified): ${modelInputs}`,
      ),
      valuerDetail:
        modelLife === null
          ? "Set by the valuer"
          : `Set by the valuer; the ImmoWertV Annex 2 model gives ${years(modelLife)}`,
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// AI estimates

function aiEstimateFigures(ctx: RegistryContext): Draft[] {
  const { deal, valuation: v, params, rent, capRate } = ctx;
  const estimate = (draft: Omit<Draft, "sourceType" | "quote">): Draft => ({
    ...draft,
    sourceType: "ai_estimate",
    quote: null,
  });

  // Market rent: the building average of the rents in use (the estimator's, or the valuer's factor and overrides).
  const marketRentFlag = flagOfKind(ctx, "market_rent");
  const average = v.livingAreaM2 > 0 ? v.grossIncome / 12 / v.livingAreaM2 : null;
  const plausible = rentRange(rent.range);

  // Cap rate: the AI always proposes the committee's median.
  const capRateFlag = flagOfKind(ctx, "cap_rate");
  const { row } = capRate;
  const committee = `the market report's ${pctRange(row.range)} range for ${row.label.toLowerCase()}`;
  const atMedian = Math.abs(params.capRate - row.median) < 1e-9;

  // Under-rent: how long the let units' gap to market rent lasts.
  const underRentFlag = flagOfKind(ctx, "under_rent");
  const gapPerYear = v.underRentPerYear;
  const gap = Math.abs(gapPerYear) < 0.5 ? null : gapPerYear > 0 ? "under" : "over";
  const duration = years(params.underRentYears);

  // Easements: one deduction for all section II entries. Without a land register they are unknown.
  const { easements } = deal.property;
  const landRegisterRead = deal.property.plotSource !== null || easements.length > 0;
  const easementFlag =
    flagOfKind(ctx, "easement") ?? (landRegisterRead ? undefined : flagById(ctx, "missing_document-land_register"));
  const entries = easements.length === 1 ? "the easement" : `the ${easements.length} easements`;
  const deduction = params.easementDeduction;
  const deducted = Math.abs(deduction) < 0.5 ? null : deduction > 0 ? `${eur(deduction)} deducted` : `${eur(-deduction)} added`;

  return [
    estimate({
      id: "marketRent",
      label: "Market rent (avg.)",
      display: average === null ? DASH : rentM2(average),
      sourceDetail: `Rent estimator on ${count(rent.recentCount + rent.olderCount, "comparable listing")}: location base ${rentM2(rent.base)}, adjusted per unit for floor, size and features; plausible range ${plausible}`,
      confidence: average === null ? null : (marketRentFlag?.confidence ?? "high"),
      flagId: marketRentFlag?.id ?? null,
      valuerDetail: `Set by the valuer; the rent estimator gives ${rentM2(rent.average)} (plausible range ${plausible})`,
    }),
    estimate({
      id: "capRate",
      label: "Cap rate",
      display: pct(params.capRate),
      sourceDetail: atMedian
        ? `Median of ${committee} (n = ${row.n})`
        : `Differs from the median of ${pct(row.median)} of ${committee} (n = ${row.n})`,
      confidence: capRateFlag?.confidence ?? "high",
      flagId: capRateFlag?.id ?? null,
      valuerDetail: `Set by the valuer; the AI proposed ${pct(row.median)}, the median of ${committee}`,
    }),
    estimate({
      id: "underRentYears",
      label: "Under-rent closing",
      display: duration,
      sourceDetail:
        gap === "under"
          ? `AI assumption: the under-rent of ${eur(gapPerYear)} a year closes within ${duration}, as rent increases in sitting tenancies are capped (§ 558 BGB)`
          : gap === "over"
            ? `AI assumption: the over-rent of ${eur(-gapPerYear)} a year lasts ${duration}, until the tenants move out`
            : `AI assumption: ${duration}; there is no gap between in-place and market rent`,
      confidence: underRentFlag?.confidence ?? "high",
      flagId: underRentFlag?.id ?? null,
      valuerDetail: `Set by the valuer${gap === null ? "" : `; the ${gap}-rent is ${eur(Math.abs(gapPerYear))} a year`}`,
    }),
    estimate({
      id: "easementImpact",
      label: "Easement impact",
      display: deducted === null ? "±€0" : eur(-deduction, { sign: true }),
      sourceDetail: !landRegisterRead
        ? deducted === null
          ? "AI assumption: value-neutral; without a land register, no easements are known"
          : `AI assumption: ${deducted} without a land register`
        : easements.length === 0
          ? deducted === null
            ? "No easements in section II of the land register"
            : `AI assumption: ${deducted}`
          : deducted === null
            ? `AI assumption: ${entries} in section II ${easements.length === 1 ? "is" : "are"} value-neutral`
            : `AI assumption: ${deducted} for ${entries} in section II`,
      confidence: easementFlag?.confidence ?? "high",
      flagId: easementFlag?.id ?? null,
      valuerDetail: easements.length === 0 ? "Set by the valuer" : `Set by the valuer for ${entries} in section II`,
    }),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Calculated (spec §5.3.5)

function calculatedFigures(ctx: RegistryContext): Draft[] {
  const { deal, valuation: v, params, land } = ctx;
  const calc = (id: FigureId, label: string, display: string, sourceDetail: string): Draft => ({
    id,
    label,
    display,
    sourceType: "calculated",
    sourceDetail,
    quote: null,
    confidence: null,
    flagId: null,
  });
  const average = v.livingAreaM2 > 0 ? v.grossIncome / 12 / v.livingAreaM2 : null;
  const anyVacant = v.units.some((u) => u.inPlaceRentPerMonth === null);
  const plot = deal.property.plotM2;
  const gapPerYear = v.underRentPerYear;
  const annuity = `annuity factor ${factor(v.underRentAnnuityFactor)} (${years(params.underRentYears)} at ${pct(params.capRate)})`;

  return [
    calc(
      "grossIncome",
      "Gross income",
      eur(v.grossIncome),
      average === null
        ? "No units, so no rent"
        : `${grossIncomeFormula(v.grossIncome, average, v.livingAreaM2)}${anyVacant ? "; vacant units count at market rent" : ""}`,
    ),
    calc(
      "operatingCosts",
      "Operating costs",
      eur(v.operatingCosts),
      `Management ${eur(v.management)} + maintenance ${eur(v.maintenance)} + rent-loss risk ${eur(v.rentLoss)} (${pct(v.operatingCostRatio)} of gross income)`,
    ),
    calc(
      "netIncome",
      "Net income",
      eur(v.netIncome),
      `Gross income ${eur(v.grossIncome)} − operating costs ${eur(v.operatingCosts)}`,
    ),
    calc(
      "landValue",
      "Land value",
      eur(v.landValue),
      plot === null ? "No plot area, so no land value" : `Plot area ${m2(plot)} m² × ${landRate(land.valuePerM2)}`,
    ),
    calc(
      "landInterest",
      "Land-value interest",
      eur(v.landInterest),
      `Land value ${eur(v.landValue)} × cap rate ${pct(params.capRate)}`,
    ),
    calc(
      "buildingNetIncome",
      "Building net income",
      eur(v.buildingNetIncome),
      `Net income ${eur(v.netIncome)} − land-value interest ${eur(v.landInterest)}`,
    ),
    calc(
      "pvFactor",
      "Present-value factor",
      factor(v.pvFactor),
      `Annuity factor for ${years(params.remainingLifeYears)} at ${pct(params.capRate)}`,
    ),
    calc(
      "buildingValue",
      "Building value",
      eur(v.buildingValue),
      `Building net income ${eur(v.buildingNetIncome)} × present-value factor ${factor(v.pvFactor)}`,
    ),
    calc(
      "underRentDeduction",
      "Under-rent deduction",
      // A deduction shows as negative; an over-rent adds to the value.
      eur(-v.underRentDeduction, { sign: true }),
      Math.abs(gapPerYear) < 0.5
        ? "No gap between in-place and market rent"
        : gapPerYear > 0
          ? `Under-rent of ${eur(gapPerYear)} a year × ${annuity}`
          : `Over-rent of ${eur(-gapPerYear)} a year × ${annuity}, added to the value`,
    ),
    calc("marketValue", "Market value", eur(v.marketValue), marketValueDetail(ctx)),
  ];
}

/** "Building value €1,071,923 + land value €249,600 − under-rent deduction €21,087 = €1,300,437, rounded to …". */
function marketValueDetail({ valuation: v }: RegistryContext): string {
  const terms = [`Building value ${eur(v.buildingValue)}`, `+ land value ${eur(v.landValue)}`];
  const adjust = (amount: number, deducted: string, added: string): void => {
    if (amount >= 0.5) terms.push(`− ${deducted} ${eur(amount)}`);
    else if (amount <= -0.5) terms.push(`+ ${added} ${eur(-amount)}`);
  };
  adjust(v.underRentDeduction, "under-rent deduction", "over-rent");
  adjust(v.easementDeduction, "easement deduction", "easement");
  adjust(v.vacancyDeduction, "vacancy deduction", "vacancy");
  return `${terms.join(" ")} = ${eur(v.marketValueExact)}, rounded to the nearest €10,000`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Flags and documents

function flagById(ctx: RegistryContext, id: string): Flag | undefined {
  return ctx.flags.find((f) => f.id === id);
}

function flagOfKind(ctx: RegistryContext, kind: FlagKind): Flag | undefined {
  return ctx.flags.find((f) => f.kind === kind);
}

/** The first extraction flag on a field of this document whose path matches (`extraction-<docId>-<path>`). */
function extractionFlag(ctx: RegistryContext, documentId: string | null, path: RegExp): Flag | undefined {
  if (documentId === null) return undefined;
  const prefix = `extraction-${documentId}-`;
  return ctx.flags.find(
    (f) => f.kind === "extraction" && f.id.startsWith(prefix) && path.test(f.id.slice(prefix.length)),
  );
}

/** The first call on one of these units added by hand. */
function manualUnitFlag(ctx: RegistryContext, units: Unit[]): Flag | undefined {
  const ids = new Set(units.map((u) => `manual_unit-${u.id}`));
  return ctx.flags.find((f) => ids.has(f.id));
}

/** A document of this type that was read, i.e. did not fail. */
function readDocumentId(deal: Deal, type: DocumentType): string | null {
  return deal.documents.find((d) => d.type === type && d.status !== "failed")?.id ?? null;
}

/** "Land register (Grundbuch)", or the label of the type the document was classified as (e.g. a Wohnungsgrundbuch). */
function documentLabel(deal: Deal, documentId: string | null, fallback: DocumentType): string {
  const doc = documentId === null ? undefined : deal.documents.find((d) => d.id === documentId);
  return DOCUMENT_TYPE_LABEL[doc && doc.type !== "unknown" ? doc.type : fallback];
}

/** "Tenant list (Mieterliste), p. 2", "…, pp. 2–3": the document and the pages of its citations. */
function where(label: string, quotes: Quote[]): string {
  const pages = Array.from(new Set(quotes.map((q) => q.page))).sort((a, b) => a - b);
  if (pages.length === 0) return label;
  if (pages.length === 1) return `${label}, p. ${pages[0]}`;
  const contiguous = pages.every((page, i) => i === 0 || page === pages[i - 1] + 1);
  return `${label}, pp. ${contiguous ? `${pages[0]}–${pages[pages.length - 1]}` : pages.join(", ")}`;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** The lowest confidence of the citations; high without any (a low-confidence reading raises an extraction flag). */
function lowest(quotes: Quote[]): Confidence {
  return quotes.reduce<Confidence>(
    (min, q) => (CONFIDENCE_RANK[q.confidence] < CONFIDENCE_RANK[min] ? q.confidence : min),
    "high",
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Text helpers

const DASH = "—";

const ELEMENT_NAME: Record<MeasureCategory, string> = {
  roof: "roof",
  windows: "windows",
  pipes: "pipes",
  heating: "heating",
  exterior_walls: "exterior walls",
  bathrooms: "bathrooms",
  interior: "interior",
  floor_plan: "floor plan",
};

/** "roof 4, windows 2, …": points per modernisation element, each capped at its Annex 2 maximum. */
function pointsByElement(measures: RefurbMeasure[]): string {
  const byElement = new Map<MeasureCategory, number>();
  for (const m of measures) byElement.set(m.category, (byElement.get(m.category) ?? 0) + m.points);
  return Array.from(
    byElement,
    ([category, points]) => `${ELEMENT_NAME[category]} ${Math.min(points, ANNEX2_MAX_POINTS[category])}`,
  ).join(", ");
}

/** "2014–2019", or "2016" for a single year. */
function yearSpan(measures: RefurbMeasure[]): string {
  const yrs = measures.map((m) => m.year);
  const from = Math.min(...yrs);
  const to = Math.max(...yrs);
  return from === to ? String(from) : `${from}–${to}`;
}

/** "; the land charge in section III is financing and not value-relevant". */
function landChargesNote(charges: number): string {
  if (charges <= 0) return "";
  return charges === 1
    ? "; the land charge in section III is financing and not value-relevant"
    : `; the ${charges} land charges in section III are financing and not value-relevant`;
}

function edited(u: Unit, field: EditableUnitField): boolean {
  return u.clientEdited.includes(field);
}

/** "GF left, Unit m1": unit labels, or "Unit <id>" for a unit without one. */
function names(units: Unit[]): string {
  return units.map((u) => u.label.trim() || `Unit ${u.id}`).join(", ");
}

/** "1 unit", "8 units". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function years(n: number): string {
  return count(n, "year");
}

/**
 * How the gross income follows: the average market rent × area × 12 where that product gives the stated amount, else
 * the monthly sum, so the line can be recomputed once one unit's rent differs ("9.53 €/m² × 565 m² × 12" would miss).
 */
function grossIncomeFormula(grossIncome: number, average: number, area: number): string {
  const monthly = grossIncome / 12;
  if (Math.abs(round2(average) * area * 12 - grossIncome) < 0.005) {
    return `Market rent ${rentM2(average)} × ${m2(area)} m² × 12 months`;
  }
  return `Market rent ${eur(monthly, { decimals: 2 })} a month (avg. ${rentM2(average)} over ${m2(area)} m²) × 12 months`;
}

/** `565` or `565.5`: areas to one decimal, without a trailing `.0`. */
function m2(area: number): string {
  const tenth = Math.round(area * 10) / 10;
  return num(tenth, Number.isInteger(tenth) ? 0 : 1);
}

/** `520 €/m²`. */
function landRate(valuePerM2: number): string {
  return `${num(valuePerM2, Number.isInteger(valuePerM2) ? 0 : 2)} €/m²`;
}

/** `2.5–3.5 %` for [0.025, 0.035]. */
function pctRange([low, high]: [number, number]): string {
  return `${(low * 100).toFixed(1)}–${pct(high)}`;
}

/** `9.10–10.20 €/m²`. */
function rentRange([low, high]: [number, number]): string {
  return `${round2(low).toFixed(2)}–${rentM2(high)}`;
}

/** Annuity and present-value factors to 4 decimals, as in spec §5.3.5: `23.7014`. */
function factor(x: number): string {
  return num(x, 4);
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `01 Jan 2026` for "2026-01-01". */
function dayMonthYear(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = match ? MONTH[Number(match[2]) - 1] : undefined;
  return match && month ? `${match[3]} ${month} ${match[1]}` : iso;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
