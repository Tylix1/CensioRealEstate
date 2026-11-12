"""Copy, numbers and speaker script for the Censio pitch deck (English).

Headlines are one-liners without a final full stop; `sub` is the reading-version sub headline. Every figure is
formatted from numbers.json (model.py) or quoted from appendix A of the design spec. `notes` is the spoken script
(timed by `seconds`); `qa` holds backup answers; `sources` is printed under both.
"""

from __future__ import annotations

import json
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


M = NUM["market"]
U = NUM["unit"]
P = NUM["proceeds"]
T = NUM["team"]
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
    "price": eur(U["price"]),
    "unit_cost": eur(U["cost"]),
    "gross_profit": eur(U["price"] - U["cost"]),
    "gross_margin": pct(U["gross_margin"]),
    "revenue": [eur_m(PLAN[y]["revenue"]) for y in YEARS],
    "ebitda": [eur_m(PLAN[y]["ebitda"]) for y in YEARS],
    "valuations": [f"{PLAN[y]['valuations']:,}" for y in YEARS],
    "people": [str(PLAN[y]["headcount_ye"]) for y in YEARS],
    "ebitda_margin_last": pct(LAST["ebitda_margin"]),
    "breakeven": str(NUM["breakeven_year"]),
    "ask": eur_m(P["ask"]),
    "runway": f"{P['runway_months_zero_revenue']:.0f}",
    "valuations_2027_28": f"{P['valuations_2027_28']:,}",
    "revenue_2028": eur_m(P["revenue_2028"], 1),
    "customers_2028": str(P["customers_2028"]),
    "per_senior": f"{T['valuations_per_senior_2031']:,.0f}",
    "classic_low": f"{T['classic_reports_per_valuer_low']:.0f}",
    "classic_high": f"{T['classic_reports_per_valuer_high']:.0f}",
    "classic_valuers_low": f"{round(T['classic_valuers_low'], -1):.0f}",
    "classic_valuers_high": f"{round(T['classic_valuers_high'], -1):.0f}",
    "people_last": str(T["people_2031"]),
    "valuations_last": f"{T['valuations_2031']:,}",
    "classic_hours": f"{T['classic_hours_per_report']:.0f}",
}

BUCKETS = P["buckets"]

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
    "darmstadt": "LG Darmstadt, 10 Nov 2025, 19 O 527/16",
    "bowery": "BusinessWire 2021; company job posting 2023 (Bowery Valuation, >$80m raised)",
    "pricehubble": "tech.eu 2021 (PriceHubble $34m Series B)",
    "vdp": "vdp 2026 (€148.6bn new property loans in 2025)",
    "destatis_tax": "Destatis 2026 (€51.6bn real estate in taxed inheritances and gifts, 2025)",
    "kagb": "§§ 250–251 KAGB",
    "stanford": "Brynjolfsson, Chandar, Chen: Canaries in the Coal Mine, Stanford Digital Economy Lab 2025",
    "prototype": "Censio prototype, measured AI cost per run (README)",
    "model": "Censio plan model (pitch/build/model.py), assumptions in the design spec, appendix B",
    "cbre_jll": "CBRE FY2025 results; JLL 10-K 2025",
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
    "vdp": "vdp 2026",
    "destatis_tax": "Destatis 2026",
    "kagb": "KAGB",
    "stanford": "Stanford DEL 2025",
    "prototype": "Censio prototype",
    "model": "Censio plan model (assumptions marked est.)",
    "cbre_jll": "CBRE, JLL 2025",
}

