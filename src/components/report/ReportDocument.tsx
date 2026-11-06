/**
 * The valuation report as a PDF (spec §5.6), drawn with @react-pdf/renderer from the report model (`buildReport`).
 *
 * Browser only in the app: @react-pdf/renderer is large, so the C5 page imports this module in the Download button's
 * click handler and never on the server. (Unit tests render it under Node.)
 *
 * Fonts: the PDF's built-in Helvetica, so nothing is fetched at runtime. Helvetica encodes WinAnsi, which has the euro
 * sign and the German umlauts; every text passes through `toWinAnsi` first, which maps the few characters it lacks
 * (the minus sign, arrows) to ones it has.
 *
 * A draft (the valuer's preview of an unsigned deal) carries a "DRAFT — NOT SIGNED" watermark on every page.
 *
 * Layout notes for @react-pdf/renderer 4.9:
 * - The line height is set on the content, not on the page: a page-level `lineHeight` drops the fixed footer that
 *   holds the page numbers (a `render` text) from every page.
 * - Words are never hyphenated: the built-in English hyphenation splits German words and file names.
 */
import { Circle, Document, Font, Image, Page, Path, pdf, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import {
  REPORT_SECTIONS,
  type CallStatus,
  type ReportCalcRow,
  type ReportCall,
  type ReportModel,
  type ReportSourceDocument,
  type ReportUnitRow,
} from "@/lib/report/buildReport";
import type { SourceType } from "@/lib/registry/registry";
import { toWinAnsiDeep } from "@/lib/report/winAnsi";

/** The design tokens of the app (src/app/globals.css). */
const C = {
  ink: "#101828",
  ink2: "#475467",
  muted: "#5B6576",
  faint: "#98A2B3",
  line: "#E4E7EC",
  lineStrong: "#D0D5DD",
  page: "#F2F4F7",
  subtle: "#F9FAFB",
  brand: "#0B5D4B",
  brandWeak: "#E6F2EE",
  brandAccent: "#7FD1B9",
  doc: "#1849A9",
  docWeak: "#EAF1FF",
  public: "#0E6F67",
  publicWeak: "#E3F5F2",
  rule: "#475467",
  ruleWeak: "#EEF0F3",
  ai: "#A3410A",
  aiWeak: "#FFF4E5",
  aiStrong: "#F79009",
  valuer: "#5B3CC4",
  valuerWeak: "#F1EDFF",
  valuerLine: "#BDB4FE",
  white: "#FFFFFF",
};

const BOLD = 700;

Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: {
    paddingTop: 62,
    paddingBottom: 58,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.ink,
  },
  // A unitless line height resolves against the font size of the style that sets it (18 when it sets none), and the
  // children inherit the result in points: 9 × 1.4 = 12.6 pt.
  content: { fontSize: 9, lineHeight: 1.4 },
  coverPage: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.4,
    color: C.ink,
  },
  header: {
    position: "absolute",
    top: 26,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: C.line,
    fontSize: 7.5,
    color: C.muted,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 0.75,
    borderTopColor: C.line,
    fontSize: 7.5,
    color: C.muted,
  },
  watermarkLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  watermark: {
    width: 640,
    textAlign: "center",
    fontFamily: "Helvetica",
    fontWeight: BOLD,
    fontSize: 50,
    color: C.aiStrong,
    opacity: 0.14,
    transform: "rotate(-40deg)",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.brand,
  },
  sectionNumber: { fontSize: 13, fontWeight: BOLD, color: C.brand, width: 22 },
  sectionTitle: { fontSize: 13, fontWeight: BOLD, color: C.ink },
  paragraph: { marginBottom: 6, color: C.ink },
  small: { fontSize: 7.5, color: C.muted },
  muted: { color: C.muted },
  bold: { fontWeight: BOLD },
  italic: { fontFamily: "Helvetica-Oblique" },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingTop: 2.5,
    paddingBottom: 1.5,
    fontSize: 7,
    lineHeight: 1,
    fontWeight: BOLD,
  },
  table: { borderTopWidth: 0.75, borderTopColor: C.line },
  th: {
    flexDirection: "row",
    backgroundColor: C.subtle,
    borderBottomWidth: 0.75,
    borderBottomColor: C.line,
    fontSize: 7,
    fontWeight: BOLD,
    color: C.muted,
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line },
  cell: { paddingVertical: 3.5, paddingHorizontal: 4 },
  right: { textAlign: "right" },
  box: { borderWidth: 0.75, borderColor: C.line, borderRadius: 6, padding: 10 },
});

