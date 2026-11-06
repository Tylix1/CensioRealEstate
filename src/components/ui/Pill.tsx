import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Small rounded labels: statuses ("Awaiting your review", "Delivered"), counts and the "Sample data" marker. A pill's
 * words carry its meaning; the tone only supports them.
 */
export type PillTone = "neutral" | "brand" | "ai" | "ok" | "valuer" | "doc" | "sample";

const TONES: Record<PillTone, string> = {
  neutral: "bg-rule-weak text-ink-2",
  brand: "bg-brand-weak text-brand",
  ai: "bg-ai-weak text-ai",
  ok: "bg-public-weak text-ok",
  valuer: "bg-valuer-weak text-valuer",
  doc: "bg-doc-weak text-doc",
  sample: "border border-dashed border-faint text-ink-2",
};

export type PillProps = HTMLAttributes<HTMLSpanElement> & { tone?: PillTone; size?: "sm" | "md" };

export function Pill({ tone = "neutral", size = "md", className, ...props }: PillProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        size === "md" ? "px-2.5 py-[3px] text-xs leading-[18px]" : "px-2.5 py-0.5 text-[11px] leading-4",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** The marker every screen carries in its app bar: all deals, documents and people are fictitious. */
export function SampleDataPill({ className }: { className?: string }) {
  return (
    <Pill tone="sample" size="sm" className={className} title="All deals, documents and people in this prototype are fictitious">
      Sample data
    </Pill>
  );
}
