"use client";

/**
 * "Needs your eye" (spec §5.4 item 8): the AI's judgement calls in buildFlags order (biggest € impact first), each with
 * a swing bar on one shared scale. Focusing a call opens it: what the AI did, the swing with the value at both ends,
 * why it was flagged, what would change the AI's mind, **Accept** and a Revalue note box. Below: the spot-check row and
 * the ledger of the figures verified automatically.
 *
 * The page owns the focus and the store actions. Task 17 passes `onSendNote` (it posts the note to /api/revalue),
 * `sendingFlagId` while the AI revises, `noteFooter` for the AI's answer or the example notes, `titleNotes` for the
 * "(was 3.0 %)" of a call the valuer changed, and `readOnly` once the valuer has signed.
 */
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SwingBar } from "@/components/ui/SwingBar";
import { cx } from "@/components/ui/cx";
import type { Flag } from "@/lib/flags/rules";
import { kEur } from "@/lib/format";
import type { PipelineOutput } from "@/lib/pipeline/run";
import type { Figure } from "@/lib/registry/registry";
import type { FlagReviewStatus } from "@/lib/store/demoStore";
import { Ledger } from "./Ledger";
import { NoteBox } from "./NoteBox";
import {
  VALUER_INITIALS,
  citationShort,
  countLabel,
  evidenceDomId,
  flagDomId,
  flagStatusText,
  scrollToId,
  swingEndDetail,
  swingEndLabel,
  swingScale,
  type ReviewFocus,
} from "./review";

export type SpotCheck = { figure: Figure; status: "open" | "matches" };

export type NeedsYourEyeProps = {
  out: PipelineOutput;
  /** From `flagReviewStatuses(stored, out)`. */
  statuses: Record<string, FlagReviewStatus>;
  focus: ReviewFocus;
  /** Focuses a call; the page also marks it opened. */
  onFocusFlag: (flagId: string) => void;
  onAccept: (flagId: string) => void;
  /** Sets an accepted call back to open. */
  onReopen: (flagId: string) => void;
  /** The figure picked for the spot-check, or null when no figure has a quote to check. */
  spotCheck: SpotCheck | null;
  onFocusSpotCheck: () => void;
  onSpotCheckMatches: () => void;
  /** Sends a call's Revalue note (Task 17). Without it, "Send note & revalue" is shown but inactive. */
  onSendNote?: (flagId: string, note: string) => void;
  /** The call whose note the AI is working on (Task 17). */
  sendingFlagId?: string | null;
  /** Content under a call's note box, e.g. the AI's answer or example notes (Task 17). */
  noteFooter?: (flagId: string) => ReactNode;
  /** Controlled note texts by call id (Task 17, e.g. to fill in an example note); without them each box keeps its own. */
  notes?: Record<string, string>;
  onNoteChange?: (flagId: string, note: string) => void;
  /** Added to a call's title by id, e.g. " (was 3.0 %)" once the valuer changed it (Task 17). */
  titleNotes?: Record<string, string>;
  /** The deal is signed: calls can be read and their evidence shown, but no longer accepted, reopened or revalued. */
  readOnly?: boolean;
  /** Calls accepted at sign-off without being opened (the approval's log). */
  acceptedAtSignOff?: readonly string[];
  className?: string;
};

const STATUS_CLASS: Record<FlagReviewStatus, string> = {
  open: "text-xs leading-[18px] text-ai",
  accepted: "text-xs font-semibold leading-[18px] text-ok",
  changed_by_valuer: "text-xs font-semibold leading-[18px] text-valuer",
};

const FIELD_LABEL = "text-xs font-semibold leading-[18px] text-muted";

/** "3.5 % → €1.19 M (−€111k)", wrapping on a phone only between the value and the change. */
function SwingEnd({ parts: [where, change] }: { parts: [string, string] }) {
  return (
    <>
      <span className="whitespace-nowrap">{where}</span> <span className="whitespace-nowrap">{change}</span>
    </>
  );
}

/** Where the evidence pane sits below the calls (narrower than `xl`), a way down to it. */
function ShowEvidence({ dealId }: { dealId: string }) {
  return (
    <button
      type="button"
      onClick={() => scrollToId(evidenceDomId(dealId))}
      className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-brand underline underline-offset-2 xl:hidden"
    >
      Show the evidence
    </button>
  );
}

