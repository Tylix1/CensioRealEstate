import { describe, expect, it } from "vitest";
import {
  CONDOMINIUM_NOTE,
  editUnit,
  fieldLabel,
  fileKind,
  formatDuration,
  isCondominium,
  isUsableDraft,
  missingDocumentTypes,
  monthlyRent,
  newManualUnit,
  parseNumber,
  passagesOf,
  planAdditions,
  reconcileUnits,
  restoreUnit,
  runLogRows,
  summaryDetail,
  unitName,
  unitProblems,
  unitsFromTenantList,
  unitsSummary,
  unsureFields,
} from "@/components/client/model";
import type { DealDocument, Unit } from "@/lib/deal/types";
import { buildRunLog, runPipeline } from "@/lib/pipeline/run";
import { seededDeal } from "@/lib/data/seed";
import type { DemoDraft } from "@/lib/store/demoStore";
import { LAND_REGISTER_RESULT, TEST_SKELETON, TENANT_LIST_RESULT, sampleInputs } from "./fixtures/sampleExtractions";

function sampleDraft(overrides: Partial<DemoDraft> = {}): DemoDraft {
  const inputs = sampleInputs();
  return {
    skeleton: { ...TEST_SKELETON, id: "draft" },
    documents: inputs.map((i) => i.doc),
    extractions: Object.fromEntries(inputs.map((i) => [i.doc.id, { result: i.result, verified: i.verified }])),
    units: null,
    step: 3,
    photos: [
      { id: "p-facade", fileName: "foto_fassade.jpg", unitId: null },
      { id: "p-terrace", fileName: "foto_dachterrasse.jpg", unitId: "u8" },
    ],
    ...overrides,
  };
}

