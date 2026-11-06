# Censio RE — Clickable Prototype: Design

- **Status:** draft for founder approval
- **Date:** 2026-11-06
- **Mockups:** Claude Design canvas "Censio Valuer Review Mockups" (private link held by the founders). The chosen direction is the artboard **"A v2"**. A source copy is in [`mockups/valuer-review-A2.dc.html`](mockups/valuer-review-A2.dc.html). Read it as markup and style reference; it needs the canvas runtime to render.
- **Status of values:** all numbers in this document are canonical. Where the mockup differs by rounding, this document wins.

---

## 1. Intent

Censio RE is an AI-native B2B property-valuation venture in Germany. A client, for example a buy-side investor, requests a valuation online and uploads the property documents.

**What the AI does:**
- reads the documents,
- pulls public data,
- estimates market rent,
- computes the value with the German income approach (Ertragswertverfahren, ImmoWertV §§ 27–34).

**What the senior valuer does:** an "eye test" only. They do not redo the work. They either:
- **Approve**, and a PDF report goes to the client by email, or
- **Revalue**, by typing a free-text note that goes back to the AI, like handing work back to a junior. The AI then revises the valuation.

This document specifies a **clickable prototype** of that process. It does not specify the product.

### 1.1 Why, and for whom

1. **A short promo video** (screen recording) that shows the main features. The demo path must run identically in every take.
2. **A university class and its professor.** The class is taught in English, and the professor is not a valuation expert. The prototype must make four things obvious:
   - where the AI does the work,
   - where the human only checks,
   - why the process scales,
   - that it is state-of-the-art and "AI-native".

   The founders may present the prototype themselves, or the professor may click through it alone via a link. **Both must work**, so the app has to explain itself and stay robust when someone types their own input.

### 1.2 Success looks like

- A non-expert grasps the following within about 3 minutes:
  - the AI prepares;
  - the valuer checks only the AI's flagged judgement calls;
  - every number traces back to a source;
  - the valuer can send work back with a note and see a revision;
  - one valuer can handle many deals.
- The full demo path (§5.2) runs end to end on the hosted link without errors.
- All numbers are internally consistent. Precision of the valuation itself is **not** a goal.

### 1.3 Goals, non-goals, anti-goals

**Goals**
- A full click path covering both roles: client → AI → senior valuer → client.
- The review screen of direction A v2 (§5.4), with real recalculation.
- A real Revalue loop, powered by live AI when an API key is configured (§6).
- A real, downloadable PDF report.

**Non-goals**
- Real accounts, authentication or email delivery.
- A database, or persistence across devices.
- Processing arbitrary uploaded documents. Only the bundled sample documents are "read".
- Live lookups in BORIS (land values) or the valuation committees' market reports.
- A trained rent model.
- The comparison approach (Vergleichswertverfahren) and the cost approach (Sachwertverfahren).
- Valuation logic for Commercial or Hotel properties.
- A legally valid valuation report.

**Anti-goals.** Each of these would make the prototype a failure even if it technically works:
- It looks like a form with a calculator, and the AI is invisible.
- The AI looks like it decides alone. The human in the loop and accountability must stay visible: the valuer is the signatory of record, the AI is the preparer.
- A viewer's free-text input breaks the demo or produces nonsense.
- Sample data looks real. Everything fake is visibly labelled "Sample data", and the sample PDFs carry "MUSTER / SAMPLE".

---

## 2. Decisions made with the founders

