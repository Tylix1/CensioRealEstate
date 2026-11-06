"use client";

/**
 * C3.2 · Documents (spec §5.2, §6.1). The client drops the property's PDFs and photos, or takes the bundled samples;
 * every PDF is sent to the AI (POST /api/extract) and its row shows the live status, the detected type, the AI's
 * one-line summary, how it was read (Live AI, Cached result or Demo mode) and how long it took. View opens the PDF with
 * the passages the AI read. Documents that are missing do not block the request; they become flags for the valuer.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { cx } from "@/components/ui/cx";
import type { DealDocument } from "@/lib/deal/types";
import { REQUIRED_DOCS } from "@/lib/flags/rules";
import { MAX_FILES_PER_DEAL } from "@/lib/server/limits";
import type { DemoDraft } from "@/lib/store/demoStore";
import { DocumentDialog } from "./DocumentDialog";
import {
  CONDOMINIUM_NOTE,
  documentFor,
  formatDuration,
  isCondominium,
  missingDocumentTypes,
  sourceLabel,
  summaryDetail,
  typeLabel,
  unitName,
  unitsFromTenantList,
  unsureFields,
} from "./model";
import { PhotoThumb } from "./PhotoThumb";
import {
  SAMPLE_DOWNLOADS,
  addFiles,
  addSampleFiles,
  removeDocument,
  removePhoto,
  retryDocument,
} from "./uploads";
import { StatusNote, WizardFooter } from "./WizardParts";

const ACCEPT = ".pdf,application/pdf,image/jpeg,image/png,image/webp";

function isReading(doc: DealDocument): boolean {
  return doc.status === "pending" || doc.status === "reading";
}

function DocIcon({ doc }: { doc: DealDocument }) {
  if (isReading(doc)) {
    return (
      <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-ai-weak">
        <span className="size-4 rounded-full border-2 border-ai-light border-t-ai motion-safe:animate-spin" />
      </span>
    );
  }
  if (doc.status === "failed") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FEF3F2] font-bold text-pen"
      >
        !
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-doc-weak text-doc">
      <svg width="16" height="16" viewBox="0 0 12 12">
        <path d="M3 1.2h4l2.4 2.4v7.2H3z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M4.4 6h3.2M4.4 7.8h3.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function DocumentRow({
  doc,
  extraction,
  onView,
}: {
  doc: DealDocument;
  extraction: DemoDraft["extractions"][string] | undefined;
  onView: () => void;
}) {
  const result = doc.status === "done" ? extraction?.result : undefined;
  const unsure = result && extraction ? unsureFields(result, extraction.verified) : [];
  const retryable = doc.status === "failed" && /try again/i.test(doc.error ?? "");

  return (
    <li className="flex flex-wrap gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex min-w-0 flex-[999_1_260px] gap-3">
        <DocIcon doc={doc} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs leading-[18px] text-muted">
            <span className="break-all font-mono text-[11px] text-ink-2">{doc.fileName}</span>
            {doc.status === "done" && doc.pages > 0 && (
              <span>
                · {doc.pages} {doc.pages === 1 ? "page" : "pages"}
              </span>
            )}
          </div>

          {isReading(doc) && (
            <div className="mt-0.5 font-semibold text-ai">{doc.status === "reading" ? "Reading…" : "Waiting to be read…"}</div>
          )}

          {doc.status === "done" && (
            <>
              <div className="mt-0.5 font-semibold">{typeLabel(doc.type)}</div>
              {result?.summary && (
                <p className="text-[13px] leading-[19px] text-ink-2">{summaryDetail(result.summary, doc.type)}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-[18px] text-muted">
                <Pill tone={doc.extractionSource === "live" ? "ai" : "neutral"} size="sm">
                  {sourceLabel(doc.extractionSource)}
                </Pill>
                <span>read in {formatDuration(doc.durationMs)}</span>
              </div>
              {result && isCondominium(result) && (
                <p className="mt-2 rounded-lg bg-ai-weak px-3 py-2 text-[13px] leading-[19px] text-ai">{CONDOMINIUM_NOTE}</p>
              )}
              {unsure.length > 0 && (
                <div className="mt-2 rounded-lg bg-ai-weak px-3 py-2 text-[13px] leading-[19px] text-ai">
                  <div className="font-semibold">AI unsure — please confirm</div>
                  <ul className="mt-0.5 text-ink-2">
                    {unsure.map((f) => (
                      <li key={f.path}>
                        {f.label} · p. {f.page} “{f.quote}”
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-xs text-ai">The senior valuer checks these readings against the document.</div>
                </div>
              )}
            </>
          )}

          {doc.status === "failed" && (
            <>
              <div className="mt-0.5 font-semibold text-pen">Not read</div>
              <p className="text-[13px] leading-[19px] text-ink-2">{doc.error}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-[1_0_auto] flex-wrap items-start justify-end gap-2 pl-11 sm:pl-0">
        {doc.status === "done" && (
          <Button onClick={onView}>
            View<span className="sr-only"> {doc.fileName}</span>
          </Button>
        )}
        {retryable && (
          <Button onClick={() => void retryDocument(doc.id)}>
            Try again<span className="sr-only">: {doc.fileName}</span>
          </Button>
        )}
        <Button variant="ghost" onClick={() => removeDocument(doc.id)}>
          Remove<span className="sr-only"> {doc.fileName}</span>
        </Button>
      </div>
    </li>
  );
}

function ExpectedDocuments({ documents }: { documents: DealDocument[] }) {
  const reading = documents.some(isReading);
  const missing = missingDocumentTypes(documents);
  // Before the first upload the list is a checklist; once the AI has read the documents, gaps are "Missing".
  const state = (type: (typeof REQUIRED_DOCS)[number]) =>
    documentFor(documents, type) ? "found" : documents.length === 0 ? "expected" : reading ? "pending" : "missing";
  return (
    <Card as="aside" aria-labelledby="expected-title" className="min-w-0 flex-[1_1_260px] p-4">
      <h3 id="expected-title" className="text-base font-semibold">
        Expected documents
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {REQUIRED_DOCS.map((type) => {
          const found = documentFor(documents, type);
          const label = typeLabel(type);
          const s = state(type);
          return (
            <li key={type} className="flex gap-2 text-[13px] leading-[19px]">
              <span
                aria-hidden="true"
                className={cx(
                  "w-4 shrink-0 font-bold",
                  s === "found" ? "text-ok" : s === "missing" ? "text-ai" : "font-normal text-faint",
                )}
              >
                {s === "found" ? "✓" : s === "missing" ? "–" : "○"}
              </span>
              {s === "found" && found ? (
                <span className="min-w-0">
                  <span className="sr-only">Found: </span>
                  {label}
                  <span className="block truncate text-xs text-muted" title={found.fileName}>
                    {found.type === "condo_land_register" ? "Wohnungsgrundbuch · " : ""}
                    {found.fileName}
                  </span>
                </span>
              ) : s === "missing" ? (
                <span className="min-w-0 text-ai">{`Missing: ${label}`}</span>
              ) : (
                <span className="min-w-0 text-ink-2">
                  {label}
                  {s === "pending" && <span className="block text-xs text-muted">Not found yet</span>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-xs leading-[18px] text-muted">
        {documents.length > 0 && !reading && missing.length > 0
          ? "Missing documents do not block the request: the senior valuer sees each one as a flag."
          : "The AI recognises each document by its content, whatever the file is called."}
      </p>
    </Card>
  );
}

export function DocumentsStep({
  draft,
  onBack,
  onNext,
}: {
  draft: DemoDraft;
  onBack: () => void;
  onNext: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [addingSamples, setAddingSamples] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const { documents, photos } = draft;
  const reading = documents.filter(isReading).length;
  const viewed = documents.find((d) => d.id === viewing && d.status === "done");

  // Photos of the attic in the samples belong to its unit: name it as the units step will.
  const unitNames = useMemo(() => {
    const units = draft.units ?? unitsFromTenantList(draft);
    return new Map(units.map((u) => [u.id, unitName(u)]));
  }, [draft]);

  const take = (files: File[]) => {
    if (files.length > 0) setNotice(addFiles(files));
  };

  // Files dropped anywhere on this step are taken, instead of the browser opening them and leaving the wizard. Enter
  // and leave events fire for every element crossed, so the drag is over the page while more were entered than left.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) setNotice(addFiles(files));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const addSamples = async () => {
    setAddingSamples(true);
    setNotice(null);
    try {
      setNotice(await addSampleFiles());
    } catch (error) {
      console.error("[wizard] The sample documents could not be loaded:", error);
      setNotice("The sample documents could not be loaded. Check the connection and try again.");
    } finally {
      setAddingSamples(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <Card className="p-4 sm:p-5">
            <div
              className={cx(
                "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                dragging ? "border-brand bg-brand-weak" : "border-line-strong bg-subtle",
              )}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="text-brand">
                <path d="M16 21V7m0 0-5 5m5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 20v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div>
                <p className="font-semibold">Drag PDFs and photos here</p>
                <p className="mt-0.5 max-w-[560px] text-xs leading-[18px] text-muted">
                  Tenant list, land register, energy certificate, refurbishment sheet and zoning plan. PDFs up to 5 MB
                  and 10 pages; up to {MAX_FILES_PER_DEAL} documents and {MAX_FILES_PER_DEAL} photos. Photos are kept
                  with the request but not sent to the AI.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <input
                  id="wizard-files"
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="peer sr-only"
                  onChange={(e) => {
                    take(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor="wizard-files"
                  className={buttonClasses(
                    "secondary",
                    "md",
                    "cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                  )}
                >
                  Choose files
                </label>
                <Button variant="primary" onClick={() => void addSamples()} disabled={addingSamples} aria-busy={addingSamples}>
                  {addingSamples ? "Adding sample documents…" : "Use sample documents"}
                </Button>
              </div>
              <details className="text-[13px]">
                <summary className="flex min-h-11 cursor-pointer items-center justify-center gap-1 font-semibold text-doc">
                  Download sample documents
                </summary>
                <p className="text-xs leading-[18px] text-muted">
                  Save them, then drag them here, as you would with your own documents.
                </p>
                <ul className="mt-1 flex flex-wrap justify-center gap-x-3">
                  {SAMPLE_DOWNLOADS.map((f) => (
                    <li key={f.fileName}>
                      <a href={f.href} download={f.fileName} className="inline-flex min-h-11 items-center text-doc underline">
                        {f.fileName}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
            <StatusNote message={notice} tone="warn" onDismiss={() => setNotice(null)} boxClassName="mt-3" />
          </Card>

          <Card as="section" aria-labelledby="uploaded-title" className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3.5">
              <h3 id="uploaded-title" className="text-base font-semibold">
                Documents read by the AI
              </h3>
              <span className="text-xs text-muted" aria-live="polite">
                {documents.length} of {MAX_FILES_PER_DEAL}
                {reading > 0 && ` · reading ${reading}`}
              </span>
            </div>
            {documents.length === 0 ? (
              <p className="px-4 py-6 text-center text-ink-2">No documents yet.</p>
            ) : (
              <ul aria-label="Uploaded documents">
                {documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    extraction={draft.extractions[doc.id]}
                    onView={() => setViewing(doc.id)}
                  />
                ))}
              </ul>
            )}
          </Card>

          {photos.length > 0 && (
            <Card as="section" aria-labelledby="photos-title" className="overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3.5">
                <h3 id="photos-title" className="text-base font-semibold">
                  Photos
                </h3>
                <span className="text-xs text-muted">Stored with the request, not sent to the AI</span>
              </div>
              <ul aria-label="Photos" className="flex flex-wrap gap-3 p-4">
                {photos.map((photo) => (
                  <li key={photo.id} className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
                    <PhotoThumb photoId={photo.id} alt={photo.fileName} size={56} />
                    <div className="min-w-0 flex-1">
                      <div className="break-all text-[13px] leading-[18px]">{photo.fileName}</div>
                      <div className="text-xs text-muted">
                        {photo.unitId ? (unitNames.get(photo.unitId) ?? `Unit ${photo.unitId}`) : "Building"}
                      </div>
                    </div>
                    <Button variant="ghost" onClick={() => removePhoto(photo.id)}>
                      Remove<span className="sr-only"> {photo.fileName}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <ExpectedDocuments documents={documents} />
      </div>

      <WizardFooter
        onBack={onBack}
        hint={reading > 0 ? `The AI is still reading ${reading} ${reading === 1 ? "document" : "documents"}…` : null}
      >
        <Button variant="primary" onClick={onNext} disabled={reading > 0}>
          Next<span aria-hidden="true">→</span>
        </Button>
      </WizardFooter>

      {viewed && (
        <DocumentDialog
          key={viewed.id}
          doc={viewed}
          extraction={draft.extractions[viewed.id]}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
