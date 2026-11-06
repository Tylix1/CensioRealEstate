"use client";

/**
 * The ledger (spec §5.4 item 8): "Verified automatically: n numbers · 6 cross-checks passed", which expands into every
 * figure no judgement call questions, with its value and source, and the cross-checks. From the figure registry.
 */
import { useId, useState } from "react";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cx } from "@/components/ui/cx";
import type { PipelineOutput } from "@/lib/pipeline/run";
import { countLabel } from "./review";

export type LedgerProps = {
  out: PipelineOutput;
  className?: string;
};

const CELL = "border-b border-page px-4 py-2 align-top";

export function Ledger({ out, className }: LedgerProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const verified = out.registry.filter((f) => f.flagId === null);
  const passed = out.crossChecks.filter((c) => c.passed).length;
  const failed = out.crossChecks.length - passed;

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full justify-between gap-3 border-t border-line bg-subtle px-4 py-3 text-left text-ink hover:bg-page"
      >
        <span>
          <strong>Verified automatically: {countLabel(verified.length, "number")}</strong> ·{" "}
          {countLabel(passed, "cross-check")} passed
          {failed > 0 && <span className="font-semibold text-pen"> · {failed} failed</span>}
        </span>
        <span className="text-ink-2">{open ? "Hide" : "Show"}</span>
      </button>
      <div id={id} hidden={!open} className="overflow-x-auto border-t border-line">
        {open && (
          <table
            aria-label="Verified automatically"
            className="w-full min-w-[520px] table-fixed border-collapse text-[13px] leading-[19px]"
          >
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[22%]" />
              <col />
            </colgroup>
            <thead className="sr-only">
              <tr>
                <th scope="col">Figure</th>
                <th scope="col">Value</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {verified.map((f) => (
                <tr key={f.id}>
                  <td className={CELL}>{f.label}</td>
                  <td className={cx(CELL, "tnum px-2 text-right")}>{f.display}</td>
                  <td className={cx(CELL, "text-ink-2")}>
                    <SourceBadge type={f.sourceType} className="mr-1.5 align-[-2px]" />
                    {f.sourceDetail}
                  </td>
                </tr>
              ))}
              {out.crossChecks.map((c) => (
                <tr key={c.id}>
                  <td className={CELL}>Cross-check</td>
                  <td
                    className={cx(
                      CELL,
                      "whitespace-nowrap px-2 text-right font-semibold",
                      c.passed ? "text-public" : "text-pen",
                    )}
                  >
                    <span aria-hidden="true">{c.passed ? "✓ " : "✕ "}</span>
                    {c.passed ? "passed" : "failed"}
                  </td>
                  <td className={cx(CELL, "text-ink-2")}>
                    <div className="text-ink">{c.label}</div>
                    <div className="text-xs leading-[18px]">{c.detail}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
