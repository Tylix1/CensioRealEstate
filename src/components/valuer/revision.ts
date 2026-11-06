/**
 * Pure helpers of the Revalue loop and the approval sheet on the review screen (spec §5.2 V3 and V4, plan Task 17):
 * the demo example notes, the revision banner (its title and the table of changes against the previous version), the
 * figures outlined while the AI revises, the "(was …)" titles of the calls the valuer changed, and each call's status
 * in the approval sheet. No hooks, no clock: everything is derived from the stored deal and its pipeline output.
 */
import type { Flag } from "@/lib/flags/rules";
import { eur, rentM2 } from "@/lib/format";
import { flagsChangedByValuer, runVersion, type PipelineOutput } from "@/lib/pipeline/run";
import { PARAM_FIGURE, dependentsOf, type Figure } from "@/lib/registry/registry";
import { percentText, yearsText } from "@/lib/revalue/schema";
import {
  currentVersion,
  diffResults,
  previousVersion,
  type DiffRow,
  type History,
  type ParamChange,
  type ParamKey,
  type Version,
} from "@/lib/revisions/history";
import type { FlagReviewStatus, StoredDeal } from "@/lib/store/demoStore";
import { VALUER_INITIALS, figureOfFlag, signedPct } from "./review";

// ---------------------------------------------------------------------------------------------------------------------
// Sending a note

/** The verdict band's general note box (Revalue…); a call's own box is keyed by its flag id. */
export const GENERAL_NOTE_BOX = "general-note";

/** DOM id of the revision banner's slot, scrolled into view while the AI revises (carries the deal id, see flagDomId). */
export function revisionDomId(dealId: string): string {
  return `revision-${dealId}`;
}

/** DOM id of the AI's answer under a note box. */
export function answerDomId(dealId: string, box: string): string {
  return `note-answer-${dealId}-${box}`;
}

/**
 * The working state ("AI is revising…") stays at least this long, so the moment reads on video: in Demo mode the
 * rule-based parser answers within a few milliseconds. The banner still names the real duration of a live revision.
 */
export const MIN_WORKING_MS = 1200;

/** How much longer to keep the working state once the answer is in, after `elapsedMs`. */
export function holdMs(elapsedMs: number): number {
  return Math.max(0, MIN_WORKING_MS - elapsedMs);
}

/** The rehearsed note for check 1 (spec §6.2): it maps to a cap rate of 3.4 %, which gives exactly v2. */
export const REHEARSED_NOTE =
  "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";

/** The notes Demo mode offers to click (plan Task 17): the rehearsed note, a unit's rent and the under-rent period. */
export const DEMO_EXAMPLE_NOTES = [REHEARSED_NOTE, "attic rent 9.50", "Under-rent will close in 8 years"] as const;

/** The parameters a revision can change: their figures are the ones a note can set. */
const REVISABLE_FIGURES = new Set<string>(Object.values(PARAM_FIGURE));

/**
 * The figures a note sent from a call's box is about to change, before the AI has answered: the figure the call
 * questions (e.g. capRate for the cap-rate call), when a note can set it. A general note predicts none.
 */
export function predictedFigures(out: PipelineOutput, flagId: string | null): string[] {
  if (flagId === null) return [];
  const figure = figureOfFlag(out, flagId);
  return figure && REVISABLE_FIGURES.has(figure.id) ? [figure.id] : [];
}

/** The figures the AI's changes set, in order and without repeats (a unit's rent and the average both set marketRent). */
export function changedFigures(changes: Pick<ParamChange, "parameter">[]): string[] {
  return [...new Set(changes.map((c) => PARAM_FIGURE[c.parameter]))];
}

/** The figures to outline while the AI revises: the changed figures and every figure that depends on them. */
export function outlineSet(registry: Figure[], ids: string[]): Set<string> {
  if (ids.length === 0) return new Set();
  return new Set([...ids, ...dependentsOf(registry, ids)]);
}

/** The labels of the figures `ids`, in registry order ("Cap rate", "Land-value interest", …). */
export function figureLabels(registry: Figure[], ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return registry.filter((f) => wanted.has(f.id)).map((f) => f.label);
}

// ---------------------------------------------------------------------------------------------------------------------
// The revision banner

/** "4.2": a duration in seconds to one decimal. */
function seconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1);
}

/**
 * "Revision 2 · the AI revised the valuation in 4.2 s" for a live revision, with the duration the AI took. In Demo
 * mode the rule-based parser answers in a few milliseconds, so the title says so instead of "in 0.0 s".
 */
