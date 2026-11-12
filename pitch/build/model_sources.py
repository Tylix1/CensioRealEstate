"""Documentation of every model input (label, unit, kind, sources, why) and the public sources behind them.

Kinds: S sourced public figure · B set from public benchmarks · T the founders' market experience · A plan assumption.
The Excel model (build_model_xlsx.py) prints this next to each input; SOURCES becomes its Sources sheet.
Sources were collected in Nov 2026. Most pages could only be read through search-engine extracts from this build
environment; the figures were cross-checked by a second search and are marked "check before external use" where
that check failed (see the 'figure' text).
"""

from __future__ import annotations

import model as M

SOURCES: dict[str, dict] = {}
DOC: dict[str, dict] = {}


def src(sid: str, title: str, use: str, figure: str, url: str = "") -> None:
    SOURCES[sid] = {"title": title, "use": use, "figure": figure, "url": url}


def doc(name: str, label: str, unit: str, kind: str, sources: list[str], note: str) -> None:
    assert kind in ("S", "B", "T", "A"), kind
    DOC[name] = {"label": label, "unit": unit, "kind": kind, "sources": sources, "note": note}


# ---- Sources: market and prices ---------------------------------------------------------------------------------------
src("gewos", "GEWOS Immobilienmarktanalyse (IMA) 2025, press release Sep 2025",
    "Sales and turnover of multi-family and commercial property; average deal size",
    "MFH 34,700 sales / €31.4bn (2024), 2025F >38,700 / €36.5bn; commercial 38,800 / €38.5bn (2024), 2025F €42.7bn",
    "https://gewos.de/wp-content/uploads/sites/16/2025/09/GEWOS-Pressemitteilung-IMA-2025.pdf")
src("cbre", "CBRE press release, Jan 2026", "European real-estate investment volume 2025", "€241bn (+13%)",
    "https://www.cbre.co.uk/press-releases/european-real-estate-investment-climbs-to-euro241-billion-in-2025-fuelled-by-big-gains-")
src("bvs", "BVS-Honorarrichtlinie 2026 (non-binding fee guideline for valuers)", "Classic fee for a €1m property",
    "€4,360 net at €1m; €5,580 at €2m; €6,800 at €3m",
    "https://www.bvs-ev.de/fileupload/files/6a8ea166d1f80_BVS-Honorarrichtlinie_Fassung_2026.pdf")
src("jveg", "JVEG Anlage 1 (court fees for experts)", "Hourly rate of a court-appointed property valuer",
    "€125 per hour since 1 Jun 2025", "https://www.gesetze-im-internet.de/jveg/anlage_1.html")
src("fees", "Team's market experience; ftimmobilien24 Munich guide",
    "What income-property valuations cost today", "Indicative valuation at large firms €3–5k (team); multi-family "
    "reports €4–8k (Munich guide)", "https://www.ftimmobilien24.com/immobilienmakler-münchen/verkehrswertgutachten-muenchen/")
src("broker", "Immowelt; reduco.ai; anwaltonline; Homeday", "Broker fees on multi-family and commercial deals",
    "~3% of the price per side is usual (up to 5% on commercial deals, 3–7% in total); freely negotiable",
    "https://www.anwaltonline.com/mietrecht/tipps/1215/maklerprovision-fuer-den-kauf-von-gewerbeimmobilien/")
src("tenx", "LoopNet help centre: buyer fee on Auctions by Ten-X", "Fee of the largest US online property auction",
    "3% of the winning bid, paid by the buyer (from 15 Sep 2025)",
    "https://investor-loopnet-help-center.helpscoutdocs.com/article/792-what-is-the-buyer-fee-when-purchasing-through-auctions-by-ten-x")
src("crexi", "Hotel Management: Crexi record Q4 2025 auction volume", "Scale of a leading US online property auction",
    "US$496m across 207 properties in Q4 2025 (≈830 a year at that pace)",
    "https://www.hotelmanagement.net/transactions/crexi-reports-record-q4-2025-auction-volume-posting-496m-across-207-properties")
src("nar", "HousingWire on the NAR Member Profile 2025", "Broker productivity (US, residential)",
    "Median 10 transactions per agent in 2024",
    "https://www.housingwire.com/articles/nar-realtors-show-resilience-amid-affordability-challenges/")
src("ev", "Engel & Völkers: about us", "Commission per professional at a large German broker",
    "€1.3bn commission revenue in 2025; >16,000 professionals (≈€81k each)",
    "https://www.engelvoelkers.com/de/en/company/about-us")
