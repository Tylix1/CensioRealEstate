"use client";

/**
 * The units of the deal (spec §5.4 item 7, mockup "Units"): one row per unit with m², in-place and AI market rent per
 * m², gap, lease start and value share; a row opens to floor, rooms, features, the rents per month with their sources,
 * the AI's note on the estimate, and the unit's photos. **Expand all units**, a total row, and the sentence that the
 * unit values are a split of one building value (spec §5.3.3). On a phone the rows keep the unit, its market rent and
 * its value share; the other columns are in the opened row.
 */
import Image from "next/image";
import { useState } from "react";
import { cx } from "@/components/ui/cx";
import type { Deal, Unit } from "@/lib/deal/types";
import { eur } from "@/lib/format";
import type { PipelineOutput } from "@/lib/pipeline/run";
import {
  FEATURE_NAMES,
  FLOOR_NAMES,
  areaLabel,
  citationShort,
  countLabel,
  inPlaceSummary,
  marketRentInUse,
  rentNumber,
  signedPct,
  signedRent,
} from "./review";
import { useStoredImageUrl } from "./useStoredFile";

export type UnitsTableProps = {
  out: PipelineOutput;
  className?: string;
};

/** The building-level sentence of spec §5.3.3. */
export const SPLIT_SENTENCE =
  "The building is valued as one asset (one plot, one cap rate); the unit values are a split, not separate valuations.";

/** Unit, AI market and value share on a phone; all seven columns from `sm`. */
const GRID =
  "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1.3fr)] gap-2 sm:grid-cols-[2.4fr_0.8fr_1fr_1.3fr_0.9fr_1fr_1.3fr]";
/** A column shown from `sm` only. */
const WIDE = "hidden sm:block";
const DETAIL_LABEL = "text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted";

/** English captions of the bundled sample photos. */
const SAMPLE_PHOTO_CAPTIONS: Record<string, string> = {
  "foto_fassade.jpg": "Facade",
  "foto_dachterrasse.jpg": "Roof terrace",
  "foto_wohnzimmer_dg.jpg": "Living room",
};

/** Months of market rent deducted for re-letting a vacant unit (plan constants). */
const RELETTING_MONTHS = 6;

function unitName(u: Unit): string {
  return u.label || `Unit ${u.id}`;
}

function roomsLabel(rooms: number): string {
  return `${rooms.toLocaleString("en-US")} ${rooms === 1 ? "room" : "rooms"}`;
}

function marketRentSetByValuer(out: PipelineOutput, unitId: string): boolean {
  return out.params.marketRentOverrides[unitId] !== undefined || out.params.marketRentFactor !== 1;
}

/** The AI's note on a unit: how its market rent was estimated, and what stands out against the other units. */
function unitNote(out: PipelineOutput, index: number): string {
  const { deal, rent, valuation } = out;
  const u = deal.units[index];
  const estimate = rent.units[index];
  const gap = valuation.units[index]?.gapPct ?? null;
  const sentences = [
    `From ${countLabel(estimate.comparableIds.length, "comparable")} of similar size (${estimate.confidence} confidence): location base ${rentNumber(estimate.base)} €/m², ${FLOOR_NAMES[u.floor].toLowerCase()} ${signedRent(estimate.floorAdj)}, size ${signedRent(estimate.sizeAdj)}, features ${signedRent(estimate.featureAdj)} → ${rentNumber(estimate.rentPerM2)} €/m².`,
  ];
  if (marketRentSetByValuer(out, u.id)) sentences.push("The valuer changed the market rent in a revision.");
  if (u.origin === "manual") sentences.push("Added by hand by the client; no document confirms this unit.");
  if (u.inPlaceRentPerM2 === null) {
    sentences.push(`Vacant: valued at market rent, less ${RELETTING_MONTHS} months' rent for re-letting.`);
    return sentences.join(" ");
  }
  const lets = deal.units
    .map((unit, i) => ({ unit, gap: valuation.units[i]?.gapPct ?? null }))
    .filter((x) => x.unit.inPlaceRentPerM2 !== null);
  const gaps = lets.map((x) => x.gap).filter((g): g is number => g !== null);
  const leases = lets.map((x) => x.unit.leaseSinceYear).filter((y): y is number => y !== null);
  const valuationYear = Number.parseInt(deal.valuationDate.slice(0, 4), 10);
  if (gap !== null && gaps.length > 1 && gap === Math.min(...gaps) && gap < 0) {
    sentences.push("Largest gap in the building, so a main driver of the under-rent deduction.");
  } else if (u.leaseSinceYear !== null && leases.length > 1 && u.leaseSinceYear === Math.min(...leases)) {
    sentences.push("Oldest lease in the building; rent increases are capped, so its gap closes slowest.");
  } else if (u.leaseSinceYear !== null && Number.isFinite(valuationYear) && u.leaseSinceYear >= valuationYear - 2) {
    const close = gap !== null && Math.abs(gap) <= 0.05;
    const where = close ? "close to" : gap !== null && gap < 0 ? "below" : "above";
    sentences.push(
      `Let in ${u.leaseSinceYear} at ${rentNumber(u.inPlaceRentPerM2)} €/m², ${where} the estimate: evidence for the rent model.`,
    );
  }
  if (estimate.comparableIds.length < 8) sentences.push("Fewer comparables of this size, so a wider range.");
  return sentences.join(" ");
}