export function revisionTitle(v: Pick<Version, "n" | "aiMode" | "durationMs">): string {
  const head = `Revision ${v.n}`;
  if (v.aiMode === "demo") return `${head} · revised in demo mode`;
  if (v.aiMode === "live" && v.durationMs !== null) return `${head} · the AI revised the valuation in ${seconds(v.durationMs)} s`;
  return head;
}

export interface RevisionRow {
  key: string;
  label: string;
  /** The previous version's value, formatted. */
  from: string;
  /** This version's value, formatted. */
  to: string;
  /** The market value's change against the previous version, e.g. "−6.9 %"; null on the other rows. */
  change: string | null;
  /** A parameter the valuer's note set ("changed by KV"). */
  byValuer: boolean;
  /** The market value, the table's total row. */
  total: boolean;
}

export interface RevisionView {
  n: number;
  /** The active version before it, the one the note revised. */
  prevN: number;
  prevValue: number;
  title: string;
  note: string | null;
  flagId: string | null;
  explanation: string | null;
  aiMode: Version["aiMode"];
  rows: RevisionRow[];
}

/** The rows of `diffResults` that are a revision's parameters, by the parameter that sets them. */
const PARAM_ROW: Partial<Record<ParamKey, string>> = {
  capRate: "capRate",
  marketRentAvg: "marketRentAvg",
  underRentYears: "underRentYears",
  easementDeduction: "easementDeduction",
  remainingLifeYears: "remainingLifeYears",
};
const PARAMETER_ROWS = new Set(Object.values(PARAM_ROW));

/** Deductions are positive euros in the engine and read as negative amounts, as in the calculation (spec §5.3.5). */
const DEDUCTIONS = new Set(["underRentDeduction", "easementDeduction"]);

function formatDiff(row: Pick<DiffRow, "key" | "format">, value: number): string {
  switch (row.format) {
    case "pct":
      return percentText(value);
    case "eurPerM2":
      return rentM2(value);
    case "years":
      return yearsText(value);
    case "factor":
      return value.toFixed(4);
    case "eur":
      return DEDUCTIONS.has(row.key) ? eur(-value) : eur(value);
  }
}

/** One row per unit whose market rent a note set: diffResults has the average only. */
function unitRentRows(changes: ParamChange[], before: PipelineOutput, after: PipelineOutput): RevisionRow[] {
  const ids = [...new Set(changes.flatMap((c) => (c.parameter === "marketRentUnit" && c.unitId ? [c.unitId] : [])))];
  return ids.flatMap((id): RevisionRow[] => {
    const from = before.valuation.units.find((u) => u.unitId === id)?.marketRentPerM2;
    const to = after.valuation.units.find((u) => u.unitId === id)?.marketRentPerM2;
    if (from === undefined || to === undefined) return [];
    const label = after.deal.units.find((u) => u.id === id)?.label.trim() || `Unit ${id}`;
    return [
      {
        key: `unit-${id}`,
        label: `Market rent · ${label}`,
        from: rentM2(from),
        to: rentM2(to),
        change: null,
        byValuer: true,
        total: false,
      },
    ];
  });
}

/**
 * The banner of the current revision: its note, the table of changes against the previous active version (undone
 * versions are skipped) and the AI's explanation. null while the AI draft v1 is the current version. `out` is the
 * pipeline of the current version.
 */