src("belwertv", "Beleihungswertermittlungsverordnung (BelWertV) § 5", "Lending values need a site inspection",
    "Inspection required (exceptions for small loans, § 24)", "https://www.gesetze-im-internet.de/belwertv/__5.html")

# ---- Sources: cost per valuation and per deal ---------------------------------------------------------------------------
src("claude", "Claude API pricing (Anthropic)", "AI cost per valuation run",
    "Opus 5.5 US$4 / US$20 per million input / output tokens; ≈€0.45 per complete run on the prototype",
    "https://platform.claude.com/docs/en/about-claude/pricing")
src("documents", "Official document fees: GNotKG KV 17000 (land register); Berlin service portal",
    "Official documents for a valuation", "Land-register printout €10; building-encumbrance register €17 (none) / "
    "€29 (copies); cadastral map €16 per sheet or free online; BORIS land values free online",
    "https://service.berlin.de/dienstleistung/331635/")
src("kps", "Purchase-price register extract fees: Berlin service portal; NRW fee schedule (2015); Münster",
    "Comparable sales from the official register (Kaufpreissammlung)", "Berlin €146 for up to 12 records; NRW €140 for "
    "up to 10 prices; Münster €40 + €100; Munich €250 incl. up to 8 prices; legitimate interest required",
    "https://service.berlin.de/dienstleistung/330797/")
src("qes", "Skribble pricing; meetergo comparison (D-Trust sign-me)", "Qualified electronic signature per valuation",
    "QES €4.00–4.50 at Skribble; ≈€1.50 at D-Trust sign-me", "https://www.skribble.com/pricing/")
src("travel", "§ 9 EStG travel allowance (lohn-info.de)", "Cost per km for a site visit by car", "€0.30 per km",
    "https://lohn-info.de/reisekosten.html")
src("pi", "Hiscox letter for valuers (09/2024); transparent-beraten.de; versicherungsmakler.ac",
    "Professional indemnity insurance", "AI-assisted valuation work is insurable; small-practice tariffs from "
    "€37 a month; statutory fallback cover only €250k per claim / €1m a year; no published premium for valuation "
    "firms", "https://brochureware.hiscox.de/sites/default/files/documents/a4-hiscox-kundenanschreiben-fuer-gutachter-092024.pdf")
src("stripe", "Stripe Invoicing pricing", "Invoicing and payment fees", "0.4–0.5% per paid invoice plus payment "
    "fees", "https://support.stripe.com/questions/stripe-invoicing-pricing")
src("dataroom", "Drooms Flex pricing", "Virtual data room per deal", "€17.90 per user per month (≈€0.5k per deal)",
    "https://drooms.com/de/flex")
src("gwg", "Stadt Mainz: GwG information sheet for brokers", "Anti-money-laundering duties of a broker",
    "Identify both parties and the beneficial owners on every deal; fines up to €50k for negligence",
    "https://mainz.de/vv/medien/Merkblatt-GwG-Neuerungen-des-GwG-in-2023-neu.pdf")

# ---- Sources: people --------------------------------------------------------------------------------------------------
src("ceilings", "Contribution ceilings 2026 (Sozialversicherungs-Rechengrößen), VR Bank explainer",
    "Social-security ceilings", "Pension & unemployment €101,400 a year; health & care €69,750 a year",
    "https://www.vr.de/privatkunden/news/beitragsbemessungsgrenze.html")
src("sv_rates", "Ihre-Vorsorge (Deutsche Rentenversicherung) and Haufe: contribution rates 2026",
    "Employer shares of social security", "Pension 9.3%; unemployment 1.3%; health 7.3% + 1.45% (half of the 2.9% "
    "average extra contribution); care 1.8%", "https://www.ihre-vorsorge.de/soziales/soziales-allgemein/artikel-2")
src("u3", "Techniker Krankenkasse: insolvency-benefit levy 2026", "Employer levy U3", "0.15% of gross pay",
    "https://www.tk.de/firmenkunden/service/fachthemen/fachthema-beitraege/insolvenzgeldumlage-2047584")
src("valuer_salary", "QTalents job ad on JOIN: Senior Immobilienbewerter / Senior Valuation Manager, Frankfurt",
    "Salary of a senior valuer", "€100,000–120,000 a year (StepStone: non-senior valuation experts average "
    "€54–60k)", "https://join.com/companies/qtalents1/16537227-senior-immobilienbewerter-senior-valuation-manager-m-w-d-oder-gewerbeimmobilien-oder-bis-ca-120k-eur-jahresgehalt")
src("eng_salary", "levels.fyi (senior software engineer, Berlin); Payscale (senior ML engineer, Berlin)",
    "Salary of a senior engineer", "Total pay median €92k (P75 €112k); ML base median €86k",
    "https://levels.fyi/t/software-engineer/levels/senior/locations/berlin-deu")