function unit(units: Unit[], id: string): Unit {
  const u = units.find((x) => x.id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
}

describe("units from the tenant list", () => {
  it("creates the 8 sample units with their photos", () => {
    const units = unitsFromTenantList(sampleDraft());
    expect(units.map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
    expect(unit(units, "u8").photoIds).toEqual(["p-terrace"]);
    expect(unit(units, "u1").photoIds).toEqual([]);
    expect(unitName(unit(units, "u1"))).toBe("Unit 1, GF left");
    expect(monthlyRent(unit(units, "u1"))).toBeCloseTo(520.8, 6);
  });

  it("keeps the client's units on a later visit, and recreates them when the tenant list is replaced", () => {
    const draft = sampleDraft();
    const first = reconcileUnits(draft);
    expect(first.recreated).toBe(false);
    const edited = first.units.map((u) => (u.id === "u1" ? editUnit(u, { field: "areaM2", value: 70 }, u) : u));
    const manual = newManualUnit(edited);
    const withManual = [...edited, manual];

    const again = reconcileUnits({ ...draft, units: withManual });
    expect(again).toEqual({ units: withManual, recreated: false });

    // The tenant list is removed: its units go, the unit added by hand stays.
    const without = {
      ...draft,
      units: withManual,
      documents: draft.documents.filter((d) => d.id !== "doc-tenant-list"),
    };
    const removed = reconcileUnits(without);
    expect(removed.recreated).toBe(true);
    expect(removed.units.map((u) => u.id)).toEqual(["m1"]);

    // A tenant list added later creates its units in front of the ones added by hand.
    const back = reconcileUnits({ ...draft, units: removed.units });
    expect(back.recreated).toBe(true);
    expect(back.units.map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "m1"]);
    expect(unit(back.units, "u1").areaM2).toBe(62);
  });
});

describe("client edits", () => {
  const original = unitsFromTenantList(sampleDraft());
  const u1 = unit(original, "u1");

  it("keeps the monthly rent when the area changes and marks only the area", () => {
    const edited = editUnit(u1, { field: "areaM2", value: 70 }, u1);
    expect(edited.areaM2).toBe(70);
    expect(monthlyRent(edited)).toBeCloseTo(520.8, 6);
    expect(edited.clientEdited).toEqual(["areaM2"]);
    // Back to the tenant list's value: no longer a client edit.
    expect(editUnit(edited, { field: "areaM2", value: 62 }, u1).clientEdited).toEqual([]);
  });

  it("marks rent, lease, features and floor edits in the order of EditableUnitField", () => {
    let u = editUnit(u1, { field: "rent", value: 600 }, u1);
    expect(u.inPlaceRentPerM2).toBeCloseTo(600 / 62, 9);
    u = editUnit(u, { field: "features", value: ["courtyard", "balcony"] }, u1);
    expect(u.features).toEqual(["balcony", "courtyard"]);
    u = editUnit(u, { field: "floor", value: "1F" }, u1);
    u = editUnit(u, { field: "leaseSinceYear", value: 2015 }, u1);
    u = editUnit(u, { field: "rooms", value: 2.5 }, u1);
    expect(u.clientEdited).toEqual(["rooms", "inPlaceRentPerM2", "leaseSinceYear", "features", "floor"]);
    expect(restoreUnit(u, u1)).toEqual(u1);
  });

  it("makes a unit vacant and lets it again at the tenant list's rent", () => {
    const vacant = editUnit(u1, { field: "vacant", value: true }, u1);
    expect(vacant).toMatchObject({ inPlaceRentPerM2: null, leaseSinceYear: null });
    expect(vacant.clientEdited).toEqual(["inPlaceRentPerM2", "leaseSinceYear"]);
    const let_ = editUnit(vacant, { field: "vacant", value: false }, u1);
    expect(let_).toEqual(u1);
  });

  it("adds vacant units by hand as m1, m2 … and asks for their area and rooms", () => {
    const m1 = newManualUnit(original);
    expect(m1).toMatchObject({ id: "m1", origin: "manual", inPlaceRentPerM2: null, clientEdited: [], source: null });
    expect(newManualUnit([...original, m1]).id).toBe("m2");
    expect(unitName(m1)).toBe("Unit m1");
    expect(unitProblems([...original, m1])).toEqual([
      "Enter the area of Unit m1.",
      "Enter the number of rooms of Unit m1.",
    ]);
    expect(unitProblems([])).toEqual(["Add at least one unit to continue."]);

    // A unit added by hand stays vacant until a rent is entered, and is never "changed by client" field by field.
    let m = editUnit(m1, { field: "areaM2", value: 55 });
    m = editUnit(m, { field: "vacant", value: false });
    expect(m.inPlaceRentPerM2).toBeNull();
    m = editUnit(m, { field: "rent", value: 550 });
    expect(m.inPlaceRentPerM2).toBeCloseTo(10, 9);
    expect(m.clientEdited).toEqual([]);
    expect(unitProblems([m])).toEqual(["Enter the number of rooms of Unit m1."]);
  });

  it("summarises the units for the review step", () => {
    const m1 = { ...newManualUnit(original), areaM2: 55, rooms: 2 };
    const units = [editUnit(u1, { field: "areaM2", value: 70 }, u1), ...original.slice(1), m1];
    expect(unitsSummary(units)).toEqual({
      count: 9,
      areaM2: 628,
      rentPerMonth: expect.closeTo(5040.3, 6),
      vacant: 1,
      edited: 1,
      manual: 1,
    });
  });
});

describe("documents", () => {
  const done = (type: DealDocument["type"]): Pick<DealDocument, "status" | "type"> => ({ status: "done", type });

  it("lists the expected document types nobody uploaded; a Wohnungsgrundbuch counts as the land register", () => {
    expect(missingDocumentTypes([])).toEqual([
      "tenant_list",
      "land_register",
      "energy_certificate",
      "refurbishment_sheet",
      "zoning_plan",
    ]);
    expect(
      missingDocumentTypes([
        done("tenant_list"),
        done("condo_land_register"),
        { status: "failed", type: "unknown" },
        { status: "reading", type: "unknown" },
      ]),
    ).toEqual(["energy_certificate", "refurbishment_sheet", "zoning_plan"]);
  });

  it("recognises a Wohnungsgrundbuch", () => {
    expect(CONDOMINIUM_NOTE).toBe("This looks like a condominium — please add the Teilungserklärung.");
    expect(isCondominium(LAND_REGISTER_RESULT)).toBe(false);
    expect(isCondominium({ ...LAND_REGISTER_RESULT, documentType: "condo_land_register" })).toBe(true);
    expect(
      isCondominium({ ...LAND_REGISTER_RESULT, landRegister: { ...LAND_REGISTER_RESULT.landRegister!, kind: "Wohnungsgrundbuch" } }),
    ).toBe(true);
  });

  it("opens a land register on its plot area and lists the easement on page 4", () => {
    const passages = passagesOf(LAND_REGISTER_RESULT);
    expect(passages[0]).toMatchObject({ label: "Plot area · 480 m²", page: 1, quote: "480 m²", verified: true });
    expect(passages.find((p) => p.label.startsWith("Easement"))).toMatchObject({ page: 4 });
    expect(passagesOf(TENANT_LIST_RESULT)[0].label).toBe("Rent total · €5,040.30 per month");
  });

  it("drops the type from the AI's summary when the row already names it", () => {
    expect(summaryDetail("Land register · plot 480 m² · 1 easement in section II", "land_register")).toBe(
      "plot 480 m² · 1 easement in section II",
    );
    expect(summaryDetail("Kaufvertrag über eine Wohnung", "unknown")).toBe("Kaufvertrag über eine Wohnung");
    expect(summaryDetail("Grundbuch · plot 480 m²", "land_register")).toBe("Grundbuch · plot 480 m²");
  });

  it("names the fields the AI was unsure of", () => {
    expect(unsureFields(LAND_REGISTER_RESULT, {})).toEqual([]);
    expect(unsureFields(LAND_REGISTER_RESULT, { "landRegister.plotM2": false })).toEqual([
      { path: "landRegister.plotM2", label: "plot area", page: 1, quote: "480 m²" },
    ]);
    expect(fieldLabel("tenantList.units.2.rentPerMonth")).toBe("unit 3 rent");
    expect(fieldLabel("refurbishmentSheet.measures.1.year")).toBe("measure 2 year");
  });
});

describe("dropped files", () => {
  const pdf = (name: string, size = 1000) => ({ name, size, type: "application/pdf" });
  const jpg = (name: string) => ({ name, size: 1000, type: "image/jpeg" });

  it("tells PDFs, photos and other files apart", () => {
    expect(fileKind(pdf("a.pdf"))).toBe("pdf");
    expect(fileKind({ name: "SCAN.PDF", type: "" })).toBe("pdf");
    expect(fileKind(jpg("a.jpg"))).toBe("photo");
    expect(fileKind({ name: "a.png", type: "" })).toBe("photo");
    expect(fileKind({ name: "a.heic", type: "image/heic" })).toBe("other");
    expect(fileKind({ name: "notes.txt", type: "text/plain" })).toBe("other");
  });

  it("takes at most 8 documents and 8 photos, skips other files and names twice", () => {
    const current = {
      documents: [
        { id: "d1", fileName: "a.pdf", status: "done" as const },
        { id: "d2", fileName: "b.pdf", status: "failed" as const },
      ],
      photos: [{ fileName: "x.jpg" }],
    };
    const files = [
      pdf("a.pdf"),
      pdf("b.pdf"),
      { name: "notes.txt", size: 5, type: "text/plain" },
      ...Array.from({ length: 8 }, (_, i) => pdf(`n${i + 1}.pdf`)),
      jpg("x.jpg"),
      jpg("y.jpg"),
    ];
    const plan = planAdditions(current, files);
    // b.pdf replaces its failed row; with a.pdf that leaves room for 6 new documents.
    expect(plan.replaceDocumentIds).toEqual(["d2"]);
    expect(plan.pdfs.map((f) => f.name)).toEqual(["b.pdf", "n1.pdf", "n2.pdf", "n3.pdf", "n4.pdf", "n5.pdf", "n6.pdf"]);
    expect(plan.photos.map((f) => f.name)).toEqual(["y.jpg"]);
    expect(plan.notice).toBe(
      "Skipped notes.txt: only PDF documents and photos (JPEG, PNG or WebP) can be added. " +
        "Already added: a.pdf, x.jpg. " +
        "Skipped n7.pdf, n8.pdf: a request takes up to 8 documents. Remove one to add another.",
    );
    expect(planAdditions({ documents: [], photos: [] }, [pdf("a.pdf")]).notice).toBeNull();
  });
});

describe("formatting and parsing", () => {
  it("formats measured durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0)).toBe("<1 ms");
    expect(formatDuration(12.4)).toBe("12 ms");
    expect(formatDuration(1430)).toBe("1.4 s");
    expect(formatDuration(65_000)).toBe("1 min 5 s");
  });

  it("reads numbers with a decimal point or a German decimal comma", () => {
    expect(parseNumber(" 62 ")).toBe(62);
    expect(parseNumber("62,5")).toBe(62.5);
    expect(parseNumber("520.80")).toBe(520.8);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("1.234,5")).toBeNaN();
    expect(parseNumber("-3")).toBeNaN();
    expect(parseNumber("abc")).toBeNaN();
  });

  it("accepts only drafts the wizard can work with", () => {
    expect(isUsableDraft(sampleDraft())).toBe(true);
    expect(isUsableDraft(null)).toBe(false);
    expect(isUsableDraft({ ...sampleDraft(), documents: {} })).toBe(false);
    expect(isUsableDraft({ ...sampleDraft(), step: 7 })).toBe(false);
  });
});

