/**
 * A plausibility strip (mockup verdict band): the reference range as a grey band on an axis, and this deal as a dot.
 * `range` is the band, e.g. [2050, 2520] €/m²; `axis` the strip's ends, e.g. [1800, 2800]; values beyond the axis sit
 * at its ends.
 */
export type DotStripProps = {
  range: [number, number];
  value: number;
  axis: [number, number];
  /** Formats the captions under the strip: the range ends and "this deal …". Without it there are no captions. */
  format?: (n: number) => string;
  /** Replaces the default description, e.g. "Euro per square metre inside the range 2,050 to 2,520". */
  ariaLabel?: string;
  className?: string;
};

/** Whether `value` lies inside `range` (ends included). */
export function insideRange(range: [number, number], value: number): boolean {
  return value >= Math.min(...range) && value <= Math.max(...range);
}

export function DotStrip({ range, value, axis, format, ariaLabel, className }: DotStripProps) {
  const [axisMin, axisMax] = axis[0] <= axis[1] ? axis : [axis[1], axis[0]];
  const span = axisMax - axisMin || 1;
  const at = (n: number) => Math.max(0, Math.min(100, ((n - axisMin) / span) * 100));
  const low = Math.min(...range);
  const high = Math.max(...range);
  const show = format ?? ((n: number) => n.toLocaleString("en-US"));
  const where = insideRange(range, value) ? "inside" : "outside";

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={ariaLabel ?? `This deal ${show(value)}, ${where} the range ${show(low)} to ${show(high)}`}
        className="relative mt-1 h-3.5"
      >
        <div className="absolute inset-x-0 top-1.5 h-0.5 bg-line" />
        <div className="absolute top-[3px] h-2 rounded bg-calc" style={{ left: `${at(low)}%`, width: `${at(high) - at(low)}%` }} />
        <div
          className="absolute top-0 -ml-[7px] size-3.5 rounded-full border-2 border-surface bg-ink"
          style={{ left: `${at(value)}%` }}
        />
      </div>
      {format && (
        <div className="tnum flex justify-between gap-2 text-[11px] leading-4 text-muted">
          <span>{format(low)}</span>
          <span>this deal {format(value)}</span>
          <span>{format(high)}</span>
        </div>
      )}
    </div>
  );
}
