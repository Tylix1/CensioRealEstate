/**
 * The PDF report (plan Task 18, spec §5.6): the pure report model and its PDF document.
 *
 * The deal is driven through the real demo store, as the screens drive it: a note revalues the deal (the rule-based
 * parser, as in Demo mode), the valuer opens or accepts calls, and Sign & send approves it.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { extractText } from "unpdf";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDocument } from "@/components/report/ReportDocument";
import { buildReport, REPORT_DISCLAIMER, type ReportModel } from "@/lib/report/buildReport";
import { isWinAnsi, toWinAnsi, toWinAnsiDeep } from "@/lib/report/winAnsi";
import { buildRevalueContext } from "@/lib/revalue/schema";
import { parseNote } from "@/lib/revalue/parser";
import { addRevision, applyChanges, currentVersion, undoLast } from "@/lib/revisions/history";

const DEAL_ID = "CEN-2026-0147";

/** The rehearsed note for check 1 (spec §5.3.6 and §6.2). */
const REHEARSED =
  "Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.";

const UNOPENED = ["market_rent", "under_rent", "easement-1"];

type Store = typeof import("@/lib/store/demoStore");

/** A fresh demo store holding the seeded deal (in review, v1). */
async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import("@/lib/store/demoStore");
}

afterEach(() => {
  vi.resetModules();
});

/** Sends `note` from a call's note box and adds the revision, as the review screen does in Demo mode. */
function revise(store: Store, note: string, flagId: string | null, createdAt: string): void {
  const st = store.useDemoStore.getState();
  const stored = st.deals[DEAL_ID];
  const out = store.currentPipeline(stored);
  const result = parseNote(note, buildRevalueContext(out, flagId));
  if (result.intent !== "change_parameters") throw new Error(`The note changed nothing: ${note}`);
  const params = applyChanges(currentVersion(stored.history).params, result.changes, out.rent.average);
  st.setHistory(
    DEAL_ID,
    addRevision(stored.history, {
      params,
      note,
      flagId,
      changes: result.changes,
      explanation: result.explanation,
      aiMode: result.mode,
      createdAt,
      durationMs: result.durationMs,
    }),
  );
}

/** The demo path: check 1 opened, the rehearsed note sent (v2), signed without opening the other calls. */
async function approvedV2(): Promise<{ store: Store; model: ReportModel }> {
  const store = await freshStore();
  const st = store.useDemoStore.getState();
  st.markOpened(DEAL_ID, "cap_rate");
  revise(store, REHEARSED, "cap_rate", "2026-11-06T10:15:00.000Z");
  signAt(() => st.approve(DEAL_ID, false));
  return { store, model: buildReport(store.useDemoStore.getState().deals[DEAL_ID]) };
}

/** Runs `sign` (Sign & send) with the clock at 10:20 UTC on the valuation date. */
function signAt(sign: () => void): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T10:20:00.000Z"));
  try {
    sign();
  } finally {
    vi.useRealTimers();
  }
}

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

