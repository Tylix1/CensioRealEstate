/**
 * Generates the sample world of the prototype (spec §5.3.2, plan Task 9). Run with `npm run generate:samples`.
 *
 * - public/sample/*.pdf: the five German sample documents, with a real text layer (pdf-lib with standard Helvetica,
 *   whose WinAnsi encoding covers ä, ö, ü, ß, €, ² and ·) and a diagonal "MUSTER / SAMPLE" watermark on every page.
 * - public/sample/foto_*.jpg: three placeholder illustrations labelled "SAMPLE". They are drawn and JPEG-encoded in
 *   this file, so the script needs no image library.
 * - fixtures/extraction/<sha256>.json: the ExtractionResult of each PDF, served by the extraction route when Live AI
 *   is off; fixtures/extraction/index.json maps each file name to `{ sha256, source }`.
 *
 * Every cited value and its quote come from the same constant, and every quote is drawn as one text run. Before
 * writing anything, the script reads the PDFs back with unpdf and stops if a quote is not inside one text item of
 * its page. The output is deterministic, so a fixture's sha256 key only changes when its PDF does. A fixture that
 * `npm run record:extraction` recorded live for an unchanged PDF is kept.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, PageSizes, StandardFonts, degrees, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { extractTextItems } from "unpdf";
import { citedFields } from "@/lib/deal/fromExtraction";
import type { Feature, FloorCode, MeasureCategory } from "@/lib/deal/types";
import { ExtractionResultSchema, type ExtractionResult } from "@/lib/extraction/schemas";
import { eur, round2 } from "@/lib/format";

const ROOT = process.cwd();
const SAMPLE_DIR = path.join(ROOT, "public", "sample");
const FIXTURE_DIR = path.join(ROOT, "fixtures", "extraction");

const WATERMARK = "MUSTER / SAMPLE";
const ADDRESS = "Musterstraße 12, 04109 Leipzig";
const STREET = "Musterstraße 12";
const MANAGER = "Hausverwaltung Muster GmbH";
/** Fixed document dates keep the PDF bytes, and with them the fixtures' sha256 keys, stable across runs. */
const DOCUMENT_DATE = new Date("2026-11-06T09:00:00Z");

interface SamplePdf {
  fileName: string;
  pages: number;
  bytes: Uint8Array;
  result: ExtractionResult;
}

/** A cited value as the extraction schema holds it. The sample documents are unambiguous, so confidence is high. */
function cite<T>(value: T, page: number, quote: string) {
  return { value, page, quote, confidence: "high" as const };
}

const NO_SECTIONS = { tenantList: null, landRegister: null, energyCertificate: null, refurbishmentSheet: null, zoningPlan: null };

