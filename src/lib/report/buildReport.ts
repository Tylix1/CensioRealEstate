/**
 * The valuation report (spec §5.6) as plain data: sections 1–9 for the PDF (`ReportDocument`) and the C5 page, built
 * from a stored deal. Pure: no clock, no randomness, no storage. Every figure comes from the pipeline of the deal's
 * current version, every source text from the figure registry, and every status from the review the store keeps.
 *
 * 1. Cover: address, client, valuation date, market value, version.
 * 2. Summary in plain English.
 * 3. Property and documents, including the documents that changed nothing (the B-Plan).
 * 4. Units table.
 * 5. Calculation: the steps of spec §5.3.5.
 * 6. Assumptions and AI judgement calls, each with its status: accepted, changed by valuer (with the note), or accepted
 *    at sign-off without opening.
 * 7. Sources: document, page and quote; then every other figure's source.
 * 8. Review log: every version, undone ones included, and the sign-off.
 * 9. Disclaimer.
 *
 * A deal the valuer has not signed yet gives a draft (the valuer's preview): not signed, open calls, no email.
 */
import { DOCUMENT_TYPE_LABEL, type Confidence, type Deal, type FloorCode, type Feature, type Quote } from "@/lib/deal/types";
import type { Flag, FlagKind } from "@/lib/flags/rules";
import { REQUIRED_DOCS } from "@/lib/flags/rules";
import { eur, kEur, num, pct, rentM2 } from "@/lib/format";
import { ANNEX3 } from "@/lib/lookups/costs";
import { flagsChangedByValuer, runCurrentVersion, runVersion, type PipelineOutput } from "@/lib/pipeline/run";
import type { Figure, SourceType } from "@/lib/registry/registry";
import { currentVersion, type History, type ParamChange, type ParamKey, type Version } from "@/lib/revisions/history";
import type { StoredDeal } from "@/lib/store/demoStore";

/** Section 9, word for word (plan Task 18). */
export const REPORT_DISCLAIMER = "Prototype with sample data — not a valuation report.";

/** The address the report is sent from (plan Task 18). */
export const REPORT_SENDER = "reports@censio.example";

/** The signing valuer (plan "Sample world"). */
const SIGNER = "K. Vogel";
const SIGNER_INITIALS = "KV";

/** Section titles 2–9, in order; the cover is section 1. */
export const REPORT_SECTIONS = [
  "Summary",
  "Property and documents",
  "Units",
  "Calculation",
  "Assumptions and AI judgement calls",
  "Sources",
  "Review log",
  "Disclaimer",
] as const;

// ---------------------------------------------------------------------------------------------------------------------
// The model

export type CallStatus =
  | "changed by valuer"
  | "accepted"
  | "accepted at sign-off without opening"
  | "accepted at sign-off"
  | "open";

export interface LabelValue {
  label: string;
  value: string;
}

export interface ReportCover {
  title: string;
  subtitle: string;
  address: string;
  client: string;
  dealId: string;
  valuationDate: string;
  valueText: string;
  /** "2,142 €/m² · gross multiplier 18.6×" */
  valueDetail: string;
  /** "v2 · revised by the senior valuer" */
  versionLabel: string;
  /** "Signed by K. Vogel, senior valuer, on 06 Nov 2026, 10:20 UTC", or "Draft — not signed". */
  signature: string;
  basis: string;
  scope: string;
  /** "Multi-family house", "whole building", "8 units", … */
  facts: string[];
  /** The building's photo, if the client sent one; the page resolves the file. */
  photo: { id: string; fileName: string } | null;
}

export interface ReportDocumentRow {
  id: string;
  /** "Zoning plan (B-Plan)", or the file name of an unclassified document. */
  title: string;
  fileName: string;
  pages: number;
  /** What the AI read, e.g. "Plot 480 m², 1 easement; land charge ignored". */
  read: string;
  /** What the document did to the value, e.g. "no value effect". */
  effect: string;
}

export interface ReportCitation {
  /** The figure or fact the quote backs, e.g. "Plot area". */
  what: string;
  page: number;
  /** Verbatim, in the document's language. */
  quote: string;
  /** An English gloss, where the deal holds one. */
  translation: string | null;
  /** The quote was found on that page of the PDF's text layer. */
  verified: boolean;
}

export interface ReportSourceDocument extends ReportDocumentRow {
  citations: ReportCitation[];
}

export interface ReportSourceRow {
  label: string;
  value: string;
  sourceType: SourceType;
  /** "Public data", "ImmoWertV rule", "AI estimate", "Changed by valuer", … */
  source: string;
  detail: string;
}

export interface ReportUnitRow {
  n: number;
  name: string;
  floor: string;
  area: string;
  rooms: string;
  /** "8.40", or "vacant" */
  inPlacePerM2: string;
  inPlacePerMonth: string;
  marketPerM2: string;
  marketPerMonth: string;
  gap: string;
  leaseSince: string;
  valueText: string;
  /** Features and changes, e.g. "Courtyard side", "Added by hand", "Market rent set by the valuer". */
  notes: string[];
  /** The market rent is the valuer's, not the AI's estimate. */
  valuerRent: boolean;
}

export interface ReportUnitTotal {
  area: string;
  inPlacePerM2: string;
  inPlacePerMonth: string;
  marketPerM2: string;
  marketPerMonth: string;
  gap: string;
  valueText: string;
}

export interface ReportCalcRow {
  key: string;
  label: string;
  /** The German term, e.g. "Rohertrag (RoE)". */
  term: string | null;
  /** How the amount follows, with the numbers. */
  formula: string;
  amount: string;
  sourceType: SourceType;
  source: string;
  emphasis: "subtotal" | "total" | null;
}