describe("buildReport: a signed report after the valuer's revision", () => {
  it("reports v2's value and file name", async () => {
    const { model } = await approvedV2();
    expect(model.value).toBe(1210000);
    expect(model.valueText).toBe("€1,210,000");
    expect(model.version).toBe(2);
    expect(model.draft).toBe(false);
    expect(model.dealId).toBe(DEAL_ID);
    expect(model.fileName).toBe("Censio_Report_CEN-2026-0147_v2.pdf");
    expect(model.disclaimer).toBe("Prototype with sample data — not a valuation report.");
    expect(REPORT_DISCLAIMER).toBe(model.disclaimer);
  });

  it("puts address, client, valuation date, value and version on the cover", async () => {
    const { model } = await approvedV2();
    expect(model.cover).toMatchObject({
      address: "Musterstraße 12, 04109 Leipzig",
      client: "Demo Capital GmbH (buy-side)",
      valuationDate: "06 Nov 2026",
      valueText: "€1,210,000",
    });
    expect(model.cover.versionLabel).toMatch(/^v2 · /);
    expect(model.cover.signature).toBe("Signed by K. Vogel, senior valuer, on 06 Nov 2026, 10:20 UTC");
    expect(model.cover.valueDetail).toBe("2,142 €/m² · gross multiplier 18.6×");
  });

  it("gives each judgement call its status, with the valuer's note for the changed one", async () => {
    const { model } = await approvedV2();
    const statuses = Object.fromEntries(model.calls.map((c) => [c.id, c.status]));
    expect(statuses).toEqual({
      cap_rate: "changed by valuer",
      market_rent: "accepted at sign-off without opening",
      under_rent: "accepted at sign-off without opening",
      "easement-1": "accepted at sign-off without opening",
    });
    const capRate = model.calls.find((c) => c.id === "cap_rate")!;
    expect(capRate.title).toBe("Cap rate 3.4 %");
    expect(capRate.notes).toEqual([REHEARSED]);
    expect(capRate.statusDetail).toBe("K. Vogel changed it from 3.0 % to 3.4 % in v2");
    expect(model.calls.map((c) => c.n)).toEqual([1, 2, 3, 4]);
    // The market rent has no "what would change the AI's mind"; its support is shown instead.
    const rent = model.calls.find((c) => c.id === "market_rent")!;
    expect(rent.changeMind).toBeNull();
    expect(rent.support).toContain("Unit 4 was re-let in 2025");
  });

  it("lists the documents that changed nothing, such as the B-Plan, among the sources", async () => {
    const { model } = await approvedV2();
    const bPlan = model.sources.documents.find((d) => d.title.includes("B-Plan"));
    expect(bPlan).toMatchObject({ title: "Zoning plan (B-Plan)", effect: "no value effect", pages: 1 });
    expect(bPlan!.citations).toEqual([
      {
        what: "Zoning",
        page: 1,
        quote: "Allgemeines Wohngebiet (WA)",
        translation: "General residential area (WA)",
        verified: true,
      },
    ]);
    const landRegister = model.sources.documents.find((d) => d.title === "Land register (Grundbuch)")!;
    expect(landRegister.citations.map((c) => [c.what, c.page])).toEqual([
      ["Plot area", 1],
      ["Easement 1 (section II)", 4],
    ]);
    expect(landRegister.citations[1].translation).toContain("utility line right");
    expect(model.property.documents.find((d) => d.title === "Zoning plan (B-Plan)")?.effect).toBe("no value effect");
    expect(model.sources.data.map((s) => s.label)).toEqual(
      expect.arrayContaining(["Standard land value", "Cap rate range", "Comparable listings", "Cap rate"]),
    );
    expect(model.sources.data.find((s) => s.label === "Cap rate")?.source).toBe("Changed by valuer");
  });

  it("logs every version, then the sign-off", async () => {
    const { model } = await approvedV2();
    expect(model.reviewLog.map((r) => r.label)).toEqual(["v1 · AI draft", `v2 · KV · note: “${REHEARSED}”`]);
    expect(model.reviewLog.map((r) => r.valueText)).toEqual(["€1,300,000", "€1,210,000"]);
    expect(model.reviewLog[0].at).toBe("06 Nov 2026, 09:00 UTC");
    expect(model.reviewLog[1]).toMatchObject({ at: "06 Nov 2026, 10:15 UTC", undone: false, current: true });
    expect(model.reviewLog[1].changes).toEqual(["Cap rate from 3.0 % to 3.4 %"]);
    expect(model.signOff).toMatchObject({
      signer: "K. Vogel",
      version: 2,
      acceptedWithoutOpening: [
        "Market rent 9.60 €/m² (avg. of 8 units)",
        "Under-rent closes within 5 years",
        "Utility easement assumed value-neutral",
      ],
    });
  });

  it("splits the value over the units as the spec's v2 column", async () => {
    const { model } = await approvedV2();
    expect(model.units.rows.map((r) => r.valueText)).toEqual([
      "€127,900",
      "€139,100",
      "€152,200",
      "€161,300",
      "€133,500",
      "€147,400",
      "€153,800",
      "€194,800",
    ]);
    expect(model.units.rows[0]).toMatchObject({
      n: 1,
      name: "GF left",
      floor: "Ground",
      area: "62",
      rooms: "2",
      inPlacePerM2: "8.40",
      inPlacePerMonth: "520.80",
      marketPerM2: "9.25",
      marketPerMonth: "573.50",
      gap: "−9.2 %",
      leaseSince: "2009",
    });
    expect(model.units.total).toMatchObject({
      area: "565",
      inPlacePerM2: "8.92",
      inPlacePerMonth: "5,040.30",
      marketPerM2: "9.60",
      marketPerMonth: "5,424.00",
      gap: "−7.1 %",
      valueText: "€1,210,000",
    });
  });

  it("walks through the calculation of spec §5.3.5 with v2's figures", async () => {
    const { model } = await approvedV2();
    const amount = (key: string) => model.calculation.find((r) => r.key === key)?.amount;
    expect(amount("grossIncome")).toBe("€65,088.00");
    expect(amount("operatingCosts")).toBe("€12,373.76");
    expect(amount("netIncome")).toBe("€52,714.24");
    expect(amount("landValue")).toBe("€249,600.00");
    expect(amount("capRate")).toBe("3.4 %");
    expect(amount("landInterest")).toBe("€8,486.40");
    expect(amount("buildingNetIncome")).toBe("€44,227.84");
    expect(amount("remainingLife")).toBe("42 years");
    expect(amount("pvFactor")).toBe("22.1897");
    expect(amount("buildingValue")).toBe("€981,404.65");
    expect(amount("preliminaryValue")).toBe("€1,231,004.65");
    expect(amount("underRentDeduction")).toBe("−€20,848.12");
    expect(amount("marketValue")).toBe("€1,210,000");
    expect(model.calculation.find((r) => r.key === "capRate")?.source).toBe("Changed by valuer");
  });

  it("writes the delivery email", async () => {
    const { model } = await approvedV2();
    expect(model.email).not.toBeNull();
    expect(model.email!.from).toBe("Censio RE <reports@censio.example>");
    expect(model.email!.to).toBe("Demo Capital GmbH");
    expect(model.email!.subject).toBe("Your valuation report is ready — Musterstraße 12");
    expect(model.email!.date).toBe("06 Nov 2026, 10:20 UTC");
    expect(model.email!.body.join(" ")).toContain("€1,210,000");
  });

  it("summarises in plain English", async () => {
    const { model } = await approvedV2();
    const text = model.summary.join(" ");
    expect(text).toContain("€1,210,000");
    expect(text).toContain("3.4 %");
    expect(text).toContain("K. Vogel");
  });

  it("does not change the stored deal", async () => {
    const store = await freshStore();
    const st = store.useDemoStore.getState();
    revise(store, REHEARSED, "cap_rate", "2026-11-06T10:15:00.000Z");
    signAt(() => st.approve(DEAL_ID, true));
    const stored = store.useDemoStore.getState().deals[DEAL_ID];
    const before = JSON.stringify(stored);
    buildReport(stored);
    expect(JSON.stringify(stored)).toBe(before);
  });
});