| Topic | Decision |
|---|---|
| UI language | English. German legal terms keep their German name plus a short English gloss, e.g. "Grundbuch (land register)". |
| Valuation method | Income approach only: Ertragswertverfahren, general method (§ 28 ImmoWertV). Basis: market value under § 194 BauGB. |
| Usage types | Living, Commercial and Hotel can all be selected. Only Living is computed. |
| Scope | The client chooses "whole building" or "single unit". *My call:* "single unit" can be selected, but the prototype then continues with the whole-building sample and shows a note, the same way as for Commercial and Hotel. A real single-unit (condominium) case would need a Wohnungsgrundbuch, a Teilungserklärung and condominium-specific costs. |
| Units | The AI creates the units from the uploaded tenant list, and the client only reviews and edits them. A manual per-unit form exists as a fallback, e.g. for a vacant unit with no lease. Photos per unit are optional. |
| Valuer review screen | Direction **A v2, "exceptions first"**, with units expandable and a map and property photo added (§5.4). |
| Revalue result | Shown as a revision with tracked changes (v1 → v2 diff, plus "Back to v1"). |
| Accounts | Not built. One-click demo sign-in. |
| Email / PDF | The email is simulated (preview card). The PDF is real and downloadable. |
| Build approach | A web app in this repository, hosted on Vercel (approach 1, §4). |
| AI | Live Claude for the Revalue note when an API key is configured. Otherwise a scripted fallback (§6). |
| Land register (Grundbuch) | There is one Grundbuch per plot. A condominium-split building instead has one Wohnungsgrundbuch per unit, plus a Teilungserklärung (§ 7 WEG). The sample deal is an **undivided** building, so it has **one** Grundbuch. |

---

## 3. Constraints

- **Devices:** desktop Chrome and Safari are primary. Layouts must not break at 390 px phone width, but phone is not optimised.
- **Cost:** free tiers only — Vercel Hobby, and OpenStreetMap tiles with attribution. The Claude API costs only when live mode is used, at roughly cents per Revalue.
- **Secrets:** none in the repo. The API key lives only in a Vercel environment variable (`ANTHROPIC_API_KEY`).
- **Sample data:** no real persons or companies. The client is "Demo Capital GmbH" and the address is "Musterstraße 12, 04109 Leipzig". Real public sources (BORIS Sachsen, the Leipzig valuation committee) may be **named** as data sources, but every excerpt shown is labelled sample.

---

## 4. Approaches considered

| # | Approach | Trade-offs | Verdict |
|---|---|---|---|
| 1 | **Web app in this repo, hybrid AI.** Next.js on Vercel. A real valuation engine, a scripted sample deal, live Claude for Revalue with a fallback, a real PDF and a real map. | **For:** serves both audiences, since the video path is deterministic and the professor can type real notes. It is also the first brick of the product. **Against:** most effort. Needs a Vercel account, and optionally an API key. | **Chosen** |
| 2 | **Click-through on the design canvas.** The mockups become linked artboards, and everything is scripted. | **For:** fastest. **Against:** no real AI or PDF; reacts only to canned input; lives on claude.ai, so it has to be shared there; not reusable for the product. | Rejected |
| 3 | **Everything live.** Any uploaded documents, real BORIS lookups, a trained rent model. | This is the product, not a prototype. It means weeks of work and is fragile for a video. | Rejected |
| – | **Lovable / v0.** | Possible, but the agreed design would have to be re-translated into the tool. | Rejected |

---

## 5. The prototype

### 5.1 Roles and navigation

One app serves two roles:
- **Client:** Demo Capital GmbH.
- **Senior Valuer:** K. Vogel.

A small, always-visible **demo bar** holds three controls:
- a role switch ("View as: Client / Senior Valuer");
- **Reset demo**, which restores the initial state;
- a "Live AI / Demo mode" badge (§6).

First-time viewers get a short orientation overlay of 3 steps, which can be dismissed and reopened from the demo bar: "AI prepares → you check the flagged calls → you decide".

### 5.2 Screens and the demo path

**Client side**

| ID | Screen | What happens |
|---|---|---|
| C1 | Sign in / Create account | Visual only. "Continue as Demo Capital GmbH" or "Continue as Senior Valuer". No validation. |
| C2 | Client dashboard | Lists valuation requests with their status: one earlier report already "Delivered", plus the new one once submitted. Button: **New valuation**. |
| C3.1 | New valuation · Property | Choose usage type (Living / Commercial / Hotel) and scope (whole building / single unit). Enter the address with a map preview; the sample address is prefilled. Basis (market value § 194 BauGB) and valuation date are shown read-only. Choosing Commercial, Hotel or "single unit" shows a note: "Prototype computes the Living whole-building sample only — continue with sample". |
| C3.2 | New valuation · Documents | A drop zone, plus **"Use sample documents"**, which loads 5 PDFs and 3 photos (§5.3.2). The AI "reads" each file with a per-file status line, e.g. "Land register: plot 480 m², 1 easement in section II". It also detects the document type. A Wohnungsgrundbuch would mean a condominium, so it would ask for the Teilungserklärung; this is a scripted branch, shown in copy only. A missing required document is listed as "missing", but it does not block submission. |
| C3.3 | New valuation · Units | "The AI created 8 units from your tenant list." An editable table with an optional photo slot per unit and "Add unit manually" as the fallback. |
| C3.4 | Review and submit | Summary, then **Submit**. |
| C4 | AI at work | A live run log of the AI's 10 steps (§5.3.4) with per-step results, sped up to about 15–20 s. It shows the nominal durations, which total 3 min 40 s. It ends with "With senior valuer for review". |

