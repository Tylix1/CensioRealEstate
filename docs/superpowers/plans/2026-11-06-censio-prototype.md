# Censio RE Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Censio RE clickable prototype. It is a Next.js web app with these parts:
- a client wizard with real AI extraction of uploaded property PDFs;
- a deterministic Ertragswert valuation;
- the senior-valuer review screen (direction A v2);
- a Revalue loop driven by live Claude, with a rule-based fallback;
- approval and a downloadable PDF report.

**Architecture:**
- **Pure TypeScript domain modules** in `src/lib/*`: valuation engine, rent estimator, lookups, flags, figure registry, revisions and pipeline. They hold all numbers and texts and are unit-tested against the spec's canonical values.
- **Two server routes** (`/api/extract`, `/api/revalue`) call Claude through the Anthropic TypeScript SDK. Without a key or access code they fall back to committed fixtures or the rule-based parser.
- **UI:** App Router pages read and write a persisted Zustand store; uploaded files live in IndexedDB.

**Tech Stack:**

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript), React 19 |
| Styling | Tailwind CSS 4 |
| State and storage | Zustand 5 (persist), idb-keyval 6 |
| AI | `@anthropic-ai/sdk` 1.x with zod 4 (`zodOutputFormat`) |
| PDF | `unpdf` (server text extraction), `react-pdf` 11 (viewer with text-layer highlight), `pdf-lib` (sample PDF generation), `@react-pdf/renderer` 4 (report) |
| Maps | Leaflet with react-leaflet 5 |
| Tests | Vitest 5 (unit), `@playwright/test` **1.63.0** (end-to-end) |

**Spec:** `docs/superpowers/specs/2026-11-06-censio-prototype-design.md` (v2.1; read §5 and §6 before any task). The UI reference is `docs/superpowers/specs/mockups/valuer-review-A2.dc.html`. The comparables data is `docs/superpowers/specs/data/comparables.json`.

## Global Constraints

**Language and labels**
- UI copy is English. German legal terms keep the German name plus a gloss, e.g. "Grundbuch (land register)".
- Every screen shows a "Sample data" pill.
- Sample PDFs carry the watermark "MUSTER / SAMPLE".

**Number formats**
- Currency is euro with thousands separators: `€1,300,000`, `€12,374`.
- Rents are shown as `9.60 €/m²`.
- Percentages use a space before the sign: `3.0 %`.

**Rounding**
- Market value: nearest €10,000.
- €/m² value: nearest integer.
- Gross multiplier: 1 decimal place.
- Unit value shares: nearest €100, with the remainder assigned to the unit with the largest share.
- Rent estimates use `round2(x) = Math.round(x * 100 + 1e-7) / 100` (half-up).

**Constants**

| Constant | Value |
|---|---|
| ImmoWertV Annex 3 sample: management per unit | €367 |
| ImmoWertV Annex 3 sample: maintenance per m² | €14.40 |
| ImmoWertV Annex 3 sample: rent-loss rate | 0.02 |
| Total economic life | 80 years |
| Vacancy re-letting deduction | 6 months of market rent |
| Easement maximum impact | 5 % of land value |
| Comparables index adjustment | +2.5 % per year, applied only when `monthsAgo > 12` |

**Model and AI calls**
- Model `claude-opus-5-5`.
- Extraction: `output_config.effort: "low"`. Revalue: `"medium"`.
- Use structured outputs via `client.messages.parse` with `zodOutputFormat`. Never use the Citations API, and never send `budget_tokens`, `temperature` or a `thinking: {type:"disabled"}` setting.
- Always check `stop_reason === "refusal"` before reading `parsed_output`.

**Limits and environment**
- Access code environment variable: `DEMO_ACCESS_CODE`; the API key is `ANTHROPIC_API_KEY`. Live AI only runs if both are set and the request carries the matching code.
- Limits:

  | Limit | Value |
  |---|---|
  | Per IP | 3 extractions-batches and 15 notes per rolling hour (in-memory) |
  | File size | 5 MB per PDF |
  | Pages | 10 pages per PDF |
  | Files | 8 files per deal |
  | Note length | 1,000 characters |

**Sample world**

| Item | Value |
|---|---|
| Deal ID | `CEN-2026-0147` |
| Client | `Demo Capital GmbH` (buy-side) |
| Address | `Musterstraße 12, 04109 Leipzig` |
| Map pin | lat 51.3352, lng 12.3747 |
| Valuation date | `2026-11-06` |
| Valuer | `K. Vogel`, initials `KV` |

**Visual tokens** (copy from the mockup)

| Token | Value |
|---|---|
| Page background | `#F2F4F7` |
| Surface | `#FFFFFF` |
| Border | `#E4E7EC` |
| Ink | `#101828` |
| Ink-2 | `#475467` |
| Muted | `#5B6576` |
| Brand | `#0B5D4B` |
| Brand weak | `#E6F2EE` |
| Client document | `#1849A9` on `#EAF1FF` |
| Public data | `#0E6F67` on `#E3F5F2` |
| Regulation | `#475467` on `#EEF0F3` |
| AI | `#A3410A` on `#FFF4E5`; hatch `repeating-linear-gradient(135deg,#F79009 0 3px,#FEDF89 3px 6px)` |
| Valuer | `#5B3CC4` on `#F1EDFF` |
| Fonts | Inter (body), Space Grotesk (headings and figures) |

**Accessibility:** every interactive element is a real `<button>`, `<a>` or `<input>` with a label; touch targets are ≥ 44 px; source markers always combine glyph, colour and text.

**Commits:** each task ends with one commit on `claude/beautiful-franklin-vnn3gb`. Messages are imperative English, with no model names.

## Review Focus

1. **Arbitrary text in the Revalue note in Demo mode.** Example: "the attic looks overpriced, use 9,50". Expected: the parser recognises German decimal commas and unit names. If it cannot, it returns `intent: "unclear"` with a clarifying question and creates no version. Test: Task 11.
2. **A PDF that is not one of the five sample documents, uploaded without Live AI.** Expected: that file shows "Live AI is needed to read this document", the wizard continues, and the missing document types become flags. Test: Task 10 (route) and Task 15 (e2e).
3. **Editing a unit's area or rent, or adding a vacant unit by hand, in the wizard.** Expected: the valuation, flags, texts and unit shares recompute consistently. A vacant unit produces a vacancy deduction and a vacancy flag. Test: Task 12.
4. **Reloading the browser mid-flow, or clicking Reset demo.** Expected: the state survives a reload. Reset restores the seeded state, in which `CEN-2026-0147` is ready in the valuer queue, and clears IndexedDB. Test: Task 13.
5. **Undo after two revisions.** Expected: undo marks only the last revision as undone; the value returns to the previous version; the review log keeps every version. Test: Task 8.

---

## File Structure

```
package.json, next.config.ts, tsconfig.json, postcss.config.mjs, vitest.config.ts, playwright.config.ts, .env.example, README.md
src/app/layout.tsx                         fonts, globals, <DemoBar/>, <OrientationOverlay/>
src/app/globals.css                        Tailwind 4 + @theme tokens
src/app/page.tsx                           C1 sign-in
src/app/client/page.tsx                    C2 dashboard
src/app/client/new/page.tsx                C3 wizard (steps C3.1–C3.4)
src/app/client/deals/[id]/processing/page.tsx   C4 AI at work
src/app/client/deals/[id]/report/page.tsx  C5 report delivered
src/app/valuer/page.tsx                    V1 queue
src/app/valuer/deals/[id]/page.tsx         V2 review (+V3 revisions, V4 approve)
src/app/how-it-works/page.tsx              P1
src/app/api/extract/route.ts               POST PDF → extraction
src/app/api/revalue/route.ts               POST note → changes
src/app/api/mode/route.ts                  GET → live/demo status
src/lib/format.ts                          eur(), pct(), rentM2(), round2()
src/lib/deal/types.ts                      domain types (Task 2)
src/lib/deal/fromExtraction.ts             ExtractionResult[] → Deal
src/lib/deal/crossChecks.ts                6 cross-checks
src/lib/data/comparables.json              copy of spec data file
src/lib/data/seed.ts                       seeded state (queue rows, delivered report row)
src/lib/valuation/engine.ts                computeValuation, presentValueFactor, remainingLife
src/lib/valuation/sensitivity.ts           computeSensitivities
src/lib/rent/estimator.ts                  adjustedRent, locationBase, estimateUnitRent, estimateBuilding
src/lib/lookups/{boris,marketReport,plausibility,costs}.ts
src/lib/flags/rules.ts                     buildFlags
src/lib/registry/registry.ts               buildRegistry, countBySource, dependentsOf
src/lib/revisions/history.ts               versions, applyChanges, diffResults, undo
src/lib/extraction/{schemas,prompt,points,validate,cache}.ts
src/lib/revalue/{schema,prompt,parser,validate}.ts
src/lib/server/{anthropic,limits,pdfText}.ts
src/lib/pipeline/run.ts                    runPipeline (deterministic)
src/lib/store/{demoStore,files}.ts         Zustand persist + IndexedDB
src/components/ui/*                        Button, Pill, SourceBadge, SwingBar, DotStrip, Card
src/components/demo/{DemoBar,OrientationOverlay}.tsx
src/components/pdf/PdfViewer.tsx           react-pdf with highlighted quote
src/components/map/{DealMap,ComparablesMap}.tsx
src/components/client/*                    wizard steps, RunLog
src/components/valuer/*                    QueueRail, DealHeader, VerdictBand, ValuePath, UnitsTable, NeedsYourEye, EvidencePane, Ledger, RevisionBanner, ApproveSheet
src/components/report/ReportDocument.tsx   @react-pdf/renderer document
scripts/generate-samples.ts                5 sample PDFs + 3 photos + extraction fixtures
scripts/record-extraction.ts               live run over the samples → fixtures
public/sample/*                            generated sample files
fixtures/extraction/<sha256>.json          cached extraction results
tests/unit/*.test.ts                       Vitest
tests/e2e/*.spec.ts                        Playwright
```

