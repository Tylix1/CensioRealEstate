/**
 * The deterministic pipeline (spec §5.3 and §6.3; run-log steps 6–11 of §5.3.4): from a deal and the parameters of one
 * version to every figure, flag and text the review screen and the report show. No AI call, no clock and no
 * randomness, so the same deal and parameters always give the same output. The UI therefore recomputes it (memoised)
 * from the stored deal and its current version instead of storing derived figures.
 *
 * Steps: land value (sample BORIS table) → cap rate (sample market report) → market rent per unit (comparables
 * estimator) → remaining economic life (modernisation points) → valuation engine and its sensitivities →
 * cross-checks → judgement-call flags → figure registry.
 *
 * A deal whose year of construction is unknown is treated as built in 1948, the last year of the market report's
 * pre-war row: it takes that row's cap rate, and its remaining life rests on its modernisation alone.
 */
import comparablesJson from "@/lib/data/comparables.json";
import { runCrossChecks, type CrossCheck } from "@/lib/deal/crossChecks";
import type { Deal, RunLogEntry } from "@/lib/deal/types";
import { measurePoints, totalModernisationPoints } from "@/lib/extraction/points";
import { buildFlags, type Flag, type FlagContext, type FlagKind } from "@/lib/flags/rules";
import { eur, num, pct, rentM2 } from "@/lib/format";
import { lookupLandValue, type LandValueLookup } from "@/lib/lookups/boris";
import { ANNEX3 } from "@/lib/lookups/costs";
import { lookupCapRate, type CapRateLookup, type CapRateRow } from "@/lib/lookups/marketReport";
import { buildRegistry, type Figure } from "@/lib/registry/registry";
import { estimateBuilding, type BuildingRentSummary, type Comparable } from "@/lib/rent/estimator";
import { currentVersion, type History, type ParamKey, type Version } from "@/lib/revisions/history";
import {
  computeValuation,
  remainingLife,
  type ValuationInput,
  type ValuationParams,
  type ValuationResult,
} from "@/lib/valuation/engine";
import { computeSensitivities, type Sensitivity } from "@/lib/valuation/sensitivity";

export interface PipelineOutput {
  deal: Deal;
  rent: BuildingRentSummary;
  land: LandValueLookup;
  capRate: CapRateLookup;
  params: ValuationParams;
  input: ValuationInput;
  valuation: ValuationResult;
  sensitivities: Sensitivity[];
  flags: Flag[];
  registry: Figure[];
  crossChecks: CrossCheck[];
}

/** The 38 bundled rental listings of spec §5.3.7. */
export const COMPARABLES = comparablesJson as Comparable[];

/** The year of construction assumed when no energy certificate gives one. */
export const UNKNOWN_BUILT_YEAR = 1948;

/** The valuation year when the deal's valuation date cannot be read (the sample world's). */
const DEFAULT_VALUATION_YEAR = 2026;

/** The AI's assumption in v1: the under-rent closes within 5 years (spec §5.3.6). */
const UNDER_RENT_YEARS = 5;

/** Sensitivity ranges besides the market report and the estimator (spec §5.3.5). */
const UNDER_RENT_RANGE: [number, number] = [3, 8];
const EASEMENT_MAX_SHARE_OF_LAND = 0.05;

function builtYearOf(deal: Deal): number {
  return deal.property.builtYear ?? UNKNOWN_BUILT_YEAR;
}

