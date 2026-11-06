# Censio RE — Clickable Prototype: Design (v2)

- **Status:** draft v2 for founder approval. Updated with the founders' answers: real document extraction, and live AI with usage limits.
- **Date:** 2026-11-06
- **Mockups:** Claude Design canvas "Censio Valuer Review Mockups" (private link held by the founders). The chosen direction is the artboard **"A v2"**. A source copy is in [`mockups/valuer-review-A2.dc.html`](mockups/valuer-review-A2.dc.html). Read it as markup and style reference; it needs the canvas runtime to render.
- **Values:** every number in this document is canonical. Where the mockup differs by rounding, this document wins.
- **"My call":** marks a decision the designer made where the founders gave no direction. The founders can overrule any of them.

---

## 1. Intent

Censio RE is an AI-native B2B property-valuation venture in Germany. A client, for example a buy-side investor, requests a valuation online and uploads the property documents.

**What the AI does:**
- reads the documents,
- pulls public data,
- estimates market rent,
- computes the value with the German income approach (Ertragswertverfahren, ImmoWertV §§ 27–34).

**What the senior valuer does:** an "eye test" only, without redoing the work. They either:
- **Approve:** a PDF report goes to the client by email.
- **Revalue:** they type a free-text note that goes back to the AI, like handing work back to a junior, and the AI revises the valuation.

This document specifies a **clickable prototype** of that process, not the product.

### 1.1 Why, and for whom

1. **A short promo video** (screen recording) showing the main features.
2. **A university class and its professor.** The class is taught in English. The professor is not a valuation expert. The prototype must make four things obvious:
   - where the AI does the work,
   - where the human only checks,
   - why it scales,
   - that it is state of the art ("AI-native").

The founders may present the prototype themselves, or the professor may click through it alone via a link. **Both must work.** That means the app has to explain itself and stay robust against the professor's own input.

### 1.2 Success looks like

- **Within about 3 minutes, a non-expert grasps that:**
  - the AI reads the documents and prepares the valuation;
  - the valuer only checks the flagged judgement calls;
  - every number traces back to a source, down to the highlighted line in the PDF;
  - the valuer can send work back with a note;
  - one valuer can handle many deals.
- **The full demo path runs end to end on the hosted link:** upload the sample PDFs, real extraction, review, revalue, approve, PDF report.
- **All numbers are internally consistent.** Precision of the valuation itself is *not* a goal.

### 1.3 Goals, non-goals, anti-goals

**Goals**
- A full click path covering both roles: client → AI → senior valuer → client.
- **Real AI extraction from uploaded PDFs.**
  - The founders upload the bundled sample documents, or similar documents they make themselves.
  - The AI reads them.
  - The extracted data drives everything downstream: units, valuation, flags and report.
- **A PDF viewer** that shows the source page and highlights the passage a figure came from.
- The valuer review screen of direction A v2 (§5.4), with real recalculation.
- A real Revalue loop with live AI (§6.2).
- A real, downloadable PDF report.
- **Usage limits**, so the API key cannot run up costs (§6.4).

**Non-goals**
- Real accounts, authentication or email delivery.
- A database, or persistence across devices.
- Robust extraction from arbitrary real-world documents: scans, handwriting, unusual layouts. Extraction targets the five document types (§5.3.2) and is tested on the bundled samples.
- Live lookups in BORIS (land values) or in the valuation committees' market reports. Bundled sample lookup tables are used instead (§5.3.7).
- A trained rent model. A deterministic estimator on a bundled sample set of comparable listings is used instead (§6.3).
- Photo analysis. Photos are displayed, not interpreted.
- Comparison and cost approaches; valuation logic for Commercial, Hotel or single condominium units.
- A legally valid valuation report.

**Anti-goals.** Each would make the prototype a failure even if it technically works:
- It looks like a form with a calculator, and the AI is invisible.
- The AI looks like it decides alone. The human in the loop and accountability must stay visible: the valuer is the signatory of record, the AI is the preparer.
- A viewer's own input breaks the demo or produces nonsense.
- Sample data looks real. Everything fake is visibly labelled "Sample data"; the sample PDFs carry "MUSTER / SAMPLE".

---

## 2. Decisions made with the founders