src("ravio", "Ravio x Handpicked Berlin: salary trends 2026", "Berlin tech salaries",
    "Median €80,000 (all roles); management track €100,300", "https://ravio.com/blog/berlin-salary-trends-2026")
src("ae_salary", "JOIN job guide: Senior Account Executive", "Salary of a B2B account executive",
    "Base median €62k + variable €21–36k (on-target €83–98k)", "https://join.com/en/job-guides/account-executive-senior")
src("tm_salary", "gehalt.de: Transaction Manager", "Salary of a transaction manager",
    "Median €6,073 a month (≈€73k a year)", "https://www.gehalt.de/beruf/transaction-manager")
src("founder_salary", "gruender.de: founder salaries; Creandum Founder Compensation 4.0 (Feb 2026)",
    "Founder salaries by stage", "Pre-seed ≈€50k; seed €50–75k; DACH median across stages ≈€100–115k",
    "https://www.gruender.de/gruendung/gehalt-fuer-grunder/")

# ---- Sources: overhead ------------------------------------------------------------------------------------------------
src("office", "Cushman & Wakefield Berlin office marketbeat Q1 2026; teamgnesda Office Report 2025",
    "Office cost per head", "Average new-letting rent €27.65/m² a month; 19.5 m² per employee (2025 report); "
    "≈13 m² in new-work offices (2026/27 edition)", "https://content.cushmanwakefield.com/api/public/content/3d19da5f64264fbcbd30d78f1c48c1e0")
src("saas", "Zylo SaaS Management Index 2025", "Software spend per employee", "US$4,830 per employee a year",
    "https://zylo.com/news/2025-saas-management-index")
src("hire", "HRworks, citing Mühlemann & Pfeifer (IZA)", "Cost per hire in Germany",
    "€4,700 per hire on average (2013 prices, all jobs)",
    "https://www.hrworks.de/news/cost-per-hire-was-kostet-ein-neuer-mitarbeiter-wirklich/")
src("tax_adviser", "Steuerberaterkammer Berlin, deGUT 2024", "Tax adviser for a start-up GmbH",
    "≈€4,843 net a year at €100k revenue", "https://stbk-berlin.de/wp-content/uploads/2022/10/2024_deGUT_Vortrag_4_neu.pdf")
src("do", "beancount.io: D&O insurance for start-ups 2026", "D&O premium",
    "≈3,500–6,000 a year for €1m cover at pre-seed/seed (currency of the source unclear; check before external use)",
    "https://beancount.io/de/blog/2026/05/10/directors-officers-d-and-o-insurance-startups-2026-coverage-limits-premium-benchmarks-investors-guide")
src("marketing", "Gartner CMO Spend Survey 2025", "Marketing as a share of revenue",
    "7.7% on average; IT and business services 5.8%",
    "https://www.gartner.com/en/newsroom/press-releases/2025-05-12-gartner-2025-cmo-spend-survey-reveals-marketing-budgets-have-flatlined-at-seven-percent-of-overall-company-revenue")

# ---- Sources: tax and cash ------------------------------------------------------------------------------------------
src("kst", "§ 23 KStG as amended by the Investitionssofortprogramm (Bundestag 26 Jun, Bundesrat 11 Jul 2025)",
    "Corporate tax rate", "15% to 2027; 14% 2028; 13% 2029; 12% 2030; 11% 2031; 10% from 2032",
    "https://www.bundesfinanzministerium.de/Monatsberichte/Ausgabe/2025/08/Inhalte/Kapitel-2-Fokus/investitionssofortprogramm-deutschland.html")
src("soli", "§ 4 Solidaritätszuschlaggesetz", "Solidarity surcharge", "5.5% of the corporate tax",
    "https://www.gesetze-im-internet.de/solzg_1995/__4.html")
src("trade_tax", "§ 11 GewStG; Berlin Senate Department for Finance (FAQ)", "Trade tax in Berlin",
    "Base rate 3.5%; Berlin multiplier 410% since 1999 (14.35% of the trade income)",
    "https://www.berlin.de/sen/finanzen/steuern/informationen-fuer-steuerzahler-/faq-steuern/artikel.9362.php")
src("min_tax", "§ 10d EStG / § 10a GewStG (Wachstumschancengesetz 2024): Handelskammer Hamburg; EY overview",
    "Minimum taxation of loss carry-forwards", "€1m offset in full; above it 70% (corporate tax 2024–2027), 60% "
    "from 2028; trade tax always 60%",
    "https://www.handelskammer-hamburg.de/recht-steuern/steuerrecht/allgemeine-informationen/wachstumschancengesetz-6680098")
