"use client";

/**
 * C4 · AI at work (spec §5.2, §5.3.4): the real run log of a submitted request. The documents the AI read come first,
 * with the time each reading took, then the pipeline's steps (lookups, rent estimate, scoring, computation,
 * cross-checks, flags, report draft) with their measured durations, revealed one by one right after the submit. It
 * ends with "With senior valuer for review" and **Open as Senior Valuer**, which switches the role.
 *
 * The client does not see the unsigned AI draft's value here: like the dashboard, it shows the value after sign-off.
 *
 * The deal is saved data and the id a dynamic segment: the page waits for the store to hydrate, and reads the id
 * inside a Suspense boundary (with Cache Components `useParams` suspends while the static shell is prerendered).
 */
import { useParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { RunLog, runLogRows, useRunReveal } from "@/components/client/RunLog";
import { AppBar } from "@/components/ui/AppBar";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { currentPipeline, useDemoHydrated, useDemoStore, type StoredDeal } from "@/lib/store/demoStore";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : iso;
}

function Placeholder() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="h-[72px] animate-pulse rounded-xl bg-surface" />
      <div className="h-[480px] animate-pulse rounded-xl bg-surface" />
    </div>
  );
}

function ProcessingView({ id, stored }: { id: string; stored: StoredDeal }) {
  const { deal } = stored;
  const rows = useMemo(() => runLogRows(deal, { hideDraftValue: true }), [deal]);
  const calls = useMemo(() => currentPipeline(stored).flags.length, [stored]);
  const { revealed, done } = useRunReveal(id, deal.documents.length, rows.length);
  const approved = deal.status === "approved";
  const a = deal.address;
  const units = deal.units.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 text-xs leading-[18px] text-muted">
            <span className="font-mono text-[11px] text-ink-2">{deal.id}</span>
            <span aria-hidden="true">·</span>
            <span>Requested {dateLabel(deal.requestedAt)}</span>
          </div>
          <h1 className="font-display text-[26px] font-semibold leading-8 tracking-[-0.01em]">AI at work</h1>
          <div className="text-ink-2">
            {a.street}, {a.zip} {a.city} · {units} {units === 1 ? "unit" : "units"}
          </div>
        </div>
        <div role="status">
          {done ? (
            <Pill tone={approved ? "ok" : "valuer"}>{approved ? "Delivered" : "With senior valuer"}</Pill>
          ) : (
            <Pill tone="ai">
              <span aria-hidden="true" className="size-2 rounded-full bg-ai-strong motion-safe:animate-pulse" />
              The AI is preparing the valuation…
            </Pill>
          )}
        </div>
      </div>

      <Card as="section" aria-labelledby="run-log-title" className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3.5">
          <h2 id="run-log-title" className="text-base font-semibold">
            Run log
          </h2>
          <span className="text-xs text-muted">Real steps with measured durations</span>
        </div>
        <RunLog rows={rows} revealed={revealed} />
      </Card>

      {done && (
        <Card
          as="section"
          aria-labelledby="handover-title"
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-valuer-line bg-valuer-weak p-4"
        >
          <div className="min-w-0 flex-[999_1_360px]">
            <h2 id="handover-title" className="text-base font-semibold text-valuer">
              {approved ? "Signed by K. Vogel · report delivered" : "With senior valuer for review"}
            </h2>
            <p className="mt-0.5 text-[13px] leading-[19px] text-ink-2">
              {approved
                ? "The senior valuer checked the AI's judgement calls and signed the valuation."
                : `K. Vogel, senior valuer, checks the AI's ${calls} judgement ${calls === 1 ? "call" : "calls"} and signs. You receive the report once it is signed.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {approved ? (
              <ButtonLink href={`/client/deals/${encodeURIComponent(id)}/report`} variant="primary">
                Open report
              </ButtonLink>
            ) : (
              <ButtonLink
                href={`/valuer/deals/${encodeURIComponent(id)}`}
                variant="valuer"
                onClick={() => useDemoStore.getState().setRole("valuer")}
              >
                Open as Senior Valuer
              </ButtonLink>
            )}
            <ButtonLink href="/client" variant="secondary">
              Back to valuations
            </ButtonLink>
          </div>
        </Card>
      )}
    </div>
  );
}

function Processing() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const hydrated = useDemoHydrated();
  const stored = useDemoStore((s) => s.deals[id]);

  if (!hydrated) return <Placeholder />;
  if (!stored) {
    return (
      <Card className="p-5">
        <h1 className="font-display text-[22px] font-semibold leading-7">This request is not in the demo</h1>
        <p className="mt-1 text-ink-2">
          It may have been removed by Reset demo. Your valuation requests are listed on the dashboard.
        </p>
        <ButtonLink href="/client" variant="primary" className="mt-4">
          Back to valuations
        </ButtonLink>
      </Card>
    );
  }
  return <ProcessingView key={id} id={id} stored={stored} />;
}

export default function ProcessingPage() {
  return (
    <>
      <AppBar persona="client" nav={[{ label: "Valuations", href: "/client", active: true }]} />
      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-5 sm:px-6">
        <div className="max-w-[1100px]">
          <Suspense fallback={<Placeholder />}>
            <Processing />
          </Suspense>
        </div>
      </main>
    </>
  );
}