| Topic | Decision |
|---|---|
| UI language | English. German legal terms keep their German name plus a short English gloss, e.g. "Grundbuch (land register)". |
| Valuation method | Income approach only (Ertragswertverfahren, general method, § 28 ImmoWertV). Basis: market value (§ 194 BauGB). |
| Usage types | Living, Commercial and Hotel can be selected. Only Living is computed. |
| Scope | Whole building or single unit. *My call:* if "single unit" is chosen, the prototype continues with the whole-building sample and shows a note, as it does for Commercial and Hotel. A real condominium case would need a Wohnungsgrundbuch, a Teilungserklärung and condominium costs. |
| Documents | The client uploads PDFs, and **the AI really reads them**. Sample documents are bundled with the app. |
| Units | The AI creates the units from the uploaded tenant list. The client reviews and edits them, and can add a unit by hand, e.g. a vacant one. Photos per unit are optional. **Client edits flow into the valuation.** *This is my reading of the founders' answer:* the data comes from the documents, so the pipeline is data-driven anyway. |
| Valuer review screen | Direction **A v2, "exceptions first"**: units can be expanded, with a map and the property photo (§5.4). |
| Revalue result | A revision with tracked changes. *My call:* versions form a linear history with undo (§5.2, V3). |
| Accounts | Not built; a one-click demo sign-in instead. |
| Email and PDF | The email is simulated (a preview card). The PDF is real and downloadable. |
| Build | A web app in this repository, hosted on Vercel (approach 1, §4). |
| AI | Live Claude for document extraction and for the Revalue note. The founders said: use a key, but **limit usage** (§6.4). Demo mode is the fallback. |
| Land register (Grundbuch) | There is one Grundbuch per plot. A building split into condominiums has one Wohnungsgrundbuch per unit plus a Teilungserklärung (§ 7 WEG). The sample deal is an **undivided** building, so it has **one** Grundbuch. |

---

## 3. Constraints

- **Devices.** Desktop Chrome and Safari are primary. Layouts must not break at 390 px (phone width), but are not optimised for it.
- **Cost.** Free tiers wherever possible: Vercel Hobby, and OpenStreetMap tiles with attribution. The Claude API is pay-per-use, under hard caps (§6.4).
- **Secrets.** None in the repo. The key lives only in Vercel environment variables.
- **Sample data.** No real persons or companies. The client is "Demo Capital GmbH" and the address is "Musterstraße 12, 04109 Leipzig". Real public sources (BORIS Sachsen, the Leipzig valuation committee) may be **named** as data sources, but every value from them is sample data and labelled as such.

---

## 4. Approaches considered

| # | Approach | Trade-offs | Verdict |
|---|---|---|---|
| 1 | **Web app in this repo, live AI where it matters.** Next.js on Vercel, with a real valuation engine, real PDF extraction, live Claude for Revalue, a real PDF report and a real map. | **For:** serves both audiences and is the first building block of the product. **Against:** most effort; needs a Vercel account and an API key. | **Chosen** |
| 2 | **Click-through on the design canvas.** Linked artboards, everything scripted. | **For:** fastest. **Against:** no real AI or PDF; reacts only to canned input; lives on claude.ai; not reusable for the product. | Rejected |
| 3 | **Everything live and general.** Any document, real BORIS lookups, a trained rent model. | This is the product, not a prototype: weeks of work, and fragile for a video. | Rejected |
| – | **Lovable / v0.** | The agreed design would have to be re-translated into another tool. | Rejected |

---

## 5. The prototype

### 5.1 Roles and navigation

One app serves two roles: **Client** (Demo Capital GmbH) and **Senior Valuer** (K. Vogel).

A small demo bar is always visible. It holds:
- a role switch: "View as: Client / Senior Valuer";
- **Reset demo**, which restores the initial state;
- a "Live AI / Demo mode" badge (§6.4).

On first visit, a short orientation overlay explains the flow in three steps: "AI reads and prepares → you check the flagged calls → you decide". It can be dismissed and reopened from the demo bar.

*My call:* the URL flag `?recording=1` hides the demo bar for clean video takes.

### 5.2 Screens and the demo path

**Client side**

