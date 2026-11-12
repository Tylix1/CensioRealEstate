# Censio RE — 5-minute pitch deck: design

Date: 2026-11-12 · Status: draft for approval

## 1. Goal and constraints

- A 5-minute class pitch ("AI Native Ventures") including a 30-second demo of the coded prototype.
- Built on the team's purchased PowerPoint template. We keep its grid and strip the decoration.
- Colours and fonts come from the prototype, so the deck and the demo look like one product.
- Follows the course outline (vision → use of proceeds). The course tips allow merging and reordering slides.
- Headlines are catchy one-liners. Sub headlines explain the slide for the reading version.
- Numbers come from public sources (appendix A) or are clearly labelled assumptions (appendix B).
- Team slide: shows the AI-native organisation, not people. Names and roles get added when the team sends them.

## 2. Deliverables

| File | Purpose |
|---|---|
| `pitch/Censio-Pitch.pptx` | Editable deck with a speaker script in the notes and the demo video embedded |
| `pitch/Censio-Pitch.pdf` | Backup for presenting, with fonts embedded (no video) |
| `pitch/censio-demo-30s.mp4` | 30-second screen recording of the prototype (Playwright, demo mode) |
| `pitch/README.md` | How to present, edit and rebuild the deck; font install notes; sources |
| `pitch/build/` | Build script (python-pptx) and recording script, so the deck can be rebuilt |

The raw template file is not committed: it is a licensed asset, and the repository is public. The build script reads it from a local path.

## 3. Visual system

**Grid kept from the template:** light page, title top-left with the small vertical marker, the short accent tick on the left edge, page number bottom-left, and generous white space.

**Removed from the template:** stock icons, hexagons, Venn diagrams, light bulbs, dotted patterns, "Write your subtitle here" blocks and lorem ipsum.

**Colours (prototype tokens, `src/app/globals.css`):**

| Role | Colour | Used for |
|---|---|---|
| Brand | `#0b5d4b` (Censio green), weak `#e6f2ee`, accent `#7fd1b9` | Titles marker, key numbers, Censio in charts |
| AI | `#a3410a` text, `#f79009` strong, `#fff4e5` weak | Everything the AI does |
| Valuer | `#5b3cc4`, weak `#f1edff` | Everything the senior valuer does |
| Documents | `#1849a9`, weak `#eaf1ff` | Source documents |
| Ink | `#101828`, secondary `#475467`, faint `#98a2b3` | Text |
| Page | `#f2f4f7` background, `#ffffff` cards, `#e4e7ec` lines | Layout |

The colour code teaches the story: orange = AI, violet = human senior, green = Censio. It is the same code the prototype uses.

**Fonts:** Space Grotesk for headlines, Inter for text, as in the prototype. Both are free Google Fonts. Google Slides has both built in. In PowerPoint, the team installs them once (2 minutes, described in `pitch/README.md`). The PDF embeds them, so it always looks right.

**Images:** real screenshots of the prototype (deal review, AI flags, Ertragswert breakdown, report) instead of stock icons. The template's laptop mockup frames the demo and the hero screenshot.

## 4. Slide plan (12 slides, 5:00 including the 30-second demo)

