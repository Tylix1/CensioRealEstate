"use client";

/**
 * C3.4 · Review & submit (spec §5.2): a summary of the request, then **Submit**, which builds the deal from the draft
 * (`dealFromDraft`, i.e. `dealFromExtractions` plus the client's units and photos), hands it to the store
 * (`submitDraft`) and opens AI at work.
 */
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { eur, num } from "@/lib/format";
import { dealFromDraft, useDemoStore, type DemoDraft } from "@/lib/store/demoStore";
import { formatArea, missingDocumentTypes, reconcileUnits, sourceLabel, typeLabel, unitProblems, unitsSummary } from "./model";
import { queueRunAnimation } from "./RunLog";
import { WizardFooter, type WizardStep } from "./WizardParts";

const USAGE_WORDS: Record<DemoDraft["skeleton"]["usageType"], string> = {
  living: "Multi-family house",
  commercial: "Commercial property",
  hotel: "Hotel",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : iso;
}

/** What blocks submitting, as sentences. */
function submitProblems(draft: DemoDraft): string[] {
  const reading = draft.documents.filter((d) => d.status === "pending" || d.status === "reading").length;
  const { units } = reconcileUnits(draft);
  return [
    ...(reading > 0 ? [`Wait until the AI has read ${reading === 1 ? "the last document" : `the last ${reading} documents`}.`] : []),
    ...unitProblems(units),
  ];
}

function SummaryCard({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <Card as="section" aria-label={title} className="min-w-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <Button variant="ghost" onClick={onEdit} className="-my-2 -mr-2">
          {editLabel}
        </Button>
      </div>
      <div className="mt-1 text-[13px] leading-[19px] text-ink-2">{children}</div>
    </Card>
  );
}

export function ReviewStep({ draft, onGoTo }: { draft: DemoDraft; onGoTo: (step: WizardStep) => void }) {
  const router = useRouter();
  const [problems, setProblems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { skeleton, documents, photos } = draft;
  const units = draft.units ?? [];
  const summary = unitsSummary(units);
  const read = documents.filter((d) => d.status === "done");
  const notRead = documents.filter((d) => d.status === "failed");
  const missing = missingDocumentTypes(documents);
  const a = skeleton.address;

  const submit = () => {
    const current = useDemoStore.getState().draft;
    if (!current || submitting) return;
    const blocking = submitProblems(current);
    if (blocking.length > 0) {
      setProblems(blocking);
      return;
    }
    setSubmitting(true);
    const ready = { ...current, units: reconcileUnits(current).units };
    const deal = dealFromDraft(ready);
    // A photo of a unit that is no longer in the request stays with it as a photo of the building.
    const unitIds = new Set(deal.units.map((u) => u.id));
    deal.photos = deal.photos.map((p) => (p.unitId && !unitIds.has(p.unitId) ? { ...p, unitId: null } : p));
    const id = useDemoStore.getState().submitDraft(deal);
    queueRunAnimation(id);
    router.push(`/client/deals/${encodeURIComponent(id)}/processing`);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">
        Check the request. After you submit, the AI computes the valuation and a senior valuer checks it before you
        receive the report.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard title="Property" editLabel="Edit property" onEdit={() => onGoTo(1)}>
          <div className="font-semibold text-ink">
            {a.street}, {a.zip} {a.city}
          </div>
          <div>
            {USAGE_WORDS[skeleton.usageType]} · {skeleton.scope === "building" ? "whole building" : "single unit"}
          </div>
          <div>
            Market value (§ 194 BauGB) · valuation date {dateLabel(skeleton.valuationDate)} · desktop valuation, no
            internal inspection
          </div>
        </SummaryCard>

        <SummaryCard title="Units and photos" editLabel="Edit units" onEdit={() => onGoTo(3)}>
          <div className="font-semibold text-ink">
            {summary.count} {summary.count === 1 ? "unit" : "units"} · {formatArea(summary.areaM2)} m²
          </div>
          <div>
            {eur(summary.rentPerMonth, { decimals: 2 })} net cold rent per month
            {summary.vacant > 0 && ` · ${num(summary.vacant)} vacant`}
          </div>
          {(summary.edited > 0 || summary.manual > 0) && (
            <div>
              {[
                summary.edited > 0 && `${summary.edited} ${summary.edited === 1 ? "unit" : "units"} changed by you`,
                summary.manual > 0 && `${summary.manual} added by hand`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          <div>
            {photos.length === 0 ? "No photos" : `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
          </div>
        </SummaryCard>

        <SummaryCard title="Documents" editLabel="Edit documents" onEdit={() => onGoTo(2)}>
          {documents.length === 0 ? (
            <div>No documents uploaded.</div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {read.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span aria-hidden="true" className="font-bold text-ok">
                    ✓
                  </span>
                  <span className="text-ink">{typeLabel(d.type)}</span>
                  <Pill size="sm" tone={d.extractionSource === "live" ? "ai" : "neutral"}>
                    {sourceLabel(d.extractionSource)}
                  </Pill>
                </li>
              ))}
              {notRead.map((d) => (
                <li key={d.id} className="flex flex-wrap gap-x-2">
                  <span aria-hidden="true" className="font-bold text-pen">
                    !
                  </span>
                  <span className="break-all text-ink">{d.fileName}</span>
                  <span>not read: {d.error}</span>
                </li>
              ))}
            </ul>
          )}
          {missing.length > 0 && (
            <div className="mt-2 rounded-lg bg-ai-weak px-3 py-2 text-ai">
              Missing: {missing.map(typeLabel).join(", ")}. The senior valuer sees each as a flag.
            </div>
          )}
        </SummaryCard>

        <section aria-label="What happens next" className="min-w-0 rounded-xl border border-brand/15 bg-brand-weak p-4">
          <h3 className="text-base font-semibold">What happens next</h3>
          <ol className="mt-2 flex flex-col gap-2 text-[13px] leading-[19px] text-ink-2">
            {[
              "The AI looks up the land value and the cap rate, estimates the market rents, scores the modernisation and computes the value, with cross-checks.",
              "K. Vogel, senior valuer, checks the AI's judgement calls and signs.",
              "You receive the report as a PDF; every figure names its source.",
            ].map((text, i) => (
              <li key={text} className="flex gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0">{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <WizardFooter onBack={() => onGoTo(3)} problems={problems}>
        <Button variant="primary" size="lg" onClick={submit} disabled={submitting}>
          Submit
        </Button>
      </WizardFooter>
    </div>
  );
}
