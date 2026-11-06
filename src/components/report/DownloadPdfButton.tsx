"use client";

/**
 * Creates the report PDF in the browser and saves it as `model.fileName`. @react-pdf/renderer and the PDF document are
 * imported on the first click, so they are neither part of the page's bundle nor run on the server.
 */
import { useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { SAMPLE_PHOTOS, samplePath } from "@/lib/data/seed";
import type { ReportModel } from "@/lib/report/buildReport";
import { getFile } from "@/lib/store/files";

/** Image types a PDF can embed. */
const EMBEDDABLE = /^image\/(jpe?g|png)$/;

/**
 * The cover photo for the PDF: the client's file from IndexedDB, else the bundled sample of that name (the seeded
 * deal's photos are not in IndexedDB); null when there is none or the PDF cannot embed its format.
 */
async function coverPhoto(photo: ReportModel["cover"]["photo"]): Promise<string | Blob | null> {
  if (!photo) return null;
  const stored = await getFile(photo.id);
  if (stored) return EMBEDDABLE.test(stored.type) ? stored : null;
  if (!SAMPLE_PHOTOS.some((p) => p.fileName === photo.fileName)) return null;
  return new URL(samplePath(photo.fileName), window.location.href).href;
}

function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the browser to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type DownloadPdfButtonProps = {
  model: ReportModel;
  label: string;
  variant?: ButtonVariant;
  className?: string;
};

export function DownloadPdfButton({ model, label, variant = "primary", className }: DownloadPdfButtonProps) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  const download = async () => {
    setState("working");
    try {
      const [{ renderReportPdf }, photo] = await Promise.all([
        import("@/components/report/ReportDocument"),
        coverPhoto(model.cover.photo).catch(() => null),
      ]);
      saveFile(await renderReportPdf(model, photo), model.fileName);
      setState("idle");
    } catch (error) {
      console.error("[report] The PDF could not be created.", error);
      setState("failed");
    }
  };

  return (
    <div className={cx("flex flex-col items-start gap-1", className)}>
      <Button variant={variant} onClick={download} disabled={state === "working"} aria-busy={state === "working"}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
          <path
            d="M8 2v8m0 0 3-3m-3 3L5 7M3 12.5h10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {state === "working" ? "Preparing PDF…" : label}
      </Button>
      <p role="status" className="text-xs leading-[18px] text-pen">
        {state === "failed" ? "The PDF could not be created. Please try again." : ""}
      </p>
    </div>
  );
}