describe("buildReport: call statuses and the review log", () => {
  it("reads 'accepted' for calls the valuer accepted", async () => {
    const store = await freshStore();
    const st = store.useDemoStore.getState();
    revise(store, REHEARSED, "cap_rate", "2026-11-06T10:15:00.000Z");
    for (const id of UNOPENED) {
      st.markOpened(DEAL_ID, id);
      st.setFlagStatus(DEAL_ID, id, "accepted");
    }
    signAt(() => st.approve(DEAL_ID, false));
    const model = buildReport(store.useDemoStore.getState().deals[DEAL_ID]);
    expect(model.calls.map((c) => c.status)).toEqual(["changed by valuer", "accepted", "accepted", "accepted"]);
    expect(model.signOff?.acceptedWithoutOpening).toEqual([]);
  });

  it("marks undone versions and reports the current one", async () => {
    const store = await freshStore();
    const st = store.useDemoStore.getState();
    revise(store, REHEARSED, "cap_rate", "2026-11-06T10:15:00.000Z");
    revise(store, "attic rent 9.50", "market_rent", "2026-11-06T10:16:00.000Z");
    st.setHistory(DEAL_ID, undoLast(store.useDemoStore.getState().deals[DEAL_ID].history));
    signAt(() => st.approve(DEAL_ID, true));
    const model = buildReport(store.useDemoStore.getState().deals[DEAL_ID]);
    expect(model.version).toBe(2);
    expect(model.value).toBe(1210000);
    expect(model.reviewLog.map((r) => r.label)).toEqual([
      "v1 · AI draft",
      `v2 · KV · note: “${REHEARSED}”`,
      "v3 · KV · note: “attic rent 9.50” (undone)",
    ]);
    expect(model.reviewLog.map((r) => r.valueText)).toEqual(["€1,300,000", "€1,210,000", "€1,200,000"]);
    expect(model.reviewLog[2].changes).toEqual(["Market rent of Attic from 9.92 €/m² to 9.50 €/m²"]);
    expect(model.reviewLog.map((r) => r.current)).toEqual([false, true, false]);
    // The undone revision's market rent is not the valuer's any more.
    expect(model.calls.find((c) => c.id === "market_rent")?.status).toBe("accepted at sign-off without opening");
  });
});