// ---------------------------------------------------------------------------------------------------------------------
// Pieces

const SOURCE_TONE: Record<SourceType, { color: string; backgroundColor: string; borderColor?: string }> = {
  client_document: { color: C.doc, backgroundColor: C.docWeak },
  public_data: { color: C.public, backgroundColor: C.publicWeak },
  regulation: { color: C.rule, backgroundColor: C.ruleWeak },
  calculated: { color: C.muted, backgroundColor: C.subtle, borderColor: C.lineStrong },
  ai_estimate: { color: C.ai, backgroundColor: C.aiWeak },
  client_input: { color: C.doc, backgroundColor: C.white, borderColor: C.doc },
  valuer: { color: C.valuer, backgroundColor: C.valuerWeak },
};

const STATUS_TONE: Record<CallStatus, { color: string; backgroundColor: string; edge: string }> = {
  "changed by valuer": { color: C.valuer, backgroundColor: C.valuerWeak, edge: C.valuer },
  accepted: { color: C.public, backgroundColor: C.publicWeak, edge: C.public },
  "accepted at sign-off": { color: C.public, backgroundColor: C.publicWeak, edge: C.public },
  "accepted at sign-off without opening": { color: C.ai, backgroundColor: C.aiWeak, edge: C.aiStrong },
  open: { color: C.ai, backgroundColor: C.aiWeak, edge: C.aiStrong },
};

function SourceTag({ type, label }: { type: SourceType; label: string }) {
  const tone = SOURCE_TONE[type];
  return (
    <Text
      style={[
        s.pill,
        { color: tone.color, backgroundColor: tone.backgroundColor },
        tone.borderColor ? { borderWidth: 0.5, borderColor: tone.borderColor } : {},
      ]}
    >
      {label}
    </Text>
  );
}

/** The Censio mark of the app bar: a green tile with a "C" and a mint dot. */
function Mark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect x={0} y={0} width={28} height={28} rx={7} ry={7} fill={C.brand} />
      <Path d="M19.4 9.4a6.6 6.6 0 1 0 0 9.2" fill="none" stroke={C.white} strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={19.6} cy={14} r={1.9} fill={C.brandAccent} />
    </Svg>
  );
}

function Wordmark() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Mark />
      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: BOLD, color: C.ink }}>Censio</Text>
      <Text
        style={[s.pill, { marginLeft: 4, alignSelf: "center", color: C.brand, backgroundColor: C.brandWeak, fontSize: 7 }]}
      >
        RE
      </Text>
    </View>
  );
}

function SampleMark() {
  return (
    <Text
      style={[
        s.pill,
        { color: C.ink2, borderWidth: 0.75, borderColor: C.faint, borderStyle: "dashed", fontWeight: BOLD },
      ]}
    >
      Sample data
    </Text>
  );
}

function Watermark({ draft }: { draft: boolean }) {
  if (!draft) return null;
  return (
    <View fixed style={s.watermarkLayer}>
      <Text style={s.watermark}>DRAFT — NOT SIGNED</Text>
    </View>
  );
}

/** A section's numbered title; it moves to the next page rather than end one without the section's first lines. */
function SectionTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <View style={s.sectionTitleRow} minPresenceAhead={140} wrap={false}>
      <Text style={s.sectionNumber}>{n}</Text>
      <Text style={s.sectionTitle}>{children}</Text>
    </View>
  );
}