**Valuer side**

| ID | Screen | What happens |
|---|---|---|
| V1 | Review queue | Rail and list of deals. Each row shows the number of checks and an estimated review time (§5.4). |
| V2 | Deal review | Direction A v2 (§5.4). |
| V3 | Revision | Happens inside V2. *My call:* versions form a **linear history** (v1, v2, v3 …).<br>**Starting a revision:** each check has its own note box, which sends that check's context. The "Revalue…" button in the verdict band opens a general note.<br>**While it runs:** after **Send note & revalue**, a working state appears ("AI is revising…"), with the figures that depend on the changed inputs outlined.<br>**The banner:** "Revision n" shows the note and a table of changes **against the previous version**, plus **Undo last revision**.<br>**The history:** every version, including undone ones (marked "undone"), stays in the review log. |
| V4 | Approve | A soft gate, never a hard block. *My call:* the sheet lists the value, the version being signed, and every AI judgement call with one of three statuses:<br>• *accepted*<br>• *changed by valuer* (with the note)<br>• *not opened*<br>An **Accept remaining** button turns all "not opened" calls into accepted with one click. If the valuer signs with calls still unopened, they are logged as *"accepted at sign-off without opening"*.<br>Then: **Sign & send** → "Report sent to Demo Capital GmbH". |

**Back to the client, and the explainer**

| ID | Screen | What happens |
|---|---|---|
| C5 | Report delivered | A simulated email card ("Your valuation report is ready") and a report page with **Download PDF**. |
| P1 | How Censio works | Explainer for the class; priority P2, my call — drop it if time is short. Contents: a pipeline diagram (documents → AI agents → valuation engine → senior valuer → report); what is AI and what is human; the learning loop (valuer corrections become training data and calibrate defaults per district); roadmap (comparison and cost approach, Commercial, Hotel). |

**Demo script for the video (≈ 60–90 s)**
1. Client creates a new valuation and clicks "Use sample documents". The AI reads the documents and creates 8 units.
2. Client submits; "AI at work" plays.
3. Switch to the valuer:
   1. open the deal from the queue;
   2. open check 1 and look at the evidence;
   3. type the note;
   4. Revision 2 appears.
4. Accept checks 2–4, about 5 s. This is my call: it puts "4 of 4 reviewed" on the sign-off sheet, so the video never shows the valuer signing unchecked AI calls.
5. Approve, then the client view shows the email and opens the PDF.

*My call:* the URL flag `?recording=1` hides the demo bar for clean takes. Everything else behaves the same.

### 5.3 Data: the sample deal (canonical)

#### 5.3.1 Deal and property

| Field | Value |
|---|---|
| Deal ID | CEN-2026-0147 |
| Client | Demo Capital GmbH, buy-side |
| Requested | 2 days before the valuation date |
| Valuation date | 06 Nov 2026 |
| Basis | Market value (§ 194 BauGB), desktop valuation, no internal inspection |
| Address | Musterstraße 12, 04109 Leipzig (fictional). The map pin goes at a plausible central-Leipzig coordinate labelled "approximate · sample". |
| Property | Multi-family house (Mehrfamilienhaus), whole building, not split into condominiums |
| Construction | Built 1912; modernised 2014–2019 |
| Size | 8 units, 565 m² living area |
| Plot | 480 m² — Gemarkung Leipzig, Flur 12, Flurstück 123/4 |

#### 5.3.2 Sample documents

All five are German, marked "MUSTER / SAMPLE", and generated by us.