| # | Course outline | Headline (one-liner) | Sub headline (reading version) | Content | Time |
|---|---|---|---|---|---|
| 1 | Title | **Censio** — Signed property valuations in 48 hours, not 6 weeks. | AI-native valuation firm for income-producing real estate in Germany. | Logo, one-line claim, hero screenshot in laptop frame | 0:10 |
| 2 | Vision + Mission | Every property deal deserves a value you can trace. | Vision and mission in one sentence each. | **Vision:** every property decision rests on a signed value that anyone can trace back to its sources. **Mission:** AI does the groundwork and senior valuers make the call, so investors get a signed ImmoWertV valuation in 48 hours for less than half of today's fee. | 0:20 |
| 3 | Problem | Every deal waits weeks for one signature. | A full valuation of a €1–3m apartment building costs €4,360–6,800 and takes 3–6 weeks, and the people who sign it are retiring. | Three big numbers: **3–6 weeks** (private valuer; public boards 4–6 months) · **€4,360–6,800** net fee (BVS 2026, €1–3m property) · **Ø 60 years** average age of sworn experts, 10–12% fewer than 5 years ago. Footnote: ~35 expert hours per report (fee ÷ €125/h court rate). | 0:35 |
| 4 | Playbook + Solution | AI does the groundwork. Seniors make the call. | Our playbook splits every valuation into what AI does reliably and what only a senior valuer can sign. | Five steps in colour code: **Read** (AI reads land register, rent roll, energy certificate, plans) → **Research** (AI pulls land values, rent index, comparables) → **Compute** (AI runs the Ertragswert per ImmoWertV §§ 27–34, every number cited) → **Flag** (AI marks judgement calls) → **Decide** (senior approves or revalues, then signs). Proof line: ~US$0.50 of AI per valuation · ~2 senior hours instead of ~35. | 0:30 |
| 5 | Demo | From PDF to signed value in 30 seconds. | Recorded from our working prototype. | Embedded 30-second video in the laptop frame (upload → AI at work → flagged call → Revalue → approve → report). Live demo optional; the video is the backup. | 0:30 |
| 6 | Market size | A €390m market every year — we start with apartment buildings. | Germany sells ~73,500 income properties a year, and each needs one or two valuations. Our beachhead is buy-side valuations of multi-family houses. | TAM/SAM/SOM rings: **TAM €390m/yr** (income-property sales × 1.5 valuations × €3,500) · **SAM €61m/yr** (buy-side valuations of ~34,700 MFH sales) · **SOM €4.8m by 2031** (2,400 valuations, ~8% of SAM). Context line: €278bn changed hands in 2025 (872k deals). Lending, refinancing, funds and tax valuations come on top. | 0:25 |
| 7 | Competition | Fast or signed — today you have to pick one. | AVMs answer in seconds but nobody signs them. Valuers sign but take weeks. Censio is both. | 2×2: x = time to value (weeks → hours), y = signed by a qualified valuer. AVMs & portals (PriceHubble, Sprengnetter, on-geo LORA, ImmoScout24): fast, unsigned. Short reports (€300–900, 2–7 days, not for banks or courts). Big firms & sworn experts (CBRE, JLL, Savills, öbuv/HypZert): signed, 3–6 weeks. **Censio**: signed, 48 hours. Side notes: "Why the signature stays: CRR III Art. 229 requires an independent valuer; a German court paid €0 for an undisclosed AI report (LG Darmstadt 2025)." "US proof: Bowery Valuation, a tech-enabled appraisal firm, raised >$80m." | 0:25 |
| 8 | Traction (North Star) | Our north star: signed valuations delivered within 48 hours. | What we steer by, and where we honestly stand today. | North star + three input metrics: senior minutes per valuation (target ≤ 120), share of AI values accepted without Revalue, repeat customers. **Today:** working prototype (live AI reads 5 document types, computes the Ertragswert, valuer reviews with Approve/Revalue). **Next 90 days:** design partners and shadow valuations against signed reports. *(Team: add real interviews, LOIs or pilots here.)* | 0:20 |
| 9 | GTM & revenue | Land with investors, expand to funds and banks. | €2,000 per signed valuation for multi-family investors first; portfolio revaluations, banks and commercial follow. | Timeline 2027 → 2030: investors & asset managers (direct sales, broker partners, industry events) → portfolio and fund revaluations (€1,100) → banks (€2,200, HypZert-certified seniors) → commercial + DACH (€3,200). Stacked revenue bars by segment: €0.2m · €1.0m · €2.7m · €5.5m · €9.2m. | 0:30 |
| 10 | Team | No juniors. Only seniors and AI. | An AI-native firm: AI does the junior work, so every person at Censio judges, signs or builds. | Org chart vs. classic pyramid: **Founders** (CEO, operations, product — names follow) → **Senior valuers** (HypZert/öbuv, sign every report) → **Small tech team** (AI and product). Classic firm: partner → seniors → many juniors and analysts. Proof numbers: one senior signs ~400 valuations a year vs ~30–50 in a classic firm; in 2031, 29 people deliver 4,800 valuations — a classic firm would need ~100–170 valuers. Context: AI is already removing the junior rung (Stanford 2025: −13% employment for 22–25-year-olds in AI-exposed jobs). | 0:30 |
| 11 | Financial projections | Break-even in 2029, 37% EBITDA margin by 2031. | Revenue, EBITDA and headcount 2027–2031, and what one valuation earns. | Revenue bars + EBITDA line (2027 −€0.6m → 2031 +€3.4m). Headcount 7 → 29. Unit economics per valuation: €2,000 price − €300 senior review − €40 data − €5 AI − €10 hosting − €70 insurance & payments = **~79% gross margin**. | 0:25 |
| 12 | Use of proceeds | €1.5m pre-seed to reach €1m revenue in 2028. | 24 months of runway (18 months even with zero revenue) for 650 signed valuations and 25 paying customers by the end of 2028. | Donut: product & AI 31% · senior valuers 29% · founders 19% · legal, compliance, recruiting, office 12% · go-to-market 9%. Milestones by end of 2028. Closing line: "Censio. Signed valuations at the speed of the deal." | 0:20 |

