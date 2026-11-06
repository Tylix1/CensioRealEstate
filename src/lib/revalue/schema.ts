/**
 * The Revalue note (spec §6.2, plan Task 11): what Claude returns for a valuer's note, the context the note is read
 * in, what POST /api/revalue answers, and the allowed range of every parameter a note may change.
 *
 * Values are in the engine's units throughout: the cap rate as a fraction (0.034 = 3.4 %), rents in €/m² per month,
 * the easement deduction in euro (positive = deducted), durations in years.
 */
import { z } from "zod";
import { DOCUMENT_TYPE_LABEL, type DocumentType } from "@/lib/deal/types";
import { eur, pct, rentM2 } from "@/lib/format";
import type { ParamChange, ParamKey } from "@/lib/revisions/history";
import type { ValuationParams } from "@/lib/valuation/engine";

/** The six parameters a note may change (spec §6.2), in the order the prompt and the explanations use. */
export const PARAM_KEYS = [
  "capRate",
  "marketRentAvg",
  "marketRentUnit",
  "underRentYears",
  "easementDeduction",
  "remainingLifeYears",
] as const satisfies readonly ParamKey[];

/** Allowed values per parameter, inclusive (spec §6.2): a note asking for anything outside gets a question back. */
export const RANGES: Record<ParamKey, [number, number]> = {
  capRate: [0.02, 0.06],
  marketRentAvg: [6, 15],
  marketRentUnit: [6, 15],
  underRentYears: [1, 10],
  easementDeduction: [0, 50000],
  remainingLifeYears: [20, 60],
};

/** The question for a note the rules cannot map to a change (plan Task 11), also Claude's fallback wording. */
export const DEFAULT_CLARIFYING_QUESTION =
  'Which value should I change, and to what? For example: "use 3.4 %" or "attic rent 9.50".';

/**
 * Claude's structured output for a note. The SDK's `zodOutputFormat` sends enum lists as descriptions rather than
 * enforced constraints, so the prompt spells out every allowed value; an answer with any other value fails to parse.
 */
export const RevalueOutputSchema = z.object({
  intent: z.enum(["change_parameters", "question", "unclear"]),
  changes: z.array(
    z.object({
      parameter: z.enum(PARAM_KEYS),
      unitId: z.string().nullable().describe("The unit's id from the context for marketRentUnit; null otherwise."),
      to: z
        .number()
        .describe(
          "The new value in engine units: cap rate as a fraction (3.4 % = 0.034), rents in €/m² per month, the easement deduction in euro, durations in years.",
        ),
      reason: z.string(),
      sourceKind: z.enum(["valuer_judgement", "document"]),
      documentId: z
        .string()
        .nullable()
        .describe("For sourceKind document: the id of the deal document the note cites. Null otherwise."),
    }),
  ),
  explanation: z.string(),
  answer: z.string().nullable(),
  clarifyingQuestion: z.string().nullable(),
});

export type RevalueOutput = z.infer<typeof RevalueOutputSchema>;

/** The version a note revises, as the review screen shows it. */
export interface RevalueContext {
  /** The flag whose note box sent the note; null for a general note. */
  flagId: string | null;
  /** The parameters of the current version: revisions are cumulative. */
  params: ValuationParams;
  /** The rent estimator's building average (€/m²); `marketRentAvg` sets `marketRentFactor = to / baseAvgRent`. */
  baseAvgRent: number;
  /** Each unit with its market rent in this version (after the valuer's factor and overrides), in €/m². */
  units: { id: string; label: string; marketRentPerM2: number }[];
  /** The deal's uploaded documents; a change may cite one of them as its source. */
  documents: { id: string; type: DocumentType; fileName: string }[];
  /** The version's judgement calls. */
  flags: { id: string; title: string; whyFlagged: string }[];
}

/** What POST /api/revalue answers, from Claude (`live`) or from the rule-based parser (`demo`). */
export interface RevalueResult {
  intent: "change_parameters" | "question" | "unclear";
  /** Only for change_parameters; `from` is the current version's value, filled in on the server. */
  changes: ParamChange[];
  explanation: string;
  /** Only for a question. */
  answer: string | null;
  /** Only for unclear. */
  clarifyingQuestion: string | null;
  mode: "live" | "demo";
  durationMs: number;
}

/** The parts of a pipeline run (Task 12's `PipelineOutput` fits) that a note's context is built from. */
export interface RevalueContextSource {
  deal: {
    units: { id: string; label: string }[];
    documents: { id: string; type: DocumentType; fileName: string; status?: string }[];
  };
  valuation: { units: { unitId: string; marketRentPerM2: number }[] };
  rent: { average: number };
  flags: { id: string; title: string; whyFlagged: string }[];
  params: ValuationParams;
}