1. **Grundbuch** (land register extract), 4 pp.
   - p. 1, inventory (Bestandsverzeichnis): lfd. Nr. 1, Flurstück 123/4, Gebäude- und Freifläche, Musterstraße 12, 480 m².
   - Section II no. 1: Beschränkte persönliche Dienstbarkeit (Leitungsrecht) für die städtischen Versorgungsbetriebe; eingetragen am 14.03.1998.
   - Section III: one Grundschuld (land charge). The AI notes "financing, not value-relevant for market value".
2. **Mieterliste** (tenant list), 2 pp. — the 8 units of §5.3.3, with a total row: "Summe Nettokaltmiete / Monat 5.040,30 €", 565,0 m².
3. **Energieausweis** (energy certificate) — gas condensing boiler installed 2019, final energy demand 128 kWh/(m²·a), class D.
4. **Sanierungsübersicht** (refurbishment sheet) — the measures and points are in the table below.
5. **B-Plan** (zoning plan excerpt) — general residential area (WA). The AI notes "residential use permitted, no value effect".

| Measure | Year | Points |
|---|---|---|
| Roof incl. insulation | 2016 | 4 |
| Windows | 2014 | 2 |
| Pipes / electrics | 2014 | 2 |
| Heating | 2019 | 2 |
| Bathrooms | 2014 | 2 |
| Interior, partial | 2014 | 1 |
| **Total** | | **13** |

**Photos (3):** a façade photo and two attic photos (terrace, living room). Until the founders supply real photos, use placeholder illustrations.

#### 5.3.3 Units

| # | Unit | Floor | m² | Rooms | In-place €/m² | In-place €/mo | AI market €/m² | Market €/mo | Gap | Lease since | Value share v1 | Value share v2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | GF left | Ground | 62 | 2 | 8.40 | 520.80 | 9.20 | 570.40 | −8.7 % | 2009 | €136,700 | €127,200 |
| 2 | GF right | Ground | 68 | 2.5 | 8.70 | 591.60 | 9.25 | 629.00 | −5.9 % | 2012 | €150,800 | €140,300 |
| 3 | 1F left | 1st | 71 | 3 | 9.20 | 653.20 | 9.60 | 681.60 | −4.2 % | 2022 | €163,400 | €152,100 |
| 4 | 1F right | 1st | 75 | 3 | 9.40 | 705.00 | 9.55 | 716.25 | −1.6 % | 2025 | €171,700 | €159,800 |
| 5 | 2F left | 2nd | 62 | 2 | 8.60 | 533.20 | 9.71 | 602.02 | −11.4 % | 2011 | €144,300 | €134,300 |
| 6 | 2F right | 2nd | 68 | 2.5 | 8.80 | 598.40 | 9.66 | 656.88 | −8.9 % | 2016 | €157,400 | €146,500 |
| 7 | 3F left | 3rd | 71 | 3 | 9.10 | 646.10 | 9.75 | 692.25 | −6.7 % | 2021 | €165,900 | €154,400 |
| 8 | Attic | Attic | 88 | 3.5 | 9.00 | 792.00 | 9.95 | 875.60 | −9.5 % | 2019 | €209,800 | €195,400 |
| | **Total** | | **565** | | **8.92** | **5,040.30** | **9.60** | **5,424.00** | **−7.1 %** | | **€1,300,000** | **€1,210,000** |

**Unit features:**
- Units 4 and 6 have a balcony.
- Units 3 and 7 had their bathroom renovated in 2014.
- Unit 8 has a roof terrace, and the roof was insulated in 2016. It is the only unit with photos (2).
- Units 1 and 5 face the courtyard; unit 2 faces the street.

**The AI's market rent comes from 38 comparable listings within 1 km:** 23 listed within the last 12 months and 15 older, index-adjusted. The comparables used per unit:

| Unit | Comparables | Confidence |
|---|---|---|
| 1 | 9 | medium |
| 2 | 8 | medium |
| 3 | 11 | medium |
| 4 | 12 | high |
| 5 | 9 | medium |
| 6 | 8 | medium |
| 7 | 10 | medium |
| 8 | 6 | medium |

