import { describe, expect, it } from "vitest";
import { eur, kEur, pct, rentM2, round2 } from "@/lib/format";

describe("format helpers", () => {
  it("formats euro amounts with thousands separators", () => {
    expect(eur(1300000)).toBe("€1,300,000");
    expect(eur(12373.76)).toBe("€12,374");
    expect(eur(5040.3, { decimals: 2 })).toBe("€5,040.30");
  });

  it("uses a real minus sign and optional plus sign", () => {
    expect(eur(-21086.8, { sign: true })).toBe("−€21,087");
    expect(eur(8063, { sign: true })).toBe("+€8,063");
    expect(eur(-21086.8)).toBe("−€21,087");
  });

  it("formats percentages with a space before the sign", () => {
    expect(pct(0.034)).toBe("3.4 %");
    expect(pct(0.03)).toBe("3.0 %");
    expect(pct(0.19011, 1)).toBe("19.0 %");
  });

  it("rounds half-up to two decimals", () => {
    expect(round2(9.605)).toBe(9.61);
    expect(round2(9.635)).toBe(9.64);
    expect(round2(9.56 - 0.005 + 0.05)).toBe(9.61);
  });

  it("formats rents per square metre", () => {
    expect(rentM2(9.6)).toBe("9.60 €/m²");
    expect(rentM2(9.605)).toBe("9.61 €/m²");
  });

  it("formats thousands of euros for swing labels", () => {
    expect(kEur(127765, true)).toBe("+€128k");
    expect(kEur(-111365.56, true)).toBe("−€111k");
    expect(kEur(0, true)).toBe("±€0");
  });
});
