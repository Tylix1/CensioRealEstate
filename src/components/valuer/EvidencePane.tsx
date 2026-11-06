"use client";

/**
 * The evidence pane (spec §5.4 item 9): the source of the focused item.
 *
 * | Focus                         | Shows                                                                       |
 * |-------------------------------|-----------------------------------------------------------------------------|
 * | market_report evidence        | the market report table with the row highlighted                            |
 * | comparables evidence          | the comparables map, the estimate and the in-place rent                     |
 * | document / easement evidence  | the PDF page with the quote highlighted; the English translation for easements |
 * | land_value evidence           | the BORIS card                                                              |
 * | the spot-check                | the PDF page of the figure's quote                                          |
 * | nothing                       | the documents the AI read                                                   |
 */
import type { ReactNode } from "react";
import { ComparablesMap } from "@/components/map/ComparablesMap";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cx } from "@/components/ui/cx";
import { DOCUMENT_TYPE_LABEL, type Deal, type Quote } from "@/lib/deal/types";
import type { Flag } from "@/lib/flags/rules";
import { eur, num, pct } from "@/lib/format";
import { MARKET_REPORT_2026, type CapRateRow } from "@/lib/lookups/marketReport";
import { BORIS_SOURCE_LABEL } from "@/lib/lookups/boris";
import { COMPARABLES, type PipelineOutput } from "@/lib/pipeline/run";
import type { Figure } from "@/lib/registry/registry";
import {
  areaLabel,
  countLabel,
  dateLabel,
  documentById,
  evidenceDomId,
  documentTitle,
  inPlaceSummary,
  marketRentInUse,
  parcelNumber,
  rentNumber,
  type ReviewFocus,
} from "./review";
import { useStoredFile } from "./useStoredFile";

export type EvidencePaneProps = {
  out: PipelineOutput;
  focus: ReviewFocus;
  /** The spot-check's figure, shown when the spot-check is focused. */
  spotFigure: Figure | null;
  className?: string;
};

/** Height of the PDF page area in the pane, in px. */
const PDF_HEIGHT = 420;
/** The search radius of the comparables (spec §5.3.7). */
const COMPARABLES_RADIUS_M = 1000;

const SUB = "text-xs leading-[18px] text-ink-2";

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-0.5 mt-2 text-[15px] font-semibold leading-[22px]">{children}</h3>;
}

function AiReasoning({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-lg bg-ai-weak px-3 py-2.5">
      <div className="text-xs font-semibold text-ai">
        <span aria-hidden="true">≈ </span>AI reasoning
      </div>
      <p className="mt-1">{children}</p>
    </div>
  );
}

/** "2,5–3,5 %" and "3,0 %": the market report's own (German) number format. */
function germanPct(fraction: number): string {
  return (fraction * 100).toFixed(1).replace(".", ",");
}

/** The PDF page of a quote, from IndexedDB or the bundled sample. */
function DocumentPage({ deal, quote }: { deal: Deal; quote: Quote }) {
  const doc = documentById(deal, quote.documentId);
  const file = useStoredFile(doc?.id ?? null, doc?.fileName ?? null);
  if (!doc || file.status === "missing") {
    return (
      <div className="mt-3 rounded-md border border-line-strong bg-[#FCFCFD] p-3 text-xs text-ink-2">
        {doc ? "The file is not stored in this browser, so the page cannot be shown." : "The document is not in this deal."}{" "}
        The AI read on p. {quote.page}: <q className="font-serif text-[13px] text-ink">{quote.quote}</q>
      </div>
    );
  }
  if (file.status === "loading") {
    return <div aria-hidden="true" className="mt-3 animate-pulse rounded-md bg-[#EEF2F6]" style={{ height: PDF_HEIGHT + 53 }} />;
  }
  return (
    <PdfViewer
      className="mt-3"
      src={file.src}
      page={quote.page}
      highlight={quote.quote}
      height={PDF_HEIGHT}
      title={doc.fileName}
    />
  );
}