export interface ReportCall {
  id: string;
  /** 1-based, in the order of the review screen. */
  n: number;
  title: string;
  confidence: Confidence;
  summary: string;
  whyFlagged: string;
  /** What would change the AI's mind; null where the rules name nothing. */
  changeMind: string | null;
  support: string | null;
  /** The value effect over the plausible range, e.g. "−€111k at 3.5 % to +€128k at 2.5 %". */
  effect: string | null;
  status: CallStatus;
  /** "K. Vogel changed it from 3.0 % to 3.4 % in v2" */
  statusDetail: string;
  /** The valuer's notes that changed it (active revisions only). */
  notes: string[];
  /** For a call the valuer changed: the figure, the AI's value and the valuer's. */
  change: { what: string; from: string; to: string } | null;
}

export interface ReviewLogRow {
  n: number;
  /** "v1 · AI draft", "v2 · KV · note: “…”", with " (undone)" for an undone version. */
  label: string;
  who: string;
  /** "06 Nov 2026, 10:15 UTC" */
  at: string;
  valueText: string;
  /** The parameters the note changed, e.g. "Cap rate from 3.0 % to 3.4 %". */
  changes: string[];
  /** What the AI explained, or what the AI draft rests on. */
  detail: string | null;
  /** Who read the note, e.g. "Read by Live AI in 7.0 s"; null for the AI draft. */
  readBy: string | null;
  undone: boolean;
  /** The version the report shows. */
  current: boolean;
}

export interface ReportSignOff {
  signer: string;
  role: string;
  at: string;
  version: number;
  /** Titles of the calls accepted at sign-off without opening. */
  acceptedWithoutOpening: string[];
}

export interface ReportEmail {
  from: string;
  to: string;
  date: string;
  subject: string;
  greeting: string;
  body: string[];
  closing: string[];
  attachment: string;
}

export interface ReportModel {
  dealId: string;
  /** The version the report shows: the current one. */
  version: number;
  /** Not signed yet: the valuer's preview. */
  draft: boolean;
  /** `Censio_Report_{dealId}_v{n}.pdf`; a draft adds `_draft`. */
  fileName: string;
  /** The market value, rounded to €10,000. */
  value: number;
  valueText: string;
  cover: ReportCover;
  summary: string[];
  property: { facts: LabelValue[]; documents: ReportDocumentRow[]; missing: string[] };
  units: { rows: ReportUnitRow[]; total: ReportUnitTotal; note: string };
  calculation: ReportCalcRow[];
  assumptions: string[];
  calls: ReportCall[];
  sources: { documents: ReportSourceDocument[]; data: ReportSourceRow[] };
  reviewLog: ReviewLogRow[];
  signOff: ReportSignOff | null;
  email: ReportEmail | null;
  disclaimer: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Words and formats

/** The words of each source type, as the app's source badges say them. */
const SOURCE_WORDS: Record<SourceType, string> = {
  client_document: "Client document",
  public_data: "Public data",
  regulation: "ImmoWertV rule",
  calculated: "Calculated",
  ai_estimate: "AI estimate",
  client_input: "Changed by client",
  valuer: "Changed by valuer",
};

const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "06 Nov 2026" from an ISO date or date-time (its calendar date as written). */
function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${m[3]} ${month} ${m[1]}` : iso;
}

/** "06 Nov 2026, 10:15 UTC" from a UTC date-time such as `new Date().toISOString()` gives. */
function dateTimeLabel(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z$/.exec(iso);
  return m ? `${dateLabel(m[1])}, ${m[2]}:${m[3]} UTC` : dateLabel(iso);
}

/** "565" or "565.5". */
function areaLabel(m2: number): string {
  return Number.isInteger(m2) ? num(m2) : num(m2, 1);
}

/** "−9.2 %", "+3.0 %", "0.0 %" for a fraction. */
function signedPct(fraction: number): string {
  const value = Math.abs(fraction * 100).toFixed(1);
  if (value === "0.0") return "0.0 %";
  return `${fraction < 0 ? MINUS : "+"}${value} %`;
}

/** "9.60": €/m² without the unit, rounded half-up to cents. */
function rentNumber(n: number): string {
  return (Math.round(n * 100 + 1e-7) / 100).toFixed(2);
}

/** "3.4 %", "3.25 %": one decimal unless the value needs two. */
function percentText(fraction: number): string {
  const tenths = fraction * 1000;
  return pct(fraction, Math.abs(tenths - Math.round(tenths)) < 1e-6 ? 1 : 2);
}

/** "1 year", "8 years", "1.5 years". */
function yearsText(years: number): string {
  const v = Math.round(years * 100) / 100;
  return `${v} ${v === 1 ? "year" : "years"}`;
}

/** "1 unit", "8 units". */
function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${num(n)} ${n === 1 ? noun : plural}`;
}

/** "cap rate" from "Cap rate". */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "a, b and c". */
function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const FLOOR_SHORT: Record<FloorCode, string> = {
  GF: "Ground",
  "1F": "1st",
  "2F": "2nd",
  "3F": "3rd",
  "4F": "4th",
  attic: "Attic",
};

const FEATURE_NAMES: Record<Feature, string> = {
  balcony: "Balcony",
  roof_terrace: "Roof terrace",
  renovated_bath: "Bathroom renovated",
  street: "Street side",
  courtyard: "Courtyard side",
};

function unitName(unit: { id: string; label: string }): string {
  return unit.label.trim() || `Unit ${unit.id}`;
}

function propertyKind(deal: Deal): string {
  if (deal.usageType === "hotel") return "Hotel";
  if (deal.usageType === "commercial") return "Commercial";
  return deal.scope === "building" ? "Multi-family house" : "Apartment";
}

function addressLine(deal: Deal): string {
  return `${deal.address.street}, ${deal.address.zip} ${deal.address.city}`;
}

