"use client";

/**
 * The orientation overlay (spec §5.1): on the first visit a short dialog explains the flow in three steps, "AI reads
 * and prepares → you check the flagged calls → you decide". Closing it marks it seen in the demo store (persisted);
 * the demo bar's "Orientation" button reopens it. It never opens by itself in recording mode.
 */
import { useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { useDemoHydrated, useDemoStore } from "@/lib/store/demoStore";
import { useRecordingMode } from "./recordingMode";

/** Whether the overlay was reopened from the demo bar. Not persisted. */
const useReopened = create<{ open: boolean }>(() => ({ open: false }));

/** Opens the overlay again (the demo bar's "Orientation" button). */
export function openOrientation(): void {
  useReopened.setState({ open: true });
}

const STEPS = [
  {
    title: "AI reads and prepares",
    actor: "≈ AI",
    tone: "bg-ai-weak text-ai",
    text: "The client uploads the property documents. The AI reads them, looks up public data, estimates the rents and drafts the valuation.",
  },
  {
    title: "You check the flagged calls",
    actor: "Senior valuer",
    tone: "bg-valuer-weak text-valuer",
    text: "The senior valuer sees the few judgement calls the AI made, biggest € impact first, each with its evidence. The rest is traced and cross-checked.",
  },
  {
    title: "You decide",
    actor: "Senior valuer",
    tone: "bg-brand-weak text-brand",
    text: "Accept a call, or send the AI a note and it revalues. Then sign: the client receives the report.",
  },
] as const;

/** The three steps as an ordered list; the sign-in page shows them too. */
export function OrientationSteps({ className }: { className?: string }) {
  return (
    <ol className={cx("flex flex-wrap gap-3", className)}>
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex min-w-0 flex-[1_1_190px] flex-col rounded-lg border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full font-display font-bold", step.tone)}>
              {i + 1}
            </span>
            <span className={cx("rounded-full px-2 py-px text-[11px] font-semibold leading-4", step.tone)}>{step.actor}</span>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="ml-auto text-faint">
                →
              </span>
            )}
          </div>
          <div className="mt-2 font-semibold">{step.title}</div>
          <p className="mt-1 text-[13px] leading-[19px] text-ink-2">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

function OrientationDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open as a modal before the first paint. Focus goes to the dialog itself: screen readers announce its title, Tab
  // reaches the buttons, and no focus ring greets a first visit.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.focus();
  }, []);

  const close = () => dialogRef.current?.close();
  const onClosed = () => {
    useDemoStore.getState().dismissOrientation();
    useReopened.setState({ open: false });
  };

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby="orientation-title"
      onClose={onClosed}
      // A click on the dialog element itself lands on the backdrop: the content below fills the dialog.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[760px] max-w-[calc(100%-32px)] rounded-xl border border-line bg-page p-0 text-ink shadow-xl backdrop:bg-ink/50"
      // The dialog itself only holds focus for screen readers; inline, because the global focus ring is unlayered.
      style={{ outline: "none" }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.04em] text-muted">Censio RE · prototype</div>
            <h2 id="orientation-title" className="mt-1 font-display text-[22px] font-semibold leading-7 tracking-[-0.01em]">
              How this demo works
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
        <p className="mt-2 text-ink-2">
          Censio prepares property valuations with AI; a senior valuer checks the AI&apos;s judgement calls and signs. All
          deals, documents and people here are sample data.
        </p>
        <OrientationSteps className="mt-4" />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-[1_1_260px] text-xs leading-[18px] text-muted">
            Switch roles or reset the demo in the dark bar at the top. “Orientation” there opens this guide again.
          </p>
          <Button variant="primary" onClick={close}>
            Got it
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function OrientationOverlay() {
  const hydrated = useDemoHydrated();
  const seen = useDemoStore((s) => s.orientationSeen);
  const reopened = useReopened((s) => s.open);
  const recording = useRecordingMode();
  // The saved "seen" flag is only known after hydration; the server and the hydration pass render nothing.
  if (!hydrated) return null;
  if (!reopened && (seen || recording)) return null;
  return <OrientationDialog />;
}
