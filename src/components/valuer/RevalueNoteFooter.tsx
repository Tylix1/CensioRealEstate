"use client";

/**
 * What shows under a Revalue note box (plan Task 17): the AI's answer to a question or its clarifying question for a
 * note it could not map to a change (neither creates a version), and the example notes to click. In Demo mode they
 * show what the rule-based parser understands; with Live AI they save typing in a demo take (the rehearsed note).
 */
import { useId } from "react";
import type { RevalueFallback } from "@/app/api/revalue/route";
import { cx } from "@/components/ui/cx";
import type { AiMode } from "./useAiMode";
import { DEMO_EXAMPLE_NOTES } from "./revision";
import type { NoteAnswer } from "./useRevalue";

/** Why the rule-based parser read a note although Live AI was on (the route's X-Revalue-Fallback header). */
export const FALLBACK_TEXT: Record<RevalueFallback, string> = {
  rate_limited: "The Live AI limit for this hour is reached, so the rule-based parser read your note.",
  ai_refused: "Live AI declined the note, so the rule-based parser read it.",
  ai_error: "Live AI was not reachable, so the rule-based parser read your note.",
};

const ANSWER_LABEL: Record<NoteAnswer["kind"], string> = {
  question: "≈ AI answer · no new version",
  unclear: "≈ The AI asks back · no new version",
  error: "Not applied",
};

function AnswerBox({ id, answer }: { id: string; answer: NoteAnswer }) {
  const error = answer.kind === "error";
  return (
    <div
      id={id}
      className={cx("mt-3 scroll-mt-4 rounded-lg px-3 py-2.5", error ? "bg-[#FEF3F2] text-pen" : "bg-ai-weak")}
    >
      <div className={cx("text-xs font-semibold leading-[18px]", error ? "text-pen" : "text-ai")}>
        {ANSWER_LABEL[answer.kind]}
      </div>
      <p>{answer.text}</p>
      {answer.fallback && <p className="mt-1 text-xs leading-[18px] text-muted">{FALLBACK_TEXT[answer.fallback]}</p>}
    </div>
  );
}

function ExampleNotes({ mode, onPick, disabled }: { mode: AiMode; onPick: (note: string) => void; disabled: boolean }) {
  const labelId = useId();
  return (
    <div className="mt-3">
      <p id={labelId} className="text-xs font-semibold leading-[18px] text-muted">
        Example notes{" "}
        <span className="font-normal">
          {mode === "demo" ? "· demo mode, click one to fill in the note" : "· click one to fill in the note, or write your own"}
        </span>
      </p>
      <ul aria-labelledby={labelId} className="mt-1.5 flex flex-wrap gap-2">
        {DEMO_EXAMPLE_NOTES.map((note) => (
          <li key={note} className="min-w-0 max-w-full">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(note)}
              className="min-h-11 max-w-full rounded-lg border border-dashed border-valuer-line bg-surface px-3 py-2 text-left text-[13px] leading-[18px] text-valuer hover:bg-valuer-weak disabled:cursor-not-allowed disabled:opacity-50"
            >
              {note}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type RevalueNoteFooterProps = {
  /** DOM id of the answer, scrolled into view when it arrives. */
  answerId: string;
  answer: NoteAnswer | undefined;
  /** The AI mode once known: the example notes are offered in both, with words that fit the mode. */
  examples: AiMode | null;
  onPickExample: (note: string) => void;
  /** While a note is being revised, examples cannot be picked. */
  busy: boolean;
};

export function RevalueNoteFooter({ answerId, answer, examples, onPickExample, busy }: RevalueNoteFooterProps) {
  if (!answer && !examples) return null;
  return (
    <>
      {answer && <AnswerBox id={answerId} answer={answer} />}
      {examples && <ExampleNotes mode={examples} onPick={onPickExample} disabled={busy} />}
    </>
  );
}