/** "2014–2019", "2016", or null. */
function yearSpan(years: number[]): string | null {
  if (years.length === 0) return null;
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first}–${last}`;
}

function figureById(out: PipelineOutput, id: string): Figure | undefined {
  return out.registry.find((f) => f.id === id);
}

/** The value of a revised parameter as the notes write it: "3.4 %", "9.50 €/m²", "8 years", "€12,000". */
function paramValue(parameter: ParamKey, value: number): string {
  switch (parameter) {
    case "capRate":
      return percentText(value);
    case "marketRentAvg":
    case "marketRentUnit":
      return rentM2(value);
    case "underRentYears":
    case "remainingLifeYears":
      return yearsText(value);
    case "easementDeduction":
      return eur(value);
  }
}

/** "Cap rate from 3.0 % to 3.4 %", "Market rent of Attic from 9.92 €/m² to 9.50 €/m²". */
function changeText(change: ParamChange, deal: Deal): string {
  const unit = change.unitId ? deal.units.find((u) => u.id === change.unitId) : undefined;
  const what: Record<ParamKey, string> = {
    capRate: "Cap rate",
    marketRentAvg: "Average market rent",
    marketRentUnit: `Market rent of ${unit ? unitName(unit) : `unit ${change.unitId ?? "?"}`}`,
    underRentYears: "Under-rent closing period",
    easementDeduction: "Easement deduction",
    remainingLifeYears: "Remaining economic life",
  };
  return `${what[change.parameter]} from ${paramValue(change.parameter, change.from)} to ${paramValue(change.parameter, change.to)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Review state

/** The calls a revisable parameter settles (as the pipeline's `flagsChangedByValuer`). */
const PARAM_FLAG_KINDS: Record<ParamKey, FlagKind[]> = {
  capRate: ["cap_rate"],
  marketRentAvg: ["market_rent"],
  marketRentUnit: ["market_rent"],
  underRentYears: ["under_rent"],
  easementDeduction: ["easement"],
  remainingLifeYears: [],
};

function changeTouches(change: ParamChange, flag: Flag): boolean {
  if (PARAM_FLAG_KINDS[change.parameter]?.includes(flag.kind)) return true;
  return change.parameter === "marketRentUnit" && change.unitId !== undefined && flag.id === `manual_unit-${change.unitId}`;
}

function activeRevisions(h: History): Version[] {
  return h.versions.filter((v) => v.n > 1 && !v.undone);
}

function callStatus(stored: StoredDeal, flag: Flag, changed: Set<string>): CallStatus {
  if (changed.has(flag.id)) return "changed by valuer";
  const { approval } = stored;
  if (approval?.acceptedAtSignOff.includes(flag.id)) return "accepted at sign-off without opening";
  if (stored.flagStatus[flag.id] === "accepted") return "accepted";
  // Signed with the call opened but not accepted: the signature accepts it.
  return approval ? "accepted at sign-off" : "open";
}

function buildCalls(stored: StoredDeal, out: PipelineOutput, draftOut: PipelineOutput): ReportCall[] {
  const h = stored.history;
  const changed = new Set(flagsChangedByValuer(out, h));
  const revisions = activeRevisions(h);
  return out.flags.map((flag, i): ReportCall => {
    const status = callStatus(stored, flag, changed);
    const by = revisions.filter((v) => v.changes.some((c) => changeTouches(c, flag)));
    const figure = out.registry.find((f) => f.flagId === flag.id);
    const aiFigure = draftOut.registry.find((f) => f.flagId === flag.id);
    const change =
      status === "changed by valuer" && figure && aiFigure && figure.display !== aiFigure.display
        ? { what: figure.label, from: aiFigure.display, to: figure.display }
        : null;
    const versions = listText(by.map((v) => `v${v.n}`));
    const statusDetail: Record<CallStatus, string> = {
      "changed by valuer": `${SIGNER} changed it${change ? ` from ${change.from} to ${change.to}` : ""}${versions ? ` in ${versions}` : ""}`,
      accepted: `Accepted by ${SIGNER}`,
      "accepted at sign-off without opening": `Accepted when ${SIGNER} signed, without opening it`,
      "accepted at sign-off": `Opened, and accepted when ${SIGNER} signed`,
      open: "Not reviewed yet",
    };
    const swing = flag.swing;
    return {
      id: flag.id,
      n: i + 1,
      title: flag.title,
      confidence: flag.confidence,
      summary: flag.summary,
      whyFlagged: flag.whyFlagged,
      changeMind: flag.changeMind.trim() === "" ? null : flag.changeMind,
      support: flag.support,
      effect: swing ? `${swingEnd(swing.low, swing.lowLabel)} to ${swingEnd(swing.high, swing.highLabel)}` : null,
      status,
      statusDetail: statusDetail[status],
      notes: status === "changed by valuer" ? by.flatMap((v) => (v.note ? [v.note] : [])) : [],
      change,
    };
  });
}

/** "−€111k at 3.5 %", "±€0 · value-neutral". */
function swingEnd(delta: number, input: string): string {
  const k = kEur(delta, true);
  return k === "±€0" ? `±€0 · ${input}` : `${k} at ${input}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Sections

function buildCover(stored: StoredDeal, out: PipelineOutput, draft: boolean, version: number): ReportCover {
  const { deal, valuation } = out;
  const { plotM2, builtYear, refurbishments } = deal.property;
  const modernised = yearSpan(refurbishments.map((m) => m.year));
  const built = builtYear === null ? "year of construction unknown" : `built ${builtYear}`;
  const photo = deal.photos.find((p) => p.unitId === null) ?? null;
  return {
    title: "Market value report",
    subtitle: "Income approach (Ertragswert, § 28 ImmoWertV)",
    address: addressLine(deal),
    client: `${deal.clientName} (${deal.clientSide})`,
    dealId: deal.id,
    valuationDate: dateLabel(deal.valuationDate),
    valueText: eur(valuation.marketValue),
    valueDetail: `${num(valuation.valuePerM2)} €/m² · gross multiplier ${valuation.grossMultiplier.toFixed(1)}×`,
    versionLabel:
      version === 1
        ? draft
          ? "v1 · AI draft"
          : "v1 · the AI's draft, signed without changes"
        : `v${version} · revised by the senior valuer`,
    signature:
      draft || !stored.approval
        ? "Draft — not signed"
        : `Signed by ${stored.approval.signer}, senior valuer, on ${dateTimeLabel(stored.approval.at)}`,
    basis: "Market value (§ 194 BauGB)",
    scope: "Desktop valuation, no internal inspection",
    facts: [
      propertyKind(deal),
      deal.scope === "building" ? "whole building" : "single unit",
      count(deal.units.length, "unit"),
      `${areaLabel(valuation.livingAreaM2)} m² living area`,
      plotM2 === null ? "plot area unknown" : `plot ${areaLabel(plotM2)} m²`,
      modernised ? `${built}, modernised ${modernised}` : built,
    ],
    photo: photo ? { id: photo.id, fileName: photo.fileName } : null,
  };
}

function buildSummary(
  out: PipelineOutput,
  draftOut: PipelineOutput,
  calls: ReportCall[],
  draft: boolean,
  version: number,
): string[] {
  const { deal, valuation: v, params, land } = out;
  const address = addressLine(deal);
  const date = dateLabel(deal.valuationDate);
  const value = eur(v.marketValue);

  const first = draft
    ? `The draft puts the market value of ${address} as of ${date} at ${value}.`
    : `The market value of ${address} as of ${date} is ${value}.`;
  const ratios =
    v.livingAreaM2 > 0
      ? ` That is ${num(v.valuePerM2)} €/m² of living area and ${v.grossMultiplier.toFixed(1)} times the annual market rent.`
      : "";

  const units = deal.units.length;
  const method: string[] = [
    `The value follows the income approach (Ertragswert, § 28 ImmoWertV). ${units === 1 ? "The unit's" : `The ${num(units)} units'`} market rent of ${eur(v.grossIncome)} a year, less operating costs of ${eur(v.operatingCosts)}, leaves a net income of ${eur(v.netIncome)}.`,
    `After interest on the land value at the cap rate of ${percentText(params.capRate)}, the building's income is capitalised over a remaining economic life of ${yearsText(params.remainingLifeYears)}, and the land value of ${eur(v.landValue)} (${areaLabel(deal.property.plotM2 ?? 0)} m² at ${num(land.valuePerM2)} €/m²) is added.`,
  ];
  if (v.underRentPerYear > 0.005) {
    method.push(
      `The tenants pay ${eur(v.underRentPerYear)} a year less than market rent. This gap is deducted until it closes, assumed within ${yearsText(params.underRentYears)} (${eur(v.underRentDeduction)}).`,
    );
  } else if (v.underRentPerYear < -0.005) {
    method.push(
      `The tenants pay ${eur(-v.underRentPerYear)} a year more than market rent; this premium is counted for ${yearsText(params.underRentYears)} (${eur(-v.underRentDeduction)}).`,
    );
  }
  const easements = deal.property.easements.length;
  if (v.easementDeduction > 0) {
    method.push(`The ${easements === 1 ? "easement" : "easements"} in the land register ${easements === 1 ? "is" : "are"} deducted at ${eur(v.easementDeduction)}.`);
  } else if (easements > 0) {
    method.push(`The ${easements === 1 ? "easement" : "easements"} in the land register ${easements === 1 ? "is" : "are"} taken as value-neutral.`);
  }
  if (v.vacancyDeduction > 0) {
    const vacant = deal.units.filter((u) => u.inPlaceRentPerM2 === null).length;
    method.push(
      `${count(vacant, "unit")} ${vacant === 1 ? "is" : "are"} vacant: ${ANNEX3.vacancyMonths} months of market rent (${eur(v.vacancyDeduction)}) are deducted for re-letting.`,
    );
  }

  const documents = deal.documents.filter((d) => d.status === "done").length;
  const review: string[] = [`The AI read ${count(documents, "document")} and flagged ${count(calls.length, "judgement call")}.`];
  const by = (status: CallStatus) => calls.filter((c) => c.status === status);
  if (draft) {
    const open = by("open").length;
    review.push(
      open === 0
        ? `${SIGNER}, senior valuer, has reviewed all of them but not signed yet.`
        : `${SIGNER}, senior valuer, still has ${open} of ${calls.length} to review before signing.`,
    );
  } else {
    const parts: string[] = [];
    const changed = by("changed by valuer");
    if (changed.length > 0) {
      const what = changed.map((c) =>
        c.change ? `the ${lowerFirst(c.change.what)} from ${c.change.from} to ${c.change.to}` : `“${c.title}”`,
      );
      parts.push(`changed ${listText(what)}`);
    }
    const accepted = by("accepted").length + by("accepted at sign-off").length;
    if (accepted > 0) parts.push(`accepted ${count(accepted, "call")} after checking ${accepted === 1 ? "it" : "them"}`);
    const unopened = by("accepted at sign-off without opening").length;
    if (unopened > 0) parts.push(`accepted ${count(unopened, "call")} at sign-off without opening ${unopened === 1 ? "it" : "them"}`);
    review.push(`${SIGNER}, senior valuer, ${listText([...parts, `signed version ${version}`])}.`);
  }
  const aiValue = draftOut.valuation.marketValue;
  if (version > 1 && aiValue !== v.marketValue && aiValue > 0) {
    const change = Math.abs((v.marketValue - aiValue) / aiValue);
    review.push(
      `${draft ? `This draft (v${version})` : `Version ${version}`} is ${pct(change)} ${v.marketValue < aiValue ? "below" : "above"} the AI's draft (v1) of ${eur(aiValue)}.`,
    );
  }

  return [first + ratios, method.join(" "), review.join(" ")];
}

