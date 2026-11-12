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


def eur_bn(value: float) -> str:
    return f"€{value / 1e9:.1f}bn"


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
    "downside_out_of_cash": str(D["out_of_cash_year"]),
    "downside_extra_no_dach": eur_m(D["without_expansion"]["extra_cash_needed"]),
    "avg_seniors_last": f"{PLAN[YEARS[-1]]['valuations'] / T['valuations_per_senior_2031']:.1f}",
    "avg_hours_last": f"{PLAN[YEARS[-1]]['review_hours'] / PLAN[YEARS[-1]]['valuations']:.1f}",
    # The deal engine (marketplace from 2030)
    "deal_tam": eur_bn(M["deal_tam_eur"]),
    "deal_sam": eur_bn(M["deal_sam_eur"]),
    "eu_investment": f"€{M['eu_investment'] / 1e9:.0f}bn",
    "de_income_turnover": f"€{M['de_income_turnover'] / 1e9:.0f}bn",
    "take_rate": f"{M['take_rate'] * 100:.1f}%",
    "revenue_last": eur_m(LAST["revenue"]),
    "valuation_revenue_last": eur_m(LAST["valuation_revenue"]),
    "marketplace_revenue_last": eur_m(LAST["marketplace_revenue"]),
    "deals_last": f"{T['deals_2031']:,}",
    "deals_first": f"{PLAN[YEARS[3]]['deals']:,}",
    "deal_team_last": str(T["deal_team_2031"]),
    "experts_last": str(T["seniors_2031"] + T["deal_team_2031"]),
    "som_total_share": pct(LAST["revenue"] / M["deal_sam_eur"]),
    "rev_per_head_last": eur_m(LAST["revenue_per_head"]),
    "deal_share_last": pct(LAST["marketplace_revenue"] / LAST["revenue"]),
    "per_senior_spoken": f"{round(T['valuations_per_senior_2031'], -1):.0f}",
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
    ("Valuers", T["seniors_2031"], "valuer"),
    ("Deal team", T["deal_team_2031"], "ink"),
    ("Platform & AI", T["platform_2031"], "brand_accent"),
    ("Sales & ops", T["sales_ops_2031"], "ink2"),
    ("Founders", T["founders"], "brand"),
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
    "cbre": "CBRE press release, Jan 2026 (European real-estate investment €241bn in 2025)",
    "broker": "Immowelt, reduco.ai (broker fees on multi-family and commercial deals, freely negotiable, ~3–7%)",
    "kps": "§ 195 BauGB; state rules on purchase-price register extracts (confidential, legitimate interest only)",
    "akoga": "AK OGA/BBSR Immobilienmarktbericht 2026 (872,000 sales, €278bn in 2025)",
    "gewos": "GEWOS IMA 2025 (multi-family 34,700 sales, commercial 38,800 sales, 2024)",
    "bvs": "BVS Honorarrichtlinie 2026 (non-binding fee guideline)",
    "jveg": "JVEG Anlage 1, Sachgebiet 7 (€125/h since 1 Jun 2025)",
    "speed": "ImmoScout24, jacasa (3–4 weeks, up to 6); service.berlin.de, Heidelberg board (4–6 months)",
    "fees": "Team's market experience (indicative valuations at large firms €3–5k); ftimmobilien24 Munich guide "
            "(multi-family reports €4–8k); Haus & Grund (0.5–1.5% of value)",
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
    "cbre": "CBRE 2026",
    "broker": "Immowelt; reduco.ai",
    "kps": "§ 195 BauGB",
    "akoga": "AK OGA/BBSR 2026",
    "gewos": "GEWOS IMA 2025",
    "bvs": "BVS fee guideline 2026",
    "jveg": "JVEG",
    "speed": "ImmoScout24; Berlin and Heidelberg valuation boards",
    "fees": "team market experience; Munich guide; Haus & Grund",
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
        "title": "The AI-native deal engine for real estate",
        "sub": "Starting where every deal stalls: signed property valuations in 48 hours",
        "seconds": 11,
        "notes": "Buying a building still takes months. We're Censio, the AI-native deal engine for real estate, "
                 "starting with signed valuations in 48 hours.",
        "qa": [],
        "sources": [],
    },
    {
        "key": "vision",
        "eyebrow": "Vision & mission",
        "title": "A building should change hands as easily as a share",
        "sub": "Where we are going, and the step we take first",
        "seconds": 17,
        "vision": "By 2032, a building changes hands anywhere in the world almost as easily as a share: valued, "
                  "financed and closed within a week, because AI runs every step of the deal and experts sign only "
                  "the judgement calls. This matters because a building is most people's largest asset, yet buying "
                  "one is still slow, costly and based on trust.",
        "mission": "We take the slowest steps out of every property deal for investors, owners and lenders, by letting "
                   "AI prepare every figure and document while senior experts judge and sign, starting with the "
                   "valuation, so that valuing, financing and closing a building within a week becomes possible.",
        "notes": "Our vision: by 2032, a building changes hands almost as easily as a share, valued, financed and "
                 "closed within a week. Our mission: AI prepares every step, senior experts sign, starting with the "
                 "valuation.",
        "qa": ["Today a building takes months to change hands: weeks for the valuation alone, then financing and the "
               "notary. We start where every deal stalls.",
               "Independence: valuation fees are fixed and never tied to a closing; valuers are not paid on deals."],
        "sources": [],
    },
    {
        "key": "problem",
        "eyebrow": "Problem",
        "title": "Every deal waits weeks for one signature",
        "sub": "A deal runs valuation, financing and closing by hand, one after another, and brokers take 3–7%. "
               "The valuation is the first wall",
        "seconds": 30,
        "stats": [
            ("Time", "3–6 weeks", "for a full valuation report from a private valuer; public valuation boards "
                                  "take months (Heidelberg: 4–6)"),
            ("Cost", "€3–5k+", "for just an indicative valuation at a large firm; a signed full report costs "
                               "more (up to 0.5–1.5% of value)"),
            ("People", "60 years", "average age of Germany's sworn experts (all fields), with 10–12% fewer "
                                   "than five years ago"),
        ],
        "footnote": f"≈{FMT['classic_hours']} billable expert hours in a full report's fee, incl. site visit and "
                    "travel (est.: €4,360 ÷ €125/h court rate)",
        "notes": "A property deal runs step by step, by hand: valuation, financing, notary. The first wall is the "
                 "valuation. Even an indicative one from a large firm costs three to five thousand euros; a signed "
                 "report costs more and takes three to six weeks. And the experts who sign are ageing: sworn experts "
                 "are 60 on average.",
        "qa": ["The expert count covers all fields; no official count of property valuers exists. HypZert certifies "
               "~200 new valuers a year (>2,000 in total), which is the pool we hire from.",
               "The 35 hours are an estimate: the BVS fee at €1m divided by the €125/h court rate. They include "
               "the site visit, travel and the written report.",
               "Fees: €3–5k for an indicative valuation at large firms is our team's market experience; public "
               "guides show €4–8k for multi-family reports (Munich) and 0.5–1.5% of value (Haus & Grund)."],
        "sources": ["fees", "broker", "speed", "bvs", "ihk", "jveg", "hypzert"],
    },
    {
        "key": "solution",
        "eyebrow": "Playbook & solution · our wedge",
        "title": "AI does the groundwork. Seniors make the call",
        "sub": "Our wedge: sell the signed valuation, not software. AI does the junior work, a senior valuer "
               "judges and signs",
        "seconds": 28,
        "steps": [
            ("ai", "Read", "Land register, rent roll, energy certificate, refurbishment sheet, zoning plan"),
            ("ai", "Research", "Land values, the valuation board's cap rates, market rents, comparables"),
            ("rules", "Compute", "Rules compute the income value by the ImmoWertV; each number cited or "
                                 "flagged"),
            ("ai", "Flag", "Judgement calls that move the value go to the senior"),
            ("valuer", "Decide", "A senior valuer approves or revalues, then signs"),
        ],
        "proof": [
            ("≈€0.45", "of AI per valuation (est.)"),
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
        "sub": "Demo mode with sample data, sped up 1.2×: the client uploads, the AI prepares, the senior revises "
               "and signs",
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
        "title": f"A €390m wedge into a {FMT['deal_tam']}+ deal market",
        "sub": f"We enter through valuations and grow into a fee on every deal: {FMT['eu_investment']} of European "
               "real-estate investment in 2025 alone",
        "seconds": 25,
        "rings": [
            ("TAM", FMT["deal_tam"] + "+", "a year",
             f"Europe, institutional deals only: {FMT['eu_investment']} invested (2025) × {FMT['take_rate']} deal "
             "fee (est.); smaller deals and valuations come on top"),
            ("SAM", FMT["deal_sam"], "a year",
             f"Germany, every multi-family and commercial sale: {FMT['de_income_turnover']} (2025f) × "
             f"{FMT['take_rate']} deal fee, plus €390m of valuations (est.)"),
            ("SOM", FMT["revenue_last"], "in 2031",
             f"Our plan: {FMT['valuation_revenue_last']} valuations + {FMT['marketplace_revenue_last']} deal fees "
             f"({FMT['deals_last']} deals), ≈{FMT['som_total_share']} of the SAM"),
        ],
        "on_top": f"Wedge: ≈€390m of income-property valuations a year in Germany; beachhead: buy-side valuations of "
                  f"multi-family houses, ≈{FMT['sam']}. A {FMT['take_rate']} fee is a fraction of the ~3–7% brokers "
                  "charge on these deals.",
        "notes": "Every deal starts with a valuation, about 390 million euros a year in Germany: our wedge. The prize "
                 "is the deal: 241 billion euros of European investment in 2025. At one and a half percent, that is "
                 "3.6 billion euros a year.",
        "qa": ["A 1.5% deal fee is our assumption; valuations are billed separately at fixed fees. Brokers charge "
               "about 3–7% on multi-family and commercial deals, freely negotiable.",
               "CBRE's €241bn counts institutional deals only (Germany ≈€33bn of it); our SAM counts every German "
               "income-property sale, including the ≈€1m deals we target, so a Europe TAM on that basis is larger.",
               f"Beachhead: buy-side valuations of multi-family houses, ≈{FMT['sam']} a year ({FMT['mfh_sales']} "
               "sales × 50% × €3,500, est.).",
               "Context: 872,000 property sales worth €278bn in Germany in 2025 (AK OGA)."],
        "sources": ["cbre", "gewos", "broker", "akoga", "bvs"],
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
                        "€5k+ · 3–6 weeks · full report with site visit"),
            "short": ("Indicative valuations", "large firms' desktop or short reports",
                      "days to weeks · €3–5k · indicative only"),
            "avm": ("Automated models & portals", "PriceHubble · Sprengnetter · on-geo LORA indication · ImmoScout24",
                    "seconds · nobody signs"),
            "censio": ("Censio", "Signed desktop valuation; site visit on request", f"48 hours · {FMT['price']}"),
        },
        "why": [
            ("valuer", "Why the signature stays",
             "EU bank rules (CRR III Art. 229) require an independent valuer; a model may not be the sole review. "
             "A court paid €0 for an expert report written with undisclosed AI (LG Darmstadt, 2025). Censio "
             "discloses every AI step."),
            ("brand", "Our data flywheel",
             "Each valuation adds a rent roll, each deal closed on Censio its verified price: our own cap rates and "
             "sales comparables, data the official register keeps confidential and no frontier model can see. More "
             "data, sharper values, fewer senior minutes, more deals."),
        ],
        "notes": "Today you must choose. Automated models answer in seconds, but nobody signs them. Indicative "
                 "valuations cost three to five thousand euros. Full reports are signed, but take weeks. Censio is "
                 "built to be both, and every valuation and deal sharpens our sales comparisons: a data flywheel no "
                 "frontier model can copy.",
        "qa": ["If the next GPT, Claude or Gemini release ships our features, it cuts our preparation cost but "
               "cannot sign, carry liability or see our closing prices and corrections.",
               "US precedent for a tech-enabled, appraiser-signed firm: Bowery Valuation, $35m Series B (2021).",
               "Our comparables: the valuation boards' purchase-price register is confidential; detailed extracts go "
               "only to experts with a legitimate interest, per valuation (§ 195 BauGB). Our own closed deals give "
               "us full prices with rent rolls for the sales-comparison approach.",
               "Also competing: the buyer's own spreadsheet, in-house bank valuers on platforms like on-geo LORA "
               "(≈98% of Sparkassen), VALUE AG; for deals, brokers and listing portals.",
               "Why €2,000? A large firm charges €3–5k for an indicative valuation and more for a signed full "
               "report; we deliver a signed, sourced desktop valuation in 48 hours for less.",
               "Is LG Darmstadt a risk for us? That fee was cut because the expert hid AI use in a court report. "
               "Censio's reports disclose every AI step, and each judgement call is the signing valuer's."],
        "sources": ["crr", "darmstadt", "bowery", "fees", "kps"],
    },
    {
        "key": "traction",
        "eyebrow": "Traction · north star",
        "title": "North star: valued in 48 hours, funded bid in 7 days",
        "sub": "One North Star per phase. Today: a working prototype, no customers yet",
        "seconds": 22,
        "stars": [
            ("Phase 1 · valuation firm", "Signed valuations delivered within 48 hours",
             f"reviewed weekly · today 0 · 2027: {FMT['valuations'][0]} a year"),
            ("Phase 2 · marketplace, from 2030", "Listings with a funded bid within 7 days",
             "monthly · replaces phase 1 when the marketplace opens"),
        ],
        "inputs": [
            ("Senior minutes per valuation", "target ≤ 120"),
            ("Closing prices captured", "share of client purchases"),
        ],
        "timeline": [
            ("Today", "Working prototype",
             "AI reads 5 document types, rules compute the income value, the senior revises and signs."),
            ("Next 90 days", "Design partners",
             "Target: 5 investors, 50 shadow valuations side by side with signed reports, senior minutes measured."),
            ("2027", "First revenue", f"{FMT['valuations'][0]} paid valuations, 10 customers (plan)."),
        ],
        "notes": "We steer by one number per phase: first, signed valuations delivered within 48 hours; from 2030, "
                 "listings that get a funded bid within seven days. Today that number is zero: a working prototype, "
                 "no customers yet. Next: 50 shadow valuations.",
        "qa": ["Shadow valuation = we value a deal the investor is already valuing, and compare our result and time "
               "with the signed report they receive.",
               "The 48 hours run from complete documents; missing documents pause the clock."],
        "sources": ["prototype", "model"],
    },
    {
        "key": "gtm",
        "eyebrow": "Go-to-market & revenue",
        "title": "Enter with the valuation, then own the deal",
        "sub": "Valuations stay a business of their own and feed the marketplace: owners list, investors bid, "
               "lenders finance",
        "seconds": 25,
        "path": [
            ("2027", "Valuations for multi-family investors", "€2,000",
             "the wedge: asset managers, family offices, housing firms"),
            ("2028", "Fund & portfolio revaluations", "€1,100",
             "quarterly revaluations for property funds (KAGB)"),
            ("2029", "Banks: lending values and financing", "€2,200",
             "site visits by HypZert seniors; loans pre-approved on our file"),
            ("2030", "Marketplace + commercial & DACH", f"{FMT['take_rate']} fee",
             "owners list with a signed value; investors bid"),
        ],
        "later": "2031+: Europe, then the deal engine. Value, finance and close any building within a week. "
                 "Valuation fees stay fixed, never tied to a closing.",
        "notes": "We enter with signed valuations for multi-family investors at 2,000 euros, then fund revaluations, "
                 "then banks and financing. From 2030 our marketplace, plus commercial and DACH: owners list with a "
                 "signed value, investors bid, and we earn a deal fee. Revenue reaches 31.7 million euros in 2031.",
        "qa": [f"Plan: {FMT['deals_first']} deals in 2030 and {FMT['deals_last']} in 2031 at ≈€1m each and a "
               f"{FMT['take_rate']} fee (est.); valuations alone reach {FMT['valuation_revenue_last']} in 2031.",
               "2027 is a €1,800 launch price; €2,000 from 2028. Segment volumes and prices are in model.py.",
               "Owners list for free: their signed valuation is part of the marketplace (600 in 2030, 3,000 in "
               "2031, in the valuation counts).",
               "Independence: valuers are not paid on deals; valuation fees are fixed."],
        "sources": ["model", "broker", "kagb", "belwertv"],
    },
    {
        "key": "team",
        "eyebrow": "Team",
        "title": "No juniors. Only seniors and AI",
        "sub": f"AI does the junior work, so in 2031, {FMT['experts_last']} of our {FMT['people_last']} people are "
               "senior valuers and deal experts",
        "seconds": 28,
        "classic": [("Partners", "ink"), ("Senior valuers", "ink"), ("Juniors & analysts", "ink")],
        "censio": [("Founders", "brand"), ("Senior valuers", "valuer"), ("AI does the preparation", "ai")],
        "stats": [
            (f"{FMT['classic_low']}–{FMT['classic_high']}", "full reports per valuer a year (est.: 1,000 h ÷ 20–35 h)"),
            (FMT["per_senior"], f"signed valuations per senior a year (2031 plan, {FMT['avg_seniors_last']} "
                                "seniors on average)"),
        ],
        "bridge": f"{FMT['valuations_last']} valuations and {FMT['deals_last']} deals in 2031 with "
                  f"{FMT['people_last']} people; a classic firm needs ≈{FMT['classic_valuers_low']}–"
                  f"{FMT['classic_valuers_high']} valuers for the valuations alone (est.)",
        "first_hire": "First hire: a HypZert / öbuv senior who signs from 2027",
        "notes": "AI-native means: AI does the junior work, so we hire only seniors. We four founders run the company; "
                 "senior valuers sign and senior deal managers close. One senior signs about "
                 f"{FMT['per_senior_spoken']} valuations a year, instead of 30 to 50. By 2031, {FMT['people_last']} "
                 f"people run {FMT['valuations_last']} valuations and {FMT['deals_last']} deals.",
        "qa": ["Who signs the first report? Our first hire, a HypZert / öbuv senior valuer, paid from the Deliver "
               "share. Hiring pool: >2,000 HypZert valuers, ~200 newly certified a year.",
               f"Revenue per person in 2031: ≈{FMT['rev_per_head_last']} (plan).",
               "Entry-level work is already shrinking: −13% employment for 22–25-year-olds in the most AI-exposed "
               "jobs (Stanford, 2025).",
               "Founder roles are placeholders until the team fixes them."],
        "sources": ["model", "hypzert", "stanford", "bvs", "jveg"],
    },
    {
        "key": "financials",
        "eyebrow": "Financial projections",
        "title": f"{FMT['revenue_last']} revenue by 2031, {FMT['deal_share_last']} from deal fees",
        "sub": f"Valuations break even in {FMT['breakeven']} and fund the marketplace build; from 2030 deal fees lift "
               f"EBITDA to {FMT['ebitda_last']} ({FMT['ebitda_margin_last']}) in 2031",
        "seconds": 22,
        "downside": f"Downside for the valuation business (−40% volume, −10% price, 3 senior hours): the round runs "
                    f"out in {FMT['downside_out_of_cash']} and {FMT['downside_extra']} more is needed, so we raise a "
                    "seed on 2028 data",
        "notes": "Valuations alone break even in 2029 and fund the marketplace build. From 2030 the deal fee takes "
                 f"revenue to 31.7 million and EBITDA to {FMT['ebitda_last'][1:-1]} million in 2031. First we must "
                 "prove two senior hours per valuation.",
        "qa": [f"Downside (valuation business, plan costs): EBITDA 2031 {FMT['downside_2031']}, cumulative low "
               f"{FMT['downside_cum']}; cash runs out in {FMT['downside_out_of_cash']} and the round is "
               f"{FMT['downside_extra']} short ({FMT['downside_extra_no_dach']} without the DACH expansion).",
               f"79% is per valuation at full senior use; company gross margin is {FMT['company_gm']} in 2029–31.",
               "Marketplace assumptions: 300 and 1,500 deals, ≈€1m average ticket (GEWOS: €0.95m), 1.5% fee, €4k "
               "per deal, one deal manager per ~75 deals, build from 2029; none of it is proven yet.",
               "The 2029 seed funds the marketplace build faster; the plan itself carries the build costs and stays "
               "EBITDA-positive."],
        "sources": ["model", "prototype", "gewos"],
    },
    {
        "key": "ask",
        "eyebrow": "Use of proceeds",
        "title": f"{FMT['ask']} to prove the wedge, start the flywheel",
        "sub": f"24 months to {FMT['valuations_2027_28']} signed valuations, {FMT['customers_2028']} customers and "
               f"{FMT['revenue_2028']} revenue, with {FMT['runway']} months of runway at zero revenue",
        "seconds": 22,
        "donut_caption": f"Split of all 2027–28 spending ({FMT['spend_2027_28']}), funded by the "
                         f"{FMT['ask']} round and {FMT['revenue_2027_28']} of revenue; {FMT['buffer']} of the round "
                         "stays in reserve",
        "milestones": [
            ("2027", f"First senior signs · {FMT['valuations'][0]} valuations · 10 customers"),
            ("2028", f"{FMT['valuations'][1]} valuations · {FMT['customers_2028']} customers · "
                     f"{FMT['revenue'][1]} revenue · first 100 closing prices"),
            ("2029", "Seed for the marketplace, on proof: ≤ 2 senior hours, 30 owners ready to list"),
        ],
        "closing": "Censio. Buildings change hands as easily as shares.",
        "notes": "We're raising 1.5 million euros pre-seed to prove the wedge: 650 signed valuations and one million "
                 "euros of revenue by 2028. Then we raise a seed and build the deal engine. Censio: buildings change "
                 "hands as easily as shares.",
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