SLIDES = [
    {
        "key": "cover",
        "title": "Signed property valuations in 48 hours, not 6 weeks",
        "sub": "The AI-native valuation firm for income-producing real estate in Germany",
        "seconds": 10,
        "notes": "We're Censio. We deliver signed property valuations in 48 hours, not six weeks: "
                 "AI does the groundwork, senior valuers make the call.",
        "qa": [],
        "sources": [],
    },
    {
        "key": "vision",
        "title": "Every property deal deserves a value you can trace",
        "sub": "Where we are going, and what we do every day to get there",
        "seconds": 20,
        "vision": "Every property decision rests on a signed value that anyone can trace back to its sources.",
        "mission": "AI does the groundwork, senior valuers make the call: a signed ImmoWertV valuation "
                   "in 48 hours, for less than half of today's fee.",
        "notes": "Our vision: every property decision rests on a value anyone can trace to its sources. "
                 "Our mission: AI prepares, a senior valuer decides and signs, delivered in 48 hours for less "
                 "than half of today's fee. Throughout the deck, orange means AI and violet means the senior valuer.",
        "qa": [f"Less than half: {FMT['price']} vs. €4,360 net at a €1m property value (BVS 2026)."],
        "sources": ["bvs"],
    },
    {
        "key": "problem",
        "title": "Every deal waits weeks for one signature",
        "sub": "A full valuation of a €1–3m apartment building costs €4,360–6,800 and takes 3–6 weeks, "
               "and the people who sign it are retiring",
        "seconds": 35,
        "stats": [
            ("3–6 weeks", "for a full valuation report from a private valuer; public valuation boards take 4–6 months"),
            ("€4.4–6.8k", "net fee for a €1–3m apartment building under the valuers' own fee guideline (€4,360–6,800)"),
            ("Ø 60 years", "average age of Germany's sworn experts, with 10–12% fewer than five years ago"),
        ],
        "footnote": f"≈{FMT['classic_hours']} hours of expert time per report (est.: €4,360 fee ÷ €125/h court rate)",
        "notes": "When an investor buys an apartment building for one to three million euros, a full valuation "
                 "costs between 4,400 and 6,800 euros and takes three to six weeks. Public valuation boards take "
                 f"months. That is around {FMT['classic_hours']} hours of expert time per report, much of it reading "
                 "documents and typing numbers into a spreadsheet. And the people who sign are retiring: Germany's "
                 "sworn experts are 60 on average, and there are 10 to 12 percent fewer of them than five years ago.",
        "qa": ["The expert count covers all fields, not only property; no official count of property valuers exists.",
               "The 35 hours are an estimate: BVS fee at €1m divided by the €125/h court rate."],
        "sources": ["speed", "bvs", "ihk", "jveg"],
    },
    {
        "key": "solution",
        "title": "AI does the groundwork. Seniors make the call",
        "sub": "Our playbook splits every valuation into what AI does reliably and what only a senior valuer can sign",
        "seconds": 30,
        "steps": [
            ("ai", "Read", "Land register, rent roll, energy certificate, refurbishment sheet, zoning plan"),
            ("ai", "Research", "Land values, rent index, the valuation board's cap rates, comparables"),
            ("ai", "Compute", "Income value by the book (ImmoWertV §§ 27–34), every number cited"),
            ("ai", "Flag", "The few judgement calls that move the value"),
            ("valuer", "Decide", "A senior valuer approves or revalues, then signs"),
        ],
        "proof": [
            ("≈ US$0.50", "of AI per valuation (measured)"),
            (f"2 h, not ≈{FMT['classic_hours']} h", "of senior time per valuation (est.)"),
            ("27 of 31", "numbers traced to a source by the AI"),
        ],
        "notes": "Our playbook splits the work. AI reads the land register, rent roll and energy certificate, pulls "
                 "land values and comparables, computes the income value exactly as the ImmoWertV prescribes, and "
                 "cites every number. Then it flags the few judgement calls that move the value. A senior valuer "
                 "checks those, approves or revalues, and signs. That costs about fifty cents of AI and two senior "
                 f"hours instead of {FMT['classic_hours']}.",
        "qa": ["US$0.50 is measured on the prototype (5 sample PDFs, 17 pages); worst case about US$1.",
               "2 senior hours is our planning assumption; the first 90 days test it with shadow valuations."],
        "sources": ["prototype", "model"],
    },
    {
        "key": "demo",
        "title": "From PDF to signed value in 30 seconds",
        "sub": "Recorded from our working prototype: the client uploads, the AI prepares, the senior valuer revises and signs",
        "seconds": 30,
        "notes": "Here it is in our prototype. The client uploads five documents, and the AI reads them. It builds "
                 "the valuation and flags four judgement calls. The senior valuer disagrees with the cap rate, writes "
                 "a note, and the AI revalues in seconds. The valuer checks the rest, signs, and the client receives "
                 "the report, where every figure names its source.",
        "qa": ["Shown in demo mode with sample data; with an API key the same flow reads real PDFs live."],
        "sources": [],
    },
    {
        "key": "market",
        "title": f"A {FMT['tam']} market, starting with apartment buildings",
        "sub": f"Germany sells ~{FMT['income_sales']} income properties a year, and each needs one or two valuations. "
               "Our beachhead: buy-side valuations of multi-family houses",
        "seconds": 25,
        "rings": [
            ("TAM", FMT["tam"], "a year",
             f"Income-property valuations triggered by sales: {FMT['income_sales']} sales × 1.5 valuations × €3,500 (est.)"),
            ("SAM", FMT["sam"], "a year",
             f"Buy-side valuations of multi-family houses: {FMT['mfh_sales']} sales × 50% with a valuation (est.)"),
            ("SOM", FMT["som"], "by 2031",
             f"{FMT['som_valuations']} signed valuations at {FMT['price']}, ≈{FMT['som_share']} of the SAM's valuations"),
        ],
        "on_top": "On top: bank lending (€148.6bn of new Pfandbrief-bank loans in 2025), refinancing, "
                  "fund revaluations (two valuers, every quarter) and inheritance tax (€51.6bn of property in 2025)",
        "notes": f"Germany sells around {FMT['income_sales']} income properties a year. Each needs one or two "
                 "valuations, which is a market of roughly 390 million euros a year from sales alone; lending, "
                 "refinancing, funds and tax come on top. We start with buy-side valuations of apartment buildings: "
                 "about 61 million euros a year. Our 2031 goal is 4.8 million of that.",
        "qa": ["No official count of valuations exists; 1.5 per sale and the €3,500 mean fee are assumptions.",
               "Market context: 872,000 property sales worth €278bn in 2025 (AK OGA)."],
        "sources": ["gewos", "akoga", "bvs", "vdp", "destatis_tax",
                    "kagb"],
    },
    {
        "key": "competition",
        "title": "Fast or signed: today you have to pick one",
        "sub": "Automated models answer in seconds, but nobody signs them. Valuers sign, but take weeks. Censio does both",
        "seconds": 25,
        "players": {
            "classic": ("Valuation firms & sworn experts", "CBRE · JLL · Savills · öbuv / HypZert valuers",
                        "3–6 weeks · €4,360–6,800"),
            "short": ("Short reports", "Kurzgutachten", "2–7 days · €300–900 · not for banks or courts"),
            "avm": ("Automated models & portals", "PriceHubble · Sprengnetter · on-geo · ImmoScout24",
                    "seconds · nobody signs"),
            "censio": ("Censio", "AI prepares, a senior signs", f"48 hours · {FMT['price']}"),
        },
        "why": [
            ("valuer", "Why the signature stays",
             "EU bank rules (CRR III Art. 229) require an independent valuer; a model may not be the sole review. "
             "A German court paid €0 for an undisclosed AI-written expert report (LG Darmstadt, 2025)."),
            ("brand", "Proof it can scale",
             "In the US, Bowery Valuation, a tech-enabled appraisal firm whose own appraisers sign, "
             "has raised more than $80m."),
        ],
        "notes": "Today you must choose. Automated valuation models are instant, but nobody signs them. Valuation "
                 "firms sign, but take weeks. And the signature is not going away: EU bank rules require an "
                 "independent valuer, and a German court refused to pay for an undisclosed AI report. Censio is "
                 "built to be both signed and fast.",
        "qa": ["Closest German players to watch: on-geo (LORA, used by ~98% of Sparkassen) and VALUE AG, which "
               "also sells valuations. Neither offers investor-side, valuer-signed income valuations in 48 hours "
               "as far as we found."],
        "sources": ["crr", "darmstadt", "bowery", "pricehubble", "speed"],
    },
    {
        "key": "traction",
        "title": "North star: signed valuations within 48 hours",
        "sub": "What we steer by, and where we honestly stand today",
        "seconds": 20,
        "inputs": [
            ("Senior minutes per valuation", "target ≤ 120"),
            ("AI values kept unchanged", "share of all values"),
            ("Repeat customers", "share ordering again"),
        ],
        "timeline": [
            ("Today", "Working prototype",
             "AI reads 5 document types, builds the income valuation, the valuer revises and signs. "
             "≈ US$0.50 of AI per run."),
            ("Next 90 days", "Design partners",
             "5 investors, 50 shadow valuations side by side with signed reports, senior minutes measured."),
            ("2027", "First revenue", f"{FMT['valuations'][0]} paid valuations, 10 customers (plan)."),
        ],
        "notes": "We steer by one number: signed valuations delivered within 48 hours. Behind it we track senior "
                 "minutes per valuation, how often the AI's values stand, and repeat customers. Today we have a "
                 "working prototype; next we run shadow valuations with design partners.",
        "qa": ["No paying customers yet; the prototype runs with sample documents and live AI."],
        "sources": ["prototype", "model"],
    },
    {
        "key": "gtm",
        "title": "Land with investors, then add funds and banks",
        "sub": f"{FMT['price']} per signed valuation for multi-family investors first; portfolio revaluations, "
               "banks and commercial property follow",
        "seconds": 30,
        "path": [
            ("2027", "Investors buying multi-family houses", "€2,000", "direct sales, broker partners, industry events"),
            ("2028", "Portfolio & fund revaluations", "€1,100", "recurring: funds revalue every quarter"),
            ("2029", "Banks", "€2,200", "lending values, HypZert-certified seniors"),
            ("2030", "Commercial & DACH", "€3,200", "offices, retail, Austria, Switzerland"),
        ],
        "later": "Later option: a deal platform. Buyers and sellers are already on Censio, so a transaction "
                 "fee becomes possible. Upside only, not in the numbers.",
        "notes": f"We land with investors buying multi-family houses, at {FMT['price'].replace('€', '')} euros per "
                 "signed valuation, sold directly and through broker partners. From 2028 we add portfolio and fund "
                 "revaluations, from 2029 banks, then commercial property and DACH. That takes revenue from "
                 f"{FMT['revenue'][0][1:-1]} million in 2027 to {FMT['revenue'][-1][1:-1]} million in 2031. Later, "
                 "with buyers and sellers on the platform, a deal fee is upside on top.",
        "qa": [f"Segment prices and volumes are plan assumptions (spec appendix B); {FMT['customers_2028']} paying "
               "customers by the end of 2028."],
        "sources": ["model", "kagb"],
    },
    {
        "key": "team",
        "title": "No juniors. Only seniors and AI",
        "sub": "An AI-native firm: AI does the junior work, so every person at Censio judges, signs or builds",
        "seconds": 30,
        "classic": [("Partners", "ink"), ("Senior valuers", "ink"), ("Juniors & analysts", "ink")],
        "censio": [("Founders", "brand"), ("Senior valuers", "valuer"), ("AI does the preparation", "ai")],
        "operating": "The operating team: senior valuers (HypZert / öbuv) who sign every report, "
                     "plus a small platform team. No juniors.",
        "stats": [
            (f"≈{FMT['per_senior']}", f"valuations per senior a year; {FMT['classic_low']}–{FMT['classic_high']} "
                                      "in a classic firm (est.)"),
            (FMT["people_last"], f"people deliver {FMT['valuations_last']} valuations in 2031; a classic firm "
                                 f"needs ≈{FMT['classic_valuers_low']}–{FMT['classic_valuers_high']} valuers"),
        ],
        "notes": "This is what AI-native means. A classic firm is a pyramid of juniors doing preparation. At Censio, "
                 "AI does that work, so we only hire seniors. We four founders run the company; senior valuers sign "
                 "every report, with a small platform team. One senior signs about 400 valuations a year instead of "
                 f"30 to 50, so in 2031 {FMT['people_last']} people do the work of over 100 classic valuers.",
        "qa": ["Entry-level work is already shrinking: −13% employment for 22–25-year-olds in the most AI-exposed "
               "jobs (Stanford, 2025).",
               "Classic throughput: 1,000 review hours a year at 20–35 hours per report."],
        "sources": ["model", "stanford", "bvs", "jveg"],
    },
    {
        "key": "financials",
        "title": f"Break-even in {FMT['breakeven']}, {FMT['ebitda_margin_last']} EBITDA margin by 2031",
        "sub": "Revenue, EBITDA and team 2027–2031, and what one signed valuation earns",
        "seconds": 25,
        "notes": f"Each valuation sells for {FMT['price'].replace('€', '')} euros and costs about "
                 f"{FMT['unit_cost'].replace('€', '')} to deliver, mostly senior time, so the gross margin is "
                 f"{FMT['gross_margin'][:-1]} percent. We reach break-even in {FMT['breakeven']} and a "
                 f"{FMT['ebitda_margin_last'][:-1]} percent EBITDA margin by 2031, with {FMT['people'][-1]} people "
                 f"and {FMT['revenue'][-1][1:-1]} million euros of revenue.",
        "qa": [f"Downside (−40% volume, −10% price, 3 senior hours): EBITDA 2031 "
               f"{eur_m(NUM['downside']['ebitda_2031'])}, cumulative low {eur_m(NUM['downside']['cum_min'])}. "
               "Senior review time is the number to prove first.",
               "AI is measured at ≈€0.45 per run; the €5 in the cost line includes a buffer."],
        "sources": ["model", "prototype"],
    },
    {
        "key": "ask",
        "title": f"{FMT['ask']} pre-seed to reach {FMT['revenue_2028']} revenue in 2028",
        "sub": f"24 months to {FMT['valuations_2027_28']} signed valuations and {FMT['customers_2028']} paying "
               f"customers, with {FMT['runway']} months of runway even at zero revenue",
        "seconds": 20,
        "milestones": [
            ("2027", f"{FMT['valuations'][0]} signed valuations, 10 customers"),
            ("2028", f"{FMT['valuations'][1]} signed valuations, {FMT['customers_2028']} customers, "
                     f"{FMT['revenue'][1]} revenue"),
            ("Proof", "≤ 2 senior hours per valuation, first fund revaluations"),
        ],
        "closing": "Censio. Signed valuations at the speed of the deal.",
        "notes": f"We're raising {FMT['ask'][1:-1]} million euros pre-seed: 30 percent product and AI, 30 percent senior "
                 "valuers, 20 percent sales, 20 percent operations. It gets us to "
                 f"{FMT['valuations_2027_28']} signed valuations and one million euros of revenue in 2028. "
                 "Censio: signed valuations at the speed of the deal.",
        "qa": [f"Net burn 2027–28 {eur_m(P['net_burn_2027_28'])}; working capital {eur_m(P['working_capital'])}; "
               f"buffer {eur_m(P['buffer'])}."],
        "sources": ["model"],
    },
]


def notes_text(slide: dict) -> str:
    parts = [slide["notes"]]
    if slide["qa"]:
        parts.append("If asked:\n" + "\n".join(f"- {q}" for q in slide["qa"]))
    if slide["sources"]:
        parts.append("Sources:\n" + "\n".join(f"- {SOURCES[k]}" for k in slide["sources"]))
    return "\n\n".join(parts)


def source_line(slide: dict) -> str:
    return ("Sources: " + "; ".join(SHORT[k] for k in slide["sources"])) if slide["sources"] else ""