/** What a read document did to the value. */
function documentEffect(out: PipelineOutput, type: Deal["documents"][number]["type"]): string {
  const p = out.deal.property;
  switch (type) {
    case "tenant_list":
      return "units, living area and in-place rent (under-rent deduction)";
    case "land_register":
    case "condo_land_register": {
      const easements = p.easements.length;
      const parts = ["plot area for the land value"];
      if (easements > 0) parts.push(`${count(easements, "easement")} assessed as a judgement call`);
      if (p.landChargesCount > 0) parts.push(`${p.landChargesCount === 1 ? "land charge" : "land charges"} not value-relevant (financing)`);
      return parts.join("; ");
    }
    case "energy_certificate":
      return "year of construction (cap rate row and remaining life); cross-checks of living area, heating year and address";
    case "refurbishment_sheet":
      return `${count(p.modernisationPoints, "modernisation point")}: remaining economic life ${yearsText(out.params.remainingLifeYears)}`;
    case "zoning_plan":
      return p.zoning && !p.zoning.residentialAllowed ? "residential use not permitted: see the cross-checks" : "no value effect";
    case "unknown":
      return "not used for the value";
  }
}

function documentRows(out: PipelineOutput): ReportDocumentRow[] {
  return out.deal.documents.map((doc) => {
    const read = doc.status === "done";
    return {
      id: doc.id,
      title: doc.type === "unknown" ? doc.fileName : DOCUMENT_TYPE_LABEL[doc.type],
      fileName: doc.fileName,
      pages: doc.pages,
      read: read
        ? doc.findings.join("; ") || "Read"
        : doc.status === "failed"
          ? `Not read${doc.error ? `: ${doc.error}` : ""}`
          : "Not read yet",
      effect: read ? documentEffect(out, doc.type) : "not used for the value",
    };
  });
}