---

### Task 1: Scaffold the app

**Files:**
- Create: all root config files, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, stub pages for every route above (an `<h1>` with the screen name), `src/lib/format.ts`, `tests/unit/format.test.ts`, `tests/e2e/smoke.spec.ts`, `.env.example`.

**Interfaces:**
- Produces:
  - `eur(n: number, opts?: {decimals?: 0|2; sign?: boolean}): string` — `eur(1300000)` returns `"€1,300,000"`, `eur(-21086.8, {sign:true})` returns `"−€21,087"` (U+2212 minus sign).
  - `pct(r: number, decimals = 1): string` — `pct(0.03)` returns `"3.0 %"`.
  - `rentM2(n: number): string` — `rentM2(9.6)` returns `"9.60 €/m²"`.
  - `round2(x: number): number`.
  - `kEur(n: number, sign?: boolean): string` — `kEur(-111365.56, true)` returns `"−€111k"`.
- Scripts: `dev`, `build`, `start`, `test` (`vitest run`), `e2e` (`playwright test`), `generate:samples` (`tsx scripts/generate-samples.ts`), `record:extraction`.

- [ ] **Step 1:** Scaffold Next.js 16 (TypeScript, Tailwind 4, ESLint, App Router, `src/`, alias `@/*`) into the repo root, keeping `docs/` and `.claude/`.
- [ ] **Step 2:** Install the dependencies.
  - Runtime: `@anthropic-ai/sdk zod zustand idb-keyval unpdf react-pdf pdf-lib @react-pdf/renderer leaflet react-leaflet`.
  - Dev: `vitest @vitejs/plugin-react tsx @types/leaflet @playwright/test@1.63.0`.
- [ ] **Step 3: Write the failing test** `tests/unit/format.test.ts`. Assert `eur(1300000)==="€1,300,000"`, `eur(12373.76)==="€12,374"`, `eur(-21086.8,{sign:true})==="−€21,087"`, `pct(0.034)==="3.4 %"`, `rentM2(9.605)` equals `"9.61 €/m²"` via `round2`, and `kEur(127765,true)==="+€128k"`.
- [ ] **Step 4:** Run `npm test`. Expected: FAIL (module missing).
- [ ] **Step 5:** Implement `src/lib/format.ts`, `vitest.config.ts` (alias `@`→`src`, environment node), the `@theme` tokens in `globals.css` (Global Constraints colours and fonts via `next/font/google`), and the layout and stub pages.
- [ ] **Step 6:** Run `npm test`, then `npm run build`. Expected: tests PASS; the build succeeds.
- [ ] **Step 7:** Write `playwright.config.ts`: `webServer` runs `npm run build && npm run start -- -p 3100`; `baseURL` is `http://localhost:3100`; chromium only. Write `tests/e2e/smoke.spec.ts`, which visits `/` and expects the text `Censio`. Run `npm run e2e`. Expected: PASS.
- [ ] **Step 8:** Commit: "Scaffold Next.js app with tokens, format helpers and test setup".

### Task 2: Domain types, lookups and seed constants

**Files:**
- Create: `src/lib/deal/types.ts`, `src/lib/lookups/boris.ts`, `src/lib/lookups/marketReport.ts`, `src/lib/lookups/plausibility.ts`, `src/lib/lookups/costs.ts`, `src/lib/data/comparables.json` (exact copy of the spec data file), `tests/unit/lookups.test.ts`.

**Interfaces (Produces):**

```ts
// src/lib/deal/types.ts
export type FloorCode = 'GF'|'1F'|'2F'|'3F'|'4F'|'attic';
export type Feature = 'balcony'|'roof_terrace'|'renovated_bath'|'street'|'courtyard';
export type Confidence = 'high'|'medium'|'low';
export type DocumentType = 'tenant_list'|'land_register'|'condo_land_register'|'energy_certificate'|'refurbishment_sheet'|'zoning_plan'|'unknown';
export interface Quote { documentId: string; page: number; quote: string; confidence: Confidence; verified: boolean }
export type EditableUnitField = 'areaM2'|'rooms'|'inPlaceRentPerM2'|'leaseSinceYear'|'features'|'floor';
export interface Unit { id: string; label: string; floor: FloorCode; areaM2: number; rooms: number;
  inPlaceRentPerM2: number|null /* null = vacant */; leaseSinceYear: number|null; features: Feature[];
  photoIds: string[]; origin: 'extracted'|'manual'; clientEdited: EditableUnitField[]; source: Quote|null }
export interface Easement { id: string; text: string; translation: string; source: Quote }
export type MeasureCategory = 'roof'|'windows'|'pipes'|'heating'|'exterior_walls'|'bathrooms'|'interior'|'floor_plan';
export interface RefurbMeasure { name: string; category: MeasureCategory; extent: 'full'|'partial'; year: number; points: number; source: Quote }
export interface PropertyFacts { builtYear: number|null; builtYearSource: Quote|null; plotM2: number|null; plotSource: Quote|null;
  parcel: string|null; landRegisterKind: 'Grundbuch'|'Wohnungsgrundbuch'|null; addressOnLandRegister: string|null;
  addressOnEnergyCert: string|null; livingAreaM2FromEnergyCert: number|null; heatingYear: number|null;
  heatingYearFromRefurb: number|null; energyClass: string|null; energyDemandKwh: number|null; energyCarrier: string|null;
  easements: Easement[]; landChargesCount: number; zoning: { areaType: string; residentialAllowed: boolean; source: Quote }|null;
  refurbishments: RefurbMeasure[]; modernisationPoints: number; tenantListTotalRentPerMonth: number|null;
  tenantListTotalAreaM2: number|null; tenantListTotalSource: Quote|null }
export interface DealDocument { id: string; fileName: string; sha256: string; pages: number; type: DocumentType;
  status: 'pending'|'reading'|'done'|'failed'; extractionSource: 'live'|'cache'|'demo-fixture'|null;
  durationMs: number|null; findings: string[]; uncertainFields: string[]; error: string|null }
export interface RunLogEntry { step: number; label: string; kind: 'live_ai'|'cache'|'demo'|'lookup'|'estimator'|'rules'|'engine'; result: string; durationMs: number }
export interface Deal { id: string; clientName: string; clientSide: 'buy-side';
  address: { street: string; zip: string; city: string; lat: number; lng: number };
  usageType: 'living'|'commercial'|'hotel'; scope: 'building'|'unit'; valuationDate: string; requestedAt: string;
  documents: DealDocument[]; photos: { id: string; fileName: string; unitId: string|null }[];
  property: PropertyFacts; units: Unit[]; status: 'draft'|'processing'|'in_review'|'approved'; runLog: RunLogEntry[] }
```

```ts
// lookups
export interface LandValueLookup { zone: string; valuePerM2: number; asOf: string; confidence: Confidence; note: string|null }
export function lookupLandValue(zip: string): LandValueLookup   // '04109' → {zone:'0412', valuePerM2:520, asOf:'2026-01-01', confidence:'high', note:null}; other → {zone:'n/a', valuePerM2:400, …, confidence:'low', note:'No sample data for this address'}
export interface CapRateRow { key: 'efh'|'mfh_pre1949'|'mfh_post1949'|'mixed'; label: string; labelDe: string; range: [number, number]; median: number; n: number }
export const MARKET_REPORT_2026: CapRateRow[]   // spec §5.3.7 table, in that order; labelDe: 'Ein- und Zweifamilienhäuser', 'Mehrfamilienhäuser bis Baujahr 1948', 'Mehrfamilienhäuser ab Baujahr 1949', 'Wohn- und Geschäftshäuser'
export interface CapRateLookup { row: CapRateRow; districtValue: number|null; page: 47; table: 12; source: 'Market report 2026 (sample), valuation committee Leipzig' }
export function lookupCapRate(builtYear: number): CapRateLookup   // ≤1948 → mfh_pre1949, else mfh_post1949; districtValue always null
export const PLAUSIBILITY = { perM2: { range: [2050, 2520] as [number, number], label: '7 recent Censio valuations (pre-war MFH, Leipzig)' },
  grossMultiplier: { range: [17.5, 23.0] as [number, number], label: 'Market report 2026' } }
export const ANNEX3 = { managementPerUnit: 367, maintenancePerM2: 14.40, rentLossRate: 0.02, totalLifeYears: 80, vacancyMonths: 6 }
```

