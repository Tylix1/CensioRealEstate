import { describe, expect, it } from "vitest";
import { EXAMPLE_CAP_RATE, EXAMPLE_NOTE, limitFacts, sampleFacts } from "@/app/how-it-works/facts";
import { seededDeal } from "@/lib/data/seed";
import { runPipeline } from "@/lib/pipeline/run";
import { parseNote } from "@/lib/revalue/parser";
import { buildRevalueContext } from "@/lib/revalue/schema";

// P1 · How Censio works (plan Task 19): the figures the explainer quotes come from the app's own pipeline, so the
// page cannot drift from the demo. Canonical values: spec §5.3 (sample deal) and §6.4 (limits).

describe("sampleFacts", () => {
  const facts = sampleFacts();

  it("describes the seeded sample deal as the AI prepared it (v1)", () => {
    expect(facts).toMatchObject({
      dealId: "CEN-2026-0147",
      zip: "04109",
      documents: 5,
      pages: 9,
      photos: 3,
      units: 8,
      livingArea: "565 m²",
      landValue: "520 €/m²",
      capRate: "3.0 %",
      capRateRange: "2.5–3.5 %",
      comparables: 38,
      marketRent: "9.60 €/m²",
      marketValue: "€1,300,000",
      crossChecks: 6,
      crossChecksPassed: 6,
      verifiedNumbers: 27,
      judgementCalls: 4,
    });
  });

  it("gives the valuer's revision of the demo: cap rate 3.4 % → €1,210,000 (−6.9 %)", () => {
    expect(facts.exampleCapRate).toBe("3.4 %");
    expect(facts.revisedValue).toBe("€1,210,000");
    expect(facts.revisedChange).toBe("−6.9 %");
  });

  it("is deterministic", () => {
    expect(sampleFacts()).toEqual(facts);
  });
});

describe("EXAMPLE_NOTE", () => {
  it("is read by the Demo-mode parser as the cap rate the explainer quotes", () => {
    const out = runPipeline(seededDeal());
    const result = parseNote(EXAMPLE_NOTE, buildRevalueContext(out, "cap_rate"));
    expect(result.intent).toBe("change_parameters");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ parameter: "capRate", to: EXAMPLE_CAP_RATE });
  });
});

describe("limitFacts", () => {
  it("states the usage limits of spec §6.4 from the routes' own constants", () => {
    expect(limitFacts()).toEqual({
      batchesPerHour: 3,
      notesPerHour: 15,
      filesPerDeal: 8,
      pagesPerPdf: 10,
      mbPerPdf: 5,
      noteChars: "1,000",
      capRateNoteRange: "2.0–6.0 %",
    });
  });
});
