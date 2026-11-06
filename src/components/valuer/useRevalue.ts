"use client";

/**
 * The Revalue loop of the review screen (spec §5.2 V3 and §6.2, plan Task 17). A note from a call's box, or from the
 * verdict band's general box, goes to POST /api/revalue with the current version's context. While the AI works, the
 * screen shows "AI is revising…" and outlines the figures that depend on the change: first the figure of the call the
 * note was sent from, then, once the answer is in, the figures its changes set. Then
 * - change_parameters: the changes apply to the current version's parameters and become the next revision;
 * - question / unclear: the answer or the clarifying question shows under the note box; no version is created.
 * The working state stays at least MIN_WORKING_MS: in Demo mode the rule-based parser answers at once, and the moment
 * should read on video. Undo marks the current revision undone. Revisions are stored; answers and drafts are local.
 *
 * The clock is read in the handlers only (Cache Components): the revision's time stamp, and performance.now() for the
 * working state's minimum duration.
 */
import { useMemo, useRef, useState } from "react";
import type { RevalueFallback, RevalueResponse } from "@/app/api/revalue/route";
import { eur } from "@/lib/format";
import { runCurrentVersion, type PipelineOutput } from "@/lib/pipeline/run";
import {
  DEFAULT_CLARIFYING_QUESTION,
  buildRevalueContext,
  type RevalueContext,
  type RevalueResult,
} from "@/lib/revalue/schema";
import { addRevision, applyChanges, currentVersion, undoLast, type History } from "@/lib/revisions/history";
import { currentPipeline, useDemoStore } from "@/lib/store/demoStore";
import { scrollToId } from "./review";
import {
  GENERAL_NOTE_BOX,
  answerDomId,
  changedFigures,
  holdMs,
  outlineSet,
  predictedFigures,
  revisionDomId,
} from "./revision";

export type NoteAnswer = {
  kind: "question" | "unclear" | "error";
  text: string;
  /** Why Live AI did not read the note although it could have; the rule-based parser answered instead. */
  fallback: RevalueFallback | null;
};

export type PendingNote = {
  /** The note box it was sent from: a flag id, or GENERAL_NOTE_BOX. */
  box: string;
  flagId: string | null;
  note: string;
  /** The version the note revises. */
  versionN: number;
  /** The figures outlined, before their dependents are added. */
  figures: string[];
};

type Outcome = { ok: true; result: RevalueResult; fallback: RevalueFallback | null } | { ok: false; message: string };

const FALLBACKS: readonly RevalueFallback[] = ["rate_limited", "ai_refused", "ai_error"];

const CHANGED_MEANWHILE =
  "The valuation changed while the AI was revising, so nothing was applied. Send the note again.";
const NOT_APPLICABLE = "The AI's answer could not be applied, so no version was created. Rephrase the note and send it again.";