| ID | Screen | What happens |
|---|---|---|
| C1 | Sign in / Create account | Visual only. "Continue as Demo Capital GmbH" or "Continue as Senior Valuer". No validation. |
| C2 | Client dashboard | Lists the valuation requests with their status: one earlier report already "Delivered", plus new requests. Button: **New valuation**. |
| C3.1 | New valuation · Property | <ul><li>Usage type and scope.</li><li>Address with a map preview; the sample address is prefilled.</li><li>Basis and valuation date, read-only.</li><li>Choosing Commercial, Hotel or single unit shows: "Prototype computes the Living whole-building sample only — continue with sample".</li></ul> |
| C3.2 | New valuation · Documents | <ul><li>**Input:** a drop zone, plus **Use sample documents**, which adds the 5 bundled PDFs and 3 photos as if dropped, and **Download sample documents**, so the video can show a real drag and drop.</li><li>**Reading:** each PDF is **sent to the AI**. Per file the screen shows a live status, the detected document type and the key findings, e.g. "Land register · plot 480 m² · 1 easement in section II · land charge (financing, not value-relevant)". Clicking a file opens it in the PDF viewer with the found passages highlighted.</li><li>**Wohnungsgrundbuch:** a detected Wohnungsgrundbuch triggers "This looks like a condominium — please add the Teilungserklärung".</li><li>**Missing documents** are listed. They do not block the request but become flags.</li><li>**Unsure fields** are shown with "AI unsure — please confirm".</li></ul> |
| C3.3 | New valuation · Units | <ul><li>"The AI created 8 units from your tenant list."</li><li>The table can be edited: area, rent, lease start, features. Edits are marked "Changed by client".</li><li>Each unit has an optional photo slot.</li><li>**Add unit manually** covers the fallback, e.g. a vacant unit.</li></ul> |
| C3.4 | Review & submit | Summary, then **Submit**. |
| C4 | AI at work | <ul><li>The **real run log** of the remaining steps, with real durations: lookups, rent estimation, scoring, computation, cross-checks, flagging, report draft.</li><li>The extraction steps from C3.2 are listed at the top with the time they took.</li><li>It ends with "With senior valuer for review".</li></ul> |

**Valuer side**

| ID | Screen | What happens |
|---|---|---|
| V1 | Review queue | <ul><li>A rail and a list of deals.</li><li>Each row shows the number of checks and an estimated review time.</li><li>The other deals in the queue are static sample rows.</li></ul> |
| V2 | Deal review | Direction A v2 (§5.4). |
| V3 | Revision (inside V2) | *My call:* **linear version history** (v1, v2, v3 …). <ul><li>**Where notes come from:** each check has its own note box, which sends that check's context. The verdict band's "Revalue…" opens a general note.</li><li>**While the AI works:** after **Send note & revalue** comes a working state ("AI is revising…"), with the figures that depend on the change outlined.</li><li>**The result:** a "Revision n" banner with the note, a table of changes **against the previous version**, the AI note, and **Undo last revision**.</li><li>**The review log** keeps every version, including undone ones (marked "undone").</li></ul> |
| V4 | Approve | A soft gate. *My call:* <ul><li>**What the sheet shows:** the value, the version being signed, and every AI judgement call with its status — accepted, changed by valuer (with the note), or not opened.</li><li>**Accept remaining** accepts all unopened calls with one click.</li><li>**Signing with calls unopened** logs them as "accepted at sign-off without opening".</li><li>**Sign & send** shows "Report sent to Demo Capital GmbH".</li></ul> |

**Back to the client, and the class explainer**

| ID | Screen | What happens |
|---|---|---|
| C5 | Report delivered | A simulated email card ("Your valuation report is ready") and a report page with **Download PDF**. |
| P1 | How Censio works | *My call, priority P2* (dropped first if time runs short). An explainer for the class: <ul><li>the pipeline: documents → AI extraction → lookups and rent estimate → valuation engine → senior valuer → report;</li><li>what is AI and what is human;</li><li>the learning loop: valuer corrections become training data and calibrate district defaults;</li><li>the roadmap: comparison and cost approach, Commercial, Hotel, condominiums.</li></ul> |

**Demo script for the video (≈ 60–90 s, my call)**
1. Client: **New valuation**. Drag in the sample PDFs. The AI reads them live, shows its findings, and creates 8 units.
2. Submit. "AI at work" runs.
3. Switch to the valuer. Open the deal from the queue, then open check 1 and its evidence.
4. Type the note. Revision 2 appears.
5. Accept checks 2–4. This takes about 5 s and makes the sheet show "4 of 4 reviewed", so the video never shows unchecked AI calls being signed.
6. Approve. The client receives the email and opens the PDF.

### 5.3 Data: the sample deal (canonical)

The bundled sample documents are the ground truth. Extracting them and running the engine must reproduce exactly the values below.

#### 5.3.1 Deal and property

| Field | Value |
|---|---|
| Deal ID | CEN-2026-0147 |
| Client | Demo Capital GmbH (buy-side) |
| Valuation date | 06 Nov 2026 |
| Basis and scope | Market value (§ 194 BauGB); desktop valuation, no internal inspection |
| Address | Musterstraße 12, 04109 Leipzig (fictional). The map pin sits at a plausible central-Leipzig coordinate, labelled "approximate · sample". |
| Property | Multi-family house (Mehrfamilienhaus), not split into condominiums |
| Built / modernised | Built 1912; modernised 2014–2019 |
| Units and area | 8 units, 565 m² living area |
| Plot | 480 m² (Gemarkung Leipzig, Flur 12, Flurstück 123/4) |

