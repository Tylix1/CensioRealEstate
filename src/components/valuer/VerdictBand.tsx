"use client";

/**
 * The verdict band (spec §5.4 item 5, mockup "Verdict"): the proposed market value with its version, the plausibility
 * dot strips, the provenance bar from the figure registry, and the actions: Approve & send report, Revalue… (a general
 * note to the AI), "x of n reviewed" and the report preview.
 *
 * Task 17 wires `onApprove` (the approval sheet) and `onSendGeneralNote` (/api/revalue), and passes `previousValue`
 * once revised; `previewHref` links the report draft. Without a handler, a button is shown but inactive. Once the
 * valuer has signed (`signed`), the sign-off takes the place of the actions and the general note.
 */
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { DotStrip, insideRange } from "@/components/ui/DotStrip";
import { cx } from "@/components/ui/cx";
import { eur, num, pct, times } from "@/lib/format";
import { PLAUSIBILITY } from "@/lib/lookups/plausibility";
import type { PipelineOutput } from "@/lib/pipeline/run";
import { countBySource, type SourceType } from "@/lib/registry/registry";
import { NoteBox } from "./NoteBox";
import { countLabel } from "./review";

/** The sign-off of an approved deal, as the verdict band shows it. */
export type VerdictSignOff = {
  signer: string;
  /** "06 Nov 2026" */
  date: string;
  /** The version signed. */
  version: number;
  /** The report's recipient, e.g. "Demo Capital GmbH". */
  client: string;
  /** Calls accepted at sign-off without being opened. */
  acceptedAtSignOff: number;
};

export type VerdictBandProps = {
  out: PipelineOutput;
  /** The current version's number: "AI draft v1", or "v2 · revised after your note". */
  versionNumber: number;
  /** The previous version's market value, struck through once revised (Task 17). */
  previousValue?: number | null;
  /** The previous version's name in the change line, e.g. "v1": "−6.9 % vs. v1". */
  previousLabel?: string;
  /** Calls reviewed (accepted or changed by the valuer) of all calls. */
  reviewed: number;
  /** Opens the approval sheet (Task 17). */
  onApprove?: () => void;
  /** Sends the general note of Revalue… (Task 17). */
  onSendGeneralNote?: (note: string) => void;
  /** Shown under the general note box, e.g. the AI's answer (Task 17). */
  generalNoteFooter?: ReactNode;
  /** Controlled text of the general note, e.g. to fill in an example note; without it the box keeps its own. */
  generalNote?: string;
  onGeneralNoteChange?: (note: string) => void;
  /** While the AI revises the general note: the box is read-only. */
  generalNoteSending?: boolean;
  /** The report draft (Task 18). */
  previewHref?: string;
  /** Registry figure ids to outline while the AI revises (Task 17); the value outlines when "marketValue" is in it. */
  outlined?: ReadonlySet<string>;
  /** Once the valuer has signed: the sign-off replaces the actions, and Revalue… is gone. */
  signed?: VerdictSignOff | null;
  className?: string;
};

/** Axes of the dot strips (mockup): the reference band sits at 25 % of each. */
const AXES = { perM2: [1800, 2800] as [number, number], grossMultiplier: [15, 25] as [number, number] };

const SOURCE_SEGMENTS: { type: SourceType; legend: string; spoken: string; swatch: string }[] = [
  { type: "client_document", legend: "Client documents", spoken: "from client documents", swatch: "bg-doc" },
  { type: "public_data", legend: "Public data", spoken: "from public data", swatch: "bg-public" },
  { type: "regulation", legend: "ImmoWertV rules", spoken: "from ImmoWertV rules", swatch: "bg-[#667085]" },
  { type: "calculated", legend: "Calculated", spoken: "calculated", swatch: "bg-calc" },
  { type: "ai_estimate", legend: "AI estimates", spoken: "AI estimates", swatch: "bg-ai-strong" },
  { type: "client_input", legend: "Changed by client", spoken: "changed by the client", swatch: "bg-doc-weak ring-1 ring-inset ring-doc" },
  { type: "valuer", legend: "Changed by valuer", spoken: "changed by the valuer", swatch: "bg-valuer" },
];

const LABEL = "text-xs font-semibold uppercase tracking-[0.04em] text-muted";

export function versionLabel(n: number): string {
  return n === 1 ? "AI draft v1" : `v${n} · revised after your note`;
}

