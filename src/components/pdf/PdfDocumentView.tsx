"use client";

/**
 * The react-pdf part of `<PdfViewer>`. It touches browser-only APIs when it is imported, so `PdfViewer` loads it with
 * `next/dynamic` and `ssr: false`; import `PdfViewer`, not this module.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { TextContent } from "react-pdf";
import { HIGHLIGHT_CLASS, findHighlight, markText } from "./highlight";

// react-pdf reads the worker location from the module that renders <Document>, so it is set here.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export interface PdfDocumentViewProps {
  /** A URL (e.g. `samplePath(fileName)`) or a Blob (e.g. from IndexedDB); keep a Blob's identity stable. */
  src: string | Blob;
  /** 1-based page to show first; the quoted passage is expected on this page. */
  page: number;
  /** Passage to mark in the text layer; whitespace, case and compatibility forms are ignored. */
  highlight: string | null;
  /** Maximum height of the scrollable page area in px. Without it the whole page is shown. */
  height?: number;
  /** File name or title, used for the accessible name of the page area. */
  title?: string;
}

/** Horizontal padding of the page area, in px, on each side. */
const GUTTER = 12;
/** Widest rendering of a page, in px. */
const MAX_PAGE_WIDTH = 860;
/** Portrait A4, for placeholders before a page is measured. */
const A4_RATIO = 297 / 210;

type Source = PdfDocumentViewProps["src"];

const buttonClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink-2 hover:bg-subtle disabled:cursor-default disabled:opacity-40";

function Notice({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <p
      className={`px-3 py-6 text-center text-xs ${tone === "error" ? "text-pen" : "text-muted"}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

export default function PdfDocumentView({ src, page, highlight, height, title }: PdfDocumentViewProps) {
  // Page navigation. A new document or citation jumps to the cited page.
  const [nav, setNav] = useState({ src, page, current: page });
  if (nav.src !== src || nav.page !== page) setNav({ src, page, current: page });
  const current = nav.src === src && nav.page === page ? nav.current : page;

  // Page count and text items are kept with the document (and page) they belong to, so a new `src` never shows stale
  // ones while it loads.
  const [doc, setDoc] = useState<{ src: Source; numPages: number } | null>(null);
  const numPages = doc?.src === src ? doc.numPages : null;
  const shownPage = numPages === null ? current : Math.min(Math.max(1, current), numPages);

  // The page is rendered at the width of the page area; ResizeObserver reports it after the first layout.
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(Math.floor(entry.contentRect.width)));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const pageWidth = frameWidth === null ? null : Math.max(120, Math.min(MAX_PAGE_WIDTH, frameWidth - 2 * GUTTER));

  // Text items of the page on screen, from its text layer; the highlight is matched against them.
  const [text, setText] = useState<{ src: Source; pageNumber: number; items: TextContent["items"] } | null>(null);
  const textOfShownPage = text && text.src === src && text.pageNumber === shownPage ? text : null;
  const match = useMemo(
    () => (textOfShownPage && highlight ? findHighlight(textOfShownPage.items, highlight) : null),
    [textOfShownPage, highlight],
  );
  const ranges = match && match.matches > 0 ? match.ranges : null;
  const customTextRenderer = useMemo(
    () =>
      ranges
        ? ({ str, itemIndex, pageNumber }: { str: string; itemIndex: number; pageNumber: number }) =>
            markText(str, pageNumber === shownPage ? ranges.get(itemIndex) : undefined)
        : undefined,
    [ranges, shownPage],
  );
  const onGetTextSuccess = useCallback(
    (content: TextContent) => setText({ src, pageNumber: shownPage, items: content.items }),
    [src, shownPage],
  );

  // Scroll the first mark into the middle of the page area, once per page and passage.
  const scrolledFor = useRef<string | null>(null);
  const scrollToHighlight = useCallback(() => {
    const frame = frameRef.current;
    const key = `${shownPage}|${highlight ?? ""}`;
    if (!frame || !ranges || scrolledFor.current === key) return;
    const mark = frame.querySelector<HTMLElement>(`mark.${HIGHLIGHT_CLASS}`);
    if (!mark) return;
    scrolledFor.current = key;
    if (frame.scrollHeight <= frame.clientHeight) return;
    const markBox = mark.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    frame.scrollTop += markBox.top - frameBox.top - (frame.clientHeight - markBox.height) / 2;
  }, [ranges, shownPage, highlight]);

  const goTo = (n: number) => {
    setNav({ src, page, current: n });
    scrolledFor.current = null;
    frameRef.current?.scrollTo({ top: 0 });
  };

  const placeholderHeight = pageWidth === null ? 240 : Math.round(pageWidth * A4_RATIO);
  const pagePlaceholder = (
    <div className="animate-pulse bg-surface" style={{ width: pageWidth ?? undefined, height: placeholderHeight }} />
  );

  let status: React.ReactNode = null;
  if (highlight && highlight.trim() !== "" && numPages !== null) {
    if (page < 1 || page > numPages) {
      status = `The cited page ${page} is not in this document.`;
    } else if (shownPage !== page) {
      status = (
        <>
          The cited passage is on page {page}.
          <button type="button" className="min-h-11 px-1 font-semibold text-brand underline" onClick={() => goTo(page)}>
            Go to page {page}
          </button>
        </>
      );
    } else if (match && match.matches > 0) {
      status = (
        <>
          <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-sm bg-ai-light ring-1 ring-hl-line" />
          Cited passage highlighted
        </>
      );
    } else if (match) {
      status = `The cited passage was not found in the text of page ${shownPage}.`;
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1">
        <span className="tnum px-1 text-xs text-muted" aria-live="polite">
          {numPages === null ? "Loading…" : `Page ${shownPage} of ${numPages}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={buttonClass}
            onClick={() => goTo(shownPage - 1)}
            disabled={numPages === null || shownPage <= 1}
            aria-label="Previous page"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => goTo(shownPage + 1)}
            disabled={numPages === null || shownPage >= numPages}
            aria-label="Next page"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        role="group"
        aria-label={`${title ? `${title}, ` : ""}page ${shownPage}`}
        tabIndex={height ? 0 : undefined}
        className="relative overflow-auto bg-[#EEF2F6]"
        style={height ? { maxHeight: height } : undefined}
      >
        <div className="flex justify-center p-3">
          {pageWidth === null ? (
            pagePlaceholder
          ) : (
            <Document
              file={src}
              suspense={false}
              onLoadSuccess={(pdf) => setDoc({ src, numPages: pdf.numPages })}
              loading={pagePlaceholder}
              error={<Notice tone="error">This PDF could not be opened.</Notice>}
              noData={<Notice>No PDF to show.</Notice>}
            >
              <Page
                pageNumber={shownPage}
                width={pageWidth}
                renderAnnotationLayer={false}
                customTextRenderer={customTextRenderer}
                onGetTextSuccess={onGetTextSuccess}
                onRenderTextLayerSuccess={scrollToHighlight}
                loading={pagePlaceholder}
                error={<Notice tone="error">This page could not be shown.</Notice>}
                // Multiply keeps the page's own glyphs crisp under the marks of the (transparent) text layer.
                className="bg-surface shadow-[0_1px_3px_rgba(16,24,40,0.12)] [&_.textLayer]:mix-blend-multiply"
              />
            </Document>
          )}
        </div>
      </div>

      <p
        className={status === null ? "sr-only" : "flex flex-wrap items-center gap-x-1 px-3 py-1.5 text-xs text-muted"}
        aria-live="polite"
      >
        {status}
      </p>
    </div>
  );
}
