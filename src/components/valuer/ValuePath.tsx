"use client";

/**
 * "How the value is built" (spec §5.4 item 6): tiles from the market rent to the market value of the income approach,
 * each with its source marker (glyph, colour and words) and, where a judgement call questions it, a link to that call
 * ("≈ AI · check 2"). All values come from the pipeline and the figure registry of the current version.
 */
import type { ReactNode } from "react";
import { SourceGlyph } from "@/components/ui/SourceBadge";
import { cx } from "@/components/ui/cx";
import { eur, pct } from "@/lib/format";
import type { PipelineOutput } from "@/lib/pipeline/run";
import type { Figure } from "@/lib/registry/registry";
import type { FlagReviewStatus } from "@/lib/store/demoStore";
import { VALUER_INITIALS, flagNumbers, marketRentInUse, rentNumber } from "./review";

export type ValuePathProps = {
  out: PipelineOutput;
  statuses: Record<string, FlagReviewStatus>;
  /** Focuses a judgement call from its tile. */
  onFocusFlag?: (flagId: string) => void;
  /** Registry figure ids to outline while the AI revises (Task 17). */
  outlined?: ReadonlySet<string>;
  className?: string;
};

type Tone = "ai" | "valuer" | "calculated" | "regulation" | "public";

type Tile = {
  key: string;
  label: string;
  value: string;
  /** Registry figures the tile shows, for outlining. */
  figures: string[];
  /** The calls that question it, in flag order. */
  flagIds: string[];
  tone: Tone;
  marker: ReactNode;
  dark?: boolean;
};

const MARKER_TEXT: Record<Tone, string> = {
  ai: "text-ai font-semibold",
  valuer: "text-valuer font-semibold",
  calculated: "text-ink-2",
  regulation: "text-ink-2",
  public: "text-public font-semibold",
};

/** The operator printed after each tile but the last (mockup). */
const OPERATORS = ["→", "−", "=", "→", "→", "−", "="];

function checksText(flagIds: string[], numbers: Record<string, number>): string {
  const ns = flagIds.map((id) => numbers[id]).filter((n): n is number => n !== undefined);
  if (ns.length === 0) return "";
  return ns.length === 1 ? `check ${ns[0]}` : `checks ${ns.join(", ")}`;
}

function buildTiles(out: PipelineOutput): Tile[] {
  const { valuation, params, registry, flags } = out;
  const numbers = flagNumbers(flags);
  const fig = (id: string): Figure | undefined => registry.find((f) => f.id === id);
  const flagsOf = (...figs: (Figure | undefined)[]) =>
    flags.map((f) => f.id).filter((id) => figs.some((g) => g?.flagId === id));
  const byValuer = (...figs: (Figure | undefined)[]) => figs.some((g) => g?.sourceType === "valuer");

  /** "≈ AI · check 2", "Changed by KV · check 1", or the plain source when no call questions it. */
  const judged = (flagIds: string[], valuer: boolean, plain: { tone: Tone; marker: ReactNode }) => {
    const checks = checksText(flagIds, numbers);
    if (valuer) {
      return {
        tone: "valuer" as Tone,
        marker: (
          <>
            <SourceGlyph type="valuer" /> Changed by {VALUER_INITIALS}
            {checks && ` · ${checks}`}
          </>
        ),
      };
    }
    if (checks) {
      return {
        tone: "ai" as Tone,
        marker: (
          <>
            <span aria-hidden="true">≈</span> AI · {checks}
          </>
        ),
      };
    }
    return plain;
  };
  const calculated = { tone: "calculated" as Tone, marker: <><span aria-hidden="true">=</span> calculated</> };
  /** A figure's own source when no call questions it. */
  const plainOf = (figure: Figure | undefined): { tone: Tone; marker: ReactNode } => {
    switch (figure?.sourceType) {
      case "ai_estimate":
        return { tone: "ai", marker: <><span aria-hidden="true">≈</span> AI estimate</> };
      case "public_data":
        return { tone: "public", marker: <><SourceGlyph type="public_data" /> public data</> };
      case "regulation":
        return { tone: "regulation", marker: <><SourceGlyph type="regulation" /> ImmoWertV rule</> };
      default:
        return calculated;
    }
  };

  const marketRent = fig("marketRent");
  const capRate = fig("capRate");
  const remaining = fig("remainingLife");
  const landPerM2 = fig("landValuePerM2");
  const underRent = fig("underRentYears");
  const easement = fig("easementImpact");
  const adjustmentFlags = flags
    .filter((f) => f.kind === "under_rent" || f.kind === "easement" || f.kind === "vacancy")
    .map((f) => f.id);
  const adjustments = valuation.underRentDeduction + valuation.easementDeduction + valuation.vacancyDeduction;

  return [
    {
      key: "marketRent",
      label: "Avg. market rent",
      value: `${rentNumber(marketRentInUse(out))} €/m²`,
      figures: ["marketRent"],
      flagIds: flagsOf(marketRent),
      ...judged(flagsOf(marketRent), byValuer(marketRent), plainOf(marketRent)),
    },
    { key: "grossIncome", label: "Gross income", value: eur(valuation.grossIncome), figures: ["grossIncome"], flagIds: [], ...calculated },
    {
      key: "operatingCosts",
      label: "Operating costs",
      value: eur(valuation.operatingCosts),
      figures: ["operatingCosts"],
      flagIds: [],
      tone: "regulation",
      marker: (
        <>
          <SourceGlyph type="regulation" /> ImmoWertV rule
        </>
      ),
    },
    { key: "netIncome", label: "Net income", value: eur(valuation.netIncome), figures: ["netIncome"], flagIds: [], ...calculated },
    {
      key: "capRate",
      label: "Cap rate · remaining life",
      value: `${pct(params.capRate)} · ${params.remainingLifeYears} yrs · ×${valuation.pvFactor.toFixed(2)}`,
      figures: ["capRate", "remainingLife", "pvFactor"],
      flagIds: flagsOf(capRate, remaining),
      ...judged(flagsOf(capRate, remaining), byValuer(capRate, remaining), plainOf(capRate)),
    },
    {
      key: "building",
      label: "Building + land",
      value: `${eur(valuation.buildingValue)} + ${eur(valuation.landValue)}`,
      figures: ["buildingValue", "landValue"],
      flagIds: flagsOf(landPerM2),
      ...judged(flagsOf(landPerM2), false, {
        tone: "public",
        marker: (
          <>
            <SourceGlyph type="public_data" /> land: public data
          </>
        ),
      }),
    },
    {
      key: "adjustments",
      label: "Adjustments",
      value: adjustments < 0 ? `+${eur(-adjustments)}` : eur(adjustments),
      figures: ["underRentDeduction", "easementImpact"],
      flagIds: adjustmentFlags,
      ...judged(adjustmentFlags, byValuer(underRent, easement), calculated),
    },
    {
      key: "marketValue",
      label: "Market value",
      value: eur(valuation.marketValue),
      figures: ["marketValue"],
      flagIds: [],
      tone: "calculated",
      marker: "rounded",
      dark: true,
    },
  ];
}

