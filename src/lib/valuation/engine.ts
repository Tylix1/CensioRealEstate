/**
 * Ertragswert (income approach) valuation engine, general method of § 28 ImmoWertV (spec §5.3.5).
 * A pure function of its input: no lookups, no clock, no rounding except where the spec defines it.
 */
import { round2 } from "@/lib/format";
import { ANNEX3 } from "@/lib/lookups/costs";

export interface ValuationUnitInput {
  id: string;
  areaM2: number;
  /** null = vacant */
  inPlaceRentPerM2: number | null;
  /** Rent-estimator result, before the valuer's factor or overrides. */
  marketRentPerM2: number;
}

export interface ValuationParams {
  /** Liegenschaftszins as a fraction, e.g. 0.03. */
  capRate: number;
  remainingLifeYears: number;
  underRentYears: number;
  /** Euro amount subtracted from the value (positive = deduction). */
  easementDeduction: number;
  /** 1 = estimator */
  marketRentFactor: number;
  /** unitId → €/m² */
  marketRentOverrides: Record<string, number>;
}

export interface ValuationInput {
  units: ValuationUnitInput[];
  plotM2: number;
  landValuePerM2: number;
  managementPerUnit: number;
  maintenancePerM2: number;
  rentLossRate: number;
  vacancyMonths: number;
  params: ValuationParams;
}

export interface UnitShare {
  unitId: string;
  /** Effective market rent (after factor and overrides). */
  marketRentPerM2: number;
  marketRentPerMonth: number;
  /** null = vacant */
  inPlaceRentPerMonth: number | null;
  /** (in-place − market) / market as a fraction, e.g. −0.092; null when vacant (or without market rent). */
  gapPct: number | null;
  /** Share of the building's market rent as a fraction; the shares sum to 1. */
  sharePct: number;
  /** Market value split by sharePct, rounded to €100; the values sum to marketValue. */
  value: number;
}

export interface ValuationResult {
  grossIncome: number;
  management: number;
  maintenance: number;
  rentLoss: number;
  operatingCosts: number;
  /** operatingCosts / grossIncome as a fraction. */
  operatingCostRatio: number;
  netIncome: number;
  landValue: number;
  landInterest: number;
  buildingNetIncome: number;
  pvFactor: number;
  buildingValue: number;
  preliminaryValue: number;
  /** Σ in-place rent of the occupied units × 12. */
  inPlaceIncome: number;
  /** (Σ market − Σ in-place) × 12 over the occupied units; negative when over-rented. */
  underRentPerYear: number;
  underRentAnnuityFactor: number;
  underRentDeduction: number;
  easementDeduction: number;
  vacancyDeduction: number;
  marketValueExact: number;
  /** Rounded to the nearest €10,000. */
  marketValue: number;
  /** marketValue / living area, nearest integer. */
  valuePerM2: number;
  /** marketValue / grossIncome, 1 decimal place. */
  grossMultiplier: number;
  livingAreaM2: number;
  units: UnitShare[];
}

const MARKET_VALUE_STEP = 10_000;
const UNIT_VALUE_STEP = 100;

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Annuity (present-value) factor `(1 − (1+r)^−n) / r`; equals n at a zero rate. */
export function presentValueFactor(rate: number, years: number): number {
  if (Math.abs(rate) < 1e-12) return years;
  return (1 - Math.pow(1 + rate, -years)) / rate;
}

/**
 * Remaining economic life: `min(totalLife, max(totalLife − age, floor(10 + 2.5 × points)))`.
 * A simplified, monotonic stand-in for the ImmoWertV Annex 2 model (1912, 2026, 13 points → 42 years).
 */
export function remainingLife(
  builtYear: number,
  valuationYear: number,
  points: number,
  totalLife: number = ANNEX3.totalLifeYears,
): number {
  const age = valuationYear - builtYear;
  return Math.min(totalLife, Math.max(totalLife - age, Math.floor(10 + 2.5 * points)));
}

/** The valuer's per-unit override if set, else the estimator rent scaled by the factor (half-up to cents). */
export function effectiveMarketRent(u: ValuationUnitInput, p: ValuationParams): number {
  return p.marketRentOverrides?.[u.id] ?? round2(u.marketRentPerM2 * p.marketRentFactor);
}

/**
 * Splits the market value by market-rent share, each rounded to €100.
 * The rounding remainder goes to the unit with the largest share (the first one on a tie).
 */
