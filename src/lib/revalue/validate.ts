/**
 * The server's checks of a Revalue result before it reaches the review screen (spec §6.2 guardrails, plan Task 11).
 * The live route runs every model answer through `validateChanges`; the Demo parser applies the same rules itself.
 *
 * - Only one intent's fields survive: changes for change_parameters, an answer for a question, a clarifying question
 *   for unclear.
 * - `document` is kept only for a document of this deal; any other source becomes valuer judgement (the AI never
 *   invents sources).
 * - Explicit numbers in the note win over the model's values, so the rehearsed note gives exactly v2.
 * - Values are checked against their allowed ranges; a value out of range, an unknown unit, or a change that changes
 *   nothing turns the result into a clarifying question, so no version is created.
 * - `from` is filled in from the version the note revises.
 */
import {
  NO_ANSWER,
  NO_CHANGE,
  checkChanges,
  engineValue,
  explainChanges,
  readNote,
  unclearResult,
  withValuerRange,
  type ChangeDraft,
} from "@/lib/revalue/parser";
import { DEFAULT_CLARIFYING_QUESTION, type RevalueContext, type RevalueResult } from "@/lib/revalue/schema";

/**
 * Checks `r` against the version it revises. `note`, the valuer's note, lets explicit numbers in it override the
 * model's values and cites the valuer's range in the explanation.
 */
export function validateChanges(r: RevalueResult, ctx: RevalueContext, note?: string): RevalueResult {
  const keep = { mode: r.mode, durationMs: r.durationMs };
  const explanation = r.explanation.trim();

  if (r.intent === "question") {
    return {
      ...keep,
      intent: "question",
      changes: [],
      explanation: explanation || NO_CHANGE,
      answer: r.answer?.trim() || NO_ANSWER,
      clarifyingQuestion: null,
    };
  }
  if (r.intent !== "change_parameters") {
    return { ...keep, ...unclearResult(r.clarifyingQuestion?.trim() || DEFAULT_CLARIFYING_QUESTION) };
  }

  const reading = note === undefined ? null : readNote(note, ctx);
  const stated = reading?.kind === "changes" ? reading.changes : [];
  let overridden = false;
  const drafts = r.changes.map((c): ChangeDraft => {
    const unitId = c.parameter === "marketRentUnit" ? c.unitId || undefined : undefined;
    const cited = c.sourceKind === "document" && !!c.documentId && ctx.documents.some((d) => d.id === c.documentId);
    const explicit = stated.find((s) => s.parameter === c.parameter && (s.unitId ?? undefined) === unitId);
    let to = c.to;
    if (explicit && engineValue(c.parameter, explicit.to) !== engineValue(c.parameter, c.to)) {
      to = explicit.to;
      overridden = true;
    }
    return {
      parameter: c.parameter,
      ...(unitId ? { unitId } : {}),
      to,
      reason: c.reason,
      sourceKind: cited ? "document" : "valuer_judgement",
      ...(cited ? { documentId: c.documentId } : {}),
    };
  });

  const checked = checkChanges(drafts, ctx);
  if (!checked.ok) return { ...keep, ...unclearResult(checked.question) };

  // The model's wording stays unless the server changed what it describes.
  const ranges = reading?.ranges ?? [];
  const text =
    overridden || checked.dropped || !explanation
      ? explainChanges(checked.changes, ctx, ranges)
      : withValuerRange(explanation, checked.changes, ranges);
  return {
    ...keep,
    intent: "change_parameters",
    changes: checked.changes,
    explanation: text,
    answer: null,
    clarifyingQuestion: null,
  };
}