function TileBody({ tile, accepted }: { tile: Tile; accepted: boolean }) {
  return (
    <>
      <span className={cx("block text-[11px] leading-4", tile.dark ? "text-calc" : "text-muted")}>{tile.label}</span>
      <span className={cx("tnum block", tile.dark ? "font-bold" : "font-semibold")}>{tile.value}</span>
      <span
        className={cx(
          "flex flex-wrap items-center gap-x-1 text-[11px] leading-4",
          tile.dark ? "text-calc" : MARKER_TEXT[tile.tone],
        )}
      >
        {tile.marker}
      </span>
      {accepted && (
        <span className="block text-[11px] font-semibold leading-4 text-ok">Accepted · {VALUER_INITIALS}</span>
      )}
    </>
  );
}

export function ValuePath({ out, statuses, onFocusFlag, outlined, className }: ValuePathProps) {
  const tiles = buildTiles(out);
  return (
    <section aria-label="How the value is built" className={cx("rounded-xl border border-line bg-surface px-4 py-3.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">How the value is built</h2>
        <span className="text-xs text-muted">Income approach (Ertragswertverfahren, ImmoWertV §§ 27–34)</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-stretch gap-x-1 gap-y-2">
        {tiles.map((tile, i) => {
          const flagged = tile.flagIds.length > 0;
          const accepted = flagged && tile.tone === "ai" && tile.flagIds.every((id) => statuses[id] === "accepted");
          const isOutlined = tile.figures.some((id) => outlined?.has(id));
          const frame = cx(
            "min-w-0 rounded-lg text-left",
            // As wide as their content: all eight tiles share one row at 1440 px and wrap on narrower screens.
            "flex-auto",
            tile.dark
              ? "bg-ink px-2 py-2 text-white"
              : tile.tone === "valuer"
                ? "border-2 border-[#7A5AF8] bg-surface px-[7px] py-[7px]"
                : flagged && tile.tone === "ai"
                  ? "border-2 border-ai-strong bg-surface px-[7px] py-[7px]"
                  : "border border-line bg-surface px-2 py-2",
            isOutlined && "outline-2 outline-offset-2 outline-dashed outline-valuer",
          );
          const target = tile.flagIds.find((id) => statuses[id] === "open") ?? tile.flagIds[0];
          return [
            onFocusFlag && target ? (
              <button
                key={tile.key}
                type="button"
                className={cx(frame, "min-h-11 hover:bg-ai-row")}
                onClick={() => onFocusFlag(target)}
              >
                <TileBody tile={tile} accepted={accepted} />
              </button>
            ) : (
              <div key={tile.key} className={frame}>
                <TileBody tile={tile} accepted={accepted} />
              </div>
            ),
            i < OPERATORS.length ? (
              <span key={`${tile.key}-op`} aria-hidden="true" className="self-center text-faint">
                {OPERATORS[i]}
              </span>
            ) : null,
          ];
        })}
      </div>
    </section>
  );
}