function Plausibility({ out }: { out: PipelineOutput }) {
  const { valuePerM2, grossMultiplier } = out.valuation;
  const perM2 = PLAUSIBILITY.perM2;
  const multiplier = PLAUSIBILITY.grossMultiplier;
  const strips = [
    {
      title: `€/m² vs. ${perM2.label}`,
      inside: insideRange(perM2.range, valuePerM2),
      strip: (
        <DotStrip
          range={perM2.range}
          value={valuePerM2}
          axis={AXES.perM2}
          format={(n) => num(n)}
          ariaLabel={`Euro per square metre ${num(valuePerM2)}, ${insideRange(perM2.range, valuePerM2) ? "inside" : "outside"} the range ${num(perM2.range[0])} to ${num(perM2.range[1])}`}
        />
      ),
    },
    {
      title: `Gross multiplier vs. ${multiplier.label.charAt(0).toLowerCase()}${multiplier.label.slice(1)}`,
      inside: insideRange(multiplier.range, grossMultiplier),
      strip: (
        <DotStrip
          range={multiplier.range}
          value={grossMultiplier}
          axis={AXES.grossMultiplier}
          format={(n) => times(n)}
          ariaLabel={`Gross multiplier ${grossMultiplier.toFixed(1)}, ${insideRange(multiplier.range, grossMultiplier) ? "inside" : "outside"} the range ${multiplier.range[0].toFixed(1)} to ${multiplier.range[1].toFixed(1)}`}
        />
      ),
    },
  ];
  return (
    <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-3">
      <div className={LABEL}>Plausibility</div>
      {strips.map((s) => (
        <div key={s.title}>
          <div className="flex justify-between gap-2 text-xs leading-4 text-ink-2">
            <span>{s.title}</span>
            <span className={cx("font-semibold", s.inside ? "text-public" : "text-ai")}>
              {s.inside ? "inside" : "outside"}
            </span>
          </div>
          {s.strip}
        </div>
      ))}
    </div>
  );
}

