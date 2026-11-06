"use client";

/**
 * V2 · Deal review (spec §5.4, mockup A v2): the queue rail, the deal header, the verdict band, "How the value is
 * built", the units, "Needs your eye" and the evidence pane. Every number comes from `currentPipeline(stored)`, the
 * pipeline of the deal's current version.
 *
 * The review state (calls opened and accepted, the spot-check) lives in the store, so it survives a reload; which item
 * is focused is local. The deal is saved data: the screen renders a placeholder of the same layout until the store has
 * hydrated. The id is a runtime param, read with `useParams()` inside <Suspense> (Cache Components).
 *
 * Task 17 adds the revision banner under the deal header, wires the note boxes and Revalue… to /api/revalue, and opens
 * the approval sheet from the verdict band (`onSendNote`, `onSendGeneralNote`, `onApprove`, `outlined`).
 */
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DealHeader } from "@/components/valuer/DealHeader";
import { EvidencePane } from "@/components/valuer/EvidencePane";
import { NeedsYourEye } from "@/components/valuer/NeedsYourEye";
import { QueueRail, ValuerAppBar } from "@/components/valuer/QueueRail";
import { UnitsTable } from "@/components/valuer/UnitsTable";
import { ValuePath } from "@/components/valuer/ValuePath";
import { VerdictBand } from "@/components/valuer/VerdictBand";
import { flagDomId, scrollToId, type ReviewFocus } from "@/components/valuer/review";
import type { PipelineOutput } from "@/lib/pipeline/run";
import type { Figure } from "@/lib/registry/registry";
import { currentVersion } from "@/lib/revisions/history";
import {
  currentPipeline,
  flagReviewStatuses,
  useDemoHydrated,
  useDemoStore,
  type StoredDeal,
} from "@/lib/store/demoStore";

const LAYOUT = "mx-auto flex max-w-[1440px] flex-wrap items-start gap-5 px-4 pb-12 pt-5 sm:px-6";
const RAIL = "min-w-0 flex-[1_1_248px]";
const CONTENT = "flex min-w-0 flex-[999_1_640px] flex-col gap-4";

/** The figure the spot-check asks the valuer to confirm: the plot area on the land register (plan Task 16). */
function spotFigureOf(out: PipelineOutput): Figure | null {
  const unquestioned = out.registry.filter((f) => f.quote !== null && f.flagId === null);
  return unquestioned.find((f) => f.id === "plotArea") ?? unquestioned[0] ?? null;
}

function decodeId(raw: string | string[] | undefined): string {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) return "";
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function ReviewSkeleton() {
  const block = "animate-pulse rounded-xl border border-line bg-surface";
  return (
    <div className={LAYOUT} aria-busy="true" aria-label="Loading the deal">
      <div className={`${RAIL} ${block} h-[480px]`} />
      <div className={CONTENT}>
        <div className={`${block} h-[170px]`} />
        <div className={`${block} h-[200px]`} />
        <div className={`${block} h-[112px]`} />
        <div className={`${block} h-[520px]`} />
      </div>
    </div>
  );
}

function DealNotFound() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-5 sm:px-6">
      <Card className="max-w-xl p-6">
        <h1 className="font-display text-2xl font-semibold">Deal not found</h1>
        <p className="mt-2 text-ink-2">This deal is not in the review queue. The demo may have been reset.</p>
        <ButtonLink href="/valuer" variant="primary" className="mt-4">
          Back to the review queue
        </ButtonLink>
      </Card>
    </main>
  );
}

function ReviewScreen({ dealId, stored }: { dealId: string; stored: StoredDeal }) {
  const out = useMemo(() => currentPipeline(stored), [stored]);
  const statuses = useMemo(() => flagReviewStatuses(stored, out), [stored, out]);
  const spotFigure = useMemo(() => spotFigureOf(out), [out]);
  const [focus, setFocus] = useState<ReviewFocus>(null);
  const markOpened = useDemoStore((s) => s.markOpened);
  const setFlagStatus = useDemoStore((s) => s.setFlagStatus);
  const setSpotCheck = useDemoStore((s) => s.setSpotCheck);

  const reviewed = Object.values(statuses).filter((s) => s !== "open").length;
  const version = currentVersion(stored.history);

  /** Focuses a call and marks it opened; `scroll` brings its header into view (e.g. from a tile of the value path). */
  const focusFlag = (flagId: string, scroll?: ScrollLogicalPosition) => {
    setFocus({ kind: "flag", flagId });
    markOpened(dealId, flagId);
    if (scroll) scrollToId(flagDomId(dealId, flagId), scroll);
  };

  /** Accepts a call and moves on to the next call still open, after it and then from the top. */
  const accept = (flagId: string) => {
    setFlagStatus(dealId, flagId, "accepted");
    const order = out.flags.map((f) => f.id);
    const at = order.indexOf(flagId);
    const next = [...order.slice(at + 1), ...order.slice(0, at)].find((id) => statuses[id] === "open");
    if (next) focusFlag(next, "nearest");
  };

  return (
    <div className={LAYOUT}>
      <QueueRail activeId={dealId} className={RAIL} />
      <main className={CONTENT}>
        <DealHeader out={out} />
        {/* Task 17: the RevisionBanner of the current revision goes here. */}
        <VerdictBand out={out} versionNumber={version.n} reviewed={reviewed} />
        <ValuePath out={out} statuses={statuses} onFocusFlag={(flagId) => focusFlag(flagId, "start")} />
        <UnitsTable out={out} />
        <div className="flex flex-wrap items-start gap-4">
          <NeedsYourEye
            className="flex-[11_1_480px]"
            out={out}
            statuses={statuses}
            focus={focus}
            onFocusFlag={(flagId) => focusFlag(flagId)}
            onAccept={accept}
            onReopen={(flagId) => setFlagStatus(dealId, flagId, "open")}
            spotCheck={spotFigure ? { figure: spotFigure, status: stored.spotCheck } : null}
            onFocusSpotCheck={() => setFocus({ kind: "spot" })}
            onSpotCheckMatches={() => setSpotCheck(dealId, "matches")}
          />
          <EvidencePane className="flex-[9_1_380px]" out={out} focus={focus} spotFigure={spotFigure} />
        </div>
      </main>
    </div>
  );
}

function DealReview() {
  const params = useParams<{ id: string }>();
  const dealId = decodeId(params.id);
  const hydrated = useDemoHydrated();
  const stored = useDemoStore((s) => s.deals[dealId]);
  if (!hydrated) return <ReviewSkeleton />;
  if (!stored) return <DealNotFound />;
  return <ReviewScreen key={dealId} dealId={dealId} stored={stored} />;
}

export default function DealReviewPage() {
  return (
    <>
      <ValuerAppBar />
      <Suspense fallback={<ReviewSkeleton />}>
        <DealReview />
      </Suspense>
    </>
  );
}