function propertyFacts(out: PipelineOutput): LabelValue[] {
  const { deal, valuation, params } = out;
  const p = deal.property;
  const kindDe = deal.usageType === "living" && deal.scope === "building" ? " (Mehrfamilienhaus)" : "";
  const measures = yearSpan(p.refurbishments.map((m) => m.year));
  const energy = [
    p.energyClass ? `class ${p.energyClass}` : null,
    p.energyDemandKwh !== null ? `${num(p.energyDemandKwh)} kWh/(m²·a)` : null,
    p.energyCarrier ? `${p.energyCarrier.toLowerCase()} heating${p.heatingYear ? ` from ${p.heatingYear}` : ""}` : null,
  ].filter((s): s is string => s !== null);
  const register = [
    count(p.easements.length, "easement") + " in section II",
    `${count(p.landChargesCount, "land charge")} in section III${p.landChargesCount > 0 ? " (financing, not value-relevant)" : ""}`,
  ];
  return [
    { label: "Property", value: `${propertyKind(deal)}${kindDe}, ${deal.scope === "building" ? "whole building" : "single unit"}` },
    { label: "Address", value: addressLine(deal) },
    { label: "Parcel", value: p.parcel ?? "—" },
    { label: "Plot area", value: p.plotM2 === null ? "—" : `${areaLabel(p.plotM2)} m²` },
    { label: "Units and living area", value: `${count(deal.units.length, "unit")} · ${areaLabel(valuation.livingAreaM2)} m²` },
    {
      label: "Year of construction",
      value: p.builtYear === null ? "unknown (treated as built in 1948)" : String(p.builtYear),
    },
    {
      label: "Modernisation",
      value:
        p.refurbishments.length === 0
          ? "none documented"
          : `${count(p.refurbishments.length, "measure")}${measures ? ` ${measures}` : ""} · ${count(p.modernisationPoints, "point")} · remaining life ${yearsText(params.remainingLifeYears)}`,
    },
    { label: "Energy certificate", value: energy.length > 0 ? energy.join(" · ") : "—" },
    {
      label: "Zoning",
      value: p.zoning
        ? `${p.zoning.areaType}: residential use ${p.zoning.residentialAllowed ? "permitted" : "not permitted"}`
        : "—",
    },
    { label: "Land register", value: register.join(" · ") },
  ];
}

function missingDocuments(out: PipelineOutput): string[] {
  const read = new Set(out.deal.documents.filter((d) => d.status === "done").map((d) => d.type));
  const numbers = new Map(out.flags.map((f, i) => [f.id, i + 1]));
  return REQUIRED_DOCS.filter((type) => !read.has(type) && !(type === "land_register" && read.has("condo_land_register"))).map(
    (type) => {
      const n = numbers.get(`missing_document-${type}`);
      return `${DOCUMENT_TYPE_LABEL[type]}: missing${n ? ` (judgement call ${n})` : ""}`;
    },
  );
}

