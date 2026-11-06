"use client";

/**
 * The deal header of the review screen (spec §5.4 item 3, mockup "Deal"): the client's facade photo, a mini map with
 * the plot and the BORIS zone, ID, address, facts, basis and scope, and the status with a summary of what the AI did
 * and how long it took.
 */
import Image from "next/image";
import { Fragment, useMemo } from "react";
import { DealMap } from "@/components/map/DealMap";
import { samplePlotOutline } from "@/components/map/geo";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { cx } from "@/components/ui/cx";
import { samplePath } from "@/lib/data/seed";
import type { Deal } from "@/lib/deal/types";
import { num } from "@/lib/format";
import type { PipelineOutput } from "@/lib/pipeline/run";
import {
  areaLabel,
  countLabel,
  dateLabel,
  durationLabel,
  parcelNumber,
  propertyKind,
  yearSpan,
} from "./review";
import { useStoredImageUrl } from "./useStoredFile";

export type DealHeaderProps = {
  out: PipelineOutput;
  className?: string;
};

/** Width of the photo and the mini map on a wide screen, in px; they share the row on a phone. */
const PHOTO_WIDTH = 168;
const MAP_HEIGHT = 120;
/** Shown when the deal has no facade photo, or its file is not stored in this browser. */
const SAMPLE_FACADE = samplePath("foto_fassade.jpg");
/** The sample BORIS table and the sample market report. */
const PUBLIC_REGISTERS = 2;

const STATUS: Record<Deal["status"], { label: string; tone: PillTone }> = {
  in_review: { label: "Awaiting your review", tone: "ai" },
  approved: { label: "Signed · report sent", tone: "ok" },
  processing: { label: "AI at work", tone: "ai" },
  draft: { label: "Draft", tone: "neutral" },
};

/** "Multi-family house", "whole building", "8 units", "565 m² living area", "plot 480 m²", "built 1912, modernised 2014–2019". */
export function factsParts(out: PipelineOutput): string[] {
  const { deal, valuation } = out;
  const { plotM2, builtYear, refurbishments } = deal.property;
  const modernised = yearSpan(refurbishments.map((m) => m.year));
  const built = builtYear === null ? "year of construction unknown" : `built ${builtYear}`;
  return [
    propertyKind(deal),
    deal.scope === "building" ? "whole building" : "single unit",
    countLabel(deal.units.length, "unit"),
    `${areaLabel(valuation.livingAreaM2)} m² living area`,
    plotM2 === null ? "plot area unknown" : `plot ${areaLabel(plotM2)} m²`,
    modernised ? `${built}, modernised ${modernised}` : built,
  ];
}

/** Parts joined by " · "; a line breaks between parts, never inside one. */
function Parts({ parts }: { parts: string[] }) {
  return parts.map((part, i) => (
    <Fragment key={part}>
      {i > 0 && " · "}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ));
}

/** What the AI did, and how long it took when every document was read in this demo (the seed's were read before). */
function PrepSummary({ out }: { out: PipelineOutput }) {
  const { deal } = out;
  const read = deal.documents.filter((d) => d.status === "done");
  const failed = deal.documents.filter((d) => d.status === "failed").length;
  const pages = read.reduce((sum, d) => sum + d.pages, 0);
  const listings = out.rent.recentCount + out.rent.olderCount;
  const photos = deal.photos.length;
  const what = [
    `read ${countLabel(read.length, "document")} (${countLabel(pages, "page")})${photos > 0 ? ` and ${countLabel(photos, "photo")}` : ""}`,
    `queried ${PUBLIC_REGISTERS} public registers`,
    `compared ${countLabel(listings, "rental listing")}`,
  ].join(", ");
  const unread = failed > 0 ? `; ${countLabel(failed, "document")} could not be read` : "";
  const pipelineMs = deal.runLog.reduce((sum, step) => sum + step.durationMs, 0);
  const measured = read.length > 0 && read.every((d) => d.durationMs !== null);
  if (measured) {
    const readingMs = read.reduce((sum, d) => sum + (d.durationMs ?? 0), 0);
    return (
      <>
        AI-prepared in <strong className="font-semibold text-ink">{durationLabel(readingMs + pipelineMs)}</strong>:{" "}
        {what}
        {unread}.
      </>
    );
  }
  return (
    <>
      AI-prepared: {what}
      {unread}; the valuation ran in <strong className="font-semibold text-ink">{durationLabel(pipelineMs)}</strong>.
    </>
  );
}