src("bmf_it", "BMF letter of 22 Feb 2022 (Haufe)", "Useful life of computers for tax",
    "1 year allowed for computer hardware and software",
    "https://www.haufe.de/finance/jahresabschluss-bilanzierung/nutzungsdauer-von-computer-und-software_188_538794.html")
src("dso", "Creditreform Zahlungsindikator Deutschland, summer 2026", "How long German B2B customers take to pay",
    "Payment terms 32.21 days + 8.14 days late = 40.35 days (the late part only partly re-checked)",
    "https://www.creditreform.de/aktuelles-wissen/pressemeldungen-fachbeitraege/news-details/show/creditreform-zahlungsindikator-deutschland-sommer-2026")

# ---- Sources: peers (comparison only) ---------------------------------------------------------------------------------
src("scout24", "Scout24 preliminary results 2025; half-year report H1 2025", "Margin and revenue per employee of "
    "Germany's property portal", "ooEBITDA margin 62.5% on €649.6m revenue; 1,116 employees (≈€0.58m each)",
    "https://www.scout24.com/en/news-media/news/detail/scout24-veroeffentlicht-vorlaeufige-ergebnisse-fuer-2025-und-gibt-prognose-fuer-2026-bekannt-wachstum-und-starke-operative-entwicklung-bestaetigt")
src("rightmove", "Rightmove FY25 results (27 Feb 2026)", "Margin of the UK property portal",
    "Underlying EBITDA margin 72% (operating 70%) on £425.1m revenue",
    "https://plc.rightmove.co.uk/content/uploads/2026/02/Rightmove-RNS-27.02.26.pdf")
src("rea", "REA Group FY2025 (OnlineMarketplaces)", "Margin of Australia's property portal",
    "EBITDA excl. associates A$969m on A$1,673m revenue (≈58%)",
    "https://www.onlinemarketplaces.com/articles/rea-group-fy-2025-bumper-year-sees-15-revenue-growth-and-23-net-profit-growth/")
src("zillow", "Zillow Group results 2025", "Margin of a portal with transaction services",
    "Adjusted EBITDA US$622m on US$2,583m revenue (24%)",
    "https://zillowgroup.mediaroom.com/2026-02-10-Zillow-Group-Reports-Fourth-Quarter-and-Full-Year-2025-Financial-Results")
src("costar", "CoStar Group full year 2025", "Margin of a data company building a marketplace",
    "Adjusted EBITDA US$442m on ≈US$3.2bn revenue (≈14%)", "https://investors.costargroup.com/node/16481/html")
src("cbre_fy", "CBRE results 2025", "Margin of the largest real-estate services firm (incl. valuations)",
    "Core EBITDA US$3,308m on US$40.6bn revenue (≈8%)", "https://ir.cbre.com/press-releases/detail/261")
src("jll_fy", "JLL results 2025", "Margin of a real-estate services firm",
    "Adjusted EBITDA US$1,452.9m on ≈US$26.1bn revenue (≈5.6%)",
    "https://www.barchart.com/story/news/277106/jll-reports-2025-financial-results-for-fourth-quarter-and-full-year")
src("savills", "Savills results 2025", "Margin and revenue per head of a property consultancy",
    "Underlying profit before tax margin 5.7% on £2,550.9m; 42,000+ staff (≈£61k each)",
    "https://www.savills.co.uk/insight-and-opinion/savills-news/314660/results-for-the-full-year-ended-31-december-2025")
src("saas_rev", "SaaS Capital: revenue per employee, private SaaS (2025)", "Revenue per employee of software firms",
    "Median US$129,724", "https://www.saas-capital.com/blog-posts/revenue-per-employee-benchmarks-for-private-saas-companies/")
src("model", "Censio plan (this workbook)", "Plan assumptions we have to prove", "—", "")


# ---- Inputs -----------------------------------------------------------------------------------------------------------
LEVER_NOTE = "Multiplies the base plan; keep at 1.00× for the deck figures"
doc("LEVER_VOLUME", "Valuation volume", "×", "A", [], LEVER_NOTE)
doc("LEVER_PRICE", "Valuation prices", "×", "A", [], LEVER_NOTE)
doc("LEVER_HOURS", "Senior hours per valuation", "×", "A", [], LEVER_NOTE)
doc("LEVER_DEALS", "Marketplace deals", "×", "A", [], LEVER_NOTE)

