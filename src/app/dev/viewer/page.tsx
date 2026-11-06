"use client";

/**
 * Test harness for the PDF viewer and the maps (plan Task 14). Rendered in development, or in a production build
 * with `?dev=1` (the e2e tests use `/dev/viewer?dev=1`).
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ComparablesMap } from "@/components/map/ComparablesMap";
import { DealMap } from "@/components/map/DealMap";
import { samplePlotOutline } from "@/components/map/geo";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { SAMPLE_DOCUMENT_FILES, SAMPLE_SKELETON, samplePath } from "@/lib/data/seed";
import { num } from "@/lib/format";
import { lookupLandValue } from "@/lib/lookups/boris";
import { COMPARABLES } from "@/lib/pipeline/run";

const { street, zip, lat, lng } = SAMPLE_SKELETON.address;
const LAND = lookupLandValue(zip);
const ZONE_LABEL = `zone ${LAND.zone} · ${num(LAND.valuePerM2)} €/m²`;
const PLOT = samplePlotOutline(lat, lng);
const DEFAULT_FILE = "Grundbuch_Musterstrasse12.pdf";

const cardClass = "min-w-0 rounded-xl border border-line bg-surface p-4";
const fieldClass =
  "mt-1 block min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:outline-2";

function AppBar() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-7 gap-y-2.5 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <rect width="28" height="28" rx="7" fill="#0B5D4B" />
            <path d="M19.4 9.4a6.6 6.6 0 1 0 0 9.2" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="19.6" cy="14" r="1.9" fill="#7FD1B9" />
          </svg>
          <span className="font-display text-[19px] font-bold tracking-[-0.01em]">Censio</span>
          <span className="rounded bg-brand-weak px-1.5 py-px text-[11px] font-semibold text-brand">RE</span>
        </div>
        <span className="text-sm font-medium text-ink-2">Viewer harness (development)</span>
        <div className="grow" />
        <span className="rounded-full border border-dashed border-faint px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
          Sample data
        </span>
      </div>
    </header>
  );
}

function Harness() {
  const [fileName, setFileName] = useState(DEFAULT_FILE);
  const [page, setPage] = useState(1);
  const [highlight, setHighlight] = useState("480 m²");
  const [blob, setBlob] = useState<{ fileName: string; data: Blob } | null>(null);
  const [asBlob, setAsBlob] = useState(false);
  const pages = SAMPLE_DOCUMENT_FILES.find((f) => f.fileName === fileName)?.pages ?? 1;

  async function loadBlob(name: string) {
    const response = await fetch(samplePath(name));
    setBlob({ fileName: name, data: await response.blob() });
  }

  const src = asBlob && blob?.fileName === fileName ? blob.data : samplePath(fileName);

  return (
    <main className="mx-auto flex max-w-[1440px] flex-wrap items-start gap-4 px-4 py-4 sm:px-6">
      <section aria-labelledby="pdf-heading" className={`${cardClass} flex-[999_1_560px]`}>
        <h2 id="pdf-heading" className="text-base font-semibold">
          PDF viewer
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="min-w-0 flex-[2_1_220px] text-xs font-semibold text-muted">
            Document
            <select
              className={fieldClass}
              value={fileName}
              onChange={(e) => {
                setFileName(e.target.value);
                setPage(1);
                if (asBlob) void loadBlob(e.target.value);
              }}
            >
              {SAMPLE_DOCUMENT_FILES.map((f) => (
                <option key={f.fileName} value={f.fileName}>
                  {f.fileName}
                </option>
              ))}
            </select>
          </label>
          <label className="w-24 text-xs font-semibold text-muted">
            Page
            <input
              className={fieldClass}
              type="number"
              min={1}
              max={pages}
              value={page}
              onChange={(e) => setPage(Math.min(pages, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
          <label className="min-w-0 flex-[3_1_240px] text-xs font-semibold text-muted">
            Highlight
            <input className={fieldClass} type="text" value={highlight} onChange={(e) => setHighlight(e.target.value)} />
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-xs font-semibold text-muted">
            <input
              type="checkbox"
              className="size-5"
              checked={asBlob}
              onChange={(e) => {
                setAsBlob(e.target.checked);
                if (e.target.checked) void loadBlob(fileName);
              }}
            />
            Load as Blob
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          Source: {typeof src === "string" ? src : `Blob (${num(src.size)} bytes)`}
        </p>
        <PdfViewer className="mt-2" src={src} page={page} highlight={highlight || null} height={560} title={fileName} />
      </section>

      <div className="flex min-w-0 flex-[9_1_380px] flex-col gap-4">
        <section aria-labelledby="comps-heading" className={cardClass}>
          <h2 id="comps-heading" className="text-base font-semibold">
            {COMPARABLES.length} comparable listings within 1 km
          </h2>
          <ComparablesMap className="mt-3" center={[lat, lng]} comps={COMPARABLES} radiusM={1000} subjectLabel={street} />
        </section>

        <section aria-labelledby="deal-map-heading" className={cardClass}>
          <h2 id="deal-map-heading" className="text-base font-semibold">
            Deal map
          </h2>
          <div className="mt-3 flex flex-wrap items-start gap-4">
            <figure className="m-0 w-[168px]">
              <DealMap lat={lat} lng={lng} plot={PLOT} zoneLabel={ZONE_LABEL} />
              <figcaption className="mt-1 text-[11px] text-muted">Plot 123/4 · BORIS zone (sample map)</figcaption>
            </figure>
            <figure className="m-0 min-w-0 flex-[1_1_200px]">
              <DealMap lat={lat} lng={lng} plot={PLOT} zoneLabel={ZONE_LABEL} height={200} />
              <figcaption className="mt-1 text-[11px] text-muted">Wizard preview size</figcaption>
            </figure>
          </div>
        </section>
      </div>
    </main>
  );
}

function Gate() {
  const params = useSearchParams();
  const enabled = process.env.NODE_ENV !== "production" || params.get("dev") === "1";
  if (!enabled) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-ink-2">
        This harness is only available in development or with ?dev=1.
      </main>
    );
  }
  return <Harness />;
}

export default function ViewerHarnessPage() {
  return (
    <>
      <AppBar />
      <Suspense fallback={<main className="mx-auto max-w-[1440px] px-6 py-4 text-sm text-muted">Loading…</main>}>
        <Gate />
      </Suspense>
    </>
  );
}
