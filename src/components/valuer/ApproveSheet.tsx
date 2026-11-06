"use client";

/**
 * The approval sheet (spec §5.2 V4), opened by Approve & send report. A soft gate before the valuer signs:
 * - the value and the version being signed, and to whom the report goes;
 * - every AI judgement call with its status: accepted, changed by the valuer (with the note), or still open, opened or
 *   not;
 * - **Accept remaining** accepts the open calls with one click; the report logs those never opened as "accepted at
 *   sign-off without opening" (the store's `approve`);
 * - **Sign & send** signs the current version, sets the deal approved and shows "Report sent to Demo Capital GmbH".
 *
 * A modal <dialog>, mounted while open. When Next.js hides the page (another page in view) the dialog closes: a modal
 * left open would make the visible page inert.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { eur, num, times } from "@/lib/format";
import type { PipelineOutput } from "@/lib/pipeline/run";
import { currentVersion } from "@/lib/revisions/history";
import type { FlagReviewStatus, StoredDeal } from "@/lib/store/demoStore";
import { countLabel, dateLabel } from "./review";
import { approvalCalls, signReady, type CallState } from "./revision";
import { versionLabel } from "./VerdictBand";

export type ApproveSheetProps = {
  stored: StoredDeal;
  /** The pipeline of the current version, the one being signed. */
  out: PipelineOutput;
  statuses: Record<string, FlagReviewStatus>;
  /** Signs the current version: the store's `approve(dealId, acceptRemaining)`. */
  onSign: (acceptRemaining: boolean) => void;
  onClose: () => void;
};

const LABEL = "text-xs font-semibold uppercase tracking-[0.04em] text-muted";

const STATE_CLASS: Record<CallState, string> = {
  accepted: "font-semibold text-ok",
  changed: "font-semibold text-valuer",
  not_opened: "text-ai",
  opened: "text-ai",
};

/** The glyph before a status: settled calls get a tick, open ones the AI's "≈". */
function statusGlyph(state: CallState, acceptRemaining: boolean): string {
  if (state === "accepted" || ((state === "not_opened" || state === "opened") && acceptRemaining)) return "✓ ";
  return state === "changed" ? "" : "≈ ";
}

/** What Accept remaining does with the calls still open. */
function openCallsText(open: number, unopened: number): string {
  const head = `${countLabel(open, "call")} ${open === 1 ? "is" : "are"} still open.`;
  if (unopened === 0) return `${head} Accept remaining accepts ${open === 1 ? "it" : "them"} as you sign.`;
  const them = unopened === 1 ? "it" : "them";
  if (unopened === open) {
    return `${head} You have not opened ${them}: Accept remaining logs ${them} in the report as accepted at sign-off without opening.`;
  }
  return `${head} Accept remaining logs the ${unopened} you have not opened in the report as accepted at sign-off without opening.`;
}

