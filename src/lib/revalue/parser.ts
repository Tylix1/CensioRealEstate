/**
 * The rule-based reading of a Revalue note (spec §6.2 and §6.4, plan Task 11).
 *
 * Demo mode answers every note with `parseNote`. The live path runs Claude's answer through `validateChanges`, which
 * uses the same reading (so explicit numbers in the note win) and the same checks and wording (`checkChanges`,
 * `explainChanges`).
 *
 * How a note is read:
 * 1. A note that ends with "?" or starts with why/what/how/which (warum/wieso/weshalb) is a question. It is answered
 *    from the focused flag's reasoning and changes nothing.
 * 2. Parameters are found by name in English or German ("cap rate", "LZ", "Miete", "under-rent", "Leitungsrecht",
 *    "RND", …). Units are found by label ("attic", "GF left"), position ("DG", "EG links", "1. OG rechts") or number
 *    ("unit 8", "WE 8"). A bare rent word next to a unit names that unit's rent, otherwise the average market rent.
 * 3. Numbers take a decimal comma or point ("9,50", "3.4"); amounts may group thousands or carry k/T€ ("12.000 €",
 *    "15 000 €", "12k"). A number's unit (%, bp, €/m², €, years, months, m²) decides which parameter it can belong
 *    to. A number after "use/set/to/auf" is the new value; one after "from/instead of/not", or one the note rejects
 *    ("do not use 3.5 %", "3.5 % is too high"), is left out like an old value. A sign, "by x"
 *    with a verb or "x % lower" make a change relative to the current value; one measured against something else
 *    ("5 % above leases", "0.30 below 1F right") gets a question back.
 * 4. Each named parameter takes the nearest fitting number. A number without a named parameter goes to the focused
 *    flag's parameter or, by its unit, to the only parameter it can be (a percentage is a cap rate).
 * 5. Anything that does not give one definite value per parameter is `unclear`, with a question that says what is
 *    needed, and creates no version: no value, two values, only a range, an unknown or ambiguous unit, a sourced fact
 *    (areas, in-place rents, the land value), a value out of range, or one equal to the current value.
 */
import { eur, rentM2, round2 } from "@/lib/format";
import { MARKET_REPORT_2026 } from "@/lib/lookups/marketReport";
import {
  DEFAULT_CLARIFYING_QUESTION,
  RANGES,
  formatParamValue,
  paramName,
  rangeText,
  yearsText,
  type RevalueContext,
  type RevalueResult,
} from "@/lib/revalue/schema";
import type { ParamChange, ParamKey } from "@/lib/revisions/history";

/** The explanation of a result that changes nothing. */
export const NO_CHANGE = "No value was changed.";
/** The answer to a question nothing in the context answers. */
export const NO_ANSWER = "I could not answer that from this deal's data.";

const GENERIC_ANSWER =
  'In Demo mode I can explain a judgement call from its flag: open the flag and ask there. To revise the valuation, name the value, for example "use 3.4 %" or "attic rent 9.50".';
const SOURCED_FACTS =
  'Areas, in-place rents and the land value come from the documents and public data, so a note cannot change them. Which value should I change, and to what? For example: "use 3.4 %" or "attic rent 9.50".';
const NO_RENT_ESTIMATE = "This deal has no market rent estimate to scale. Which unit's market rent should I change?";
const EASEMENT_IN_EURO = 'Please give the easement deduction in euro, for example "easement 12k".';

/** A change as a note or a model asks for it, before `checkChanges` checks it and fills in `from`. */
export interface ChangeDraft {
  parameter: ParamKey;
  unitId?: string;
  to: number;
  reason: string;
  sourceKind: ParamChange["sourceKind"];
  documentId?: string;
}

type NumKind = "percent" | "bp" | "rent" | "amount" | "years" | "months" | "area" | "count" | "calendarYear" | "plain";

/** A range of values the valuer gives, e.g. "3.25–3.75 %": context for the explanation, never a value. */
export interface ValuerRange {
  kind: NumKind;
  low: number;
  high: number;
  start: number;
}

/** What a note asks for, before the checks against the context. */
export type NoteReading =
  | { kind: "question"; ranges: ValuerRange[] }
  | { kind: "changes"; changes: { parameter: ParamKey; unitId?: string; to: number }[]; ranges: ValuerRange[] }
  | { kind: "unclear"; question: string; ranges: ValuerRange[] };

// ---------------------------------------------------------------------------------------------------------------------
// Entry points

/** The Demo-mode answer to a note: a change, an answer or a clarifying question, never a guess. */
export function parseNote(note: string, ctx: RevalueContext): RevalueResult {
  const startedAt = Date.now();
  const done = (r: Omit<RevalueResult, "mode" | "durationMs">): RevalueResult => ({
    ...r,
    mode: "demo",
    durationMs: Date.now() - startedAt,
  });

  const reading = readNote(note, ctx);
  if (reading.kind === "question") {
    return done({
      intent: "question",
      changes: [],
      explanation: NO_CHANGE,
      answer: answerFor(normalise(note), ctx),
      clarifyingQuestion: null,
    });
  }
  if (reading.kind === "unclear") return done(unclearResult(reading.question));

  const reason = reasonFrom(note);
  const checked = checkChanges(
    reading.changes.map((c) => ({ ...c, reason, sourceKind: "valuer_judgement" as const })),
    ctx,
  );
  if (!checked.ok) return done(unclearResult(checked.question));
  return done({
    intent: "change_parameters",
    changes: checked.changes,
    explanation: explainChanges(checked.changes, ctx, reading.ranges),
    answer: null,
    clarifyingQuestion: null,
  });
}

/** A result that changes nothing and asks `question`. */
export function unclearResult(question: string): Omit<RevalueResult, "mode" | "durationMs"> {
  return { intent: "unclear", changes: [], explanation: NO_CHANGE, answer: null, clarifyingQuestion: question };
}

/** Ends with "?" or starts with why/what/how/which (warum/wieso/weshalb), as the plan's rules say. */
export function isQuestion(note: string): boolean {
  return QUESTION_START.test(note) || QUESTION_END.test(note);
}

/**
 * Checks changes against the context and fills in `from`, in the order given:
 * - a unit change must name one of the deal's units; other parameters carry no unit;
 * - values are brought to the engine's units and precision (a cap rate above 1 is read as a percentage);
 * - every value must lie in its allowed range; a value equal to the current one is dropped;
 * - of two changes to the same parameter (and unit) the later one wins.
 * Fails with a clarifying question when a change cannot be made or none is left; `dropped` reports a change left out.
 */
export function checkChanges(
  drafts: ChangeDraft[],
  ctx: RevalueContext,
): { ok: true; changes: ParamChange[]; dropped: boolean } | { ok: false; question: string } {
  const byKey = new Map<string, ParamChange>();
  let unchanged: ParamChange | null = null;
  let dropped = false;
  for (const d of drafts) {
    const unit = d.parameter === "marketRentUnit" ? ctx.units.find((u) => u.id === d.unitId) : undefined;
    if (d.parameter === "marketRentUnit" && !unit) {
      return { ok: false, question: unknownUnitQuestion(d.unitId ? `unit ${d.unitId}` : undefined, ctx) };
    }
    if (!Number.isFinite(d.to)) return { ok: false, question: DEFAULT_CLARIFYING_QUESTION };
    if (d.parameter === "marketRentAvg" && !(ctx.baseAvgRent > 0)) return { ok: false, question: NO_RENT_ESTIMATE };

    const to = engineValue(d.parameter, d.to);
    const [low, high] = RANGES[d.parameter];
    if (to < low - EPS || to > high + EPS) {
      return { ok: false, question: rangeQuestion(d.parameter, to, unit?.label) };
    }
    const from = currentValue(ctx, d.parameter, unit?.id);
    const cited = d.sourceKind === "document" && !!d.documentId;
    const change: ParamChange = {
      parameter: d.parameter,
      ...(unit ? { unitId: unit.id } : {}),
      from,
      to,
      reason: d.reason.trim() || "Valuer judgement.",
      sourceKind: cited ? "document" : "valuer_judgement",
      ...(cited ? { documentId: d.documentId } : {}),
    };
    const key = changeKey(change.parameter, change.unitId);
    if (byKey.delete(key)) dropped = true;
    if (Math.abs(to - from) < EPS) {
      unchanged = change;
      dropped = true;
      continue;
    }
    byKey.set(key, change);
  }
  const changes = [...byKey.values()];
  if (changes.length === 0) {
    return { ok: false, question: unchanged ? alreadyQuestion(unchanged, ctx) : DEFAULT_CLARIFYING_QUESTION };
  }
  return { ok: true, changes, dropped };
}

/**
 * The plain-English explanation of checked changes: for one change, what changed (from → to), what stays and which
 * way the value moves; for several, the list. A range the valuer gave is cited as valuer judgement.
 */
export function explainChanges(changes: ParamChange[], ctx: RevalueContext, ranges: ValuerRange[]): string {
  const sentences =
    changes.length === 1
      ? singleChange(changes[0], ctx)
      : [
          `I changed ${listJoin(
            changes.map((c) => changePhrase(c, ctx)),
            "and",
          )} as you asked.`,
          "All other inputs are unchanged.",
        ];
  const range = valuerRangeSentence(changes, ranges);
  return [...sentences, ...(range ? [range.sentence] : [])].join(" ");
}

