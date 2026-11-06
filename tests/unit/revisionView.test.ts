/**
 * The pure helpers of the Revalue loop and the approval sheet on the review screen (plan Task 17, spec §5.2 V3/V4):
 * the revision banner's title and table of changes, the figures outlined while the AI revises, the "(was …)" titles of
 * calls the valuer changed, and each call's status in the approval sheet.
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_EXAMPLE_NOTES,
  MIN_WORKING_MS,
  REHEARSED_NOTE,
  approvalCalls,
  changedFigures,
  holdMs,
  outlineSet,
  predictedFigures,
  revisionTitle,
  revisionView,
  signReady,
  valuerNotesOf,
  wasNotes,
} from "@/components/valuer/revision";
import { seededDeal } from "@/lib/data/seed";
import { runCurrentVersion, runPipeline, runVersion } from "@/lib/pipeline/run";
import {
  addRevision,
  applyChanges,
  currentVersion,
  initialHistory,
  undoLast,
  type History,
  type ParamChange,
} from "@/lib/revisions/history";
import { flagReviewStatuses, type StoredDeal } from "@/lib/store/demoStore";

const deal = seededDeal();
const draft = runPipeline(deal);
const V1 = initialHistory(draft.params, "2026-11-06T09:00:00.000Z");

const CAP: ParamChange = { parameter: "capRate", from: 0.03, to: 0.034, reason: "note", sourceKind: "valuer_judgement" };
const ATTIC: ParamChange = {
  parameter: "marketRentUnit",
  unitId: "u8",
  from: 9.92,
  to: 9.5,
  reason: "note",
  sourceKind: "valuer_judgement",
};
const UNDER: ParamChange = { parameter: "underRentYears", from: 5, to: 8, reason: "note", sourceKind: "valuer_judgement" };

function revise(
  h: History,
  changes: ParamChange[],
  note: string,
  flagId: string | null,
  aiMode: "live" | "demo" = "demo",
  durationMs = 2,
): History {
  const out = runCurrentVersion(deal, h);
  const params = applyChanges(currentVersion(h).params, changes, out.rent.average);
  return addRevision(h, {
    params,
    note,
    flagId,
    changes,
    explanation: "The AI's explanation.",
    aiMode,
    createdAt: "2026-11-06T12:00:00.000Z",
    durationMs,
  });
}

function stored(history: History, patch: Partial<StoredDeal> = {}): StoredDeal {
  return {
    deal,
    history,
    flagStatus: { cap_rate: "open", market_rent: "open", under_rent: "open", "easement-1": "open" },
    openedFlags: [],
    spotCheck: "open",
    approval: null,
    ...patch,
  };
}

const V2 = revise(V1, [CAP], REHEARSED_NOTE, "cap_rate");
const V3 = revise(V2, [ATTIC], "attic rent 9.50", "market_rent");

describe("the demo example notes and the working state", () => {
  it("offers the rehearsed note, the attic rent and the under-rent period", () => {
    expect(REHEARSED_NOTE).toBe(
      "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.",
    );
    expect(DEMO_EXAMPLE_NOTES).toEqual([REHEARSED_NOTE, "attic rent 9.50", "Under-rent will close in 8 years"]);
  });

  it("keeps the working state visible for at least 1.2 s, and no longer than the AI takes beyond that", () => {
    expect(MIN_WORKING_MS).toBe(1200);
    expect(holdMs(3)).toBe(1197);
    expect(holdMs(1200)).toBe(0);
    expect(holdMs(4800)).toBe(0);
  });
});

describe("revisionTitle", () => {
  it("gives a live revision's measured duration to one decimal", () => {
    expect(revisionTitle({ n: 2, aiMode: "live", durationMs: 4213 })).toBe(
      "Revision 2 · the AI revised the valuation in 4.2 s",
    );
    expect(revisionTitle({ n: 4, aiMode: "live", durationMs: 12_049 })).toBe(
      "Revision 4 · the AI revised the valuation in 12.0 s",
    );
  });

  it("says demo mode instead of the parser's near-zero duration", () => {
    expect(revisionTitle({ n: 3, aiMode: "demo", durationMs: 0.4 })).toBe("Revision 3 · revised in demo mode");
  });
});

describe("revisionView", () => {
  it("is null while the AI draft is the current version", () => {
    expect(revisionView(stored(V1), draft)).toBeNull();
    const undone = undoLast(V2);
    expect(revisionView(stored(undone), runCurrentVersion(deal, undone))).toBeNull();
  });

  it("lists the changes of v2 against v1, formatted, with the valuer's parameter marked", () => {
    const view = revisionView(stored(V2), runCurrentVersion(deal, V2));
    expect(view).not.toBeNull();
    expect(view).toMatchObject({
      n: 2,
      prevN: 1,
      title: "Revision 2 · revised in demo mode",
      note: REHEARSED_NOTE,
      explanation: "The AI's explanation.",
      aiMode: "demo",
    });
    expect(view!.rows.map((r) => [r.label, r.from, r.to, r.change, r.byValuer, r.total])).toEqual([
      ["Cap rate", "3.0 %", "3.4 %", null, true, false],
      ["Land-value interest", "€7,488", "€8,486", null, false, false],
      ["Present-value factor", "23.7014", "22.1897", null, false, false],
      ["Building value", "€1,071,923", "€981,405", null, false, false],
      ["Under-rent deduction", "−€21,087", "−€20,848", null, false, false],
      ["Market value", "€1,300,000", "€1,210,000", "−6.9 %", false, true],
    ]);
    expect(view!.prevValue).toBe(1_300_000);
  });

  it("names the unit whose market rent the valuer changed, against the previous version", () => {
    const view = revisionView(stored(V3), runCurrentVersion(deal, V3))!;
    expect(view).toMatchObject({ n: 3, prevN: 2, note: "attic rent 9.50" });
    expect(view.rows.map((r) => [r.label, r.from, r.to, r.change, r.byValuer])).toEqual([
      ["Market rent · Attic", "9.92 €/m²", "9.50 €/m²", null, true],
      ["Market rent (avg.)", "9.60 €/m²", "9.53 €/m²", null, false],
      ["Building value", "€981,405", "€971,760", null, false],
      ["Under-rent deduction", "−€20,848", "−€18,840", null, false],
      ["Market value", "€1,210,000", "€1,200,000", "−0.8 %", false],
    ]);
  });

  it("skips undone versions: after undoing v3 and revising again, v4 is diffed against v2", () => {
    const h = revise(undoLast(V3), [UNDER], "Under-rent will close in 8 years", null, "live", 3456);
    const view = revisionView(stored(h), runCurrentVersion(deal, h))!;
    expect(view).toMatchObject({ n: 4, prevN: 2, title: "Revision 4 · the AI revised the valuation in 3.5 s" });
    expect(view.rows.map((r) => [r.label, r.from, r.to, r.change])).toEqual([
      ["Under-rent closing", "5 years", "8 years", null],
      ["Under-rent deduction", "−€20,848", "−€31,783", null],
      ["Market value", "€1,210,000", "€1,200,000", "−0.8 %"],
    ]);
    expect(view.prevValue).toBe(1_210_000);
  });
});

describe("figures outlined while the AI revises", () => {
  it("predicts the figure of the call whose note box sent the note; a general note has none", () => {
    expect(predictedFigures(draft, "cap_rate")).toEqual(["capRate"]);
    expect(predictedFigures(draft, "market_rent")).toEqual(["marketRent"]);
    expect(predictedFigures(draft, "under_rent")).toEqual(["underRentYears"]);
    expect(predictedFigures(draft, "easement-1")).toEqual(["easementImpact"]);
    expect(predictedFigures(draft, null)).toEqual([]);
    expect(predictedFigures(draft, "no-such-flag")).toEqual([]);
  });

  it("maps the AI's changes to the figures they set", () => {
    expect(changedFigures([CAP])).toEqual(["capRate"]);
    const rents: ParamChange[] = [
      ATTIC,
      { ...ATTIC, unitId: "u1" },
      { parameter: "marketRentAvg", from: 9.6, to: 9.4, reason: "", sourceKind: "valuer_judgement" },
    ];
    expect(changedFigures(rents)).toEqual(["marketRent"]);
    expect(changedFigures([UNDER, CAP])).toEqual(["underRentYears", "capRate"]);
  });

  it("outlines the changed figures and every figure that depends on them", () => {
    expect([...outlineSet(draft.registry, ["capRate"])].sort()).toEqual(
      ["buildingNetIncome", "buildingValue", "capRate", "landInterest", "marketValue", "pvFactor", "underRentDeduction"].sort(),
    );
    expect([...outlineSet(draft.registry, ["underRentYears"])].sort()).toEqual(
      ["marketValue", "underRentDeduction", "underRentYears"].sort(),
    );
    expect(outlineSet(draft.registry, []).size).toBe(0);
  });
});

describe("calls the valuer changed", () => {
  it("finds the notes of the active revisions that settled a call", () => {
    const out = runCurrentVersion(deal, V3);
    expect(valuerNotesOf("cap_rate", out, V3)).toEqual([REHEARSED_NOTE]);
    expect(valuerNotesOf("market_rent", out, V3)).toEqual(["attic rent 9.50"]);
    expect(valuerNotesOf("under_rent", out, V3)).toEqual([]);
    const undone = undoLast(V3);
    expect(valuerNotesOf("market_rent", runCurrentVersion(deal, undone), undone)).toEqual([]);
  });

  it("adds the AI draft's value to the titles of changed calls", () => {
    const out2 = runCurrentVersion(deal, V2);
    const s2 = stored(V2);
    expect(wasNotes(out2, flagReviewStatuses(s2, out2), runVersion(deal, V2, 1))).toEqual({ cap_rate: " (was 3.0 %)" });

    // A title that already ends in brackets gets the note after a middle dot.
    const out3 = runCurrentVersion(deal, V3);
    const s3 = stored(V3);
    expect(wasNotes(out3, flagReviewStatuses(s3, out3), runVersion(deal, V3, 1))).toEqual({
      cap_rate: " (was 3.0 %)",
      market_rent: " · was 9.60 €/m²",
    });
    expect(wasNotes(draft, flagReviewStatuses(stored(V1), draft), draft)).toEqual({});
  });
});

describe("approvalCalls", () => {
  it("gives every call its status: changed by the valuer with the note, accepted, opened or not opened", () => {
    const s = stored(V2, {
      flagStatus: { cap_rate: "open", market_rent: "open", under_rent: "accepted", "easement-1": "open" },
      openedFlags: ["cap_rate", "under_rent", "easement-1"],
    });
    const out = runCurrentVersion(deal, V2);
    const calls = approvalCalls(s, out, flagReviewStatuses(s, out), false);
    expect(calls.map((c) => [c.number, c.id, c.state, c.statusText, c.notes])).toEqual([
      [1, "cap_rate", "changed", "Changed by valuer · KV", [REHEARSED_NOTE]],
      [2, "market_rent", "not_opened", "Not opened", []],
      [3, "under_rent", "accepted", "Accepted · KV", []],
      [4, "easement-1", "opened", "Opened · not accepted", []],
    ]);
    expect(calls[0].title).toBe("Cap rate 3.4 % (was 3.0 %)");
    expect(signReady(calls, false)).toBe(false);
  });

  it("with Accept remaining, the open calls read as accepted at sign-off, and the valuer can sign", () => {
    const s = stored(V2, { openedFlags: ["cap_rate", "easement-1"] });
    const out = runCurrentVersion(deal, V2);
    const calls = approvalCalls(s, out, flagReviewStatuses(s, out), true);
    expect(calls.map((c) => c.statusText)).toEqual([
      "Changed by valuer · KV",
      "Accepted at sign-off without opening",
      "Accepted at sign-off without opening",
      "Accepted at sign-off",
    ]);
    expect(signReady(calls, true)).toBe(true);
  });

  it("lets the valuer sign without Accept remaining once every call is reviewed", () => {
    const s = stored(V2, {
      flagStatus: { cap_rate: "open", market_rent: "accepted", under_rent: "accepted", "easement-1": "accepted" },
    });
    const out = runCurrentVersion(deal, V2);
    expect(signReady(approvalCalls(s, out, flagReviewStatuses(s, out), false), false)).toBe(true);
  });
});