function Running({ m }: { m: ReportModel }) {
  return (
    <>
      <View fixed style={s.header}>
        <Text>
          <Text style={{ fontWeight: BOLD, color: C.brand }}>Censio RE</Text> · {m.cover.title} · {m.cover.address}
        </Text>
        <Text>
          {m.dealId} · v{m.version}
          {m.draft ? " · Draft — not signed" : ""}
        </Text>
      </View>
      <View fixed style={s.footer}>
        <Text>{m.disclaimer}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 1 · Cover

function Cover({ m, photo }: { m: ReportModel; photo: string | Blob | null }) {
  const c = m.cover;
  const facts: [string, string][] = [
    ["Client", c.client],
    ["Deal ID", c.dealId],
    ["Valuation date", c.valuationDate],
    ["Version", c.versionLabel],
    ["Basis", c.basis],
    ["Scope", c.scope],
  ];
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <SampleMark />
          <Text style={[s.small, { marginLeft: 6 }]}>Prototype</Text>
        </View>
      </View>

      {m.draft && (
        <View
          style={{
            marginTop: 14,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 6,
            backgroundColor: C.aiWeak,
            borderWidth: 0.75,
            borderColor: C.aiStrong,
          }}
        >
          <Text style={{ color: C.ai, fontWeight: BOLD }}>
            Draft — not signed.{" "}
            <Text style={{ fontWeight: 400 }}>
              A preview for the senior valuer; the client receives the report once it is signed.
            </Text>
          </Text>
        </View>
      )}

      <Text
        style={{ marginTop: m.draft ? 16 : 30, fontSize: 8, fontWeight: BOLD, color: C.brand, letterSpacing: 1.2 }}
      >
        {c.title.toUpperCase()}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 24, fontWeight: BOLD, lineHeight: 1.2 }}>{c.address}</Text>
      <Text style={{ marginTop: 4, color: C.ink2 }}>{c.facts.join(" · ")}</Text>
      <Text style={{ marginTop: 1, color: C.ink2 }}>{c.subtitle}</Text>

      {photo ? (
        // Cropped from the bottom: the sample illustration keeps its "Sample illustration" label at the top. A PDF image
        // has no alt text; the address above names the property.
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image
          src={photo}
          style={{
            marginTop: 14,
            width: "100%",
            height: m.draft ? 250 : 270,
            objectFit: "cover",
            objectPosition: "50% 0%",
            borderRadius: 6,
          }}
        />
      ) : null}

      <View
        style={{
          marginTop: 14,
          flexDirection: "row",
          borderRadius: 8,
          backgroundColor: C.brandWeak,
          padding: 14,
        }}
      >
        <View style={{ flexGrow: 1, flexBasis: 0 }}>
          <Text style={{ fontSize: 7.5, fontWeight: BOLD, color: C.brand, letterSpacing: 0.6 }}>
            MARKET VALUE AS OF {c.valuationDate.toUpperCase()}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 32, fontWeight: BOLD, color: C.ink, lineHeight: 1.15 }}>
            {c.valueText}
          </Text>
          <Text style={{ color: C.ink2 }}>{c.valueDetail}</Text>
        </View>
        <View style={{ width: 190, justifyContent: "center" }}>
          <Text style={{ fontSize: 7.5, fontWeight: BOLD, color: C.brand, letterSpacing: 0.6 }}>
            {m.draft ? "STATUS" : "SIGNED"}
          </Text>
          <Text style={{ marginTop: 2, fontWeight: BOLD, color: m.draft ? C.ai : C.ink }}>{c.signature}</Text>
          <Text style={{ marginTop: 2, color: C.ink2 }}>{c.versionLabel}</Text>
        </View>
      </View>

      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap" }}>
        {facts.map(([label, value]) => (
          <View
            key={label}
            style={{ width: "33.33%", paddingVertical: 4, paddingRight: 10, borderBottomWidth: 0.5, borderBottomColor: C.line }}
          >
            <Text style={s.small}>{label}</Text>
            <Text>{value}</Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 7.5, fontWeight: BOLD, color: C.muted, letterSpacing: 0.6 }}>CONTENTS</Text>
        <View style={{ marginTop: 3, flexDirection: "row", flexWrap: "wrap" }}>
          {REPORT_SECTIONS.map((title, i) => (
            <Text key={title} style={{ width: "50%", paddingVertical: 1.5, color: C.ink2 }}>
              <Text style={{ fontWeight: BOLD, color: C.brand }}>{i + 2}</Text> {title}
            </Text>
          ))}
        </View>
      </View>

      <View style={{ position: "absolute", left: 48, right: 48, bottom: 28 }}>
        <Text style={[s.small, { textAlign: "center" }]}>{m.disclaimer}</Text>
      </View>
      {/* Last, so it is drawn over the photo and the value. */}
      <Watermark draft={m.draft} />
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 2–4 · Summary, property and documents, units

function Summary({ m }: { m: ReportModel }) {
  return (
    <>
      <SectionTitle n={2}>Summary</SectionTitle>
      {m.summary.map((p, i) => (
        <Text key={i} style={s.paragraph}>
          {p}
        </Text>
      ))}
    </>
  );
}

function Property({ m }: { m: ReportModel }) {
  return (
    <>
      <SectionTitle n={3}>Property and documents</SectionTitle>
      <View style={s.table}>
        {m.property.facts.map((f) => (
          <View key={f.label} style={s.tr} wrap={false}>
            <Text style={[s.cell, { width: "28%", color: C.muted }]}>{f.label}</Text>
            <Text style={[s.cell, { width: "72%" }]}>{f.value}</Text>
          </View>
        ))}
      </View>

      <Text style={{ marginTop: 10, marginBottom: 4, fontWeight: BOLD }} minPresenceAhead={40}>
        Documents the client provided
      </Text>
      <View style={s.table}>
        <View style={s.th} wrap={false}>
          <Text style={[s.cell, { width: "34%" }]}>Document</Text>
          <Text style={[s.cell, { width: "30%" }]}>What the AI read</Text>
          <Text style={[s.cell, { width: "36%" }]}>Effect on the value</Text>
        </View>
        {m.property.documents.map((d) => (
          <View key={d.id} style={s.tr} wrap={false}>
            <View style={[s.cell, { width: "34%" }]}>
              <Text style={s.bold}>{d.title}</Text>
              <Text style={[s.small, { fontSize: 7 }]}>
                {d.fileName} · {d.pages} {d.pages === 1 ? "page" : "pages"}
              </Text>
            </View>
            <Text style={[s.cell, { width: "30%" }]}>{d.read}</Text>
            <Text style={[s.cell, { width: "36%" }, d.effect === "no value effect" ? { color: C.muted } : {}]}>
              {d.effect}
            </Text>
          </View>
        ))}
      </View>
      {m.property.missing.length > 0 && (
        <View style={{ marginTop: 6 }}>
          {m.property.missing.map((line) => (
            <Text key={line} style={{ color: C.ai }}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </>
  );
}

const UNIT_COLUMNS: { key: keyof ReportUnitRow; label: string; width: string; right?: boolean }[] = [
  { key: "n", label: "#", width: "4%" },
  { key: "name", label: "Unit", width: "17%" },
  { key: "floor", label: "Floor", width: "7%" },
  { key: "area", label: "m²", width: "6%", right: true },
  { key: "rooms", label: "Rooms", width: "7%", right: true },
  { key: "inPlacePerM2", label: "In-place €/m²", width: "8.5%", right: true },
  { key: "inPlacePerMonth", label: "In-place €/mo", width: "9%", right: true },
  { key: "marketPerM2", label: "Market €/m²", width: "8.5%", right: true },
  { key: "marketPerMonth", label: "Market €/mo", width: "9%", right: true },
  { key: "gap", label: "Gap", width: "7%", right: true },
  { key: "leaseSince", label: "Lease since", width: "7%", right: true },
  { key: "valueText", label: "Value share", width: "10%", right: true },
];

function Units({ m }: { m: ReportModel }) {
  const t = m.units.total;
  const totals: Partial<Record<keyof ReportUnitRow, string>> = {
    name: "Total",
    area: t.area,
    inPlacePerM2: t.inPlacePerM2,
    inPlacePerMonth: t.inPlacePerMonth,
    marketPerM2: t.marketPerM2,
    marketPerMonth: t.marketPerMonth,
    gap: t.gap,
    valueText: t.valueText,
  };
  return (
    <>
      <SectionTitle n={4}>Units</SectionTitle>
      <View style={[s.table, { fontSize: 7.5 }]}>
        <View style={s.th} wrap={false}>
          {UNIT_COLUMNS.map((col) => (
            <Text key={col.key} style={[s.cell, { width: col.width }, col.right ? s.right : {}]}>
              {col.label}
            </Text>
          ))}
        </View>
        {m.units.rows.map((row) => (
          <View key={row.n} style={s.tr} wrap={false}>
            {UNIT_COLUMNS.map((col) =>
              col.key === "name" ? (
                <View key={col.key} style={[s.cell, { width: col.width }]}>
                  <Text style={s.bold}>{row.name}</Text>
                  {row.notes.length > 0 && <Text style={[s.small, { fontSize: 6.5 }]}>{row.notes.join(" · ")}</Text>}
                </View>
              ) : (
                <Text
                  key={col.key}
                  style={[
                    s.cell,
                    { width: col.width },
                    col.right ? s.right : {},
                    col.key === "marketPerM2" && row.valuerRent ? { color: C.valuer, fontWeight: BOLD } : {},
                  ]}
                >
                  {String(row[col.key])}
                </Text>
              ),
            )}
          </View>
        ))}
        <View style={[s.tr, { borderTopWidth: 0.75, borderTopColor: C.ink2, fontWeight: BOLD }]} wrap={false}>
          {UNIT_COLUMNS.map((col) => (
            <Text key={col.key} style={[s.cell, { width: col.width }, col.right ? s.right : {}]}>
              {totals[col.key] ?? ""}
            </Text>
          ))}
        </View>
      </View>
      <Text style={[s.small, { marginTop: 5 }]}>
        Rents are net cold rents (Nettokaltmiete). Market rents are the AI&apos;s per-unit estimates unless marked as set by the
        valuer. {m.units.note}
      </Text>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 5 · Calculation

function CalcRow({ row }: { row: ReportCalcRow }) {
  const total = row.emphasis === "total";
  const subtotal = row.emphasis === "subtotal";
  return (
    <View
      style={[
        s.tr,
        total ? { borderTopWidth: 1, borderTopColor: C.ink, borderBottomWidth: 1, borderBottomColor: C.ink, backgroundColor: C.brandWeak } : {},
        subtotal ? { backgroundColor: C.subtle } : {},
      ]}
      wrap={false}
    >
      <View style={[s.cell, { width: "26%" }]}>
        <Text style={total || subtotal ? s.bold : {}}>{row.label}</Text>
        {row.term && <Text style={[s.small, s.italic]}>{row.term}</Text>}
      </View>
      <Text style={[s.cell, { width: "41%", color: C.ink2, fontSize: 8 }]}>{row.formula}</Text>
      <View style={[s.cell, { width: "17%" }]}>
        <SourceTag type={row.sourceType} label={row.source} />
      </View>
      <Text style={[s.cell, s.right, { width: "16%" }, total ? { fontWeight: BOLD, fontSize: 11 } : subtotal ? s.bold : {}]}>
        {row.amount}
      </Text>
    </View>
  );
}

function Calculation({ m }: { m: ReportModel }) {
  return (
    <>
      <SectionTitle n={5}>Calculation</SectionTitle>
      <Text style={[s.paragraph, { color: C.ink2 }]}>
        Income approach (Ertragswert), general method of § 28 ImmoWertV. Amounts per year in euro; each line names the
        source of its input.
      </Text>
      <View style={s.table}>
        <View style={s.th} wrap={false}>
          <Text style={[s.cell, { width: "26%" }]}>Item</Text>
          <Text style={[s.cell, { width: "41%" }]}>How it follows</Text>
          <Text style={[s.cell, { width: "17%" }]}>Source</Text>
          <Text style={[s.cell, s.right, { width: "16%" }]}>Amount</Text>
        </View>
        {m.calculation.map((row) => (
          <CalcRow key={row.key} row={row} />
        ))}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 6 · Assumptions and AI judgement calls

function Call({ call }: { call: ReportCall }) {
  const tone = STATUS_TONE[call.status];
  const line = (label: string, text: string) => (
    <Text style={{ marginTop: 2 }}>
      <Text style={{ fontWeight: BOLD, color: C.ink2 }}>{label} </Text>
      {text}
    </Text>
  );
  return (
    <View
      wrap={false}
      style={{
        marginBottom: 8,
        padding: 9,
        paddingLeft: 11,
        borderWidth: 0.75,
        borderColor: C.line,
        borderLeftWidth: 3,
        borderLeftColor: tone.edge,
        borderRadius: 4,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Text style={{ flexGrow: 1, flexBasis: 0, paddingRight: 8, fontSize: 10, fontWeight: BOLD }}>
          {call.n} · {call.title}
        </Text>
        <Text style={[s.pill, { color: tone.color, backgroundColor: tone.backgroundColor }]}>{call.status}</Text>
      </View>
      <Text style={[s.small, { marginTop: 1 }]}>AI · {call.confidence} confidence</Text>
      <Text style={{ marginTop: 3 }}>{call.summary}</Text>
      {line("Why flagged:", call.whyFlagged)}
      {call.changeMind && line("What would change the AI's mind:", call.changeMind)}
      {call.support && line("Support:", call.support)}
      {call.effect && line("Value effect over the plausible range:", call.effect)}
      <Text style={{ marginTop: 3, color: tone.color, fontWeight: BOLD }}>{call.statusDetail}</Text>
      {call.notes.map((note) => (
        <Text key={note} style={[s.italic, { marginTop: 1, color: C.valuer }]}>
          Valuer&apos;s note: “{note}”
        </Text>
      ))}
    </View>
  );
}

function Calls({ m }: { m: ReportModel }) {
  return (
    <>
      <SectionTitle n={6}>Assumptions and AI judgement calls</SectionTitle>
      <Text style={{ fontWeight: BOLD, marginBottom: 3 }}>Assumptions</Text>
      {m.assumptions.map((a) => (
        <View key={a} style={{ flexDirection: "row", marginBottom: 2 }} wrap={false}>
          <Text style={{ width: 10, color: C.brand }}>•</Text>
          <Text style={{ flexGrow: 1, flexBasis: 0 }}>{a}</Text>
        </View>
      ))}
      <Text style={{ marginTop: 10, marginBottom: 2, fontWeight: BOLD }} minPresenceAhead={80}>
        AI judgement calls ({m.calls.length})
      </Text>
      <Text style={[s.paragraph, { color: C.ink2 }]}>
        The AI flags each call it could not settle from the documents alone. Each one shows its status at sign-off:
        accepted, changed by valuer (with the note), or accepted at sign-off without opening.
      </Text>
      {m.calls.length === 0 && <Text style={s.muted}>The AI raised no judgement call.</Text>}
      {m.calls.map((call) => (
        <Call key={call.id} call={call} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 7 · Sources

function SourceDocument({ doc }: { doc: ReportSourceDocument }) {
  return (
    <View style={{ marginBottom: 8 }} wrap={false}>
      <Text>
        <Text style={s.bold}>{doc.title}</Text>
        <Text style={s.muted}>
          {" "}
          · {doc.fileName} · {doc.pages} {doc.pages === 1 ? "page" : "pages"} · {doc.effect}
        </Text>
      </Text>
      {doc.citations.length === 0 && <Text style={[s.small, { marginTop: 1 }]}>No passage cited.</Text>}
      {doc.citations.map((c, i) => (
        <View key={`${c.what}-${i}`} style={{ flexDirection: "row", marginTop: 2 }}>
          <Text style={{ width: "32%", paddingRight: 6, color: C.ink2 }}>
            p. {c.page} · {c.what}
          </Text>
          <View style={{ width: "68%" }}>
            <Text style={s.italic}>„{c.quote}“</Text>
            {c.translation && <Text style={s.small}>{c.translation}</Text>}
            {!c.verified && <Text style={[s.small, { color: C.ai }]}>Not found in the document&apos;s text layer</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

function Sources({ m }: { m: ReportModel }) {
  return (
    <>
      <SectionTitle n={7}>Sources</SectionTitle>
      <Text style={[s.paragraph, { color: C.ink2 }]}>
        Client documents with the page and the verbatim passage each figure was read from, then the source of every other
        figure.
      </Text>
      {m.sources.documents.map((doc) => (
        <SourceDocument key={doc.id} doc={doc} />
      ))}
      <Text style={{ marginTop: 6, marginBottom: 4, fontWeight: BOLD }} minPresenceAhead={40}>
        Figures and their sources
      </Text>
      <View style={[s.table, { fontSize: 8 }]}>
        <View style={s.th} wrap={false}>
          <Text style={[s.cell, { width: "22%" }]}>Figure</Text>
          <Text style={[s.cell, { width: "15%" }]}>Value</Text>
          <Text style={[s.cell, { width: "17%" }]}>Source</Text>
          <Text style={[s.cell, { width: "46%" }]}>Where it comes from</Text>
        </View>
        {m.sources.data.map((row) => (
          <View key={row.label} style={s.tr} wrap={false}>
            <Text style={[s.cell, { width: "22%" }]}>{row.label}</Text>
            <Text style={[s.cell, { width: "15%" }]}>{row.value}</Text>
            <View style={[s.cell, { width: "17%" }]}>
              <SourceTag type={row.sourceType} label={row.source} />
            </View>
            <Text style={[s.cell, { width: "46%", color: C.ink2 }]}>{row.detail}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 8 · Review log, 9 · Disclaimer

function ReviewLog({ m }: { m: ReportModel }) {
  return (
    <>
      <SectionTitle n={8}>Review log</SectionTitle>
      <Text style={[s.paragraph, { color: C.ink2 }]}>
        Every version of the valuation, including undone ones. Times are UTC.
      </Text>
      {m.reviewLog.map((row) => (
        <View
          key={row.n}
          wrap={false}
          style={{
            flexDirection: "row",
            paddingVertical: 5,
            borderBottomWidth: 0.5,
            borderBottomColor: C.line,
            opacity: row.undone ? 0.6 : 1,
          }}
        >
          <View style={{ width: "74%", paddingRight: 8 }}>
            <Text style={[s.bold, row.current ? { color: C.brand } : {}]}>
              {row.label}
              {row.current ? "  · in this report" : ""}
            </Text>
            <Text style={s.small}>
              {row.at} · {row.who}
              {row.readBy ? ` · ${row.readBy}` : ""}
            </Text>
            {row.changes.map((change) => (
              <Text key={change} style={{ marginTop: 1 }}>
                {change}
              </Text>
            ))}
            {row.detail && (
              <Text style={[s.small, { marginTop: 1 }]}>{row.n === 1 ? row.detail : `AI note: ${row.detail}`}</Text>
            )}
          </View>
          <Text
            style={[
              s.right,
              { width: "26%", fontWeight: BOLD },
              row.undone ? { textDecoration: "line-through", color: C.muted } : {},
            ]}
          >
            {row.valueText}
          </Text>
        </View>
      ))}
      {m.signOff ? (
        <View style={[s.box, { marginTop: 8, borderColor: C.public, backgroundColor: C.publicWeak }]} wrap={false}>
          <Text style={s.bold}>
            Signed by {m.signOff.signer}, {m.signOff.role.toLowerCase()} · version {m.signOff.version} · {m.signOff.at}
          </Text>
          {m.signOff.acceptedWithoutOpening.length > 0 ? (
            <Text style={{ marginTop: 2 }}>
              Calls accepted at sign-off without opening: {m.signOff.acceptedWithoutOpening.join("; ")}.
            </Text>
          ) : (
            <Text style={{ marginTop: 2 }}>Every judgement call was reviewed before signing.</Text>
          )}
        </View>
      ) : (
        <View style={[s.box, { marginTop: 8, borderColor: C.aiStrong, backgroundColor: C.aiWeak }]} wrap={false}>
          <Text style={[s.bold, { color: C.ai }]}>Draft — not signed</Text>
          <Text style={{ marginTop: 2 }}>The senior valuer has not signed this version yet.</Text>
        </View>
      )}
    </>
  );
}

function Disclaimer({ m }: { m: ReportModel }) {
  return (
    <View wrap={false}>
      <SectionTitle n={9}>Disclaimer</SectionTitle>
      <View style={[s.box, { backgroundColor: C.subtle }]}>
        <Text style={{ fontSize: 11, fontWeight: BOLD }}>{m.disclaimer}</Text>
        <Text style={{ marginTop: 4, color: C.ink2 }}>
          Censio RE is a clickable prototype. The deal, the client, the documents, the photos and the lookup tables are
          fictitious sample data, and the senior valuer is a demo persona. Nobody should rely on this document.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The document

export type ReportDocumentProps = {
  model: ReportModel;
  /** The building's photo for the cover: a URL or the stored file; none leaves the cover without a photo. */
  photo?: string | Blob | null;
};

export function ReportDocument({ model, photo = null }: ReportDocumentProps) {
  const m = toWinAnsiDeep(model);
  return (
    <Document
      title={`${model.cover.title} — ${model.cover.address}`}
      author="Censio RE"
      subject={`${model.dealId} · v${model.version}${model.draft ? " · draft, not signed" : ""}`}
      creator="Censio RE prototype"
      producer="Censio RE prototype"
      language="en"
    >
      <Cover m={m} photo={photo} />
      <Page size="A4" style={s.page}>
        <Running m={m} />
        <View style={s.content}>
          <Summary m={m} />
          <Property m={m} />
          <Units m={m} />
          <Calculation m={m} />
          <Calls m={m} />
          <Sources m={m} />
          <ReviewLog m={m} />
          <Disclaimer m={m} />
        </View>
        <Watermark draft={m.draft} />
      </Page>
    </Document>
  );
}

/** The report as a PDF file, for the download (`model.fileName`). */
export async function renderReportPdf(model: ReportModel, photo: string | Blob | null = null): Promise<Blob> {
  return pdf(<ReportDocument model={model} photo={photo} />).toBlob();
}
