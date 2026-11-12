"""Censio pitch model: market size, unit economics, plan 2027-2031, use of proceeds.

Every number in the pitch deck comes from here (written to numbers.json) or from
appendix A of docs/superpowers/specs/2026-11-12-censio-pitch-deck-design.md.
Money in EUR, net of VAT, constant 2027 euros. Comments tag each input:
S = sourced (spec appendix A), A = assumption (spec appendix B).
"""

from __future__ import annotations

import json
from pathlib import Path

YEARS = [2027, 2028, 2029, 2030, 2031]

# ---- Market inputs -------------------------------------------------------
MFH_SALES_2024 = 34_700          # S GEWOS IMA 2025
COMMERCIAL_SALES_2024 = 38_800   # S GEWOS IMA 2025
VALUATIONS_PER_SALE = 1.5        # A buyer and/or lender (range 1-2)
MEAN_MARKET_FEE = 3_500          # A between BVS minimum 2,750 and the 1m row 4,360
BUY_SIDE_SHARE = 0.5             # A share of MFH purchases with a buy-side valuation

# ---- Segments: valuations per year, price, senior review hours ----------
SEGMENTS = {
    "Investors (multi-family)": ([100, 450, 1000, 1700, 2400], [1800, 2000, 2000, 2000, 2000], 2.0),
    "Portfolio & fund revaluations": ([0, 100, 300, 700, 1200], [1100] * 5, 1.0),
    "Banks": ([0, 0, 150, 400, 800], [2200] * 5, 3.0),
    "Commercial & DACH": ([0, 0, 0, 150, 400], [3200] * 5, 3.5),
}
PRICE = 2_000                    # A list price per signed valuation (beachhead)
SENIOR_COST = 150_000            # A fully loaded senior valuer per year
REVIEW_HOURS = 1_000             # A review hours per senior per year
AI_COST = 5                      # A per valuation (measured ~0.45 EUR, plus buffer)
DATA_COST = 40                   # A documents and data per valuation
HOSTING_COST = 10                # A hosting, storage, e-signature per valuation
INSURANCE_RATE = 0.025           # A professional indemnity insurance, share of price
PAYMENTS_RATE = 0.01             # A payments and other, share of price

# ---- Team: year-end and average heads, cost per head ---------------------
FOUNDERS = 4                                     # CEO, AI, business development, sales
FOUNDER_COST = [60_000, 80_000, 110_000, 130_000, 150_000]
SENIORS_YE = [2, 3, 5, 9, 14]
SENIORS_AVG = [1.5, 2.5, 4.0, 7.0, 11.5]
PLATFORM_YE = [1, 2, 2, 3, 4]
PLATFORM_AVG = [1.0, 1.5, 2.0, 2.5, 3.5]
PLATFORM_COST = 120_000
SALES_YE = [0, 0, 1, 2, 2]
SALES_AVG = [0, 0, 0.5, 1.5, 2.0]
SALES_COST = 130_000
OPS_YE = [0, 0, 1, 1, 1]
OPS_AVG = [0, 0, 0.5, 1.0, 1.0]
OPS_COST = 110_000
NON_STAFF = {  # thousand EUR per year
    "ai_infra": [30, 60, 100, 150, 200],
    "data": [20, 40, 60, 90, 120],
    "marketing": [40, 80, 150, 250, 400],
    "legal": [40, 60, 90, 120, 150],
    "recruiting": [30, 40, 70, 110, 140],
    "office": [40, 60, 100, 150, 200],
    "expansion": [0, 0, 0, 300, 600],
}

# ---- Round -----------------------------------------------------------------
ASK = 1_500_000
CAPEX = 40_000
RECEIVABLE_DAYS = 30

# ---- Classic comparison ------------------------------------------------------
COURT_RATE = 125                 # S JVEG, EUR per hour
BVS_FEE_1M = 4_360               # S BVS 2026, net fee at 1m


def unit_economics(price: float = PRICE, hours: float = 2.0) -> dict:
    lines = {
        "Senior review (2 h)": hours * SENIOR_COST / REVIEW_HOURS,
        "Data & documents": DATA_COST,
        "Hosting & e-signature": HOSTING_COST,
        "AI": AI_COST,
        "Insurance & payments": (INSURANCE_RATE + PAYMENTS_RATE) * price,
    }
    cost = sum(lines.values())
    return {"price": price, "cost_lines": lines, "cost": cost, "gross_margin": (price - cost) / price}