- [ ] **Step 1:** Write `tests/unit/lookups.test.ts` with these cases:
  - `lookupLandValue('04109').valuePerM2===520`;
  - `lookupLandValue('10115').confidence==='low'`;
  - `lookupCapRate(1912).row.median===0.03` and `.row.range` is `[0.025, 0.035]`;
  - `lookupCapRate(1960).row.key==='mfh_post1949'`;
  - the imported comparables JSON has length 38.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the files above. Rates are stored as fractions (0.03).
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 5:** Commit: "Add domain types, sample lookups and comparables data".

### Task 3: Valuation engine and sensitivities

**Files:** Create `src/lib/valuation/engine.ts`, `src/lib/valuation/sensitivity.ts`, `tests/unit/valuation.test.ts`.

**Interfaces:**
- Consumes: `ANNEX3` (Task 2).
- Produces:

```ts
export interface ValuationUnitInput { id: string; areaM2: number; inPlaceRentPerM2: number|null; marketRentPerM2: number }
export interface ValuationParams { capRate: number; remainingLifeYears: number; underRentYears: number; easementDeduction: number;
  marketRentFactor: number /* 1 = estimator */; marketRentOverrides: Record<string, number> /* unitId → €/m² */ }
export interface ValuationInput { units: ValuationUnitInput[]; plotM2: number; landValuePerM2: number; managementPerUnit: number;
  maintenancePerM2: number; rentLossRate: number; vacancyMonths: number; params: ValuationParams }
export interface UnitShare { unitId: string; marketRentPerM2: number; marketRentPerMonth: number; inPlaceRentPerMonth: number|null;
  gapPct: number|null; sharePct: number; value: number }
export interface ValuationResult { grossIncome: number; management: number; maintenance: number; rentLoss: number; operatingCosts: number;
  operatingCostRatio: number; netIncome: number; landValue: number; landInterest: number; buildingNetIncome: number; pvFactor: number;
  buildingValue: number; preliminaryValue: number; inPlaceIncome: number; underRentPerYear: number; underRentAnnuityFactor: number;
  underRentDeduction: number; easementDeduction: number; vacancyDeduction: number; marketValueExact: number; marketValue: number;
  valuePerM2: number; grossMultiplier: number; livingAreaM2: number; units: UnitShare[] }
export function presentValueFactor(rate: number, years: number): number          // (1 − (1+r)^−n)/r
export function remainingLife(builtYear: number, valuationYear: number, points: number, totalLife = 80): number
export function effectiveMarketRent(u: ValuationUnitInput, p: ValuationParams): number   // overrides[u.id] ?? round2(u.marketRentPerM2 × factor)
export function computeValuation(input: ValuationInput): ValuationResult
export interface SensitivityRanges { capRate: [number, number]; marketRentAvg: [number, number]; underRentYears: [number, number]; easementMax: number }
export interface Sensitivity { key: 'capRate'|'marketRent'|'underRentYears'|'easement';
  low: { input: number; delta: number }; high: { input: number; delta: number } }
export function computeSensitivities(input: ValuationInput, baseAvgRent: number, ranges: SensitivityRanges): Sensitivity[]
```

**Engine rules (spec §5.3.5):**
- **Gross income and running costs.**
  - Gross income = Σ effective market rent × area × 12, over all units including vacant ones.
  - Management = number of units × management per unit.
  - Maintenance = area × maintenance per m².
  - Rent loss = rent-loss rate × gross income.
- **Building value.**
  - Building net income = net income − land value × cap rate.
  - Building value = building net income × `presentValueFactor(capRate, remainingLife)`.
- **Under-rent deduction.**
  - It applies only over occupied units: (Σ market − Σ in-place per month) × 12 × `presentValueFactor(capRate, underRentYears)`. It is negative when the units are over-rented.
  - The vacancy deduction is Σ vacant market rent per month × vacancy months.
- **Market value.**
  - Exact market value = preliminary value − under-rent deduction − easement deduction − vacancy deduction.
  - Market value = `Math.round(exact/10000)*10000`.
- **`remainingLife`** = `min(totalLife, max(totalLife − age, Math.floor(10 + 2.5 × points)))`, where age = valuation year − built year.
- **Sensitivities** vary one input against the base input; delta = exact value − base exact value.
  - **Market rent:** sets `marketRentFactor = target / baseAvgRent`.
  - **Easement:** low = −easementMax with delta −easementMax; high = 0 with delta 0.

- [ ] **Step 1:** Write `tests/unit/valuation.test.ts`. The canonical input is the 8 units of spec §5.3.3: area, in-place, and market = 9.25, 9.17, 9.61, 9.64, 9.65, 9.72, 9.71, 9.92. Further inputs: plot 480, 520 €/m², ANNEX3, and the params `{capRate:0.03, remainingLifeYears:42, underRentYears:5, easementDeduction:0, marketRentFactor:1, marketRentOverrides:{}}`.

  **v1:** assert within 0.01:

  | Field | Value |
  |---|---|
  | `grossIncome` | 65088 |
  | `operatingCosts` | 12373.76 |
  | `netIncome` | 52714.24 |
  | `landInterest` | 7488 |
  | `buildingNetIncome` | 45226.24 |
  | `pvFactor` | 23.7014 (to 4 dp) |
  | `buildingValue` | 1071923.36 (within 1) |
  | `inPlaceIncome` | 60483.6 |
  | `underRentDeduction` | 21086.80 (within 1) |

  Also assert `marketValue===1300000`, `valuePerM2===2301`, `grossMultiplier===20.0`, and unit share values `[137500,149500,163500,173300,143400,158400,165200,209200]`.

  **v2** (`capRate:0.034`): `landInterest` 8486.40, `pvFactor` 22.1897, `buildingValue` 981404.65 (within 1), `underRentDeduction` 20848.12 (within 1), `marketValue===1210000`, and shares `[127900,139100,152200,161300,133500,147400,153800,194800]`.

  **Other cases:**
  - `remainingLife(1912,2026,13)===42`.
  - **Sensitivities** with ranges `{capRate:[0.025,0.035], marketRentAvg:[9.10,10.20], underRentYears:[3,8], easementMax:12480}`; deltas within 1:

    | Key | Low delta | High delta |
    |---|---|---|
    | capRate | +127765 | −111366 |
    | marketRent | −63215 | +75859 |
    | underRentYears | +8063 | −11235 |
    | easement | −12480 | 0 |

    (`low` = first range value.)
  - **Vacancy:** the canonical input with unit 8 vacant (`inPlaceRentPerM2:null`) gives `vacancyDeduction` = 872.96×6 = 5237.76. Its gap no longer counts toward the under-rent.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per the rules above.
- [ ] **Step 4:** Run `npm test -- valuation`. Expected: PASS.
- [ ] **Step 5:** Commit: "Add Ertragswert valuation engine with sensitivities".

### Task 4: Rent estimator

**Files:** Create `src/lib/rent/estimator.ts`, `tests/unit/rent.test.ts`.

**Interfaces:**
- Consumes: `Unit`, `FloorCode`, `Feature`, `Confidence` (Task 2), and `comparables.json`.
- Produces:

```ts
export interface Comparable { id: string; lat: number; lng: number; areaM2: number; floor: FloorCode; features: Feature[]; rentPerM2: number; monthsAgo: number }
export interface RentEstimate { unitId: string; rentPerM2: number; base: number; floorAdj: number; sizeAdj: number; featureAdj: number;
  comparableIds: string[]; confidence: Confidence }
export interface BuildingRentSummary { base: number; average: number; range: [number, number]; total: number; recentCount: number;
  olderCount: number; olderShare: number; units: RentEstimate[] }
export const FLOOR_ADJ: Record<FloorCode, number>     // GF −0.35, 1F 0, 2F 0.05, 3F 0.10, 4F 0.15, attic 0.20
export const FEATURE_ADJ: Record<Feature, number>     // balcony 0.10, roof_terrace 0.25, renovated_bath 0.05, street −0.05, courtyard 0
export function adjustedRent(c: Comparable): number
export function locationBase(comps: Comparable[]): number            // median of adjusted (mean of the two middle values for an even count)
export function estimateUnitRent(u: Pick<Unit,'id'|'floor'|'areaM2'|'features'>, comps: Comparable[], base?: number): RentEstimate
export function estimateBuilding(units: Pick<Unit,'id'|'floor'|'areaM2'|'features'>[], comps: Comparable[]): BuildingRentSummary
```

**Rules:** see spec §6.3.
- sizeAdj = −0.005 × (m² − 70).
- comparableIds = the comparables with |area − unit area| ≤ 15.
- confidence = ≥ 12 high, 6–11 medium, < 6 low.
- average = Σ(rent × area) / Σ area.
- range = `[round2(avg − (base − p10)), round2(avg + (p90 − base))]`, where p10 is the 4th smallest and p90 the 35th smallest adjusted rent (sorted ascending, nearest-rank on 38).

- [ ] **Step 1:** Write `tests/unit/rent.test.ts`. The units are the 8 of spec §5.3.3, with floors GF, GF, 1F, 1F, 2F, 2F, 3F, attic and features:

  | Unit | Features |
  |---|---|
  | u1 | courtyard |
  | u2 | street |
  | u3 | renovated_bath |
  | u4 | balcony |
  | u5 | courtyard |
  | u6 | balcony |
  | u7 | renovated_bath |
  | u8 | roof_terrace |

  Assert:
  - `locationBase(comps)===9.56`;
  - estimates `[9.25,9.17,9.61,9.64,9.65,9.72,9.71,9.92]`;
  - comparable counts `[9,10,11,12,9,10,11,6]`;
  - confidences: medium for all except u4, which is high;
  - `average` 9.60 (within 1e-9), `range` `[9.10,10.20]`;
  - `recentCount===23`, `olderCount===15`.
  - A manual unit `{id:'m1',floor:'2F',areaM2:55,features:['balcony']}` gives 9.56 + 0.05 + 0.075 + 0.10 = **9.79**.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: "Add comparables-based rent estimator".