function PhotoThumb({ photo }: { photo: Deal["photos"][number] }) {
  const url = useStoredImageUrl(photo.id, photo.fileName);
  const caption = SAMPLE_PHOTO_CAPTIONS[photo.fileName] ?? photo.fileName;
  return (
    <figure className="m-0 w-24">
      {url ? (
        <Image
          src={url}
          alt={`Unit photo: ${caption.toLowerCase()}`}
          width={96}
          height={64}
          unoptimized
          className="block h-16 w-24 rounded-md bg-[#DCE6F0] object-cover"
        />
      ) : (
        <div aria-hidden="true" className="h-16 w-24 rounded-md bg-[#DCE6F0]" />
      )}
      <figcaption className="mt-0.5 truncate text-[11px] leading-4 text-muted">
        {url === null ? `${caption} (not stored in this browser)` : caption}
      </figcaption>
    </figure>
  );
}

function UnitDetails({ out, index, rowNumber, id }: { out: PipelineOutput; index: number; rowNumber: number; id: string }) {
  const { deal, valuation } = out;
  const u = deal.units[index];
  const share = valuation.units[index];
  const photos = deal.photos.filter((p) => u.photoIds.includes(p.id));
  const features = u.features.map((f) => FEATURE_NAMES[f]).join(", ");
  const byValuer = marketRentSetByValuer(out, u.id);
  const inPlaceSource =
    u.origin === "manual"
      ? "added by hand by the client"
      : u.clientEdited.includes("inPlaceRentPerM2") || u.clientEdited.includes("areaM2")
        ? "changed by the client"
        : u.source
          ? `${citationShort(deal, u.source.documentId, u.source.page)}, row ${rowNumber}`
          : "tenant list";

  return (
    <div
      id={id}
      className="flex flex-wrap gap-x-7 gap-y-3 border-b border-line bg-subtle py-3 pl-4 pr-4 text-[13px] leading-[19px] sm:pl-9"
    >
      <div className="min-w-0 flex-[1_1_170px]">
        <div className={DETAIL_LABEL}>Unit</div>
        <div>
          {FLOOR_NAMES[u.floor]} · {areaLabel(u.areaM2)} m² · {roomsLabel(u.rooms)}
        </div>
        <div className="text-ink-2">{features || "No listed features"}</div>
        <div className="text-ink-2">{u.inPlaceRentPerM2 === null ? "Vacant" : `Lease since ${u.leaseSinceYear ?? "unknown"}`}</div>
        {(u.clientEdited.length > 0 || u.origin === "manual") && (
          <div className="mt-1 inline-flex rounded-full border border-doc px-2 text-[11px] font-semibold leading-4 text-doc">
            {u.origin === "manual" ? "Added by client" : "Changed by client"}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-[1.4_1_290px]">
        <div className={DETAIL_LABEL}>Rent</div>
        {share.inPlaceRentPerMonth !== null ? (
          <div>
            <span className="font-semibold text-doc">In-place {eur(share.inPlaceRentPerMonth, { decimals: 2 })}/month</span>{" "}
            · {inPlaceSource}
          </div>
        ) : (
          <div className="text-ink-2">Vacant: no in-place rent.</div>
        )}
        <div>
          <span className={cx("font-semibold", byValuer ? "text-valuer" : "text-ai")}>
            {byValuer ? "Market" : "≈ Market"} {rentNumber(share.marketRentPerM2)} €/m² ·{" "}
            {eur(share.marketRentPerMonth, { decimals: 2 })}/month
          </span>
          {byValuer && " · set by the valuer"}
        </div>
        <div className="text-ink-2">
          Gap {share.gapPct === null ? "—" : signedPct(share.gapPct)} · value share {eur(share.value)} (
          {(share.sharePct * 100).toFixed(1)} %)
        </div>
      </div>
      <div className="min-w-0 flex-[2_1_260px]">
        <div className={DETAIL_LABEL}>
          <span aria-hidden="true">≈ </span>AI note
        </div>
        <div>{unitNote(out, index)}</div>
        {photos.length === 0 ? (
          <div className="mt-1 text-ink-2">Photos: none uploaded</div>
        ) : (
          <div className="mt-1.5">
            <div className="text-ink-2">Photos: {photos.length}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {photos.map((p) => (
                <PhotoThumb key={p.id} photo={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function UnitsTable({ out, className }: UnitsTableProps) {
  const { deal, valuation } = out;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const allOpen = deal.units.length > 0 && deal.units.every((u) => open.has(u.id));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const inPlace = inPlaceSummary(out);
  const totalGap =
    inPlace && inPlace.marketPerMonth > 0 ? (inPlace.perMonth - inPlace.marketPerMonth) / inPlace.marketPerMonth : null;
  /** A unit's row in the tenant list: its place among the extracted units. */
  const tenantListRow = deal.units.map((_, i) => deal.units.slice(0, i + 1).filter((x) => x.origin === "extracted").length);
  const heading =
    deal.usageType === "living" ? countLabel(deal.units.length, "apartment") : countLabel(deal.units.length, "unit");

  return (
    <section aria-label="Units" className={cx("overflow-hidden rounded-xl border border-line bg-surface", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5">
        <div className="min-w-0 flex-[999_1_420px]">
          <h2 className="text-base font-semibold">Units · {heading}</h2>
          <p className="mt-0.5 text-xs leading-[18px] text-muted">
            Read by the AI from the tenant list; click a unit to open it. {SPLIT_SENTENCE} Each unit&apos;s value is its
            share of the building&apos;s market rent, useful if flats are later sold one by one.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(deal.units.map((u) => u.id)))}
          className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 font-semibold hover:bg-subtle"
        >
          {allOpen ? "Collapse all units" : "Expand all units"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="sm:min-w-[780px]">
          <div
            aria-hidden="true"
            className={cx(GRID, "border-y border-line bg-subtle px-4 py-2 text-xs font-semibold text-muted")}
          >
            <span>Unit</span>
            <span className={cx(WIDE, "text-right")}>m²</span>
            <span className={cx(WIDE, "text-right")}>In-place €/m²</span>
            <span className="text-right">AI market €/m²</span>
            <span className={cx(WIDE, "text-right")}>Gap</span>
            <span className={cx(WIDE, "text-right")}>Lease since</span>
            <span className="text-right">Value share</span>
          </div>
          {deal.units.map((u, i) => {
            const share = valuation.units[i];
            const isOpen = open.has(u.id);
            const detailsId = `unit-details-${deal.id}-${u.id}`;
            const no = i + 1;
            const byValuer = marketRentSetByValuer(out, u.id);
            const inPlaceRent = u.inPlaceRentPerM2 === null ? "vacant" : rentNumber(u.inPlaceRentPerM2);
            const gap = share.gapPct === null ? "—" : signedPct(share.gapPct);
            const since = u.inPlaceRentPerM2 === null ? "—" : String(u.leaseSinceYear ?? "—");
            return (
              <div key={u.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? detailsId : undefined}
                  aria-label={`${no} · ${unitName(u)}: ${areaLabel(u.areaM2)} m², in-place ${inPlaceRent === "vacant" ? "vacant" : `${inPlaceRent} €/m²`}, AI market ${rentNumber(share.marketRentPerM2)} €/m², gap ${gap}, lease since ${since}, value share ${eur(share.value)}`}
                  onClick={() => toggle(u.id)}
                  className={cx(
                    GRID,
                    "tnum min-h-11 w-full items-center border-b border-page px-4 py-2.5 text-left text-ink",
                    isOpen ? "bg-page" : "bg-surface hover:bg-subtle",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    <span aria-hidden="true" className="w-3 shrink-0 text-ink-2">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <span className="truncate">
                      {no} · {unitName(u)}
                    </span>
                  </span>
                  <span className={cx(WIDE, "text-right")}>{areaLabel(u.areaM2)}</span>
                  <span className={cx(WIDE, "text-right", u.inPlaceRentPerM2 === null ? "text-muted" : "text-doc")}>
                    {inPlaceRent}
                  </span>
                  <span className={cx("text-right", byValuer ? "text-valuer" : "text-ai")}>
                    {byValuer ? "" : "≈ "}
                    {rentNumber(share.marketRentPerM2)}
                  </span>
                  <span className={cx(WIDE, "text-right")}>{gap}</span>
                  <span className={cx(WIDE, "text-right")}>{since}</span>
                  <span className="text-right font-semibold">{eur(share.value)}</span>
                </button>
                {isOpen && <UnitDetails out={out} index={i} rowNumber={tenantListRow[i]} id={detailsId} />}
              </div>
            );
          })}
          <div className={cx(GRID, "tnum bg-page px-4 py-2.5 font-bold")}>
            <span className="pl-5">Total building</span>
            <span className={cx(WIDE, "text-right")}>{areaLabel(valuation.livingAreaM2)}</span>
            <span className={cx(WIDE, "text-right text-doc")}>{inPlace ? rentNumber(inPlace.perM2) : "—"}</span>
            <span className="text-right text-ai">≈ {rentNumber(marketRentInUse(out))}</span>
            <span className={cx(WIDE, "text-right")}>{totalGap === null ? "—" : signedPct(totalGap)}</span>
            <span className={cx(WIDE, "text-right")} />
            <span className="text-right">{eur(valuation.marketValue)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