describe("the AI-at-work log", () => {
  it("lists the documents first, then the pipeline, and hides the unsigned value from the client", () => {
    const deal = seededDeal();
    const rows = runLogRows(deal, { hideDraftValue: true });
    expect(rows.map((r) => r.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(rows[0]).toMatchObject({ label: "Read tenant list", kind: "Demo mode", result: "8 units, 565 m², €60,484/yr" });
    expect(rows[1].result).toBe("Plot 480 m², 1 easement; land charge ignored");
    expect(rows[9].result).toBe("Value computed; 6 of 6 cross-checks passed; 4 judgement calls flagged");
    expect(runLogRows(deal)[9].result).toMatch(/^€1,300,000; /);
  });

  it("shows a document that could not be read with the route's message", () => {
    const deal = seededDeal();
    const failed: DealDocument = {
      ...deal.documents[0],
      id: "doc-x",
      fileName: "Kaufvertrag.pdf",
      type: "unknown",
      status: "failed",
      extractionSource: null,
      findings: [],
      error: "Live AI is needed to read this document.",
    };
    const withFailed = { ...deal, documents: [...deal.documents, failed] };
    const rows = runLogRows({ ...withFailed, runLog: buildRunLog(withFailed, runPipeline(withFailed)) });
    expect(rows[5]).toMatchObject({
      step: 6,
      label: "Read Kaufvertrag.pdf",
      kind: "Not read",
      result: "Live AI is needed to read this document.",
      failed: true,
    });
    expect(rows[6].step).toBe(7);
  });
});