Unit 4's 2025 re-letting at 9.40 €/m² supports the model. For the building average of 9.60 €/m², the plausible range is 9.10–10.20.

**Value per unit** is the building value split by each unit's share of market rent, rounded to €100, with any rounding difference assigned to the largest unit. The UI must say so: *"The building is valued as one asset (one plot, one cap rate); the unit values are a split, not separate valuations."*

#### 5.3.4 AI run log (C4, and the history in V2)

| # | Step | Result | Shown duration |
|---|---|---|---|
| 1 | Read tenant list | 8 units, 565 m², €60,484/yr | 0:21 |
| 2 | Read land register | plot 480 m², 1 easement; land charge ignored (financing) | 0:18 |
| 3 | Read energy certificate and refurbishment sheet | 6 measures, 2014–2019 | 0:13 |
| 4 | Read zoning plan | residential, no value effect | 0:09 |
| 5 | Look up land value (BORIS) | 520 €/m², zone 0412, as of 01 Jan 2026 | 0:04 |
| 6 | Look up cap rate (market report 2026, p. 47, table 12) | 2.5–3.5 % for pre-war multi-family houses, median 3.0 %, n = 64 | 0:05 |
| 7 | Estimate market rent | 38 listings, 9.60 €/m² average | 0:41 |
| 8 | Score modernisation | 13 points → 42 years remaining life | 0:06 |
| 9 | Compute value and run cross-checks | 6 cross-checks passed | 0:02 |
| 10 | Draft memo and report | 4 calls flagged for review | 1:41 |
| | **Total** | | **3:40** |

**The 6 cross-checks:**
1. The rent total equals the sum of the 8 rows.
2. Heating year 2019 agrees between the refurbishment sheet and the energy certificate.
3. Living area in the tenant list matches the energy certificate.
4. The plot area matches between the land register and the cadastral reference.
5. The zoning plan allows residential use.
6. The façade photo matches the building age.

#### 5.3.5 Valuation (engine definition and canonical results)

The engine implements the general method of § 28 ImmoWertV. Inputs and results:

| Item | Definition | v1 | v2 (cap rate 3.4 %) |
|---|---|---|---|
| Gross market income (RoE) | Σ unit market rent × 12 | 65,088.00 | same |
| Management | 8 units × €367 (ImmoWertV Annex 3 model value, indexed) | 2,936.00 | same |
| Maintenance | 565 m² × €14.40 (Annex 3, indexed) | 8,136.00 | same |
| Rent-loss risk | 2 % × RoE (Annex 3) | 1,301.76 | same |
| Operating costs (BWK) | sum of the three above, 19.0 % of RoE | 12,373.76 | same |
| Net income (RE) | RoE − BWK | 52,714.24 | same |
| Land value (BW) | 480 m² × 520 €/m² (BORIS) | 249,600.00 | same |
| Cap rate (LZ) | AI pick: median of the committee range | 3.0 % | 3.4 % (valuer) |
| Land-value interest | BW × LZ | 7,488.00 | 8,486.40 |
| Building net income | RE − land-value interest | 45,226.24 | 44,227.84 |
| Remaining economic life (RND) | Total life 80 yrs, adjusted by 13 modernisation points (Annex 2 model, simplified for the prototype) | 42 yrs | same |
| Present-value factor (BWF) | (1 − (1+LZ)^−RND) / LZ | 23.7014 | 22.1897 |
| Building income value | building net income × BWF | 1,071,923.36 | 981,404.65 |
| Preliminary income value | building income value + BW | 1,321,523.36 | 1,231,004.65 |
| Under-rent deduction (special property feature, "boG") | (RoE − in-place 60,483.60) × annuity factor(LZ, 5 yrs) = 4,604.40 × 4.5797 / 4.5279 | −21,086.80 | −20,848.12 |
| Easement deduction (boG) | AI assumption | 0 | 0 |
| **Market value** | rounded to €10,000 | **€1,300,000** | **€1,210,000 (−6.9 %)** |
| €/m² · gross multiplier | | 2,301 · 20.0× | 2,142 · 18.6× |

**Plausibility checks (sample reference ranges)**

