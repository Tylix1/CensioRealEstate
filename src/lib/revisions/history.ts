/**
 * Linear revision history of a deal's valuation (spec §5.2 V3).
 *
 * v1 is the AI draft. Each revalue note that changes parameters appends a version built on the
 * current one, so revisions are cumulative. Undo marks the latest active version as undone and
 * deletes nothing: the review log keeps every version. Version numbers are never reused.
 * All functions are pure; they never mutate their arguments.
 */
import type { ValuationParams, ValuationResult } from "@/lib/valuation/engine";

export type ParamKey =
  | "capRate"
  | "marketRentAvg"
  | "marketRentUnit"
  | "underRentYears"
  | "easementDeduction"
  | "remainingLifeYears";

export interface ParamChange {
  parameter: ParamKey;
  /** Required for `marketRentUnit`. */
  unitId?: string;
  from: number;
  /** In the parameter's own unit: cap rate as a fraction, rents in €/m², deductions in €, durations in years. */
  to: number;
  reason: string;
  sourceKind: "valuer_judgement" | "document";
  documentId?: string;
}

export interface Version {
  /** 1-based; v1 is the AI draft. */
  n: number;
  params: ValuationParams;
  /** The valuer's note; null for v1. */
  note: string | null;
  /** The flag whose note box sent the note; null for a general note and for v1. */
  flagId: string | null;
  changes: ParamChange[];
  explanation: string | null;
  aiMode: "live" | "demo" | null;
  createdAt: string;
  durationMs: number | null;
  undone: boolean;
}

export interface History {
  versions: Version[];
}

function copyParams(p: ValuationParams): ValuationParams {
  return { ...p, marketRentOverrides: { ...p.marketRentOverrides } };
}

export function initialHistory(params: ValuationParams, createdAt: string): History {
  return {
    versions: [
      {
        n: 1,
        params: copyParams(params),
        note: null,
        flagId: null,
        changes: [],
        explanation: null,
        aiMode: null,
        createdAt,
        durationMs: null,
        undone: false,
      },
    ],
  };
}

/** Index of the last version that is not undone, or −1. */
function currentIndex(h: History): number {
  for (let i = h.versions.length - 1; i >= 0; i--) {
    if (!h.versions[i].undone) return i;
  }
  return -1;
}

/** The last version that is not undone. Throws on a history without one, which the API never produces. */
export function currentVersion(h: History): Version {
  const i = currentIndex(h);
  if (i < 0) throw new Error("Revision history has no active version");
  return h.versions[i];
}

/** The active version before the current one, skipping undone versions; null when the current one is v1. */
export function previousVersion(h: History): Version | null {
  for (let i = currentIndex(h) - 1; i >= 0; i--) {
    if (!h.versions[i].undone) return h.versions[i];
  }
  return null;
}

/**
 * Applies the changes in order to a copy of `p`.
 * - `marketRentAvg` sets `marketRentFactor = to / baseAvgRent`, where `baseAvgRent` is the rent
 *   estimator's building average; per-unit overrides stay in force.
 * - `marketRentUnit` sets `marketRentOverrides[unitId] = to`.
 * - Every other parameter maps one-to-one.
 * Throws instead of producing broken params: a non-finite `to`, a `marketRentUnit` change without
 * `unitId`, or a `marketRentAvg` change without a positive `baseAvgRent`.
 */
export function applyChanges(p: ValuationParams, changes: ParamChange[], baseAvgRent: number): ValuationParams {
  const next = copyParams(p);
  for (const c of changes) {
    if (!Number.isFinite(c.to)) throw new RangeError(`${c.parameter}: the new value must be a finite number`);
    switch (c.parameter) {
      case "capRate":
        next.capRate = c.to;
        break;
      case "marketRentAvg":
        if (!(Number.isFinite(baseAvgRent) && baseAvgRent > 0)) {
          throw new RangeError("marketRentAvg: the estimator's average rent must be a positive number");
        }
        next.marketRentFactor = c.to / baseAvgRent;
        break;
      case "marketRentUnit":
        if (!c.unitId) throw new Error("marketRentUnit: the change names no unitId");
        next.marketRentOverrides[c.unitId] = c.to;
        break;
      case "underRentYears":
        next.underRentYears = c.to;
        break;
      case "easementDeduction":
        next.easementDeduction = c.to;
        break;
      case "remainingLifeYears":
        next.remainingLifeYears = c.to;
        break;
      default: {
        const unknown: never = c.parameter;
        throw new Error(`Unknown parameter: ${String(unknown)}`);
      }
    }
  }
  return next;
}

