"use client";

/**
 * C5's simulated delivery email (spec §5.2): from reports@censio.example, "Your valuation report is ready — <street>",
 * the value in the body, and the report attached with **Download PDF**.
 */
import { Fragment } from "react";
import { CensioMark } from "@/components/ui/AppBar";
import { Pill } from "@/components/ui/Pill";
import { cx } from "@/components/ui/cx";
import type { ReportEmail, ReportModel } from "@/lib/report/buildReport";
import { DownloadPdfButton } from "./DownloadPdfButton";

/** A file name that may break after its underscores on a narrow screen (they are no break opportunity by default). */
function breakable(fileName: string) {
  const parts = fileName.split("_");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          _<wbr />
        </>
      )}
    </Fragment>
  ));
}

/** "Censio RE" and "reports@censio.example" from "Censio RE <reports@censio.example>". */
function sender(from: string): { name: string; address: string } {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(from);
  return match ? { name: match[1], address: match[2] } : { name: from, address: "" };
}

function PdfIcon() {
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" aria-hidden="true" className="shrink-0">
      <path d="M2 2h16l8 8v22H2z" fill="#FFFFFF" stroke="#D0D5DD" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18 2v8h8" fill="none" stroke="#D0D5DD" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="0" y="17" width="20" height="10" rx="2" fill="#B42318" />
      <text x="10" y="24.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#FFFFFF" fontFamily="sans-serif">
        PDF
      </text>
    </svg>
  );
}

export function EmailCard({ email, model, className }: { email: ReportEmail; model: ReportModel; className?: string }) {
  const from = sender(email.from);
  return (
    <article
      aria-labelledby="report-email-subject"
      className={cx("overflow-hidden rounded-xl border border-line bg-surface", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-2 sm:px-5">
        <span className="text-xs font-semibold uppercase leading-4 tracking-[0.04em] text-muted">Inbox</span>
        <Pill tone="sample" size="sm">
          Simulated email
        </Pill>
      </div>
      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <CensioMark size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <div className="min-w-0">
                <span className="font-semibold">{from.name}</span>{" "}
                <span className="break-all text-ink-2">&lt;{from.address}&gt;</span>
              </div>
              <span className="text-xs leading-[18px] text-muted">{email.date}</span>
            </div>
            <div className="text-xs leading-[18px] text-muted">to {email.to}</div>
          </div>
        </div>
        <h2 id="report-email-subject" className="mt-3 font-display text-xl font-semibold leading-7">
          {email.subject}
        </h2>
        <div className="mt-2 flex max-w-[680px] flex-col gap-2 text-[15px] leading-[22px]">
          <p>{email.greeting}</p>
          {email.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p>
            {email.closing.map((line, i) => (
              <span key={line} className="block">
                {i === email.closing.length - 1 ? <span className="font-semibold">{line}</span> : line}
              </span>
            ))}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-subtle p-3">
          <div className="flex min-w-0 items-center gap-3">
            <PdfIcon />
            <div className="min-w-0">
              <div className="font-semibold [overflow-wrap:anywhere]">{breakable(email.attachment)}</div>
              <div className="text-xs leading-[18px] text-muted">
                PDF · {model.valueText} · version {model.version} · 9 sections
              </div>
            </div>
          </div>
          <DownloadPdfButton model={model} label="Download PDF" />
        </div>
      </div>
    </article>
  );
}
