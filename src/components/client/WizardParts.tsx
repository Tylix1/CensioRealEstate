"use client";

/**
 * Small building blocks shared by the wizard's steps: the step indicator, the Back/Next footer and the status line
 * for skipped files or blocked steps.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

export type WizardStep = 1 | 2 | 3 | 4;

export const STEP_TITLES: Record<WizardStep, string> = {
  1: "Property",
  2: "Documents",
  3: "Units",
  4: "Review & submit",
};

/** The four steps; earlier ones can be reopened, later ones are reached with Next. */
export function StepIndicator({ step, onGoTo }: { step: WizardStep; onGoTo: (step: WizardStep) => void }) {
  const steps = [1, 2, 3, 4] as const;
  return (
    <nav aria-label="Steps of the request">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {steps.map((s) => {
          const done = s < step;
          const current = s === step;
          const marker = (
            <>
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  current ? "bg-brand text-white" : done ? "bg-brand-weak text-brand" : "border border-line-strong text-muted",
                )}
              >
                {done ? "✓" : s}
              </span>
              <span className={cx("whitespace-nowrap", current ? "font-semibold text-ink" : "text-ink-2")}>
                <span className="sr-only">Step {s}: </span>
                {STEP_TITLES[s]}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </>
          );
          return (
            <li key={s} className="flex items-center gap-1" aria-current={current ? "step" : undefined}>
              {done ? (
                <button
                  type="button"
                  onClick={() => onGoTo(s)}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-surface"
                >
                  {marker}
                </button>
              ) : (
                <span className="flex min-h-11 items-center gap-2 px-2">{marker}</span>
              )}
              {s < 4 && (
                <span aria-hidden="true" className="hidden h-px w-6 bg-line-strong sm:block">
                  {" "}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A polite live region for messages such as skipped files. The region itself stays in the page (empty, without size)
 * so screen readers announce a message when it appears; `boxClassName` places the visible box.
 */
export function StatusNote({
  message,
  tone = "info",
  onDismiss,
  boxClassName,
}: {
  message: string | null;
  tone?: "info" | "warn";
  onDismiss?: () => void;
  boxClassName?: string;
}) {
  return (
    <div role="status">
      {message && (
        <div
          className={cx(
            "flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-[13px] leading-[19px]",
            tone === "warn" ? "bg-ai-weak text-ai" : "bg-rule-weak text-ink-2",
            boxClassName,
          )}
        >
          <span className="min-w-0 pt-1">{message}</span>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="-my-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-white/60"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Back on the left, the step's main action on the right, and why the step cannot be left yet. */
export function WizardFooter({
  onBack,
  backLabel = "Back",
  children,
  problems = [],
  hint,
}: {
  onBack?: () => void;
  backLabel?: string;
  /** The main action (Next, Continue with sample, Submit). */
  children: ReactNode;
  /** Shown when the main action was refused. */
  problems?: string[];
  /** A short line next to the main action, e.g. why it is disabled. */
  hint?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      {problems.length > 0 && (
        <div role="alert" className="rounded-lg border border-pen/30 bg-[#FEF3F2] px-3 py-2 text-[13px] leading-[19px] text-pen">
          {problems.length === 1 ? (
            problems[0]
          ) : (
            <ul className="list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {onBack && (
            <Button variant="secondary" onClick={onBack}>
              <span aria-hidden="true">←</span>
              {backLabel}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {hint && <span className="text-xs leading-[18px] text-muted">{hint}</span>}
          {children}
        </div>
      </div>
    </div>
  );
}