function FacadePhoto({ deal }: { deal: Deal }) {
  const facade = deal.photos.find((p) => p.unitId === null) ?? null;
  const stored = useStoredImageUrl(facade?.id ?? null, facade?.fileName ?? null);
  const fromClient = facade !== null && typeof stored === "string";
  const url = stored === undefined && facade ? null : fromClient ? stored : SAMPLE_FACADE;
  return (
    <figure className="m-0 min-w-0 max-w-[168px] flex-1">
      <div className={cx("relative h-[120px] w-full overflow-hidden rounded-lg bg-[#DCE6F0]", !url && "animate-pulse")}>
        {url && (
          <Image
            src={url}
            alt={fromClient ? "Facade photo uploaded by the client" : "Sample facade photo"}
            fill
            sizes={`${PHOTO_WIDTH}px`}
            unoptimized
            className="object-cover"
          />
        )}
      </div>
      <figcaption className="mt-1 text-[11px] leading-4 text-muted">
        {fromClient ? "Client photo · facade" : "Sample photo · facade"}
      </figcaption>
    </figure>
  );
}

function PlotMap({ out }: { out: PipelineOutput }) {
  const { address, property } = out.deal;
  const plot = useMemo(() => samplePlotOutline(address.lat, address.lng), [address.lat, address.lng]);
  const parcel = parcelNumber(property.parcel);
  const { land } = out;
  const zoneLabel =
    land.note === null ? `zone ${land.zone} · ${num(land.valuePerM2)} €/m²` : `no sample zone · ${num(land.valuePerM2)} €/m²`;
  return (
    <figure className="m-0 min-w-0 max-w-[168px] flex-1">
      <DealMap
        lat={address.lat}
        lng={address.lng}
        plot={plot}
        zoneLabel={zoneLabel}
        height={MAP_HEIGHT}
        label={`Map: plot ${parcel ?? "outline"} inside the land-value zone (${zoneLabel})`}
      />
      <figcaption className="mt-1 text-[11px] leading-4 text-muted">
        Plot{parcel ? ` ${parcel}` : ""} · BORIS zone (sample map)
      </figcaption>
    </figure>
  );
}

export function DealHeader({ out, className }: DealHeaderProps) {
  const { deal } = out;
  const status = STATUS[deal.status];
  return (
    <section
      aria-label="Deal"
      className={cx(
        "flex flex-wrap items-start gap-x-5 gap-y-3.5 rounded-xl border border-line bg-surface p-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-[0_1_346px] gap-2.5">
        <FacadePhoto deal={deal} />
        <PlotMap out={out} />
      </div>
      <div className="min-w-0 flex-[999_1_360px]">
        <div className="flex flex-wrap items-center gap-x-2 text-xs leading-[18px] text-muted">
          <span className="font-mono">{deal.id}</span>
          <span aria-hidden="true">·</span>
          <span>
            Requested {dateLabel(deal.requestedAt)} by {deal.clientName} ({deal.clientSide})
          </span>
        </div>
        <h1 className="mb-1.5 mt-1 font-display text-[26px] font-semibold leading-8 tracking-[-0.01em]">
          {deal.address.street}, {deal.address.zip} {deal.address.city}
        </h1>
        <div className="text-ink-2">
          <Parts parts={factsParts(out)} />
        </div>
        <div className="mt-0.5 text-ink-2">
          <Parts
            parts={[
              "Market value (§ 194 BauGB)",
              `valuation date ${dateLabel(deal.valuationDate)}`,
              "desktop valuation, no internal inspection",
            ]}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Pill tone={status.tone}>{status.label}</Pill>
          <span className="text-xs leading-[18px] text-ink-2">
            <PrepSummary out={out} />
          </span>
        </div>
      </div>
    </section>
  );
}