function MarketReportEvidence({ out, rowKey }: { out: PipelineOutput; rowKey: CapRateRow["key"] }) {
  const { capRate, params, deal } = out;
  const row = MARKET_REPORT_2026.find((r) => r.key === rowKey) ?? capRate.row;
  const byAi = Math.abs(params.capRate - row.median) < 1e-9;
  return (
    <>
      <SourceBadge type="public_data" />
      <Heading>
        Market report 2026 · p. {capRate.page} · table {capRate.table}
      </Heading>
      <div className={SUB}>Valuation committee Leipzig (Gutachterausschuss) · sample data</div>
      <div className="mt-3 overflow-x-auto rounded-md border border-line-strong bg-[#FCFCFD] p-3">
        <div className="text-[11px] text-muted">Tabelle {capRate.table} · Liegenschaftszinssätze 2026</div>
        <table className="mt-1.5 w-full min-w-[340px] border-collapse font-serif text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="border-b border-line-strong px-1.5 py-1 text-left">
                Objektart
              </th>
              <th scope="col" className="border-b border-line-strong px-1.5 py-1 text-right">
                Spanne
              </th>
              <th scope="col" className="border-b border-line-strong px-1.5 py-1 text-right">
                Median
              </th>
              <th scope="col" className="border-b border-line-strong px-1.5 py-1 text-right">
                n
              </th>
            </tr>
          </thead>
          <tbody>
            {MARKET_REPORT_2026.map((r) => {
              const hit = r.key === row.key;
              return (
                <tr key={r.key} aria-current={hit ? "true" : undefined} className={cx(hit && "bg-hl font-bold")}>
                  <td className="px-1.5 py-1">{r.labelDe}</td>
                  <td className="whitespace-nowrap px-1.5 py-1 text-right">
                    {germanPct(r.range[0])}–{germanPct(r.range[1])} %
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 text-right">{germanPct(r.median)} %</td>
                  <td className="px-1.5 py-1 text-right">{r.n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Highlighted: {row.label.toLowerCase()} ({(row.range[0] * 100).toFixed(1)}–{pct(row.range[1])}, median{" "}
        {pct(row.median)}).
      </p>
      <AiReasoning>
        {capRate.districtValue === null
          ? `There is no district figure for ${deal.address.zip}, so I used the city-wide median for ${row.label.toLowerCase()}, from ${row.n} sales. Nothing in the documents gave me a reason to move off the median.`
          : `The report gives a district figure of ${pct(capRate.districtValue)} for ${deal.address.zip}, so I used it.`}
        {!byAi && ` The valuer set ${pct(params.capRate)} instead; the report records it as valuer judgement.`}
      </AiReasoning>
    </>
  );
}

function ComparablesEvidence({ out }: { out: PipelineOutput }) {
  const { deal, rent, params } = out;
  const listings = rent.recentCount + rent.olderCount;
  const inPlace = inPlaceSummary(out);
  const tenantList = deal.documents.find((d) => d.type === "tenant_list" && d.status === "done");
  const totalPage = deal.property.tenantListTotalSource?.page ?? deal.units.find((u) => u.source)?.source?.page;
  const changed = params.marketRentFactor !== 1 || Object.keys(params.marketRentOverrides).length > 0;
  return (
    <>
      <SourceBadge type="ai_estimate" label="AI estimate · rent model" />
      <Heading>
        {countLabel(listings, "comparable listing")} within {num(COMPARABLES_RADIUS_M / 1000)} km
      </Heading>
      <ComparablesMap
        className="mt-3"
        center={[deal.address.lat, deal.address.lng]}
        comps={COMPARABLES}
        radiusM={COMPARABLES_RADIUS_M}
        subjectLabel={deal.address.street}
        height={260}
      />
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs leading-[18px]">
        <span className="font-semibold text-ai">
          Estimate {rentNumber(rent.average)} €/m² avg. (range {rentNumber(rent.range[0])}–{rentNumber(rent.range[1])})
        </span>
        {changed && (
          <span className="font-semibold text-valuer">In use {rentNumber(marketRentInUse(out))} €/m², set by the valuer</span>
        )}
        {inPlace && (
          <span className="font-semibold text-doc">
            In-place {rentNumber(inPlace.perM2)} €/m²
            {tenantList && totalPage !== undefined ? ` · tenant list p. ${totalPage}` : ""}
          </span>
        )}
      </div>
      <AiReasoning>
        Each unit is matched to listings within ±15 m² of its size and adjusted for floor and features. The{" "}
        {rent.olderCount} listings older than 12 months are index-adjusted by 2.5 % a year. The location base, the median
        of the adjusted rents, is {rentNumber(rent.base)} €/m².
      </AiReasoning>
    </>
  );
}

function DocumentEvidence({ out, flag, quote }: { out: PipelineOutput; flag: Flag; quote: Quote }) {
  const { deal, valuation, params } = out;
  const doc = documentById(deal, quote.documentId);
  const inPlace = inPlaceSummary(out);
  let reasoning: string | null = null;
  if (flag.kind === "under_rent" && inPlace) {
    const below = valuation.underRentPerYear >= 0;
    reasoning = below
      ? `The let units pay ${eur(valuation.underRentPerYear)} a year below market (${rentNumber(inPlace.perM2)} vs. ${rentNumber(marketRentInUse(out))} €/m²). Rent increases in sitting tenancies are capped, so I expect the gap to close over ${params.underRentYears} years and deducted its present value at ${pct(params.capRate)}: ${eur(valuation.underRentDeduction)}.`
      : `The let units pay ${eur(-valuation.underRentPerYear)} a year above market. I expect this to last ${params.underRentYears} years and added its present value at ${pct(params.capRate)}: ${eur(-valuation.underRentDeduction)}.`;
  } else if (flag.kind === "extraction") {
    reasoning = "Please compare the highlighted passage with the value the AI read.";
  }
  return (
    <>
      <SourceBadge type="client_document" />
      <Heading>
        {doc ? documentTitle(doc) : "Client document"} · p. {quote.page}
      </Heading>
      <div className={SUB}>
        Uploaded by {deal.clientName}
        {doc?.type === "tenant_list"
          ? ` · ${countLabel(deal.units.filter((u) => u.origin === "extracted").length, "unit")} read · details per unit in the Units table`
          : doc
            ? ` · ${doc.fileName}`
            : ""}
      </div>
      <DocumentPage deal={deal} quote={quote} />
      {reasoning && <AiReasoning>{reasoning}</AiReasoning>}
    </>
  );
}

/** A schematic plot with the building and the assumed route of the line along the eastern boundary (mockup). */
function PlotSketch({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 300 150"
      role="img"
      aria-label="Plot sketch: the building footprint and the assumed route of the line along the eastern boundary"
      className="mt-2.5 block h-auto w-full max-w-[380px] rounded-lg bg-[#EEF2F6]"
    >
      <path d="M0 22 L300 14" stroke="#FFFFFF" strokeWidth="10" />
      <polygon points="70,34 230,30 234,136 74,140" fill="#FFFFFF" stroke="#0B5D4B" strokeWidth="2" />
      <rect x="84" y="38" width="128" height="48" fill="#D0D5DD" />
      <text x="122" y="66" fontFamily="Inter, sans-serif" fontSize="11" fill="#344054">
        building
      </text>
      <path d="M224 34 L228 134" stroke="#F79009" strokeWidth="2.5" strokeDasharray="6 4" />
      <text x="218" y="108" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#A3410A">
        assumed line route
      </text>
      <text x="80" y="132" fontFamily="Inter, sans-serif" fontSize="10" fill="#475467">
        {label}
      </text>
    </svg>
  );
}

function EasementEvidence({ out, flag, easementId }: { out: PipelineOutput; flag: Flag; easementId: string }) {
  const { deal, params, valuation } = out;
  const easement = deal.property.easements.find((e) => e.id === easementId);
  if (!easement) return <NoSource flag={flag} />;
  const parcel = parcelNumber(deal.property.parcel);
  const plot = deal.property.plotM2;
  const sketchLabel = [`plot${parcel ? ` ${parcel}` : ""}`, plot !== null ? `${areaLabel(plot)} m²` : null]
    .filter(Boolean)
    .join(" · ");
  const maximum = flag.swing ? -flag.swing.low : 0;
  return (
    <>
      <SourceBadge type="client_document" />
      <Heading>
        {DOCUMENT_TYPE_LABEL.land_register} · p. {easement.source.page} · section II
      </Heading>
      <div className={SUB}>Uploaded by {deal.clientName}</div>
      <DocumentPage deal={deal} quote={easement.source} />
      <p className="mt-2 text-xs leading-[18px] text-ink-2">
        <span className="font-semibold text-ai">
          <span aria-hidden="true">≈ </span>AI translation:
        </span>{" "}
        {easement.translation}
      </p>
      <PlotSketch label={sketchLabel} />
      <AiReasoning>
        {params.easementDeduction > 0
          ? `The valuer deducted ${eur(valuation.easementDeduction)} for the easement.`
          : `Lines of this kind usually run along the plot boundary and do not restrict its use, so I valued the easement at ±€0. If it crossed the buildable area, the deduction could reach ${eur(maximum)}. The route is not documented, so this is a ${flag.confidence}-confidence call.`}
      </AiReasoning>
    </>
  );
}

function LandValueEvidence({ out }: { out: PipelineOutput }) {
  const { land, deal, valuation } = out;
  const plot = deal.property.plotM2;
  return (
    <>
      <SourceBadge type="public_data" />
      <Heading>{BORIS_SOURCE_LABEL} · standard land value</Heading>
      <div className={SUB}>Bodenrichtwert as of {dateLabel(land.asOf)}</div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-line-strong bg-[#FCFCFD] p-3 text-[13px]">
        <dt className="text-muted">Zone</dt>
        <dd>{land.note === null ? land.zone : "no sample zone for this address"}</dd>
        <dt className="text-muted">Standard land value</dt>
        <dd className="tnum font-semibold">{num(land.valuePerM2)} €/m²</dd>
        <dt className="text-muted">Plot</dt>
        <dd className="tnum">{plot === null ? "unknown" : `${areaLabel(plot)} m²`}</dd>
        <dt className="text-muted">Land value</dt>
        <dd className="tnum font-semibold">{eur(valuation.landValue)}</dd>
      </dl>
      {land.note !== null && (
        <AiReasoning>
          {land.note}: I applied a fallback of {num(land.valuePerM2)} €/m². Please check the standard land value in BORIS.
        </AiReasoning>
      )}
    </>
  );
}

function NoSource({ flag }: { flag: Flag }) {
  return (
    <>
      <Heading>No document to show</Heading>
      <p className="text-ink-2">{flag.summary}</p>
    </>
  );
}

function Overview({ out }: { out: PipelineOutput }) {
  const { deal } = out;
  return (
    <>
      <p className="mt-2 text-ink-2">
        Open a judgement call in Needs your eye to see its source here: the document page with the passage highlighted,
        the table row it comes from, or the map of comparable listings.
      </p>
      <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.04em] text-muted">Documents the AI read</h3>
      <ul className="mt-1.5">
        {deal.documents.map((doc) => (
          <li key={doc.id} className="border-b border-page py-2 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">{documentTitle(doc)}</span>
              <span className="text-xs text-muted">{countLabel(doc.pages, "page")}</span>
            </div>
            <div className="text-xs leading-[18px] text-ink-2">
              {doc.status === "failed" ? (doc.error ?? "Could not be read.") : (doc.findings[0] ?? doc.fileName)}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function SpotEvidence({ out, figure }: { out: PipelineOutput; figure: Figure }) {
  const { deal } = out;
  if (!figure.quote) return null;
  const doc = documentById(deal, figure.quote.documentId);
  return (
    <>
      <SourceBadge type="client_document" />
      <Heading>
        {doc ? documentTitle(doc) : "Client document"} · p. {figure.quote.page}
      </Heading>
      <div className={SUB}>
        Spot-check: does the {figure.label.toLowerCase()} of {figure.display} match the document?
      </div>
      <DocumentPage deal={deal} quote={figure.quote} />
    </>
  );
}

function FlagEvidence({ out, flag }: { out: PipelineOutput; flag: Flag }) {
  const { evidence } = flag;
  switch (evidence.type) {
    case "market_report":
      return <MarketReportEvidence out={out} rowKey={evidence.rowKey} />;
    case "comparables":
      return <ComparablesEvidence out={out} />;
    case "document":
      return <DocumentEvidence out={out} flag={flag} quote={evidence.quote} />;
    case "easement":
      return <EasementEvidence out={out} flag={flag} easementId={evidence.easementId} />;
    case "land_value":
      return <LandValueEvidence out={out} />;
    case "none":
      return <NoSource flag={flag} />;
  }
}

export function EvidencePane({ out, focus, spotFigure, className }: EvidencePaneProps) {
  const flag = focus?.kind === "flag" ? out.flags.find((f) => f.id === focus.flagId) : undefined;
  let body: ReactNode;
  if (flag) body = <FlagEvidence key={flag.id} out={out} flag={flag} />;
  else if (focus?.kind === "spot" && spotFigure) body = <SpotEvidence out={out} figure={spotFigure} />;
  else body = <Overview out={out} />;

  return (
    <section
      id={evidenceDomId(out.deal.id)}
      aria-label="Evidence"
      className={cx("min-w-0 scroll-mt-4 rounded-xl border border-line bg-surface p-4", className)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Evidence</h2>
        <span className="text-[11px] text-muted">Sample documents</span>
      </div>
      <div className="mt-2.5">{body}</div>
    </section>
  );
}
