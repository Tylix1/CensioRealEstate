"use client";

/**
 * The AI run log (spec §5.3.4): one row per document read (how it was read and how long it took), then the pipeline's
 * steps (lookups, rent estimate, scoring, computation with cross-checks and flags, report draft) with their measured
 * durations. C4 shows it; the review screen can show it as the deal's history (`runLogRows(deal)`).
 *
 * Right after a submit, C4 reveals the pipeline's steps one by one (600 ms apart); opened later, it shows the finished
 * log at once. Which deals to animate is kept in this module for the page session.
 */
import { useEffect, useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { cx } from "@/components/ui/cx";
import { formatDuration, type RunLogRow } from "./model";

export { runLogRows, type RunLogRow } from "./model";

/** Milliseconds between two revealed steps (plan Task 15). */
export const REVEAL_INTERVAL_MS = 600;

const toAnimate = new Set<string>();

/** Marks a just-submitted deal, so its AI-at-work page reveals the steps one by one. Call from the submit handler. */
export function queueRunAnimation(dealId: string): void {
  toAnimate.add(dealId);
}

/**
 * How many rows are done: the documents at once, then one more step every 600 ms for a just-submitted deal; every
 * row for any other. `done` turns true when the last row is revealed.
 */
export function useRunReveal(dealId: string, documents: number, total: number): { revealed: number; done: boolean } {
  const [animate] = useState(() => toAnimate.has(dealId));
  const [revealed, setRevealed] = useState(() => (animate ? Math.min(documents, total) : total));

  useEffect(() => {
    if (!animate) return;
    if (revealed >= total) {
      toAnimate.delete(dealId);
      return;
    }
    const timer = window.setTimeout(() => setRevealed((n) => n + 1), REVEAL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [animate, revealed, total, dealId]);

  const shown = animate ? revealed : total;
  return { revealed: shown, done: shown >= total };
}

function StepMarker({ state, failed }: { state: "done" | "running" | "waiting"; failed: boolean }) {
  if (state === "running") {
    return (
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ai-weak">
        <span className="size-3.5 rounded-full border-2 border-ai-light border-t-ai motion-safe:animate-spin" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        state === "waiting"
          ? "border border-line-strong text-faint"
          : failed
            ? "bg-[#FEF3F2] text-pen"
            : "bg-brand-weak text-brand",
      )}
    >
      {state === "done" ? (failed ? "!" : "✓") : null}
    </span>
  );
}

export function RunLog({ rows, revealed = rows.length, className }: { rows: RunLogRow[]; revealed?: number; className?: string }) {
  return (
    <ol aria-label="Run log" className={cx("flex flex-col", className)}>
      {rows.map((row, i) => {
        const state = i < revealed ? "done" : i === revealed ? "running" : "waiting";
        return (
          <li
            key={row.step}
            className={cx(
              "flex flex-wrap items-start gap-x-3 gap-y-1 border-t border-line px-4 py-3 first:border-t-0",
              state === "waiting" && "opacity-60",
            )}
          >
            <StepMarker state={state} failed={row.failed} />
            <div className="min-w-0 flex-[999_1_260px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">
                  <span className="mr-1.5 text-xs font-normal text-muted tnum">{row.step}</span>
                  {row.label}
                </span>
                <Pill size="sm" tone={row.tone}>
                  {row.kind}
                </Pill>
              </div>
              <div className={cx("mt-0.5 text-[13px] leading-[19px]", row.failed ? "text-pen" : "text-ink-2")}>
                {state === "done" ? row.result : state === "running" ? "Working…" : "Waiting"}
              </div>
            </div>
            <div className="ml-10 text-xs leading-[18px] text-muted tnum sm:ml-0 sm:w-20 sm:pt-1 sm:text-right">
              {state === "done" ? (
                <>
                  <span className="sr-only">Duration: </span>
                  {formatDuration(row.durationMs)}
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
