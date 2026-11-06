/**
 * The 6 cross-checks of spec §5.3.4, computed from the deal's extracted data. The tenant-list checks compare the
 * extracted unit rows (with any client edits) and leave out units added by hand, which are not in the tenant list.
 * A check whose inputs are missing cannot pass: it reports `passed: false` with a detail starting "Not checked:".
 */
import type { Deal, Unit } from "@/lib/deal/types";
import { eur, num, pct, rentM2 } from "@/lib/format";

export interface CrossCheck {
  id: "rent_total" | "living_area" | "heating_year" | "address" | "zoning" | "over_rent";
  label: string;
  passed: boolean;
  detail: string;
}

export const CROSS_CHECK_LABELS: Record<CrossCheck["id"], string> = {
  rent_total: "Rent total equals the sum of the unit rows",
  living_area: "Living area matches the energy certificate",
  heating_year: "Heating year matches between refurbishment sheet and energy certificate",
  address: "Energy certificate address matches the land register",
  zoning: "Zoning plan permits residential use",
  over_rent: "No implausible over-rent (> 30 % above market)",
};

/** In-place rent may exceed the unit's market rent by at most this share. */
export const OVER_RENT_LIMIT = 0.3;
/** The tenant list's living area may differ from the energy certificate's by this share (rounding of stated areas). */
export const LIVING_AREA_TOLERANCE = 0.01;

/** Runs the checks in the spec's order; `marketRentByUnit` maps unit id → market rent in €/m² per month. */
export function runCrossChecks(deal: Deal, marketRentByUnit: Record<string, number>): CrossCheck[] {
  const rows = deal.units.filter((u) => u.origin === "extracted");
  return [
    rentTotal(deal, rows),
    livingArea(deal, rows),
    heatingYear(deal),
    address(deal),
    zoning(deal),
    overRent(deal, marketRentByUnit),
  ];
}

function check(id: CrossCheck["id"], passed: boolean, detail: string): CrossCheck {
  return { id, label: CROSS_CHECK_LABELS[id], passed, detail };
}

function notChecked(id: CrossCheck["id"], reason: string): CrossCheck {
  return check(id, false, `Not checked: ${reason}.`);
}

function rowsAddUpTo(n: number): string {
  return n === 1 ? "The unit row adds up to" : `The ${n} unit rows add up to`;
}

/** `565` or `565.5`: areas to one decimal, without a trailing `.0`. */
function m2(area: number): string {
  const tenth = Math.round(area * 10) / 10;
  return num(tenth, Number.isInteger(tenth) ? 0 : 1);
}

/** `+1.4 %`, `−2.5 %`, `0.0 %`. */
function signedPct(share: number): string {
  const text = pct(Math.abs(share));
  if (text === pct(0)) return text;
  return `${share < 0 ? "−" : "+"}${text}`;
}

function rentTotal(deal: Deal, rows: Unit[]): CrossCheck {
  const total = deal.property.tenantListTotalRentPerMonth;
  if (rows.length === 0) return notChecked("rent_total", "no unit rows from a tenant list");
  if (total === null) return notChecked("rent_total", "the tenant list gives no rent total");
  let sum = 0;
  let letArea = 0;
  for (const u of rows) {
    if (u.inPlaceRentPerM2 === null) continue;
    sum += u.inPlaceRentPerM2 * u.areaM2;
    letArea += u.areaM2;
  }
  // In-place rents are stored per m², rounded to the cent, so each row may be off by up to half a cent per m².
  const passed = Math.abs(sum - total) <= 0.005 * letArea + 0.005;
  const detail = `${rowsAddUpTo(rows.length)} ${eur(sum, { decimals: 2 })} a month; the total row says ${eur(total, { decimals: 2 })}.`;
  return check("rent_total", passed, passed ? detail : `${detail} Difference: ${eur(Math.abs(sum - total), { decimals: 2 })}.`);
}

function livingArea(deal: Deal, rows: Unit[]): CrossCheck {
  const certified = deal.property.livingAreaM2FromEnergyCert;
  if (certified === null || certified <= 0) return notChecked("living_area", "no living area from an energy certificate");
  if (rows.length === 0) return notChecked("living_area", "no unit rows from a tenant list");
  const area = rows.reduce((sum, u) => sum + u.areaM2, 0);
  const passed = Math.abs(area - certified) <= LIVING_AREA_TOLERANCE * certified + 1e-9;
  const difference = Math.abs(area - certified) < 0.05 ? "" : ` (${signedPct((area - certified) / certified)})`;
  return check(
    "living_area",
    passed,
    `${rowsAddUpTo(rows.length)} ${m2(area)} m²; the energy certificate says ${m2(certified)} m²${difference}.`,
  );
}