#### 5.3.2 Sample documents

We generate these documents ourselves. They are German, carry a "MUSTER / SAMPLE" watermark, and have a real text layer, so extraction and highlighting work.

1. **Grundbuch (land register extract), 4 pp.**
   - p. 1, Bestandsverzeichnis (inventory): lfd. Nr. 1, Flurstück 123/4, Gebäude- und Freifläche, Musterstraße 12, 480 m².
   - Abteilung II no. 1: "Beschränkte persönliche Dienstbarkeit (Leitungsrecht) für die städtischen Versorgungsbetriebe; eingetragen am 14.03.1998."
   - Abteilung III: one Grundschuld (land charge), which is financing and not value-relevant.
2. **Mieterliste (tenant list), 2 pp.** The 8 units of §5.3.3, with a total row: "Summe Nettokaltmiete / Monat 5.040,30 €", 565,0 m².
3. **Energieausweis (energy certificate).** Address Musterstraße 12; gas condensing boiler from 2019; final energy demand 128 kWh/(m²·a); class D; living area 565 m².
4. **Sanierungsübersicht (refurbishment sheet).** The measures below, which add up to 13 modernisation points.
5. **B-Plan (zoning plan excerpt).** General residential area (WA); residential use permitted.

| Measure | Year | Points |
|---|---|---|
| Roof incl. insulation | 2016 | 4 |
| Windows | 2014 | 2 |
| Pipes / electrics | 2014 | 2 |
| Heating | 2019 | 2 |
| Bathrooms | 2014 | 2 |
| Interior, partial | 2014 | 1 |
| **Total** | | **13** |

**Photos (3):** the façade, plus two attic photos (terrace, living room). Placeholder illustrations are used until the founders supply real photos.

#### 5.3.3 Units

| # | Unit | Floor | m² | Rooms | In-place €/m² | In-place €/mo | Market €/m² | Market €/mo | Gap | Lease since | Value share v1 | Value share v2 |
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

**Features in the tenant list**
- Units 4 and 6: balcony.
- Units 3 and 7: bathroom renovated in 2014.
- Unit 8: roof terrace, roof insulated in 2016. It is the only unit with photos (2).
- Units 1 and 5: courtyard side. Unit 2: street side.

**Market rent.** The rent estimator (§6.3) on the bundled comparables (§5.3.7) produces the market rents above.

| | Unit 1 | Unit 2 | Unit 3 | Unit 4 | Unit 5 | Unit 6 | Unit 7 | Unit 8 |
|---|---|---|---|---|---|---|---|---|
| Comparables used | 9 | 8 | 11 | 12 | 9 | 8 | 10 | 6 |
| Confidence | medium | medium | medium | high | medium | medium | medium | medium |

Building average: 9.60 €/m², plausible range 9.10–10.20.

**Value per unit** is the building value split by each unit's share of market rent, rounded to €100. Any rounding difference goes to the largest unit. The UI says: *"The building is valued as one asset (one plot, one cap rate); the unit values are a split, not separate valuations."*

#### 5.3.4 AI run log (C3.2 and C4, plus history in V2)

| # | Step | Kind | Result |
|---|---|---|---|
| 1 | Read tenant list | live AI | 8 units, 565 m², €60,484/yr |
| 2 | Read land register | live AI | Plot 480 m², 1 easement; land charge ignored |
| 3 | Read energy certificate | live AI | Gas, 2019, class D, 565 m² |
| 4 | Read refurbishment sheet | live AI | 6 measures 2014–2019, 13 points |
| 5 | Read zoning plan | live AI | Residential, no value effect |
| 6 | Look up land value | sample BORIS table | 520 €/m², zone 0412, as of 01 Jan 2026 |
| 7 | Look up cap rate | sample market report 2026, p. 47, table 12 | 2.5–3.5 % for pre-war MFH, median 3.0 %, n = 64 |
| 8 | Estimate market rent | rent estimator | 9.60 €/m² average |
| 9 | Score modernisation | rules | 13 points → 42 years remaining life |
| 10 | Compute value, run cross-checks, flag judgement calls | engine | |
| 11 | Draft the report | | |

Durations are measured, not fixed.