function valuationYearOf(deal: Deal): number {
  const year = Number.parseInt(deal.valuationDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : DEFAULT_VALUATION_YEAR;
}

function copyParams(p: ValuationParams): ValuationParams {
  return { ...p, marketRentOverrides: { ...p.marketRentOverrides } };
}

/**
 * The AI draft's parameters (v1): the committee's median cap rate, the remaining life from the year of construction
 * and the modernisation points, 5 years for the under-rent to close, no easement deduction, the estimator's rents.
 */
export function initialParams(deal: Deal, capRate: CapRateLookup): ValuationParams {
  return {
    capRate: capRate.row.median,
    remainingLifeYears: remainingLife(
      builtYearOf(deal),
      valuationYearOf(deal),
      deal.property.modernisationPoints,
      ANNEX3.totalLifeYears,
    ),
    underRentYears: UNDER_RENT_YEARS,
    easementDeduction: 0,
    marketRentFactor: 1,
    marketRentOverrides: {},
  };
}

function valuationInput(
  deal: Deal,
  rent: BuildingRentSummary,
  land: LandValueLookup,
  params: ValuationParams,
): ValuationInput {
  return {
    // estimateBuilding keeps the order of the units, so estimate i is unit i's.
    units: deal.units.map((u, i) => ({
      id: u.id,
      areaM2: u.areaM2,
      inPlaceRentPerM2: u.inPlaceRentPerM2,
      marketRentPerM2: rent.units[i].rentPerM2,
    })),
    plotM2: deal.property.plotM2 ?? 0,
    landValuePerM2: land.valuePerM2,
    managementPerUnit: ANNEX3.managementPerUnit,
    maintenancePerM2: ANNEX3.maintenancePerM2,
    rentLossRate: ANNEX3.rentLossRate,
    vacancyMonths: ANNEX3.vacancyMonths,
    params,
  };
}

/** Over the committee's range, the estimator's plausible range, 3–8 years and up to 5 % of the land value. */
function sensitivitiesOf(
  input: ValuationInput,
  rent: BuildingRentSummary,
  capRate: CapRateLookup,
  valuation: ValuationResult,
): Sensitivity[] {
  return computeSensitivities(input, rent.average, {
    capRate: capRate.row.range,
    marketRentAvg: rent.range,
    underRentYears: UNDER_RENT_RANGE,
    easementMax: EASEMENT_MAX_SHARE_OF_LAND * valuation.landValue,
  });
}

/**
 * The estimator's market rent per unit (€/m²). The cross-checks test the extracted data, so they compare the in-place
 * rents with the AI's estimate, not with a rent the valuer set in a revision.
 */
function estimatorRents(rent: BuildingRentSummary): Record<string, number> {
  return Object.fromEntries(rent.units.map((e) => [e.unitId, e.rentPerM2]));
}

/**
 * Runs the pipeline for one version of a deal.
 * @param params the version's parameters; the AI draft's (`initialParams`) when omitted. The output holds a copy.
 * @param valuerChanged the figures, or parameter keys, the valuer set in the active revisions (`valuerChangesOf`);
 *   they become `valuer` figures in the registry.
 */
export function runPipeline(deal: Deal, params?: ValuationParams, valuerChanged: string[] = []): PipelineOutput {
  const land = lookupLandValue(deal.address.zip);
  const capRate = lookupCapRate(builtYearOf(deal));
  const rent = estimateBuilding(deal.units, COMPARABLES);
  const p = params ? copyParams(params) : initialParams(deal, capRate);
  const input = valuationInput(deal, rent, land, p);
  const valuation = computeValuation(input);
  const sensitivities = sensitivitiesOf(input, rent, capRate, valuation);
  const context: FlagContext = { deal, valuation, rent, capRate, land, sensitivities, params: p };
  const flags = buildFlags(context);
  const registry = buildRegistry({ ...context, flags, valuerChanged: [...valuerChanged] });
  const crossChecks = runCrossChecks(deal, estimatorRents(rent));
  return { deal, rent, land, capRate, params: p, input, valuation, sensitivities, flags, registry, crossChecks };
}

// ---------------------------------------------------------------------------------------------------------------------
// Run log

/**
 * The AI-at-work log of the pipeline (spec §5.3.4, steps 6–11), for the AI draft `out = runPipeline(deal)`. Each step
 * is run again and timed, so the durations are measured, not fixed. `performance.now()` is the clock: unlike `Date`,
 * Next.js allows it while prerendering. Steps are numbered after the deal's documents, whose extraction rows come
 * first (steps 6–11 for the 5 sample documents).
 */
export function buildRunLog(deal: Deal, out: PipelineOutput, now: () => number = () => performance.now()): RunLogEntry[] {
  const timed = <T>(work: () => T): { value: T; durationMs: number } => {
    const start = now();
    const value = work();
    return { value, durationMs: Math.max(0, Math.round((now() - start) * 100) / 100) };
  };
  const builtYear = builtYearOf(deal);

  const land = timed(() => lookupLandValue(deal.address.zip));
  const capRate = timed(() => lookupCapRate(builtYear));
  const rent = timed(() => estimateBuilding(deal.units, COMPARABLES));
  const life = timed(() => {
    const points = totalModernisationPoints(
      deal.property.refurbishments.map((m) => ({ category: m.category, points: measurePoints(m.category, m.extent) })),
    );
    return { points, years: remainingLife(builtYear, valuationYearOf(deal), points, ANNEX3.totalLifeYears) };
  });
  const engine = timed(() => {
    const input = valuationInput(deal, rent.value, land.value, out.params);
    const valuation = computeValuation(input);
    const context: FlagContext = {
      deal,
      valuation,
      rent: rent.value,
      capRate: capRate.value,
      land: land.value,
      sensitivities: sensitivitiesOf(input, rent.value, capRate.value, valuation),
      params: out.params,
    };
    return { context, flags: buildFlags(context), crossChecks: runCrossChecks(deal, estimatorRents(rent.value)) };
  });
  const report = timed(() =>
    buildRegistry({ ...engine.value.context, flags: engine.value.flags, valuerChanged: [] }),
  );

  const { context, flags, crossChecks } = engine.value;
  const passed = crossChecks.filter((c) => c.passed).length;
  const first = deal.documents.length + 1;
  const { page, table } = capRate.value;
  const entries: Omit<RunLogEntry, "step">[] = [
    {
      label: "Look up land value (sample BORIS table)",
      kind: "lookup",
      result: landValueResult(land.value),
      durationMs: land.durationMs,
    },
    {
      label: `Look up cap rate (sample market report 2026, p. ${page}, table ${table})`,
      kind: "lookup",
      result: capRateResult(capRate.value),
      durationMs: capRate.durationMs,
    },
    {
      label: "Estimate market rent",
      kind: "estimator",
      result:
        deal.units.length === 0
          ? `No units; location base ${rentM2(rent.value.base)}`
          : `${rentM2(rent.value.average)} average`,
      durationMs: rent.durationMs,
    },
    {
      label: "Score modernisation",
      kind: "rules",
      result: `${count(life.value.points, "point")} → ${count(life.value.years, "year")} remaining life${deal.property.builtYear === null ? " (year of construction unknown)" : ""}`,
      durationMs: life.durationMs,
    },
    {
      label: "Compute value, run cross-checks, flag judgement calls",
      kind: "engine",
      result: `${eur(context.valuation.marketValue)}; ${passed} of ${crossChecks.length} cross-checks passed; ${count(flags.length, "judgement call")} flagged`,
      durationMs: engine.durationMs,
    },
    {
      label: "Draft the report",
      kind: "engine",
      result: `Report draft: ${count(report.value.length, "figure")}, each traced to its source`,
      durationMs: report.durationMs,
    },
  ];
  return entries.map((entry, i) => ({ step: first + i, ...entry }));
}

const CAP_RATE_GROUP: Record<CapRateRow["key"], string> = {
  efh: "one- and two-family houses",
  mfh_pre1949: "pre-war MFH",
  mfh_post1949: "post-war MFH",
  mixed: "mixed-use buildings",
};

/** "520 €/m², zone 0412, as of 01 Jan 2026", or the fallback's note. */
function landValueResult(land: LandValueLookup): string {
  const rate = `${num(land.valuePerM2, Number.isInteger(land.valuePerM2) ? 0 : 2)} €/m²`;
  if (land.note !== null) return `${rate}, fallback: ${land.note.charAt(0).toLowerCase()}${land.note.slice(1)}`;
  return `${rate}, zone ${land.zone}, as of ${dayMonthYear(land.asOf)}`;
}

/** "2.5–3.5 % for pre-war MFH, median 3.0 %, n = 64". */
function capRateResult({ row, districtValue }: CapRateLookup): string {
  const district = districtValue === null ? "" : `district figure ${pct(districtValue)}; `;
  const range = `${(row.range[0] * 100).toFixed(1)}–${pct(row.range[1])}`;
  return `${district}${range} for ${CAP_RATE_GROUP[row.key]}, median ${pct(row.median)}, n = ${row.n}`;
}

/** "1 point", "13 points". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `01 Jan 2026` for "2026-01-01". */
function dayMonthYear(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = match ? MONTH[Number(match[2]) - 1] : undefined;
  return match && month ? `${match[3]} ${month} ${match[1]}` : iso;
}

// ---------------------------------------------------------------------------------------------------------------------
// Versions

/** The revisions after the AI draft that are not undone, up to version `upTo`. */
function activeRevisions(h: History, upTo = Infinity): Version[] {
  return h.versions.filter((v) => v.n > 1 && v.n <= upTo && !v.undone);
}

/**
 * The parameters the valuer changed in the active revisions up to version `upTo` (default: all), in the order first
 * changed: `runPipeline`'s `valuerChanged`. A parameter set back to the AI's value still counts as the valuer's.
 */
export function valuerChangesOf(h: History, upTo = Infinity): ParamKey[] {
  const keys: ParamKey[] = [];
  for (const v of activeRevisions(h, upTo)) {
    for (const c of v.changes) if (!keys.includes(c.parameter)) keys.push(c.parameter);
  }
  return keys;
}

/** The pipeline of the deal's current version: its parameters, with the valuer's figures marked. */
export function runCurrentVersion(deal: Deal, h: History): PipelineOutput {
  return runPipeline(deal, currentVersion(h).params, valuerChangesOf(h));
}

/** The parameters whose values differ between two versions' parameters, in ParamKey order. */
function paramsChanged(a: ValuationParams, b: ValuationParams): ParamKey[] {
  const keys: ParamKey[] = [];
  if (a.capRate !== b.capRate) keys.push("capRate");
  if (a.marketRentFactor !== b.marketRentFactor) keys.push("marketRentAvg");
  const units = new Set([...Object.keys(a.marketRentOverrides), ...Object.keys(b.marketRentOverrides)]);
  if ([...units].some((id) => a.marketRentOverrides[id] !== b.marketRentOverrides[id])) keys.push("marketRentUnit");
  if (a.underRentYears !== b.underRentYears) keys.push("underRentYears");
  if (a.easementDeduction !== b.easementDeduction) keys.push("easementDeduction");
  if (a.remainingLifeYears !== b.remainingLifeYears) keys.push("remainingLifeYears");
  return keys;
}

/** The pipeline of version `n` (e.g. the previous version for a revision's diff, or an entry of the review log). */
export function runVersion(deal: Deal, h: History, n: number): PipelineOutput {
  const version = h.versions.find((v) => v.n === n);
  if (!version) throw new RangeError(`The revision history has no version ${n}`);
  const changed = valuerChangesOf(h, n);
  if (version.undone) {
    // Once undone, the history no longer tells which earlier revisions a version was made on (one undone after it
    // was, one undone before it was not). Its own note's parameters, and every parameter that differs from the AI
    // draft's, are the valuer's.
    const draft = h.versions.find((v) => v.n === 1);
    const own = version.changes.map((c) => c.parameter);
    for (const key of [...own, ...(draft ? paramsChanged(draft.params, version.params) : [])]) {
      if (!changed.includes(key)) changed.push(key);
    }
  }
  return runPipeline(deal, version.params, changed);
}

/** The calls a revisable parameter settles. */
const PARAM_FLAG_KINDS: Record<ParamKey, FlagKind[]> = {
  capRate: ["cap_rate"],
  marketRentAvg: ["market_rent"],
  marketRentUnit: ["market_rent"],
  underRentYears: ["under_rent"],
  easementDeduction: ["easement"],
  remainingLifeYears: [],
};

/**
 * The judgement calls of `out` (a version of the deal with history `h`) that the valuer changed in an active revision
 * ("changed by valuer" in the approval sheet and the report): the calls on the parameters a revision changed,
 * whichever note box sent it. A note sent from one call's box that changes another call's parameter (or the remaining
 * life, which has no call) leaves the first call as it was, so it still needs the valuer's Accept. In flag order.
 */
export function flagsChangedByValuer(out: PipelineOutput, h: History): string[] {
  const kinds = new Set<FlagKind>();
  const ids = new Set<string>();
  for (const v of activeRevisions(h)) {
    for (const c of v.changes) {
      for (const kind of PARAM_FLAG_KINDS[c.parameter] ?? []) kinds.add(kind);
      // A unit added by hand has its own call on its market rent.
      if (c.parameter === "marketRentUnit" && c.unitId) ids.add(`manual_unit-${c.unitId}`);
    }
  }
  return out.flags.filter((f) => ids.has(f.id) || kinds.has(f.kind)).map((f) => f.id);
}
