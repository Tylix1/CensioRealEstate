/**
 * The seeded sample world (plan "Sample world", spec §5.3): the sample deal CEN-2026-0147, read from the committed
 * extraction fixtures and ready in the valuer queue, plus the static rows of the valuer queue and the client
 * dashboard.
 *
 * The fixtures are imported statically, so the seed works in the browser bundle and on Vercel without file access.
 * Each fixture file is named after the SHA-256 of its sample PDF (fixtures/extraction/index.json maps the PDFs to
 * them). scripts/generate-samples.ts writes the PDFs deterministically, so the names change only when a sample's
 * content does; tests/unit/pipeline.test.ts checks these imports against the index.
 */
import fixtureIndex from "../../../fixtures/extraction/index.json";
import zoningPlanFixture from "../../../fixtures/extraction/1a4721123a7f2630ffefd9ffc4242aac60871a8692e9ddbd4112af5f75ab2439.json";
import refurbishmentSheetFixture from "../../../fixtures/extraction/579e9ac10eab4981a0c641c2a0837b9c27a7b8833f89bf657a92a5578dd48d94.json";
import tenantListFixture from "../../../fixtures/extraction/a65cd2eed48012518891a5c85eb8cbc81ab3dc005dd8b2eeadc7548b352da67f.json";
import landRegisterFixture from "../../../fixtures/extraction/ab8d1a62372db77573dca16f377844ab67d470355bcf0e0051bdc01b74465c26.json";
import energyCertificateFixture from "../../../fixtures/extraction/f818883fb917bb6c3188d53293b97df79f4776b3076bd6a0e1d025d90f754c01.json";
import { dealFromExtractions, type DealSkeleton, type ExtractedDocument } from "@/lib/deal/fromExtraction";
import type { Deal, DealDocument } from "@/lib/deal/types";
import type { ExtractionResult } from "@/lib/extraction/schemas";
import { buildRunLog, runPipeline } from "@/lib/pipeline/run";

/** The sample deal (plan "Sample world"). */
export const SAMPLE_SKELETON: DealSkeleton = Object.freeze({
  id: "CEN-2026-0147",
  clientName: "Demo Capital GmbH",
  address: Object.freeze({ street: "Musterstraße 12", zip: "04109", city: "Leipzig", lat: 51.3352, lng: 12.3747 }),
  usageType: "living",
  scope: "building",
  valuationDate: "2026-11-06",
  requestedAt: "2026-11-06T09:00:00.000Z",
});

/** The seeded deal's id, which the first deal a client submits takes over. */
export const SEED_DEAL_ID = SAMPLE_SKELETON.id;

/** The bundled sample PDFs in `public/sample/`, in the order of the run log (spec §5.3.4, steps 1–5). */
export const SAMPLE_DOCUMENT_FILES: readonly { readonly fileName: string; readonly pages: number }[] = [
  { fileName: "Mieterliste_Musterstrasse12.pdf", pages: 2 },
  { fileName: "Grundbuch_Musterstrasse12.pdf", pages: 4 },
  { fileName: "Energieausweis_Musterstrasse12.pdf", pages: 1 },
  { fileName: "Sanierungsuebersicht_Musterstrasse12.pdf", pages: 1 },
  { fileName: "B-Plan_Auszug_Musterstrasse12.pdf", pages: 1 },
];

/** The attic: unit 8 of the tenant list, the only unit with photos (spec §5.3.3). */
const ATTIC_UNIT_ID = "u8";

/** The bundled sample photos in `public/sample/`: the façade, and the attic's roof terrace and living room. */
export const SAMPLE_PHOTOS: readonly { readonly id: string; readonly fileName: string; readonly unitId: string | null }[] = [
  { id: "photo-facade", fileName: "foto_fassade.jpg", unitId: null },
  { id: "photo-roof-terrace", fileName: "foto_dachterrasse.jpg", unitId: ATTIC_UNIT_ID },
  { id: "photo-attic-living-room", fileName: "foto_wohnzimmer_dg.jpg", unitId: ATTIC_UNIT_ID },
];

/**
 * The URL of a bundled sample file, e.g. `/sample/foto_fassade.jpg`. The seeded deal's documents and photos are not in
 * IndexedDB, so the UI loads them from here.
 */
export function samplePath(fileName: string): string {
  return `/sample/${encodeURIComponent(fileName)}`;
}

