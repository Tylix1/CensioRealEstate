"use client";

/**
 * "View" in step C3.2: the uploaded PDF in the viewer, opened on the main finding with its passage highlighted, plus
 * the other passages the AI read the document's values from (spec §5.2: "Clicking a file opens it in the PDF viewer
 * with the found passages highlighted"). The file comes from IndexedDB; a bundled sample falls back to its URL.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { cx } from "@/components/ui/cx";
import { SAMPLE_DOCUMENT_FILES, samplePath } from "@/lib/data/seed";
import type { DealDocument } from "@/lib/deal/types";
import type { DemoDraft } from "@/lib/store/demoStore";
import { getFile } from "@/lib/store/files";
import { passagesOf, typeLabel, type Passage } from "./model";

export interface DocumentDialogProps {
  doc: DealDocument;
  extraction: DemoDraft["extractions"][string] | undefined;
  /** The passage to open on (a field path); the main finding when omitted. */
  initialKey?: string;
  onClose: () => void;
}

type Source = { docId: string; src: Blob | string | null };

export function DocumentDialog({ doc, extraction, initialKey, onClose }: DocumentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const passages: Passage[] = extraction ? passagesOf(extraction.result, extraction.verified) : [];
  const [selectedKey, setSelectedKey] = useState(initialKey ?? passages[0]?.key ?? null);
  const selected = passages.find((p) => p.key === selectedKey) ?? null;
  const [source, setSource] = useState<Source | null>(null);
  const src = source?.docId === doc.id ? source.src : undefined;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // The stored copy keeps its identity while the dialog is open, so the viewer loads it once.
  useEffect(() => {
    let cancelled = false;
    void getFile(doc.id).then((blob) => {
      if (cancelled) return;
      const sample = SAMPLE_DOCUMENT_FILES.some((f) => f.fileName === doc.fileName);
      setSource({ docId: doc.id, src: blob ?? (sample ? samplePath(doc.fileName) : null) });
    });
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.fileName]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="document-dialog-title document-dialog-file"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[1040px] max-w-[calc(100%-32px)] rounded-xl border border-line bg-page p-0 text-ink shadow-xl backdrop:bg-ink/50"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.04em] text-muted">Read by the AI</div>
            <h2 id="document-dialog-title" className="mt-0.5 font-display text-lg font-semibold leading-6">
              {typeLabel(doc.type)}
            </h2>
            <div id="document-dialog-file" className="truncate font-mono text-[11px] leading-4 text-ink-2">
              {doc.fileName}
            </div>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-xl text-ink-2 hover:bg-surface hover:text-ink"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-[999_1_480px]">
            {src === undefined ? (
              <div className="flex h-[400px] items-center justify-center rounded-md border border-line-strong bg-[#EEF2F6] text-xs text-muted">
                Loading the document…
              </div>
            ) : src === null ? (
              <p className="rounded-md border border-line-strong bg-surface p-4 text-ink-2">
                This file is no longer stored in this browser. Remove it and add it again to view it.
              </p>
            ) : (
              <PdfViewer
                src={src}
                page={selected?.page ?? 1}
                highlight={selected?.quote ?? null}
                height={480}
                title={doc.fileName}
              />
            )}
          </div>

          {passages.length > 0 && (
            <section aria-labelledby="passages-title" className="min-w-0 flex-[1_1_260px]">
              <h3 id="passages-title" className="text-sm font-semibold">
                Passages the AI read
              </h3>
              <p className="text-xs leading-[18px] text-muted">Choose one to highlight it in the document.</p>
              <ul className="mt-2 flex max-h-[440px] flex-col gap-1 overflow-y-auto">
                {passages.map((p) => (
                  <li key={p.key}>
                    <button
                      type="button"
                      aria-pressed={p.key === selected?.key}
                      onClick={() => setSelectedKey(p.key)}
                      className={cx(
                        "flex min-h-11 w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[13px] leading-[18px]",
                        p.key === selected?.key
                          ? "border-hl-line bg-hl text-ink"
                          : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                      )}
                    >
                      <span className="min-w-0 break-words">
                        {p.label}
                        {!p.verified && <span className="block text-xs text-pen">Quote not found on this page</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted">p. {p.page}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