Total: 5:00. Slides 2 and 3 can shrink by 5 seconds each if the demo runs long.

### Speaker script

Each slide's notes hold the spoken text (~650 words for 4:30 of talking), with the sources listed under it. The script is in English, like the slides and the prototype. A German version can follow on request.

## 5. Build approach

1. Copy the template, keep its slide master and one clean layout, delete all 328 sample slides and unused media, and change the theme colours and fonts to the prototype tokens.
2. Build the 12 slides with python-pptx: native shapes, native charts (editable in PowerPoint), real text boxes.
3. Take the screenshots and the 30-second demo video from the running prototype with Playwright (demo mode, no API key needed), and embed the video on slide 5.
4. Render to PDF with LibreOffice and check every slide as an image: overflow, overlap, contrast, alignment, numbers matching appendix A.
5. Independent review pass (a professor and an investor perspective) against the rendered slides; fix what it finds.

## 6. Open points for the team

- Names and roles for the team slide.
- Any real traction (interviews, letters of intent, pilots) for slide 8.
- Confirm the commercial assumptions: €2,000 price, €1.5m pre-seed ask, 2027 start.
- Live demo, video, or both?

## 7. Changes after the team's feedback (12 Nov 2026)

- Slides and speaker script in English.
- Price €2,000 per valuation. A later deal-platform fee (buyers and sellers already on Censio) appears on the GTM slide as an option, outside the numbers.
- Traction = the working prototype; no customers claimed.
- Team = 4 founders (CEO, Head of AI, Head of Business Development, Head of Sales; roles are placeholders) as overhead, plus senior valuers and a small platform team. No juniors. Names live only in the gitignored `pitch/build/team.local.json`.
- Model rerun with 4 founders and a leaner platform/sales team: headcount 7 → 25 (2031); EBITDA 2029 +€0.5m, 2031 +€3.7m (40%); runway 18 months at zero revenue. Use of proceeds grouped by purpose: Build 30%, Deliver 30%, Sell 20%, Run 20%.
- Headlines shortened to fit one line: "A €390m market, starting with apartment buildings", "North star: signed valuations within 48 hours", "Land with investors, then add funds and banks", "Break-even in 2029, 40% EBITDA margin by 2031", "€1.5m pre-seed to reach €1.0m revenue in 2028".
- `pitch/build/model.py` and `numbers.json` replace appendix B's plan table as the single source of the numbers.

---

## Appendix A — Sourced numbers