function Provenance({ out }: { out: PipelineOutput }) {
  const counts = countBySource(out.registry);
  const total = out.registry.length;
  const flaggedAi = out.registry.filter((f) => f.sourceType === "ai_estimate" && f.flagId !== null).length;
  const traced = out.registry.filter((f) => f.flagId === null).length;
  const calls = out.flags.length;
  const shown = SOURCE_SEGMENTS.filter((s) => counts[s.type] > 0);
  const spoken = shown
    .map((s) =>
      s.type === "ai_estimate"
        ? `${counts.ai_estimate} ${s.spoken} of which ${flaggedAi} need review`
        : `${counts[s.type]} ${s.spoken}`,
    )
    .join(", ");
  return (
    <div className="min-w-0 flex-[1_1_250px]">
      <div className={LABEL}>Where the {total} numbers come from</div>
      <div role="img" aria-label={spoken} className="mt-2.5 flex h-3.5 gap-0.5 overflow-hidden rounded">
        {shown.flatMap((s) => {
          if (s.type !== "ai_estimate") {
            return [<div key={s.type} className={s.swatch} style={{ flex: `${counts[s.type]} 1 0` }} />];
          }
          const solid = counts.ai_estimate - flaggedAi;
          return [
            solid > 0 ? <div key="ai" className="bg-ai-strong" style={{ flex: `${solid} 1 0` }} /> : null,
            flaggedAi > 0 ? <div key="ai-flagged" className="hatch-ai" style={{ flex: `${flaggedAi} 1 0` }} /> : null,
          ];
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-4 text-ink-2">
        {shown.map((s) => (
          <li key={s.type} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={cx("size-2 rounded-[2px]", s.swatch)} />
            {s.legend} {counts[s.type]}
          </li>
        ))}
      </ul>
      <div className="mt-2 text-xs leading-[18px]">
        <strong>{traced}</strong> traced to a source and cross-checked
        {calls > 0 && (
          <>
            {" · "}
            <strong className="text-ai">{countLabel(calls, "AI judgement call")}</strong>{" "}
            {calls === 1 ? "needs" : "need"} your eye
          </>
        )}
      </div>
    </div>
  );
}

/** In place of the actions once signed: who signed which version, and that the report went out. */
function SignOff({ signed, calls, previewHref }: { signed: VerdictSignOff; calls: number; previewHref?: string }) {
  const unopened = signed.acceptedAtSignOff;
  return (
    <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-2">
      <div className="rounded-lg bg-public-weak px-3 py-2.5">
        <div className="font-semibold text-ok">
          <span aria-hidden="true">✓ </span>Signed by {signed.signer}
        </div>
        <div className="text-xs leading-[18px] text-ink-2">
          v{signed.version} · {signed.date}
        </div>
        <div className="mt-1 text-xs font-semibold leading-[18px] text-ink">Report sent to {signed.client}</div>
      </div>
      {calls > 0 && (
        <div className="text-xs leading-[18px] text-ink-2">
          You signed {countLabel(calls, "AI judgement call")} ·{" "}
          <strong className="text-ink">
            {calls - unopened} of {calls}
          </strong>{" "}
          reviewed
          {unopened > 0 && ` · ${unopened} accepted at sign-off without opening`}
        </div>
      )}
      {previewHref && (
        <a href={previewHref} className="inline-flex min-h-11 items-center text-xs">
          Preview the signed report
        </a>
      )}
    </div>
  );
}

export function VerdictBand({
  out,
  versionNumber,
  previousValue = null,
  previousLabel = "the previous version",
  reviewed,
  onApprove,
  onSendGeneralNote,
  generalNoteFooter,
  generalNote,
  onGeneralNoteChange,
  generalNoteSending = false,
  previewHref,
  outlined,
  signed = null,
  className,
}: VerdictBandProps) {
  const { valuation } = out;
  const [noteOpen, setNoteOpen] = useState(false);
  const noteId = useId();
  const calls = out.flags.length;
  const change =
    previousValue !== null && previousValue !== 0 ? (valuation.marketValue - previousValue) / previousValue : null;
  const valueOutlined = outlined?.has("marketValue") ?? false;

  return (
    <section
      aria-label="Verdict"
      className={cx("flex flex-wrap gap-x-6 gap-y-5 rounded-xl border border-line bg-surface px-5 py-[18px]", className)}
    >
      <div className="min-w-0 flex-[2_1_250px]">
        <div className={LABEL}>
          {signed ? `Signed market value · v${signed.version}` : `Proposed market value · ${versionLabel(versionNumber)}`}
        </div>
        {previousValue !== null && (
          <div className="tnum text-base text-muted">
            <del>{eur(previousValue)}</del>
          </div>
        )}
        <div className="tnum font-display text-[40px] font-semibold leading-[48px] tracking-[-0.02em]">
          {/* The outline hugs the figure and is drawn inside its line, clear of the label above. */}
          <span
            className={cx(
              "-mx-2 inline-block rounded-md px-2",
              valueOutlined && "outline-2 -outline-offset-2 outline-dashed outline-valuer",
            )}
          >
            {eur(valuation.marketValue)}
          </span>
        </div>
        <div className="text-ink-2">
          {num(valuation.valuePerM2)} €/m² · {times(valuation.grossMultiplier)} gross market income
          {change !== null && ` · ${change < 0 ? "−" : "+"}${pct(Math.abs(change))} vs. ${previousLabel}`}
        </div>
      </div>

      <Plausibility out={out} />
      <Provenance out={out} />

      {signed ? (
        <SignOff signed={signed} calls={calls} previewHref={previewHref} />
      ) : (
        <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-2">
          <Button
            variant="primary"
            onClick={onApprove}
            aria-disabled={onApprove ? undefined : true}
            className={cx("w-full", !onApprove && "cursor-not-allowed opacity-60")}
          >
            Approve &amp; send report
          </Button>
          <Button
            variant="secondary"
            aria-expanded={noteOpen}
            aria-controls={noteId}
            onClick={() => setNoteOpen((open) => !open)}
            className="w-full"
          >
            Revalue…
          </Button>
          <div className="text-xs leading-[18px] text-ink-2">
            You sign {countLabel(calls, "AI judgement call")} ·{" "}
            <strong className="text-ink">
              {reviewed} of {calls}
            </strong>{" "}
            reviewed
          </div>
          {previewHref && (
            <a href={previewHref} className="inline-flex min-h-11 items-center text-xs">
              Preview report draft
            </a>
          )}
        </div>
      )}

      {/* Kept mounted while closed, so a draft survives closing the box. */}
      {!signed && (
        <div id={noteId} hidden={!noteOpen} className="basis-full border-t border-line pt-4">
          <NoteBox
            label="General note to the AI (Revalue)"
            hint="For anything that is not one of the judgement calls below, e.g. a document the AI should use."
            value={generalNote}
            onChange={onGeneralNoteChange}
            onSend={onSendGeneralNote}
            sending={generalNoteSending}
            footer={generalNoteFooter}
          />
        </div>
      )}
    </section>
  );
}