function buildUnits(out: PipelineOutput): ReportModel["units"] {
  const { deal, valuation, params } = out;
  const rows = deal.units.map((u, i): ReportUnitRow => {
    const share = valuation.units[i];
    const override = Object.prototype.hasOwnProperty.call(params.marketRentOverrides, u.id);
    const valuerRent = override || params.marketRentFactor !== 1;
    const notes = [
      ...u.features.map((f) => FEATURE_NAMES[f]),
      ...(u.origin === "manual" ? ["Added by hand"] : []),
      ...(u.clientEdited.length > 0 ? ["Changed by client"] : []),
      ...(valuerRent ? ["Market rent set by the valuer"] : []),
    ];
    return {
      n: i + 1,
      name: unitName(u),
      floor: FLOOR_SHORT[u.floor],
      area: areaLabel(u.areaM2),
      rooms: Number.isInteger(u.rooms) ? String(u.rooms) : u.rooms.toFixed(1),
      inPlacePerM2: u.inPlaceRentPerM2 === null ? "vacant" : rentNumber(u.inPlaceRentPerM2),
      inPlacePerMonth: share?.inPlaceRentPerMonth == null ? "—" : num(share.inPlaceRentPerMonth, 2),
      marketPerM2: share ? rentNumber(share.marketRentPerM2) : "—",
      marketPerMonth: share ? num(share.marketRentPerMonth, 2) : "—",
      gap: share?.gapPct == null ? "—" : signedPct(share.gapPct),
      leaseSince: u.leaseSinceYear === null ? "—" : String(u.leaseSinceYear),
      valueText: share ? eur(share.value) : "—",
      notes,
      valuerRent,
    };
  });

  let letArea = 0;
  let inPlace = 0;
  let letMarket = 0;
  deal.units.forEach((u, i) => {
    const share = valuation.units[i];
    if (u.inPlaceRentPerM2 === null || !share || share.inPlaceRentPerMonth === null) return;
    letArea += u.areaM2;
    inPlace += share.inPlaceRentPerMonth;
    letMarket += share.marketRentPerMonth;
  });
  const marketPerMonth = valuation.grossIncome / 12;
  return {
    rows,
    total: {
      area: areaLabel(valuation.livingAreaM2),
      inPlacePerM2: letArea > 0 ? rentNumber(inPlace / letArea) : "—",
      inPlacePerMonth: num(inPlace, 2),
      marketPerM2: valuation.livingAreaM2 > 0 ? rentNumber(marketPerMonth / valuation.livingAreaM2) : "—",
      marketPerMonth: num(marketPerMonth, 2),
      gap: letMarket > 0 ? signedPct((inPlace - letMarket) / letMarket) : "—",
      valueText: eur(valuation.marketValue),
    },
    note: "The building is valued as one asset (one plot, one cap rate); the unit values are a split, not separate valuations.",
  };
}

function buildCalculation(out: PipelineOutput): ReportCalcRow[] {
  const { valuation: v, deal } = out;
  const money = (n: number) => eur(n, { decimals: 2 });
  const row = (
    key: string,
    label: string,
    term: string | null,
    figureId: string | null,
    amount: string,
    fallback: { formula: string; sourceType: SourceType },
    emphasis: ReportCalcRow["emphasis"] = null,
  ): ReportCalcRow => {
    const figure = figureId ? figureById(out, figureId) : undefined;
    const sourceType = figure?.sourceType ?? fallback.sourceType;
    return {
      key,
      label,
      term,
      formula: figure?.sourceDetail ?? fallback.formula,
      amount,
      sourceType,
      source: SOURCE_WORDS[sourceType],
      emphasis,
    };
  };
  const landPerM2 = figureById(out, "landValuePerM2");
  const vacant = deal.units.filter((u) => u.inPlaceRentPerM2 === null).length;
  const overRent = v.underRentPerYear < 0;
  const rows: ReportCalcRow[] = [
    row("grossIncome", "Gross market income", "Rohertrag (RoE)", "grossIncome", money(v.grossIncome), {
      formula: "Σ unit market rent × 12",
      sourceType: "calculated",
    }),
    row("management", "Management", null, "managementCost", money(v.management), {
      formula: `${count(deal.units.length, "unit")} × ${eur(ANNEX3.managementPerUnit)}`,
      sourceType: "regulation",
    }),
    row("maintenance", "Maintenance", null, "maintenanceCost", money(v.maintenance), {
      formula: `m² × ${eur(ANNEX3.maintenancePerM2, { decimals: 2 })}`,
      sourceType: "regulation",
    }),
    row("rentLoss", "Rent-loss risk", null, "rentLossRisk", money(v.rentLoss), {
      formula: `${pct(ANNEX3.rentLossRate)} of gross income`,
      sourceType: "regulation",
    }),
    row(
      "operatingCosts",
      "Operating costs",
      "Bewirtschaftungskosten (BWK)",
      "operatingCosts",
      money(v.operatingCosts),
      { formula: "Management + maintenance + rent-loss risk", sourceType: "calculated" },
      "subtotal",
    ),
    row(
      "netIncome",
      "Net income",
      "Reinertrag (RE)",
      "netIncome",
      money(v.netIncome),
      { formula: "Gross income − operating costs", sourceType: "calculated" },
      "subtotal",
    ),
    {
      ...row("landValue", "Land value", "Bodenwert (BW)", "landValue", money(v.landValue), {
        formula: "Plot area × standard land value",
        sourceType: "calculated",
      }),
      ...(landPerM2
        ? { formula: `${figureById(out, "landValue")?.sourceDetail ?? "Plot area × land value"} (${landPerM2.sourceDetail})` }
        : {}),
    },
    row("capRate", "Cap rate", "Liegenschaftszins (LZ)", "capRate", percentText(out.params.capRate), {
      formula: "Median of the market report's range",
      sourceType: "ai_estimate",
    }),
    row("landInterest", "Land-value interest", null, "landInterest", money(v.landInterest), {
      formula: "Land value × cap rate",
      sourceType: "calculated",
    }),
    row(
      "buildingNetIncome",
      "Building net income",
      null,
      "buildingNetIncome",
      money(v.buildingNetIncome),
      { formula: "Net income − land-value interest", sourceType: "calculated" },
      "subtotal",
    ),
    row("remainingLife", "Remaining economic life", "Restnutzungsdauer (RND)", "remainingLife", yearsText(out.params.remainingLifeYears), {
      formula: `Total life ${ANNEX3.totalLifeYears} years, less the building's age, extended by modernisation`,
      sourceType: "regulation",
    }),
    {
      ...row("pvFactor", "Present-value factor", "Barwertfaktor (BWF)", "pvFactor", v.pvFactor.toFixed(4), {
        formula: "(1 − (1 + LZ)^−RND) / LZ",
        sourceType: "calculated",
      }),
      formula: `(1 − (1 + LZ)^−RND) / LZ: ${figureById(out, "pvFactor")?.sourceDetail.toLowerCase() ?? "annuity factor"}`,
    },
    row("buildingValue", "Building income value", "Gebäudeertragswert", "buildingValue", money(v.buildingValue), {
      formula: "Building net income × present-value factor",
      sourceType: "calculated",
    }),
    row(
      "preliminaryValue",
      "Preliminary income value",
      "vorläufiger Ertragswert",
      null,
      money(v.preliminaryValue),
      { formula: `Building income value ${eur(v.buildingValue)} + land value ${eur(v.landValue)}`, sourceType: "calculated" },
      "subtotal",
    ),
    row(
      "underRentDeduction",
      overRent ? "Over-rent premium" : "Under-rent deduction",
      "boG",
      "underRentDeduction",
      eur(-v.underRentDeduction, { decimals: 2 }),
      { formula: "(Market rent − in-place rent) × annuity factor", sourceType: "calculated" },
    ),
    row("easementDeduction", "Easement deduction", "boG", "easementImpact", eur(-v.easementDeduction, { decimals: 2 }), {
      formula: "No easement in the land register",
      sourceType: "calculated",
    }),
    row("vacancyDeduction", "Vacancy deduction", "boG", null, eur(-v.vacancyDeduction, { decimals: 2 }), {
      formula:
        vacant === 0
          ? `${ANNEX3.vacancyMonths} months of market rent per vacant unit; no unit is vacant`
          : `${ANNEX3.vacancyMonths} months of market rent for ${count(vacant, "vacant unit")}`,
      sourceType: "calculated",
    }),
    row(
      "marketValue",
      "Market value",
      "Marktwert",
      "marketValue",
      eur(v.marketValue),
      { formula: "Rounded to the nearest €10,000", sourceType: "calculated" },
      "total",
    ),
    row("ratios", "Value per m² · gross multiplier", null, null, `${num(v.valuePerM2)} €/m² · ${v.grossMultiplier.toFixed(1)}×`, {
      formula: `Market value ÷ ${areaLabel(v.livingAreaM2)} m² living area · market value ÷ gross income`,
      sourceType: "calculated",
    }),
  ];
  return rows;
}