export function ApproveSheet({ stored, out, statuses, onSign, onClose }: ApproveSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const callsId = useId();
  const [acceptRemaining, setAcceptRemaining] = useState(false);
  const { deal, approval } = stored;
  const { valuation } = out;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Focus the sheet itself: screen readers announce its title, and Tab reaches the buttons.
    dialog.focus();
    return () => dialog.close();
  }, []);

  // Once signed, focus the way back.
  const signed = approval !== null;
  useEffect(() => {
    if (signed) doneRef.current?.focus();
  }, [signed]);

  const close = () => dialogRef.current?.close();
  // A close event can arrive after the dialog was shown again (e.g. effects run twice in development): ignore it then.
  const onClosed = () => {
    if (!dialogRef.current?.open) onClose();
  };

  const calls = approvalCalls(stored, out, statuses, acceptRemaining);
  const reviewed = calls.filter((c) => c.state === "accepted" || c.state === "changed").length;
  const open = calls.filter((c) => c.state === "opened" || c.state === "not_opened");
  const unopened = open.filter((c) => c.state === "not_opened").length;
  const ready = signReady(calls, acceptRemaining);
  const version = currentVersion(stored.history).n;

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      onClose={onClosed}
      // A click on the dialog element itself lands on the backdrop: the content below fills the dialog.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[600px] max-w-[calc(100%-32px)] overflow-y-auto rounded-xl border border-line bg-page p-0 text-ink shadow-xl backdrop:bg-ink/50"
      // The dialog itself only holds focus for screen readers; inline, because the global focus ring is unlayered.
      style={{ outline: "none" }}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={LABEL}>
              {deal.id} · {deal.address.street}, {deal.address.city}
            </div>
            <h2 id={titleId} className="mt-0.5 font-display text-[22px] font-semibold leading-7 tracking-[-0.01em]">
              Approve &amp; send report
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-xl text-ink-2 hover:bg-surface hover:text-ink"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {approval ? (
          <>
            <div role="status" className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
              <span
                aria-hidden="true"
                className="mx-auto flex size-11 items-center justify-center rounded-full bg-public-weak text-xl font-bold text-ok"
              >
                ✓
              </span>
              <p className="mt-3 font-display text-xl font-semibold leading-7 text-ok">Report sent to {deal.clientName}</p>
              <p className="mt-1 text-ink-2">
                Signed by {approval.signer} · v{approval.version} · {eur(valuation.marketValue)} ·{" "}
                {dateLabel(approval.at)}
              </p>
              <p className="mt-1 text-xs leading-[18px] text-muted">
                The client receives the report by email; the review log records every version and call.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <ButtonLink href="/client" variant="secondary">
                View as the client
              </ButtonLink>
              <Button ref={doneRef} variant="primary" onClick={close}>
                Back to the review
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
              <div className={LABEL}>Market value · {versionLabel(version)}</div>
              <div className="tnum font-display text-[32px] font-semibold leading-10 tracking-[-0.02em]">
                {eur(valuation.marketValue)}
              </div>
              <div className="text-ink-2">
                {num(valuation.valuePerM2)} €/m² · {times(valuation.grossMultiplier)} gross market income
              </div>
              <div className="mt-1 text-xs leading-[18px] text-muted">
                Report to {deal.clientName} ({deal.clientSide}) · valuation date {dateLabel(deal.valuationDate)}
              </div>
            </div>

            <section aria-labelledby={callsId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h3 id={callsId} className="text-sm font-semibold">
                  AI judgement calls
                </h3>
                <span className="text-xs leading-[18px] text-ink-2">
                  <strong className="text-ink">
                    {reviewed} of {calls.length}
                  </strong>{" "}
                  reviewed
                  {acceptRemaining && open.length > 0 && ` · ${open.length} accepted at sign-off`}
                </span>
              </div>
              {calls.length === 0 ? (
                <p className="mt-2 text-ink-2">The AI made no judgement call that needs your eye.</p>
              ) : (
                <ol
                  aria-labelledby={callsId}
                  className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface"
                >
                  {calls.map((call) => (
                    <li key={call.id} className="px-3.5 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="min-w-0 font-semibold">
                          {call.number} · {call.title}
                        </span>
                        <span className={cx("text-xs leading-[18px]", STATE_CLASS[call.state])}>
                          <span aria-hidden="true">{statusGlyph(call.state, acceptRemaining)}</span>
                          {call.statusText}
                        </span>
                      </div>
                      {call.notes.map((note) => (
                        <p key={note} className="mt-1 text-xs italic leading-[18px] text-valuer">
                          Your note: “{note}”
                        </p>
                      ))}
                    </li>
                  ))}
                </ol>
              )}
              {open.length > 0 && !acceptRemaining && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-ai-weak px-3 py-2.5">
                  <p className="min-w-0 flex-[1_1_260px] text-[13px] leading-[19px] text-ai">
                    {openCallsText(open.length, unopened)}
                  </p>
                  <Button variant="secondary" onClick={() => setAcceptRemaining(true)}>
                    Accept remaining
                  </Button>
                </div>
              )}
            </section>

            <p className="text-xs leading-[18px] text-muted">
              You sign as the valuer of record; the AI prepared the draft. The report&apos;s review log records what you
              accepted or changed, and every version.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {!ready && (
                <p className="mr-auto min-w-0 flex-[1_1_200px] text-xs leading-[18px] text-ai">
                  Accept the remaining calls to sign, or cancel and review them first.
                </p>
              )}
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                aria-disabled={ready ? undefined : true}
                onClick={ready ? () => onSign(acceptRemaining) : undefined}
                className={cx(!ready && "cursor-not-allowed opacity-60")}
              >
                Sign &amp; send
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
