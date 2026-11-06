"use client";

/**
 * C3 · New valuation (spec §5.2): the client's request in four steps, C3.1 Property, C3.2 Documents, C3.3 Units and
 * C3.4 Review & submit.
 *
 * Everything lives in the store's draft (persisted), so a reload, going back and forth, or leaving and coming back
 * via "Continue request" resumes where the client was; the uploaded files are in IndexedDB. The draft is started here
 * only when there is none (the dashboard's New valuation starts a fresh one), and only on hydration or when the page
 * is shown again, never when it disappears on submit: submitting closes the draft while this page is still mounted.
 */
import { useEffect, useRef } from "react";
import { DocumentsStep } from "@/components/client/DocumentsStep";
import { isUsableDraft } from "@/components/client/model";
import { PropertyStep } from "@/components/client/PropertyStep";
import { ReviewStep } from "@/components/client/ReviewStep";
import { UnitsStep, prepareUnits } from "@/components/client/UnitsStep";
import { resumeReading } from "@/components/client/uploads";
import { STEP_TITLES, StepIndicator, type WizardStep } from "@/components/client/WizardParts";
import { AppBar } from "@/components/ui/AppBar";
import { ButtonLink } from "@/components/ui/Button";
import { useDemoHydrated, useDemoStore } from "@/lib/store/demoStore";

function Placeholder() {
  return (
    <div aria-hidden="true" className="mt-4 flex flex-col gap-4">
      <div className="h-11 w-full max-w-[640px] animate-pulse rounded-lg bg-surface" />
      <div className="h-[440px] animate-pulse rounded-xl bg-surface" />
    </div>
  );
}

function goTo(step: WizardStep): void {
  // The units step starts from the tenant list as it is now (and keeps the client's edits when it is unchanged).
  if (step === 3) prepareUnits();
  useDemoStore.getState().updateDraft({ step });
}

export default function NewValuationPage() {
  const hydrated = useDemoHydrated();
  const draft = useDemoStore((s) => s.draft);
  const ready = hydrated && isUsableDraft(draft);
  const step = ready ? draft.step : null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef<WizardStep | null>(null);

  // Not on `draft`: after a submit the draft is null while this page is still mounted, and must stay null.
  useEffect(() => {
    if (!hydrated) return;
    if (!isUsableDraft(useDemoStore.getState().draft)) useDemoStore.getState().startDraft();
    resumeReading();
  }, [hydrated]);

  // A new step: focus its heading (screen readers announce it) and start at the top.
  useEffect(() => {
    if (step === null) return;
    if (shownStep.current !== null && shownStep.current !== step) {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
    shownStep.current = step;
  }, [step]);

  return (
    <>
      <AppBar persona="client" nav={[{ label: "Valuations", href: "/client", active: true }]} />
      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="text-xs leading-[18px] text-muted">Demo Capital GmbH · buy-side</div>
            <h1 className="font-display text-[26px] font-semibold leading-8 tracking-[-0.01em]">New valuation</h1>
          </div>
          <ButtonLink href="/client" variant="ghost">
            Save and exit
          </ButtonLink>
        </div>

        {ready && step !== null ? (
          <>
            <div className="mt-2">
              <StepIndicator step={step} onGoTo={goTo} />
            </div>
            <section aria-labelledby="step-title" className="mt-3">
              <h2
                id="step-title"
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-xl font-semibold leading-7 tracking-[-0.01em]"
              >
                {STEP_TITLES[step]}
              </h2>
              <div className="mt-3">
                {step === 1 && <PropertyStep draft={draft} onNext={() => goTo(2)} />}
                {step === 2 && <DocumentsStep draft={draft} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
                {step === 3 && <UnitsStep draft={draft} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
                {step === 4 && <ReviewStep draft={draft} onGoTo={goTo} />}
              </div>
            </section>
          </>
        ) : (
          <Placeholder />
        )}
      </main>
    </>
  );
}