type FlagRowProps = {
  flag: Flag;
  number: number;
  status: FlagReviewStatus;
  open: boolean;
  scale: number;
  out: PipelineOutput;
  note: string;
  onNote: (note: string) => void;
  titleNote: string;
  readOnly: boolean;
  /** Accepted at sign-off without being opened. */
  atSignOff: boolean;
} & Pick<NeedsYourEyeProps, "onFocusFlag" | "onAccept" | "onReopen" | "onSendNote" | "sendingFlagId" | "noteFooter">;

function FlagRow({
  flag,
  number,
  status,
  open,
  scale,
  out,
  note,
  onNote,
  titleNote,
  readOnly,
  atSignOff,
  onFocusFlag,
  onAccept,
  onReopen,
  onSendNote,
  sendingFlagId,
  noteFooter,
}: FlagRowProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const statusId = `${uid}-status`;
  const swingId = `${uid}-swing`;
  const bodyId = `${uid}-body`;
  const { swing } = flag;
  const exact = out.valuation.marketValueExact;

  return (
    <div className={cx("border-t border-line", open && "bg-ai-row")}>
      <button
        id={flagDomId(out.deal.id, flag.id)}
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        aria-labelledby={`${titleId} ${statusId}`}
        aria-describedby={!open && swing ? swingId : undefined}
        onClick={() => onFocusFlag(flag.id)}
        className={cx(
          "block min-h-11 w-full scroll-mt-4 px-4 text-left text-ink",
          open ? "cursor-default pb-0.5 pt-3.5" : "py-3 hover:bg-subtle",
        )}
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span id={titleId} className={cx("font-semibold", open && "text-[15px]")}>
            {number} · {flag.title}
            {titleNote}
          </span>
          <span id={statusId} className={STATUS_CLASS[status]}>
            {status === "open" && <span aria-hidden="true">≈ </span>}
            {status === "accepted" && atSignOff
              ? `Accepted at sign-off · ${VALUER_INITIALS}`
              : flagStatusText(flag, status, out)}
          </span>
        </span>
        {!open && swing && (
          <span id={swingId} className="mt-2 block">
            <SwingBar
              size="sm"
              low={swing.low}
              high={swing.high}
              scale={scale}
              lowLabel={swingEndLabel(swing.low, swing.lowLabel)}
              highLabel={swingEndLabel(swing.high, swing.highLabel)}
            />
          </span>
        )}
      </button>

      {open && (
        <div id={bodyId} className="px-4 pb-4">
          <p className="text-ink-2">{flag.summary}</p>
          {swing && (
            <SwingBar
              size="md"
              className="mt-2.5"
              low={swing.low}
              high={swing.high}
              scale={scale}
              lowLabel={<SwingEnd parts={swingEndDetail(swing.low, swing.lowLabel, exact)} />}
              highLabel={<SwingEnd parts={swingEndDetail(swing.high, swing.highLabel, exact)} />}
            />
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="min-w-0 flex-[1_1_200px]">
              <div className={FIELD_LABEL}>Why flagged</div>
              <div>{flag.whyFlagged}</div>
            </div>
            {flag.changeMind !== "" && (
              <div className="min-w-0 flex-[1_1_200px]">
                <div className={FIELD_LABEL}>What would change the AI&apos;s mind</div>
                <div>{flag.changeMind}</div>
              </div>
            )}
            {flag.support && (
              <div className="min-w-0 flex-[1_1_200px]">
                <div className={FIELD_LABEL}>Support</div>
                <div>{flag.support}</div>
              </div>
            )}
          </div>

          <ShowEvidence dealId={out.deal.id} />

          {status === "changed_by_valuer" && (
            <div className="mt-3.5 rounded-lg bg-[#F6F3FF] px-3 py-2.5 text-valuer">
              You changed this call in a revision; the report records it as valuer judgement.
            </div>
          )}
          {status === "accepted" && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ok">
              <span className="font-semibold">
                <span aria-hidden="true">✓ </span>
                {atSignOff
                  ? `Accepted at sign-off without opening · ${VALUER_INITIALS}`
                  : `You accepted the AI's call · ${VALUER_INITIALS}`}
              </span>
              {!readOnly && (
                <Button variant="ghost" onClick={() => onReopen(flag.id)}>
                  Reopen
                </Button>
              )}
            </div>
          )}

          {readOnly ? (
            <p className="mt-3 text-xs leading-[18px] text-muted">The valuation is signed; this call is final.</p>
          ) : (
            <NoteBox
              className="mt-3.5"
              label="Note to the AI (Revalue)"
              value={note}
              onChange={onNote}
              onSend={onSendNote ? (text) => onSendNote(flag.id, text) : undefined}
              sending={sendingFlagId === flag.id}
              actions={
                status === "open" ? (
                  <Button variant="primary" onClick={() => onAccept(flag.id)}>
                    {flag.acceptLabel}
                  </Button>
                ) : null
              }
              footer={noteFooter?.(flag.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SpotCheckRow({
  spot,
  focused,
  out,
  readOnly,
  onFocus,
  onMatches,
}: {
  spot: SpotCheck;
  focused: boolean;
  out: PipelineOutput;
  readOnly: boolean;
  onFocus: () => void;
  onMatches: () => void;
}) {
  const { figure, status } = spot;
  const where = figure.quote ? ` · ${citationShort(out.deal, figure.quote.documentId, figure.quote.page)}` : "";
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-4 py-2",
        focused && "bg-ai-row",
      )}
    >
      <button
        type="button"
        aria-pressed={focused}
        onClick={onFocus}
        className="min-h-11 min-w-0 flex-[1_1_240px] py-1 text-left text-ink"
      >
        <span className="font-semibold">Spot-check:</span> {figure.label} {figure.display}
        {where}
        <span className="block text-xs leading-[18px] text-muted">
          One figure the AI read, picked for you to confirm against its source.
        </span>
      </button>
      {focused && <ShowEvidence dealId={out.deal.id} />}
      {status === "matches" ? (
        <span className="text-xs font-semibold text-ok">
          <span aria-hidden="true">✓ </span>Matches · {VALUER_INITIALS}
        </span>
      ) : readOnly ? (
        <span className="text-xs text-muted">Not checked</span>
      ) : (
        <Button variant="secondary" onClick={onMatches}>
          Matches
        </Button>
      )}
    </div>
  );
}

export function NeedsYourEye({
  out,
  statuses,
  focus,
  onFocusFlag,
  onAccept,
  onReopen,
  spotCheck,
  onFocusSpotCheck,
  onSpotCheckMatches,
  onSendNote,
  sendingFlagId = null,
  noteFooter,
  notes,
  onNoteChange,
  titleNotes,
  readOnly = false,
  acceptedAtSignOff = [],
  className,
}: NeedsYourEyeProps) {
  const { flags } = out;
  const scale = swingScale(flags);
  const withSwing = flags.some((f) => f.swing !== null);
  const [ownNotes, setOwnNotes] = useState<Record<string, string>>({});
  const noteOf = (flagId: string) => (notes ?? ownNotes)[flagId] ?? "";
  const setNote = (flagId: string, note: string) => {
    if (!notes) setOwnNotes((prev) => ({ ...prev, [flagId]: note }));
    onNoteChange?.(flagId, note);
  };

  return (
    <section
      aria-label="Needs your eye"
      className={cx("min-w-0 overflow-hidden rounded-xl border border-line bg-surface", className)}
    >
      <div className="px-4 py-3.5">
        <h2 className="text-base font-semibold">Needs your eye</h2>
        <p className="mt-0.5 text-xs leading-[18px] text-muted">
          {flags.length === 0
            ? "The AI made no judgement call that needs your eye. Everything was traced and cross-checked automatically."
            : `The AI's ${countLabel(flags.length, "judgement call")}, biggest € impact first.${withSwing ? ` All bars share one scale (±${kEur(scale)}).` : ""} Everything else was traced and cross-checked automatically.`}
        </p>
      </div>
      {flags.map((flag, i) => (
        <FlagRow
          key={flag.id}
          flag={flag}
          number={i + 1}
          status={statuses[flag.id] ?? "open"}
          open={focus?.kind === "flag" && focus.flagId === flag.id}
          scale={scale}
          out={out}
          note={noteOf(flag.id)}
          onNote={(note) => setNote(flag.id, note)}
          titleNote={titleNotes?.[flag.id] ?? ""}
          readOnly={readOnly}
          atSignOff={acceptedAtSignOff.includes(flag.id)}
          onFocusFlag={onFocusFlag}
          onAccept={onAccept}
          onReopen={onReopen}
          onSendNote={onSendNote}
          sendingFlagId={sendingFlagId}
          noteFooter={noteFooter}
        />
      ))}
      {spotCheck && (
        <SpotCheckRow
          spot={spotCheck}
          focused={focus?.kind === "spot"}
          out={out}
          readOnly={readOnly}
          onFocus={onFocusSpotCheck}
          onMatches={onSpotCheckMatches}
        />
      )}
      <Ledger out={out} />
    </section>
  );
}
