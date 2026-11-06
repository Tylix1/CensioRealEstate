import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * How far a judgement call can move the value (mockup "Needs your eye"): a bar around the current value, the
 * downside to the left of the centre line and the upside to the right, on one shared scale so the flags compare at a
 * glance. `low` and `high` are value changes in euro, e.g. −111000 and +128000; anything beyond ±`scale` is clipped.
 */
export type SwingBarProps = {
  low: number;
  high: number;
  /** Euro at either end of the bar; every bar on a screen should share it. */
  scale?: number;
  /** "sm" for a closed flag row, "md" for the focused one. */
  size?: "sm" | "md";
  /** Optional captions under the ends, e.g. "−€111k at 3.5 %" and "+€128k at 2.5 %". */
  lowLabel?: ReactNode;
  highLabel?: ReactNode;
  /** Replaces the default description, e.g. "Value swing minus 111 thousand to plus 128 thousand euro". */
  ariaLabel?: string;
  className?: string;
};

function spoken(euro: number): string {
  const thousands = Math.round(Math.abs(euro) / 1000);
  if (thousands === 0) return "0";
  return `${euro < 0 ? "minus" : "plus"} ${thousands.toLocaleString("en-US")} thousand`;
}

/**
 * A segment inside one half of the bar, in percent of that half. Its outer end is rounded; the end at the centre line
 * stays square, so a swing that starts at the current value reads as one bar.
 */
function Segment({ from, to, side, height }: { from: number; to: number; side: "low" | "high"; height: string }) {
  if (to - from <= 0) return null;
  const radius =
    side === "low"
      ? cx("rounded-l-full", to < 100 && "rounded-r-full")
      : cx("rounded-r-full", from > 0 && "rounded-l-full");
  return (
    <span
      className={cx("absolute top-1/2 -translate-y-1/2", height, radius, side === "low" ? "bg-ai-mid" : "bg-ai-strong")}
      style={{ left: `${from}%`, width: `${to - from}%` }}
    />
  );
}

export function SwingBar({ low, high, scale = 130000, size = "sm", lowLabel, highLabel, ariaLabel, className }: SwingBarProps) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const clip = (euro: number) => Math.max(-scale, Math.min(scale, euro));
  // Left half: −scale at 0 % … 0 € at 100 %. Right half: 0 € at 0 % … +scale at 100 %.
  const leftFrom = ((clip(lo) + scale) / scale) * 100;
  const leftTo = ((Math.min(clip(hi), 0) + scale) / scale) * 100;
  const rightFrom = (Math.max(clip(lo), 0) / scale) * 100;
  const rightTo = (clip(hi) / scale) * 100;
  const barHeight = size === "md" ? "h-2.5" : "h-2";

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={ariaLabel ?? `Value swing ${spoken(lo)} to ${spoken(hi)} euro`}
        className="flex items-center"
      >
        <span className={cx("relative block flex-1", size === "md" ? "h-[18px]" : "h-4")}>
          {lo < 0 && <Segment from={leftFrom} to={leftTo} side="low" height={barHeight} />}
        </span>
        <span className={cx("block w-0.5 shrink-0 bg-ink", size === "md" ? "h-[18px]" : "h-4")} />
        <span className={cx("relative block flex-1", size === "md" ? "h-[18px]" : "h-4")}>
          {hi > 0 && <Segment from={rightFrom} to={rightTo} side="high" height={barHeight} />}
        </span>
      </div>
      {(lowLabel !== undefined || highLabel !== undefined) && (
        <div
          className={cx(
            "tnum flex justify-between gap-3",
            size === "md" ? "text-xs leading-[18px] text-ink-2" : "text-[11px] leading-4 text-muted",
          )}
        >
          <span>{lowLabel}</span>
          <span className="text-right">{highLabel}</span>
        </div>
      )}
    </div>
  );
}
