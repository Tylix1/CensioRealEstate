/**
 * The generated sample world (plan Task 9, spec §5.3.2 and §6.1): five German sample PDFs with a real text layer,
 * three placeholder photos, and one extraction fixture per PDF. Regenerate with `npm run generate:samples`.
 *
 * Fixtures marked "recorded-live" in the index (written later by `npm run record:extraction`) only have to cite
 * their pages correctly and reproduce the sample's facts and run-log results; "demo-fixture" ones must equal the
 * Task 5 hand-written results exactly.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractText } from "unpdf";
import { beforeAll, describe, expect, it } from "vitest";
import { citedFields, dealFromExtractions } from "@/lib/deal/fromExtraction";
import type { Deal } from "@/lib/deal/types";
import { ExtractionResultSchema, type ExtractionResult } from "@/lib/extraction/schemas";
import { EASEMENT_TEXT, SAMPLE_EXTRACTIONS, TEST_SKELETON, sampleDocument, sampleInputs } from "./fixtures/sampleExtractions";

const ROOT = process.cwd();
const SAMPLE_DIR = path.join(ROOT, "public", "sample");
const FIXTURE_DIR = path.join(ROOT, "fixtures", "extraction");

const PDF_PAGES: Record<string, number> = {
  "Grundbuch_Musterstrasse12.pdf": 4,
  "Mieterliste_Musterstrasse12.pdf": 2,
  "Energieausweis_Musterstrasse12.pdf": 1,
  "Sanierungsuebersicht_Musterstrasse12.pdf": 1,
  "B-Plan_Auszug_Musterstrasse12.pdf": 1,
};
const PHOTOS = ["foto_fassade.jpg", "foto_dachterrasse.jpg", "foto_wohnzimmer_dg.jpg"];

interface IndexEntry {
  sha256: string;
  source: "demo-fixture" | "recorded-live";
}

const INDEX_PATH = path.join(FIXTURE_DIR, "index.json");
const index: Record<string, IndexEntry> = existsSync(INDEX_PATH) ? JSON.parse(readFileSync(INDEX_PATH, "utf8")) : {};
const allDemoFixtures = Object.keys(PDF_PAGES).every((fileName) => index[fileName]?.source === "demo-fixture");

/** Collapses runs of whitespace to one space, so line breaks in the text layer do not matter (plan Task 9). */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function fixture(fileName: string): ExtractionResult {
  const entry = index[fileName];
  if (!entry) throw new Error(`${fileName} is missing from fixtures/extraction/index.json`);
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${entry.sha256}.json`), "utf8"));
}

/** File name → text of each page, as the extraction route reads it (unpdf, one string per page). */
const pageTexts: Record<string, string[]> = {};

beforeAll(async () => {
  for (const fileName of Object.keys(PDF_PAGES)) {
    const bytes = new Uint8Array(readFileSync(path.join(SAMPLE_DIR, fileName)));
    pageTexts[fileName] = (await extractText(bytes, { mergePages: false })).text;
  }
});

function page(fileName: string, n: number): string {
  return normalise(pageTexts[fileName][n - 1] ?? "");
}

/** Field path → whether the quote occurs on its stated page (the quote check of spec §6.1). */
function quoteCheck(fileName: string, result: ExtractionResult): Record<string, boolean> {
  return Object.fromEntries(
    citedFields(result).map(({ path: fieldPath, field }) => [
      fieldPath,
      page(fileName, field.page).includes(normalise(field.quote)),
    ]),
  );
}

/** The five fixtures as `dealFromExtractions` inputs, with the same documents as the Task 5 hand-written inputs. */
function fixtureInputs() {
  return SAMPLE_EXTRACTIONS.map((s) => {
    const result = fixture(s.fileName);
    return { doc: sampleDocument(s), result, verified: quoteCheck(s.fileName, result) };
  });
}

/** What the valuation reads from the documents (spec §5.3), without quotes, wording or confidence. */
function facts(deal: Deal) {
  const p = deal.property;
  return {
    documentTypes: deal.documents.map((d) => d.type),
    units: deal.units.map((u) => ({
      id: u.id,
      floor: u.floor,
      areaM2: u.areaM2,
      rooms: u.rooms,
      inPlaceRentPerM2: u.inPlaceRentPerM2,
      leaseSinceYear: u.leaseSinceYear,
      features: [...u.features].sort(),
    })),
    tenantListTotals: [p.tenantListTotalAreaM2, p.tenantListTotalRentPerMonth],
    plotM2: p.plotM2,
    easements: p.easements.length,
    landChargesCount: p.landChargesCount,
    energyCertificate: [p.builtYear, p.heatingYear, p.energyClass, p.energyDemandKwh, p.livingAreaM2FromEnergyCert],
    measures: p.refurbishments.map((m) => [m.category, m.extent, m.year]),
    modernisationPoints: p.modernisationPoints,
    residentialAllowed: p.zoning?.residentialAllowed,
  };
}

describe("sample PDFs", () => {
  it("have the planned page counts", () => {
    for (const [fileName, pages] of Object.entries(PDF_PAGES)) {
      expect(pageTexts[fileName], fileName).toHaveLength(pages);
    }
  });

  it("carry the MUSTER / SAMPLE watermark on every page", () => {
    for (const fileName of Object.keys(PDF_PAGES)) {
      pageTexts[fileName].forEach((_, i) => expect(page(fileName, i + 1), `${fileName} p. ${i + 1}`).toContain("MUSTER / SAMPLE"));
    }
  });

  it("print the tenant list with one row per unit and the total rows on page 2", () => {
    const p2 = page("Mieterliste_Musterstrasse12.pdf", 2);
    for (const row of [
      "WE 1 EG links 62,0 m² 2 Zi. 520,80 € seit 2009 Hofseite",
      "WE 2 EG rechts 68,0 m² 2,5 Zi. 591,60 € seit 2012 Straßenseite",
      "WE 3 1. OG links 71,0 m² 3 Zi. 653,20 € seit 2022 Bad saniert 2014",
      "WE 4 1. OG rechts 75,0 m² 3 Zi. 705,00 € seit 2025 Balkon",
      "WE 5 2. OG links 62,0 m² 2 Zi. 533,20 € seit 2011 Hofseite",
      "WE 6 2. OG rechts 68,0 m² 2,5 Zi. 598,40 € seit 2016 Balkon",
      "WE 7 3. OG links 71,0 m² 3 Zi. 646,10 € seit 2021 Bad saniert 2014",
      "WE 8 DG 88,0 m² 3,5 Zi. 792,00 € seit 2019 Dachterrasse, Dach gedämmt 2016",
    ]) {
      expect(p2).toContain(row);
    }
    expect(p2).toContain("Summe Nettokaltmiete / Monat 5.040,30 €");
    expect(p2).toContain("Wohnfläche gesamt 565,0 m²");
    expect(page("Mieterliste_Musterstrasse12.pdf", 1)).toContain("Musterstraße 12, 04109 Leipzig");
  });

  it("print the land register's inventory on page 1 and sections II and III on page 4", () => {
    const grundbuch = "Grundbuch_Musterstrasse12.pdf";
    // The inventory entry lfd. Nr. 1 of spec §5.3.1 and §5.3.2.
    for (const text of [
      "Bestandsverzeichnis",
      "Gemarkung Leipzig",
      "Flur 12",
      "Flurstück 123/4",
      "Gebäude- und Freifläche",
      "Musterstraße 12",
      "480 m²",
    ]) {
      expect(page(grundbuch, 1)).toContain(text);
    }
    expect(page(grundbuch, 4)).toContain("Abteilung II");
    expect(page(grundbuch, 4)).toContain(EASEMENT_TEXT);
    expect(page(grundbuch, 4)).toContain("Abteilung III");
    expect(page(grundbuch, 4)).toContain("Grundschuld");
  });

  it("print the energy certificate, refurbishment sheet and zoning plan strings", () => {
    const energy = page("Energieausweis_Musterstrasse12.pdf", 1);
    for (const text of [
      "Baujahr Gebäude 1912",
      "Baujahr Wärmeerzeuger 2019",
      "Erdgas",
      "Gas-Brennwertkessel",
      "Effizienzklasse D",
      "128 kWh/(m²·a)",
      "Gebäudenutzfläche (Wohnfläche) 565 m²",
      "Musterstraße 12, 04109 Leipzig",
    ]) {
      expect(energy).toContain(text);
    }

    const refurb = page("Sanierungsuebersicht_Musterstrasse12.pdf", 1);
    for (const measure of [
      "Dacherneuerung inkl. Wärmedämmung 2016",
      "Erneuerung der Fenster 2014",
      "Erneuerung der Leitungssysteme (Strom, Wasser, Abwasser) 2014",
      "Einbau Gas-Brennwertkessel 2019",
      "Modernisierung der Bäder 2014",
      "Innenausbau teilweise (Böden, Türen) 2014",
    ]) {
      expect(refurb).toContain(measure);
    }

    const zoning = page("B-Plan_Auszug_Musterstrasse12.pdf", 1);
    expect(zoning).toContain("Allgemeines Wohngebiet (WA)");
    expect(zoning).toContain("Wohnnutzung zulässig");
  });
});

describe("extraction fixtures", () => {
  it("are indexed by the sha256 of the committed PDFs", () => {
    for (const fileName of Object.keys(PDF_PAGES)) {
      const entry = index[fileName];
      expect(entry, fileName).toBeDefined();
      const sha256 = createHash("sha256").update(readFileSync(path.join(SAMPLE_DIR, fileName))).digest("hex");
      expect(entry.sha256, fileName).toBe(sha256);
      expect(["demo-fixture", "recorded-live"]).toContain(entry.source);
      expect(existsSync(path.join(FIXTURE_DIR, `${sha256}.json`)), fileName).toBe(true);
    }
  });

  it("are valid extraction results of each document's type", () => {
    for (const s of SAMPLE_EXTRACTIONS) {
      const parsed = ExtractionResultSchema.safeParse(fixture(s.fileName));
      expect(parsed.success, s.fileName).toBe(true);
      expect(parsed.data?.documentType, s.fileName).toBe(s.result.documentType);
    }
  });

  it("quote text that occurs on the stated page", () => {
    for (const fileName of Object.keys(PDF_PAGES)) {
      const result = fixture(fileName);
      for (const { path: fieldPath, field } of citedFields(result)) {
        expect(field.page, `${fileName} ${fieldPath}`).toBeGreaterThanOrEqual(1);
        expect(field.page, `${fileName} ${fieldPath}`).toBeLessThanOrEqual(PDF_PAGES[fileName]);
      }
      const unverified = Object.entries(quoteCheck(fileName, result)).filter(([, found]) => !found);
      expect(unverified, fileName).toEqual([]);
    }
  });

  it("reproduce the sample deal's facts and run-log results without uncertain fields", () => {
    const deal = dealFromExtractions(TEST_SKELETON, fixtureInputs());
    expect(facts(deal)).toEqual(facts(dealFromExtractions(TEST_SKELETON, sampleInputs())));
    expect(deal.documents.map((d) => d.uncertainFields)).toEqual([[], [], [], [], []]);
    // The results of run-log steps 1–5 (spec §5.3.4), which also pin wording the facts above leave out (energy carrier).
    expect(deal.documents.map((d) => d.findings)).toEqual([
      ["8 units, 565 m², €60,484/yr"],
      ["Plot 480 m², 1 easement; land charge ignored"],
      ["Gas, 2019, class D, 565 m²"],
      ["6 measures 2014–2019, 13 points"],
      ["Residential, no value effect"],
    ]);
  });

  it.runIf(allDemoFixtures)("equal the Task 5 hand-written results, so dealFromExtractions gives the same deal", () => {
    for (const s of SAMPLE_EXTRACTIONS) {
      expect(fixture(s.fileName), s.fileName).toEqual(s.result);
    }
    expect(dealFromExtractions(TEST_SKELETON, fixtureInputs())).toEqual(
      dealFromExtractions(TEST_SKELETON, sampleInputs()),
    );
  });
});

describe("sample photos", () => {
  it("are three JPEG images", () => {
    for (const name of PHOTOS) {
      const bytes = readFileSync(path.join(SAMPLE_DIR, name));
      expect([...bytes.subarray(0, 3)], name).toEqual([0xff, 0xd8, 0xff]);
      expect([...bytes.subarray(-2)], name).toEqual([0xff, 0xd9]);
      expect(bytes.length, name).toBeGreaterThan(10_000);
    }
  });
});