function buildAssumptions(out: PipelineOutput): string[] {
  const { deal, rent } = out;
  const comparables = figureById(out, "comparables");
  const vacant = deal.units.filter((u) => u.inPlaceRentPerM2 === null).length;
  return [
    "Desktop valuation without an internal inspection: the documents and photos the client provided are taken as complete and correct.",
    "Market value (§ 194 BauGB) by the general income approach of § 28 ImmoWertV; the value is rounded to the nearest €10,000.",
    `Operating costs use the ImmoWertV Annex 3 model values (indexed; sample): ${eur(ANNEX3.managementPerUnit)} management per unit, ${eur(ANNEX3.maintenancePerM2, { decimals: 2 })} maintenance per m² and a rent-loss risk of ${pct(ANNEX3.rentLossRate)} of gross income.`,
    `Total economic life ${ANNEX3.totalLifeYears} years; the remaining life follows the year of construction and the modernisation points (ImmoWertV Annex 2 model, simplified).`,
    `Market rents are estimated per unit from ${comparables ? `${comparables.display} comparable asking-rent listings` : "comparable listings"} (location base ${rentM2(rent.base)}), adjusted for floor, size and features; listings older than 12 months are index-adjusted by +2.5 % a year.`,
    vacant > 0
      ? `Vacant units are re-let within ${ANNEX3.vacancyMonths} months: that much market rent is deducted per vacant unit.`
      : `A vacant unit would be re-let within ${ANNEX3.vacancyMonths} months; no unit is vacant.`,
    "The unit values split the building's value by each unit's share of market rent; they are not separate valuations.",
  ];
}

/** Each document's verbatim citations, in the order the report lists the facts. */
function citationsByDocument(out: PipelineOutput): Map<string, ReportCitation[]> {
  const { deal } = out;
  const p = deal.property;
  const byDoc = new Map<string, ReportCitation[]>();
  const add = (quote: Quote, what: string, translation: string | null = null) => {
    const list = byDoc.get(quote.documentId) ?? [];
    list.push({ what, page: quote.page, quote: quote.quote, translation, verified: quote.verified });
    byDoc.set(quote.documentId, list);
  };

  // Tenant list: the total row, then the unit rows (grouped by document and page).
  if (p.tenantListTotalSource) {
    const total = p.tenantListTotalRentPerMonth;
    add(
      p.tenantListTotalSource,
      "Rent total",
      total === null ? null : `Total net rent per month: ${eur(total, { decimals: 2 })}`,
    );
  }
  const rowGroups = new Map<string, { quote: Quote; quotes: string[]; names: string[]; verified: boolean }>();
  for (const unit of deal.units) {
    if (!unit.source || unit.origin !== "extracted") continue;
    const key = `${unit.source.documentId}|${unit.source.page}`;
    const group = rowGroups.get(key) ?? { quote: unit.source, quotes: [], names: [], verified: true };
    group.quotes.push(unit.source.quote);
    group.names.push(unitName(unit));
    group.verified &&= unit.source.verified;
    rowGroups.set(key, group);
  }
  for (const group of rowGroups.values()) {
    const list = byDoc.get(group.quote.documentId) ?? [];
    list.push({
      what: `Unit rows (${group.quotes.length})`,
      page: group.quote.page,
      quote: group.quotes.join(" · "),
      translation: group.names.join(" · "),
      verified: group.verified,
    });
    byDoc.set(group.quote.documentId, list);
  }

  // Land register, energy certificate, refurbishment sheet, zoning plan.
  if (p.plotSource) add(p.plotSource, "Plot area");
  for (const e of p.easements) add(e.source, `Easement ${e.id} (section II)`, e.translation || null);
  if (p.builtYearSource) add(p.builtYearSource, "Year of construction");
  for (const m of p.refurbishments) add(m.source, `${m.name} (${m.year}, ${count(m.points, "point")})`);
  if (p.zoning) add(p.zoning.source, "Zoning", p.zoning.areaType);
  return byDoc;
}

