"use client";

/**
 * The revision banner (spec §5.4 item 4, mockup "Revision"), between the deal header and the verdict band.
 * - While the AI revises a note: "AI is revising…", the note, and which figures depend on the change; those figures
 *   are outlined in the verdict band and the value path below.
 * - Once revised: "Revision n" with how the note was read (the AI's real duration, or demo mode), the note, the table
 *   of changes against the previous version, the AI's note and **Undo last revision**. Shown while a revision is the
 *   current version; undoing back to the AI draft hides it.
 * The mockup's "Attach source" button is dropped (spec: a dead button would be the first thing clicked).
 */
import type { RevalueFallback } from "@/app/api/revalue/route";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { FALLBACK_TEXT } from "./RevalueNoteFooter";
import { VALUER_INITIALS } from "./review";
import { revisionDomId, type RevisionView } from "./revision";

/** The note the AI is working on and the figures outlined meanwhile. */
export type RevisionWork = {
  note: string;
  /** The version the note revises. */
  versionN: number;
  /** Labels of the figures the note changes (or, before the answer, the figure of its call). */
  changed: string[];
  /** Labels of the figures that depend on them. */
  dependents: string[];
};

export type RevisionBannerProps = {
  dealId: string;
  /** The current revision; null while the AI draft is current. */
  view: RevisionView | null;
  /** While the AI revises a note. */
  working: RevisionWork | null;
  /** Why Live AI did not read the current revision's note, when known (this visit only). */
  fallback?: RevalueFallback | null;
  /** Undo last revision; absent once the valuer has signed. */
  onUndo?: () => void;
  className?: string;
};

const FRAME = "scroll-mt-4 rounded-xl border border-valuer-line bg-[#F6F3FF] px-4 py-4 sm:px-[18px]";
const CELL = "px-2 py-[5px] sm:px-3";

/** "A, B and C". */
function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function Working({ dealId, work, className }: { dealId: string; work: RevisionWork; className?: string }) {
  // As many placeholder rows as the table will about have, so the banner grows little when the result arrives.
  const rows = Math.min(6, Math.max(3, work.changed.length + work.dependents.length - 1));
  return (
    <section id={revisionDomId(dealId)} aria-label="Revision" aria-busy="true" className={cx(FRAME, className)}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-valuer-line border-t-valuer motion-reduce:animate-none"
        />
        <h2 className="text-base font-semibold text-valuer">AI is revising…</h2>
      </div>
      <p className="mt-2 italic text-valuer">Your note: “{work.note}”</p>
      <p className="mt-1.5 text-xs leading-[18px] text-ink-2">
        {work.changed.length > 0 ? (
          <>
            Outlined below: <strong className="font-semibold text-ink">{listText(work.changed)}</strong>
            {work.dependents.length > 0 && <> and the figures that depend on it: {listText(work.dependents)}</>}.
          </>
        ) : (
          <>Reading your note against v{work.versionN}…</>
        )}
      </p>
      <div aria-hidden="true" className="mt-2.5 flex flex-col gap-2 rounded-lg bg-surface px-3 py-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex animate-pulse gap-3 motion-reduce:animate-none">
            <div className="h-3 flex-[3_1_0] rounded bg-page" />
            <div className="h-3 flex-[1_1_0] rounded bg-page" />
            <div className="h-3 flex-[1_1_0] rounded bg-valuer-weak" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function RevisionBanner({ dealId, view, working, fallback = null, onUndo, className }: RevisionBannerProps) {
  if (working) return <Working dealId={dealId} work={working} className={className} />;
  if (!view) return null;
  return (
    <section id={revisionDomId(dealId)} aria-label="Revision" className={cx(FRAME, className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="min-w-0 text-base font-semibold text-valuer">{view.title}</h2>
        {onUndo && (
          <Button variant="secondary" onClick={onUndo} className="shrink-0">
            Undo last revision
          </Button>
        )}
      </div>
      {fallback ? (
        <p className="mt-0.5 text-xs leading-[18px] text-muted">{FALLBACK_TEXT[fallback]}</p>
      ) : (
        view.aiMode === "demo" && (
          <p className="mt-0.5 text-xs leading-[18px] text-muted">
            Demo mode: the rule-based parser read your note. With Live AI, Claude reads it.
          </p>
        )
      )}
      {view.note && <p className="mt-2 italic text-valuer">Your note: “{view.note}”</p>}

      <div className="mt-2.5 overflow-x-auto rounded-lg">
        <table aria-label="What changed" className="tnum w-full border-collapse bg-surface text-[13px] leading-[18px]">
          <thead>
            <tr className="text-muted">
              <th scope="col" className={cx(CELL, "border-b border-line py-1.5 text-left font-semibold")}>
                What changed
              </th>
              <th scope="col" className={cx(CELL, "border-b border-line py-1.5 text-right font-semibold")}>
                v{view.prevN}
              </th>
              <th scope="col" className={cx(CELL, "border-b border-line py-1.5 text-right font-semibold")}>
                v{view.n}
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className={cx(CELL, "text-left", row.total ? "border-t border-line py-1.5 font-bold" : "font-normal")}
                >
                  {row.label}
                  {row.byValuer && (
                    // On a phone the tag takes its own line, so the label keeps its words together.
                    <span className="block whitespace-nowrap text-[11px] font-semibold leading-4 text-valuer sm:inline">
                      <span className="sr-only sm:not-sr-only"> · </span>changed by {VALUER_INITIALS}
                    </span>
                  )}
                </th>
                <td className={cx(CELL, "text-right text-muted", row.total && "border-t border-line py-1.5")}>
                  <del className="whitespace-nowrap">{row.from}</del>
                </td>
                <td
                  className={cx(
                    CELL,
                    "text-right",
                    row.total ? "border-t border-line py-1.5 font-bold" : "font-semibold",
                    row.byValuer && "text-valuer",
                  )}
                >
                  <span className="whitespace-nowrap">{row.to}</span>
                  {row.change && (
                    <>
                      {" "}
                      <span className="whitespace-nowrap">({row.change})</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {view.rows.length === 0 && (
              <tr>
                <td colSpan={3} className={cx(CELL, "text-ink-2")}>
                  No figure changed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {view.explanation && (
        <div className="mt-2.5 rounded-lg bg-ai-weak px-3 py-2.5">
          <div className="text-xs font-semibold leading-[18px] text-ai">≈ AI note</div>
          <p>{view.explanation}</p>
        </div>
      )}
    </section>
  );
}
