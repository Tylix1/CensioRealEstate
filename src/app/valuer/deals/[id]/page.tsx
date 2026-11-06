"use client";

/**
 * V2 · Deal review (spec §5.4, mockup A v2): the queue rail, the deal header, the verdict band, "How the value is
 * built", the units, "Needs your eye" and the evidence pane. Every number comes from `currentPipeline(stored)`, the
 * pipeline of the deal's current version.
 *
 * The review state (calls opened and accepted, the spot-check, the revisions, the sign-off) lives in the store, so it
 * survives a reload; which item is focused, note drafts and the AI's answers are local. The deal is saved data: the
 * screen renders a placeholder of the same layout until the store has hydrated. The id is a runtime param, read with
 * `useParams()` inside <Suspense> (Cache Components).
 *
 * Revalue (V3): each call's note box and the verdict band's Revalue… send a note to /api/revalue (`useRevalue`); the
 * revision banner sits between the deal header and the verdict band. Approve (V4): the verdict band opens the approval
 * sheet; once signed, the review is read-only.
 */
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ApproveSheet } from "@/components/valuer/ApproveSheet";
import { DealHeader } from "@/components/valuer/DealHeader";
import { EvidencePane } from "@/components/valuer/EvidencePane";
import { NeedsYourEye } from "@/components/valuer/NeedsYourEye";
import { QueueRail, ValuerAppBar } from "@/components/valuer/QueueRail";
import { RevalueNoteFooter } from "@/components/valuer/RevalueNoteFooter";
import { RevisionBanner, type RevisionWork } from "@/components/valuer/RevisionBanner";
import { UnitsTable } from "@/components/valuer/UnitsTable";
import { ValuePath } from "@/components/valuer/ValuePath";
import { VerdictBand, type VerdictSignOff } from "@/components/valuer/VerdictBand";
import { dateLabel, flagDomId, scrollToId, type ReviewFocus } from "@/components/valuer/review";
import {
  GENERAL_NOTE_BOX,
  answerDomId,
  figureLabels,
  revisionView,
  wasNotes,
} from "@/components/valuer/revision";
import { useAiMode } from "@/components/valuer/useAiMode";
import { useRevalue } from "@/components/valuer/useRevalue";
import { runVersion, type PipelineOutput } from "@/lib/pipeline/run";
import { dependentsOf, type Figure } from "@/lib/registry/registry";
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

/** The verdict band's sign-off line once the valuer has signed. */
function signOffOf(stored: StoredDeal): VerdictSignOff | null {
  const { approval, deal } = stored;
  if (!approval) return null;
  return {
    signer: approval.signer,
    date: dateLabel(approval.at),
    version: approval.version,
    client: deal.clientName,
    acceptedAtSignOff: approval.acceptedAtSignOff.length,
  };
}

function ReviewScreen({ dealId, stored }: { dealId: string; stored: StoredDeal }) {
  const out = useMemo(() => currentPipeline(stored), [stored]);
  const statuses = useMemo(() => flagReviewStatuses(stored, out), [stored, out]);
  const spotFigure = useMemo(() => spotFigureOf(out), [out]);
  const { deal, history } = stored;
  const draftOut = useMemo(() => runVersion(deal, history, 1), [deal, history]);
  const titleNotes = useMemo(() => wasNotes(out, statuses, draftOut), [out, statuses, draftOut]);
  const revision = useMemo(() => revisionView(stored, out), [stored, out]);
  const [focus, setFocus] = useState<ReviewFocus>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const markOpened = useDemoStore((s) => s.markOpened);
  const setFlagStatus = useDemoStore((s) => s.setFlagStatus);
  const setSpotCheck = useDemoStore((s) => s.setSpotCheck);
  const approve = useDemoStore((s) => s.approve);
  const mode = useAiMode();
  const revalue = useRevalue(dealId, out);
  const { pending } = revalue;

  const reviewed = Object.values(statuses).filter((s) => s !== "open").length;
  const version = currentVersion(history);
  const signOff = signOffOf(stored);
  const signed = signOff !== null;

  const working: RevisionWork | null = pending
    ? {
        note: pending.note,
        versionN: pending.versionN,
        changed: figureLabels(out.registry, pending.figures),
        dependents: figureLabels(out.registry, dependentsOf(out.registry, pending.figures)),
      }
    : null;

  /** Under a note box: the AI's answer, and the example notes in Demo mode. */
  const noteFooter = (box: string) => (
    <RevalueNoteFooter
      answerId={answerDomId(dealId, box)}
      answer={revalue.answers[box]}
      examples={mode === "demo"}
      onPickExample={(note) => revalue.setDraft(box, note)}
      busy={pending !== null}
    />
  );

  /** Focuses a call and marks it opened; `scroll` brings its header into view (e.g. from a tile of the value path). */
  const focusFlag = (flagId: string, scroll?: ScrollLogicalPosition) => {
    setFocus({ kind: "flag", flagId });
    // A signed review is a record: reading a call afterwards does not change it.
    if (!signed) markOpened(dealId, flagId);
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
        <RevisionBanner
          dealId={dealId}
          view={revision}
          working={working}
          fallback={revision ? revalue.fallbacks[revision.n] : null}
          onUndo={signed ? undefined : revalue.undo}
        />
        <VerdictBand
          out={out}
          versionNumber={version.n}
          previousValue={revision?.prevValue ?? null}
          previousLabel={revision ? `v${revision.prevN}` : undefined}
          reviewed={reviewed}
          onApprove={signed || pending ? undefined : () => setSheetOpen(true)}
          onSendGeneralNote={(note) => void revalue.send(null, note)}
          generalNote={revalue.drafts[GENERAL_NOTE_BOX] ?? ""}
          onGeneralNoteChange={(note) => revalue.setDraft(GENERAL_NOTE_BOX, note)}
          generalNoteSending={pending?.box === GENERAL_NOTE_BOX}
          generalNoteFooter={noteFooter(GENERAL_NOTE_BOX)}
          previewHref={`/client/deals/${encodeURIComponent(dealId)}/report?preview=1`}
          outlined={revalue.outlined}
          signed={signOff}
        />
        <ValuePath
          out={out}
          statuses={statuses}
          onFocusFlag={(flagId) => focusFlag(flagId, "start")}
          outlined={revalue.outlined}
        />
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
            onSendNote={(flagId, note) => void revalue.send(flagId, note)}
            sendingFlagId={pending?.flagId ?? null}
            noteFooter={noteFooter}
            notes={revalue.drafts}
            onNoteChange={revalue.setDraft}
            titleNotes={titleNotes}
            readOnly={signed}
            acceptedAtSignOff={stored.approval?.acceptedAtSignOff}
          />
          <EvidencePane className="flex-[9_1_380px]" out={out} focus={focus} spotFigure={spotFigure} />
        </div>
        <p role="status" className="sr-only">
          {revalue.announcement}
        </p>
      </main>
      {sheetOpen && (
        <ApproveSheet
          stored={stored}
          out={out}
          statuses={statuses}
          onSign={(acceptRemaining) => approve(dealId, acceptRemaining)}
          onClose={() => setSheetOpen(false)}
        />
      )}
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