/** Appends `v` as the next version (n = versions.length + 1, so undone versions keep their numbers). */
export function addRevision(h: History, v: Omit<Version, "n" | "undone">): History {
  const version: Version = {
    n: h.versions.length + 1,
    params: copyParams(v.params),
    note: v.note,
    flagId: v.flagId,
    changes: v.changes.map((c) => ({ ...c })),
    explanation: v.explanation,
    aiMode: v.aiMode,
    createdAt: v.createdAt,
    durationMs: v.durationMs,
    undone: false,
  };
  return { ...h, versions: [...h.versions, version] };
}

/** Marks the current version undone; v1 (the AI draft) is never undone, so then `h` itself is returned. */
export function undoLast(h: History): History {
  const i = currentIndex(h);
  if (i <= 0 || h.versions[i].n <= 1) return h;
  return { ...h, versions: h.versions.map((v, j) => (j === i ? { ...v, undone: true } : v)) };
}

export interface DiffRow {
  key: string;
  label: string;
  from: number;
  to: number;
  format: "pct" | "eur" | "factor" | "years" | "eurPerM2";
}

/** Area-weighted building average of the effective market rents, in €/m² per month. */
function averageMarketRent(r: ValuationResult): number {
  return r.livingAreaM2 > 0 ? r.grossIncome / 12 / r.livingAreaM2 : 0;
}

const DIFF_ROWS: {
  key: string;
  label: string;
  format: DiffRow["format"];
  read: (p: ValuationParams, r: ValuationResult) => number;
}[] = [
  { key: "capRate", label: "Cap rate", format: "pct", read: (p) => p.capRate },
  // From the result, so a per-unit override shows up here too.
  { key: "marketRentAvg", label: "Market rent (avg.)", format: "eurPerM2", read: (_p, r) => averageMarketRent(r) },
  { key: "underRentYears", label: "Under-rent closing", format: "years", read: (p) => p.underRentYears },
  { key: "easementDeduction", label: "Easement deduction", format: "eur", read: (p) => p.easementDeduction },
  { key: "remainingLifeYears", label: "Remaining life", format: "years", read: (p) => p.remainingLifeYears },
  { key: "landInterest", label: "Land-value interest", format: "eur", read: (_p, r) => r.landInterest },
  { key: "pvFactor", label: "Present-value factor", format: "factor", read: (_p, r) => r.pvFactor },
  { key: "buildingValue", label: "Building value", format: "eur", read: (_p, r) => r.buildingValue },
  { key: "underRentDeduction", label: "Under-rent deduction", format: "eur", read: (_p, r) => r.underRentDeduction },
  { key: "marketValue", label: "Market value", format: "eur", read: (_p, r) => r.marketValue },
];

/** True when two figures differ by more than floating-point noise. */
function changed(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * The rows that differ between two versions, in a fixed order: the parameters first, then the
 * figures they move. Values are unrounded and in the engine's units (cap rate as a fraction,
 * deductions as positive euros); the UI formats them by `format`.
 */
export function diffResults(
  prevP: ValuationParams,
  prevR: ValuationResult,
  nextP: ValuationParams,
  nextR: ValuationResult,
): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const { key, label, format, read } of DIFF_ROWS) {
    const from = read(prevP, prevR);
    const to = read(nextP, nextR);
    if (changed(from, to)) rows.push({ key, label, from, to, format });
  }
  return rows;
}