| Check | Reference range | v1 | v2 |
|---|---|---|---|
| €/m² vs. 7 recent Censio valuations of pre-war MFH in Leipzig | 2,050–2,520 | inside | inside |
| Gross multiplier vs. market report 2026 | 17.5–23.0× | inside | inside |

**Sensitivities.** The engine computes each one by varying one input and holding the others at v1:

| Input | Range | Value range | Swing |
|---|---|---|---|
| Cap rate | 2.5 / 3.5 % | €1.43 M / €1.19 M | +€128k / −€111k |
| Market rent | 9.10 / 10.20 €/m² average | €1.24 M / €1.38 M | −€63k / +€76k |
| Under-rent closing | 3 / 8 years | | +€8k / −€11k |
| Easement | 0 to −€12k | | AI assumption, no computation |
| Remaining life | 38 / 46 yrs | | −€55k / +€49k |

Remaining life is not flagged in the UI. It is listed here only for completeness.

#### 5.3.6 The 4 AI judgement calls (flags), ranked by € impact

| # | Call | Confidence | Why flagged | What would change the AI's mind | Support / reasoning |
|---|---|---|---|---|---|
| 1 | **Cap rate 3.0 %** | medium | The market report has no district figure for 04109, so the AI used the city-wide median of 2.5–3.5 % for pre-war MFH. | A district cap rate, or recent sales of pre-war houses in 04109. | |
| 2 | **Market rent 9.60 €/m² average** | medium | Asking rents, not leases; 15 of the 38 listings are older than 12 months. | | Unit 4 was re-let in 2025 at 9.40 vs. 9.55 estimated. |
| 3 | **Under-rent closes within 5 years** | medium | Rent increases in sitting tenancies are capped (§ 558 BGB, local rent index). | Dates of the last rent increases per unit. | |
| 4 | **Easement value-neutral** | low | The route of the line is not documented; the AI assumes it runs along the boundary. | A cadastral map showing the line crossing the buildable area. | |

**Spot-check.** One random verified figure (plot area 480 m², land register p. 1) is shown for confirmation. This guards against confidently wrong extractions.

### 5.4 Valuer review screen (A v2)

The mockup [`mockups/valuer-review-A2.dc.html`](mockups/valuer-review-A2.dc.html) is the reference for layout, copy and visual language. The sections, from top to bottom:

1. **App bar.** Censio wordmark, nav (Review queue (14), Deals, Clients, Reports), a "Sample data" pill, and the valuer avatar.
2. **Queue rail** on the left; it stacks above the content on narrow screens.
   - **Deal rows:** each shows ID, city · type, number of checks and estimated review time. The current deal is highlighted.
   - **Footer:** "Today: 9 signed off · 1 sent back to AI · median review time 1:41".
3. **Deal header.**
   - **Property photo:** client-uploaded, a placeholder illustration for now.
   - **Mini map:** plot outline and BORIS zone label "zone 0412 · 520 €/m²".
   - **Text:** ID, address, facts, basis and scope.
   - **Status:** "Awaiting your review", plus an "AI-prepared in 3 min 40 s" summary.
4. **Revision banner.** Visible only after a revalue. It shows:
   - the note;
   - a table of changes against the previous version;
   - the AI note;
   - **Undo last revision**.

   *My call:* the mockup's "Attach source" button is **dropped**, because a dead button would be the first thing clicked in class. The AI note says instead that a valuer-provided range "is recorded as valuer judgement".
5. **Verdict band.**
   - **Value:** with its version label, and a struck-through v1 value once revised.
   - **Plausibility:** two dot strips.
   - **Provenance bar:** counts per source type, computed from the figure registry rather than hard-coded.
   - **Decision buttons:** Approve & send report; Revalue…; "x of 4 reviewed"; Preview report draft.
6. **"How the value is built."** A strip of tiles: market rent → gross income → operating costs → net income → cap rate · life · factor → building + land → adjustments → market value. Each tile carries its source marker and its link to a flag.
7. **Units.**
   - **Table:** 8 rows with m², in-place €/m², AI market €/m², gap, lease since and value share.
   - **Expanding a row** shows floor, rooms, features, rent per month with sources (tenant-list row, number of comparables), an AI note and photos.
   - **"Expand all units"** opens every row.
   - **Total row** and the explanatory sentence from §5.3.3.