**The 6 cross-checks, all computed from the extracted data:**
1. The rent total row equals the sum of the 8 rows.
2. Living area in the tenant list equals living area in the energy certificate.
3. The heating year agrees between the refurbishment sheet and the energy certificate.
4. The address in the energy certificate matches the land register.
5. The zoning plan permits residential use.
6. No unit's in-place rent exceeds market rent by more than 30 %, i.e. no implausible over-rent.

#### 5.3.5 Valuation: engine definition and canonical results

The engine implements the general method of § 28 ImmoWertV.

| Item | Definition | v1 | v2 (cap rate 3.4 %) |
|---|---|---|---|
| Gross market income (RoE) | Σ unit market rent × 12 | 65,088.00 | same |
| Management | units × €367 (ImmoWertV Annex 3 model value, indexed; sample) | 2,936.00 | same |
| Maintenance | m² × €14.40 (Annex 3, indexed; sample) | 8,136.00 | same |
| Rent-loss risk | 2 % × RoE | 1,301.76 | same |
| Operating costs (BWK) | sum of the three above (19.0 %) | 12,373.76 | same |
| Net income (RE) | RoE − BWK | 52,714.24 | same |
| Land value (BW) | plot m² × land value per m² | 249,600.00 | same |
| Cap rate (LZ) | AI pick: median of the committee range | 3.0 % | 3.4 % (valuer) |
| Land-value interest | BW × LZ | 7,488.00 | 8,486.40 |
| Building net income | RE − land-value interest | 45,226.24 | 44,227.84 |
| Remaining economic life (RND) | Total life 80 yrs; modernisation points per the Annex 2 model, simplified (monotonic in points; 13 points on a 1912 building → 42 yrs) | 42 yrs | same |
| Present-value factor (BWF) | (1 − (1+LZ)^−RND) / LZ | 23.7014 | 22.1897 |
| Building income value | building net income × BWF | 1,071,923.36 | 981,404.65 |
| Preliminary income value | building income value + BW | 1,321,523.36 | 1,231,004.65 |
| Under-rent deduction (boG) | (RoE − in-place 60,483.60) × annuity factor (LZ, 5 yrs) | −21,086.80 | −20,848.12 |
| Easement deduction (boG) | AI assumption | 0 | 0 |
| Vacancy deduction (boG) | §6.3; none in the sample | 0 | 0 |
| **Market value** | rounded to €10,000 | **€1,300,000** | **€1,210,000 (−6.9 %)** |
| €/m² · gross multiplier | | 2,301 · 20.0× | 2,142 · 18.6× |

**Sensitivities**, each computed by the engine with only that one input changed:

| Input | Varied over | Value at the ends of the range | Effect on value |
|---|---|---|---|
| Cap rate | 2.5 / 3.5 % | €1.43 M / €1.19 M | +€128k / −€111k |
| Market rent | 9.10 / 10.20 €/m² average | €1.24 M / €1.38 M | −€63k / +€76k |
| Under-rent closing | 3 / 8 years | | +€8k / −€11k |
| Easement | | | 0 to −€12k (an assumption, not computed) |

#### 5.3.6 The AI judgement calls (flags)

Flags are **generated by rules from the data**, and every flag text is a template filled from the data. For the sample deal the rules produce exactly the 4 flags below, ranked by € impact.

| # | Call | Confidence | Why flagged | What would change the AI's mind |
|---|---|---|---|---|
| 1 | **Cap rate 3.0 %** | medium | The market report gives no district figure for 04109, so the AI used the city-wide median of the 2.5–3.5 % range for pre-war MFH. | A district cap rate, or recent sales of pre-war houses in 04109. |
| 2 | **Market rent 9.60 €/m² average** | medium | These are asking rents, not leases, and 15 of the 38 listings are older than 12 months. | — Support: unit 4 was re-let in 2025 at 9.40 €/m² against an estimate of 9.55 €/m². |
| 3 | **Under-rent closes within 5 years** | medium | Rent increases in sitting tenancies are capped (§ 558 BGB, local rent index). | The dates of the last rent increase per unit. |
| 4 | **Easement value-neutral** | low | The route of the utility line is not documented; the AI assumes it runs along the boundary. | A cadastral map showing the line crossing the buildable area. |

**Generating rules (my call):**

| Rule | Raises a flag when |
|---|---|
| Cap rate | there is no district-level value |
| Market rent | estimator confidence is below high, i.e. fewer than 10 comparables or more than 30 % older listings across the building |
| Under-rent duration | the total gap exceeds 3 % |
| Easement | each section II entry |
| Missing document | each required document that is missing |
| Extraction | each field the extraction marked uncertain |
| Manual unit | each unit added by hand, with its estimated rent |
| Vacancy | each vacant unit |