SEG_NOTES = {
    "Investors (multi-family)": ("Beachhead: acquisition teams of investors; 100 in the pilot year, 2,400 in 2031 "
                                 "(≈14% of buy-side multi-family valuations)", "Below the €3–5k large firms charge "
                                 "for an indicative valuation; pilot price €1,800 in 2027", "The core bet: AI "
                                 "prepares, a senior checks and signs in 2 hours (classic: ~35 h)"),
    "Portfolio & fund revaluations": ("Repeat business from the same clients from 2028", "Revaluation of a known "
                                      "building: lower price", "Known building, changes only"),
    "Banks": ("Lending values from 2029, after the investor wedge", "Above the investor price: site visit included",
              "3 h review + 3 h site visit incl. travel (BelWertV § 5)"),
    "Commercial & DACH": ("Commercial property and Austria/Switzerland from 2030", "Larger, more complex buildings",
                          "More leases and uses to check"),
    "Owner listings": ("Owners list on the marketplace with a signed value from 2030", "Free: the valuation is how "
                       "we win listings (customer acquisition)", "Seniors still sign every listing value"),
}
for seg, (vol_note, price_note, hours_note) in SEG_NOTES.items():
    doc(f"VOL:{seg}", seg, "valuations", "A", ["model"], vol_note)
    doc(f"PRICE:{seg}", seg, "€ per valuation", "T" if seg.startswith("Investors") else "A",
        ["fees"] if seg.startswith("Investors") else ["model"], price_note)
    doc(f"HOURS:{seg}", seg, "h per valuation", "A", ["model"], hours_note)
doc("REVIEW_HOURS", "Review hours per senior a year", "h/yr", "A", ["model"],
    "Of ~1,700 working hours; the rest is quality control, client calls, training")
doc("MAX_UTILISATION", "Maximum senior utilisation in the plan", "%", "A", ["model"],
    "Head-room for peaks; the Checks sheet flags any year above it")

doc("AI_COST", "AI cost per valuation", "€ per valuation", "B", ["claude"],
    "Founders' estimate of ≈US$0.50 (≈€0.45) per complete run at list token prices; ×10 for re-runs, long "
    "documents and price changes")
doc("DATA_COST", "Official documents per valuation", "€ per valuation", "B", ["documents"],
    "Land register €10, building-encumbrance register €17–29, cadastral map free online to €16, land values free")
doc("COMPARABLES_FEE", "Purchase-price register extract", "€ per valuation", "B", ["kps"],
    "Berlin €146, NRW €140, Münster €140 (Munich €250 with 8 prices)")
doc("COMPARABLES_SHARE", "Share of valuations that need a register extract", "%", "A", ["model"],
    "Income approach uses free published yields; an extract only where comparables are thin. Our own closing prices "
    "replace it over time (data flywheel)")
doc("HOSTING_COST", "Hosting, storage & e-signature per valuation", "€ per valuation", "B", ["qes"],
    "One qualified e-signature (€4–4.50) plus hosting and storage")
doc("INSURANCE_PER_VALUATION", "Professional indemnity insurance per valuation", "€ per valuation", "A", ["pi"],
    "No published premium for valuation firms; the statutory fallback cover (€250k per claim) is too thin for "
    "multi-million buildings, so we budget high. Placeholder until a broker quote")
doc("SITE_VISIT:Banks", "Travel per bank site visit", "€ per valuation", "B", ["travel", "belwertv"],
    "Regional valuers: ≈150 km round trip at €0.30 per km plus parking; 6 h = 2 h driving + 1 h on site + 3 h review")
doc("PAYMENTS_RATE", "Invoicing & payment fees", "%", "B", ["stripe"], "Stripe Invoicing 0.4–0.5% per paid invoice")
doc("BAD_DEBT_RATE", "Bad debt", "%", "A", ["model"],
    "Unpaid invoices, on valuation revenue and on deal fees (not sourced)")

doc("DEALS", "Deals closed on Censio", "deals", "A", ["model", "crexi"],
    "Ambitious: 1,500 in 2031 is ≈2% of German income-property sales; Crexi's US auctions ran at ≈830 a year in "
    "Q4 2025. Test with the deals lever")
doc("AVG_TICKET", "Average deal size", "€", "A", ["gewos"],
    "Rounded up from GEWOS 2025F: €36.5bn / 38,700 multi-family sales ≈ €0.94m (2024: €0.90m)")
doc("TAKE_RATE", "Deal fee", "%", "A", ["broker", "tenx"],
    "Half of the ≈3% a broker takes per side; Ten-X charges buyers 3%")
doc("DEAL_VARIABLE", "Cost per closed deal", "€ per deal", "A", ["dataroom", "gwg"],
    "Data room ≈€0.5–1k (Drooms list price); KYC on both parties and beneficial owners (GwG), contracts and a "
    "buffer are not sourced")