function buildSources(out: PipelineOutput, documents: ReportDocumentRow[]): ReportModel["sources"] {
  const citations = citationsByDocument(out);
  return {
    documents: documents.map((doc) => ({ ...doc, citations: citations.get(doc.id) ?? [] })),
    data: out.registry
      .filter((f) => f.sourceType !== "calculated")
      .map((f) => ({
        label: f.label,
        value: f.display,
        sourceType: f.sourceType,
        source: SOURCE_WORDS[f.sourceType],
        detail: f.sourceDetail,
      })),
  };
}

function buildReviewLog(stored: StoredDeal, out: PipelineOutput, version: number): ReviewLogRow[] {
  const { deal } = stored;
  const h = stored.history;
  const documents = deal.documents.filter((d) => d.status === "done").length;
  return h.versions.map((v): ReviewLogRow => {
    const value = v.n === version ? out.valuation.marketValue : runVersion(deal, h, v.n).valuation.marketValue;
    const undone = v.undone ? " (undone)" : "";
    if (v.n === 1) {
      const flags = v.n === version ? out.flags.length : runVersion(deal, h, 1).flags.length;
      return {
        n: 1,
        label: `v1 · AI draft${undone}`,
        who: "AI",
        at: dateTimeLabel(v.createdAt),
        valueText: eur(value),
        changes: [],
        detail: `Prepared by the AI from ${count(documents, "document")}; ${count(flags, "judgement call")} flagged for the senior valuer.`,
        readBy: null,
        undone: v.undone,
        current: v.n === version,
      };
    }
    const readBy =
      v.aiMode === "live"
        ? `Read by Live AI${v.durationMs !== null ? ` in ${durationText(v.durationMs)}` : ""}`
        : v.aiMode === "demo"
          ? "Read by the rule-based parser (Demo mode)"
          : null;
    return {
      n: v.n,
      label: `v${v.n} · ${SIGNER_INITIALS} · note: “${v.note ?? ""}”${undone}`,
      who: SIGNER,
      at: dateTimeLabel(v.createdAt),
      valueText: eur(value),
      changes: v.changes.map((c) => changeText(c, deal)),
      detail: v.explanation,
      readBy,
      undone: v.undone,
      current: v.n === version,
    };
  });
}

/** "<1 ms", "350 ms", "7.0 s". */
function durationText(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
}

function buildEmail(out: PipelineOutput, calls: ReportCall[], fileName: string, signedAt: string, version: number): ReportEmail {
  const { deal, valuation } = out;
  return {
    from: `Censio RE <${REPORT_SENDER}>`,
    to: deal.clientName,
    date: dateTimeLabel(signedAt),
    subject: `Your valuation report is ready — ${deal.address.street}`,
    greeting: `Dear ${deal.clientName} team,`,
    body: [
      `The valuation of ${addressLine(deal)} (${deal.id}) is complete. The market value as of ${dateLabel(deal.valuationDate)} is ${eur(valuation.marketValue)}.`,
      `${SIGNER}, senior valuer, checked the AI's ${count(calls.length, "judgement call")} and signed version ${version}. The report shows how the value is built and names the source of every figure.`,
    ],
    closing: ["Kind regards,", "Censio RE"],
    attachment: fileName,
  };
}

/** The report's file name: `Censio_Report_CEN-2026-0147_v2.pdf`; a draft ends in `_draft`. */
export function reportFileName(dealId: string, version: number, draft: boolean): string {
  return `Censio_Report_${dealId}_v${version}${draft ? "_draft" : ""}.pdf`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Entry point

/** The report of the deal's current version; a draft until the valuer signs. */
export function buildReport(stored: StoredDeal): ReportModel {
  const out = runCurrentVersion(stored.deal, stored.history);
  const version = currentVersion(stored.history).n;
  const draftOut = version === 1 ? out : runVersion(stored.deal, stored.history, 1);
  const draft = stored.approval === null || stored.deal.status !== "approved";
  const fileName = reportFileName(stored.deal.id, version, draft);
  const calls = buildCalls(stored, out, draftOut);
  const documents = documentRows(out);
  const titles = new Map(out.flags.map((f) => [f.id, f.title]));
  return {
    dealId: stored.deal.id,
    version,
    draft,
    fileName,
    value: out.valuation.marketValue,
    valueText: eur(out.valuation.marketValue),
    cover: buildCover(stored, out, draft, version),
    summary: buildSummary(out, draftOut, calls, draft, version),
    property: { facts: propertyFacts(out), documents, missing: missingDocuments(out) },
    units: buildUnits(out),
    calculation: buildCalculation(out),
    assumptions: buildAssumptions(out),
    calls,
    sources: buildSources(out, documents),
    reviewLog: buildReviewLog(stored, out, version),
    signOff:
      draft || !stored.approval
        ? null
        : {
            signer: stored.approval.signer,
            role: "Senior valuer",
            at: dateTimeLabel(stored.approval.at),
            version: stored.approval.version,
            acceptedWithoutOpening: stored.approval.acceptedAtSignOff.map((id) => titles.get(id) ?? id),
          },
    email: draft || !stored.approval ? null : buildEmail(out, calls, fileName, stored.approval.at, version),
    disclaimer: REPORT_DISCLAIMER,
  };
}