def market() -> dict:
    income_sales = MFH_SALES_2024 + COMMERCIAL_SALES_2024
    tam = income_sales * VALUATIONS_PER_SALE * MEAN_MARKET_FEE
    sam_count = MFH_SALES_2024 * BUY_SIDE_SHARE
    sam = sam_count * MEAN_MARKET_FEE
    seg = SEGMENTS["Investors (multi-family)"]
    som = seg[0][-1] * seg[1][-1]
    return {
        "income_sales_2024": income_sales,
        "mfh_sales_2024": MFH_SALES_2024,
        "tam_eur": tam,
        "tam_valuations": income_sales * VALUATIONS_PER_SALE,
        "sam_eur": sam,
        "sam_valuations": sam_count,
        "som_2031_eur": som,
        "som_2031_valuations": seg[0][-1],
        "som_share_of_sam": seg[0][-1] / sam_count,
    }


def plan() -> dict:
    out = {}
    for i, year in enumerate(YEARS):
        n = sum(v[0][i] for v in SEGMENTS.values())
        seg_rev = {k: v[0][i] * v[1][i] for k, v in SEGMENTS.items()}
        rev = sum(seg_rev.values())
        hours = sum(v[0][i] * v[2] for v in SEGMENTS.values())
        senior_cost = SENIORS_AVG[i] * SENIOR_COST
        variable = n * (AI_COST + DATA_COST + HOSTING_COST) + rev * (INSURANCE_RATE + PAYMENTS_RATE)
        gross_profit = rev - senior_cost - variable
        staff = (FOUNDERS * FOUNDER_COST[i] + PLATFORM_AVG[i] * PLATFORM_COST
                 + SALES_AVG[i] * SALES_COST + OPS_AVG[i] * OPS_COST)
        non_staff = sum(v[i] for v in NON_STAFF.values()) * 1000
        ebitda = gross_profit - staff - non_staff
        hc_ye = FOUNDERS + SENIORS_YE[i] + PLATFORM_YE[i] + SALES_YE[i] + OPS_YE[i]
        hc_avg = FOUNDERS + SENIORS_AVG[i] + PLATFORM_AVG[i] + SALES_AVG[i] + OPS_AVG[i]
        out[year] = {
            "valuations": n,
            "revenue": rev,
            "segment_revenue": seg_rev,
            "review_hours": hours,
            "senior_utilisation": hours / (SENIORS_AVG[i] * REVIEW_HOURS),
            "cogs": senior_cost + variable,
            "gross_margin": gross_profit / rev,
            "opex": staff + non_staff,
            "ebitda": ebitda,
            "ebitda_margin": ebitda / rev,
            "headcount_ye": hc_ye,
            "headcount_avg": hc_avg,
            "seniors_ye": SENIORS_YE[i],
            "revenue_per_head": rev / hc_avg,
            "valuations_per_senior": n / SENIORS_AVG[i],
        }
    return out