function splitValue(marketValue: number, marketRentsPerMonth: number[]): { sharePct: number; value: number }[] {
  const n = marketRentsPerMonth.length;
  if (n === 0) return [];
  const total = sum(marketRentsPerMonth);
  // Without any market rent there is nothing to weight by: split equally rather than divide by zero.
  const shares = total > 0 ? marketRentsPerMonth.map((m) => m / total) : marketRentsPerMonth.map(() => 1 / n);
  const values = shares.map((s) => Math.round((marketValue * s) / UNIT_VALUE_STEP) * UNIT_VALUE_STEP);
  let largest = 0;
  for (let i = 1; i < n; i++) if (shares[i] > shares[largest]) largest = i;
  values[largest] += marketValue - sum(values);
  return shares.map((sharePct, i) => ({ sharePct, value: values[i] }));
}

export function computeValuation(input: ValuationInput): ValuationResult {
  const p = input.params;

  const rows = input.units.map((u) => {
    const marketRentPerM2 = effectiveMarketRent(u, p);
    const marketRentPerMonth = marketRentPerM2 * u.areaM2;
    const inPlaceRentPerMonth = u.inPlaceRentPerM2 === null ? null : u.inPlaceRentPerM2 * u.areaM2;
    return { unitId: u.id, areaM2: u.areaM2, marketRentPerM2, marketRentPerMonth, inPlaceRentPerMonth };
  });
  const occupied = rows.filter((r) => r.inPlaceRentPerMonth !== null);
  const vacant = rows.filter((r) => r.inPlaceRentPerMonth === null);

  // Gross income and running costs (Annex 3). Vacant units count at market rent.
  const livingAreaM2 = sum(rows.map((r) => r.areaM2));
  const grossIncome = sum(rows.map((r) => r.marketRentPerMonth)) * 12;
  const management = rows.length * input.managementPerUnit;
  const maintenance = livingAreaM2 * input.maintenancePerM2;
  const rentLoss = input.rentLossRate * grossIncome;
  const operatingCosts = management + maintenance + rentLoss;
  const operatingCostRatio = grossIncome !== 0 ? operatingCosts / grossIncome : 0;
  const netIncome = grossIncome - operatingCosts;

  // Land and building value.
  const landValue = input.plotM2 * input.landValuePerM2;
  const landInterest = landValue * p.capRate;
  const buildingNetIncome = netIncome - landInterest;
  const pvFactor = presentValueFactor(p.capRate, p.remainingLifeYears);
  const buildingValue = buildingNetIncome * pvFactor;
  const preliminaryValue = buildingValue + landValue;

  // Special property characteristics (boG): under-rent over the occupied units, vacancy, easement.
  const occupiedMarketPerMonth = sum(occupied.map((r) => r.marketRentPerMonth));
  const inPlacePerMonth = sum(occupied.map((r) => r.inPlaceRentPerMonth ?? 0));
  const inPlaceIncome = inPlacePerMonth * 12;
  const underRentPerYear = (occupiedMarketPerMonth - inPlacePerMonth) * 12;
  const underRentAnnuityFactor = presentValueFactor(p.capRate, p.underRentYears);
  const underRentDeduction = underRentPerYear * underRentAnnuityFactor;
  const vacancyDeduction = sum(vacant.map((r) => r.marketRentPerMonth)) * input.vacancyMonths;
  const easementDeduction = p.easementDeduction;

  const marketValueExact = preliminaryValue - underRentDeduction - easementDeduction - vacancyDeduction;
  // `+ 0` turns a rounded −0 into 0.
  const marketValue = Math.round(marketValueExact / MARKET_VALUE_STEP) * MARKET_VALUE_STEP + 0;
  const valuePerM2 = livingAreaM2 > 0 ? Math.round(marketValue / livingAreaM2) + 0 : 0;
  const grossMultiplier = grossIncome !== 0 ? Math.round((marketValue / grossIncome) * 10) / 10 + 0 : 0;

  const split = splitValue(
    marketValue,
    rows.map((r) => r.marketRentPerMonth),
  );
  const units: UnitShare[] = rows.map((r, i) => ({
    unitId: r.unitId,
    marketRentPerM2: r.marketRentPerM2,
    marketRentPerMonth: r.marketRentPerMonth,
    inPlaceRentPerMonth: r.inPlaceRentPerMonth,
    gapPct:
      r.inPlaceRentPerMonth === null || r.marketRentPerMonth === 0
        ? null
        : (r.inPlaceRentPerMonth - r.marketRentPerMonth) / r.marketRentPerMonth,
    sharePct: split[i].sharePct,
    value: split[i].value,
  }));

  return {
    grossIncome,
    management,
    maintenance,
    rentLoss,
    operatingCosts,
    operatingCostRatio,
    netIncome,
    landValue,
    landInterest,
    buildingNetIncome,
    pvFactor,
    buildingValue,
    preliminaryValue,
    inPlaceIncome,
    underRentPerYear,
    underRentAnnuityFactor,
    underRentDeduction,
    easementDeduction,
    vacancyDeduction,
    marketValueExact,
    marketValue,
    valuePerM2,
    grossMultiplier,
    livingAreaM2,
    units,
  };
}