doc("DEALS_PER_MANAGER", "Deals a deal manager closes a year (capacity)", "deals", "A", ["nar"],
    "The plan's most ambitious number (≈107 per average head in 2031): AI does the paperwork. US agents close a "
    "median 10. Lower it and the model hires more deal managers")

doc("EMP_PENSION_RATE", "Pension insurance (employer share)", "%", "S", ["sv_rates"], "Up to the pension ceiling")
doc("EMP_UNEMPLOYMENT_RATE", "Unemployment insurance (employer share)", "%", "S", ["sv_rates"],
    "Up to the pension ceiling")
doc("EMP_INSOLVENCY_RATE", "Insolvency-benefit levy U3", "%", "S", ["u3"], "Up to the pension ceiling")
doc("CEILING_PENSION", "Contribution ceiling: pension & unemployment", "€/yr", "S", ["ceilings"],
    "2026 value, held constant in 2027 euros")
doc("EMP_HEALTH_RATE", "Health insurance (employer share)", "%", "S", ["sv_rates"], "Up to the health ceiling")
doc("EMP_HEALTH_EXTRA", "Half of the average extra health contribution", "%", "S", ["sv_rates"],
    "Average extra contribution 2.9%; employer pays half")
doc("EMP_CARE_RATE", "Long-term care insurance (employer share)", "%", "S", ["sv_rates"], "Up to the health ceiling")
doc("CEILING_HEALTH", "Contribution ceiling: health & care", "€/yr", "S", ["ceilings"],
    "2026 value, held constant in 2027 euros")
doc("EMP_OTHER_RATE", "Other employer costs", "%", "A", ["model"],
    "U1/U2 levies, statutory accident insurance, small benefits (not sourced)")
doc("ATTRITION", "Staff turnover a year", "%", "A", ["model"], "Leavers replaced; founders excluded")
ROLE_NOTES = {
    "Founders": (["founder_salary"], "Pre-seed ≈€50k; seed €50–75k; DACH median ≈€100–115k later"),
    "Senior valuers": (["valuer_salary"], "Top of the €100–120k advertised for a senior valuation manager: signing "
                                          "liability, HypZert / öbuv / MRICS"),
    "Platform & AI": (["eng_salary"], "Between the median (€92k) and P75 (€112k) pay of senior engineers in Berlin"),
    "Sales": (["ae_salary"], "On-target pay of a senior account executive (€83–98k)"),
    "Operations & finance": (["ravio"], "Below Berlin's tech median (€80k): operations, finance and people "
                                         "generalists"),
    "Deal team": (["tm_salary"], "Transaction-manager median ≈€73k plus a deal bonus"),
    "Marketplace tech": (["eng_salary"], "Senior engineers, as for the platform"),
}
HEAD_NOTES = {
    "Founders": "CEO, Head of AI, Head of Business Development, Head of Sales",
    "Senior valuers": "Seniors who check and sign; no juniors (AI does the junior work). 2028 carries a second "
                      "senior for four-eyes checks and the bank method; raised automatically if volume needs more",
    "Platform & AI": "Build and run the platform and the AI pipeline",
    "Sales": "Account executives for investors, funds and banks",
    "Operations & finance": "Finance, people, office and valuation operations (G&A): 1 → 4 heads",
    "Deal team": "Ambitious: ≈75 deals per year-end head, ≈107 per average head (US agents: median 10, NAR); "
                 "raised automatically if deals need more",
    "Marketplace tech": "Build the marketplace from 2029",
}
for role in M.ROLES:
    doc(f"YE:{role}", f"{role}: heads at year end", "heads", "A", ["model"] + (["nar"] if role == "Deal team" else []),
        HEAD_NOTES[role])
    doc(f"AVG:{role}", f"{role}: average heads", "heads", "A", ["model"], "Average over the year (hiring dates)")
    sources, note = ROLE_NOTES[role]
    doc(f"SALARY:{role}", f"{role}: gross salary per head", "€/yr", "B", sources,
        note + "; gross incl. variable pay, before employer costs")

doc("WORKPLACE_PER_MONTH", "Workplace per average head", "€/month", "B", ["office"],
    "≈13 m² at €27.65/m² ≈ €360 (sourced) plus ≈€90 service charges and meeting rooms (our assumption)")
doc("IT_PER_HEAD", "IT & software per average head", "€/yr", "B", ["saas"],
    "Below Zylo's US$4,830 average, which is driven by larger firms")
doc("RECRUITING_PER_HIRE", "Recruiting cost per hire (except senior valuers)", "€ per hire", "B", ["hire"],
    "≈2× the German average (€4,700, 2013 prices, all jobs)")
