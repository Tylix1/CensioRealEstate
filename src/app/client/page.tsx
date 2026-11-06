"use client";

/**
 * C2 · Client dashboard (spec §5.2): the client's valuation requests with their status ("With senior valuer",
 * "Delivered"), the earlier report that was already delivered, and **New valuation**.
 *
 * The deals and the draft are saved data: the list renders placeholder rows until the store has hydrated.
 */
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { AppBar } from "@/components/ui/AppBar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { DELIVERED_ROW } from "@/lib/data/seed";
import type { Deal } from "@/lib/deal/types";
import { eur } from "@/lib/format";
import { currentPipeline, useDemoHydrated, useDemoStore, type DemoDraft, type StoredDeal } from "@/lib/store/demoStore";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "06 Nov 2026" from an ISO date or date-time (its calendar date as written; no clock, no time zone). */
function dateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${match[3]} ${month} ${match[1]}` : iso;
}

const DRAFT_STEPS: Record<DemoDraft["step"], string> = {
  1: "Property",
  2: "Documents",
  3: "Units",
  4: "Review & submit",
};

type Row = {
  id: string;
  /** e.g. "Requested 06 Nov 2026" */
  when: string;
  address: string;
  facts: string | null;
  status: { label: string; tone: PillTone; note: string };
  delivered: boolean;
  /** The signed market value; null until the senior valuer signs. */
  value: number | null;
  action: { label: string; href: string } | null;
};

function addressLine(deal: Pick<Deal, "address">): string {
  return `${deal.address.street}, ${deal.address.zip} ${deal.address.city}`;
}

function factsLine(deal: Deal): string {
  if (deal.scope === "unit") return deal.usageType === "living" ? "Apartment · single unit" : "Single unit";
  const kind = deal.usageType === "living" ? "Multi-family house" : deal.usageType === "hotel" ? "Hotel" : "Commercial";
  const units = deal.units.length;
  return `${kind} · whole building · ${units} ${units === 1 ? "unit" : "units"}`;
}

function rowFor(stored: StoredDeal): Row {
  const { deal, approval } = stored;
  const base = {
    id: deal.id,
    when: `Requested ${dateLabel(deal.requestedAt)}`,
    address: addressLine(deal),
    facts: factsLine(deal),
    delivered: deal.status === "approved",
  };
  switch (deal.status) {
    case "approved":
      return {
        ...base,
        status: {
          label: "Delivered",
          tone: "ok",
          note: approval ? `Signed by ${approval.signer} · ${dateLabel(approval.at)}` : "Report ready",
        },
        value: currentPipeline(stored).valuation.marketValue,
        action: { label: "Open report", href: `/client/deals/${deal.id}/report` },
      };
    case "in_review":
      return {
        ...base,
        status: { label: "With senior valuer", tone: "valuer", note: "K. Vogel is checking the AI's draft" },
        value: null,
        action: { label: "View progress", href: `/client/deals/${deal.id}/processing` },
      };
    case "processing":
      return {
        ...base,
        status: { label: "AI at work", tone: "ai", note: "The AI is preparing the valuation" },
        value: null,
        action: { label: "View progress", href: `/client/deals/${deal.id}/processing` },
      };
    case "draft":
      return { ...base, status: { label: "Draft", tone: "neutral", note: "Not submitted yet" }, value: null, action: null };
  }
}

/** The client's earlier request, delivered before the demo starts (static sample row). */
const DELIVERED: Row = {
  id: DELIVERED_ROW.id,
  when: "Earlier request",
  address: DELIVERED_ROW.address,
  facts: null,
  status: { label: "Delivered", tone: "ok", note: `Report delivered ${dateLabel(DELIVERED_ROW.deliveredAt)}` },
  delivered: true,
  value: DELIVERED_ROW.value,
  action: null,
};

function RequestRow({ row }: { row: Row }) {
  return (
    <li className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-page px-4 py-3.5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_200px_150px_160px] md:items-center">
      <div className="col-span-2 min-w-0 md:col-span-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs leading-[18px] text-muted">
          <span className="font-mono text-[11px] text-ink-2">{row.id}</span>
          <span aria-hidden="true">·</span>
          <span>{row.when}</span>
        </div>
        <div className="font-semibold">{row.address}</div>
        {row.facts && <div className="text-xs leading-[18px] text-ink-2">{row.facts}</div>}
      </div>
      <div className="min-w-0">
        <Pill tone={row.status.tone}>{row.status.label}</Pill>
        <div className="mt-1 text-xs leading-[18px] text-muted">{row.status.note}</div>
      </div>
      <div className="min-w-0 text-right">
        <div className="text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted">Market value</div>
        {row.value !== null ? (
          <div className="tnum font-display text-lg font-semibold leading-7">{eur(row.value)}</div>
        ) : (
          <div className="leading-7 text-ink-2">After sign-off</div>
        )}
      </div>
      {row.action ? (
        <div className="col-span-2 md:col-span-1 md:justify-self-end">
          <ButtonLink href={row.action.href} className="w-full md:w-auto">
            {row.action.label}
          </ButtonLink>
        </div>
      ) : (
        <div aria-hidden="true" className="hidden md:block" />
      )}
    </li>
  );
}

function PlaceholderRows() {
  return (
    <div aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="border-t border-page px-4 py-3.5 first:border-t-0">
          <div className="h-[58px] animate-pulse rounded-lg bg-page" />
        </div>
      ))}
    </div>
  );
}

function DraftNotice({ draft }: { draft: DemoDraft }) {
  const documents = draft.documents.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="font-semibold">Unfinished request</div>
        <div className="text-xs leading-[18px] text-muted">
          {addressLine(draft.skeleton)} · step {draft.step} of 4, {DRAFT_STEPS[draft.step]}
          {documents > 0 && ` · ${documents} ${documents === 1 ? "document" : "documents"}`}
        </div>
      </div>
      <ButtonLink href="/client/new">Continue request</ButtonLink>
    </div>
  );
}

const HOW_IT_RUNS = [
  { title: "You upload the documents", text: "Tenant list, land register, energy certificate and the like, as PDFs." },
  { title: "The AI prepares the valuation", text: "It reads the documents, looks up public data and estimates the rents." },
  { title: "A senior valuer checks and signs", text: "K. Vogel reviews the AI's judgement calls and can revalue." },
  { title: "You receive the report", text: "A PDF in which every figure names its source." },
];

export default function ClientDashboardPage() {
  const router = useRouter();
  const hydrated = useDemoHydrated();
  const deals = useDemoStore((s) => s.deals);
  const draft = useDemoStore((s) => s.draft);

  const rows = useMemo(
    () => [
      ...Object.values(deals)
        .sort((a, b) => b.deal.requestedAt.localeCompare(a.deal.requestedAt))
        .map(rowFor),
      DELIVERED,
    ],
    [deals],
  );
  const delivered = rows.filter((r) => r.delivered).length;

  const startNewValuation = () => {
    useDemoStore.getState().startDraft();
    router.push("/client/new");
  };

  return (
    <>
      <AppBar persona="client" nav={[{ label: "Valuations", href: "/client", active: true }]} />
      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="text-xs leading-[18px] text-muted">Demo Capital GmbH · buy-side</div>
            <h1 className="font-display text-[26px] font-semibold leading-8 tracking-[-0.01em]">Valuation requests</h1>
          </div>
          <Button variant="primary" onClick={startNewValuation}>
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            New valuation
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
            {hydrated && draft && <DraftNotice draft={draft} />}
            <Card as="section" aria-labelledby="requests-title" aria-busy={!hydrated} className="overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3.5">
                <h2 id="requests-title" className="text-base font-semibold">
                  Your requests
                </h2>
                {hydrated && (
                  <span className="text-xs text-muted">
                    {rows.length} requests · {delivered} delivered
                  </span>
                )}
              </div>
              {hydrated ? (
                <ul>
                  {rows.map((row) => (
                    <RequestRow key={row.id} row={row} />
                  ))}
                </ul>
              ) : (
                <PlaceholderRows />
              )}
            </Card>
          </div>

          <Card as="aside" aria-labelledby="how-it-runs-title" className="min-w-0 flex-[1_1_280px] p-4">
            <h2 id="how-it-runs-title" className="text-base font-semibold">
              How a request runs
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {HOW_IT_RUNS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-weak text-xs font-bold text-brand">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold">{step.title}</div>
                    <div className="text-xs leading-[18px] text-ink-2">{step.text}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </main>
    </>
  );
}
