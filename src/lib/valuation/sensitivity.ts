/**
 * One-at-a-time sensitivities (spec §5.3.5): each varies a single input of the base valuation
 * and reports delta = exact market value − base exact market value.
 */
import { computeValuation, type ValuationInput, type ValuationParams } from "@/lib/valuation/engine";

export interface SensitivityRanges {
  /** Cap rates as fractions, e.g. [0.025, 0.035]. */
  capRate: [number, number];
  /** Building-average market rent in €/m², e.g. [9.10, 10.20]. */
  marketRentAvg: [number, number];
  underRentYears: [number, number];
  /** Largest easement impact in euros (5 % of land value). */
  easementMax: number;
}

export interface Sensitivity {
  key: "capRate" | "marketRent" | "underRentYears" | "easement";
  /** The first value of the range (not necessarily the downside). */
  low: { input: number; delta: number };
  /** The second value of the range. */
  high: { input: number; delta: number };
}

/**
 * A target building-average market rent, applied as `marketRentFactor = target / baseAvgRent`.
 * Units the valuer overrode keep their override. The other units get their estimator rent × factor
 * as an exact override, skipping the engine's per-unit cent rounding (`effectiveMarketRent`), so that
 * without valuer overrides the building average equals the target exactly. Cent-rounding each unit
 * would move the canonical deltas (−63,215 / +75,859) by −€123 / −€29.
 */
function marketRentPatch(input: ValuationInput, target: number, baseAvgRent: number): Partial<ValuationParams> {
  // Without a base average there is no factor to derive; the market rent stays as it is (delta 0).
  if (!(baseAvgRent > 0)) return {};
  const marketRentFactor = target / baseAvgRent;
  const marketRentOverrides = { ...input.params.marketRentOverrides };
  for (const u of input.units) {
    if (marketRentOverrides[u.id] === undefined) marketRentOverrides[u.id] = u.marketRentPerM2 * marketRentFactor;
  }
  return { marketRentFactor, marketRentOverrides };
}

/**
 * @param baseAvgRent the estimator's building-average market rent (€/m²), e.g. 9.60.
 */
export function computeSensitivities(input: ValuationInput, baseAvgRent: number, ranges: SensitivityRanges): Sensitivity[] {
  const baseExact = computeValuation(input).marketValueExact;
  const deltaWith = (patch: Partial<ValuationParams>): number =>
    computeValuation({ ...input, params: { ...input.params, ...patch } }).marketValueExact - baseExact;
  const vary = (
    key: Sensitivity["key"],
    [low, high]: [number, number],
    patchFor: (value: number) => Partial<ValuationParams>,
  ): Sensitivity => ({
    key,
    low: { input: low, delta: deltaWith(patchFor(low)) },
    high: { input: high, delta: deltaWith(patchFor(high)) },
  });

  return [
    vary("capRate", ranges.capRate, (capRate) => ({ capRate })),
    vary("marketRent", ranges.marketRentAvg, (avg) => marketRentPatch(input, avg, baseAvgRent)),
    vary("underRentYears", ranges.underRentYears, (underRentYears) => ({ underRentYears })),
    // An assumption, not computed: from "no effect" down to the maximum impact.
    {
      key: "easement",
      low: { input: -ranges.easementMax, delta: -ranges.easementMax },
      high: { input: 0, delta: 0 },
    },
  ];
}