### Task 5: Extraction schemas, points rules and the deal mapping

**Files:** Create `src/lib/extraction/schemas.ts`, `src/lib/extraction/points.ts`, `src/lib/deal/fromExtraction.ts`, `src/lib/deal/crossChecks.ts`, `tests/unit/fromExtraction.test.ts`, `tests/unit/fixtures/sampleExtractions.ts` (hand-written results for the 5 sample documents, equal to spec §5.3.2).

**Interfaces:**
- Consumes: Task 2 types.
- Produces:

```ts
// schemas.ts (zod 4). Cited field helper:
export const cited = <T extends z.ZodTypeAny>(v: T) => z.object({ value: v, page: z.number().int(), quote: z.string(), confidence: z.enum(['high','medium','low']) })
export const ExtractionResultSchema = z.object({
  documentType: z.enum(['tenant_list','land_register','condo_land_register','energy_certificate','refurbishment_sheet','zoning_plan','unknown']),
  summary: z.string(),   // one English line, e.g. "Land register · plot 480 m² · 1 easement in section II"
  tenantList: z.object({ units: z.array(z.object({ label: cited(z.string()), floor: cited(z.enum(['GF','1F','2F','3F','4F','attic'])),
      areaM2: cited(z.number()), rooms: cited(z.number()), rentPerMonth: cited(z.number()).nullable(), leaseSinceYear: cited(z.number().int()).nullable(),
      features: z.array(z.enum(['balcony','roof_terrace','renovated_bath','street','courtyard'])), vacant: z.boolean() })),
    totalAreaM2: cited(z.number()), totalRentPerMonth: cited(z.number()), address: cited(z.string()) }).nullable(),
  landRegister: z.object({ kind: z.enum(['Grundbuch','Wohnungsgrundbuch']), parcel: cited(z.string()), plotM2: cited(z.number()),
    address: cited(z.string()), easements: z.array(z.object({ text: cited(z.string()), translationEn: z.string() })), landChargesCount: z.number().int() }).nullable(),
  energyCertificate: z.object({ address: cited(z.string()), builtYear: cited(z.number().int()), heatingYear: cited(z.number().int()),
    energyCarrier: cited(z.string()), energyClass: cited(z.string()), demandKwh: cited(z.number()), livingAreaM2: cited(z.number()) }).nullable(),
  refurbishmentSheet: z.object({ measures: z.array(z.object({ name: cited(z.string()), year: cited(z.number().int()),
    category: z.enum(['roof','windows','pipes','heating','exterior_walls','bathrooms','interior','floor_plan']), extent: z.enum(['full','partial']) })) }).nullable(),
  zoningPlan: z.object({ areaType: cited(z.string()), residentialAllowed: cited(z.boolean()) }).nullable(),
})
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>
// points.ts — Annex 2 maximum points: roof 4, windows 2, pipes 2, heating 2, exterior_walls 4, bathrooms 2, interior 2, floor_plan 2; partial = floor(max/2)
export function measurePoints(category: MeasureCategory, extent: 'full'|'partial'): number
// fromExtraction.ts
export interface DealSkeleton { id: string; clientName: string; address: Deal['address']; usageType: Deal['usageType']; scope: Deal['scope']; valuationDate: string; requestedAt: string }
export function dealFromExtractions(skel: DealSkeleton, docs: { doc: DealDocument; result: ExtractionResult; verified: Record<string, boolean> }[]): Deal
// crossChecks.ts
export interface CrossCheck { id: 'rent_total'|'living_area'|'heating_year'|'address'|'zoning'|'over_rent'; label: string; passed: boolean; detail: string }
export function runCrossChecks(deal: Deal, marketRentByUnit: Record<string, number>): CrossCheck[]
```

**Mapping rules.**
- Unit ids are `u1…un` in tenant-list order.
- `inPlaceRentPerM2 = round2(rentPerMonth/area)`; a vacant unit gets `null`.
- `source` is the label's citation.
- `verified` comes from the map keyed by field path, e.g. `"tenantList.units.0.areaM2"`; it defaults to true.
- `modernisationPoints` = Σ `measurePoints`.
- A field with confidence `low` or `verified=false` is added to that document's `uncertainFields`.

**Cross-check labels** (exact):
- "Rent total equals the sum of the unit rows"
- "Living area matches the energy certificate"
- "Heating year matches between refurbishment sheet and energy certificate"
- "Energy certificate address matches the land register"
- "Zoning plan permits residential use"
- "No implausible over-rent (> 30 % above market)"

- [ ] **Step 1:** Write the tests:
  - `measurePoints('interior','partial')===1`.
  - `dealFromExtractions` on the 5 sample results gives:
    - 8 units, total area 565, `inPlaceRentPerM2` of u1 = 8.40;
    - `property.plotM2===480`, `modernisationPoints===13`, `builtYear===1912`, `heatingYear===2019`;
    - `easements.length===1`, `landChargesCount===1`.
  - `runCrossChecks` with the Task 4 estimates: all 6 passed.
  - Change u1 rent to 2000/month: the `rent_total` check fails and so does `over_rent`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add extraction schema, deal mapping and cross-checks".

### Task 6: Flags

**Files:** Create `src/lib/flags/rules.ts`, `tests/unit/flags.test.ts`.

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:

```ts
export type FlagKind = 'cap_rate'|'market_rent'|'under_rent'|'easement'|'missing_document'|'extraction'|'manual_unit'|'vacancy'|'land_value';
export type EvidenceRef = { type: 'market_report'; rowKey: CapRateRow['key'] } | { type: 'comparables' } | { type: 'document'; quote: Quote }
  | { type: 'easement'; easementId: string } | { type: 'land_value' } | { type: 'none' };
export interface Flag { id: string; kind: FlagKind; title: string; confidence: Confidence; summary: string; whyFlagged: string;
  changeMind: string; support: string|null; swing: { low: number; high: number; lowLabel: string; highLabel: string }|null;
  evidence: EvidenceRef; acceptLabel: string }
export interface FlagContext { deal: Deal; valuation: ValuationResult; rent: BuildingRentSummary; capRate: CapRateLookup; land: LandValueLookup;
  sensitivities: Sensitivity[]; params: ValuationParams }
export const REQUIRED_DOCS: DocumentType[]   // tenant_list, land_register, energy_certificate, refurbishment_sheet, zoning_plan
export function buildFlags(ctx: FlagContext): Flag[]   // sorted by max(|swing.low|,|swing.high|) desc; flags without swing last, in FlagKind order
```

**Canonical flags.** The exact titles and acceptLabels below must be produced, in this order:

| id | title | acceptLabel | swing (low / high) | swing labels | confidence |
|---|---|---|---|---|---|
| `cap_rate` | `Cap rate 3.0 %` | `Accept 3.0 %` | −111366 / +127765 | `3.5 %`, `2.5 %` | medium |
| `market_rent` | `Market rent 9.60 €/m² (avg. of 8 units)` | | −63215 / +75859 | `9.10 €/m²`, `10.20 €/m²` | medium |
| `under_rent` | `Under-rent closes within 5 years` | | −11235 / +8063 | `8 years`, `3 years` | medium |
| `easement-1` | `Utility easement assumed value-neutral` | | −12480 / 0 | | low |

- **Swing sign convention:** `low` is the downside (the negative delta), `high` the upside.
- **`market_rent` support text:** `Unit 4 was re-let in 2025 at 9.40 €/m² against an estimate of 9.64 €/m² (−2.5 %).`
- **Texts:** `whyFlagged` and `changeMind` are the spec §5.3.6 sentences, with every number templated.

**Other rules** (spec §5.3.6):
- missing required document → `missing_document-<type>`;
- uncertain field → `extraction-<docId>-<field>`;
- manual unit → `manual_unit-<id>`;
- vacant unit → `vacancy-<id>`, with swing −vacancy deduction / 0;
- land confidence low → `land_value`.

- [ ] **Step 1:** Write the tests.
  - The canonical context (Tasks 3–5 values) yields exactly the 4 flags above: ids, titles, confidence, rounded swings (via `Math.round`), and order.
  - Removing the zoning document adds `missing_document-zoning_plan`.
  - A vacant u8 adds `vacancy-u8` with low −5238 (within 1).
  - Postcode `10115` adds `land_value`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add rule-generated judgement-call flags".

### Task 7: Figure registry

**Files:** Create `src/lib/registry/registry.ts`, `tests/unit/registry.test.ts`.

**Interfaces:**
- Consumes: `FlagContext`, `Flag` (Task 6).
- Produces:

```ts
export type SourceType = 'client_document'|'public_data'|'regulation'|'calculated'|'ai_estimate'|'client_input'|'valuer';
export interface Figure { id: string; label: string; display: string; sourceType: SourceType; sourceDetail: string; quote: Quote|null;
  confidence: Confidence|null; dependsOn: string[]; flagId: string|null }
export function buildRegistry(ctx: FlagContext & { flags: Flag[]; valuerChanged: string[] }): Figure[]
export function countBySource(figs: Figure[]): Record<SourceType, number>
export function dependentsOf(figs: Figure[], ids: string[]): string[]   // transitive, excluding the ids themselves, in registry order
```

**Figure ids and source types, in this order:**

| Source type | Figure ids |
|---|---|
| client_document | `unitsCount`, `livingArea`, `inPlaceIncome`, `plotArea`, `builtYear`, `modernisationMeasures`, `heatingYear`, `zoning`, `easements` |
| public_data | `landValuePerM2`, `capRateRange`, `comparables` |
| regulation | `managementCost`, `maintenanceCost`, `rentLossRisk`, `totalLife`, `remainingLife` |
| ai_estimate | `marketRent`, `capRate`, `underRentYears`, `easementImpact` |
| calculated | `grossIncome`, `operatingCosts`, `netIncome`, `landValue`, `landInterest`, `buildingNetIncome`, `pvFactor`, `buildingValue`, `underRentDeduction`, `marketValue` |

**Dependencies** (`dependsOn`):

| Figure | Depends on |
|---|---|
| grossIncome | marketRent, livingArea, unitsCount |
| operatingCosts | managementCost, maintenanceCost, rentLossRisk, grossIncome |
| netIncome | grossIncome, operatingCosts |
| landValue | plotArea, landValuePerM2 |
| landInterest | landValue, capRate |
| buildingNetIncome | netIncome, landInterest |
| remainingLife | builtYear, modernisationMeasures, totalLife |
| pvFactor | capRate, remainingLife |
| buildingValue | buildingNetIncome, pvFactor |
| underRentDeduction | grossIncome, inPlaceIncome, underRentYears, capRate |
| marketValue | buildingValue, landValue, underRentDeduction, easementImpact |

**Source-type overrides:**
- A figure whose input was changed by the valuer becomes `valuer`.
- A unit edited by the client makes `livingArea` and `inPlaceIncome` become `client_input`.

- [ ] **Step 1:** Write the tests.
  - Canonical counts: client_document 9, public_data 3, regulation 5, ai_estimate 4, calculated 10, others 0.
  - `dependentsOf(figs,['capRate'])` equals `['landInterest','buildingNetIncome','pvFactor','buildingValue','underRentDeduction','marketValue']`.
  - With `valuerChanged:['capRate']`, `capRate.sourceType==='valuer'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add figure registry with provenance and dependencies".

### Task 8: Revision history

**Files:** Create `src/lib/revisions/history.ts`, `tests/unit/history.test.ts`.

**Interfaces:**
- Consumes: `ValuationParams`, `ValuationResult` (Task 3).
- Produces:

```ts
export type ParamKey = 'capRate'|'marketRentAvg'|'marketRentUnit'|'underRentYears'|'easementDeduction'|'remainingLifeYears';
export interface ParamChange { parameter: ParamKey; unitId?: string; from: number; to: number; reason: string;
  sourceKind: 'valuer_judgement'|'document'; documentId?: string }
export interface Version { n: number; params: ValuationParams; note: string|null; flagId: string|null; changes: ParamChange[];
  explanation: string|null; aiMode: 'live'|'demo'|null; createdAt: string; durationMs: number|null; undone: boolean }