def proceeds(p: dict) -> dict:
    """Gross spend 2027-28, grouped by purpose; each founder is counted where their role works."""
    first = (0, 1)
    rev = sum(p[YEARS[i]]["revenue"] for i in first)
    n = sum(p[YEARS[i]]["valuations"] for i in first)
    founder = sum(FOUNDER_COST[i] for i in first)
    k = lambda key: sum(NON_STAFF[key][i] for i in first) * 1000  # noqa: E731
    buckets = {
        "Build: product & AI": sum(PLATFORM_AVG[i] * PLATFORM_COST for i in first)
        + k("ai_infra") + k("data") + n * (AI_COST + DATA_COST + HOSTING_COST) + founder,
        "Deliver: senior valuers": sum(SENIORS_AVG[i] * SENIOR_COST for i in first) + INSURANCE_RATE * rev,
        "Sell: sales & partnerships": sum(SALES_AVG[i] * SALES_COST for i in first) + k("marketing")
        + PAYMENTS_RATE * rev + 2 * founder,
        "Run: operations, legal & compliance": sum(OPS_AVG[i] * OPS_COST for i in first) + k("legal")
        + k("recruiting") + k("office") + founder,
    }
    total = sum(buckets.values())
    gross = sum(p[YEARS[i]]["cogs"] + p[YEARS[i]]["opex"] for i in first)
    net_burn = -sum(p[YEARS[i]]["ebitda"] for i in first)
    working_capital = p[YEARS[1]]["revenue"] * RECEIVABLE_DAYS / 365
    g27 = p[YEARS[0]]["cogs"] + p[YEARS[0]]["opex"]
    g28 = p[YEARS[1]]["cogs"] + p[YEARS[1]]["opex"]
    runway_zero_revenue = 12 + (ASK - g27 - CAPEX) / (g28 / 12)
    valuations = sum(p[YEARS[i]]["valuations"] for i in first)
    return {
        "ask": ASK,
        "gross_spend_2027_28": gross,
        "bucket_total": total,
        "buckets": {name: v / total for name, v in buckets.items()},
        "net_burn_2027_28": net_burn,
        "working_capital": working_capital,
        "capex": CAPEX,
        "buffer": ASK - net_burn - working_capital - CAPEX,
        "runway_months_zero_revenue": runway_zero_revenue,
        "valuations_2027_28": valuations,
        "revenue_2028": p[YEARS[1]]["revenue"],
        "customers_2028": 25,  # A plan: 25 paying customers by the end of 2028
    }


def downside(p: dict) -> dict:
    """-40% volume, -10% price, 3 senior hours on the beachhead segment."""
    cum, worst, rows = 0.0, 0.0, {}
    for i, year in enumerate(YEARS):
        n = p[year]["valuations"] * 0.6
        rev = p[year]["revenue"] * 0.6 * 0.9
        hours = sum(v[0][i] * (3.0 if k.startswith("Investors") else v[2]) for k, v in SEGMENTS.items()) * 0.6
        seniors = max(1.5, hours / (REVIEW_HOURS * 0.85))
        cogs = seniors * SENIOR_COST + n * (AI_COST + DATA_COST + HOSTING_COST) + rev * (INSURANCE_RATE + PAYMENTS_RATE)
        ebitda = rev - cogs - p[year]["opex"]
        cum += ebitda
        worst = min(worst, cum)
        rows[year] = {"revenue": rev, "ebitda": ebitda}
    return {"years": rows, "ebitda_2031": rows[YEARS[-1]]["ebitda"], "cum_min": worst}


def team(p: dict) -> dict:
    last = p[YEARS[-1]]
    classic_hours_per_report = BVS_FEE_1M / COURT_RATE           # ~35 h
    classic_reports_low = REVIEW_HOURS / classic_hours_per_report  # ~29 a year
    classic_reports_high = REVIEW_HOURS / 20                       # 50 a year at 20 h
    return {
        "people_2031": last["headcount_ye"],
        "seniors_2031": last["seniors_ye"],
        "valuations_2031": last["valuations"],
        "valuations_per_senior_2031": last["valuations_per_senior"],
        "classic_hours_per_report": classic_hours_per_report,
        "classic_reports_per_valuer_low": classic_reports_low,
        "classic_reports_per_valuer_high": classic_reports_high,
        "classic_valuers_low": last["valuations"] / classic_reports_high,
        "classic_valuers_high": last["valuations"] / classic_reports_low,
        "censio_review_hours": 2.0,
    }


def build_numbers() -> dict:
    p = plan()
    breakeven = next(y for y in YEARS if p[y]["ebitda"] > 0)
    return {
        "market": market(),
        "unit": unit_economics(),
        "plan": {str(y): v for y, v in p.items()},
        "breakeven_year": breakeven,
        "proceeds": proceeds(p),
        "downside": downside(p),
        "team": team(p),
    }


if __name__ == "__main__":
    numbers = build_numbers()
    path = Path(__file__).with_name("numbers.json")
    path.write_text(json.dumps(numbers, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {path}")
    for year, r in numbers["plan"].items():
        print(f"{year}: {r['valuations']:>5} valuations · revenue €{r['revenue'] / 1e6:5.2f}m · "
              f"EBITDA €{r['ebitda'] / 1e6:+5.2f}m ({r['ebitda_margin']:+.0%}) · {r['headcount_ye']} people")
    print({k: f"{v:.1%}" for k, v in numbers["proceeds"]["buckets"].items()})
