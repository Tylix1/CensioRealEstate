"use client";

/**
 * The report page body, for the client's C5 "Report delivered" and the senior valuer's "Preview report draft" (V2).
 *
 * - `audience="client"` (/client/deals/[id]/report): the simulated email that delivers the signed report, with
 *   **Download PDF**, and the report itself, sections 1–9, built by `buildReport` from the stored deal. An unsigned
 *   deal has no report yet. The old `?preview=1` link still shows the draft.
 * - `audience="valuer"` (/valuer/deals/[id]/report): the same report as the valuer's preview, under the valuer's app
 *   bar, so previewing does not switch the demo to the client. An unsigned deal shows a "Draft — not signed" banner,
 *   and its PDF carries a draft watermark; a signed one shows the report as sent, without the client's inbox.
 *
 * The deal is saved data: the screen waits for the store to hydrate. The id and the flag are runtime URL data, read
 * with `useParams()` and `useSearchParams()`, so the pages render it inside a Suspense boundary (Cache Components).
 * The PDF is drawn in the browser only, on the Download click (DownloadPdfButton).
 */
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { DownloadPdfButton } from "@/components/report/DownloadPdfButton";
import { EmailCard } from "@/components/report/EmailCard";
import { ReportView } from "@/components/report/ReportView";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { buildReport, type ReportModel } from "@/lib/report/buildReport";
import { useDemoHydrated, useDemoStore, type StoredDeal } from "@/lib/store/demoStore";

export type ReportAudience = "client" | "valuer";

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

const reviewHref = (dealId: string) => `/valuer/deals/${encodeURIComponent(dealId)}`;

export function ReportPlaceholder() {
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

function NotFound({ audience }: { audience: ReportAudience }) {
  const client = audience === "client";
  return (
    <Card className="p-5">
      <h1 className="font-display text-[22px] font-semibold leading-7">
        {client ? "This request is not in the demo" : "Deal not found"}
      </h1>
      <p className="mt-1 text-ink-2">
        {client
          ? "It may have been removed by Reset demo. Your valuation requests are listed on the dashboard."
          : "This deal is not in the review queue. The demo may have been reset."}
      </p>
      <ButtonLink href={client ? "/client" : "/valuer"} variant="primary" className="mt-4">
        {client ? "Back to valuations" : "Back to the review queue"}
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
        <ButtonLink href={reviewHref(model.dealId)} variant="valuer">
          Back to the review
        </ButtonLink>
      </div>
    </section>
  );
}

/** The valuer's view of a signed report: what Demo Capital GmbH received, without the client's inbox. */
function SentBanner({ model }: { model: ReportModel }) {
  return (
    <section
      aria-labelledby="sent-banner-title"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-ok bg-public-weak p-4"
    >
      <div className="min-w-0 flex-[999_1_360px]">
        <h2 id="sent-banner-title" className="text-base font-semibold text-ok">
          Report sent to Demo Capital GmbH
        </h2>
        <p className="mt-0.5 text-[13px] leading-[19px] text-ink-2">
          The report as signed at {model.cover.versionLabel}, as the client received it.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <DownloadPdfButton model={model} label="Download PDF" variant="secondary" />
        <ButtonLink href={reviewHref(model.dealId)} variant="valuer">
          Back to the review
        </ButtonLink>
      </div>
    </section>
  );
}

function Report({ stored, model, audience }: { stored: StoredDeal; model: ReportModel; audience: ReportAudience }) {
  const client = audience === "client";
  let banner: ReactNode = null;
  if (model.draft) banner = <DraftBanner model={model} />;
  else if (!client) banner = <SentBanner model={model} />;
  else if (model.email) banner = <EmailCard email={model.email} model={model} />;
  return (
    <div className="flex flex-col gap-4">
      <PageHeading
        stored={stored}
        title={model.draft ? "Report preview" : client ? "Report delivered" : "Report sent"}
        status={
          <div role="status">
            {model.draft ? <Pill tone="ai">Draft · not signed</Pill> : <Pill tone="ok">Delivered</Pill>}
          </div>
        }
      />
      {banner}
      <ReportView model={model} />
      {!model.draft && client && (
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/client" variant="secondary">
            Back to valuations
          </ButtonLink>
        </div>
      )}
    </div>
  );
}

export function ReportScreen({ audience }: { audience: ReportAudience }) {
  const params = useParams<{ id: string }>();
  const previewFlag = useSearchParams().get("preview") === "1";
  const preview = audience === "valuer" || previewFlag;
  const id = decodeId(params.id);
  const hydrated = useDemoHydrated();
  const stored = useDemoStore((s) => s.deals[id]);
  const model = useMemo(() => (stored ? buildReport(stored) : null), [stored]);

  if (!hydrated) return <ReportPlaceholder />;
  if (!stored || !model) return <NotFound audience={audience} />;
  if (model.draft && !preview) return <NotReady stored={stored} />;
  return <Report stored={stored} model={model} audience={audience} />;
}