export interface History { versions: Version[] }
export function initialHistory(params: ValuationParams, createdAt: string): History
export function currentVersion(h: History): Version          // last version with undone=false
export function previousVersion(h: History): Version|null     // the active version before current
export function applyChanges(p: ValuationParams, changes: ParamChange[], baseAvgRent: number): ValuationParams
export function addRevision(h: History, v: Omit<Version,'n'|'undone'>): History   // n = versions.length + 1
export function undoLast(h: History): History                // marks currentVersion undone if n > 1, else returns h unchanged
export interface DiffRow { key: string; label: string; from: number; to: number; format: 'pct'|'eur'|'factor'|'years'|'eurPerM2' }
export function diffResults(prevP: ValuationParams, prevR: ValuationResult, nextP: ValuationParams, nextR: ValuationResult): DiffRow[]
```

**`applyChanges` rules:**
- `marketRentAvg` sets `marketRentFactor = to/baseAvgRent`.
- `marketRentUnit` sets `overrides[unitId] = to`.
- Every other parameter maps one-to-one.

**`diffResults`** returns only changed rows, in this order and with these labels:

| key | Label |
|---|---|
| capRate | `Cap rate` |
| marketRentAvg | `Market rent (avg.)` |
| underRentYears | `Under-rent closing` |
| easementDeduction | `Easement deduction` |
| remainingLifeYears | `Remaining life` |
| landInterest | `Land-value interest` |
| pvFactor | `Present-value factor` |
| buildingValue | `Building value` |
| underRentDeduction | `Under-rent deduction` |
| marketValue | `Market value` |

- [ ] **Step 1:** Write the tests.
  - v1 → v2 (cap rate 0.034) diff has keys `[capRate, landInterest, pvFactor, buildingValue, underRentDeduction, marketValue]`, with `to` values 0.034, 8486.4, 22.1897 (4 dp), 981404.65 (within 1), 20848.12 (within 1) and 1210000.
  - Add v3 (attic rent 9.50): undo marks v3 undone, and `currentVersion` becomes v2.
  - A second undo marks v2 undone, and current becomes v1.
  - A third undo does nothing.
  - All versions remain in `versions`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add linear revision history with diff and undo".

### Task 9: Sample documents and extraction fixtures

**Files:** Create `scripts/generate-samples.ts`, `public/sample/*` (output), `fixtures/extraction/*.json` (output), `fixtures/extraction/index.json`, `tests/unit/samples.test.ts`.

**Interfaces:**
- Consumes: `ExtractionResult` (Task 5).
- Produces:
  - **PDFs:** `public/sample/Grundbuch_Musterstrasse12.pdf` (4 pp.), `Mieterliste_Musterstrasse12.pdf` (2 pp.), `Energieausweis_Musterstrasse12.pdf` (1 p.), `Sanierungsuebersicht_Musterstrasse12.pdf` (1 p.), `B-Plan_Auszug_Musterstrasse12.pdf` (1 p.).
  - **Photos:** `public/sample/foto_fassade.jpg`, `foto_dachterrasse.jpg`, `foto_wohnzimmer_dg.jpg` (illustrative placeholders: simple drawn images, each labelled "SAMPLE").
  - **Fixtures:**
    - one `fixtures/extraction/<sha256>.json` per PDF, holding the full `ExtractionResult`; each citation `quote` is exact text present on that page;
    - `fixtures/extraction/index.json` mapping `fileName → { sha256, source: "demo-fixture" }`.

**Content (German, spec §5.3.2).** Use pdf-lib standard Helvetica (WinAnsi covers ä, ö, ü, ß, € and ²) and draw the "MUSTER / SAMPLE" watermark diagonally on every page.

| Document | Exact strings that must appear |
|---|---|
| Mieterliste | One row per unit, e.g. `WE 1 | EG links | 62,0 m² | 2 Zi. | 520,80 € | seit 2009 | Hofseite`. Total row: `Summe Nettokaltmiete / Monat 5.040,30 €` and `Wohnfläche gesamt 565,0 m²`. |
| Grundbuch p. 1 | `Flurstück 123/4` and `480 m²` |
| Grundbuch Abt. II | The easement sentence from the spec, verbatim. |
| Grundbuch Abt. III | `Grundschuld` |
| Energieausweis | `Baujahr Gebäude 1912`, `Baujahr Wärmeerzeuger 2019`, `Erdgas`, `Effizienzklasse D`, `128 kWh/(m²·a)`, `Gebäudenutzfläche (Wohnfläche) 565 m²` and `Musterstraße 12, 04109 Leipzig` |
| Sanierungsübersicht | The 6 measures with years |
| B-Plan | `Allgemeines Wohngebiet (WA)` and `Wohnnutzung zulässig` |

- [ ] **Step 1:** Write `tests/unit/samples.test.ts`. It uses `unpdf` `extractText(pdf,{mergePages:false})` to assert the page counts and that every fixture quote occurs on its stated page after whitespace normalisation (collapse runs of whitespace to one space).
- [ ] **Step 2:** Run. Expected: FAIL (files missing).
- [ ] **Step 3:** Implement the script and run `npm run generate:samples`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Also confirm that `dealFromExtractions` (Task 5) on the generated fixtures equals the Task 5 hand-written results.
- [ ] **Step 5:** Commit: "Generate German sample documents and extraction fixtures".

### Task 10: Extraction route with limits and cache

**Files:** Create `src/lib/server/anthropic.ts`, `src/lib/server/limits.ts`, `src/lib/server/pdfText.ts`, `src/lib/extraction/prompt.ts`, `src/lib/extraction/validate.ts`, `src/lib/extraction/cache.ts`, `src/app/api/extract/route.ts`, `src/app/api/mode/route.ts`, `tests/unit/extractRoute.test.ts`.

**Interfaces:**
- Consumes: `ExtractionResultSchema` (Task 5) and the fixtures (Task 9).
- Produces:

```ts
// anthropic.ts
export function liveAiConfigured(): boolean                      // !!process.env.ANTHROPIC_API_KEY && !!process.env.DEMO_ACCESS_CODE
export function accessCodeValid(code: string|null): boolean
export function getClient(): Anthropic
export const MODEL = 'claude-opus-5-5'
// limits.ts
export function checkRate(ip: string, bucket: 'extract'|'revalue', now = Date.now()): { ok: boolean; retryAfterSec: number }   // extract: 3 batches/h counted per 5 files; revalue: 15/h
// pdfText.ts
export async function pageTexts(pdf: Uint8Array): Promise<string[]>   // unpdf extractText, mergePages:false
// validate.ts
export function verifyQuotes(result: ExtractionResult, pages: string[]): Record<string, boolean>   // key = field path
// cache.ts
export function cachedExtraction(sha256: string): { result: ExtractionResult; source: 'demo-fixture'|'recorded-live' }|null
// route response
export type ExtractResponse =
  | { ok: true; sha256: string; pages: number; source: 'live'|'cache'|'demo-fixture'; durationMs: number; result: ExtractionResult; verified: Record<string, boolean> }
  | { ok: false; error: 'too_large'|'too_many_pages'|'not_pdf'|'live_ai_required'|'rate_limited'|'ai_refused'|'ai_error'; message: string }
// GET /api/mode?code=… → { live: boolean; reason: 'ok'|'no_key'|'no_code'|'bad_code' }
```

**Route behaviour.** `POST` takes multipart with fields `file` and `code`. It runs in this order:
1. Check the PDF magic bytes and that the file is ≤ 5 MB.
2. Compute the sha256 and count the pages (≤ 10).
3. If live is allowed and the rate check passes, call Claude, then `verifyQuotes`, and return `source:'live'`.
4. Otherwise, if the cache hits, return `source:'demo-fixture'` (or `'cache'` for recorded-live fixtures).
5. Otherwise return `live_ai_required` with the message `Live AI is needed to read this document.`

The route sets `export const maxDuration = 60`.

**Claude call:**

```ts
await client.messages.parse({ model: MODEL, max_tokens: 8000, output_config: { effort: 'low', format: zodOutputFormat(ExtractionResultSchema) },
  system: EXTRACTION_SYSTEM, messages: [{ role: 'user', content: [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
    { type: 'text', text: 'Classify and extract this document. Quotes must be copied verbatim from the page.' } ] }] })
```

- Read `stop_reason` first: `refusal` returns `ai_refused`.
- `EXTRACTION_SYSTEM` (`prompt.ts`) explains:
  - the 7 document types;
  - that each extracted value needs its 1-based page and a verbatim German quote;
  - feature mapping (Hofseite → courtyard, Straßenseite → street, Balkon → balcony, Dachterrasse → roof_terrace, Bad saniert → renovated_bath);
  - measure categories;
  - "Abteilung III is financing — count it, never treat it as an easement";
  - "confidence low when the value is unclear".
- **Refusal fallback:** if `client.beta.messages.parse` exists in the installed SDK, use it with `betas: ['server-side-fallback-2026-07-01']` and `fallbacks: 'default'`. Otherwise use `client.messages.parse` and rely on the `ai_refused` path. Check `node_modules/@anthropic-ai/sdk` before writing.

- [ ] **Step 1:** Write `tests/unit/extractRoute.test.ts`. It calls the route handler directly with `Request` objects, with no key set:
  - the sample tenant list returns `ok:true, source:'demo-fixture'`, and `verified` is all true;
  - a random 1-page PDF made with pdf-lib returns `live_ai_required`;
  - a 6 MB buffer returns `too_large`;
  - a text file returns `not_pdf`;
  - `checkRate` allows 3 extraction batches and then refuses;
  - `verifyQuotes` marks a fabricated quote false.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add PDF extraction route with live Claude, fixtures and limits".

### Task 11: Revalue route and rule-based parser

**Files:** Create `src/lib/revalue/schema.ts`, `src/lib/revalue/prompt.ts`, `src/lib/revalue/parser.ts`, `src/lib/revalue/validate.ts`, `src/app/api/revalue/route.ts`, `tests/unit/revalue.test.ts`.

**Interfaces:**
- Consumes: `ParamChange`, `ParamKey` (Task 8), and the Task 10 server helpers.
- Produces:

```ts
export const RevalueOutputSchema = z.object({ intent: z.enum(['change_parameters','question','unclear']),
  changes: z.array(z.object({ parameter: z.enum(['capRate','marketRentAvg','marketRentUnit','underRentYears','easementDeduction','remainingLifeYears']),
    unitId: z.string().nullable(), to: z.number(), reason: z.string(), sourceKind: z.enum(['valuer_judgement','document']), documentId: z.string().nullable() })),
  explanation: z.string(), answer: z.string().nullable(), clarifyingQuestion: z.string().nullable() })
export interface RevalueContext { flagId: string|null; params: ValuationParams; baseAvgRent: number;
  units: { id: string; label: string; marketRentPerM2: number }[]; documents: { id: string; type: DocumentType; fileName: string }[];
  flags: { id: string; title: string; whyFlagged: string }[] }
export interface RevalueResult { intent: 'change_parameters'|'question'|'unclear'; changes: ParamChange[]; explanation: string;
  answer: string|null; clarifyingQuestion: string|null; mode: 'live'|'demo'; durationMs: number }
export const RANGES: Record<ParamKey, [number, number]>   // capRate [0.02,0.06], marketRentAvg [6,15], marketRentUnit [6,15], underRentYears [1,10], easementDeduction [0,50000], remainingLifeYears [20,60]
export function parseNote(note: string, ctx: RevalueContext): RevalueResult            // demo parser
export function validateChanges(r: RevalueResult, ctx: RevalueContext): RevalueResult  // range check, documentId check, fills `from`, explicit numbers in the note override
```

**Parser rules** (case-insensitive; a number may use `,` or `.` as decimal separator):

| Note pattern | Result |
|---|---|
| `cap rate`, `Liegenschaftszins` or `LZ` + `x %` (or `use x %` while the focused flag is `cap_rate`) | capRate x/100 |
| unit name or number (`attic`, `DG`, `GF left`, `unit 8`, `WE 8`) + number | marketRentUnit |
| `market rent` or `Miete` + number, with no unit named | marketRentAvg |
| `n years` or `n Jahre` while the flag is `under_rent`, or text containing `under-rent` | underRentYears |
| `easement`, `Leitungsrecht` or `Dienstbarkeit` + amount (`12k`, `12.000 €`) | easementDeduction |
| `remaining life`, `Restnutzungsdauer` or `RND` + n | remainingLifeYears |
| ends with `?` or starts with why / what / how / warum / wieso / weshalb | `question`, answered from the focused flag's whyFlagged |
| anything else | `unclear` with clarifyingQuestion `Which value should I change, and to what? For example: "use 3.4 %" or "attic rent 9.50".` |

- **Out-of-range values** produce `unclear`, with clarifyingQuestion naming the allowed range.
- **Explanation template for capRate:** `I changed the cap rate from {from} to {to} as you asked. Rent, costs and land value are unchanged. A higher cap rate means buyers expect more return, so the same rent is worth less today.`
- **Valuer ranges:** if the note mentions a range such as `3.25–3.75 %`, append `Your range ({range}) is not in the loaded market report, so the report cites it as valuer judgement.`

**Route.** `POST` takes JSON `{ note, context, code }`.
- If the note is longer than 1,000 characters, return 400.
- If live is allowed and the rate check passes, call Claude with `output_config:{effort:'medium', format: zodOutputFormat(RevalueOutputSchema)}`, then apply `validateChanges`.
- Otherwise use `parseNote`.
- Both paths return a `RevalueResult`.

- [ ] **Step 1:** Write the tests:
  - the rehearsed note `Cap rate too low for this micro-location: the committee range for pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %.` → one change, capRate 0.034, `sourceKind:'valuer_judgement'`, with an explanation that contains `3.25–3.75 %`;
  - `attic rent 9,50` → marketRentUnit u8 to 9.5;
  - `use 12 %` with flag cap_rate → unclear, and the clarifyingQuestion contains `2.0–6.0 %`;
  - `why 3.0 %?` → question;
  - `make it nicer` → unclear;
  - `validateChanges` with an unknown documentId downgrades the change to valuer_judgement.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add revalue route with live Claude and rule-based demo parser".

### Task 12: Deterministic pipeline and store

**Files:** Create `src/lib/pipeline/run.ts`, `src/lib/data/seed.ts`, `src/lib/store/demoStore.ts`, `src/lib/store/files.ts`, `tests/unit/pipeline.test.ts`.

**Interfaces:**
- Consumes: Tasks 2–8 and 10 (types only).
- Produces:

```ts
export interface PipelineOutput { deal: Deal; rent: BuildingRentSummary; land: LandValueLookup; capRate: CapRateLookup; params: ValuationParams;
  input: ValuationInput; valuation: ValuationResult; sensitivities: Sensitivity[]; flags: Flag[]; registry: Figure[]; crossChecks: CrossCheck[] }
export function initialParams(deal: Deal, capRate: CapRateLookup): ValuationParams    // capRate=row.median, remainingLife via remainingLife(builtYear, 2026, points), underRentYears 5, easementDeduction 0, factor 1, overrides {}
export function runPipeline(deal: Deal, params?: ValuationParams, valuerChanged?: string[]): PipelineOutput
export function buildRunLog(deal: Deal, out: PipelineOutput): RunLogEntry[]   // steps 6–11 of spec §5.3.4 with measured durations
// seed.ts
export const SAMPLE_SKELETON: DealSkeleton
export function seededDeal(): Deal   // dealFromExtractions(SAMPLE_SKELETON, fixtures) with status 'in_review'
export const QUEUE_ROWS: { id: string; city: string; type: string; checks: number; estReview: string }[]   // 0148 Dresden Hotel 7 ~4:10; 0149 Halle Multi-family 1 ~0:40; 0151 Leipzig Apartment 0 ~0:20; 0152 Chemnitz Commercial 3 ~2:00; 0153 Erfurt Multi-family 2 ~1:00
export const DELIVERED_ROW: { id: 'CEN-2026-0131'; address: 'Beispielweg 3, 04155 Leipzig'; value: 870000; deliveredAt: '2026-10-28' }
// demoStore.ts (zustand + persist, key 'censio-demo-v1')
export interface StoredDeal { deal: Deal; history: History; flagStatus: Record<string,'open'|'accepted'>; openedFlags: string[];
  spotCheck: 'open'|'matches'; approval: { at: string; version: number; signer: 'K. Vogel'; acceptedAtSignOff: string[] }|null }
export interface DemoState { role: 'client'|'valuer'|null; accessCode: string|null; orientationSeen: boolean; deals: Record<string, StoredDeal>;
  draft: { skeleton: DealSkeleton; documents: DealDocument[]; extractions: Record<string, { result: ExtractionResult; verified: Record<string, boolean> }>; units: Unit[]|null; step: 1|2|3|4 }|null;
  signIn(role: 'client'|'valuer'): void; setRole(role: 'client'|'valuer'): void; setAccessCode(code: string|null): void; dismissOrientation(): void;
  startDraft(): void; updateDraft(patch: Partial<NonNullable<DemoState['draft']>>): void; submitDraft(deal: Deal): string;
  setHistory(dealId: string, h: History): void; setFlagStatus(dealId: string, flagId: string, s: 'open'|'accepted'): void; markOpened(dealId: string, flagId: string): void;
  setSpotCheck(dealId: string, s: 'open'|'matches'): void; approve(dealId: string, acceptRemaining: boolean): void; reset(): Promise<void> }
// files.ts
export function putFile(id: string, blob: Blob): Promise<void>; export function getFile(id: string): Promise<Blob|undefined>; export function clearFiles(): Promise<void>
```

**Rules.**
- `submitDraft` assigns `CEN-2026-0147` to the first submitted deal, replacing the seeded one; later deals get `CEN-2026-0154`, `0155`, and so on.
- `reset()` restores this initial state:
  - role null;
  - deals = `{ 'CEN-2026-0147': seeded deal with initialHistory }`;
  - draft null;
  - IndexedDB cleared.
- `approve(..., true)` sets every open flag to `accepted` and records their ids in `acceptedAtSignOff` only when they were never opened.

- [ ] **Step 1:** Write the tests.
  - `runPipeline(seededDeal())`:
    - valuation `marketValue` 1300000 and 4 flags (`cap_rate`, `market_rent`, `under_rent`, `easement-1`);
    - all cross-checks passed;
    - registry counts as in Task 7.
  - Unit edits:
    - editing u1 to `areaM2: 70` gives `livingAreaM2` 573 and a new `marketValue` that is not 1300000;
    - the registry's `livingArea.sourceType` is `client_input`.
  - Adding a vacant manual unit `{floor:'2F', areaM2:55, features:['balcony']}` adds flags `manual_unit-m1` and `vacancy-m1`.
  - Store (with a `localStorage` polyfill): `reset()` then `submitDraft` returns `CEN-2026-0147`; a second submit returns `CEN-2026-0154`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add deterministic pipeline, seed data and persisted demo store".

### Task 13: App shell — demo bar, orientation, sign-in, client dashboard

**Files:** Create `src/components/ui/*` (Button, Pill, SourceBadge, Card, SwingBar, DotStrip), `src/components/demo/DemoBar.tsx`, `src/components/demo/OrientationOverlay.tsx`. Modify `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/client/page.tsx`. Create `tests/e2e/shell.spec.ts`.

**Interfaces:**
- Consumes: the `demoStore` and `/api/mode`.
- Produces:
  - `<SourceBadge type={SourceType} label?: string />`: glyph, colour and words. Glyphs: client document = page icon, public data = building icon, regulation `§`, calculated `=`, AI `≈`, client input = pencil, valuer = initials `KV`.
  - `<SwingBar low={number} high={number} scale={130000} />`.
  - `<DotStrip range={[a,b]} value={v} axis={[min,max]} />`.

**Behaviour.**
- **DemoBar** contains:
  - the role switch, which navigates to `/client` or `/valuer`;
  - **Reset demo**, which runs `reset()` and goes to `/`;
  - the badge, which reads `/api/mode?code=` and shows `Live AI` or `Demo mode`;
  - an orientation link.
  - It is hidden when `?recording=1` is in the URL (remember the flag in `sessionStorage`).
- **Access code:** `?code=XYZ` in any URL is stored via `setAccessCode`.
- **C1** has two buttons, `Continue as Demo Capital GmbH` and `Continue as Senior Valuer`.
- **C2** shows:
  - the delivered row;
  - each client deal with its status (`With senior valuer`, `Delivered`);
  - the **New valuation** button.

- [ ] **Step 1:** Write `tests/e2e/shell.spec.ts`:
  - sign in as client and see `New valuation` and `CEN-2026-0131`;
  - switch role to valuer and land on `/valuer`;
  - after reload the role is still valuer;
  - Reset demo returns to `/`;
  - `?recording=1` hides the text `Reset demo`;
  - the badge shows `Demo mode` (no key in e2e).
- [ ] **Step 2:** Run `npm run e2e -- shell`. Expected: FAIL.
- [ ] **Step 3:** Implement, matching the mockup's app bar styling.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add demo shell, sign-in and client dashboard".

### Task 14: PDF viewer and maps

**Files:** Create `src/components/pdf/PdfViewer.tsx`, `src/components/map/DealMap.tsx`, `src/components/map/ComparablesMap.tsx`, and a test harness page `src/app/dev/viewer/page.tsx` (rendered only when `NODE_ENV !== 'production'` or with `?dev=1`). Create `tests/e2e/viewer.spec.ts`.

**Interfaces:**
- `<PdfViewer src={string|Blob} page={number} highlight={string|null} height?={number} />` uses react-pdf `Document`/`Page` with `customTextRenderer`. It wraps the normalised `highlight` text in `<mark class="censio-hl">`; the match may span several text items. The pdf.js worker is configured via `pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`.
- `<DealMap lat lng plot={[lat,lng][]} zoneLabel={string} />` and `<ComparablesMap center comps={Comparable[]} radiusM={1000} />` use react-leaflet with OSM tiles and attribution, loaded via `next/dynamic` with `ssr:false`. Comparables render as `CircleMarker`s, filled for `monthsAgo ≤ 12` and hollow otherwise.

- [ ] **Step 1:** Write `tests/e2e/viewer.spec.ts`. The harness at `/dev/viewer?dev=1` renders the sample Grundbuch at page 1 with highlight `480 m²`; expect a `mark.censio-hl` containing `480`. It renders `ComparablesMap`; expect 38 `path.leaflet-interactive` elements.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add PDF viewer with highlights and Leaflet maps".

### Task 15: Client wizard and AI at work

**Files:** Create `src/components/client/{PropertyStep,DocumentsStep,UnitsStep,ReviewStep,RunLog}.tsx`. Modify `src/app/client/new/page.tsx` and `src/app/client/deals/[id]/processing/page.tsx`. Create `tests/e2e/wizard.spec.ts`.

**Behaviour** (spec §5.2):
- **C3.1 Property**
  - Fields: usage type, scope, and the address with a `DealMap` preview (prefilled sample).
  - Selecting Commercial, Hotel or single unit shows the exact note `Prototype computes the Living whole-building sample only — continue with sample`.
- **C3.2 Documents**
  - **Inputs:** a drop zone, **Use sample documents** (fetch `/sample/*` and add the 5 PDFs and 3 photos), and **Download sample documents** (links).
  - **Reading:** each PDF is uploaded to `/api/extract` with the stored code, up to 5 in parallel.
  - **Per-file row:** status (`Reading…`, then the type label and `summary`), source (`Live AI`, `Cached result` or `Demo mode`), duration, and **View**, which opens `PdfViewer` in a dialog with the first finding highlighted.
  - **Wohnungsgrundbuch:** shows `This looks like a condominium — please add the Teilungserklärung.`
  - **Failed or unknown files:** the row shows the route's message.
  - **Missing documents:** listed as `Missing: <type>`.
- **C3.3 Units**
  - Heading `The AI created {n} units from your tenant list.`
  - An editable table with columns label, floor, m², rooms, rent €/month, lease since and features. Edits add the field to `clientEdited` and show `Changed by client`.
  - **Add unit manually** creates `m1…` with a `Vacant` checkbox.
  - Photo slot per unit.
- **C3.4 Review & submit** shows a summary; **Submit** calls `dealFromExtractions`, then `submitDraft`, then navigates to `/client/deals/{id}/processing`.
- **C4 AI at work** shows the run log:
  - the extraction rows first (with real durations from the documents);
  - then steps 6–11, revealed one by one at 600 ms intervals;
  - then `With senior valuer for review` and the link `Open as Senior Valuer` (which switches role).

- [ ] **Step 1:** Write `tests/e2e/wizard.spec.ts`:
  - sign in as client → New valuation → Next → Use sample documents;
  - expect 5 rows with `Demo mode` or `Cached result`, and the text `plot 480 m²`;
  - Next → expect `The AI created 8 units from your tenant list.`;
  - edit nothing → Next → Submit;
  - expect `With senior valuer for review` within 15 s;
  - uploading an unknown PDF (generated in the test with pdf-lib) shows `Live AI is needed to read this document.`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add client wizard with live extraction and AI-at-work run log".

### Task 16: Valuer queue and review screen

**Files:** Create `src/components/valuer/{QueueRail,DealHeader,VerdictBand,ValuePath,UnitsTable,NeedsYourEye,EvidencePane,Ledger}.tsx`. Modify `src/app/valuer/page.tsx` and `src/app/valuer/deals/[id]/page.tsx`. Create `tests/e2e/review.spec.ts`.

**Behaviour.** Match the mockup sections 1–9 (spec §5.4); all numbers come from `runPipeline` on the current version's params.
- **V1:** a queue list: store deals with status `in_review` first, then `QUEUE_ROWS` (static, not clickable, with tooltip `Sample row`).
- **Deal header:** the photo from IndexedDB (or `/sample/foto_fassade.jpg`), `DealMap`, facts, and `Awaiting your review`.
- **Verdict band:**
  - `Proposed market value · AI draft v{n}`, with the value;
  - the `DotStrip`s from `PLAUSIBILITY`;
  - the provenance bar from `countBySource`;
  - `You sign {k} AI judgement calls · {r} of {k} reviewed`.
- **Value path:** the tiles of the mockup.
- **Units table:** expandable rows and `Expand all units`; it shows `9.92` for the attic and the split sentence.
- **Needs your eye:**
  - flags in `buildFlags` order with `SwingBar`;
  - focusing a flag calls `markOpened`;
  - **Accept** calls `setFlagStatus`;
  - the note box is shown for every flag (the Revalue wiring comes in Task 17).
  - The spot-check row picks `plotArea`; **Matches** sets `matches`.
  - The ledger shows `Verified automatically: {total−k} numbers · {passed} cross-checks passed`.
- **Evidence pane:**

  | Evidence type | Shows |
  |---|---|
  | `market_report` | The table with the row highlighted |
  | `comparables` | `ComparablesMap`, plus estimate and in-place rent |
  | `document` / `easement` | `PdfViewer` on the quote's page with the quote highlighted, plus the English translation for easements |
  | `land_value` | The BORIS card |

- [ ] **Step 1:** Write `tests/e2e/review.spec.ts`. From the seeded state, sign in as valuer → open `CEN-2026-0147` → expect:
  - `€1,300,000`;
  - 4 flag rows with titles from Task 6;
  - the text `Expand all units`; clicking it shows `9.92`;
  - focusing flag 2 shows the comparables map;
  - focusing flag 4 shows `mark.censio-hl` containing `Leitungsrecht`;
  - accepting flags 2–4 shows `3 of 4 reviewed`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add valuer queue and review screen".

### Task 17: Revalue, revisions and approval

**Files:** Create `src/components/valuer/{RevisionBanner,ApproveSheet}.tsx`. Modify `src/components/valuer/NeedsYourEye.tsx`, `VerdictBand.tsx` and `src/app/valuer/deals/[id]/page.tsx`. Create `tests/e2e/revalue.spec.ts`.

**Behaviour.**
- **Send note & revalue** posts to `/api/revalue`. While waiting:
  - show `AI is revising…`;
  - outline the figures from `dependentsOf(registry, changedFigureIds)` (map `capRate` → `['capRate']`, `marketRentAvg`/`marketRentUnit` → `['marketRent']`, etc.).
- **On `change_parameters`:** `applyChanges`, then `addRevision`, then show the banner:
  - `Revision {n} · the AI revised the valuation in {s} s` (one decimal);
  - the note in italics;
  - the `diffResults` table with v-prev and v-new columns;
  - the explanation;
  - **Undo last revision**.
- **On `question`:** show the answer under the note box; no new version.
- **On `unclear`:** show the clarifying question; no new version.
- **Demo mode:** show three clickable example notes:
  - the rehearsed note;
  - `attic rent 9.50`;
  - `Under-rent will close in 8 years`.
- **Approve & send report** opens the `ApproveSheet`:
  - value and version;
  - each flag with its status (accepted / changed by valuer / not opened);
  - **Accept remaining**;
  - **Sign & send** calls `approve`, shows `Report sent to Demo Capital GmbH`, and sets the deal status to `approved`.

- [ ] **Step 1:** Write `tests/e2e/revalue.spec.ts` (Demo mode):
  - open the deal → flag 1 → click the rehearsed example note → Send note & revalue;
  - expect `€1,210,000`, `Revision 2`, and a diff row `Cap rate` with `3.0 %` and `3.4 %`;
  - Undo last revision → `€1,300,000`;
  - type `make it nicer` → expect `Which value should I change`;
  - revalue again → Approve & send report → Accept remaining → Sign & send → expect `Report sent to Demo Capital GmbH`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add revalue loop with tracked changes and approval sheet".

### Task 18: PDF report and delivery

**Files:** Create `src/components/report/ReportDocument.tsx` and `src/lib/report/buildReport.ts`. Modify `src/app/client/deals/[id]/report/page.tsx` and the C2 dashboard link. Create `tests/unit/report.test.ts` and `tests/e2e/report.spec.ts`.

**Interfaces:**
- `buildReport(stored: StoredDeal): ReportModel` returns a pure data model holding the sections 1–9 of spec §5.6.
- `<ReportDocument model={ReportModel} />` renders it with `@react-pdf/renderer`. The download uses `pdf(<ReportDocument/>).toBlob()` and is saved as `Censio_Report_{dealId}_v{n}.pdf`.

**Behaviour.**
- **C5** shows the email card:
  - from `reports@censio.example`;
  - subject `Your valuation report is ready — Musterstraße 12`;
  - body with the value;
  - **Download PDF**.
- The disclaimer text is exactly `Prototype with sample data — not a valuation report.`
- The review log lists every version: `v1 · AI draft`, `v2 · KV · note: …`, and undone ones as `(undone)`.

- [ ] **Step 1:** Write the tests.
  - Unit: `buildReport` after v2 and approval has `value===1210000`. Its call statuses include `changed by valuer` for cap_rate and `accepted at sign-off without opening` for unopened flags. The sources list includes the B-Plan with `no value effect`.
  - E2E: after approval the client dashboard shows `Delivered` → open → Download PDF. The downloaded file's text (via `unpdf`) contains `€1,210,000` and the disclaimer.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add PDF report and client delivery screen".

### Task 19: How Censio works (P1)

**Files:** Modify `src/app/how-it-works/page.tsx`; link it from the DemoBar and the C1 footer. Create `tests/e2e/howitworks.spec.ts`.

**Content:**
- Pipeline diagram (HTML boxes and arrows): `Documents → AI extraction → Lookups & rent estimate → Valuation engine → Senior valuer → Report`.
- Two columns, `What the AI does` and `What the valuer does`.
- A learning-loop box: `Every valuer correction becomes training data and calibrates district defaults.`
- Roadmap: comparison approach, cost approach, Commercial, Hotel, condominiums.
- Footer: `Sample data — prototype`.

- [ ] **Step 1:** Write the test: the page shows `How Censio works`, the 6 pipeline labels and `learning loop` (case-insensitive).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: "Add How Censio works explainer page".

### Task 20: Demo path end to end, recording script and handover

**Files:** Create `tests/e2e/demo-path.spec.ts`, `scripts/record-extraction.ts` and `README.md` (setup, environment, deploy checklist, video tips). Create `.env.example` with `ANTHROPIC_API_KEY=` and `DEMO_ACCESS_CODE=`.

**`record-extraction.ts`** calls the extraction route logic directly with Live AI for the 5 sample PDFs and overwrites the fixtures with `source: "recorded-live"`. It exits non-zero if any quote fails verification.

- [ ] **Step 1:** Write `demo-path.spec.ts` covering the whole video script of spec §5.2, from a reset through to the PDF download, with a final assertion of `€1,210,000` in the PDF.
- [ ] **Step 2:** Run `npm run build && npm run e2e`. Expected: all specs PASS. Run `npm test`. Expected: all PASS. Run `npx tsc --noEmit` and `npm run lint`. Expected: no errors.
- [ ] **Step 3:** Write the README deploy checklist:
  1. Import the repo into Vercel.
  2. Set `ANTHROPIC_API_KEY` and `DEMO_ACCESS_CODE`.
  3. Set a monthly spend limit in the Anthropic Console.
  4. Open `/?code=<code>` and check that the badge shows `Live AI`.
  5. Run `npm run record:extraction` once locally with the key.
  6. Use `?recording=1` for takes.
- [ ] **Step 4:** Commit: "Add end-to-end demo path test, live recording script and README".