/** `explanation`, with the sentence on the valuer's range added when it does not mention the range already. */
export function withValuerRange(explanation: string, changes: ParamChange[], ranges: ValuerRange[]): string {
  const range = valuerRangeSentence(changes, ranges);
  if (!range) return explanation;
  const mentioned = range.ends.every((e) => explanation.includes(e) || explanation.includes(e.replace(".", ",")));
  return mentioned ? explanation : `${explanation} ${range.sentence}`;
}

/** The value of a parameter in the version the context describes. */
export function currentValue(ctx: RevalueContext, parameter: ParamKey, unitId?: string): number {
  switch (parameter) {
    case "capRate":
      return ctx.params.capRate;
    case "marketRentAvg":
      return round2(ctx.baseAvgRent * ctx.params.marketRentFactor);
    case "marketRentUnit":
      return ctx.units.find((u) => u.id === unitId)?.marketRentPerM2 ?? Number.NaN;
    case "underRentYears":
      return ctx.params.underRentYears;
    case "easementDeduction":
      return ctx.params.easementDeduction;
    case "remainingLifeYears":
      return ctx.params.remainingLifeYears;
  }
}

/** A value in the engine's units and precision; a cap rate above 1 is a percentage given by mistake. */
export function engineValue(parameter: ParamKey, value: number): number {
  switch (parameter) {
    case "capRate": {
      const fraction = value > 1 ? value / 100 : value;
      return Math.round(fraction * 1e6) / 1e6;
    }
    case "marketRentAvg":
    case "marketRentUnit":
      return round2(value);
    case "underRentYears":
    case "remainingLifeYears":
      return Math.round(value * 100) / 100;
    case "easementDeduction":
      return Math.round(value);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading a note

const EPS = 1e-9;

const QUESTION_START =
  /^[\s"'„“‚‘(]*(?:why|what|how|which|warum|wieso|weshalb|explain|erkläre|erklär|erklären)(?![\p{L}\p{N}])/iu;
const QUESTION_END = /\?[\s"'“”‘’)]*$/u;

/** A parameter or unit the note names, with the stretch of the note its value may come from. */
interface Target {
  start: number;
  end: number;
  parameter: ParamKey;
  /** For marketRentUnit: the units the reference fits (one: definite; none: unknown; several: ambiguous). */
  unitIds: string[];
  /** The note's words for it, for the questions. */
  ref: string;
  /** A bare rent word ("rent", "Miete"), which a unit in the same clause takes over. */
  generic: boolean;
  /** A rent word that says "market" (market rent, Marktmiete). */
  market: boolean;
}

interface Resolved {
  parameter: ParamKey;
  unitId?: string;
  to: number;
  at: number;
}

/** Reads what a note asks for. Every outcome carries the valuer's ranges, for the explanation. */
export function readNote(note: string, ctx: RevalueContext): NoteReading {
  const text = normalise(note);
  if (!text.trim()) return { kind: "unclear", question: DEFAULT_CLARIFYING_QUESTION, ranges: [] };
  if (isQuestion(text)) return { kind: "question", ranges: [] };

  // 1. Find, in this order, what the note names. Each find masks its words, so later ones skip them.
  const scan = new NoteScan(text);
  for (const pattern of NOISE) scan.take(pattern);
  scan.take(DOCUMENT_NAMES);
  scan.take(RENT_TERMS);
  const facts = FACTS.flatMap(({ kind, pattern }) => scan.take(pattern).map((m) => ({ kind, start: m.index })));
  let named = KEYWORDS.flatMap(({ parameter, pattern, generic }) =>
    scan.take(pattern).map(
      (m): Target => ({
        start: m.index,
        end: m.index + m[0].length,
        parameter,
        unitIds: [],
        ref: m[0],
        generic: !!generic,
        market: !generic || MARKET_WORD.test(m[0]),
      }),
    ),
  );
  // A unit named for comparison ("vs unit 4", "like the attic") is no target.
  let units = findUnits(scan, ctx).filter((u) => !COMPARISON.test(text.slice(0, u.start)));
  const ranges = findRanges(scan, text);
  const numbers = findNumbers(scan, text);

  // Clause breaks are read from the masked text, where "1. OG" or "9.50" no longer look like a sentence end.
  const segments = segmentStarts(scan.rest);
  const segmentOf = (pos: number) => segmentIndex(segments, pos);
  const clauseOf = (pos: number) => segmentText(text, segments, segmentOf(pos));

  // An in-place rent is a sourced fact: without an explicit market rent, the note's units and rents mean that fact.
  if (facts.some((f) => f.kind === "inPlaceRent") && !named.some((t) => t.parameter === "marketRentAvg" && t.market)) {
    units = [];
    named = named.filter((t) => t.parameter !== "marketRentAvg");
  }
  // A bare rent word in the same clause as a unit names that unit's rent ("attic rent 9,50").
  named = named.filter((t) => !(t.generic && units.some((u) => segmentOf(u.start) === segmentOf(t.start))));
  // "Unit 4 was re-let at 9.40": a clause that reports what was, and asks for nothing, is evidence, not a target.
  const evidence = (t: Target) => PAST_WORD.test(clauseOf(t.start)) && !REQUEST_WORD.test(clauseOf(t.start));
  const targets = [...named, ...units].filter((t) => !evidence(t)).sort((a, b) => a.start - b.start);
  const windowOf = (i: number): [number, number] => [
    i > 0 ? targets[i - 1].end : 0,
    i + 1 < targets.length ? targets[i + 1].start : text.length,
  ];

  // 2. Each named parameter takes its number.
  const resolved: Resolved[] = [];
  const problems: { at: number; question: string }[] = [];
  const valueless = new Set<number>();

  targets.forEach((t, i) => {
    // "the market rent is fine", "keep the attic": a parameter the note keeps takes no value and asks for none.
    if (KEEP_WORD.test(clauseOf(t.start))) return;
    const [lo, hi] = windowOf(i);
    const unitId = t.unitIds.length === 1 ? t.unitIds[0] : undefined;
    const label = unitLabel(ctx, unitId) ?? t.ref;
    // The value may follow in a later clause ("the attic looks overpriced, use 9,50"); before the name, only its own
    // clause counts, so a number that belongs to an earlier phrase is not taken.
    const choice = choose(
      numbers.filter((n) => n.start >= t.end && n.start < hi),
      numbers.filter((n) => n.start >= lo && n.end <= t.start && segmentOf(n.start) === segmentOf(t.start)),
      t.parameter,
      currentValue(ctx, t.parameter, unitId),
      label,
    );
    if (!choice) {
      valueless.add(i);
    } else if ("ambiguous" in choice) {
      for (const c of choice.ambiguous) c.token.used = true;
      problems.push({ at: t.start, question: ambiguousValueQuestion(t.parameter, label, choice.ambiguous) });
    } else {
      choice.pick.token.used = true;
      if (t.parameter === "marketRentUnit" && !unitId) {
        problems.push({ at: t.start, question: unitQuestion(t, ctx) });
      } else if ("question" in choice.pick.valued) {
        problems.push({ at: t.start, question: choice.pick.valued.question });
      } else {
        resolved.push({ parameter: t.parameter, unitId, to: choice.pick.valued.to, at: t.start });
      }
    }
  });

  // Units listed together share the value given after the last of them: "GF left and GF right 9.00".
  for (let i = targets.length - 2; i >= 0; i--) {
    const t = targets[i];
    const next = targets[i + 1];
    const shared = resolved.find((r) => r.at === next.start && r.parameter === "marketRentUnit");
    if (!valueless.has(i) || t.parameter !== "marketRentUnit" || t.unitIds.length !== 1 || !shared) continue;
    if (!LIST_JOINER.test(text.slice(t.end, next.start))) continue;
    resolved.push({ parameter: "marketRentUnit", unitId: t.unitIds[0], to: shared.to, at: t.start });
    valueless.delete(i);
  }

  // A parameter named without a value: only a range given, a sourced fact meant, or a request that lacks the value.
  // A parameter merely mentioned ("the market rent is fine") is left alone.
  for (const i of valueless) {
    const t = targets[i];
    const unitKey = changeKey(t.parameter, t.unitIds.length === 1 ? t.unitIds[0] : undefined);
    if (resolved.some((r) => changeKey(r.parameter, r.unitId) === unitKey)) continue; // named again, with its value
    const [lo, hi] = windowOf(i);
    const label = unitLabel(ctx, t.unitIds.length === 1 ? t.unitIds[0] : undefined) ?? t.ref;
    const range = ranges.find((r) => rangeFits(r, t.parameter) && r.start >= lo && r.start < hi);
    const clause = clauseOf(t.start);
    const factNearby =
      facts.some((f) => segmentOf(f.start) === segmentOf(t.start)) ||
      numbers.some((n) => n.kind === "area" && segmentOf(n.start) === segmentOf(t.start));
    if (range) {
      problems.push({ at: t.start, question: rangeOnlyQuestion(t.parameter, label, range) });
    } else if (factNearby) {
      problems.push({ at: t.start, question: SOURCED_FACTS });
    } else if (REQUEST_WORD.test(clause) && !KEEP_WORD.test(clause)) {
      problems.push({
        at: t.start,
        question:
          t.parameter === "marketRentUnit" && t.unitIds.length !== 1
            ? unitQuestion(t, ctx)
            : missingValueQuestion(t.parameter, label),
      });
    }
  }

  // 3. Numbers no named parameter took go to the focused flag's parameter or, by their unit, to the only parameter
  // they fit. Once a named parameter has its value, only numbers with a unit are read this way. A number in the same
  // clause as a sourced fact belongs to that fact.
  const flag = flagTarget(ctx);
  const leftovers = numbers.filter(
    (n) => !n.used && n.role !== "from" && IMPLIABLE.has(n.kind) && (resolved.length === 0 || n.kind !== "plain"),
  );
  if (resolved.length === 0 && problems.length === 0) {
    const factNumber = leftovers.some((n) => facts.some((f) => segmentOf(f.start) === segmentOf(n.start)));
    if (flag === "fact" || factNumber) return { kind: "unclear", question: SOURCED_FACTS, ranges };
  }
  const implied = new Map<string, { parameter: ParamKey; unitId?: string; tokens: NumToken[] }>();
  for (const leftover of leftovers) {
    if (facts.some((f) => segmentOf(f.start) === segmentOf(leftover.start))) continue;
    // A number is read without a parameter name only when it speaks for itself: a relative change, a number in the
    // focused flag's own unit, a number marked as the new value ("use 3.4 %"), or a note that is little more than
    // the number. "Mietausfallwagnis 2 %" stays unread rather than becoming a cap rate.
    const flagUnit = flag !== null && flag !== "fact" && isOwnKind(leftover.kind, flag.parameter);
    if (leftover.delta === null && !flagUnit && leftover.role !== "target" && !standsAlone(text, leftover)) continue;
    // A bare number inside a range the note states takes the range's unit: "the range is 3.25 to 3.75 %, use 3.4".
    const inRange =
      leftover.kind === "plain" ? ranges.find((r) => withinRange(r, decimalValue(leftover.raw))) : undefined;
    const n = inRange ? { ...leftover, kind: inRange.kind } : leftover;
    const target = impliedTarget(n, flag === "fact" ? null : flag);
    if (!target) continue;
    if ("question" in target) {
      problems.push({ at: n.start, question: target.question });
      continue;
    }
    const key = changeKey(target.parameter, target.unitId);
    const group = implied.get(key) ?? { ...target, tokens: [] };
    group.tokens.push(n);
    implied.set(key, group);
  }
  for (const { parameter, unitId, tokens } of implied.values()) {
    const label = unitLabel(ctx, unitId) ?? "the unit";
    const choice = choose(tokens, [], parameter, currentValue(ctx, parameter, unitId), label);
    if (!choice) continue;
    const at = tokens[0].start;
    if ("ambiguous" in choice) {
      problems.push({ at, question: ambiguousValueQuestion(parameter, label, choice.ambiguous) });
    } else if ("question" in choice.pick.valued) {
      problems.push({ at, question: choice.pick.valued.question });
    } else {
      resolved.push({ parameter, unitId, to: choice.pick.valued.to, at: choice.pick.token.start });
    }
  }

  // 4. The same parameter named twice must get the same value.
  const merged = new Map<string, Resolved>();
  for (const r of [...resolved].sort((a, b) => a.at - b.at)) {
    const key = changeKey(r.parameter, r.unitId);
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, r);
    } else if (Math.abs(seen.to - r.to) > EPS) {
      const values = [seen.to, r.to].map((v) => formatParamValue(r.parameter, engineValue(r.parameter, v)));
      const name = paramName(r.parameter, unitLabel(ctx, r.unitId));
      problems.push({ at: r.at, question: `Which value should I use for ${name}: ${listJoin(values, "or")}?` });
    }
  }

  if (problems.length > 0) {
    problems.sort((a, b) => a.at - b.at);
    return { kind: "unclear", question: problems[0].question, ranges };
  }
  if (merged.size === 0) {
    const flagRange = flag && flag !== "fact" ? ranges.find((r) => rangeFits(r, flag.parameter)) : undefined;
    if (flag && flag !== "fact" && flagRange) {
      const label = unitLabel(ctx, flag.unitId) ?? "the unit";
      return { kind: "unclear", question: rangeOnlyQuestion(flag.parameter, label, flagRange), ranges };
    }
    return { kind: "unclear", question: facts.length > 0 ? SOURCED_FACTS : DEFAULT_CLARIFYING_QUESTION, ranges };
  }
  return {
    kind: "changes",
    changes: [...merged.values()].map(({ parameter, unitId, to }) => ({
      parameter,
      ...(unitId ? { unitId } : {}),
      to,
    })),
    ranges,
  };
}

/** The note is just this number, give or take a word: "3,4", "8 years", "eher 3,5 %". */
function standsAlone(text: string, n: NumToken): boolean {
  const rest = `${text.slice(0, n.start)} ${text.slice(n.end)}`;
  const others = (rest.match(/\p{L}+/gu) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => !FILLERS.has(w) && !TARGET_WORDS.has(w));
  return others.length <= 1 && !/\d/.test(rest);
}

// ---------------------------------------------------------------------------------------------------------------------
// Scanning: each kind of word is found once and masked, so later patterns (and the numbers) skip it.

const W = "\\p{L}\\p{N}";
const START = `(?<![${W}])`;
const END = `(?![${W}])`;

/** Whole words, case-insensitive. */
function words(alternatives: string): RegExp {
  return new RegExp(`${START}(?:${alternatives})${END}`, "giu");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Same-length replacements only, so positions in the scan and in the note agree. */
function normalise(note: string): string {
  return note.replace(/[\u00A0\u2007\u2009\u202F]/g, " ").replace(/[\u2010\u2011]/g, "-");
}

type Match = RegExpExecArray & { index: number };

class NoteScan {
  private masked: string;

  constructor(text: string) {
    this.masked = text;
  }

  /** The text with everything taken so far blanked out. */
  get rest(): string {
    return this.masked;
  }

  /** Every match of the global `pattern` in the text not taken yet that `keep` accepts; those matches are taken. */
  take(pattern: RegExp, keep: (m: Match) => boolean = () => true): Match[] {
    const found = [...this.masked.matchAll(pattern)].map((m) => m as Match).filter(keep);
    for (const m of found) {
      this.masked = this.masked.slice(0, m.index) + " ".repeat(m[0].length) + this.masked.slice(m.index + m[0].length);
    }
    return found;
  }
}

/** Numbers that are no values: dates, statutes, parcels, postcodes, times. */
const NOISE: RegExp[] = [
  /(?<![\d.,])\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})(?![\d.,])/gu,
  /§{1,2}\s*\d+[a-z]?/giu,
  /(?<![\d.,])\d+\/\d+(?![\d.,])/gu,
  /(?<![\d.,])0\d{4}(?![\d.,])/gu,
  /(?<![\d.,])\d{1,2}:\d{2}(?![\d.,])/gu,
];

/** Document names, which mention rents and areas without being about them ("rent roll"). */
const DOCUMENT_NAMES = words(
  "rent\\s+roll|tenant\\s+list|mieterliste|mietaufstellung|mieterspiegel|land\\s+register|(?:wohnungs)?grundbuch(?:auszug)?|energy\\s+certificate|energieausweis|refurbishment\\s+(?:sheet|list)|(?:sanierungs|modernisierungs)(?:übersicht|uebersicht)|zoning\\s+plan|b-plan|bebauungsplan|(?:grundstücks)?marktbericht|market\\s+report",
);

/** Rent law and rent statistics, which mention rents without being the market rent ("rent increase", "Mietspiegel"). */
const RENT_TERMS = words(
  "rent\\s+(?:increases?|reviews?|index(?:es)?|indices|caps?|control|brakes?)|mieterhöhung(?:en)?|mietsteigerung(?:en)?|mietspiegel|mietpreisbremse|kappungsgrenze",
);

type FactKind = "inPlaceRent" | "landValue" | "area";

/** Sourced facts a note cannot change (spec §6.2): in-place rents, the land value, areas. */
const FACTS: { kind: FactKind; pattern: RegExp }[] = [
  {
    kind: "inPlaceRent",
    pattern: words(
      "in[-\\s]?place\\s+rents?|(?:current|actual|contract(?:ual)?|passing|existing|paid|sitting)\\s+rents?|rents?\\s+paid|ist[-\\s]?mieten?|bestandsmieten?|vertragsmieten?|(?:netto)?kaltmieten?|vereinbarte\\s+mieten?|tatsächliche\\s+mieten?",
    ),
  },
  { kind: "landValue", pattern: words("land[-\\s]?values?|bodenrichtwert(?:e|es)?|bodenwert(?:e|es)?|brw|boris") },
  {
    kind: "area",
    pattern: words(
      "(?:living|floor|usable|plot|unit|site)\\s+(?:area|size)s?|plot|wohnfläche|wohnflächen|nutzfläche|grundstücksfläche|grundstücksgröße|grundstück|fläche|flächen",
    ),
  },
];

const MARKET_WORD = /market|markt|vergleich|ortsüblich/iu;

/** The parameters by name; earlier patterns win ("under-rent" before "rent"). */
const KEYWORDS: { parameter: Exclude<ParamKey, "marketRentUnit">; pattern: RegExp; generic?: boolean }[] = [
  {
    parameter: "underRentYears",
    pattern: words("(?:under|over)[-\\s]?rent(?:ed|ing|s)?|rent\\s+gap|mindermiete|minderertrag|mehrertrag|mietdifferenz"),
  },
  {
    parameter: "remainingLifeYears",
    pattern: words("remaining\\s+(?:economic\\s+|useful\\s+)?life|rest[-\\s]?nutzungsdauer|rnd"),
  },
  {
    parameter: "capRate",
    pattern: words("cap(?:itali[sz]ation)?[-\\s]?rates?|liegenschaftszins(?:satz|es|en)?|lz"),
  },
  {
    parameter: "easementDeduction",
    pattern: words(
      "easements?|leitungsrecht(?:e|es)?|(?:grund)?dienstbarkeit(?:en)?|wegerecht(?:e|es)?|servitudes?|utility\\s+(?:line|easement)s?|right\\s+of\\s+way|(?:abteilung|abt\\.|section)\\s+ii",
    ),
  },
  {
    parameter: "marketRentAvg",
    pattern: words("(?:average|avg\\.?|mean)\\s+(?:market\\s+)?rents?|durchschnitts?mieten?|building\\s+average"),
  },
  {
    parameter: "marketRentAvg",
    generic: true,
    pattern: words("market\\s+rents?|marktmieten?|vergleichsmieten?|ortsübliche\\s+(?:vergleichs)?mieten?|rents?|mieten?"),
  },
];

type FloorKey = "GF" | "1F" | "2F" | "3F" | "4F" | "attic";
type Side = "left" | "right" | "middle";

const FLOORS: [FloorKey, string][] = [
  ["GF", "ground[-\\s]*floor|gf|eg|erdgeschoss|parterre|hochparterre"],
  ["1F", "1f|1\\.?\\s*og|1st\\s+floor|first\\s+floor|1\\.?\\s*obergeschoss|erstes\\s+obergeschoss|1\\.?\\s*stock"],
  ["2F", "2f|2\\.?\\s*og|2nd\\s+floor|second\\s+floor|2\\.?\\s*obergeschoss|zweites\\s+obergeschoss|2\\.?\\s*stock"],
  ["3F", "3f|3\\.?\\s*og|3rd\\s+floor|third\\s+floor|3\\.?\\s*obergeschoss|drittes\\s+obergeschoss|3\\.?\\s*stock"],
  [
    "4F",
    "[4-9]f|[4-9]\\.?\\s*og|[4-9]th\\s+floor|fourth\\s+floor|fifth\\s+floor|[4-9]\\.?\\s*obergeschoss|viertes\\s+obergeschoss|[4-9]\\.?\\s*stock",
  ],
  ["attic", "attic|dg|dachgeschoss(?:wohnung)?|dachgeschoß|loft|mansarde|dachwohnung|top[-\\s]+floor"],
];
const SIDES: [Side, string][] = [
  ["left", "left|links|linke[rsnm]?"],
  ["right", "right|rechts|rechte[rsnm]?"],
  ["middle", "middle|mitte|mittlere[rsnm]?|centre|center|central"],
];
const FLOOR_ALT = FLOORS.map(([, s]) => s).join("|");
const SIDE_ALT = SIDES.map(([, s]) => s).join("|");
const FLOOR_PHRASE = new RegExp(
  `${START}(?:(${SIDE_ALT})[\\s-]{1,3})?(${FLOOR_ALT})(?:[\\s,-]{1,3}(${SIDE_ALT}))?${END}`,
  "giu",
);
const FLOOR_TESTS = FLOORS.map(([key, s]) => [key, new RegExp(`^(?:${s})$`, "iu")] as const);
const SIDE_TESTS = SIDES.map(([key, s]) => [key, new RegExp(`^(?:${s})$`, "iu")] as const);

/** Words before a unit that make it a point of comparison rather than the unit to change. */
const COMPARISON = new RegExp(
  `${START}(?:vs\\.?|versus|like|than|against|compared\\s+(?:to|with)|in\\s+line\\s+with|relative\\s+to|wie|als|gegenüber|verglichen\\s+mit|im\\s+vergleich\\s+zu|analog\\s+zu)\\s+(?:(?:the|that\\s+of|der|die|das|dem|den)\\s+)?$`,
  "iu",
);

/** "unit 8", "apartment 5", "WE 8", "Wohnung Nr. 3": the n-th unit of the tenant list. */
const UNIT_NUMBER = new RegExp(
  `${START}(?:units?|apartments?|apts?\\.?|flats?|we|wohnung(?:en)?|whg\\.?|wohneinheit(?:en)?|einheit(?:en)?)\\s*(?:no\\.?|nr\\.?|#)?\\s*(\\d{1,3})(?![\\d.,]\\d)${END}(?!\\s*(?:%|bps?|years?|yrs?|jahre?n?|months?|monate?n?|m²|m2|qm|€|eur|k${END}))`,
  "giu",
);
/** Unit ids as the context writes them: "u8", "m1". */
const UNIT_ID = new RegExp(`(?<![${W}/€.,])(?<!\\d\\s)(u\\d{1,3}|m\\d{1,2})${END}`, "giu");

function floorOf(text: string | undefined): FloorKey | null {
  const t = text?.trim();
  return (t && FLOOR_TESTS.find(([, re]) => re.test(t))?.[0]) || null;
}

function sideOf(text: string | undefined): Side | null {
  const t = text?.trim();
  return (t && SIDE_TESTS.find(([, re]) => re.test(t))?.[0]) || null;
}

/** The floor and side a unit's label names ("GF left", "EG links", "Attic"), if any. */
function placeOf(label: string): { floor: FloorKey | null; side: Side | null } {
  const m = new RegExp(FLOOR_PHRASE.source, "iu").exec(label);
  return m ? { floor: floorOf(m[2]), side: sideOf(m[1] ?? m[3]) } : { floor: null, side: null };
}

function findUnits(scan: NoteScan, ctx: RevalueContext): Target[] {
  const targets: Target[] = [];
  const add = (m: Match, unitIds: string[]) =>
    targets.push({
      start: m.index,
      end: m.index + m[0].length,
      parameter: "marketRentUnit",
      unitIds,
      ref: m[0].trim(),
      generic: false,
      market: false,
    });

  // 1. Labels, the longest first; a label several units share is ambiguous.
  const byLabel = new Map<string, string[]>();
  for (const u of ctx.units) {
    const key = u.label.trim().toLowerCase().replace(/\s+/g, " ");
    if (key) byLabel.set(key, [...(byLabel.get(key) ?? []), u.id]);
  }
  for (const [label, ids] of [...byLabel].sort((a, b) => b[0].length - a[0].length)) {
    const pattern = new RegExp(`${START}${escapeRegExp(label).replace(/ /g, "[\\s-]*")}${END}`, "giu");
    for (const m of scan.take(pattern)) add(m, ids);
  }
  // 2. Ids and numbers.
  for (const m of scan.take(UNIT_ID, (m) => ctx.units.some((u) => u.id === m[1].toLowerCase()))) {
    add(m, [m[1].toLowerCase()]);
  }
  for (const m of scan.take(UNIT_NUMBER)) {
    const n = Number(m[1]);
    const unit = ctx.units.find((u) => u.id === `u${n}`) ?? (n >= 1 ? ctx.units[n - 1] : undefined);
    add(m, unit ? [unit.id] : []);
  }
  // 3. Floor and side. A side still finds the only unit on its floor when that unit's label names no side ("attic
  // left" → Attic), never one whose label names the other side ("3F right" is not "3F left").
  const places = ctx.units.map((u) => ({ id: u.id, ...placeOf(u.label) }));
  for (const m of scan.take(FLOOR_PHRASE)) {
    const floor = floorOf(m[2]);
    const side = sideOf(m[1] ?? m[3]);
    const onFloor = places.filter((p) => p.floor === floor);
    let fits = side ? onFloor.filter((p) => p.side === side) : onFloor;
    if (side && fits.length === 0 && onFloor.length === 1 && onFloor[0].side === null) fits = onFloor;
    add(
      m,
      fits.map((p) => p.id),
    );
  }
  return targets;
}

/**
 * Digits with an optional decimal or grouping separator ("9,50", "12.000"), or thousands grouped by spaces ("15 000",
 * the narrow spaces of German typography read as spaces by `normalise`). `decimalValue` drops the spaces.
 */
const SPACE_GROUPED = "\\d{1,3}(?: \\d{3})+(?!\\d)(?:[.,]\\d+)?";
const NUM = `${SPACE_GROUPED}|\\d+(?:[.,]\\d+)?`;
const RANGE_UNIT =
  "%|prozent|percent|bps?|(?:€|eur)?\\s*\\/\\s*(?:m²|m2|qm)|years?|yrs?|jahren?|jahre|k€|t€|teur|k|€|eur";
const DASH_RANGE = new RegExp(
  `(?<![${W}.,])(${NUM})\\s*(${RANGE_UNIT})?\\s*[–—‒-]\\s*(${NUM})\\s*(${RANGE_UNIT})?(?![${W}])`,
  "giu",
);
const BETWEEN_RANGE = new RegExp(
  `${START}(?:between|zwischen)\\s+(${NUM})\\s*(${RANGE_UNIT})?\\s+(?:and|und)\\s+(${NUM})\\s*(${RANGE_UNIT})?(?![${W}])`,
  "giu",
);
const TO_RANGE = new RegExp(
  `(?<![${W}.,])(${NUM})\\s*(${RANGE_UNIT})?\\s+(?:to|bis)\\s+(${NUM})\\s*(${RANGE_UNIT})?(?![${W}])`,
  "giu",
);
/** Words that make "x to y" a change from x to y rather than a range. */
const CHANGE_WORDS = new Set([
  "from",
  "von",
  "change",
  "changes",
  "move",
  "go",
  "raise",
  "lower",
  "reduce",
  "increase",
  "ändern",
  "ändere",
  "erhöhen",
  "senken",
]);

function toRange(m: Match): ValuerRange | null {
  const unit = (m[4] ?? m[2] ?? "").toLowerCase().replace(/\s+/g, "");
  const kind: NumKind = /%|prozent|percent/.test(unit)
    ? "percent"
    : /^bps?$/.test(unit)
      ? "bp"
      : unit.includes("/")
        ? "rent"
        : /^(?:years?|yrs?|jahren?|jahre)$/.test(unit)
          ? "years"
          : unit
            ? "amount"
            : "plain";
  const multiplier = /^(?:k|k€|t€|teur)$/.test(unit) ? 1000 : 1;
  const value = (raw: string) => (kind === "amount" ? amountValue(raw, multiplier) : decimalValue(raw));
  const [low, high] = [value(m[1]), value(m[3])].sort((a, b) => a - b);
  return low < high ? { kind, low, high, start: m.index } : null;
}

function findRanges(scan: NoteScan, text: string): ValuerRange[] {
  const isChange = (m: Match) => lastWords(text, m.index, 4).some((w) => CHANGE_WORDS.has(w));
  return [
    ...scan.take(DASH_RANGE, (m) => toRange(m) !== null),
    ...scan.take(BETWEEN_RANGE, (m) => toRange(m) !== null),
    ...scan.take(TO_RANGE, (m) => toRange(m) !== null && !isChange(m)),
  ]
    .map((m) => toRange(m)!)
    .sort((a, b) => a.start - b.start);
}

/** A percentage or rent range the value lies in. */
function withinRange(r: ValuerRange, v: number): boolean {
  return (r.kind === "percent" || r.kind === "rent") && v >= r.low - EPS && v <= r.high + EPS;
}

function rangeFits(r: ValuerRange, parameter: ParamKey): boolean {
  switch (parameter) {
    case "capRate":
      return r.kind === "percent" || r.kind === "bp" || (r.kind === "plain" && r.low >= 0.5 && r.high <= 20);
    case "marketRentAvg":
    case "marketRentUnit":
      return r.kind === "rent" || ((r.kind === "plain" || r.kind === "amount") && r.high <= 100);
    case "underRentYears":
    case "remainingLifeYears":
      return r.kind === "years" || (r.kind === "plain" && r.high <= 100);
    case "easementDeduction":
      return r.kind === "amount" || (r.kind === "plain" && r.low >= 100);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Numbers

interface NumToken {
  start: number;
  /** End of the number and its unit. */
  end: number;
  raw: string;
  kind: NumKind;
  multiplier: number;
  role: "from" | "target" | "neutral";
  /**
   * null for an absolute value; else a change of the current value ("unknown": "by x" without a verb; "other": measured
   * against something else, "5 % above leases").
   */
  delta: "up" | "down" | "unknown" | "other" | null;
  /** The change was given as "by x" ("um x") in a clause about the value ("reduces the value by €10,000"). */
  byValue: boolean;
  used: boolean;
}

const NUMBER = new RegExp(`(?<![${W}.,])([+−-]?)(${SPACE_GROUPED}|\\d+(?:[.,]\\d+)*)`, "gu");

const SUFFIXES: { kind: NumKind; pattern: RegExp; multiplier?: number }[] = [
  {
    kind: "rent",
    pattern:
      /^\s*(?:€|eur(?:o)?)?\s*(?:\/|per|pro|je)\s*(?:m²|m2|qm|sqm|square\s+met(?:er|re)s?|quadratmeter)(?![\p{L}\p{N}])/iu,
  },
  { kind: "percent", pattern: /^\s*(?:%|prozent|percent|per\s*cent|pct)(?![\p{L}\p{N}])/iu },
  { kind: "bp", pattern: /^\s*(?:bps?|basis\s*points?|basispunkte?)(?![\p{L}\p{N}])/iu },
  {
    kind: "amount",
    multiplier: 1e6,
    pattern: /^\s*(?:mio\.?|millionen|million)(?:\s*(?:€|eur(?:o)?))?(?![\p{L}\p{N}])/iu,
  },
  {
    kind: "amount",
    multiplier: 1000,
    pattern: /^\s*(?:k€|keur|k|t€|teur|tsd\.?|tausend|thousand)(?:\s*(?:€|eur(?:o)?))?(?![\p{L}\p{N}])/iu,
  },
  { kind: "amount", pattern: /^\s*(?:€|eur(?:o)?)(?![\p{L}\p{N}])/iu },
  { kind: "years", pattern: /^\s*(?:years?|yrs?|jahren?|jahre|jahr|j\.)(?![\p{L}\p{N}])/iu },
  { kind: "months", pattern: /^\s*(?:months?|monaten?|monate|monat|mon\.|mo\.)(?![\p{L}\p{N}])/iu },
  { kind: "area", pattern: /^\s*(?:m²|m2|qm|sqm|square\s+met(?:er|re)s?|quadratmeter)(?![\p{L}\p{N}])/iu },
  {
    kind: "count",
    pattern:
      /^\s*(?:rooms?|zimmer|zi\.|points?|punkte?|units?|einheiten|wohnungen|apartments?|flats?|listings?|comparables?|times|mal|x|×)(?![\p{L}\p{N}])/iu,
  },
  // Ordinals and other letters right after the digits ("2nd", "8a").
  { kind: "count", pattern: /^\p{L}+/u },
];

const FILLERS = new Set([
  "the",
  "a",
  "an",
  "it",
  "its",
  "this",
  "that",
  "about",
  "approx",
  "approximately",
  "around",
  "roughly",
  "circa",
  "ca",
  "rund",
  "etwa",
  "only",
  "just",
  "nur",
  "exactly",
  "genau",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einen",
  "einem",
  "einer",
  "maybe",
  "perhaps",
  "vielleicht",
  "eur",
  "euro",
]);
const FROM_WORDS = new Set([
  "from",
  "von",
  "not",
  "nicht",
  "statt",
  "anstatt",
  "anstelle",
  "currently",
  "current",
  "aktuell",
  "derzeit",
  "bisher",
  "bislang",
  "was",
  "war",
  "old",
  "alt",
  "alten",
  "previously",
  "vorher",
]);
const FROM_PAIRS = new Set(["instead of", "rather than", "anstelle von"]);
const TARGET_WORDS = new Set([
  "use",
  "to",
  "auf",
  "set",
  "be",
  "assume",
  "take",
  "make",
  "with",
  "mit",
  "nimm",
  "nehme",
  "nehmen",
  "setze",
  "setzen",
  "verwende",
  "verwenden",
  "ansetzen",
  "annehmen",
  "→",
  "->",
]);
const UP_BEFORE = new Set(["up", "plus", "rauf"]);
const DOWN_BEFORE = new Set(["down", "minus", "runter"]);
const UP_AFTER = /^\s*(higher|more|up|above|longer|höher|mehr|länger|darüber|rauf)(?![\p{L}\p{N}])/iu;
const DOWN_AFTER =
  /^\s*(lower|less|down|below|shorter|cheaper|niedriger|weniger|kürzer|tiefer|darunter|runter|günstiger)(?![\p{L}\p{N}])/iu;
/** What a comparative is measured against: "higher than leases", "above the 2F units", "below 1F right". */
const THAN_OBJECT = /^\s+(?:than|als)\s+(?:(?:the|der|die|das|dem|den)\s+)?([\p{L}\p{N}]+)/iu;
const ABOVE_OBJECT = /^\s+(?:(?:the|der|die|das|dem|den)\s+)?([\p{L}\p{N}]+)/iu;
/** Objects that are this value itself ("5 % lower than estimated", "5 % below the estimate"). */
const CURRENT_VALUE_WORD =
  /^(?:now|today|before|current|currently|estimate|estimates|estimated|suggested|proposed|assumed|it|that|this|ai|jetzt|heute|bisher|aktuell|derzeit|geschätzt|angesetzt|vorgeschlagen)$/iu;
/** Words after "above"/"below" that start the next phrase rather than name what it is measured against. */
const NOT_AN_OBJECT =
  /^(?:and|und|or|oder|but|aber|so|then|dann|please|bitte|for|für|as|wie|in|im|on|at|bei|to|auf|with|mit)$/iu;
const UP_VERB = words(
  "raise[sd]?|raising|increase[sd]?|increasing|lift|higher|up|erhöhen|erhöhe|erhöht|anheben|hebe|hebt|steigern|steigere|steigert|heraufsetzen",
);
const DOWN_VERB = words(
  "lower(?:s|ed)?|lowering|reduce[sd]?|reducing|decrease[sd]?|decreasing|cuts?|drops?|down|senken|senke|senkt|gesenkt|reduzieren|reduziere|reduziert|kürzen|kürze|kürzt|verringern|verringere|verringert|mindern|mindert|herabsetzen|runter",
);
const VALUE_WORD = /value|wert/iu;
const FOLLOWED_BY_NEW_VALUE = /^\s*(?:→|->|to|auf|nach)\s*[+−-]?\d/iu;
const IMPLIABLE = new Set<NumKind>(["percent", "bp", "rent", "amount", "years", "months", "plain"]);

function findNumbers(scan: NoteScan, text: string): NumToken[] {
  const matches = scan.take(NUMBER);
  // Names, units, ranges and numbers are blanked out here, so "unit no 8" cannot pass for a negation.
  const masked = scan.rest;
  return matches.map((m): NumToken => {
    const sign = m[1];
    const raw = m[2].replace(/ /g, "");
    const digitsEnd = m.index + m[0].length;
    const rest = text.slice(digitsEnd);
    let kind: NumKind = "plain";
    let multiplier = 1;
    let end = digitsEnd;
    for (const s of SUFFIXES) {
      const hit = s.pattern.exec(rest);
      if (!hit) continue;
      kind = s.kind;
      multiplier = s.multiplier ?? 1;
      end = digitsEnd + hit[0].length;
      break;
    }
    if (kind === "plain" && /(?:€|eur(?:o)?)\s*$/iu.test(text.slice(0, m.index))) kind = "amount";
    if (kind === "plain" && /^\d{4}$/.test(raw) && Number(raw) >= 1900 && Number(raw) <= 2100) kind = "calendarYear";
    const delta = deltaOf(text, m.index, end, sign, kind);
    const by = ["by", "um"].includes(lastWords(text, m.index, 1)[0] ?? "");
    return {
      start: m.index,
      end,
      raw,
      kind,
      multiplier,
      role: roleOf(text, masked, m.index, end),
      delta,
      byValue: by && VALUE_WORD.test(`${lastWords(text, m.index, 8).join(" ")} ${sentenceAfter(text, end)}`),
      used: false,
    };
  });
}

/** The text of the clause before `index`: since the last ".", ";", "!", "?", ":" or "," that ends a phrase. */
function clauseBefore(text: string, index: number): string {
  const before = text.slice(0, index);
  let from = 0;
  for (const m of before.matchAll(/[.;!?:,](?=\s|$)/gu)) from = (m.index ?? 0) + 1;
  return before.slice(from);
}

/** The last `max` words before `index` in its clause, lower-case, without fillers at the end ("use about" → use). */
function lastWords(text: string, index: number, max: number): string[] {
  const ws = (clauseBefore(text, index).match(/\p{L}+|→|->|=/gu) ?? []).map((w) => w.toLowerCase());
  while (ws.length > 0 && FILLERS.has(ws[ws.length - 1])) ws.pop();
  return ws.slice(-max);
}

/** A negation earlier in the clause: "do not use 3.5 %", "the cap rate should not be 3.5 %", "keine 3,5 %". */
const NEGATION =
  /^(?:not|never|no|cannot|without|nicht|nie|niemals|kein|keine|keinen|keinem|keiner|keines|ohne|\p{L}+n['’]t)$/iu;
/** Words after which an earlier negation no longer applies: "not 3.5 % but 3.4 %", "no district figure so use 3.4 %". */
const NEGATION_ENDS =
  /^(?:but|instead|rather|so|therefore|hence|then|and|aber|sondern|stattdessen|eher|also|daher|deshalb|dann|und)$/iu;
/** A verdict on the number right after it: "3.5 % is too high", "9.20 would be wrong", "3,5 % wäre zu hoch". */
const REJECTED_AFTER =
  /^\s*(?:is|are|would\s+be|will\s+be|seems|looks|sounds|ist|wäre|sind|scheint|erscheint|wirkt|klingt)\s+(?:(?:much|far|way|clearly|definitely|still|slightly|viel|deutlich|klar|eindeutig|etwas)\s+)?(?:too\s+(?:high|low|much|little|steep|aggressive|optimistic|conservative)|zu\s+(?:hoch|niedrig|tief|viel|wenig|optimistisch|konservativ)|wrong|incorrect|unrealistic|implausible|excessive|falsch|unrealistisch|unplausibel|übertrieben|überhöht|not\s+(?:right|correct|realistic|plausible)|nicht\s+(?:richtig|korrekt|realistisch|plausibel))(?![\p{L}\p{N}])/iu;

/** Whether the note rejects the number rather than asking for it. `masked` is the note with its names blanked out. */
function rejected(text: string, masked: string, start: number, end: number): boolean {
  const words = clauseBefore(masked, start).match(/\p{L}+(?:['’]\p{L}+)*/gu) ?? [];
  for (let i = words.length - 1; i >= 0; i--) {
    if (NEGATION_ENDS.test(words[i])) break;
    if (NEGATION.test(words[i])) return true;
  }
  return REJECTED_AFTER.test(text.slice(end));
}

function roleOf(text: string, masked: string, start: number, end: number): NumToken["role"] {
  const ws = lastWords(text, start, 2);
  const last = ws[ws.length - 1] ?? "";
  if (FROM_WORDS.has(last) || FROM_PAIRS.has(ws.join(" "))) return "from";
  if (FOLLOWED_BY_NEW_VALUE.test(text.slice(end))) return "from";
  // A value the note rejects is no new value either: like an old value, it is left out.
  if (rejected(text, masked, start, end)) return "from";
  if (TARGET_WORDS.has(last)) return "target";
  return "neutral";
}

function deltaOf(text: string, start: number, end: number, sign: string, kind: NumKind): NumToken["delta"] {
  if (sign === "+") return "up";
  if (sign === "-" || sign === "−") return "down";
  const after = text.slice(end);
  const upAfter = UP_AFTER.exec(after);
  const comparative = upAfter ?? DOWN_AFTER.exec(after);
  if (comparative) {
    // "asking rents are 5 % above leases", "0.30 below 1F right": the change is measured against something else, so
    // applying it to this value would guess. "5 % lower" and "5 % lower than estimated" change this value.
    const rest = after.slice(comparative[0].length);
    const object = /^(?:above|below)$/iu.test(comparative[1])
      ? ABOVE_OBJECT.exec(rest)?.[1]
      : THAN_OBJECT.exec(rest)?.[1];
    if (object !== undefined && !CURRENT_VALUE_WORD.test(object) && !NOT_AN_OBJECT.test(object)) return "other";
    return upAfter ? "up" : "down";
  }
  const ws = lastWords(text, start, 6);
  const last = ws[ws.length - 1] ?? "";
  if (UP_BEFORE.has(last)) return "up";
  if (DOWN_BEFORE.has(last)) return "down";
  const by = last === "by" || last === "um";
  if (!by && kind !== "bp") return null;
  // "reduce the attic rent by 0,40", "raise the cap rate 40 bp", "RND um 5 Jahre kürzen": the verb says which way,
  // read before the number first and, for German word order, after it.
  for (const clause of [ws.join(" "), sentenceAfter(text, end)]) {
    const up = clause.search(UP_VERB) >= 0;
    const down = clause.search(DOWN_VERB) >= 0;
    if (up !== down) return up ? "up" : "down";
  }
  return by ? "unknown" : null;
}

/** The rest of the sentence after `index`. */
function sentenceAfter(text: string, index: number): string {
  return text.slice(index).split(/[.;!?](?=\s|$)/u)[0];
}

/**
 * "9,50" → 9.5, "1.234,5" → 1234.5, "1.234.567" → 1234567, "15 000" → 15000: a single separator is a decimal
 * separator; spaces only group thousands.
 */
function decimalValue(text: string): number {
  const raw = text.replace(/ /g, "");
  const dots = raw.split(".").length - 1;
  const commas = raw.split(",").length - 1;
  if (dots > 0 && commas > 0) {
    const decimal = raw.lastIndexOf(".") > raw.lastIndexOf(",") ? "." : ",";
    const group = decimal === "." ? "," : ".";
    return Number(raw.split(group).join("").replace(decimal, "."));
  }
  if (dots + commas === 0) return Number(raw);
  const sep = dots > 0 ? "." : ",";
  if (dots + commas > 1) return Number(raw.split(sep).join(""));
  return Number(raw.replace(sep, "."));
}

/** Euro amounts: one separator before exactly three digits groups thousands ("12.000", "12,480"); k/T€ multiply. */
function amountValue(raw: string, multiplier = 1): number {
  if (multiplier > 1) return decimalValue(raw) * multiplier;
  const grouped = /^(\d{1,3})[.,](\d{3})$/.exec(raw.replace(/ /g, ""));
  return grouped ? Number(grouped[1] + grouped[2]) : decimalValue(raw);
}

// ---------------------------------------------------------------------------------------------------------------------
// Values

type Valued = { to: number } | { question: string };
type Candidate = { token: NumToken; valued: Valued };

/** The parameter value a number gives, a question about it, or null when the number cannot belong to the parameter. */
function valueFor(t: NumToken, parameter: ParamKey, current: number, label: string): Valued | null {
  const apply = (amount: number, relative = false): Valued => {
    if (t.delta === null) return { to: amount };
    if (t.delta === "other") return { question: missingValueQuestion(parameter, label) };
    if (t.delta === "unknown" || !Number.isFinite(current)) return { question: directionQuestion(parameter, label, t) };
    const signed = t.delta === "up" ? amount : -amount;
    return { to: relative ? current * (1 + signed) : current + signed };
  };
  const v = decimalValue(t.raw);
  switch (parameter) {
    case "capRate":
      if (t.kind === "bp") {
        return t.delta === null ? { question: directionQuestion(parameter, label, t) } : apply(v / 10000);
      }
      if (t.kind === "percent") return apply(v / 100);
      if (t.kind === "plain") return apply(v < 0.2 ? v : v / 100);
      return null;
    case "marketRentAvg":
    case "marketRentUnit":
      if (t.kind === "percent") return t.delta === null ? null : apply(v / 100, true);
      if (t.kind === "rent" || t.kind === "plain") return apply(v);
      if (t.kind === "amount" && t.multiplier === 1 && v <= 100) return apply(v);
      return null;
    case "underRentYears":
    case "remainingLifeYears":
      if (t.kind === "years" || t.kind === "plain") return apply(v);
      if (t.kind === "months") return apply(v / 12);
      return null;
    case "easementDeduction": {
      if (t.kind === "percent") return { question: EASEMENT_IN_EURO };
      if (t.kind !== "amount" && t.kind !== "plain") return null;
      const amount = amountValue(t.raw, t.multiplier);
      if (t.kind === "plain" && amount < 100 && t.delta === null) return { question: smallAmountQuestion(amount) };
      // "the easement reduces the value by €10,000": by how much the value drops is the deduction itself.
      if (t.byValue && t.delta !== "up" && t.delta !== "other") return { to: amount };
      return apply(amount);
    }
  }
}

/** The unit kinds that belong to a parameter by themselves. */
function isOwnKind(kind: NumKind, parameter: ParamKey): boolean {
  switch (parameter) {
    case "capRate":
      return kind === "percent" || kind === "bp";
    case "marketRentAvg":
    case "marketRentUnit":
      return kind === "rent";
    case "underRentYears":
    case "remainingLifeYears":
      return kind === "years" || kind === "months";
    case "easementDeduction":
      return kind === "amount";
  }
}

/**
 * The number a parameter takes from the numbers after and before its name: a marked new value first (the last one),
 * then a number in the parameter's own unit, then a bare number, then anything else that fits (a relative
 * percentage). Within the first tier that has numbers, two different values are ambiguous.
 */
function choose(
  after: NumToken[],
  before: NumToken[],
  parameter: ParamKey,
  current: number,
  label: string,
): { pick: Candidate } | { ambiguous: Candidate[] } | null {
  const fit = (list: NumToken[]): Candidate[] =>
    list
      .filter((n) => !n.used && n.role !== "from")
      .flatMap((token) => {
        const valued = valueFor(token, parameter, current, label);
        return valued ? [{ token, valued }] : [];
      });
  const a = fit(after);
  const b = fit(before);
  for (const marked of [a, b].map((list) => list.filter((c) => c.token.role === "target"))) {
    if (marked.length > 0) return { pick: marked[marked.length - 1] };
  }
  const own = (c: Candidate) => isOwnKind(c.token.kind, parameter);
  const bare = (c: Candidate) => c.token.kind === "plain";
  for (const tier of [a.filter(own), b.filter(own), a.filter(bare), b.filter(bare), a, b]) {
    if (tier.length === 0) continue;
    const values = tier.map((c) => ("to" in c.valued ? c.valued.to : Number.NaN));
    if (tier.length === 1 || values.every((v) => Math.abs(v - values[0]) < EPS)) return { pick: tier[0] };
    return { ambiguous: tier };
  }
  return null;
}

type FlagTarget = { parameter: ParamKey; unitId?: string };

/** The parameter of the focused flag; "fact" for the land value, which a note cannot change. */
function flagTarget(ctx: RevalueContext): FlagTarget | "fact" | null {
  const id = ctx.flagId;
  if (!id) return null;
  if (id === "cap_rate") return { parameter: "capRate" };
  if (id === "market_rent") return { parameter: "marketRentAvg" };
  if (id === "under_rent") return { parameter: "underRentYears" };
  if (id.startsWith("easement-")) return { parameter: "easementDeduction" };
  if (id === "land_value") return "fact";
  const unit = /^(?:manual_unit|vacancy)-(.+)$/.exec(id);
  if (unit && ctx.units.some((u) => u.id === unit[1])) return { parameter: "marketRentUnit", unitId: unit[1] };
  return null;
}

const isRent = (p: ParamKey) => p === "marketRentAvg" || p === "marketRentUnit";
const isYears = (p: ParamKey) => p === "underRentYears" || p === "remainingLifeYears";

/** The parameter a number without a named parameter belongs to: the focused flag's, or the only one its unit fits. */
function impliedTarget(n: NumToken, flag: FlagTarget | null): FlagTarget | { question: string } | null {
  const v = decimalValue(n.raw);
  switch (n.kind) {
    case "percent":
      if (n.delta !== null) {
        return flag && (isRent(flag.parameter) || flag.parameter === "capRate")
          ? flag
          : { question: DEFAULT_CLARIFYING_QUESTION };
      }
      if (!flag || flag.parameter === "capRate") return { parameter: "capRate" };
      // On the easement flag a percentage is a share of something ("5 % of land value"), not a cap rate.
      if (flag.parameter === "easementDeduction") return { question: EASEMENT_IN_EURO };
      return { question: didYouMeanQuestion("capRate", `${n.raw} %`) };
    case "bp":
      if (!flag || flag.parameter === "capRate") return { parameter: "capRate" };
      return { question: didYouMeanQuestion("capRate", `${n.raw} bp`) };
    case "rent":
      if (flag && isRent(flag.parameter)) return flag;
      if (!flag) return { parameter: "marketRentAvg" };
      return { question: didYouMeanQuestion("marketRentAvg", `${n.raw} €/m²`) };
    case "years":
    case "months":
      if (flag && isYears(flag.parameter)) return flag;
      return { question: yearsWhichQuestion(n.kind === "months" ? v / 12 : v) };
    case "amount": {
      if (flag && flag.parameter === "easementDeduction") return flag;
      if (flag && isRent(flag.parameter) && n.multiplier === 1 && v <= 100) return flag;
      // "the market value should be €1,250,000": no parameter a note may change takes an amount that large.
      const amount = amountValue(n.raw, n.multiplier);
      if (amount > RANGES.easementDeduction[1]) return { question: DEFAULT_CLARIFYING_QUESTION };
      return { question: didYouMeanQuestion("easementDeduction", eur(amount)) };
    }
    case "plain":
      return flag;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Clauses: whether a parameter named without a value is a request ("the attic is overpriced") or a mention ("the
// market rent is fine").

const SEGMENT_BREAK = /[.;!?](?=\s|$)|,(?=\s)|\s(?:and|und|but|aber|while|whereas|während|also|sowie)(?=\s)/giu;
const REQUEST_WORD = new RegExp(
  `${START}(?:lower|raise|reduce|increase|decrease|cut|adjust|change|set|use|make|should|must|needs?|too|overpriced|underpriced|overvalued|undervalued|overestimated|underestimated|wrong|incorrect|instead|senken|erhöhen|reduzieren|anpassen|ändern|setzen|nimm|nehmen|sollte|soll|muss|zu\\s+(?:hoch|niedrig|teuer|günstig|billig)|falsch)${END}`,
  "iu",
);
const KEEP_WORD = new RegExp(
  `${START}(?:fine|ok|okay|keep|kept|stays?|unchanged|correct|agreed?|plausible|reasonable|bleibt|passt|korrekt|stimmt|plausibel|unverändert|beibehalten|belassen)${END}`,
  "iu",
);
/** A clause that reports what was; "(was 9.92)", which gives the old value, does not count. */
const PAST_WORD = new RegExp(
  `${START}(?:was|were|war|waren|wurde|wurden|had|hatte|hatten)${END}(?!\\s*(?:€\\s*)?[+−-]?\\d)`,
  "iu",
);
const LIST_JOINER = /^[\s,]*(?:and|und|&|\+|sowie)?[\s,]*$/iu;

function segmentStarts(text: string): number[] {
  return [0, ...[...text.matchAll(SEGMENT_BREAK)].map((m) => (m.index ?? 0) + m[0].length)];
}

function segmentIndex(starts: number[], pos: number): number {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= pos) i++;
  return i;
}

function segmentText(text: string, starts: number[], i: number): string {
  return text.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : text.length);
}

// ---------------------------------------------------------------------------------------------------------------------
// Answers, questions and explanations

/** A question is answered from the focused flag's reasoning, or from the flag it is about. */
function answerFor(text: string, ctx: RevalueContext): string {
  const flag = ctx.flags.find((f) => f.id === ctx.flagId) ?? relatedFlag(text, ctx);
  return flag ? `${flag.title}: ${flag.whyFlagged}` : GENERIC_ANSWER;
}

function relatedFlag(text: string, ctx: RevalueContext): RevalueContext["flags"][number] | undefined {
  const find = (test: (id: string) => boolean) => ctx.flags.find((f) => test(f.id));
  const says = (pattern: RegExp) => text.search(pattern) >= 0;
  const names = (parameter: ParamKey) => KEYWORDS.some((k) => k.parameter === parameter && says(k.pattern));
  if (names("underRentYears")) return find((id) => id === "under_rent");
  if (names("easementDeduction")) return find((id) => id.startsWith("easement-"));
  if (names("capRate") || text.includes("%")) return find((id) => id === "cap_rate");
  if (FACTS.some((f) => f.kind === "landValue" && says(f.pattern))) return find((id) => id === "land_value");
  if (names("marketRentAvg") || /€\s*\/\s*(?:m²|m2|qm)/iu.test(text)) return find((id) => id === "market_rent");
  return undefined;
}

function reasonFrom(note: string): string {
  const text = normalise(note).replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 299)}…` : text;
}

function changeKey(parameter: ParamKey, unitId?: string): string {
  return parameter === "marketRentUnit" ? `${parameter}:${unitId ?? ""}` : parameter;
}

function unitLabel(ctx: RevalueContext, unitId: string | undefined): string | undefined {
  return unitId ? ctx.units.find((u) => u.id === unitId)?.label : undefined;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "a", "a and b", "a, b and c". */
function listJoin(items: string[], last: "and" | "or"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;
}

function unitList(ctx: RevalueContext, ids?: string[]): string {
  const units = ids ? ctx.units.filter((u) => ids.includes(u.id)) : ctx.units;
  return listJoin(
    units.map((u) => u.label),
    "or",
  );
}

function unknownUnitQuestion(ref: string | undefined, ctx: RevalueContext): string {
  const intro = ref ? `I cannot find “${ref}” among the units. ` : "";
  return ctx.units.length > 0
    ? `${intro}Which unit do you mean: ${unitList(ctx)}?`
    : `${intro}This deal has no units whose market rent I could change.`;
}

function unitQuestion(t: Target, ctx: RevalueContext): string {
  if (t.unitIds.length === 0) return unknownUnitQuestion(t.ref, ctx);
  return `Which unit do you mean: ${unitList(ctx, t.unitIds)}?`;
}

/** "Which cap rate should I use?", "Which market rent should I use for Attic?". */
function whichQuestion(parameter: ParamKey, label?: string): string {
  if (parameter === "marketRentUnit") return `Which market rent should I use for ${label ?? "the unit"}?`;
  return `Which ${paramName(parameter).replace(/^the /, "")} should I use?`;
}

function rangeQuestion(parameter: ParamKey, to: number, label?: string): string {
  return `${capitalise(paramName(parameter, label))} must be within ${rangeText(parameter)}, so I cannot use ${formatParamValue(parameter, to)}. ${whichQuestion(parameter, label)}`;
}

function alreadyQuestion(change: ParamChange, ctx: RevalueContext): string {
  const name = paramName(change.parameter, unitLabel(ctx, change.unitId));
  return `${capitalise(name)} is already ${formatParamValue(change.parameter, change.to)}. Which value should I change, and to what?`;
}

const EXAMPLES: Record<ParamKey, (label: string) => string> = {
  capRate: () => "use 3.4 %",
  marketRentAvg: () => "market rent 9.80",
  marketRentUnit: (label) => `${label} rent 9.50`,
  underRentYears: () => "under-rent closes in 8 years",
  easementDeduction: () => "easement 12k",
  remainingLifeYears: () => "remaining life 35 years",
};

const SHORT_NAME: Record<ParamKey, (label: string) => string> = {
  capRate: () => "cap rate",
  marketRentAvg: () => "market rent",
  marketRentUnit: (label) => `${label} rent`,
  underRentYears: () => "under-rent",
  easementDeduction: () => "easement",
  remainingLifeYears: () => "remaining life",
};

function missingValueQuestion(parameter: ParamKey, label: string): string {
  return `${whichQuestion(parameter, label)} For example: "${EXAMPLES[parameter](label)}".`;
}

function ambiguousValueQuestion(parameter: ParamKey, label: string, candidates: Candidate[]): string {
  const values = candidates.map((c) =>
    "to" in c.valued ? formatParamValue(parameter, engineValue(parameter, c.valued.to)) : c.token.raw,
  );
  return `Which value should I use for ${paramName(parameter, label)}: ${listJoin([...new Set(values)], "or")}?`;
}

function rangeOnlyQuestion(parameter: ParamKey, label: string, range: ValuerRange): string {
  return `Which value within ${rangeDisplay(range, parameter)} should I use for ${paramName(parameter, label)}? For example: "${EXAMPLES[parameter](label)}".`;
}

function directionQuestion(parameter: ParamKey, label: string, t: NumToken): string {
  const amount = `${t.raw}${t.kind === "bp" ? " bp" : t.kind === "percent" ? " %" : ""}`;
  return `Should ${paramName(parameter, label)} go up or down by ${amount}? For example: "${SHORT_NAME[parameter](label)} +${amount}".`;
}

function didYouMeanQuestion(parameter: ParamKey, value: string): string {
  return `Do you mean ${paramName(parameter)}? Then write for example "${SHORT_NAME[parameter]("the unit")} ${value}".`;
}

function yearsWhichQuestion(years: number): string {
  return `Should ${yearsText(years)} be the under-rent closing period or the remaining economic life? For example: "under-rent closes in 8 years" or "remaining life 35 years".`;
}

function smallAmountQuestion(amount: number): string {
  return `Did you mean ${eur(amount)} or ${eur(amount * 1000)} for the easement? Write the amount in euro, for example "easement ${Math.round(amount * 100) / 100}k".`;
}

function changePhrase(c: ParamChange, ctx: RevalueContext): string {
  const name = paramName(c.parameter, unitLabel(ctx, c.unitId));
  return `${name} from ${formatParamValue(c.parameter, c.from)} to ${formatParamValue(c.parameter, c.to)}`;
}

function singleChange(c: ParamChange, ctx: RevalueContext): string[] {
  const up = c.to > c.from;
  const did = `I changed ${changePhrase(c, ctx)} as you asked.`;
  switch (c.parameter) {
    case "capRate":
      return [
        did,
        "Rent, costs and land value are unchanged.",
        up
          ? "A higher cap rate means buyers expect more return, so the same rent is worth less today."
          : "A lower cap rate means buyers accept less return, so the same rent is worth more today.",
      ];
    case "marketRentAvg": {
      const kept = Object.keys(ctx.params.marketRentOverrides).length > 0 ? " (units whose rent you set keep it)" : "";
      return [
        `I changed ${changePhrase(c, ctx)} as you asked, scaling every unit's estimated market rent in proportion${kept}.`,
        "In-place rents, areas and land value are unchanged.",
        up ? "More income at full letting raises the value." : "Less income at full letting lowers the value.",
      ];
    }
    case "marketRentUnit":
      return [
        did,
        "The other units, in-place rents and land value are unchanged.",
        up
          ? "More income at full letting raises the value and this unit's share of it."
          : "Less income at full letting lowers the value and this unit's share of it.",
      ];
    case "underRentYears":
      return [
        did,
        "Rents, costs and land value are unchanged.",
        `The gap between in-place and market rent now counts for ${yearsText(c.to)} instead of ${yearsText(c.from)}.`,
      ];
    case "easementDeduction":
      return [did, "Rents, costs and land value are unchanged.", "The deduction comes off the market value in full."];
    case "remainingLifeYears":
      return [
        did,
        "Rents, costs and land value are unchanged.",
        up
          ? "A longer remaining life means more years of income, so the building is worth more today."
          : "A shorter remaining life means fewer years of income, so the building is worth less today.",
      ];
  }
}

/** `3.25` and `3.75` for a percentage range, the way the note's numbers read with a decimal point. */
function percentNumber(x: number): string {
  return Math.abs(x * 10 - Math.round(x * 10)) < 1e-6 ? x.toFixed(1) : String(Math.round(x * 100) / 100);
}

function rangeDisplay(r: ValuerRange, parameter: ParamKey): string {
  switch (parameter) {
    case "capRate":
      return r.kind === "bp" ? `${r.low}–${r.high} bp` : `${percentNumber(r.low)}–${percentNumber(r.high)} %`;
    case "marketRentAvg":
    case "marketRentUnit":
      return `${r.low.toFixed(2)}–${rentM2(r.high)}`;
    case "underRentYears":
    case "remainingLifeYears":
      return `${r.low}–${yearsText(r.high)}`;
    case "easementDeduction":
      return `${eur(r.low)}–${eur(r.high)}`;
  }
}

/**
 * The sentence on a range the valuer gave for a changed parameter. A cap-rate range is checked against the loaded
 * market report: one that is not in it is cited as valuer judgement (spec §6.2).
 */
function valuerRangeSentence(
  changes: ParamChange[],
  ranges: ValuerRange[],
): { sentence: string; ends: string[] } | null {
  for (const c of changes) {
    const r = ranges.find((range) => range.kind !== "bp" && rangeFits(range, c.parameter));
    if (!r) continue;
    const text = rangeDisplay(r, c.parameter);
    if (c.parameter === "capRate") {
      const inReport = MARKET_REPORT_2026.some(
        (row) => Math.abs(row.range[0] - r.low / 100) < EPS && Math.abs(row.range[1] - r.high / 100) < EPS,
      );
      return {
        sentence: inReport
          ? `Your range (${text}) matches the loaded market report.`
          : `Your range (${text}) is not in the loaded market report, so the report cites it as valuer judgement.`,
        ends: [percentNumber(r.low), percentNumber(r.high)],
      };
    }
    const ends = isRent(c.parameter) ? [r.low.toFixed(2), r.high.toFixed(2)] : [String(r.low), String(r.high)];
    return { sentence: `Your range (${text}) is recorded as valuer judgement.`, ends };
  }
  return null;
}
