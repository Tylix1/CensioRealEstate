/** Formatting helpers. All UI numbers go through these so copy stays consistent. */

const MINUS = "−";

/** Half-up rounding to two decimals, robust against binary floating-point noise. */
export function round2(x: number): number {
  return Math.round(x * 100 + 1e-7) / 100;
}

function groupThousands(n: number, decimals: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** `€1,300,000`; negative values use a real minus sign: `−€21,087`. */
export function eur(n: number, opts: { decimals?: 0 | 2; sign?: boolean } = {}): string {
  const decimals = opts.decimals ?? 0;
  const factor = decimals === 2 ? 100 : 1;
  const rounded = Math.round(Math.abs(n) * factor + 1e-7) / factor;
  const body = `€${groupThousands(rounded, decimals)}`;
  if (n < 0 && rounded !== 0) return `${MINUS}${body}`;
  if (opts.sign && rounded !== 0) return `+${body}`;
  return body;
}

/** `3.0 %` for 0.03. */
export function pct(r: number, decimals = 1): string {
  const value = (r * 100).toFixed(decimals);
  return `${value} %`;
}

/** `9.60 €/m²`. */
export function rentM2(n: number): string {
  return `${round2(n).toFixed(2)} €/m²`;
}

/** Thousands of euros for swing labels: `+€128k`, `−€111k`, `±€0`. */
export function kEur(n: number, sign = false): string {
  const k = Math.round(Math.abs(n) / 1000);
  if (k === 0) return "±€0";
  const body = `€${k}k`;
  if (n < 0) return `${MINUS}${body}`;
  return sign ? `+${body}` : body;
}

/** Plain number with thousands separators. */
export function num(n: number, decimals = 0): string {
  return groupThousands(n, decimals);
}

/** `20.0×` */
export function times(n: number): string {
  return `${n.toFixed(1)}×`;
}