/**
 * The context for a note on the current version: `buildRevalueContext(pipelineOutput, focusedFlagId)`. Units carry the
 * version's effective market rent; documents that failed to read are left out, since a change cannot cite them.
 */
export function buildRevalueContext(src: RevalueContextSource, flagId: string | null): RevalueContext {
  const rents = new Map(src.valuation.units.map((s) => [s.unitId, s.marketRentPerM2]));
  return {
    flagId,
    params: { ...src.params, marketRentOverrides: { ...src.params.marketRentOverrides } },
    baseAvgRent: src.rent.average,
    units: src.deal.units.flatMap((u) => {
      const rent = rents.get(u.id);
      return rent === undefined ? [] : [{ id: u.id, label: u.label.trim() || `Unit ${u.id}`, marketRentPerM2: rent }];
    }),
    documents: src.deal.documents
      .filter((d) => d.status !== "failed")
      .map((d) => ({ id: d.id, type: d.type, fileName: d.fileName })),
    flags: src.flags.map((f) => ({ id: f.id, title: f.title, whyFlagged: f.whyFlagged })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Request validation for the route. The bounds keep a forged context from inflating the prompt.

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABEL) as [DocumentType, ...DocumentType[]];

export const RevalueContextSchema = z.object({
  flagId: z.string().max(200).nullable(),
  params: z.object({
    capRate: z.number(),
    remainingLifeYears: z.number(),
    underRentYears: z.number(),
    easementDeduction: z.number(),
    marketRentFactor: z.number(),
    marketRentOverrides: z.record(z.string().max(64), z.number()),
  }),
  baseAvgRent: z.number(),
  units: z
    .array(z.object({ id: z.string().min(1).max(64), label: z.string().max(200), marketRentPerM2: z.number() }))
    .max(200),
  documents: z
    .array(z.object({ id: z.string().min(1).max(200), type: z.enum(DOCUMENT_TYPES), fileName: z.string().max(300) }))
    .max(50),
  flags: z
    .array(z.object({ id: z.string().min(1).max(300), title: z.string().max(500), whyFlagged: z.string().max(2000) }))
    .max(200),
}) satisfies z.ZodType<RevalueContext>;

/** POST /api/revalue's JSON body. The note's length is checked separately, to answer with its own error. */
export const RevalueRequestSchema = z.object({
  note: z.string(),
  context: RevalueContextSchema,
  code: z.string().max(200).nullable().optional(),
});

// ---------------------------------------------------------------------------------------------------------------------
// How each parameter's values read in English copy.

/** Noun phrases for the explanations and questions; the unit's label is filled in for `marketRentUnit`. */
export function paramName(parameter: ParamKey, unitLabel?: string): string {
  switch (parameter) {
    case "capRate":
      return "the cap rate";
    case "marketRentAvg":
      return "the average market rent";
    case "marketRentUnit":
      return `the market rent of ${unitLabel ?? "the unit"}`;
    case "underRentYears":
      return "the under-rent closing period";
    case "easementDeduction":
      return "the easement deduction";
    case "remainingLifeYears":
      return "the remaining economic life";
  }
}

/** `3.4 %`, `3.25 %` (one decimal unless the value needs two). */
export function percentText(fraction: number): string {
  const tenths = fraction * 1000;
  return pct(fraction, Math.abs(tenths - Math.round(tenths)) < 1e-6 ? 1 : 2);
}

/** `1 year`, `8 years`, `1.5 years`. */
export function yearsText(years: number): string {
  const v = Math.round(years * 100) / 100;
  return `${v} ${v === 1 ? "year" : "years"}`;
}

/** A parameter value as the UI writes it: `3.4 %`, `9.50 €/m²`, `8 years`, `€12,000`. */
export function formatParamValue(parameter: ParamKey, value: number): string {
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

/** The allowed range as the questions name it: `2.0–6.0 %`, `6.00–15.00 €/m²`, `1–10 years`, `€0–€50,000`. */
export function rangeText(parameter: ParamKey): string {
  const [low, high] = RANGES[parameter];
  switch (parameter) {
    case "capRate":
      return `${(low * 100).toFixed(1)}–${pct(high)}`;
    case "marketRentAvg":
    case "marketRentUnit":
      return `${low.toFixed(2)}–${rentM2(high)}`;
    case "underRentYears":
    case "remainingLifeYears":
      return `${low}–${high} years`;
    case "easementDeduction":
      return `${eur(low)}–${eur(high)}`;
  }
}
