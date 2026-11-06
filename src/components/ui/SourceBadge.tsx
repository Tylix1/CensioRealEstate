import type { SourceType } from "@/lib/registry/registry";
import { cx } from "./cx";

/**
 * Source markers (spec §5.4): a glyph, a colour and words, never colour alone.
 *
 * | Source type     | Glyph        | Colour                 |
 * |-----------------|--------------|------------------------|
 * | client_document | page icon    | blue                   |
 * | public_data     | building     | teal                   |
 * | regulation      | §            | slate                  |
 * | calculated      | =            | grey                   |
 * | ai_estimate     | ≈            | amber                  |
 * | client_input    | pencil       | blue outline           |
 * | valuer          | initials KV  | violet                 |
 */
export const SOURCE_WORDS: Record<SourceType, string> = {
  client_document: "Client document",
  public_data: "Public data",
  regulation: "ImmoWertV rule",
  calculated: "Calculated",
  ai_estimate: "AI estimate",
  client_input: "Changed by client",
  valuer: "Changed by valuer",
};

const BADGE_STYLE: Record<SourceType, string> = {
  client_document: "bg-doc-weak text-doc",
  public_data: "bg-public-weak text-public",
  regulation: "bg-rule-weak text-rule",
  calculated: "border border-line-strong bg-subtle text-muted",
  ai_estimate: "bg-ai-weak text-ai",
  client_input: "border border-doc bg-surface text-doc",
  valuer: "bg-valuer-weak text-valuer",
};

/** The valuer's initials (plan "Sample world": K. Vogel). */
const VALUER_INITIALS = "KV";

function IconSvg({ d }: { d: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The glyph alone, e.g. for a legend; decorative, so pair it with the words. */
export function SourceGlyph({ type }: { type: SourceType }) {
  switch (type) {
    case "client_document":
      return <IconSvg d="M3 1.2h4l2.4 2.4v7.2H3z" />;
    case "public_data":
      return <IconSvg d="M1.5 4.5 6 2l4.5 2.5M2.6 5v4.4M4.9 5v4.4M7.1 5v4.4M9.4 5v4.4M1.5 10.4h9" />;
    case "client_input":
      return <IconSvg d="M7.8 2.2l2 2-5.6 5.6-2.6.6.6-2.6zM6.8 3.2l2 2" />;
    case "valuer":
      return (
        <span aria-hidden="true" className="rounded-full bg-valuer px-1 text-[9px] font-bold leading-3 text-white">
          {VALUER_INITIALS}
        </span>
      );
    case "regulation":
      return <span aria-hidden="true">§</span>;
    case "calculated":
      return <span aria-hidden="true">=</span>;
    case "ai_estimate":
      return <span aria-hidden="true">≈</span>;
  }
}

export type SourceBadgeProps = {
  type: SourceType;
  /** Replaces the default words, e.g. "AI estimate · rent model" or "Client document · tenant list p. 2". */
  label?: string;
  className?: string;
};

export function SourceBadge({ type, label, className }: SourceBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-[5px] rounded-full px-[9px] py-0.5 text-[11px] font-semibold leading-4",
        BADGE_STYLE[type],
        className,
      )}
    >
      <SourceGlyph type={type} />
      <span className="min-w-0">{label ?? SOURCE_WORDS[type]}</span>
    </span>
  );
}