**Spot-check.** In addition, the screen picks one random verified figure for the valuer to confirm, e.g. plot area 480 m² on land register p. 1.

#### 5.3.7 Bundled lookup data (sample)

**BORIS sample table**
- Zone 0412 covers the 04109 sample area: 520 €/m², as of 01 Jan 2026.
- Any other address gets 400 €/m² as "no sample data for this address", plus a low-confidence flag. *My call.*

**Market report 2026, p. 47, table 12 (sample)**

| Property type | Range | Median | n |
|---|---|---|---|
| One- and two-family houses | 1.5–2.5 % | 2.0 % | 112 |
| MFH built up to 1948 | 2.5–3.5 % | 3.0 % | 64 |
| MFH built 1949 or later | 3.0–4.0 % | 3.5 % | 41 |
| Mixed residential/commercial | 3.5–5.0 % | 4.2 % | 27 |

**Comparables.** 38 listings within 1 km of the sample address: 23 listed within the last 12 months, 15 older and index-adjusted. Each has location, m², floor, features, €/m² and listing date. The set is constructed so that the estimator reproduces §5.3.3.

**Plausibility references**

| Check | Range |
|---|---|
| €/m² vs. 7 recent Censio valuations of pre-war MFH in Leipzig | 2,050–2,520 |
| Gross multiplier vs. market report | 17.5–23.0× |

### 5.4 Valuer review screen (A v2)

The reference is [`mockups/valuer-review-A2.dc.html`](mockups/valuer-review-A2.dc.html). From top to bottom:

1. **App bar:** wordmark; nav (Review queue (14), Deals, Clients, Reports); a "Sample data" pill; the valuer avatar.
2. **Queue rail** on the left; it stacks above the content on narrow screens.
   - Deal rows: ID, city · type, number of checks, estimated review time.
   - Footer: "Today: 9 signed off · 1 sent back to AI · median review time 1:41".
3. **Deal header:**
   - the property photo uploaded by the client;
   - a mini map with the plot outline and the BORIS zone;
   - ID, address, facts, basis and scope;
   - status "Awaiting your review", with a summary of what the AI did and how long it took.
4. **Revision banner** (only after a revalue): the note, the table of changes against the previous version, the AI note, and **Undo last revision**. *My call:* the mockup's "Attach source" button is dropped, because a dead button would be the first thing clicked in class.
5. **Verdict band:**
   - the value with its version label, and the previous value struck through once revised;
   - plausibility as two dot strips;
   - the provenance bar, with counts per source type computed from the figure registry;
   - Approve & send report, Revalue…, "x of n reviewed", Preview report draft.
6. **"How the value is built" strip:** tiles from market rent to market value. Each tile carries its source marker and its link to a flag.
7. **Units:** a table with expandable rows (m², in-place €/m², market €/m², gap, lease since, value share).
   - An open row shows: floor, rooms, features, rent per month with its sources, the AI note, and photos.
   - **Expand all units**; a total row; the explanatory sentence from §5.3.3.
8. **Needs your eye:**
   - the flags ranked by € impact, each with a swing bar on one shared scale;
   - clicking a flag focuses it: why flagged, what would change the AI's mind, **Accept** and **Revalue…** with a note box;
   - a spot-check row;
   - "Verified automatically: n numbers · 6 cross-checks passed", which expands into the ledger.
9. **Evidence pane** on the right; it stacks on narrow screens. It shows the source of the focused item:
   - **For document sources:** the **real PDF page in the PDF viewer, with the extracted passage highlighted**.
   - **For lookups:** the sample table, with the row highlighted.
   - **For the rent estimate:** a map of the comparables, solid for recent and hollow for older listings.
   - **For the easement:** the land register passage plus a plot sketch showing the assumed route of the line.

**Source markers** always combine a glyph, a colour and words; colour alone is never used.

| Source type | Colour |
|---|---|
| Client document | blue |
| Public data | teal |
| § ImmoWertV rule | slate |
| = Calculated | grey |
| ≈ AI estimate | amber; flagged ones hatched |
| Changed by client | blue outline |
| Changed by valuer | violet, with initials |

An accepted AI figure keeps its AI marker and gains "Accepted · KV".

**Accountability copy.** The valuer is the signatory of record and the AI is the preparer. The PDF review log records what was accepted or changed, and by whom.

### 5.5 Provenance model

Every displayed figure is an entry in a **figure registry** with these fields:

| Field | Content |
|---|---|
| `id`, `label`, `value`, `unit` | Identity and value of the figure |
| `sourceType` | One of client_document, public_data, regulation, calculated, ai_estimate, client_input, valuer |
| `sourceDetail` | For extracted figures: document id, **page** and **verbatim quote**. For lookups: table and row. For rules: annex reference. |
| `confidence` | For AI-extracted and AI-estimated figures |
| `dependsOn[]` | For calculated figures |
| `flagId?` | Link to a flag, if any |

The provenance bar, the ledger, the PDF highlights and the outlining of dependent figures during a revision all come from this registry.

### 5.6 PDF report

The report is generated in the app. It is downloaded from C5 and previewed from V2.

1. **Cover:** address, client, valuation date, market value, version.
2. **Summary** in plain English.
3. **Property and documents:** includes the documents that changed nothing, such as the B-Plan.
4. **Units table.**
5. **Calculation** (the steps of §5.3.5).
6. **Assumptions and AI judgement calls**, each with its status: accepted, changed by valuer (with the note), or accepted at sign-off without opening.
7. **Sources:** document, page and quote.
8. **Review log:** valuer, timestamps, all versions including undone ones.
9. **Disclaimer:** "Prototype with sample data — not a valuation report."

---

## 6. AI: what is live, what is deterministic

### 6.1 Document extraction (live)

**One Claude call per uploaded PDF.** The PDF is sent as a base64 document block. The model:
1. classifies the document: tenant list, land register, Wohnungsgrundbuch, energy certificate, refurbishment sheet, zoning plan, or unknown;
2. extracts the fields of that type's schema.

**Output format.**
- Structured outputs (`output_config.format`, JSON schema).
- Each field returns `{value, page, quote, confidence}`, where `quote` is the verbatim text the value was read from.
- The Citations API is not used: it is incompatible with structured outputs, so page and quote are part of the schema instead.

**Parallel calls.** The 5 documents are read in parallel. C3.2 shows progress per file.

**Validation on the server:**
- schema and value ranges;
- the quote must actually occur on the stated page of the PDF's text layer, otherwise the field is marked uncertain;
- the cross-checks of §5.3.4.

Uncertain or failed fields raise extraction flags.

**Photos** are stored and displayed, but not sent to the AI.

### 6.2 Revalue note (live)

**Input:**
- the note;
- the parameters of the latest version, so revisions are cumulative;
- the allowed parameters and their ranges;
- the flag context: reasoning and sources.

**Structured output:**
- `intent` ∈ {change_parameters, question, unclear};
- `changes[] {parameter, unitId?, from, to, reason, sourceKind: "valuer_judgement" | "document", documentId?}`;
- `explanation`: 1–3 sentences in plain English;
- `answer`, if the intent is a question.

**Changeable parameters:**

| Parameter | Allowed range |
|---|---|
| Cap rate | 2.0–6.0 % |
| Average market rent (applied proportionally) | 6–15 €/m² |
| Market rent of one unit | 6–15 €/m² |
| Under-rent closing years | 1–10 |
| Easement deduction | €0–50,000 |
| Remaining economic life | 20–60 yrs |

**Guardrails:**
- Sourced facts cannot be changed by a note: areas, in-place rents, land value.
- Valuer-provided ranges are recorded as valuer judgement.
- `"document"` is allowed only when the note cites one of the deal's uploaded documents. The server validates `documentId`; otherwise the change is downgraded to valuer judgement.
- The AI never invents sources.
- A note that is out of range or ambiguous gets a clarifying question back.
- A question is answered without creating a new version.

**In the video:** the rehearsed note for check 1 (§5.3.6) must map to cap rate 3.4 %, giving exactly v2. The server checks this. The numbers come from the engine; the wording of the explanation may vary between takes.

### 6.3 Deterministic parts (no AI call)

- **Valuation engine:** a pure function (§5.3.5).
- **Rent estimator (my call):**
  1. For each unit, take the comparables in a similar size band (±20 m²) and floor class.
  2. Weight them by distance and recency, and take the weighted median €/m².
  3. Add transparent feature adjustments: balcony, roof terrace, ground floor, courtyard or street side.

  The output is a rent, the number of comparables used, and a confidence. It works for **any** unit, including one added by hand.
- **Vacant units (my call):** market rent is used as income, minus a re-letting deduction of 6 months' market rent (boG). A flag is raised.
- **Remaining economic life:** from modernisation points, as defined in §5.3.5.
- **Lookups:** the BORIS and market-report sample tables.
- **Flags and texts:** generated by rules and templates (§5.3.6). No figure in any text is hard-coded.

### 6.4 Usage limits, cost and fallback

