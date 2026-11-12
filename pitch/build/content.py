"""Copy, numbers and speaker script for the Censio pitch deck (English).

Headlines are one-liners without a final full stop; `sub` is the reading-version sub headline; `eyebrow` names the
course outline item. Every figure is formatted from numbers.json (model.py) or quoted from appendix A of the design
spec. `notes` is the spoken script (timed by `seconds`); `qa` holds backup answers; `sources` is printed under both.

Scope, said on the slides: Censio sells a signed *desktop* valuation (from documents, no site visit) to investors;
bank lending values include a site visit, which the model prices in hours and travel.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
NUM = json.loads((HERE / "numbers.json").read_text())
PLAN = NUM["plan"]
YEARS = list(PLAN)


def eur_m(value: float, digits: int = 1) -> str:
    sign = "−" if value < 0 else ""
    return f"{sign}€{abs(value) / 1e6:.{digits}f}m"


def eur_sig2(value: float) -> str:
    """Two significant figures for estimates: €386m -> €390m, €60.7m -> €61m, €4.8m -> €4.8m."""
    millions = value / 1e6
    if millions >= 100:
        return f"€{round(millions, -1):.0f}m"
    if millions >= 10:
        return f"€{round(millions):.0f}m"
    return f"€{millions:.1f}m"


def eur(value: float) -> str:
    return f"€{value:,.0f}"


def pct(value: float) -> str:
    return f"{value * 100:.0f}%"


def spoken_words(text: str) -> int:
    """Words as spoken: a token with digits ('73,500', '2031', '4.8') takes about three spoken words."""
    tokens = re.findall(r"[^\s]+", text)
    return sum(3 if re.search(r"\d", t) else 1 for t in tokens)


M = NUM["market"]
U = NUM["unit"]
P = NUM["proceeds"]
T = NUM["team"]
D = NUM["downside"]
LAST = PLAN[YEARS[-1]]

FMT = {
    "tam": eur_sig2(M["tam_eur"]),
    "sam": eur_sig2(M["sam_eur"]),
    "som": eur_sig2(M["som_2031_eur"]),
    "income_sales": f"{M['income_sales_2024']:,}",
    "mfh_sales": f"{M['mfh_sales_2024']:,}",
    "sam_valuations": f"{M['sam_valuations']:,.0f}",
    "som_valuations": f"{M['som_2031_valuations']:,}",
    "som_share": pct(M["som_share_of_sam"]),
    "som_value_share": pct(M["som_2031_eur"] / M["sam_eur"]),
    "sam_at_price": eur_sig2(M["sam_valuations"] * U["price"]),
    "price": eur(U["price"]),
    "unit_cost": eur(U["cost"]),
    "gross_profit": eur(U["price"] - U["cost"]),
    "gross_margin": pct(U["gross_margin"]),
    "company_gm": f"{min(PLAN[y]['gross_margin'] for y in YEARS[2:]) * 100:.0f}–"
                  f"{max(PLAN[y]['gross_margin'] for y in YEARS[2:]) * 100:.0f}%",
    "revenue": [eur_m(PLAN[y]["revenue"]) for y in YEARS],
    "ebitda": [eur_m(PLAN[y]["ebitda"]) for y in YEARS],
    "valuations": [f"{PLAN[y]['valuations']:,}" for y in YEARS],
    "people": [str(PLAN[y]["headcount_ye"]) for y in YEARS],
    "ebitda_last": eur_m(LAST["ebitda"]),
    "ebitda_margin_last": pct(LAST["ebitda_margin"]),
    "breakeven": str(NUM["breakeven_year"]),
    "ask": eur_m(P["ask"]),
    "runway": f"{P['runway_months_zero_revenue']:.0f}",
    "valuations_2027_28": f"{P['valuations_2027_28']:,}",
    "revenue_2028": eur_m(P["revenue_2028"], 1),
    "revenue_2027_28": eur_m(PLAN[YEARS[0]]["revenue"] + PLAN[YEARS[1]]["revenue"]),
    "spend_2027_28": eur_m(P["gross_spend_2027_28"]),
    "buffer": eur_m(P["buffer"]),
    "customers_2028": str(P["customers_2028"]),
    "per_senior": f"≈{round(T['valuations_per_senior_2031'], -1):.0f}",
    "classic_low": f"{round(T['classic_reports_per_valuer_low'], -1):.0f}",
    "classic_high": f"{T['classic_reports_per_valuer_high']:.0f}",
    "classic_valuers_low": f"{round(T['classic_valuers_low'], -1):.0f}",
    "classic_valuers_high": f"{round(T['classic_valuers_high'], -1):.0f}",
    "people_last": str(T["people_2031"]),
    "seniors_last": str(T["seniors_2031"]),
    "valuations_last": f"{T['valuations_2031']:,}",
    "classic_hours": f"{T['classic_hours_per_report']:.0f}",
    "downside_extra": eur_m(D["extra_cash_needed"]),
    "downside_cum": eur_m(D["cum_min"]),
    "downside_2031": eur_m(D["ebitda_2031"]),
}

BUCKETS = P["buckets"]
LEGEND_TAILS = {
    "Build: product & AI": "platform, AI, data",
    "Deliver: senior valuers": "the people who sign",
    "Sell: sales & partnerships": "incl. two founders' time",
    "Run: operations, legal & compliance": "incl. the CEO's time",
}

# 2031 team by function, for the team slide's bar (people at year end).
TEAM_2031 = [
    ("Senior valuers", T["seniors_2031"], "valuer"),
    ("Platform & AI", 4, "brand_accent"),
    ("Sales & ops", 3, "ink2"),
    ("Founders", 4, "brand"),
]

DEFAULT_TEAM = [
    {"name": "Founder 1", "role": "CEO", "school": "ESMT Berlin"},
    {"name": "Founder 2", "role": "Head of AI", "school": "ESMT Berlin"},
    {"name": "Founder 3", "role": "Head of Business Development", "school": "ESMT Berlin"},
    {"name": "Founder 4", "role": "Head of Sales", "school": "ESMT Berlin"},
]


def load_team() -> list[dict]:
    """Names stay out of the public repository: team.local.json (gitignored) wins over team.example.json."""
    for name in ("team.local.json", "team.example.json"):
        path = HERE / name
        if path.exists():
            return json.loads(path.read_text())
    return DEFAULT_TEAM


SOURCES = {
    "akoga": "AK OGA/BBSR Immobilienmarktbericht 2026 (872,000 sales, €278bn in 2025)",
    "gewos": "GEWOS IMA 2025 (multi-family 34,700 sales, commercial 38,800 sales, 2024)",
    "bvs": "BVS Honorarrichtlinie 2026 (non-binding fee guideline)",
    "jveg": "JVEG Anlage 1, Sachgebiet 7 (€125/h since 1 Jun 2025)",
    "speed": "ImmoScout24, jacasa (3–4 weeks, up to 6); service.berlin.de, Heidelberg board (4–6 months)",
    "ihk": "IHK Nürnberg / DIHK 2025 (publicly appointed experts, all fields)",
    "crr": "CRR III Art. 229 and EBA Q&A 2020_5470",
    "darmstadt": "LG Darmstadt, 10 Nov 2025, 19 O 527/16; IHK AI guidance for experts, 24 Jun 2026",
    "bowery": "BusinessWire 2021 (Bowery Valuation $35m Series B led by Goldman Sachs)",
    "pricehubble": "tech.eu 2021 (PriceHubble $34m Series B)",
    "ongeo": "on-geo LORA product pages; bulwiengesa/on-geo press release 2025",
    "destatis_tax": "Destatis PD26_306_736 (€51.6bn real estate in taxed inheritances and gifts, 2025)",
    "kagb": "§§ 250–251 KAGB",
    "belwertv": "BelWertV § 5 (inspection for lending values), § 24 (small loans)",
    "hypzert": "HypZert (>2,000 certified valuers, ~200 new per year)",
    "stanford": "Brynjolfsson, Chandar, Chen: Canaries in the Coal Mine, Stanford Digital Economy Lab 2025",
    "prototype": "Censio prototype; AI cost per run estimated from token prices (README)",
    "model": "Censio plan model (pitch/build/model.py, numbers.json); assumptions in the design spec, appendix B",
}

SHORT = {
    "akoga": "AK OGA/BBSR 2026",
    "gewos": "GEWOS IMA 2025",
    "bvs": "BVS fee guideline 2026",
    "jveg": "JVEG",
    "speed": "ImmoScout24; Berlin and Heidelberg valuation boards",
    "ihk": "IHK/DIHK 2025",
    "crr": "CRR III Art. 229; EBA Q&A",
    "darmstadt": "LG Darmstadt 19 O 527/16",
    "bowery": "BusinessWire 2021",
    "pricehubble": "tech.eu 2021",
    "ongeo": "on-geo 2025",
    "destatis_tax": "Destatis 2026",
    "kagb": "KAGB",
    "belwertv": "BelWertV",
    "hypzert": "HypZert",
    "stanford": "Stanford DEL 2025",
    "prototype": "Censio prototype",
    "model": "Censio plan model (assumptions marked est.)",
}

SLIDES = [
    {
        "key": "cover",
        "eyebrow": "",
        "title": "Signed property valuations in 48 hours, not weeks",
        "sub": "The AI-native valuation firm for income-producing real estate in Germany",
        "seconds": 10,
        "notes": "A property deal can wait six weeks for one signed valuation. We're Censio: we deliver it in 48 hours.",
        "qa": [],
        "sources": [],
    },
    {
        "key": "vision",
        "eyebrow": "Vision & mission",
        "title": "Every property deal deserves a value you can trace",
        "sub": "We want every property value to be traceable: AI prepares, a senior valuer signs",
        "seconds": 18,
        "vision": "Every property decision rests on a signed value that anyone can trace back to its sources.",
        "mission": "AI does the groundwork, senior valuers make the call: a signed ImmoWertV desktop valuation "
                   "in 48 hours, for less than half the fee of a full report.",
        "notes": "Our vision: every property decision rests on a value anyone can trace to its sources. Our mission: "
                 "AI prepares, a senior valuer signs, in 48 hours. Orange means AI on every slide, violet the senior.",
        "qa": [f"Less than half: {FMT['price']} is 46% of the BVS guideline fee for a full report at €1m (€4,360) "
               "and 57% of the conservative €3,500 average we use for the market size.",
               "Desktop valuation = from documents and public data, no site visit; stated in every report. "
               "Buy-side investors inspect the building in their own technical due diligence."],
        "sources": ["bvs"],
    },
    {
        "key": "problem",
        "eyebrow": "Problem",
        "title": "Every deal waits weeks for one signature",
        "sub": "A full valuation of a €1–3m apartment building costs €4.4–6.8k and takes 3–6 weeks, and the "
               "experts who sign are ageing",
        "seconds": 30,
        "stats": [
            ("Time", "3–6 weeks", "for a full valuation report from a private valuer; public valuation boards "
                                  "take months (Heidelberg: 4–6)"),
            ("Cost", "€4.4–6.8k", "net fee for a €1–3m apartment building under the valuers' own fee guideline"),
            ("People", "60 years", "average age of Germany's sworn experts (all fields), with 10–12% fewer "
                                   "than five years ago"),
        ],
        "footnote": f"≈{FMT['classic_hours']} billable expert hours in a full report's fee, incl. site visit and "
                    "travel (est.: €4,360 ÷ €125/h court rate)",
        "notes": "When an investor buys an apartment building for one to three million euros, a full valuation costs "
                 "4,400 to 6,800 euros and takes three to six weeks. That fee pays for about 35 hours of expert time. "
                 "And the experts who sign are ageing: Germany's sworn experts, across all fields, are 60 on average.",
        "qa": ["The expert count covers all fields; no official count of property valuers exists. HypZert certifies "
               "~200 new valuers a year (>2,000 in total), which is the pool we hire from.",
               "The 35 hours are an estimate: the BVS fee at €1m divided by the €125/h court rate. They include "
               "the site visit, travel and the written report."],
        "sources": ["speed", "bvs", "ihk", "jveg", "hypzert"],
    },
    {
        "key": "solution",
        "eyebrow": "Playbook & solution",
        "title": "AI does the groundwork. Seniors make the call",
        "sub": "Our playbook: sell the signed valuation, not software. AI does the junior work, a senior valuer "
               "judges and signs",
        "seconds": 28,
        "steps": [
            ("ai", "Read", "Land register, rent roll, energy certificate, refurbishment sheet, zoning plan"),
            ("ai", "Research", "Land values, the valuation board's cap rates, market rents, comparables"),
            ("rules", "Compute", "Fixed rules compute the income value (ImmoWertV §§ 27–34), every number cited"),
            ("ai", "Flag", "Judgement calls that move the value go to the senior"),
            ("valuer", "Decide", "A senior valuer approves or revalues, then signs"),
        ],
        "proof": [
            ("≈€0.45", "of AI per valuation (est. from token prices)"),
            ("2 h", f"senior review per valuation (plan); a full report bills ≈{FMT['classic_hours']} h"),
            ("27 of 31", "numbers traced automatically; 4 flagged to the senior"),
        ],
        "caption": "In the prototype: an AI judgement call (orange) and the senior's Revalue (violet)",
        "notes": "Our playbook: we sell the signed valuation, not software. AI reads the documents and pulls public "
                 "data; fixed rules compute the income value exactly as the ImmoWertV prescribes. In our sample deal, "
                 "27 of 31 numbers come straight from a source; the AI flags the other four as judgement calls. "
                 "A senior valuer checks those and signs.",
        "qa": ["≈€0.45 (US$0.50) of AI per run is estimated from token prices for the sample deal (5 PDFs, 17 "
               "pages); the €5 in the cost line is a buffer for longer real files.",
               "2 senior hours is our planning assumption; the prototype's review of flagged calls takes minutes. "
               "The first 90 days measure it with shadow valuations."],
        "sources": ["prototype", "model", "bvs", "jveg"],
    },
    {
        "key": "demo",
        "eyebrow": "Demo",
        "title": "Upload, check, sign: the prototype in 30 seconds",
        "sub": "Demo mode with sample data, sped up 1.2×: the client uploads, the AI prepares, the senior valuer "
               "revises and signs",
        "seconds": 30,
        "notes": "Here is the prototype in demo mode, sped up. The client uploads five documents; the AI reads them, "
                 "builds the valuation and flags four judgement calls. The valuer disagrees with the cap rate and "
                 "writes a note; the value is recomputed in seconds. The valuer accepts the other three, signs, and "
                 "the client gets a report where every figure names its source.",
        "qa": ["Demo mode replays stored AI results for the sample documents; with an API key the same flow reads "
               "real PDFs live."],
        "sources": [],
    },
    {
        "key": "market",
        "eyebrow": "Market size",
        "title": f"A {FMT['tam']} market, starting with apartment buildings",
        "sub": f"Germany sells ~{FMT['income_sales']} income properties a year, each valued once or twice (est.). "
               "Beachhead: buy-side valuations of multi-family houses",
        "seconds": 25,
        "rings": [
            ("TAM", FMT["tam"], "a year",
             f"Valuations triggered by income-property sales: {FMT['income_sales']} sales × 1.5 valuations × "
             "€3,500 (est.)"),
            ("SAM", FMT["sam"], "a year",
             f"Buy-side valuations of multi-family houses: {FMT['mfh_sales']} sales × 50% × €3,500 (est.)"),
            ("SOM", FMT["som"], "investors, 2031",
             f"{FMT['som_valuations']} signed valuations at {FMT['price']}: ≈{FMT['som_share']} of the SAM's "
             f"{FMT['sam_valuations']} valuations"),
        ],
        "on_top": f"Our 2031 plan of {FMT['revenue'][-1]} = {FMT['som']} from investors + "
                  f"{eur_m(PLAN[YEARS[-1]]['revenue'] - M['som_2031_eur'])} from fund revaluations, banks and "
                  "commercial & DACH. Those, refinancing and inheritance tax come on top of the circles.",
        "notes": f"Germany sells about {FMT['income_sales']} income properties a year: roughly 390 million euros of "
                 "valuations from sales alone. Our beachhead, buy-side valuations of apartment buildings, is about "
                 "61 million. By 2031 we plan 4.8 million there, 9.2 million in total.",
        "qa": ["No official count of valuations exists; 1.5 per sale, 50% buy-side and the €3,500 mean fee are "
               "assumptions.",
               f"At our price the beachhead pool is {FMT['sam_at_price']} ({FMT['sam_valuations']} × €2,000); "
               f"our 2031 investor revenue is ≈{FMT['som_share']} of its valuations, ≈{FMT['som_value_share']} of "
               "its value at market fees.",
               "Context: 872,000 property sales worth €278bn in 2025 (AK OGA); €51.6bn of property in taxed "
               "inheritances and gifts (Destatis)."],
        "sources": ["gewos", "akoga", "bvs", "destatis_tax", "kagb"],
    },
    {
        "key": "competition",
        "eyebrow": "Competition",
        "title": "Fast or signed: today you have to pick one",
        "sub": "Automated models answer in seconds, but nobody signs. Valuers sign, but take weeks. Censio is built "
               "to do both",
        "seconds": 25,
        "axis": ("Complete & signed", "Indicative"),
        "players": {
            "classic": ("Valuation firms & sworn experts", "CBRE · JLL · Savills · öbuv / HypZert valuers",
                        "full report with site visit · 3–6 weeks · €4.4–6.8k"),
            "short": ("Short reports", "Kurzgutachten: signed, but indicative",
                      "2–7 days · €300–900 · not for banks or courts"),
            "avm": ("Automated models & portals", "PriceHubble · Sprengnetter · on-geo LORA indication · ImmoScout24",
                    "seconds · nobody signs"),
            "censio": ("Censio", "Signed desktop valuation; site visit on request", f"48 hours · {FMT['price']}"),
        },
        "why": [
            ("valuer", "Why the signature stays",
             "EU bank rules (CRR III Art. 229) require an independent valuer; a model may not be the sole review. "
             "A court paid €0 for an AI-written report the expert hid (LG Darmstadt, 2025). Censio discloses "
             "every AI step."),
            ("brand", "Why we can win",
             "Incumbents bill expert hours and staff junior pyramids; AVM vendors sell software. Censio is built "
             "for one senior reviewing a queue, and every correction is logged as training data. US precedent: "
             "Bowery Valuation, appraiser-signed, $35m Series B (2021)."),
        ],
        "notes": "Today you must choose. Automated models answer in seconds, but nobody signs them. Short reports are "
                 "cheap, but only indicative. Full reports are signed, but take weeks, and EU bank rules require an "
                 "independent valuer. Censio is built to be signed and fast, a model that has raised venture money "
                 "in the US.",
        "qa": ["Also competing: the buyer's own spreadsheet (the status quo, unsigned) and, for bank loans, in-house "
               "valuers working on platforms like on-geo LORA (used by ≈98% of Sparkassen). VALUE AG also sells "
               "valuations.",
               "Why €2,000 and not a €300–900 short report? A short report is indicative; a complete, signed "
               "ImmoWertV valuation with every figure sourced costs €4,360+ today.",
               "Is LG Darmstadt a risk for us? That fee was cut because the expert hid AI use in a court report. "
               "Censio's reports disclose every AI step, and each judgement call is the signing valuer's, as the "
               "IHK guidance for experts asks."],
        "sources": ["crr", "darmstadt", "bowery", "pricehubble", "ongeo", "speed"],
    },
    {
        "key": "traction",
        "eyebrow": "Traction · north star",
        "title": "North star: signed valuations within 48 hours",
        "sub": "No customers yet: a working prototype today, shadow valuations next, first revenue in 2027",
        "seconds": 20,
        "star_note": f"counted weekly · today 0 · 2027 plan: {FMT['valuations'][0]}",
        "inputs": [
            ("Senior minutes per valuation", "target ≤ 120"),
            ("AI values kept unchanged", "baseline from shadow valuations"),
            ("Repeat customers", "from the first paid order"),
        ],
        "timeline": [
            ("Today", "Working prototype",
             "AI reads 5 document types, rules compute the income value, the senior revises and signs."),
            ("Next 90 days", "Design partners",
             "Target: 5 investors, 50 shadow valuations side by side with signed reports, senior minutes measured."),
            ("2027", "First revenue", f"{FMT['valuations'][0]} paid valuations, 10 customers (plan)."),
        ],
        "notes": "We steer by one number: signed valuations delivered within 48 hours. Today that number is zero: we "
                 "have a working prototype and no customers yet. Next come 50 shadow valuations with five investors, "
                 "measuring the senior minutes each one takes.",
        "qa": ["Shadow valuation = we value a deal the investor is already valuing, and compare our result and time "
               "with the signed report they receive."],
        "sources": ["prototype", "model"],
    },
    {
        "key": "gtm",
        "eyebrow": "Go-to-market & revenue",
        "title": "Land with investors, then add funds and banks",
        "sub": f"{FMT['price']} per signed valuation for multi-family investors first; funds, banks and commercial "
               "follow",
        "seconds": 25,
        "path": [
            ("2027", "Multi-family investors", "€2,000", "asset managers, family offices, housing companies"),
            ("2028", "Portfolio & fund revaluations", "€1,100", "recurring: open-ended funds revalue every quarter"),
            ("2029", "Banks", "€2,200", "lending values with a site visit, HypZert-certified seniors"),
            ("2030", "Commercial & DACH", "€3,200", "offices and retail; Austria and Switzerland"),
        ],
        "later": "Later option: a deal platform. Buyers and sellers are already on Censio, so a transaction "
                 "fee becomes possible. Upside only, not in the numbers.",
        "notes": "We land with asset managers, family offices and housing companies that buy multi-family houses, at "
                 "2,000 euros per valuation. Then we add fund revaluations, banks with site visits, and commercial "
                 "property. Revenue grows to 9.2 million euros in 2031. Later, with buyers and sellers on Censio, a "
                 "deal fee is upside.",
        "qa": [f"Customers: 10 in 2027 and {FMT['customers_2028']} in 2028, so about 20 valuations per customer a "
               "year, counting valuations per bid, not only per closed deal (est.).",
               "2027 is a €1,800 launch price; €2,000 from 2028. Segment volumes and prices are in model.py."],
        "sources": ["model", "kagb", "belwertv"],
    },
    {
        "key": "team",
        "eyebrow": "Team",
        "title": "No juniors. Only seniors and AI",
        "sub": f"AI does the junior work, so in 2031, {FMT['seniors_last']} of our {FMT['people_last']} people are "
               "senior valuers who sign",
        "seconds": 30,
        "classic": [("Partners", "ink"), ("Senior valuers", "ink"), ("Juniors & analysts", "ink")],
        "censio": [("Founders", "brand"), ("Senior valuers", "valuer"), ("AI does the preparation", "ai")],
        "stats": [
            (f"{FMT['classic_low']}–{FMT['classic_high']}", "full reports per valuer a year (est.: 1,000 h ÷ 20–35 h)"),
            (FMT["per_senior"], "signed valuations per senior a year (plan: 2 h each)"),
        ],
        "bridge": f"{FMT['valuations_last']} valuations in 2031: {FMT['people_last']} people at Censio vs "
                  f"≈{FMT['classic_valuers_low']}–{FMT['classic_valuers_high']} valuers in a classic firm "
                  "(est., full reports)",
        "first_hire": "First hire: a HypZert / öbuv senior valuer who signs from 2027",
        "notes": "AI-native means: AI does the junior work, so we hire only seniors. We four founders run the company; "
                 "senior valuers sign every report, with a small platform team. One senior signs about 330 "
                 "valuations a year, instead of 30 to 50 full reports. By 2031, a team of 28 does the work of over "
                 "100 classic valuers.",
        "qa": ["Who signs the first report? Our first hire, a HypZert / öbuv senior valuer, paid from the Deliver "
               "share. Hiring pool: >2,000 HypZert valuers, ~200 newly certified a year.",
               "Entry-level work is already shrinking: −13% employment for 22–25-year-olds in the most AI-exposed "
               "jobs (Stanford, 2025).",
               "Founder roles are placeholders until the team fixes them."],
        "sources": ["model", "hypzert", "stanford", "bvs", "jveg"],
    },
    {
        "key": "financials",
        "eyebrow": "Financial projections",
        "title": f"Break-even in {FMT['breakeven']}, {FMT['ebitda_margin_last']} EBITDA margin by 2031",
        "sub": f"Each valuation leaves {FMT['gross_profit']} ({FMT['gross_margin']}); EBITDA turns positive in "
               f"{FMT['breakeven']} and reaches {FMT['ebitda_last']} on {FMT['revenue'][-1]} revenue in 2031",
        "seconds": 22,
        "downside": f"Downside (−40% volume, −10% price, 3 senior hours): still loss-making in 2031, "
                    f"{FMT['downside_extra']} more cash needed; dropping DACH expansion (€0.9m) covers it",
        "notes": "Each valuation sells for 2,000 euros and costs about 425 to deliver, mostly senior time. We break "
                 "even in 2029 and reach a 34 percent EBITDA margin in 2031. The number we must prove first is those "
                 "two senior hours.",
        "qa": [f"Downside with plan costs: EBITDA 2031 {FMT['downside_2031']}, cumulative low {FMT['downside_cum']}; "
               f"the round leaves {FMT['downside_extra']} short. We would drop DACH expansion and slow hiring, then "
               "raise a seed on 2028 data.",
               f"79% is per valuation at full senior use; company gross margin is {FMT['company_gm']} in 2029–31.",
               "Bank valuations include a site visit: 6 senior hours and €100 travel each in the model."],
        "sources": ["model", "prototype"],
    },
    {
        "key": "ask",
        "eyebrow": "Use of proceeds",
        "title": f"{FMT['ask']} pre-seed to reach {FMT['revenue_2028']} revenue in 2028",
        "sub": f"24 months to {FMT['valuations_2027_28']} signed valuations and {FMT['customers_2028']} paying "
               f"customers, with {FMT['runway']} months of runway even at zero revenue",
        "seconds": 22,
        "donut_caption": f"Split of all 2027–28 spending ({FMT['spend_2027_28']}), funded by the "
                         f"{FMT['ask']} round and {FMT['revenue_2027_28']} of revenue; {FMT['buffer']} of the round "
                         "stays in reserve",
        "milestones": [
            ("2027", f"First senior valuer signs; {FMT['valuations'][0]} valuations, 10 customers"),
            ("2028", f"{FMT['valuations'][1]} valuations, {FMT['customers_2028']} customers, "
                     f"{FMT['revenue'][1]} revenue"),
            ("Seed-ready", "≤ 2 senior hours per valuation, proven on 500+ valuations"),
        ],
        "closing": "Censio. Signed valuations at the speed of the deal.",
        "notes": "We're raising 1.5 million euros pre-seed, mostly for product and senior valuers. It takes us to "
                 "650 signed valuations over two years and one million euros of revenue in 2028. Censio: signed "
                 "valuations at the speed of the deal.",
        "qa": [f"Net burn 2027–28 {eur_m(P['net_burn_2027_28'])}; working capital {eur_m(P['working_capital'])}; "
               f"equipment €0.04m; reserve {FMT['buffer']}."],
        "sources": ["model"],
    },
]


def notes_text(slide: dict, extra: str = "") -> str:
    parts = [slide["notes"]]
    if extra:
        parts.append(extra)
    if slide["qa"]:
        parts.append("If asked:\n" + "\n".join(f"- {q}" for q in slide["qa"]))
    if slide["sources"]:
        parts.append("Sources:\n" + "\n".join(f"- {SOURCES[k]}" for k in slide["sources"]))
    return "\n\n".join(parts)


def source_line(slide: dict) -> str:
    return ("Sources: " + "; ".join(SHORT[k] for k in slide["sources"])) if slide["sources"] else ""