doc("SENIOR_SEARCH_FEE", "Headhunter fee per senior valuer", "%", "A", ["model"],
    "Share of the annual salary; headhunters in Germany usually charge 20–35% (not sourced to a page)")
doc("EQUIPMENT_PER_HIRE", "Equipment per new head", "€ per head", "A", ["model"], "Laptop and screen")
doc("DEPRECIATION_YEARS", "Depreciation period for equipment", "years", "A", ["bmf_it"],
    "Tax allows 1 year (BMF 2022); the accounts spread it over 3")

NS_DOCS = {
    "AI infrastructure": (["model"], "Model hosting, evaluation, monitoring beyond per-run tokens"),
    "Data subscriptions": (["model"], "Market data (rents, yields, comparables) on subscription"),
    "Marketing": (["marketing"], "≈5% of valuation revenue from 2029 (Gartner: 5.8% for business services)"),
    "Company insurance (D&O, cyber, liability)": (["do"], "D&O ≈€3.5–6k for €1m cover at pre-seed; cyber and "
                                                           "liability added as the business grows"),
    "Travel, events & training": (["model"], "Sales travel, trade fairs (e.g. EXPO REAL), HypZert surveillance "
                                             "and training of the signing valuers (not sourced)"),
    "Information security & data protection": (["model"], "ISO 27001 certification before the first bank sale, "
                                                          "pen tests, GDPR (rent rolls hold tenant data); not sourced"),
    "Legal, tax & accounting": (["tax_adviser"], "Tax adviser ≈€5k at start; plus legal work, audit from 2030"),
    "DACH expansion": (["model"], "Entry costs for Austria and Switzerland"),
    "Marketplace marketing": (["model"], "Owner and buyer acquisition (≈€2k per deal in 2031)"),
    "Marketplace compliance": (["gwg"], "Money-laundering officer (part-time), AML/KYC set-up, broker licence "
                                        "(§ 34c GewO), legal opinions"),
}
for name, (_values, _area) in M.NON_STAFF.items():
    sources, note = NS_DOCS[name]
    doc(f"NS:{name}", name, "€/yr", "B" if name.startswith("Company insurance") else "A", sources, note)

doc("CIT_RATE", "Corporate income tax rate", "%", "S", ["kst"], "Cut by 1 point a year from 2028 to 10% in 2032")
doc("SOLI", "Solidarity surcharge on corporate tax", "%", "S", ["soli"], "5.5% of the corporate tax")
doc("TRADE_TAX_BASE", "Trade tax base rate", "%", "S", ["trade_tax"], "Steuermesszahl 3.5%")
doc("TRADE_TAX_MULTIPLIER", "Berlin trade-tax multiplier", "×", "S", ["trade_tax"],
    "Hebesatz 410%, unchanged since 1999, held constant; no trade-tax add-backs assumed")
doc("LOSS_OFFSET_CAP", "Losses offset in full up to", "€", "S", ["min_tax"], "Per year, both taxes")
doc("LOSS_OFFSET_SHARE_CIT", "Corporate tax: share of profit above the cap that losses can offset", "%", "S",
    ["min_tax"], "70% for 2024–2027, 60% from 2028")
doc("LOSS_OFFSET_SHARE_TRADE", "Trade tax: share of profit above the cap that losses can offset", "%", "S",
    ["min_tax"], "Always 60% (the 70% uplift does not apply to trade tax)")

doc("ASK", "Pre-seed round (paid in 2027)", "€", "A", ["model"], "Covers the 2027–28 burn plus a reserve")
doc("SEED", "Further equity", "€", "A", ["model"],
    "Seed early in 2029 on the 2028 proof (ask slide); it also covers the downside's cash gap")
doc("MIN_CASH_MONTHS", "Minimum cash cover at a year end", "months", "A", ["model"],
    "Year-end cash plus a round raised early next year must cover this many months of next year's costs (Checks)")
doc("SENS_DEALS", "Sensitivity: marketplace deals (share of plan)", "×", "A", ["model"], "Downside sheet grid")
doc("SENS_FEES", "Sensitivity: deal fee", "%", "A", ["model"], "Downside sheet grid")
doc("RECEIVABLE_DAYS", "Days until customers pay", "days", "B", ["dso"],
    "German B2B average ≈32 days of terms + ≈8 days late")
doc("CUSTOMERS_2028", "Paying customers by the end of 2028", "customers", "A", ["model"], "Milestone on the ask slide")
for bucket, why in (("Build", "Head of AI"), ("Sell", "Head of Business Development, Head of Sales"),
                    ("Run", "CEO")):
    doc(f"FOUNDER_SPLIT:{bucket}", f"Founders' time: {bucket}", "share", "A", ["model"], why)