async function postNote(note: string, context: RevalueContext, code: string | null): Promise<Outcome> {
  try {
    const response = await fetch("/api/revalue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, context, code }),
      cache: "no-store",
    });
    const header = response.headers.get("X-Revalue-Fallback");
    const fallback = FALLBACKS.find((f) => f === header) ?? null;
    const body = (await response.json().catch(() => null)) as RevalueResponse | null;
    if (body && "ok" in body) return { ok: false, message: body.message };
    if (!response.ok || !body) return { ok: false, message: `The note could not be read (error ${response.status}).` };
    return { ok: true, result: body, fallback };
  } catch {
    return { ok: false, message: "The note could not be sent. Check the connection and try again." };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useRevalue(dealId: string, out: PipelineOutput) {
  /** Note drafts by box, so an example note can fill a box and a sent revision can clear it. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, NoteAnswer>>({});
  const [pending, setPending] = useState<PendingNote | null>(null);
  /** Live AI fallbacks of the revisions made during this visit, by version number. */
  const [fallbacks, setFallbacks] = useState<Record<number, RevalueFallback>>({});
  /** A short line for screen readers: the working state, the new value, an answer. */
  const [announcement, setAnnouncement] = useState("");
  /** One note at a time: set synchronously, so a double click sends once. */
  const busy = useRef(false);

  const setDraft = (box: string, note: string) => setDrafts((d) => ({ ...d, [box]: note }));
  const setAnswer = (box: string, answer: NoteAnswer | null) =>
    setAnswers((all) => {
      const next = { ...all };
      if (answer) next[box] = answer;
      else delete next[box];
      return next;
    });

  const showAnswer = (box: string, answer: NoteAnswer) => {
    setAnswer(box, answer);
    setAnnouncement(answer.text);
    scrollToId(answerDomId(dealId, box), "nearest");
  };

  /** Stores the AI's changes as the next revision of the version the note was sent on. */
  const applyRevision = (pendingNote: PendingNote, result: RevalueResult, fallback: RevalueFallback | null) => {
    const { box, flagId, note, versionN } = pendingNote;
    const stored = useDemoStore.getState().deals[dealId];
    if (!stored || stored.approval || currentVersion(stored.history).n !== versionN) {
      showAnswer(box, { kind: "error", text: CHANGED_MEANWHILE, fallback: null });
      return;
    }
    let history: History;
    try {
      const current = currentPipeline(stored);
      const params = applyChanges(currentVersion(stored.history).params, result.changes, current.rent.average);
      history = addRevision(stored.history, {
        params,
        note,
        flagId,
        changes: result.changes,
        explanation: result.explanation,
        aiMode: result.mode,
        createdAt: new Date().toISOString(),
        durationMs: result.durationMs,
      });
    } catch {
      showAnswer(box, { kind: "error", text: NOT_APPLICABLE, fallback: null });
      return;
    }
    useDemoStore.getState().setHistory(dealId, history);
    const n = currentVersion(history).n;
    if (fallback) setFallbacks((all) => ({ ...all, [n]: fallback }));
    setDraft(box, "");
    const value = runCurrentVersion(stored.deal, history).valuation.marketValue;
    setAnnouncement(`Revision ${n}: market value ${eur(value)}.`);
    // The banner grows from the working state into the table of changes; bring its top back into view (the browser's
    // scroll anchoring keeps the content below in place instead).
    scrollToId(revisionDomId(dealId), "start");
  };

  const finish = (pendingNote: PendingNote, outcome: Outcome) => {
    const { box } = pendingNote;
    if (!outcome.ok) {
      showAnswer(box, { kind: "error", text: outcome.message, fallback: null });
      return;
    }
    const { result, fallback } = outcome;
    if (result.intent === "change_parameters" && result.changes.length > 0) {
      applyRevision(pendingNote, result, fallback);
    } else if (result.intent === "question") {
      showAnswer(box, { kind: "question", text: result.answer ?? result.explanation, fallback });
    } else {
      showAnswer(box, { kind: "unclear", text: result.clarifyingQuestion ?? DEFAULT_CLARIFYING_QUESTION, fallback });
    }
  };

  /** Sends a note from a call's box (`flagId`) or the general box (null) on the current version. */
  const send = async (flagId: string | null, rawNote: string): Promise<void> => {
    const note = rawNote.trim();
    const stored = useDemoStore.getState().deals[dealId];
    if (!note || busy.current || !stored || stored.approval) return;
    busy.current = true;
    const current = currentPipeline(stored);
    const pendingNote: PendingNote = {
      box: flagId ?? GENERAL_NOTE_BOX,
      flagId,
      note,
      versionN: currentVersion(stored.history).n,
      figures: predictedFigures(current, flagId),
    };
    setAnswer(pendingNote.box, null);
    setPending(pendingNote);
    setAnnouncement("AI is revising…");
    // The banner's slot sits above the value and the value path, whose dependent figures are outlined.
    scrollToId(revisionDomId(dealId), "start");
    const started = performance.now();
    try {
      const outcome = await postNote(note, buildRevalueContext(current, flagId), useDemoStore.getState().accessCode);
      const changes = outcome.ok && outcome.result.intent === "change_parameters" ? outcome.result.changes : [];
      setPending((p) => (p ? { ...p, figures: changedFigures(changes) } : p));
      await wait(holdMs(performance.now() - started));
      finish(pendingNote, outcome);
    } finally {
      setPending(null);
      busy.current = false;
    }
  };

  /** Marks the current revision undone (never the AI draft); the history keeps it. */
  const undo = () => {
    const stored = useDemoStore.getState().deals[dealId];
    if (!stored || stored.approval || busy.current) return;
    const history = undoLast(stored.history);
    if (history === stored.history) return;
    useDemoStore.getState().setHistory(dealId, history);
    const value = runCurrentVersion(stored.deal, history).valuation.marketValue;
    setAnnouncement(`Revision undone: market value ${eur(value)}, v${currentVersion(history).n}.`);
  };

  const outlined = useMemo(
    () => (pending ? outlineSet(out.registry, pending.figures) : undefined),
    [pending, out.registry],
  );

  return { drafts, setDraft, answers, pending, outlined, fallbacks, announcement, send, undo };
}