8. **Needs your eye.**
   - **Check rows:** the 4 checks ranked by € impact, each with a swing bar on one shared scale (±€130k). Clicking a row focuses it.
   - **Focused row:** expands to show why flagged, what would change the AI's mind, and actions: **Accept** · **Revalue…**.
   - **Check 1** contains the note box and **Send note & revalue**.
   - **Spot-check row** (dashed).
   - **"Verified automatically: 29 numbers · 6 cross-checks passed"**, which expands into the ledger.
9. **Evidence pane** on the right; it stacks below on narrow screens. It shows the source of the focused check:
   - **Check 1:** market-report table crop, with the highlighted row and the AI reasoning.
   - **Check 2:** map of the 38 comparables inside a 1 km circle, solid vs. hollow, with the estimate and in-place rent.
   - **Check 3:** tenant-list crop with the total row highlighted, plus the AI reasoning.
   - **Check 4:** land-register crop with the AI translation, and a plot sketch with the assumed line route.
   - **Spot-check:** the inventory line with "480 m²" highlighted.

**Source markers.** Every figure carries one of six source types, always as glyph + colour + words and never colour alone:

| Source type | Colour |
|---|---|
| Client document | blue |
| Public data | teal |
| § ImmoWertV rule | slate |
| = Calculated | grey |
| ≈ AI estimate | amber; flagged calls hatched |
| Changed by valuer | violet, with initials |

An accepted AI figure keeps its AI marker and gains "Accepted · KV". It never turns into a valuer-changed marker.

**Accountability copy.** The valuer is the signatory of record and the AI is the preparer. The PDF review log lists which calls were accepted or changed, and by whom.

### 5.5 Provenance model

Every displayed figure is an entry in a **figure registry** with these fields:
- `id`, `label`, `value`, `unit`;
- `sourceType` ∈ {client_document, public_data, regulation, calculated, ai_estimate, valuer};
- `sourceDetail`: the document plus page and row or snippet, the register plus date, or the annex;
- `confidence`, for AI figures;
- `dependsOn[]`, for calculated figures;
- `flagId?`.

The provenance bar, the ledger and the "dependent figures outlined during revision" all come from this registry. The UI counts must equal the registry. The mockup's "33 numbers / 29 verified" is illustrative.

### 5.6 PDF report

The PDF is generated in the app and downloaded from C5 (and previewed from V2). Content:
1. **Cover:** address, client, valuation date, market value, version.
2. **Summary** in plain English.
3. **Property and documents:** the documents list, including ones that changed nothing, such as the B-Plan.
4. **Units table.**
5. **Calculation:** the steps of §5.3.5.
6. **Assumptions and AI judgement calls:** each with its status — accepted, changed by valuer (with the note), or accepted at sign-off without opening.
7. **Sources.**
8. **Review log:** valuer, timestamps, all versions including undone ones.
9. **Disclaimer:** "Prototype with sample data — not a valuation report."

---

## 6. AI: what is real, what is scripted

**Scripted (deterministic, for the sample deal):**
- document "reading" and extraction results;
- unit creation;
- per-unit rent estimates and the comparables;
- run-log timings;
- flag texts and reasoning;
- the evidence content.

**Real:**
- **The valuation engine.** A pure function that recomputes everything whenever a parameter changes.
- **The Revalue note, interpreted by Claude** when `ANTHROPIC_API_KEY` is set:
  - **Input:** the note, the current parameters, the allowed parameters with their ranges, and the flag context (reasoning, sources).
  - **Structured output:** `intent` ∈ {change_parameters, question, unclear}. Then `changes[] {parameter, unitId?, from, to, reason, sourceKind: "valuer_judgement" | "document", documentId?}`, a 1–3 sentence plain-English `explanation`, and an `answer` when the intent is a question.
  - *My call:* `sourceKind: "document"` is allowed only when the note cites one of the five loaded sample documents. The server validates `documentId` against that list and otherwise downgrades the change to valuer judgement.
  - **Current state:** "Current parameters" means those of the latest version, so revisions are cumulative (§5.2 V3).
  - **Changeable parameters (my call):**

    | Parameter | Allowed range |
    |---|---|
    | Cap rate | 2.0–6.0 % |
    | Average market rent | 6–15 €/m², applied proportionally to the units |
    | Market rent of one unit | 6–15 €/m² |
    | Under-rent closing years | 1–10 |
    | Easement deduction | €0–50,000 |
    | Remaining economic life | 20–60 yrs |

  - **Guardrails:**
    - **Sourced facts stay fixed:** areas, in-place rents and the land value cannot be changed by a note.
    - **Valuer-provided ranges** are recorded as valuer judgement, never as sources.
    - **The AI never invents sources.**
    - **Out-of-range or ambiguous notes** make the AI ask a clarifying question instead of revising.
    - **A question gets an answer** without creating a new version.
  - **Model:** Claude Sonnet 5.5 (`claude-sonnet-5-5`), called from a Next.js server route.
