"use client";

/**
 * C5 · Report delivered (spec §5.2 and §5.6): the simulated email that delivers the signed report, with **Download
 * PDF**, and the report itself, sections 1–9, built by `buildReport` from the stored deal.
 *
 * `?preview=1` is the senior valuer's "Preview report draft" (V2): for a deal not signed yet the page shows the same
 * report with a "Draft — not signed" banner, and its PDF carries a draft watermark. Without the flag, an unsigned deal
 * has no report yet.
 *
 * The deal is saved data: the page waits for the store to hydrate. The id and the flag are runtime URL data, read with
 * `useParams()` and `useSearchParams()` inside a Suspense boundary (Cache Components). The PDF is drawn in the browser
 * only, on the Download click (DownloadPdfButton).
 */
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo, type ReactNode } from "react";
import { DownloadPdfButton } from "@/components/report/DownloadPdfButton";
import { EmailCard } from "@/components/report/EmailCard";
import { ReportView } from "@/components/report/ReportView";
import { AppBar } from "@/components/ui/AppBar";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { buildReport, type ReportModel } from "@/lib/report/buildReport";
import { useDemoHydrated, useDemoStore, type StoredDeal } from "@/lib/store/demoStore";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "06 Nov 2026" from an ISO date or date-time (its calendar date as written; no clock). */
function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : iso;
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

function Placeholder() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="h-[72px] animate-pulse rounded-xl bg-surface" />
      <div className="h-[320px] animate-pulse rounded-xl bg-surface" />
      <div className="h-[640px] animate-pulse rounded-xl bg-surface" />
    </div>
  );
}

function PageHeading({ stored, title, status }: { stored: StoredDeal; title: string; status: ReactNode }) {
  const { deal } = stored;
  const a = deal.address;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 text-xs leading-[18px] text-muted">
          <span className="font-mono text-[11px] text-ink-2">{deal.id}</span>
          <span aria-hidden="true">·</span>
          <span>Requested {dateLabel(deal.requestedAt)}</span>
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-8 tracking-[-0.01em]">{title}</h1>
        <div className="text-ink-2">
          {a.street}, {a.zip} {a.city}
        </div>
      </div>
      {status}
    </div>
  );
}

function NotFound() {
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

function NotReady({ stored }: { stored: StoredDeal }) {
  const id = encodeURIComponent(stored.deal.id);
  return (
    <div className="flex flex-col gap-4">
      <PageHeading stored={stored} title="Report" status={<Pill tone="valuer">With senior valuer</Pill>} />
      <Card as="section" aria-labelledby="not-ready-title" className="p-5">
        <h2 id="not-ready-title" className="font-display text-xl font-semibold leading-7">
          Your report is not ready yet
        </h2>
        <p className="mt-1 max-w-[640px] text-ink-2">
          K. Vogel, senior valuer, is checking the AI&apos;s draft. You receive the report by email as soon as it is
          signed.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href={`/client/deals/${id}/processing`} variant="primary">
            View progress
          </ButtonLink>
          <ButtonLink href="/client" variant="secondary">
            Back to valuations
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}

function DraftBanner({ model }: { model: ReportModel }) {
  return (
    <section
      aria-labelledby="draft-banner-title"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-ai-strong bg-ai-weak p-4"
    >
      <div className="min-w-0 flex-[999_1_360px]">
        <h2 id="draft-banner-title" className="text-base font-semibold text-ai">
          Draft — not signed
        </h2>
        <p className="mt-0.5 text-[13px] leading-[19px] text-ink-2">
          A preview of the report at {model.cover.versionLabel}. Demo Capital GmbH receives it only after the senior
          valuer signs; until then the PDF carries a draft watermark.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <DownloadPdfButton model={model} label="Download draft PDF" variant="secondary" />
        <ButtonLink href={`/valuer/deals/${encodeURIComponent(model.dealId)}`} variant="valuer">
          Back to the review
        </ButtonLink>
      </div>
    </section>
  );
}

function Report({ stored, model }: { stored: StoredDeal; model: ReportModel }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeading
        stored={stored}
        title={model.draft ? "Report preview" : "Report delivered"}
        status={
          <div role="status">
            {model.draft ? <Pill tone="ai">Draft · not signed</Pill> : <Pill tone="ok">Delivered</Pill>}
          </div>
        }
      />
      {model.draft ? <DraftBanner model={model} /> : model.email && <EmailCard email={model.email} model={model} />}
      <ReportView model={model} />
      {!model.draft && (
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/client" variant="secondary">
            Back to valuations
          </ButtonLink>
        </div>
      )}
    </div>
  );
}

function ReportScreen() {
  const params = useParams<{ id: string }>();
  const preview = useSearchParams().get("preview") === "1";
  const id = decodeId(params.id);
  const hydrated = useDemoHydrated();
  const stored = useDemoStore((s) => s.deals[id]);
  const model = useMemo(() => (stored ? buildReport(stored) : null), [stored]);

  if (!hydrated) return <Placeholder />;
  if (!stored || !model) return <NotFound />;
  if (model.draft && !preview) return <NotReady stored={stored} />;
  return <Report stored={stored} model={model} />;
}

export default function ReportPage() {
  return (
    <>
      <AppBar persona="client" nav={[{ label: "Valuations", href: "/client", active: true }]} />
      <main className="mx-auto max-w-[1100px] px-4 pb-12 pt-5 sm:px-6">
        <Suspense fallback={<Placeholder />}>
          <ReportScreen />
        </Suspense>
      </main>
    </>
  );
}