describe("buildReport: a draft before sign-off (the valuer's preview)", () => {
  it("is the AI draft, unsigned, with open calls and no email", async () => {
    const store = await freshStore();
    const model = buildReport(store.useDemoStore.getState().deals[DEAL_ID]);
    expect(model.draft).toBe(true);
    expect(model.value).toBe(1300000);
    expect(model.version).toBe(1);
    expect(model.fileName).toBe("Censio_Report_CEN-2026-0147_v1_draft.pdf");
    expect(model.cover.signature).toBe("Draft — not signed");
    expect(model.calls.map((c) => c.status)).toEqual(["open", "open", "open", "open"]);
    expect(model.signOff).toBeNull();
    expect(model.email).toBeNull();
    expect(model.reviewLog.map((r) => r.label)).toEqual(["v1 · AI draft"]);
  });
});

describe("toWinAnsi: text the PDF's built-in Helvetica can show", () => {
  it("keeps the euro sign, German umlauts and the typography Helvetica has", () => {
    const text = "€1,210,000 · Musterstraße 12 · Bäder, Türen, Wärmedämmung · ÄÖÜ — “x” „y“ … 565 m² × ±0 § 194";
    expect(toWinAnsi(text)).toBe(text);
    expect(isWinAnsi(text)).toBe(true);
  });

  it("replaces characters outside WinAnsi", () => {
    expect(toWinAnsi("−€21,087")).toBe("–€21,087");
    expect(toWinAnsi("13 points → 42 years")).toBe("13 points -> 42 years");
    expect(toWinAnsi("≈ AI · ≤ 3 · ≥ 8")).toBe("~ AI · <= 3 · >= 8");
    expect(toWinAnsi("a\u202Fb\u2009c\u2011d")).toBe("a\u00A0b c-d");
    expect(toWinAnsi("Łódź 😀")).toBe("Lódz ?");
    expect(isWinAnsi("−")).toBe(false);
  });

  it("covers every text of the report model", async () => {
    const { model } = await approvedV2();
    const bad = allStrings(toWinAnsiDeep(model)).filter((s) => !isWinAnsi(s));
    expect(bad).toEqual([]);
  });
});

describe("ReportDocument: the PDF", () => {
  async function pdfText(model: ReportModel): Promise<string> {
    const buffer = await renderToBuffer(createElement(ReportDocument, { model }) as ReactElement<never>);
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    return text.replace(/\s+/g, " ");
  }

  it("carries the value, the review log, the sources and the disclaimer", async () => {
    const { model } = await approvedV2();
    const text = await pdfText(model);
    expect(text).toContain("€1,210,000");
    expect(text).toContain(REPORT_DISCLAIMER);
    expect(text).toContain("Musterstraße 12, 04109 Leipzig");
    expect(text).toContain("Beschränkte persönliche Dienstbarkeit (Leitungsrecht)");
    expect(text).toContain("v1 · AI draft");
    expect(text).toContain("v2 · KV · note:");
    expect(text).toContain("accepted at sign-off without opening");
    expect(text).toContain("changed by valuer");
    expect(text).toContain("no value effect");
    expect(text).toContain("–€20,848.12");
    expect(text).not.toContain("DRAFT");
  });

  it("marks a draft as not signed, with a watermark", async () => {
    const store = await freshStore();
    const text = await pdfText(buildReport(store.useDemoStore.getState().deals[DEAL_ID]));
    expect(text).toContain("€1,300,000");
    expect(text).toContain("Draft — not signed");
    expect(text).toContain("DRAFT");
  });
});
