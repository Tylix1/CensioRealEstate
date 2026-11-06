"use client";

/**
 * A Revalue note box (spec §5.2 V3): the valuer writes to the AI like to a junior, then **Send note & revalue**. Each
 * judgement call has its own box, which sends that call's context; the verdict band's Revalue… opens a general one.
 *
 * Task 17 passes `onSend` (it posts to /api/revalue), `sending` and a `footer` (the AI's answer, the example notes);
 * `value`/`onChange` make the text controllable, e.g. to fill in an example note. Without `onSend` the send button is
 * shown but inactive.
 */
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { MAX_NOTE_CHARS } from "@/lib/server/limits";

export type NoteBoxProps = {
  label: string;
  /** A line under the label. */
  hint?: string;
  /** Controlled text; without it the box keeps its own. */
  value?: string;
  onChange?: (note: string) => void;
  /** Sends the trimmed note. Without it, "Send note & revalue" is inactive. */
  onSend?: (note: string) => void;
  /** While the AI revises: the box is read-only and the button says so. */
  sending?: boolean;
  /** Buttons before "Send note & revalue", e.g. the call's Accept. */
  actions?: ReactNode;
  /** Shown under the buttons. */
  footer?: ReactNode;
  className?: string;
};

export const NOTE_PLACEHOLDER = "Tell the AI what to change and why, like a note to a junior.";

export function NoteBox({ label, hint, value, onChange, onSend, sending = false, actions, footer, className }: NoteBoxProps) {
  const id = useId();
  const [own, setOwn] = useState("");
  const note = value ?? own;
  const setNote = (next: string) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  const ready = onSend !== undefined && !sending && note.trim() !== "";
  const send = () => {
    if (ready) onSend(note.trim());
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-semibold text-muted">
        {label}
      </label>
      {hint && <p className="text-xs leading-[18px] text-muted">{hint}</p>}
      <textarea
        id={id}
        rows={3}
        value={note}
        maxLength={MAX_NOTE_CHARS}
        readOnly={sending}
        onChange={(e) => setNote(e.target.value)}
        placeholder={NOTE_PLACEHOLDER}
        className="mt-1 block w-full resize-y rounded-lg border border-valuer-line bg-surface px-2.5 py-2 text-valuer placeholder:text-faint"
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        {actions}
        <Button
          variant="valuer"
          onClick={send}
          aria-disabled={ready ? undefined : true}
          title={onSend ? undefined : "Revalue is not connected yet"}
          className={cx(!ready && "cursor-not-allowed opacity-60")}
        >
          {sending ? "AI is revising…" : "Send note & revalue"}
        </Button>
      </div>
      {footer}
    </div>
  );
}