function heatingYear(deal: Deal): CrossCheck {
  const { heatingYear: certified, heatingYearFromRefurb: refurbished } = deal.property;
  if (certified === null) return notChecked("heating_year", "no heating year from an energy certificate");
  if (refurbished === null) return notChecked("heating_year", "no heating measure on a refurbishment sheet");
  return certified === refurbished
    ? check("heating_year", true, `Both documents give ${certified}.`)
    : check("heating_year", false, `Refurbishment sheet ${refurbished}, energy certificate ${certified}.`);
}

function address(deal: Deal): CrossCheck {
  const { addressOnEnergyCert: certified, addressOnLandRegister: registered } = deal.property;
  if (!certified) return notChecked("address", "no address from an energy certificate");
  if (!registered) return notChecked("address", "no address from a land register");
  return check("address", sameAddress(certified, registered), `Energy certificate: ${certified}. Land register: ${registered}.`);
}

function zoning(deal: Deal): CrossCheck {
  const plan = deal.property.zoning;
  if (!plan) return notChecked("zoning", "no zoning plan");
  const verdict = plan.residentialAllowed ? "permitted" : "not permitted";
  return check("zoning", plan.residentialAllowed, `${plan.areaType}: residential use ${verdict}.`);
}

function overRent(deal: Deal, marketRentByUnit: Record<string, number>): CrossCheck {
  if (deal.units.length === 0) return notChecked("over_rent", "no units");
  const compared: { unit: Unit; inPlace: number; market: number; gap: number }[] = [];
  let letUnits = 0;
  for (const unit of deal.units) {
    if (unit.inPlaceRentPerM2 === null) continue;
    letUnits++;
    const market = marketRentByUnit[unit.id];
    if (!(market > 0)) continue;
    compared.push({ unit, inPlace: unit.inPlaceRentPerM2, market, gap: unit.inPlaceRentPerM2 / market - 1 });
  }
  if (letUnits === 0) return check("over_rent", true, "No let units to compare.");
  if (compared.length === 0) return notChecked("over_rent", "no market rent estimates");

  // The epsilon keeps a rent of exactly +30 % (13.00 against 10.00 → 0.30000000000000004) inside the limit.
  const over = compared.filter((c) => c.gap > OVER_RENT_LIMIT + 1e-9);
  if (over.length > 0) {
    const lines = over.map(
      (c) => `${c.unit.label}: ${rentM2(c.inPlace)} in place against ${rentM2(c.market)} market (${signedPct(c.gap)})`,
    );
    return check("over_rent", false, `${lines.join("; ")}.`);
  }
  const highest = compared.reduce((a, b) => (b.gap > a.gap ? b : a));
  return check(
    "over_rent",
    true,
    `No unit is more than ${pct(OVER_RENT_LIMIT, 0)} above market; the highest is ${highest.unit.label} at ${signedPct(highest.gap)}.`,
  );
}

/** Lower case, umlauts and ß spelled out, "Str." written as "strasse". */
function normaliseAddress(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/str\.(?=[\s\d,]|$)/g, "strasse");
}

/** Street (letters only), house number with any letter suffix, and the postcode if the address has one. */
function addressKey(text: string): { street: string; number: string; zip: string | null } | null {
  const normalised = normaliseAddress(text);
  const zip = normalised.match(/\b\d{5}\b/)?.[0] ?? null;
  const rest = zip ? normalised.replace(zip, " ") : normalised;
  // The first run of letters directly followed by a number: "musterstrasse 12", "musterstrasse 12 a".
  const match = rest.match(/([a-z][a-z .-]*?)\s*(\d+)\s*([a-z])?(?![a-z\d])/);
  if (!match) return null;
  return { street: match[1].replace(/[^a-z]/g, ""), number: match[2] + (match[3] ?? ""), zip };
}

/** Same street and house number; postcodes must agree only when both addresses give one. */
function sameAddress(a: string, b: string): boolean {
  const ka = addressKey(a);
  const kb = addressKey(b);
  if (!ka || !kb) return normaliseAddress(a).replace(/\W/g, "") === normaliseAddress(b).replace(/\W/g, "");
  return ka.street === kb.street && ka.number === kb.number && (ka.zip === null || kb.zip === null || ka.zip === kb.zip);
}
