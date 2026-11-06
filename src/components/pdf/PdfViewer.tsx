"use client";

/**
 * `<PdfViewer src page highlight height? />`: one page of a PDF with the cited passage marked in its text layer
 * (`<mark class="censio-hl">`, styled in globals.css). The match ignores whitespace, case and compatibility forms and
 * may span several text items. The viewer pages through the document; the toolbar shows "Page n of m".
 *
 * react-pdf needs browser APIs, so the viewer itself is loaded on the client only (`next/dynamic`, `ssr: false`).
 * Pass a Blob from IndexedDB or a URL such as `samplePath(fileName)`; keep a Blob's identity stable between renders.
 */
import dynamic from "next/dynamic";
import "react-pdf/dist/Page/TextLayer.css";
import type { PdfDocumentViewProps } from "./PdfDocumentView";

export type PdfViewerProps = PdfDocumentViewProps & { className?: string };

/** Height of the viewer's toolbar row, in px; the loading placeholder reserves it. */
const TOOLBAR_HEIGHT = 53;

const PdfDocumentView = dynamic(() => import("./PdfDocumentView"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center bg-[#EEF2F6] text-xs text-muted"
      style={{ height: `calc(var(--pdf-viewer-height) + ${TOOLBAR_HEIGHT}px)` }}
    >
      Loading PDF viewer…
    </div>
  ),
});

export function PdfViewer({ className, ...props }: PdfViewerProps) {
  const style = { "--pdf-viewer-height": `${props.height ?? 360}px` } as React.CSSProperties;
  return (
    <div
      data-testid="pdf-viewer"
      className={`flex min-w-0 flex-col overflow-hidden rounded-md border border-line-strong bg-[#FCFCFD] ${className ?? ""}`}
      style={style}
    >
      <PdfDocumentView {...props} />
    </div>
  );
}

export default PdfViewer;