| Number | Value | Source |
|---|---|---|
| German property sales 2025 | ~872,000 contracts, €278bn (+8% / +13%) | AK OGA / BBSR, [press release 2026](https://www.bbsr.bund.de/BBSR/DE/presse/presseinformationen/2026/immobilienmarktanalyse-gutachterausschuesse.html) |
| Multi-family house (MFH) sales | 34,700 / €31.4bn (2024); >38,700 / ~€36.5bn (2025 forecast) | [GEWOS IMA 2025](https://gewos.de/wp-content/uploads/sites/16/2025/09/GEWOS-Pressemitteilung-IMA-2025.pdf) |
| Commercial property sales | 38,800 / €38.5bn (2024); 42,200 / €42.7bn (2025 forecast) | [GEWOS IMA 2025](https://gewos.de/wp-content/uploads/sites/16/2025/09/GEWOS-Pressemitteilung-IMA-2025.pdf) |
| 2026 outlook | Residential sales −4.4% to ~612,000; MFH transactions expected to grow slightly | GEWOS via dpa, [boerse-online](https://www.boerse-online.de/dpa-afx/hohe-bauzinsen-nachfrage-nach-immobilien-kuehlt-sich-ab-552091.html) |
| Building stock | 3.5m MFH with 23.6m dwellings (end 2025) | Destatis, via [baulinks](https://www.baulinks.de/webplugin/2026/1031.php4) |
| Pfandbrief bank lending 2025 | €148.6bn new loans (+15.7%); MFH loans +27.4% | [vdp press release](https://www.pfandbrief.de/wp-content/uploads/2026/03/20260324_PM_vdp_Kreditgeschaeft_Q4_2025_DE_final.pdf) |
| Valuer fee guideline | €4,360 net (€1m), €5,580 (€2m), €6,800 (€3m) | [BVS-Honorarrichtlinie 2026](https://www.bvs-ev.de/fileupload/files/6a8ea166d1f80_BVS-Honorarrichtlinie_Fassung_2026.pdf) (non-binding) |
| Court rate for property valuers | €125/h (since 1 Jun 2025) | [JVEG Anlage 1](https://www.gesetze-im-internet.de/jveg/anlage_1.html) |
| Turnaround | Full report 3–4 weeks, up to 6; short report 2–7 days, €300–900 | [ImmoScout24](https://www.immobilienscout24.de/wissen/verkaufen/immobilienbewertung-dauer.html), [jacasa](https://www.jacasa.de/ratgeber/immobilienwert/wertgutachten-immobilie) |
| Public valuation boards | Heidelberg 4–6 months; Berlin ≥1 year in single cases | [service.berlin.de](https://service.berlin.de/dienstleistung/330803/pdf/) |
| Sworn experts | ~7,800 (IHK) + ~6,000 (HWK), all fields; Ø age 60; −10–12% in 5 years | [IHK Nürnberg](https://www.ihk-nuernberg.de/wim-wirtschaft-in-mittelfranken/ihk-magazin-wim-04-052025/details/hochkaraetige-experten-gesucht), [DIHK](https://www.dihk.de/de/newsroom/sachverstaendig-werden-ein-blick-in-die-praxis-156062) |
| HypZert valuers | >2,000 certified; ~200 new per year | [HypZert](https://www.hypzert.de/de/service/news/88-neu-zertifizierte-hypzert-gutachterinnen-0) |
| Bank rules | CRR III Art. 229: independent valuer required (from 1 Jan 2025); models may not be the sole means of review | [EBA Q&A 2020_5470](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2020_5470), [RICS position paper](https://rics.org/content/dam/ricsglobal/documents/latest-news/RICS-Position-Paper-on-the-implementation-of-CRR-in-Europe.pdf) |
| AI-written expert report | LG Darmstadt, 10 Nov 2025 (19 O 527/16): fee set to €0 | [LTO](https://www.lto.de/recht/nachrichten/n/lg-darmstadt-zu-sachverstaendigen-19o52716-gutachten-ki) |
| IHK AI guidance | AI only for auxiliary tasks; judgement stays personal; disclose AI use | [IHK KI-Handreichung (24 Jun 2026)](https://svv.ihk.de/blueprint/servlet/resource/blob/7105236/abccc01de9938b8bb0f1211ec892b43b/ki-handreichung-data.pdf) |
| ImmoWertV 2021 | In force since 1 Jan 2022; income approach §§ 27–34 | [buzer.de](https://www.buzer.de/27_ImmoWertV.htm) |
| Open-ended property funds | Two external valuers per property; values set every 3 months | [§ 250 KAGB](https://www.gesetze-im-internet.de/kagb/__250.html) |
| Bank valuation volume | on-geo: 1.6m valuation reports and 250,000 inspections a year; ~98% of Sparkassen use LORA | [bulwiengesa/on-geo press release](https://live.bulwiengesa.de/sites/default/files/2025-04/pm_bulwiengesa_ongeo_2025_final_neu.pdf), [on-geo LORA](https://www.on-geo.de/en/solutions/lora/lora-value-indication) |
| PriceHubble (AVM) | $34m Series B (2021) | [tech.eu](https://tech.eu/2021/07/19/swiss-proptech-pricehubble-raises-34-million/) |
| Bowery Valuation (US) | Tech-enabled appraisal firm; >$80m raised; $35m Series B led by Goldman Sachs (2021) | [BusinessWire](https://www.businesswire.com/news/home/20210628005506/en/Bowery-Valuation-Announces-35-Million-Series-B-Funding-Fueling-Rapid-National-Expansion) |
| CBRE / JLL 2025 | $40.6bn revenue, >155,000 staff / $26.1bn, >113,000 staff | [CBRE FY2025](https://www.businesswire.com/news/home/20260212253465/en/cbre-group-inc.-reports-financial-results-for-q4-and-full-year-2025/), [JLL 10-K 2025](https://s202.q4cdn.com/536608393/files/doc_financials/2025/q4/JLL-10K-2025.pdf) |
| Young workers and AI | −13% relative employment for 22–25-year-olds in the most AI-exposed jobs | [Stanford Digital Economy Lab, "Canaries in the Coal Mine" (2025)](https://siepr.stanford.edu/publications/working-paper/canaries-coal-mine-six-facts-about-recent-employment-effects-artificial) |
| Service-as-software | $4.6T opportunity (VC thesis) | [Foundation Capital](https://foundationcapital.com/ai-service-as-software/) |
| AI cost per valuation | ~US$0.50 per complete AI run (prototype measurement) | `README.md`; [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) |

## Appendix B — Assumptions (labelled on the slides as estimates)

| Assumption | Value | Why |
|---|---|---|
| Valuations per income-property sale | 1.5 (range 1–2) | Buyer and/or lender. No official count of valuations exists. |
| Average market fee per valuation | €3,500 | Between the BVS minimum (€2,750) and the €1m row (€4,360); average MFH deal ~€0.9m |
| Share of MFH purchases with a buy-side valuation | 50% (30–70%) | Not every buyer commissions one |
| Censio price | €2,000 (2027: €1,800 launch price) | Less than half of the BVS fee at €1m |
| Senior review time | 2 hours per valuation; 1,000 review hours per senior per year | Prototype flow: the AI prepares, the senior checks flagged calls |
| Fully loaded senior valuer | €150k per year | Senior HypZert/öbuv level |
| Variable cost per valuation | AI €5 (measured ~€0.45, plus buffer), data €40, hosting €10, PI insurance 2.5%, payments 1% | |
| Volumes 2027–2031 | 100 · 550 · 1,450 · 2,950 · 4,800 valuations | Segment ramp: investors first, then funds (2028), banks (2029), commercial + DACH (2030) |
| Headcount (year end) | 7 · 10 · 15 · 20 · 29 | 3 founders + seniors + tech + sales/ops |
| Pre-seed | €1.5m | Covers net burn 2027–28 (~€1.0m), working capital and a ~€0.4m buffer |

### Plan output (from the model in appendix B)

| | 2027 | 2028 | 2029 | 2030 | 2031 |
|---|---|---|---|---|---|
| Signed valuations | 100 | 550 | 1,450 | 2,950 | 4,800 |
| Revenue | €0.18m | €1.01m | €2.66m | €5.53m | €9.16m |
| Gross margin | −32% | 56% | 71% | 75% | 75% |
| EBITDA | −€0.62m | −€0.38m | +€0.32m | +€1.65m | +€3.38m |
| Headcount (year end) | 7 | 10 | 15 | 20 | 29 |
| Senior valuers (year end) | 2 | 3 | 5 | 9 | 14 |

Downside case (−40% volume, −10% price, 3 senior hours): still loss-making in 2031 (−€0.1m), cumulative −€2.6m. This is why the 90-day test of review time matters most.