/** Index entries: PDF file name → SHA-256 and where the fixture came from. */
const FIXTURE_INDEX = fixtureIndex as Record<string, { sha256: string; source: "demo-fixture" | "recorded-live" }>;

/** The committed extraction results, by SHA-256. */
const FIXTURES: Record<string, unknown> = {
  a65cd2eed48012518891a5c85eb8cbc81ab3dc005dd8b2eeadc7548b352da67f: tenantListFixture,
  ab8d1a62372db77573dca16f377844ab67d470355bcf0e0051bdc01b74465c26: landRegisterFixture,
  f818883fb917bb6c3188d53293b97df79f4776b3076bd6a0e1d025d90f754c01: energyCertificateFixture,
  "579e9ac10eab4981a0c641c2a0837b9c27a7b8833f89bf657a92a5578dd48d94": refurbishmentSheetFixture,
  "1a4721123a7f2630ffefd9ffc4242aac60871a8692e9ddbd4112af5f75ab2439": zoningPlanFixture,
};

/**
 * The sample PDFs as read documents, with ids by document type (`doc-tenant-list`, `doc-land-register`, …). Their
 * quotes count as verified: the extraction route verifies the same fixtures against the PDFs' text layer.
 */
function sampleExtractions(): ExtractedDocument[] {
  return SAMPLE_DOCUMENT_FILES.flatMap(({ fileName, pages }): ExtractedDocument[] => {
    const entry = FIXTURE_INDEX[fileName];
    const result = entry ? (FIXTURES[entry.sha256] as ExtractionResult | undefined) : undefined;
    if (!entry || !result) return [];
    const doc: DealDocument = {
      id: `doc-${result.documentType.replace(/_/g, "-")}`,
      fileName,
      sha256: entry.sha256,
      pages,
      type: result.documentType,
      status: "done",
      // A fixture recorded from a Live AI run is a cached AI result (spec §6.4).
      extractionSource: entry.source === "recorded-live" ? "cache" : "demo-fixture",
      durationMs: null,
      findings: [],
      uncertainFields: [],
      error: null,
    };
    return [{ doc, result, verified: {} }];
  });
}

/**
 * The sample deal as the AI prepared it: built from the five fixtures, with the three sample photos, ready in the
 * valuer queue (`in_review`) and with its run log (steps 6–11, measured). A fresh object on every call.
 */
export function seededDeal(): Deal {
  const extracted = dealFromExtractions(SAMPLE_SKELETON, sampleExtractions());
  const atticPhotoIds = SAMPLE_PHOTOS.filter((p) => p.unitId === ATTIC_UNIT_ID).map((p) => p.id);
  const deal: Deal = {
    ...extracted,
    photos: SAMPLE_PHOTOS.map((p) => ({ ...p })),
    units: extracted.units.map((u) => (u.id === ATTIC_UNIT_ID ? { ...u, photoIds: [...atticPhotoIds] } : u)),
    status: "in_review",
  };
  return { ...deal, runLog: buildRunLog(deal, runPipeline(deal)) };
}

/** The other deals of the valuer queue: static sample rows, not clickable (spec §5.2 V1, mockup queue rail). */
export const QUEUE_ROWS: { id: string; city: string; type: string; checks: number; estReview: string }[] = [
  { id: "CEN-2026-0148", city: "Dresden", type: "Hotel", checks: 7, estReview: "~4:10" },
  { id: "CEN-2026-0149", city: "Halle", type: "Multi-family", checks: 1, estReview: "~0:40" },
  { id: "CEN-2026-0151", city: "Leipzig", type: "Apartment", checks: 0, estReview: "~0:20" },
  { id: "CEN-2026-0152", city: "Chemnitz", type: "Commercial", checks: 3, estReview: "~2:00" },
  { id: "CEN-2026-0153", city: "Erfurt", type: "Multi-family", checks: 2, estReview: "~1:00" },
];

/** The client's earlier report, already delivered (spec §5.2 C2). */
export const DELIVERED_ROW: {
  id: "CEN-2026-0131";
  address: "Beispielweg 3, 04155 Leipzig";
  value: 870000;
  deliveredAt: "2026-10-28";
} = {
  id: "CEN-2026-0131",
  address: "Beispielweg 3, 04155 Leipzig",
  value: 870000,
  deliveredAt: "2026-10-28",
};