- **Fallback (Demo mode).** It applies when there is no key, an error, or a timeout over 12 s. A small rule-based parser handles the rehearsed patterns (e.g. "use 3.4 %" → cap rate). Anything else gets a canned clarifying reply. The demo bar shows whether Live AI or Demo mode is active.
- **The video path** uses the rehearsed note (§5.3.6, check 1), which yields exactly v2 in both modes. *My call:*
  - **No scripted reply under a "Live AI" label.** In Live mode the call is real. The numbers are guaranteed because the engine computes them, and the server checks that the rehearsed note maps to cap rate 3.4 %.
  - **Wording varies.** Claude's explanation can differ between takes.
  - **Timing is measured.** "Revised in x s" shows the real duration.
- **Abuse limits** (my call), because the route is public and unauthenticated:
  - note length ≤ 1,000 characters;
  - capped output tokens;
  - a simple per-IP throttle of about 10 calls per minute.

  The founders should also set a monthly spend limit in the Anthropic console.

---

## 7. Architecture and stack (my calls)

**Stack**
- Next.js (App Router), TypeScript, Tailwind CSS.
- Fonts: Inter, plus Space Grotesk for headings and figures.
- State: a client-side store persisted in `localStorage`. **Reset demo** clears it. No database and no server state.

**Valuation engine and AI route**
- `lib/valuation` is pure TypeScript. Its unit tests must reproduce §5.3.5 (v1 and v2) to within €1, and the unit shares of §5.3.3.
- `app/api/revalue` uses the Anthropic SDK with structured output (§6).

**Documents, PDF and media**
- PDF: generated client-side, e.g. with `@react-pdf/renderer`; the builder may choose.
- Map: Leaflet with OpenStreetMap tiles. The plot outline, the zone and the comparables are drawn as sample overlays.
- Sample documents: German PDFs in `public/sample/`, generated once and committed, with a "MUSTER / SAMPLE" watermark.

**Deployment**
- The founders import the repo into Vercel.
- `ANTHROPIC_API_KEY` is optional. Without it the app runs in Demo mode.
- *My call:* plan for the Vercel Hobby plan. Hobby is meant for non-commercial use, which suits the class prototype; once the app is used commercially, move to Pro.
- *My call:* this build session has no access to Vercel. The builder therefore verifies against a local production build (`next build && next start`) plus an end-to-end smoke test of the demo path, and hands over a short deploy checklist. The founders do the final click-through on the hosted link.

---

## 8. Left to the builder

- Component and folder structure.
- Exact styling, within the mockup's visual language.
- Animation timings within the stated totals.
- PDF layout details.
- The choice of PDF and map libraries.
- How the sample PDFs are generated.
- Test strategy beyond the engine tests and one end-to-end smoke test of the demo path.

---

**Cut order if time runs short** (my call, pending the dates):
1. drop P1 "How Censio works";
2. replace the Leaflet maps with the mockup's static SVG maps;
3. simplify the sample PDFs to 1 page each;
4. merge wizard steps C3.1 and C3.2.

The demo path itself is never cut.

---

## 9. Open questions for the founders

1. Do client edits in the wizard (unit area, rent, manually added units) flow into the valuation, or does the valuer side always show the sample deal?
2. Will an Anthropic API key be set for the video and for the professor's link, so that Live AI is on?
3. When are the video recording and the class session, and which comes first?