/** German number format: `5.040,30`, `62,0`, `480`. */
function de(n: number, decimals: number): string {
  const [whole, fraction] = n.toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${grouped},${fraction}` : grouped;
}

// ---------------------------------------------------------------------------------------------------------------
// PDF drawing
// ---------------------------------------------------------------------------------------------------------------

const [PAGE_WIDTH, PAGE_HEIGHT] = PageSizes.A4;
const LEFT = 56;
const RIGHT = PAGE_WIDTH - 56;
const CONTENT_WIDTH = RIGHT - LEFT;
const PAD = 4;

const INK = rgb(0.063, 0.094, 0.157);
const INK_2 = rgb(0.278, 0.329, 0.404);
const MUTED = rgb(0.357, 0.396, 0.463);
const RULE = rgb(0.816, 0.835, 0.867);
const BAND = rgb(0.949, 0.957, 0.969);
const WHITE = rgb(1, 1, 1);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

type Align = "left" | "right" | "center";

interface TextStyle {
  size?: number;
  bold?: boolean;
  color?: Color;
  align?: Align;
  /** The run must fit this width; a layout change that breaks this fails loudly instead of overflowing. */
  maxWidth?: number;
}

interface Column {
  x: number;
  width: number;
  align?: Align;
}

/** One A4 page. All text goes through `text`, which draws exactly one text run (one pdf.js text item). */
class Sheet {
  constructor(
    readonly page: PDFPage,
    private readonly fonts: Fonts,
  ) {}

  text(text: string, x: number, y: number, style: TextStyle = {}): void {
    const font = style.bold ? this.fonts.bold : this.fonts.regular;
    const size = style.size ?? 9;
    const width = font.widthOfTextAtSize(text, size);
    if (style.maxWidth !== undefined && width > style.maxWidth) {
      throw new Error(`"${text}" is ${width.toFixed(1)} pt wide; it must fit ${style.maxWidth.toFixed(1)} pt`);
    }
    const dx = style.align === "right" ? -width : style.align === "center" ? -width / 2 : 0;
    this.page.drawText(text, { x: x + dx, y, size, font, color: style.color ?? INK });
  }

  /** Word-wrapped prose (never quoted by a fixture). Returns the baseline below the last line. */
  paragraph(text: string, x: number, y: number, width: number, style: TextStyle & { leading?: number } = {}): number {
    const font = style.bold ? this.fonts.bold : this.fonts.regular;
    const size = style.size ?? 9;
    const leading = style.leading ?? size * 1.4;
    let line = "";
    for (const word of text.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        this.text(line, x, y, style);
        y -= leading;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) this.text(line, x, y, style);
    return y - leading;
  }

  /** One table row: each non-empty cell is one text run, padded inside its column. */
  cells(columns: Column[], values: string[], y: number, style: TextStyle = {}): void {
    values.forEach((value, i) => {
      if (!value) return;
      const { x, width, align } = columns[i];
      const at = align === "right" ? x + width - PAD : align === "center" ? x + width / 2 : x + PAD;
      this.text(value, at, y, { ...style, align, maxWidth: width - 2 * PAD });
    });
  }

  box(x: number, y: number, width: number, height: number, style: { fill?: Color; stroke?: Color; dash?: number[] }): void {
    this.page.drawRectangle({
      x,
      y,
      width,
      height,
      ...(style.fill ? { color: style.fill } : {}),
      ...(style.stroke ? { borderColor: style.stroke, borderWidth: 0.8, borderDashArray: style.dash } : {}),
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, style: { color?: Color; width?: number; dash?: number[] } = {}): void {
    this.page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: style.width ?? 0.6,
      color: style.color ?? RULE,
      dashArray: style.dash,
    });
  }

  /** A grey header band with bold column titles; `lines` holds one row of titles per header line. */
  tableHeader(columns: Column[], lines: string[][], top: number): number {
    const height = 10 + 9 * lines.length;
    this.box(LEFT, top - height, CONTENT_WIDTH, height, { fill: BAND });
    lines.forEach((titles, i) => this.cells(columns, titles, top - 13 - 9 * i, { bold: true, size: 7.5, color: INK_2 }));
    return top - height;
  }
}

class PdfBuilder {
  private constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
  ) {}

  static async create(title: string): Promise<PdfBuilder> {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.setTitle(`${title} (${WATERMARK})`);
    doc.setAuthor("Censio demo, sample data");
    doc.setCreator("scripts/generate-samples.ts");
    doc.setProducer("pdf-lib");
    doc.setLanguage("de-DE");
    doc.setCreationDate(DOCUMENT_DATE);
    doc.setModificationDate(DOCUMENT_DATE);
    const fonts = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
    return new PdfBuilder(doc, fonts);
  }

  page(): Sheet {
    return new Sheet(this.doc.addPage(PageSizes.A4), this.fonts);
  }

  /** Adds the footer and the diagonal watermark to every page, then serialises the document. */
  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      const sheet = new Sheet(page, this.fonts);
      sheet.line(LEFT, 44, RIGHT, 44);
      sheet.text("Musterdokument mit fiktiven Daten für die Censio-Demo", LEFT, 32, { size: 7.5, color: MUTED });
      sheet.text(`Seite ${i + 1} von ${pages.length}`, RIGHT, 32, { size: 7.5, color: MUTED, align: "right" });
      this.watermark(page);
    });
    return this.doc.save();
  }

  private watermark(page: PDFPage): void {
    const size = 66;
    const angle = (45 * Math.PI) / 180;
    const width = this.fonts.bold.widthOfTextAtSize(WATERMARK, size);
    const height = this.fonts.bold.heightAtSize(size, { descender: false });
    // pdf-lib rotates about the start of the baseline; place it so the text's centre is the page's centre.
    page.drawText(WATERMARK, {
      x: PAGE_WIDTH / 2 - (width / 2) * Math.cos(angle) + (height / 2) * Math.sin(angle),
      y: PAGE_HEIGHT / 2 - (width / 2) * Math.sin(angle) - (height / 2) * Math.cos(angle),
      size,
      font: this.fonts.bold,
      color: rgb(0.78, 0.12, 0.12),
      opacity: 0.16,
      rotate: degrees(45),
    });
  }
}

/** Sender line of the property manager's documents. */
function letterhead(sheet: Sheet, right: string): void {
  sheet.text(MANAGER, LEFT, 800, { bold: true, size: 9, color: INK_2 });
  sheet.text(right, RIGHT, 800, { size: 9, color: INK_2, align: "right" });
  sheet.line(LEFT, 790, RIGHT, 790);
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Mieterliste (tenant list), 2 pp.: p. 1 cover with the address, p. 2 one row per unit and the total rows
// ---------------------------------------------------------------------------------------------------------------

interface TenantRow {
  we: string;
  /** Position in the house as printed ("EG links"); it is the quote of both the unit label and its floor. */
  lage: string;
  label: string;
  floor: FloorCode;
  areaM2: number;
  rooms: number;
  rentPerMonth: number;
  sinceYear: number;
  note: string;
  features: Feature[];
}

/** The 8 units of spec §5.3.3. */
const TENANTS: TenantRow[] = [
  { we: "WE 1", lage: "EG links", label: "GF left", floor: "GF", areaM2: 62, rooms: 2, rentPerMonth: 520.8, sinceYear: 2009, note: "Hofseite", features: ["courtyard"] },
  { we: "WE 2", lage: "EG rechts", label: "GF right", floor: "GF", areaM2: 68, rooms: 2.5, rentPerMonth: 591.6, sinceYear: 2012, note: "Straßenseite", features: ["street"] },
  { we: "WE 3", lage: "1. OG links", label: "1F left", floor: "1F", areaM2: 71, rooms: 3, rentPerMonth: 653.2, sinceYear: 2022, note: "Bad saniert 2014", features: ["renovated_bath"] },
  { we: "WE 4", lage: "1. OG rechts", label: "1F right", floor: "1F", areaM2: 75, rooms: 3, rentPerMonth: 705, sinceYear: 2025, note: "Balkon", features: ["balcony"] },
  { we: "WE 5", lage: "2. OG links", label: "2F left", floor: "2F", areaM2: 62, rooms: 2, rentPerMonth: 533.2, sinceYear: 2011, note: "Hofseite", features: ["courtyard"] },
  { we: "WE 6", lage: "2. OG rechts", label: "2F right", floor: "2F", areaM2: 68, rooms: 2.5, rentPerMonth: 598.4, sinceYear: 2016, note: "Balkon", features: ["balcony"] },
  { we: "WE 7", lage: "3. OG links", label: "3F left", floor: "3F", areaM2: 71, rooms: 3, rentPerMonth: 646.1, sinceYear: 2021, note: "Bad saniert 2014", features: ["renovated_bath"] },
  { we: "WE 8", lage: "DG", label: "Attic", floor: "attic", areaM2: 88, rooms: 3.5, rentPerMonth: 792, sinceYear: 2019, note: "Dachterrasse, Dach gedämmt 2016", features: ["roof_terrace"] },
];

async function tenantList(): Promise<SamplePdf> {
  const pdf = await PdfBuilder.create("Mieterliste Musterstraße 12");
  const listDate = "30.09.2026";
  const rows = TENANTS.map((t) => ({
    ...t,
    areaText: `${de(t.areaM2, 1)} m²`,
    roomsText: `${de(t.rooms, Number.isInteger(t.rooms) ? 0 : 1)} Zi.`,
    rentText: `${de(t.rentPerMonth, 2)} €`,
    sinceText: `seit ${t.sinceYear}`,
  }));
  const totalArea = TENANTS.reduce((sum, t) => sum + t.areaM2, 0);
  const totalRent = round2(TENANTS.reduce((sum, t) => sum + t.rentPerMonth, 0));
  const totalAreaText = `Wohnfläche gesamt ${de(totalArea, 1)} m²`;
  const totalRentText = `Summe Nettokaltmiete / Monat ${de(totalRent, 2)} €`;

  const cover = pdf.page();
  letterhead(cover, `Stand ${listDate}`);
  cover.text("Mieterliste", LEFT, 700, { bold: true, size: 28 });
  cover.text(`Mehrfamilienhaus mit ${TENANTS.length} Wohneinheiten`, LEFT, 676, { size: 12, color: INK_2 });
  cover.box(LEFT, 470, CONTENT_WIDTH, 170, { stroke: RULE });
  const facts: [string, string, TextStyle][] = [
    ["Objektanschrift", ADDRESS, { bold: true, size: 14 }],
    ["Eigentümer", "Max Mustermann, Leipzig", { size: 10.5 }],
    ["Verwaltung", `${MANAGER}, Leipzig`, { size: 10.5 }],
    ["Stichtag", listDate, { size: 10.5 }],
  ];
  facts.forEach(([label, value, style], i) => {
    cover.text(label, LEFT + 16, 616 - 38 * i, { size: 8, color: MUTED });
    cover.text(value, LEFT + 16, 601 - 38 * i, style);
  });
  cover.text("Inhalt", LEFT, 430, { bold: true, size: 11 });
  cover.text("Seite 1   Deckblatt mit Objektangaben", LEFT, 412, { size: 9.5 });
  cover.text("Seite 2   Wohneinheiten WE 1 bis WE 8: Lage, Wohnfläche, Zimmer, Nettokaltmiete, Mietbeginn", LEFT, 397, { size: 9.5 });
  cover.text("Hinweise", LEFT, 360, { bold: true, size: 11 });
  [
    "Mieten sind Nettokaltmieten je Monat, ohne Vorauszahlungen für Betriebs- und Heizkosten.",
    "Wohnflächen nach Wohnflächenverordnung (WoFlV).",
    "Zum Stichtag sind alle Wohneinheiten vermietet; Gewerbeeinheiten gibt es nicht.",
  ].forEach((note, i) => cover.text(`• ${note}`, LEFT, 342 - 15 * i, { size: 9.5 }));
  cover.line(LEFT, 214, LEFT + 200, 214, { color: INK_2 });
  cover.text(`Leipzig, ${listDate} · ${MANAGER}`, LEFT, 200, { size: 9, color: INK_2 });

  const list = pdf.page();
  letterhead(list, `Stand ${listDate}`);
  list.text("Mieterliste – Wohneinheiten und Nettokaltmieten", LEFT, 748, { bold: true, size: 15 });
  list.text(`Alle Beträge in Euro je Monat, Stichtag ${listDate}`, LEFT, 731, { size: 9, color: INK_2 });
  const columns: Column[] = [
    { x: 56, width: 36 },
    { x: 92, width: 66 },
    { x: 158, width: 54, align: "right" },
    { x: 212, width: 40, align: "right" },
    { x: 252, width: 80, align: "right" },
    { x: 332, width: 52 },
    { x: 384, width: RIGHT - 384 },
  ];
  let y = list.tableHeader(
    columns,
    [
      ["WE", "Lage", "Wohnfläche", "Zimmer", "Nettokaltmiete", "Mietbeginn", "Bemerkung"],
      ["", "", "", "", "je Monat", "", ""],
    ],
    712,
  );
  for (const r of rows) {
    y -= 22;
    list.cells(columns, [r.we, r.lage, r.areaText, r.roomsText, r.rentText, r.sinceText, r.note], y + 7.5);
    list.line(LEFT, y, RIGHT, y);
  }
  list.line(LEFT, y - 1.5, RIGHT, y - 1.5, { color: INK, width: 0.9 });
  list.text(totalAreaText, RIGHT - PAD, y - 22, { bold: true, size: 10, align: "right" });
  list.text(totalRentText, RIGHT - PAD, y - 40, { bold: true, size: 10, align: "right" });
  list.paragraph(
    "Mietbeginn: Beginn des laufenden Mietverhältnisses. Bemerkung: Lage im Haus und Ausstattung laut Verwaltung.",
    LEFT,
    y - 80,
    CONTENT_WIDTH,
    { size: 8.5, color: INK_2 },
  );

  return {
    fileName: "Mieterliste_Musterstrasse12.pdf",
    pages: 2,
    bytes: await pdf.save(),
    result: {
      ...NO_SECTIONS,
      documentType: "tenant_list",
      summary: `Tenant list · ${TENANTS.length} units · ${totalArea} m² · ${eur(totalRent, { decimals: 2 })} net cold rent per month`,
      tenantList: {
        units: rows.map((r) => ({
          label: cite(r.label, 2, r.lage),
          floor: cite(r.floor, 2, r.lage),
          areaM2: cite(r.areaM2, 2, r.areaText),
          rooms: cite(r.rooms, 2, r.roomsText),
          rentPerMonth: cite(r.rentPerMonth, 2, r.rentText),
          leaseSinceYear: cite(r.sinceYear, 2, r.sinceText),
          features: r.features,
          vacant: false,
        })),
        totalAreaM2: cite(totalArea, 2, totalAreaText),
        totalRentPerMonth: cite(totalRent, 2, totalRentText),
        address: cite(ADDRESS, 1, ADDRESS),
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Grundbuch (land register), 4 pp.: p. 1 Bestandsverzeichnis, p. 2 its continuation, p. 3 Abteilung I,
//    p. 4 Abteilung II (the easement) and Abteilung III (one Grundschuld, financing)
// ---------------------------------------------------------------------------------------------------------------

const EASEMENT_TEXT =
  "Beschränkte persönliche Dienstbarkeit (Leitungsrecht) für die städtischen Versorgungsbetriebe; eingetragen am 14.03.1998.";

async function landRegister(): Promise<SamplePdf> {
  const pdf = await PdfBuilder.create("Grundbuch von Leipzig, Blatt 2468");
  const parcelLines = ["Gemarkung Leipzig", "Flur 12", "Flurstück 123/4"];
  const plotM2 = 480;
  const plotText = `${de(plotM2, 0)} m²`;

  const section = (sheet: Sheet, title: string, subtitle: string, top: number) => {
    sheet.text(title, LEFT, top, { bold: true, size: 15 });
    sheet.text(subtitle, LEFT, top - 16, { size: 8.5, color: INK_2 });
  };
  const newPage = (title: string, subtitle: string) => {
    const sheet = pdf.page();
    sheet.text("Grundbuch von Leipzig", LEFT, 800, { bold: true, size: 12 });
    sheet.text("Blatt 2468", RIGHT, 800, { bold: true, size: 12, align: "right" });
    sheet.text("Grundbuchamt · Ausdruck vom 02.11.2026", LEFT, 786, { size: 8, color: INK_2 });
    sheet.line(LEFT, 778, RIGHT, 778, { color: INK_2 });
    section(sheet, title, subtitle, 750);
    return sheet;
  };

  const inventory = newPage("Bestandsverzeichnis", "Verzeichnis der Grundstücke und der mit dem Eigentum verbundenen Rechte");
  const inventoryColumns: Column[] = [
    { x: 56, width: 46 },
    { x: 102, width: 68 },
    { x: 170, width: 130 },
    { x: 300, width: 160 },
    { x: 460, width: RIGHT - 460, align: "right" },
  ];
  let y = inventory.tableHeader(
    inventoryColumns,
    [["Lfd. Nr.", "Bisherige lfd. Nr.", "Gemarkung, Flur, Flurstück", "Wirtschaftsart und Lage", "Größe"]],
    722,
  );
  inventory.cells(inventoryColumns, ["1", "–", parcelLines[0], "Gebäude- und Freifläche", plotText], y - 16);
  inventory.cells(inventoryColumns, ["", "", parcelLines[1], STREET, ""], y - 30);
  inventory.cells(inventoryColumns, ["", "", parcelLines[2], "", ""], y - 44);
  y -= 54;
  inventory.line(LEFT, y, RIGHT, y, { color: INK_2 });
  inventory.text("Mit dem Eigentum verbundene Rechte: keine eingetragen.", LEFT, y - 24, { size: 9 });

  const continuation = newPage("Bestandsverzeichnis – Fortsetzung", "Bestand und Zuschreibungen, Abschreibungen");
  const twoColumns: Column[] = [
    { x: 56, width: 110 },
    { x: 166, width: RIGHT - 166 },
  ];
  y = continuation.tableHeader(twoColumns, [["Zur lfd. Nr. der Grundstücke", "Bestand und Zuschreibungen"]], 722);
  continuation.cells(twoColumns, ["1", "Bei Anlegung dieses Blattes aus Blatt 1357 übertragen am 12.05.1999."], y - 16);
  y = continuation.tableHeader(twoColumns, [["Zur lfd. Nr. der Grundstücke", "Abschreibungen"]], y - 40);
  continuation.cells(twoColumns, ["–", "keine"], y - 16);

  const owners = newPage("Abteilung I – Eigentümer", "Eigentümer und Grundlage der Eintragung");
  const ownerColumns: Column[] = [
    { x: 56, width: 46 },
    { x: 102, width: 190 },
    { x: 292, width: 76 },
    { x: 368, width: RIGHT - 368 },
  ];
  y = owners.tableHeader(ownerColumns, [["Lfd. Nr.", "Eigentümer", "Lfd. Nr. im BV", "Grundlage der Eintragung"]], 722);
  owners.cells(ownerColumns, ["1", "Mustermann, Max,", "1", "Auflassung vom 03.02.2004,"], y - 16);
  owners.cells(ownerColumns, ["", "geb. 01.01.1960, Leipzig", "", "eingetragen am 15.03.2004."], y - 30);

  const charges = newPage("Abteilung II – Lasten und Beschränkungen", "Belastungen des Grundstücks außer Grundpfandrechten");
  const entry = (top: number, heading: string, lines: string[]) => {
    charges.box(LEFT, top - 20, CONTENT_WIDTH, 20, { fill: BAND });
    charges.text(heading, LEFT + PAD, top - 13, { bold: true, size: 8, color: INK_2 });
    lines.forEach((line, i) => charges.text(line, LEFT + PAD, top - 36 - 13 * i, { size: 8.5, maxWidth: CONTENT_WIDTH - 2 * PAD }));
    const bottom = top - 36 - 13 * lines.length;
    charges.text("Veränderungen: keine · Löschungen: keine", LEFT + PAD, bottom - 4, { size: 8, color: INK_2 });
    charges.line(LEFT, bottom - 14, RIGHT, bottom - 14);
  };
  entry(722, "Lfd. Nr. 1 · betroffenes Grundstück: lfd. Nr. 1 des Bestandsverzeichnisses", [EASEMENT_TEXT]);
  section(charges, "Abteilung III – Hypotheken, Grundschulden, Rentenschulden", "Grundpfandrechte", 620);
  entry(592, "Lfd. Nr. 1 · betroffenes Grundstück: lfd. Nr. 1 · Betrag 450.000,00 €", [
    "Grundschuld ohne Brief zu 450.000,00 € für die Musterbank AG, Leipzig; 16 % Jahreszinsen;",
    "vollstreckbar nach § 800 ZPO; eingetragen am 15.03.2004.",
  ]);

  return {
    fileName: "Grundbuch_Musterstrasse12.pdf",
    pages: 4,
    bytes: await pdf.save(),
    result: {
      ...NO_SECTIONS,
      documentType: "land_register",
      summary: `Land register · plot ${plotM2} m² · 1 easement in section II`,
      landRegister: {
        kind: "Grundbuch",
        parcel: cite(parcelLines.join(", "), 1, parcelLines[2]),
        plotM2: cite(plotM2, 1, plotText),
        address: cite(STREET, 1, STREET),
        easements: [
          {
            text: cite(EASEMENT_TEXT, 4, EASEMENT_TEXT),
            translationEn: "Limited personal easement (utility line right) for the municipal utility; registered 14 Mar 1998.",
          },
        ],
        landChargesCount: 1,
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Energieausweis (energy certificate), 1 p.
// ---------------------------------------------------------------------------------------------------------------

/** GEG 2020 efficiency classes for residential buildings, by final energy demand in kWh/(m²·a). */
const ENERGY_CLASSES: [string, number, number, Color][] = [
  ["A+", 0, 30, rgb(0.0, 0.53, 0.24)],
  ["A", 30, 50, rgb(0.2, 0.63, 0.24)],
  ["B", 50, 75, rgb(0.55, 0.74, 0.2)],
  ["C", 75, 100, rgb(0.82, 0.84, 0.18)],
  ["D", 100, 130, rgb(1.0, 0.83, 0.0)],
  ["E", 130, 160, rgb(0.99, 0.68, 0.0)],
  ["F", 160, 200, rgb(0.95, 0.49, 0.1)],
  ["G", 200, 250, rgb(0.89, 0.29, 0.1)],
  ["H", 250, 275, rgb(0.8, 0.1, 0.1)],
];

async function energyCertificate(): Promise<SamplePdf> {
  const pdf = await PdfBuilder.create("Energieausweis Musterstraße 12");
  const builtYear = 1912;
  const heatingYear = 2019;
  const demandKwh = 128;
  const livingAreaM2 = 565;
  const energyClass = ENERGY_CLASSES.find(([, from, to]) => demandKwh >= from && demandKwh < to)?.[0] ?? "H";
  const builtText = `Baujahr Gebäude ${builtYear}`;
  const heatingText = `Baujahr Wärmeerzeuger ${heatingYear}`;
  const carrierText = "Erdgas";
  const classText = `Effizienzklasse ${energyClass}`;
  const demandText = `${demandKwh} kWh/(m²·a)`;
  const areaText = `Gebäudenutzfläche (Wohnfläche) ${livingAreaM2} m²`;

  const sheet = pdf.page();
  sheet.box(LEFT, 752, CONTENT_WIDTH, 58, { fill: rgb(0.9, 0.95, 0.93) });
  sheet.text("ENERGIEAUSWEIS für Wohngebäude", LEFT + 12, 786, { bold: true, size: 17 });
  sheet.text("gemäß den §§ 79 ff. Gebäudeenergiegesetz (GEG) vom 08.08.2020", LEFT + 12, 768, { size: 8.5, color: INK_2 });
  sheet.text("Gültig bis: 14.08.2031", RIGHT - 12, 790, { size: 8.5, color: INK_2, align: "right" });
  sheet.text("Registriernummer: MUSTER-0000-0000", RIGHT - 12, 776, { size: 8.5, color: INK_2, align: "right" });
  sheet.text("Berechneter Energiebedarf (Bedarfsausweis)", RIGHT - 12, 762, { size: 8.5, color: INK_2, align: "right" });

  sheet.text("1  Gebäude", LEFT, 728, { bold: true, size: 11 });
  const rows = [
    "Gebäudetyp Mehrfamilienhaus",
    `Adresse ${ADDRESS}`,
    "Gebäudeteil Gesamtes Gebäude",
    builtText,
    heatingText,
    "Anzahl der Wohnungen 8",
    areaText,
    `Wesentliche Energieträger für Heizung und Warmwasser ${carrierText}`,
    "Art der Heizung Gas-Brennwertkessel, Zentralheizung",
    "Art der Lüftung Fensterlüftung",
    "Anlass der Ausstellung Verkauf",
  ];
  rows.forEach((row, i) => {
    const top = 718 - 19 * i;
    if (i % 2 === 0) sheet.box(LEFT, top - 19, CONTENT_WIDTH, 19, { fill: BAND });
    sheet.text(row, LEFT + 8, top - 13, { size: 9.5, maxWidth: CONTENT_WIDTH - 16 });
  });

  sheet.text("2  Endenergiebedarf dieses Gebäudes", LEFT, 476, { bold: true, size: 11 });
  const scaleX = (kwh: number) => LEFT + (kwh / 275) * CONTENT_WIDTH;
  const barBottom = 396;
  for (const [label, from, to, color] of ENERGY_CLASSES) {
    sheet.box(scaleX(from), barBottom, scaleX(to) - scaleX(from), 26, { fill: color });
    const light = ["C", "D", "E"].includes(label);
    sheet.text(label, (scaleX(from) + scaleX(to)) / 2, barBottom + 9, { bold: true, size: 9, align: "center", color: light ? INK : WHITE });
  }
  for (let kwh = 0; kwh <= 250; kwh += 25) {
    sheet.text(String(kwh), scaleX(kwh), barBottom - 12, { size: 7.5, color: INK_2, align: "center" });
  }
  const marker = scaleX(demandKwh);
  sheet.page.drawSvgPath("M 0 0 L 7 -11 L -7 -11 Z", { x: marker, y: barBottom + 30, color: INK });
  sheet.text(`Endenergiebedarf dieses Gebäudes ${demandText}`, marker, barBottom + 46, { bold: true, size: 9, align: "center" });
  sheet.text(classText, LEFT, 344, { bold: true, size: 14 });
  sheet.paragraph(
    "Primärenergiebedarf, Treibhausgasemissionen und Modernisierungsempfehlungen stehen auf den Seiten 2 bis 4 des vollständigen Ausweises; sie sind nicht Teil dieses Auszugs.",
    LEFT,
    322,
    CONTENT_WIDTH,
    { size: 8.5, color: INK_2 },
  );

  sheet.text("3  Aussteller", LEFT, 262, { bold: true, size: 11 });
  sheet.text("Muster Energieberatung, Leipzig", LEFT, 244, { size: 9.5 });
  sheet.text("Ausstellungsdatum 15.08.2021", LEFT, 229, { size: 9.5 });

  return {
    fileName: "Energieausweis_Musterstrasse12.pdf",
    pages: 1,
    bytes: await pdf.save(),
    result: {
      ...NO_SECTIONS,
      documentType: "energy_certificate",
      summary: `Energy certificate · gas, heating from ${heatingYear} · class ${energyClass} · ${demandText} · ${livingAreaM2} m²`,
      energyCertificate: {
        address: cite(ADDRESS, 1, ADDRESS),
        builtYear: cite(builtYear, 1, builtText),
        heatingYear: cite(heatingYear, 1, heatingText),
        energyCarrier: cite("Gas", 1, carrierText),
        energyClass: cite(energyClass, 1, classText),
        demandKwh: cite(demandKwh, 1, demandText),
        livingAreaM2: cite(livingAreaM2, 1, areaText),
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Sanierungsübersicht (refurbishment sheet), 1 p.: the 6 measures of spec §5.3.2 (13 points by the rules)
// ---------------------------------------------------------------------------------------------------------------

interface Measure {
  german: string;
  english: string;
  year: number;
  category: MeasureCategory;
  extent: "full" | "partial";
  note: string;
}

const MEASURES: Measure[] = [
  { german: "Dacherneuerung inkl. Wärmedämmung", english: "Roof incl. insulation", year: 2016, category: "roof", extent: "full", note: "Neueindeckung, Dämmung" },
  { german: "Erneuerung der Fenster", english: "Windows", year: 2014, category: "windows", extent: "full", note: "Isolierverglasung" },
  { german: "Erneuerung der Leitungssysteme (Strom, Wasser, Abwasser)", english: "Pipes / electrics", year: 2014, category: "pipes", extent: "full", note: "Steigleitungen, Verteilungen" },
  { german: "Einbau Gas-Brennwertkessel", english: "Heating", year: 2019, category: "heating", extent: "full", note: "mit Warmwasserbereitung" },
  { german: "Modernisierung der Bäder", english: "Bathrooms", year: 2014, category: "bathrooms", extent: "full", note: "Fliesen, Sanitärobjekte" },
  { german: "Innenausbau teilweise (Böden, Türen)", english: "Interior, partial", year: 2014, category: "interior", extent: "partial", note: "einzelne Wohnungen" },
];

async function refurbishmentSheet(): Promise<SamplePdf> {
  const pdf = await PdfBuilder.create("Sanierungsübersicht Musterstraße 12");
  const years = MEASURES.map((m) => m.year);
  const period = `${Math.min(...years)}–${Math.max(...years)}`;

  const sheet = pdf.page();
  letterhead(sheet, "Stand 30.09.2026");
  sheet.text("Sanierungsübersicht", LEFT, 744, { bold: true, size: 24 });
  sheet.text(`Modernisierungsmaßnahmen ${period}`, LEFT, 722, { size: 12, color: INK_2 });
  sheet.text(`Objekt: ${ADDRESS} · Mehrfamilienhaus, 8 Wohneinheiten`, LEFT, 700, { size: 9 });
  const columns: Column[] = [
    { x: 56, width: 22 },
    { x: 78, width: 242 },
    { x: 320, width: 36 },
    { x: 356, width: 54 },
    { x: 410, width: RIGHT - 410 },
  ];
  let y = sheet.tableHeader(columns, [["Nr.", "Maßnahme", "Jahr", "Umfang", "Bemerkung"]], 680);
  MEASURES.forEach((m, i) => {
    y -= 24;
    const extent = m.extent === "full" ? "vollständig" : "teilweise";
    sheet.cells(columns, [`${i + 1}`, m.german, String(m.year), extent, m.note], y + 8.5, { size: 8.5 });
    sheet.line(LEFT, y, RIGHT, y);
  });
  y = sheet.paragraph(
    "Alle Maßnahmen wurden von Fachbetrieben ausgeführt. Rechnungen und Abnahmeprotokolle liegen der Hausverwaltung vor.",
    LEFT,
    y - 24,
    CONTENT_WIDTH,
    { size: 8.5, color: INK_2 },
  );
  sheet.line(LEFT, y - 46, LEFT + 200, y - 46, { color: INK_2 });
  sheet.text(`Leipzig, 30.09.2026 · ${MANAGER}`, LEFT, y - 60, { size: 9, color: INK_2 });

  return {
    fileName: "Sanierungsuebersicht_Musterstrasse12.pdf",
    pages: 1,
    bytes: await pdf.save(),
    result: {
      ...NO_SECTIONS,
      documentType: "refurbishment_sheet",
      summary: `Refurbishment sheet · ${MEASURES.length} measures ${period}`,
      refurbishmentSheet: {
        measures: MEASURES.map((m) => ({
          name: cite(m.english, 1, m.german),
          year: cite(m.year, 1, String(m.year)),
          category: m.category,
          extent: m.extent,
        })),
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 5. B-Plan (zoning plan excerpt), 1 p.
// ---------------------------------------------------------------------------------------------------------------

async function zoningPlan(): Promise<SamplePdf> {
  const pdf = await PdfBuilder.create("Bebauungsplan Nr. 47 Musterviertel, Auszug");
  const areaTypeText = "Allgemeines Wohngebiet (WA)";
  const residentialText = "Wohnnutzung zulässig";
  const rose = rgb(0.98, 0.87, 0.85);
  const grey = rgb(0.74, 0.74, 0.76);
  const blue = rgb(0.13, 0.33, 0.75);

  const sheet = pdf.page();
  sheet.text("Bebauungsplan Nr. 47 „Musterviertel“", LEFT, 790, { bold: true, size: 18 });
  sheet.text("Auszug aus Planzeichnung und textlichen Festsetzungen · Gemarkung Leipzig, Flur 12", LEFT, 772, { size: 9, color: INK_2 });
  sheet.text("Satzungsbeschluss 12.03.2003 · in Kraft seit 12.06.2003", LEFT, 758, { size: 8.5, color: INK_2 });

  // Plan drawing: the block (WA, rose) above the street, parcel boundaries, buildings and the building line.
  const top = 740;
  const bottom = 470;
  const street = 520;
  sheet.box(LEFT, bottom, CONTENT_WIDTH, top - bottom, { stroke: INK_2 });
  sheet.box(LEFT, street, CONTENT_WIDTH, top - street, { fill: rose });
  sheet.box(LEFT, bottom, CONTENT_WIDTH, street - bottom, { fill: rgb(0.88, 0.88, 0.88) });
  sheet.text("Musterstraße", (LEFT + RIGHT) / 2, 491, { size: 9, color: INK_2, align: "center" });
  const parcels: [string, number, number][] = [
    ["123/3", LEFT, 196],
    ["123/4", 196, 336],
    ["123/5", 336, 466],
    ["123/6", 466, RIGHT],
  ];
  for (const [label, x0, x1] of parcels) {
    if (x0 > LEFT) sheet.line(x0, street, x0, top, { color: INK, width: 0.8 });
    sheet.box(x0 + 4, street + 6, x1 - x0 - 8, 70, { fill: grey });
    sheet.text(label, (x0 + x1) / 2, 652, { size: 9, bold: label === "123/4", align: "center" });
  }
  sheet.box(LEFT + 4, street + 4, CONTENT_WIDTH - 8, 96, { stroke: blue, dash: [5, 3] });
  const schablone: Column[] = [
    { x: 351, width: 50, align: "center" },
    { x: 401, width: 50, align: "center" },
  ];
  sheet.box(351, 664, 100, 66, { fill: WHITE, stroke: INK });
  sheet.line(401, 664, 401, 730, { color: INK });
  sheet.line(351, 686, 451, 686, { color: INK });
  sheet.line(351, 708, 451, 708, { color: INK });
  sheet.cells(schablone, ["WA", "IV"], 715, { bold: true, size: 9 });
  sheet.cells(schablone, ["0,4", "1,2"], 693, { size: 9 });
  sheet.cells(schablone, ["g", ""], 671, { size: 9 });
  // drawSvgPath uses SVG coordinates (y down), so the tip at y = −18 points north.
  sheet.page.drawSvgPath("M 0 0 L 6 -18 L 12 0 L 6 -5 Z", { x: 70, y: 690, color: INK });
  sheet.text("N", 76, 714, { bold: true, size: 9, align: "center" });
  sheet.text("Ausschnitt, nicht maßstäblich", LEFT + 6, 476, { size: 7.5, color: INK_2 });

  sheet.text("Zeichenerklärung", LEFT, 446, { bold: true, size: 10 });
  const legend: [string, (x: number, y: number) => void][] = [
    ["WA – Allgemeines Wohngebiet", (x, y) => sheet.box(x, y - 2, 22, 10, { fill: rose, stroke: INK_2 })],
    ["Baugrenze", (x, y) => sheet.line(x, y + 3, x + 22, y + 3, { color: blue, width: 1, dash: [5, 3] })],
    ["Flurstücksgrenze mit Flurstücksnummer", (x, y) => sheet.line(x, y + 3, x + 22, y + 3, { color: INK, width: 0.8 })],
    ["Vorhandene Bebauung", (x, y) => sheet.box(x, y - 2, 22, 10, { fill: grey })],
  ];
  legend.forEach(([label, symbol], i) => {
    const x = i % 2 === 0 ? LEFT : LEFT + 250;
    const y = 426 - 18 * Math.floor(i / 2);
    symbol(x, y);
    sheet.text(label, x + 30, y, { size: 8.5 });
  });

  sheet.text("Textliche Festsetzungen (Auszug)", LEFT, 368, { bold: true, size: 10 });
  [
    `1. Art der baulichen Nutzung: ${areaTypeText} gemäß § 4 BauNVO.`,
    `2. ${residentialText}; Läden und nicht störende Handwerksbetriebe sind ausnahmsweise zulässig.`,
    "3. Maß der baulichen Nutzung: GRZ 0,4; GFZ 1,2; höchstens vier Vollgeschosse (IV).",
    "4. Bauweise: geschlossene Bauweise (g).",
    "5. Dachgeschosse dürfen zu Wohnzwecken ausgebaut werden; Dachterrassen sind zulässig.",
  ].forEach((line, i) => sheet.text(line, LEFT, 350 - 16 * i, { size: 9, maxWidth: CONTENT_WIDTH }));

  return {
    fileName: "B-Plan_Auszug_Musterstrasse12.pdf",
    pages: 1,
    bytes: await pdf.save(),
    result: {
      ...NO_SECTIONS,
      documentType: "zoning_plan",
      summary: "Zoning plan · general residential area (WA) · residential use permitted",
      zoningPlan: {
        areaType: cite("General residential area (WA)", 1, areaTypeText),
        residentialAllowed: cite(true, 1, residentialText),
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Text-layer check: each quote must sit inside one text item of its page, as the PDF viewer highlights per item
// ---------------------------------------------------------------------------------------------------------------

async function checkTextLayer({ fileName, pages, bytes, result }: SamplePdf): Promise<number> {
  const { totalPages, items } = await extractTextItems(new Uint8Array(bytes));
  const problems: string[] = [];
  if (totalPages !== pages) problems.push(`${totalPages} pages instead of ${pages}`);
  items.forEach((pageItems, i) => {
    if (!pageItems.some((item) => item.str.includes(WATERMARK))) problems.push(`no watermark on p. ${i + 1}`);
  });
  const fields = citedFields(result);
  for (const { path: fieldPath, field } of fields) {
    if (!items[field.page - 1]?.some((item) => item.str.includes(field.quote))) {
      problems.push(`${fieldPath}: "${field.quote}" is not one text item on p. ${field.page}`);
    }
  }
  if (problems.length > 0) throw new Error(`${fileName}:\n  ${problems.join("\n  ")}`);
  return fields.length;
}

// ---------------------------------------------------------------------------------------------------------------
// Fixtures: <sha256>.json per PDF and index.json
// ---------------------------------------------------------------------------------------------------------------

interface IndexEntry {
  sha256: string;
  source: "demo-fixture" | "recorded-live";
}

function writeFixtures(documents: SamplePdf[]): Record<string, IndexEntry> {
  const indexPath = path.join(FIXTURE_DIR, "index.json");
  const previous: Record<string, IndexEntry> = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};
  const index: Record<string, IndexEntry> = {};
  for (const { fileName, bytes, result } of documents) {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const fixturePath = path.join(FIXTURE_DIR, `${sha256}.json`);
    const before = previous[fileName];
    if (before?.source === "recorded-live" && before.sha256 === sha256 && existsSync(fixturePath)) {
      index[fileName] = before; // the PDF is unchanged, so its live recording still applies
      continue;
    }
    // Parsing validates the result and orders its keys as in the schema.
    writeFileSync(fixturePath, `${JSON.stringify(ExtractionResultSchema.parse(result), null, 2)}\n`);
    index[fileName] = { sha256, source: "demo-fixture" };
  }
  const current = new Set(Object.values(index).map((entry) => entry.sha256));
  for (const { sha256 } of Object.values(previous)) {
    if (!current.has(sha256)) rmSync(path.join(FIXTURE_DIR, `${sha256}.json`), { force: true });
  }
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

// ---------------------------------------------------------------------------------------------------------------
// Photos: a small rasteriser, a 5×7 bitmap font and a baseline JPEG encoder
// ---------------------------------------------------------------------------------------------------------------

type RGB = readonly [number, number, number];

/** An RGB canvas, drawn at SUPERSAMPLE× resolution and box-filtered down for smooth edges. */
class Raster {
  private static readonly SUPERSAMPLE = 2;
  private readonly w: number;
  private readonly h: number;
  private readonly px: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.w = width * Raster.SUPERSAMPLE;
    this.h = height * Raster.SUPERSAMPLE;
    this.px = new Uint8ClampedArray(this.w * this.h * 3);
  }

  /** Even-odd polygon fill; `points` is x0, y0, x1, y1, … in image coordinates (y down). */
  polygon(points: number[], color: RGB, alpha = 1): void {
    const s = Raster.SUPERSAMPLE;
    const n = points.length / 2;
    const ys = points.filter((_, i) => i % 2 === 1);
    const from = Math.max(0, Math.floor(Math.min(...ys) * s));
    const to = Math.min(this.h - 1, Math.ceil(Math.max(...ys) * s));
    for (let py = from; py <= to; py++) {
      const y = (py + 0.5) / s;
      const crossings: number[] = [];
      for (let i = 0; i < n; i++) {
        const [x1, y1] = [points[2 * i], points[2 * i + 1]];
        const [x2, y2] = [points[(2 * i + 2) % (2 * n)], points[(2 * i + 3) % (2 * n)]];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) this.span(py, crossings[k] * s, crossings[k + 1] * s, color, alpha);
    }
  }

  rect(x: number, y: number, width: number, height: number, color: RGB, alpha = 1): void {
    this.polygon([x, y, x + width, y, x + width, y + height, x, y + height], color, alpha);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: RGB, alpha = 1): void {
    const s = Raster.SUPERSAMPLE;
    for (let py = Math.max(0, Math.floor((cy - ry) * s)); py <= Math.min(this.h - 1, Math.ceil((cy + ry) * s)); py++) {
      const dy = ((py + 0.5) / s - cy) / ry;
      if (dy * dy >= 1) continue;
      const dx = rx * Math.sqrt(1 - dy * dy);
      this.span(py, (cx - dx) * s, (cx + dx) * s, color, alpha);
    }
  }

  /** A straight stroke of the given width, as a quadrilateral. */
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: RGB, alpha = 1): void {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const nx = (-(y2 - y1) / length) * (width / 2);
    const ny = ((x2 - x1) / length) * (width / 2);
    this.polygon([x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny], color, alpha);
  }

  /** Fills a rectangle with a vertical gradient from `top` to `bottom`. */
  gradient(x: number, y: number, width: number, height: number, top: RGB, bottom: RGB): void {
    const s = Raster.SUPERSAMPLE;
    for (let py = Math.max(0, Math.round(y * s)); py < Math.min(this.h, Math.round((y + height) * s)); py++) {
      const t = (py / s - y) / height;
      const mix = (c: number) => top[c] + (bottom[c] - top[c]) * t;
      this.span(py, x * s, (x + width) * s, [mix(0), mix(1), mix(2)], 1);
    }
  }

  /** Upper-case text in the 5×7 bitmap font; `unit` is the size of one font pixel. Returns the text's width. */
  text(text: string, x: number, y: number, unit: number, color: RGB): number {
    [...text].forEach((char, i) => {
      const glyph = FONT[char];
      if (!glyph) throw new Error(`No glyph for "${char}"`);
      glyph.forEach((row, gy) => {
        [...row].forEach((cell, gx) => {
          if (cell === "#") this.rect(x + (6 * i + gx) * unit, y + gy * unit, unit, unit, color);
        });
      });
    });
    return Raster.textWidth(text, unit);
  }

  static textWidth(text: string, unit: number): number {
    return (6 * text.length - 1) * unit;
  }

  /** The image at its final size: each pixel is the mean of its SUPERSAMPLE × SUPERSAMPLE samples. */
  pixels(): Uint8Array {
    const s = Raster.SUPERSAMPLE;
    const out = new Uint8Array(this.width * this.height * 3);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) sum += this.px[((y * s + dy) * this.w + x * s + dx) * 3 + c];
          out[(y * this.width + x) * 3 + c] = Math.round(sum / (s * s));
        }
      }
    }
    return out;
  }

  private span(py: number, x0: number, x1: number, color: RGB, alpha: number): void {
    const from = Math.max(0, Math.ceil(x0 - 0.5));
    const to = Math.min(this.w - 1, Math.floor(x1 - 0.5));
    for (let px = from; px <= to; px++) {
      const i = (py * this.w + px) * 3;
      for (let c = 0; c < 3; c++) this.px[i + c] = alpha >= 1 ? color[c] : this.px[i + c] + (color[c] - this.px[i + c]) * alpha;
    }
  }
}

/** A 5×7 bitmap font for the labels: upper case, digits and a few signs. */
const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "·": [".....", ".....", ".....", "..#..", ".....", ".....", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
};

/** The "SAMPLE" badge and a caption band, the same on every photo. */
function markAsSample(r: Raster, caption: string): void {
  const badge = Raster.textWidth("SAMPLE", 9);
  r.rect(28, 28, badge + 44, 118, [255, 255, 255], 0.93);
  r.rect(28, 28, badge + 44, 6, [196, 32, 32]);
  r.text("SAMPLE", 50, 52, 9, [196, 32, 32]);
  r.text("ILLUSTRATION", 50, 122, 2.5, [90, 96, 108]);
  r.rect(0, r.height - 64, r.width, 64, [16, 24, 40], 0.62);
  r.text(caption, 28, r.height - 46, 4, [255, 255, 255]);
}

/** A window with frame, glass, glazing bars and sill. */
function drawWindow(r: Raster, x: number, y: number, width: number, height: number): void {
  r.rect(x - 4, y - 4, width + 8, height + 8, [246, 242, 233]);
  r.gradient(x, y, width, height, [86, 112, 138], [58, 80, 104]);
  r.rect(x + width / 2 - 2, y, 4, height, [246, 242, 233]);
  r.rect(x, y + height * 0.34, width, 4, [246, 242, 233]);
  r.rect(x - 10, y + height + 4, width + 20, 7, [196, 176, 142]);
}

/** Façade of the 1912 house: ground floor, three upper floors, mansard roof with dormers and the roof terrace. */
function facadePhoto(): Raster {
  const r = new Raster(1200, 800);
  r.gradient(0, 0, 1200, 700, [112, 160, 210], [208, 226, 241]);
  r.rect(0, 200, 176, 500, [190, 172, 156]);
  r.rect(1024, 176, 176, 524, [166, 178, 184]);
  for (const x of [26, 100]) for (const y of [262, 392, 522]) drawWindow(r, x, y, 48, 76);
  for (const x of [1050, 1124]) for (const y of [236, 366, 496]) drawWindow(r, x, y, 48, 76);

  const [left, right] = [190, 1010];
  r.polygon([left - 12, 220, right + 12, 220, right - 46, 118, left + 46, 118], [84, 90, 102]);
  r.rect(left, 220, right - left, 480, [234, 214, 180]);
  r.rect(left, 600, right - left, 100, [208, 186, 150]);
  for (const y of [220, 350, 475, 600]) r.rect(left - 10, y - 7, right - left + 20, 12, [216, 196, 160]);
  for (const x of [286, 506, 726]) {
    r.polygon([x - 8, 150, x + 38, 118, x + 84, 150], [70, 75, 86]);
    r.rect(x, 150, 76, 60, [222, 202, 168]);
    drawWindow(r, x + 14, 160, 48, 40);
  }
  // roof terrace of the attic flat: railing and plants on the flat top
  r.rect(850, 92, 132, 5, [52, 56, 62]);
  for (let x = 852; x <= 978; x += 14) r.rect(x, 92, 3, 26, [52, 56, 62]);
  r.ellipse(880, 100, 16, 12, [86, 132, 72]);
  r.ellipse(950, 98, 20, 14, [72, 120, 64]);

  for (const top of [246, 372, 497]) for (const x of [244, 374, 504, 634, 764, 894]) drawWindow(r, x, top, 62, 86);
  // balconies of WE 4 (1st floor right) and WE 6 (2nd floor right)
  for (const y of [586, 461]) {
    r.rect(744, y, 232, 9, [150, 140, 128]);
    r.rect(744, y - 34, 232, 4, [44, 48, 54]);
    for (let x = 748; x <= 970; x += 12) r.rect(x, y - 34, 2.5, 34, [44, 48, 54]);
  }
  // ground floor: entrance and windows
  r.rect(566, 612, 68, 88, [116, 74, 44]);
  r.ellipse(600, 614, 34, 18, [116, 74, 44]);
  r.rect(598, 620, 4, 80, [92, 58, 34]);
  for (const x of [244, 374, 764, 894]) drawWindow(r, x, 622, 62, 58);

  r.rect(0, 700, 1200, 100, [170, 168, 162]);
  r.rect(0, 700, 1200, 8, [140, 138, 132]);
  r.rect(98, 520, 18, 186, [96, 68, 46]);
  r.ellipse(107, 470, 84, 94, [88, 130, 72]);
  r.ellipse(64, 506, 52, 50, [76, 116, 62]);
  r.ellipse(150, 512, 56, 50, [98, 142, 80]);
  markAsSample(r, "FASSADE · MUSTERSTRASSE 12");
  return r;
}

/** The attic flat's roof terrace: deck, railing and the city roofscape. */
function roofTerracePhoto(): Raster {
  const r = new Raster(1200, 800);
  r.gradient(0, 0, 1200, 560, [98, 152, 210], [222, 233, 243]);
  r.ellipse(1020, 120, 110, 110, [255, 240, 200], 0.25);
  r.ellipse(1020, 120, 54, 54, [255, 246, 222]);
  r.polygon([0, 560, 0, 452, 90, 430, 160, 452, 230, 418, 330, 440, 380, 400, 460, 430, 560, 410, 640, 446, 760, 420, 850, 440, 960, 404, 1060, 430, 1200, 412, 1200, 560], [152, 164, 182]);
  r.rect(680, 300, 34, 130, [140, 152, 170]);
  r.polygon([672, 300, 697, 226, 722, 300], [126, 138, 158]);
  r.polygon([0, 560, 0, 500, 120, 470, 260, 500, 260, 560], [150, 98, 82]);
  r.polygon([880, 560, 940, 486, 1200, 470, 1200, 560], [140, 92, 78]);
  r.rect(210, 452, 18, 40, [120, 80, 66]);
  r.rect(1080, 440, 20, 42, [120, 80, 66]);

  r.rect(0, 560, 1200, 240, [168, 122, 82]);
  const vanish = [600, 470] as const;
  for (let x = -1400; x <= 2600; x += 120) {
    const t = (560 - vanish[1]) / (800 - vanish[1]);
    r.line(x, 800, vanish[0] + (x - vanish[0]) * t, 560, 3, [138, 98, 64]);
  }
  r.rect(0, 476, 1200, 7, [54, 58, 64]);
  r.rect(0, 548, 1200, 5, [54, 58, 64]);
  for (let x = 10; x < 1200; x += 34) r.rect(x, 476, 4, 84, [54, 58, 64]);

  // plants and a deck chair
  r.polygon([70, 650, 200, 650, 186, 770, 84, 770], [186, 92, 58]);
  r.ellipse(135, 610, 84, 58, [78, 124, 66]);
  r.ellipse(98, 590, 40, 44, [96, 146, 80]);
  r.polygon([990, 640, 1110, 640, 1098, 750, 1002, 750], [186, 92, 58]);
  r.ellipse(1050, 604, 70, 52, [72, 118, 62]);
  r.polygon([560, 700, 840, 700, 880, 610, 600, 610], [236, 236, 230]);
  r.polygon([560, 700, 600, 610, 540, 560, 500, 650], [222, 222, 214]);
  r.line(570, 700, 560, 760, 6, [90, 92, 96]);
  r.line(830, 700, 840, 760, 6, [90, 92, 96]);
  markAsSample(r, "DACHTERRASSE · DG");
  return r;
}

/** The attic living room in one-point perspective: gable wall, knee walls, roof slopes and a roof window. */
function atticLivingRoomPhoto(): Raster {
  const r = new Raster(1200, 800);
  const vp = [600, 400] as const;
  const front = (x: number, y: number, k = 3): [number, number] => [vp[0] + (x - vp[0]) * k, vp[1] + (y - vp[1]) * k];
  const [bl, br, kl, kr, ridge] = [[330, 560], [870, 560], [330, 400], [870, 400], [600, 230]] as const;
  const [blF, brF, klF, krF, ridgeF] = [front(...bl), front(...br), front(...kl), front(...kr), front(...ridge)];
  const [leftSlope, rightSlope] = [[246, 241, 232], [240, 234, 223]] as const;

  // The slopes continue towards the viewer beyond their drawn quadrilaterals: paint them first.
  r.rect(0, 0, 600, 800, leftSlope);
  r.rect(600, 0, 600, 800, rightSlope);
  r.polygon([...bl, ...br, ...brF, ...blF], [186, 142, 98]);
  for (let x = -1500; x <= 2700; x += 90) r.line(x, 1100, vp[0] + (x - vp[0]) * 0.3, vp[1] + 700 * 0.3 - 50, 2, [160, 120, 80]);
  r.polygon([...bl, ...kl, ...klF, ...blF], [226, 216, 200]);
  r.polygon([...br, ...kr, ...krF, ...brF], [230, 221, 206]);
  r.polygon([...kl, ...ridge, ...ridgeF, ...klF], leftSlope);
  r.polygon([...kr, ...ridge, ...ridgeF, ...krF], rightSlope);
  r.polygon([...bl, ...br, ...kr, ...ridge, ...kl], [237, 229, 215]);
  // exposed purlins on both slopes
  for (const [a, b] of [[kl, ridge], [kr, ridge]] as const) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    r.line(mid[0], mid[1], ...front(mid[0], mid[1]), 16, [150, 108, 70]);
  }
  // roof window in the right slope
  const onSlope = (s: number, t: number): [number, number] => {
    const back = [kr[0] + (ridge[0] - kr[0]) * s, kr[1] + (ridge[1] - kr[1]) * s];
    const near = [krF[0] + (ridgeF[0] - krF[0]) * s, krF[1] + (ridgeF[1] - krF[1]) * s];
    return [back[0] + (near[0] - back[0]) * t, back[1] + (near[1] - back[1]) * t];
  };
  r.polygon([...onSlope(0.22, 0.18), ...onSlope(0.7, 0.18), ...onSlope(0.7, 0.42), ...onSlope(0.22, 0.42)], [250, 250, 248]);
  r.polygon([...onSlope(0.27, 0.21), ...onSlope(0.65, 0.21), ...onSlope(0.65, 0.39), ...onSlope(0.27, 0.39)], [150, 196, 236]);

  // picture, sofa, rug, table, lamp and a plant
  r.rect(536, 318, 128, 84, [64, 58, 52]);
  r.rect(544, 326, 112, 68, [214, 186, 120]);
  r.polygon([544, 394, 600, 344, 656, 394], [92, 136, 120]);
  r.ellipse(600, 650, 300, 62, [192, 84, 70], 0.9);
  r.rect(420, 446, 360, 56, [74, 94, 116]);
  r.rect(410, 492, 380, 62, [88, 110, 134]);
  r.rect(396, 470, 34, 86, [74, 94, 116]);
  r.rect(770, 470, 34, 86, [74, 94, 116]);
  r.ellipse(520, 490, 48, 22, [214, 196, 150]);
  r.ellipse(680, 490, 48, 22, [176, 196, 210]);
  r.polygon([492, 620, 708, 620, 730, 642, 470, 642], [118, 82, 54]);
  r.rect(486, 642, 8, 40, [96, 64, 42]);
  r.rect(706, 642, 8, 40, [96, 64, 42]);
  r.ellipse(300, 330, 90, 70, [255, 236, 190], 0.35);
  r.rect(297, 330, 6, 228, [60, 60, 64]);
  r.ellipse(300, 560, 30, 8, [60, 60, 64]);
  r.polygon([268, 300, 332, 300, 322, 344, 278, 344], [244, 230, 196]);
  r.polygon([880, 640, 950, 640, 942, 720, 888, 720], [186, 92, 58]);
  r.ellipse(915, 590, 46, 62, [76, 122, 66]);
  markAsSample(r, "WOHNZIMMER · DG");
  return r;
}

// Baseline JPEG (JFIF, no chroma subsampling) with the standard tables of ITU-T T.81 Annex K.

/** Natural (row-major) index of the k-th coefficient in zig-zag order. */
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55,
  62, 63,
];
const LUMA_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87,
  80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92,
  95, 98, 112, 100, 103, 99,
];
const CHROMA_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99,
  99, 99, ...new Array<number>(32).fill(99),
];

interface HuffmanSpec {
  /** Number of codes of each length 1–16. */
  counts: number[];
  symbols: number[];
}

const AC_SYMBOLS_LUMA = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32,
  0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
  0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94,
  0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8,
  0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const AC_SYMBOLS_CHROMA = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81,
  0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34,
  0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44,
  0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92,
  0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6,
  0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const DC_SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const HUFFMAN = {
  dcLuma: { counts: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], symbols: DC_SYMBOLS },
  acLuma: { counts: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], symbols: AC_SYMBOLS_LUMA },
  dcChroma: { counts: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], symbols: DC_SYMBOLS },
  acChroma: { counts: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], symbols: AC_SYMBOLS_CHROMA },
} satisfies Record<string, HuffmanSpec>;

interface HuffmanCodes {
  code: number[];
  length: number[];
}

/** Canonical codes from the code-length counts (T.81 Annex C). */
function huffmanCodes({ counts, symbols }: HuffmanSpec): HuffmanCodes {
  const code = new Array<number>(256).fill(0);
  const length = new Array<number>(256).fill(0);
  let next = 0;
  let k = 0;
  for (let bits = 1; bits <= 16; bits++) {
    for (let i = 0; i < counts[bits - 1]; i++, k++, next++) {
      if (next >= 1 << bits) throw new Error("Invalid Huffman table");
      code[symbols[k]] = next;
      length[symbols[k]] = bits;
    }
    next <<= 1;
  }
  return { code, length };
}

/** Writes Huffman-coded bits MSB first, stuffing a 0x00 after every 0xFF byte. */
class BitWriter {
  private buffer = 0;
  private count = 0;

  constructor(private readonly out: number[]) {}

  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i--) {
      this.buffer = (this.buffer << 1) | ((value >> i) & 1);
      if (++this.count === 8) {
        this.out.push(this.buffer);
        if (this.buffer === 0xff) this.out.push(0);
        this.buffer = 0;
        this.count = 0;
      }
    }
  }

  symbol(table: HuffmanCodes, symbol: number): void {
    if (table.length[symbol] === 0) throw new Error(`No Huffman code for symbol ${symbol}`);
    this.write(table.code[symbol], table.length[symbol]);
  }

  /** Pads the last byte with 1-bits. */
  flush(): void {
    if (this.count > 0) this.write((1 << (8 - this.count)) - 1, 8 - this.count);
  }
}

/** cos((2n+1)kπ/16) with the DCT's normalisation C(k)/2. */
const DCT_BASIS = Array.from({ length: 8 }, (_, k) =>
  Array.from({ length: 8 }, (_, n) => ((k === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * n + 1) * k * Math.PI) / 16)) / 2),
);

/** 8×8 forward DCT, separable: rows, then columns. Input and output are row-major. */
function forwardDct(block: Float64Array): Float64Array {
  const rows = new Float64Array(64);
  const out = new Float64Array(64);
  for (let y = 0; y < 8; y++) {
    for (let u = 0; u < 8; u++) {
      let sum = 0;
      for (let x = 0; x < 8; x++) sum += DCT_BASIS[u][x] * block[y * 8 + x];
      rows[y * 8 + u] = sum;
    }
  }
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let y = 0; y < 8; y++) sum += DCT_BASIS[v][y] * rows[y * 8 + u];
      out[v * 8 + u] = sum;
    }
  }
  return out;
}

/** Number of bits of |v| (the JPEG "size" category). */
function magnitude(v: number): number {
  let n = 0;
  for (let a = Math.abs(v); a > 0; a >>= 1) n++;
  return n;
}

function encodeJpeg(rgbPixels: Uint8Array, width: number, height: number, quality = 88): Uint8Array {
  const scale = quality < 50 ? 5000 / quality : 200 - 2 * quality;
  const quantise = (table: number[]) => table.map((q) => Math.min(255, Math.max(1, Math.floor((q * scale + 50) / 100))));
  const quant = [quantise(LUMA_QUANT), quantise(CHROMA_QUANT)];
  const dc = [huffmanCodes(HUFFMAN.dcLuma), huffmanCodes(HUFFMAN.dcChroma)];
  const ac = [huffmanCodes(HUFFMAN.acLuma), huffmanCodes(HUFFMAN.acChroma)];

  const out: number[] = [0xff, 0xd8];
  const segment = (marker: number, body: number[]) => out.push(0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body);
  const huffmanSegment = (classAndId: number, spec: HuffmanSpec) => [classAndId, ...spec.counts, ...spec.symbols];
  segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  segment(0xdb, [0, ...ZIGZAG.map((n) => quant[0][n]), 1, ...ZIGZAG.map((n) => quant[1][n])]);
  segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  segment(0xc4, [
    ...huffmanSegment(0x00, HUFFMAN.dcLuma),
    ...huffmanSegment(0x10, HUFFMAN.acLuma),
    ...huffmanSegment(0x01, HUFFMAN.dcChroma),
    ...huffmanSegment(0x11, HUFFMAN.acChroma),
  ]);
  segment(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);

  const bits = new BitWriter(out);
  const previousDc = [0, 0, 0];
  const block = new Float64Array(64);
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let component = 0; component < 3; component++) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const i = (Math.min(by + y, height - 1) * width + Math.min(bx + x, width - 1)) * 3;
            const [red, green, blue] = [rgbPixels[i], rgbPixels[i + 1], rgbPixels[i + 2]];
            const value =
              component === 0
                ? 0.299 * red + 0.587 * green + 0.114 * blue
                : component === 1
                  ? -0.168736 * red - 0.331264 * green + 0.5 * blue + 128
                  : 0.5 * red - 0.418688 * green - 0.081312 * blue + 128;
            block[y * 8 + x] = value - 128;
          }
        }
        const table = component === 0 ? 0 : 1;
        const coefficients = forwardDct(block);
        const zz = ZIGZAG.map((n) => Math.round(coefficients[n] / quant[table][n]));

        const diff = zz[0] - previousDc[component];
        previousDc[component] = zz[0];
        const dcSize = magnitude(diff);
        bits.symbol(dc[table], dcSize);
        bits.write(diff < 0 ? diff + (1 << dcSize) - 1 : diff, dcSize);
        let run = 0;
        for (let k = 1; k < 64; k++) {
          if (zz[k] === 0) {
            run++;
            continue;
          }
          for (; run > 15; run -= 16) bits.symbol(ac[table], 0xf0);
          const size = magnitude(zz[k]);
          bits.symbol(ac[table], (run << 4) | size);
          bits.write(zz[k] < 0 ? zz[k] + (1 << size) - 1 : zz[k], size);
          run = 0;
        }
        if (run > 0) bits.symbol(ac[table], 0x00);
      }
    }
  }
  bits.flush();
  out.push(0xff, 0xd9);
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const documents = [await tenantList(), await landRegister(), await energyCertificate(), await refurbishmentSheet(), await zoningPlan()];
  const quotes = await Promise.all(documents.map(checkTextLayer));

  mkdirSync(SAMPLE_DIR, { recursive: true });
  mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const d of documents) writeFileSync(path.join(SAMPLE_DIR, d.fileName), d.bytes);
  const index = writeFixtures(documents);
  documents.forEach((d, i) => {
    const { sha256, source } = index[d.fileName];
    console.log(`${d.fileName.padEnd(42)} ${d.pages} p.  ${String(quotes[i]).padStart(2)} quotes  ${sha256.slice(0, 12)}…  ${source}`);
  });

  const photos: [string, () => Raster][] = [
    ["foto_fassade.jpg", facadePhoto],
    ["foto_dachterrasse.jpg", roofTerracePhoto],
    ["foto_wohnzimmer_dg.jpg", atticLivingRoomPhoto],
  ];
  for (const [fileName, draw] of photos) {
    const raster = draw();
    const jpeg = encodeJpeg(raster.pixels(), raster.width, raster.height);
    writeFileSync(path.join(SAMPLE_DIR, fileName), jpeg);
    console.log(`${fileName.padEnd(42)} ${raster.width}×${raster.height}  ${Math.round(jpeg.length / 1024)} KB`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
