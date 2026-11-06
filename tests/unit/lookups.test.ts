import { describe, expect, it } from "vitest";
import comparables from "@/lib/data/comparables.json";
import { lookupLandValue } from "@/lib/lookups/boris";
import { lookupCapRate, MARKET_REPORT_2026 } from "@/lib/lookups/marketReport";
import { PLAUSIBILITY } from "@/lib/lookups/plausibility";
import { ANNEX3 } from "@/lib/lookups/costs";

describe("sample lookups", () => {
  it("returns the BORIS sample zone for 04109", () => {
    const l = lookupLandValue("04109");
    expect(l).toEqual({ zone: "0412", valuePerM2: 520, asOf: "2026-01-01", confidence: "high", note: null });
  });

  it("falls back with low confidence for other postcodes", () => {
    const l = lookupLandValue("10115");
    expect(l.valuePerM2).toBe(400);
    expect(l.confidence).toBe("low");
    expect(l.note).toBe("No sample data for this address");
  });

  it("maps pre-war multi-family houses to the 2.5–3.5 % row", () => {
    const c = lookupCapRate(1912);
    expect(c.row.key).toBe("mfh_pre1949");
    expect(c.row.median).toBe(0.03);
    expect(c.row.range).toEqual([0.025, 0.035]);
    expect(c.row.n).toBe(64);
    expect(c.districtValue).toBeNull();
    expect(c.page).toBe(47);
    expect(c.table).toBe(12);
  });

  it("maps post-war buildings to the 1949+ row", () => {
    expect(lookupCapRate(1960).row.key).toBe("mfh_post1949");
  });

  it("keeps the market report rows in spec order", () => {
    expect(MARKET_REPORT_2026.map((r) => r.key)).toEqual(["efh", "mfh_pre1949", "mfh_post1949", "mixed"]);
  });

  it("exposes plausibility ranges and Annex 3 constants", () => {
    expect(PLAUSIBILITY.perM2.range).toEqual([2050, 2520]);
    expect(PLAUSIBILITY.grossMultiplier.range).toEqual([17.5, 23.0]);
    expect(ANNEX3).toEqual({ managementPerUnit: 367, maintenancePerM2: 14.4, rentLossRate: 0.02, totalLifeYears: 80, vacancyMonths: 6 });
  });

  it("bundles 38 comparables", () => {
    expect(comparables).toHaveLength(38);
  });
});