doc("MFH_SALES_2024", "Multi-family house sales 2024", "sales", "S", ["gewos"], "Germany")
doc("COMMERCIAL_SALES_2024", "Commercial property sales 2024", "sales", "S", ["gewos"], "Germany")
doc("VALUATIONS_PER_SALE", "Valuations per income-property sale", "×", "A", ["model"],
    "Buyer and/or lender (range 1–2); no official count exists")
doc("MEAN_MARKET_FEE", "Average market fee per valuation", "€", "T", ["fees", "bvs"],
    "Between indicative valuations at large firms (€3–5k) and the BVS fee at €1m (€4,360)")
doc("BUY_SIDE_SHARE", "Share of multi-family purchases with a buy-side valuation", "%", "A", ["model"], "Range 30–70%")
doc("EU_INVESTMENT_2025", "European real-estate investment 2025", "€", "S", ["cbre"], "Institutional deals")
doc("DE_MFH_TURNOVER_2025F", "German multi-family turnover 2025 (forecast)", "€", "S", ["gewos"], "")
doc("DE_COMMERCIAL_TURNOVER_2025F", "German commercial turnover 2025 (forecast)", "€", "S", ["gewos"], "")

doc("DOWNSIDE_VOLUME", "Downside: valuation volume", "×", "A", ["model"], "40% fewer valuations")
doc("DOWNSIDE_PRICE", "Downside: prices", "×", "A", ["model"], "10% lower prices")
doc("DOWNSIDE_HOURS", "Downside: senior hours per investor valuation", "h per valuation", "A", ["model"],
    "3 h instead of 2 h")
doc("DOWNSIDE_MIN_SENIORS", "Downside: minimum seniors", "heads", "A", ["model"], "Never fewer than 1.5 on average")
doc("DACH_SHARE", "Share of 'Commercial & DACH' valuations from Austria and Switzerland", "%", "A", ["model"],
    "Dropped together with the DACH expansion costs in the downside without DACH")

doc("COURT_RATE", "Court rate for property valuers", "€/h", "S", ["jveg"], "JVEG, since 1 Jun 2025")
doc("BVS_FEE_1M", "BVS guideline fee for a €1m property", "€", "S", ["bvs"], "Net, non-binding")
doc("CLASSIC_HOURS_LOW", "Expert hours for a fast classic valuation", "h", "A", ["model"],
    "Lower bound used for the comparison")

# ---- Peer benchmarks (comparison only; not used in the plan) ----------------------------------------------------------
PEERS = [
    # name, value, unit, source, note
    ("PEER:Scout24 margin", 0.625, "%", "scout24", "ooEBITDA 2025; Germany's dominant property portal, 25 years old"),
    ("PEER:Rightmove margin", 0.72, "%", "rightmove", "Underlying EBITDA 2025; UK portal"),
    ("PEER:REA margin", 969 / 1673, "%", "rea", "EBITDA excl. associates FY2025; Australian portal"),
    ("PEER:Zillow margin", 622 / 2583, "%", "zillow", "Adjusted EBITDA 2025; portal plus transaction services"),
    ("PEER:CoStar margin", 442 / 3200, "%", "costar", "Adjusted EBITDA 2025, while building the Homes.com marketplace"),
    ("PEER:CBRE margin", 3308 / 40600, "%", "cbre_fy", "Core EBITDA 2025; services incl. valuations"),
    ("PEER:JLL margin", 1452.9 / 26100, "%", "jll_fy", "Adjusted EBITDA 2025; services"),
    ("PEER:Savills margin", 0.057, "%", "savills", "Underlying profit before tax 2025; consultancy incl. valuations"),
    ("PEER:Scout24 revenue per head", 649.6e6 / 1116, "€", "scout24", "Revenue 2025 / employees mid-2025"),
    ("PEER:Savills revenue per head", 2550.9e6 / 42000, "£", "savills", "Revenue 2025 / staff (GBP)"),
    ("PEER:SaaS revenue per head", 129_724, "$", "saas_rev", "Median private SaaS company (USD)"),
    ("PEER:NAR transactions per agent", 10, "deals", "nar", "US residential agents, median 2024"),
    ("PEER:Crexi auctions per quarter", 207, "deals", "crexi", "Record quarter Q4 2025"),
    ("PEER:E&V commission per professional", 1.3e9 / 16000, "€", "ev", "Commission revenue 2025 / professionals"),
]
for name, _value, unit, sid, note in PEERS:
    doc(name, name.split(":", 1)[1], unit, "S", [sid], note)