**Model.**
- Claude Opus 5.5 (`claude-opus-5-5`, $4 per million input tokens and $20 per million output tokens) for both calls.
- Effort `low` for extraction and `medium` for notes.
- Refusal handling: check `stop_reason`, with server-side fallbacks enabled.
- Switching to a cheaper model to save cost is the founders' decision: Claude Sonnet 5.5 costs about half, Claude Haiku 5.5 a fraction.

**Cost estimate, Opus 5.5.**

| Item | Estimate |
|---|---|
| Full extraction of the sample deal (5 PDFs, about 17 pages) | about $0.30–0.45 |
| One Revalue note | about $0.03–0.06 |
| One complete demo run | about $0.50 |

**Hard cap.** A dedicated Anthropic workspace and API key for the prototype, with a **monthly spend limit set in the Anthropic Console** (suggested $20). This is the guarantee; everything below is a courtesy layer.

**Access code.** Live AI runs only for links that carry `?code=…`, matching the environment variable `DEMO_ACCESS_CODE`. The founders give this link to the professor. Without the code, the app runs in Demo mode.

**Limits in the app:**
- per IP, at most 3 deal extractions and 15 notes per hour (best effort on serverless);
- at most 8 files per deal, 10 pages and 5 MB per PDF;
- notes up to 1,000 characters;
- capped `max_tokens`.

**Cache.** Extraction results are keyed by the file's SHA-256.
- The bundled sample PDFs ship with a committed extraction result, recorded once from a real run.
- It is used in Demo mode, and in Live mode only when a limit is hit. It is then labelled "cached AI result".

**Demo mode** (no key, no access code, or limit reached):
- The bundled samples are "read" from the cache.
- Unknown files show "Live AI is needed to read this document".
- The Revalue note uses a rule-based parser that covers all six parameters (e.g. "use 3.4 %", "attic rent 9.50"), with clickable example notes.
- The badge shows "Demo mode".

---

## 7. Architecture and stack (my calls)

- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS. Fonts: Inter, plus Space Grotesk for headings and figures.
- **Server routes** (Anthropic TypeScript SDK `@anthropic-ai/sdk`, streaming for long requests):
  - `app/api/extract` takes one PDF and returns the classified, extracted fields, validated as in §6.1;
  - `app/api/revalue` takes a note and context and returns structured changes (§6.2).
- **Client state:**
  - uploaded files and photos in IndexedDB;
  - the deal and version state in `localStorage`;
  - **Reset demo** clears both;
  - no database.
- **Pure modules with unit tests:**
  - `lib/valuation`: the engine; tests reproduce §5.3.5 v1/v2 within €1 and the unit shares of §5.3.3;
  - `lib/rent`: the estimator; tests reproduce the market rents of §5.3.3;
  - `lib/flags`: the flags.
- **PDF viewer:** `pdfjs-dist`, highlighting the quote in the text layer.
- **PDF report:** generated client-side (e.g. `@react-pdf/renderer`).
- **Map:** Leaflet with OpenStreetMap tiles. The plot, zone and comparables are drawn as sample overlays.
- **Sample assets:** sample PDFs are generated once by a script and committed under `public/sample/`. The extraction cache fixture is committed too.

**Deployment**
- The founders import the repo into Vercel and set `ANTHROPIC_API_KEY` and `DEMO_ACCESS_CODE`.
- Vercel Hobby is meant for non-commercial use. That suits the class prototype; move to Pro once the app is used commercially.
- This build session has no Vercel access, so the builder verifies locally:
  - a production build (`next build && next start`);
  - one live-AI run against the sample PDFs;
  - an end-to-end smoke test of the demo path.

  The builder hands over a deploy checklist; the founders do the final click-through on the hosted link.

---

## 8. Left to the builder, and the cut order

**Left to the builder:**
- component and folder structure;
- exact styling within the mockup's visual language;
- animation timings;
- PDF report layout;
- library choices within §7;
- prompt wording, within §6;
- the test strategy beyond the tests named above.

**Cut order if time runs short.** The demo path itself is never cut. Cut in this order:
1. P1 "How Censio works".
2. Leaflet → the mockup's static SVG maps.
3. PDF highlighting → page display without highlight.
4. Merge wizard steps C3.1 and C3.2.

---

## 9. Open questions for the founders

1. **Dates of the video recording and the class** (not answered yet). Until then the assumption is: build the full demo path first, then polish.
2. **Model choice.** Claude Opus 5.5 is the default. A cheaper model (Sonnet 5.5 or Haiku 5.5) would lower cost per run; that is the founders' call.