export function revisionView(stored: StoredDeal, out: PipelineOutput): RevisionView | null {
  const h = stored.history;
  const version = currentVersion(h);
  const prev = previousVersion(h);
  if (!prev) return null;
  const before = runVersion(stored.deal, h, prev.n);
  const setByNote = new Set(version.changes.map((c) => PARAM_ROW[c.parameter]));

  const rows = diffResults(prev.params, before.valuation, version.params, out.valuation).map((d): RevisionRow => {
    const total = d.key === "marketValue";
    return {
      key: d.key,
      label: d.label,
      from: formatDiff(d, d.from),
      to: formatDiff(d, d.to),
      change: total && d.from !== 0 ? signedPct((d.to - d.from) / d.from) : null,
      byValuer: setByNote.has(d.key),
      total,
    };
  });
  const units = unitRentRows(version.changes, before, out);
  if (units.length > 0) {
    const average = rows.findIndex((r) => r.key === "marketRentAvg");
    const firstFigure = rows.findIndex((r) => !PARAMETER_ROWS.has(r.key));
    rows.splice(average >= 0 ? average : firstFigure >= 0 ? firstFigure : rows.length, 0, ...units);
  }

  return {
    n: version.n,
    prevN: prev.n,
    prevValue: before.valuation.marketValue,
    title: revisionTitle(version),
    note: version.note,
    flagId: version.flagId,
    explanation: version.explanation,
    aiMode: version.aiMode,
    rows,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Calls the valuer changed

/** The notes of the active revisions that changed the parameter a call is about, oldest first. */
export function valuerNotesOf(flagId: string, out: PipelineOutput, h: History): string[] {
  const draft = h.versions[0];
  const notes: string[] = [];
  for (const v of h.versions) {
    if (v.n <= 1 || v.undone || !v.note || notes.includes(v.note)) continue;
    // The calls this one revision settles, by the pipeline's own rule.
    if (flagsChangedByValuer(out, { versions: [draft, v] }).includes(flagId)) notes.push(v.note);
  }
  return notes;
}

/** " (was 3.0 %)", or " · was 9.60 €/m²" after a title that already ends in brackets. */
function wasNote(title: string, was: string): string {
  return title.endsWith(")") ? ` · was ${was}` : ` (was ${was})`;
}

/**
 * For each call the valuer changed, the AI draft's value to add to its title (mockup: "Cap rate 3.4 % (was 3.0 %)").
 * `draftOut` is the pipeline of v1.
 */
export function wasNotes(
  out: PipelineOutput,
  statuses: Record<string, FlagReviewStatus>,
  draftOut: PipelineOutput,
): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const flag of out.flags) {
    if (statuses[flag.id] !== "changed_by_valuer") continue;
    const now = figureOfFlag(out, flag.id);
    const before = figureOfFlag(draftOut, flag.id);
    if (now && before && now.display !== before.display) notes[flag.id] = wasNote(flag.title, before.display);
  }
  return notes;
}

// ---------------------------------------------------------------------------------------------------------------------
// The approval sheet

export type CallState = "accepted" | "changed" | "not_opened" | "opened";

export interface SheetCall {
  id: string;
  /** "check n" on the review screen. */
  number: number;
  /** The call's title, with "(was …)" once the valuer changed it. */
  title: string;
  state: CallState;
  statusText: string;
  /** For a call the valuer changed: the notes that changed it. */
  notes: string[];
}

function callState(flag: Flag, stored: StoredDeal, statuses: Record<string, FlagReviewStatus>): CallState {
  const status = statuses[flag.id] ?? "open";
  if (status === "changed_by_valuer") return "changed";
  if (status === "accepted") return "accepted";
  return stored.openedFlags.includes(flag.id) ? "opened" : "not_opened";
}

const STATUS_TEXT: Record<CallState, [now: string, atSignOff: string]> = {
  accepted: [`Accepted · ${VALUER_INITIALS}`, `Accepted · ${VALUER_INITIALS}`],
  changed: [`Changed by valuer · ${VALUER_INITIALS}`, `Changed by valuer · ${VALUER_INITIALS}`],
  not_opened: ["Not opened", "Accepted at sign-off without opening"],
  opened: ["Opened · not accepted", "Accepted at sign-off"],
};

/**
 * Every judgement call of the current version with its status for the approval sheet (spec §5.2 V4): accepted,
 * changed by the valuer (with the notes), or still open, opened or not. With `acceptRemaining` (the sheet's Accept
 * remaining), the open calls read as they will be logged when signing: accepted at sign-off, "without opening" for
 * those the valuer never opened.
 */
export function approvalCalls(
  stored: StoredDeal,
  out: PipelineOutput,
  statuses: Record<string, FlagReviewStatus>,
  acceptRemaining: boolean,
): SheetCall[] {
  const was = wasNotes(out, statuses, runVersion(stored.deal, stored.history, 1));
  return out.flags.map((flag, i) => {
    const state = callState(flag, stored, statuses);
    return {
      id: flag.id,
      number: i + 1,
      title: `${flag.title}${was[flag.id] ?? ""}`,
      state,
      statusText: STATUS_TEXT[state][acceptRemaining ? 1 : 0],
      notes: state === "changed" ? valuerNotesOf(flag.id, out, stored.history) : [],
    };
  });
}

/** Whether the valuer can sign: every call is reviewed (accepted or changed), or the rest are accepted at sign-off. */
export function signReady(calls: SheetCall[], acceptRemaining: boolean): boolean {
  return acceptRemaining || calls.every((c) => c.state === "accepted" || c.state === "changed");
}
