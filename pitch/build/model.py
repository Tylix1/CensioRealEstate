"""Censio financial model 2027-2031: market size, unit economics, P&L, cash flow and use of proceeds.

This file is the Python twin of the Excel model (pitch/out/Censio-Financial-Model.xlsx, built by build_model_xlsx.py):
the workbook takes every input below and recomputes everything with live formulas, and test_model_xlsx.py checks that
both give the same results. Every number in the pitch deck comes from here (written to numbers.json).

Money in EUR, net of VAT, constant 2027 euros (no inflation). Each input carries a kind in DOC:
  S  sourced: a public figure (Sources sheet, spec appendix A)
  B  benchmark: set from public benchmarks (Sources sheet)
  T  team: the founders' market experience
  A  assumption: a plan choice we have to prove
"""

from __future__ import annotations

import json
from pathlib import Path

YEARS = [2027, 2028, 2029, 2030, 2031]
N = len(YEARS)

# ---- Market ---------------------------------------------------------------------------------------------------------
MFH_SALES_2024 = 34_700          # S GEWOS IMA 2025
COMMERCIAL_SALES_2024 = 38_800   # S GEWOS IMA 2025
VALUATIONS_PER_SALE = 1.5        # A buyer and/or lender (range 1-2)
MEAN_MARKET_FEE = 3_500          # T large firms charge EUR 3-5k for an indicative valuation
BUY_SIDE_SHARE = 0.5             # A share of MFH purchases with a buy-side valuation
EU_INVESTMENT_2025 = 241e9       # S CBRE: European real-estate investment volume 2025
DE_MFH_TURNOVER_2025F = 36.5e9         # S GEWOS 2025 forecast: multi-family turnover
DE_COMMERCIAL_TURNOVER_2025F = 42.7e9  # S GEWOS 2025 forecast: commercial turnover
DE_INCOME_TURNOVER_2025F = DE_MFH_TURNOVER_2025F + DE_COMMERCIAL_TURNOVER_2025F

# ---- Valuation business: valuations per year, price, senior hours per valuation --------------------------------------
SEGMENTS = {
    "Investors (multi-family)": ([100, 450, 1000, 1700, 2400], [1800, 2000, 2000, 2000, 2000], 2.0),
    "Portfolio & fund revaluations": ([0, 100, 300, 700, 1200], [1100] * 5, 1.0),
    "Banks": ([0, 0, 150, 400, 800], [2200] * 5, 6.0),  # 3 h review + 3 h site visit incl. travel (lending values)
    "Commercial & DACH": ([0, 0, 0, 150, 400], [3200] * 5, 3.5),
    # Owners list on the marketplace with a signed value; free to list (customer acquisition), seniors still sign.
    "Owner listings": ([0, 0, 0, 600, 3000], [0] * 5, 2.0),
}
PAID_SEGMENTS = [k for k in SEGMENTS if k != "Owner listings"]
PRICE = SEGMENTS["Investors (multi-family)"][1][-1]  # A list price per signed valuation (beachhead)
REVIEW_HOURS = 1_000             # A review hours per senior per year (of ~1,700 working hours)
MAX_UTILISATION = 0.85           # A plan keeps senior review time at or below 85% of capacity

# Variable cost per signed valuation (paid and free)
AI_COST = 5                      # B ~EUR 0.45 per run from token prices, x10 buffer for retries and re-runs
DATA_COST = 40                   # B official documents: land register EUR 10, building encumbrances EUR 17-29, map
COMPARABLES_FEE = 145            # B extract from the purchase-price register (Berlin EUR 146, NRW EUR 140)
COMPARABLES_SHARE = 0.25         # A share of valuations that need such an extract
HOSTING_COST = 10                # B qualified e-signature (EUR 4-4.50) plus hosting and storage
INSURANCE_PER_VALUATION = 50     # A professional indemnity insurance for the signing seniors, per valuation
SITE_VISIT_COST = {"Banks": 100}  # B travel per site visit (~330 km at EUR 0.30); lending values need an inspection
PAYMENTS_RATE = 0.01             # B invoicing and payment fees (~0.5%) plus bad debt, share of valuation revenue

# ---- Marketplace (from 2030): owners list with a signed value, investors bid, lenders finance --------------------------
DEALS = [0, 0, 0, 300, 1500]     # A deals closed on Censio per year
AVG_TICKET = 1_000_000           # S ~ GEWOS 2024 average income-property deal (EUR 0.95m)
TAKE_RATE = 0.015                # A deal fee; brokers charge ~3-7% on multi-family and commercial deals
DEAL_VARIABLE = 4_000            # B per closed deal: KYC/AML checks, data room, contracts

# ---- Team: year-end and average heads, gross salary per head (constant 2027 euros) -----------------------------------
# Employer social security (2026 rates and ceilings, held constant): the share falls as salaries pass the ceilings.
EMP_PENSION_RATE = 0.093         # S pension insurance, employer share
EMP_UNEMPLOYMENT_RATE = 0.013    # S unemployment insurance, employer share
EMP_INSOLVENCY_RATE = 0.0015     # S insolvency-benefit levy (U3)
CEILING_PENSION = 101_400        # S contribution ceiling for the three above (per year)
EMP_HEALTH_RATE = 0.073          # S health insurance, employer share
EMP_HEALTH_EXTRA = 0.0145        # S half of the average extra health contribution (2.9%)
EMP_CARE_RATE = 0.018            # S long-term care insurance, employer share
CEILING_HEALTH = 69_750          # S contribution ceiling for health and care (per year)
EMP_OTHER_RATE = 0.02            # A U1/U2 levies, statutory accident insurance, small benefits
ATTRITION = 0.10                 # A share of last year's employees replaced each year
ROLES = {
    # name: (year-end heads, average heads, gross salary incl. variable pay, area, cost group)
    "Founders": ([4] * 5, [4] * 5, [50_000, 60_000, 80_000, 100_000, 110_000], "valuation", "opex"),
    "Senior valuers": ([2, 3, 5, 12, 25], [1.5, 2.5, 4.0, 10.0, 21.5], 120_000, "valuation", "cogs"),
    "Platform & AI": ([1, 2, 2, 3, 4], [1.0, 1.5, 2.0, 2.5, 3.5], 95_000, "valuation", "opex"),
    "Sales": ([0, 0, 1, 2, 2], [0, 0, 0.5, 1.5, 2.0], 95_000, "valuation", "opex"),
    "Operations": ([0, 0, 1, 1, 1], [0, 0, 0.5, 1.0, 1.0], 75_000, "valuation", "opex"),
    "Deal team": ([0, 0, 0, 6, 20], [0, 0, 0, 3.0, 14.0], 95_000, "marketplace", "cogs"),
    "Marketplace tech": ([0, 0, 2, 4, 8], [0, 0, 1.0, 3.0, 6.5], 95_000, "marketplace", "opex"),
}
FOUNDERS = 4

# Overhead per head
WORKPLACE_PER_MONTH = 450        # B ~13 m2 at Berlin's average office rent (EUR 27.65/m2) plus service charges
IT_PER_HEAD = 3_000              # B software licences, phone, IT support per average head and year
RECRUITING_PER_HIRE = 10_000     # B ~2x the German average cost per hire: senior hires, some via agencies
EQUIPMENT_PER_HIRE = 2_500       # A laptop and screen per new head (capex)
DEPRECIATION_YEARS = 3           # A equipment written off over 3 years in the accounts

# Other operating costs, thousand EUR per year
NON_STAFF = {
    "AI infrastructure": ([30, 60, 100, 150, 200], "valuation"),
    "Data subscriptions": ([20, 40, 60, 90, 120], "valuation"),
    "Marketing": ([40, 80, 150, 300, 500], "valuation"),
    "Company insurance (D&O, liability)": ([5, 5, 10, 15, 20], "valuation"),
    "Legal, tax & accounting": ([40, 60, 90, 120, 150], "valuation"),
    "DACH expansion": ([0, 0, 0, 300, 600], "valuation"),
    "Marketplace marketing": ([0, 0, 200, 1000, 3000], "marketplace"),
    "Marketplace compliance": ([0, 0, 50, 100, 150], "marketplace"),
}

# ---- Tax and funding ------------------------------------------------------------------------------------------------
CIT_RATE = [0.15, 0.14, 0.13, 0.12, 0.11]   # S corporate income tax, cut by 1 point a year from 2028
SOLI = 0.055                     # S solidarity surcharge on corporate income tax
TRADE_TAX_BASE = 0.035           # S trade tax base rate (Steuermesszahl)
TRADE_TAX_MULTIPLIER = 4.10      # S Berlin trade-tax multiplier (Hebesatz 410%)
TRADE_TAX_RATE = TRADE_TAX_BASE * TRADE_TAX_MULTIPLIER
LOSS_OFFSET_CAP = 1_000_000      # S losses offset in full up to EUR 1m a year ...
LOSS_OFFSET_SHARE_CIT = [0.70, 0.60, 0.60, 0.60, 0.60]  # S ... and this share above it (corporate tax)
LOSS_OFFSET_SHARE_TRADE = 0.60   # S ... and this share above it (trade tax; the 70% uplift does not apply)
ASK = 1_500_000                  # A pre-seed round, paid in 2027
SEED = [0, 0, 0, 0, 0]           # A no further round in the base plan (a 2029 seed would speed up the marketplace)
RECEIVABLE_DAYS = 40             # B German B2B invoices are paid after ~32 days of terms plus ~8 days late
CUSTOMERS_2028 = 25              # A paying customers by the end of 2028
FOUNDER_SPLIT = {"Build": 0.25, "Sell": 0.5, "Run": 0.25}  # A founders' time: AI; business development + sales; CEO

# ---- Classic comparison ---------------------------------------------------------------------------------------------
COURT_RATE = 125                 # S JVEG, EUR per hour
BVS_FEE_1M = 4_360               # S BVS 2026, net fee at 1m
CLASSIC_HOURS_LOW = 20           # A a fast classic income valuation still takes ~20 expert hours


def employer_cost(salary: float) -> float:
    """Gross salary plus employer social security (capped at the contribution ceilings) and other employer costs."""
    pension = min(salary, CEILING_PENSION) * (EMP_PENSION_RATE + EMP_UNEMPLOYMENT_RATE + EMP_INSOLVENCY_RATE)
    health = min(salary, CEILING_HEALTH) * (EMP_HEALTH_RATE + EMP_HEALTH_EXTRA + EMP_CARE_RATE)
    return salary + pension + health + salary * EMP_OTHER_RATE


def loaded(role: str, i: int) -> float:
    """Employer cost of one head of this role in year i."""
    salary = ROLES[role][2]
    return employer_cost(salary[i] if isinstance(salary, list) else salary)


def data_per_valuation() -> float:
    return DATA_COST + COMPARABLES_FEE * COMPARABLES_SHARE


SENIOR_COST = loaded("Senior valuers", 0)


def unit_economics(price: float = PRICE, hours: float = 2.0) -> dict:
    lines = {
        "Senior review (2 h)": hours * SENIOR_COST / REVIEW_HOURS,
        "Data & documents": data_per_valuation(),
        "Hosting & e-signature": HOSTING_COST,
        "AI": AI_COST,
        "Insurance & payments": INSURANCE_PER_VALUATION + PAYMENTS_RATE * price,
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
        # The deal engine: valuation plus a deal fee on every closed transaction.
        "deal_tam_eur": EU_INVESTMENT_2025 * TAKE_RATE,
        "deal_sam_eur": DE_INCOME_TURNOVER_2025F * TAKE_RATE + tam,
        "eu_investment": EU_INVESTMENT_2025,
        "de_income_turnover": DE_INCOME_TURNOVER_2025F,
        "take_rate": TAKE_RATE,
    }


def heads(area: str | None = None, *, avg: bool = False, founders: bool = True) -> list[float]:
    """Heads per year (year end, or average) over the roles of one area."""
    out = [0.0] * N
    for name, (ye, av, _salary, role_area, _group) in ROLES.items():
        if (area and role_area != area) or (not founders and name == "Founders"):
            continue
        for i in range(N):
            out[i] += (av if avg else ye)[i]
    return out


def hires(area: str | None = None, *, founders: bool = True) -> list[float]:
    """New heads per year: growth in year-end heads plus replacements for leavers (founders do not leave)."""
    out = [0.0] * N
    for name, (ye, _av, _salary, role_area, _group) in ROLES.items():
        if (area and role_area != area) or (not founders and name == "Founders"):
            continue
        rate = 0.0 if name == "Founders" else ATTRITION
        for i in range(N):
            before = ye[i - 1] if i else 0
            out[i] += max(0, ye[i] - before) + rate * before
    return out


def cost_lines() -> list[dict]:
    """Every cost line of the P&L with its amounts per year, its group (COGS/Opex), area and use-of-proceeds bucket."""
    lines: list[dict] = []

    def add(name, values, group, area, bucket):
        lines.append({"name": name, "values": [float(v) for v in values], "group": group, "area": area,
                      "bucket": bucket})

    n_val = [sum(v[0][i] for v in SEGMENTS.values()) for i in range(N)]
    val_rev = [sum(v[0][i] * v[1][i] for v in SEGMENTS.values()) for i in range(N)]
    # Cost of sales: valuation business
    add("Senior valuers", [ROLES["Senior valuers"][1][i] * loaded("Senior valuers", i) for i in range(N)],
        "COGS", "valuation", "Deliver")
    add("AI (per valuation)", [n * AI_COST for n in n_val], "COGS", "valuation", "Build")
    add("Data & documents", [n * data_per_valuation() for n in n_val], "COGS", "valuation", "Build")
    add("Hosting & e-signature", [n * HOSTING_COST for n in n_val], "COGS", "valuation", "Build")
    add("Professional indemnity insurance", [n * INSURANCE_PER_VALUATION for n in n_val], "COGS", "valuation",
        "Deliver")
    add("Site visits (travel)", [sum(SEGMENTS[k][0][i] * c for k, c in SITE_VISIT_COST.items()) for i in range(N)],
        "COGS", "valuation", "Deliver")
    add("Payments & bad debt", [r * PAYMENTS_RATE for r in val_rev], "COGS", "valuation", "Sell")
    # Cost of sales: marketplace
    add("Deal team", [ROLES["Deal team"][1][i] * loaded("Deal team", i) for i in range(N)], "COGS", "marketplace",
        "Deliver")
    add("Deal costs (KYC, data room, contracts)", [d * DEAL_VARIABLE for d in DEALS], "COGS", "marketplace", "Deliver")
    # Operating costs: people
    founders = [ROLES["Founders"][1][i] * loaded("Founders", i) for i in range(N)]
    add("Founders", founders, "Opex", "valuation", "Founders")
    for role, bucket in (("Platform & AI", "Build"), ("Sales", "Sell"), ("Operations", "Run")):
        add(role, [ROLES[role][1][i] * loaded(role, i) for i in range(N)], "Opex", "valuation", bucket)
    add("Marketplace tech", [ROLES["Marketplace tech"][1][i] * loaded("Marketplace tech", i) for i in range(N)],
        "Opex", "marketplace", "Build")
    # Operating costs: overhead per head
    for area in ("valuation", "marketplace"):
        suffix = "" if area == "valuation" else " (marketplace)"
        avg = heads(area, avg=True)
        add("Workplace" + suffix, [a * WORKPLACE_PER_MONTH * 12 for a in avg], "Opex", area, "Run")
        add("IT & software" + suffix, [a * IT_PER_HEAD for a in avg], "Opex", area, "Run")
        add("Recruiting" + suffix, [h * RECRUITING_PER_HIRE for h in hires(area, founders=False)], "Opex", area,
            "Run")
    # Operating costs: other
    buckets = {"AI infrastructure": "Build", "Data subscriptions": "Build", "Marketing": "Sell",
               "Legal, tax & accounting": "Run", "Company insurance (D&O, liability)": "Run",
               "DACH expansion": "Sell", "Marketplace marketing": "Sell",
               "Marketplace compliance": "Run"}
    for name, (values, area) in NON_STAFF.items():
        add(name, [v * 1000 for v in values], "Opex", area, buckets[name])
    return lines


def capex() -> list[float]:
    return [h * EQUIPMENT_PER_HIRE for h in hires()]


def depreciation(spend: list[float]) -> list[float]:
    """Straight line over DEPRECIATION_YEARS, starting in the year of purchase."""
    return [sum(spend[j] / DEPRECIATION_YEARS for j in range(N) if 0 <= i - j < DEPRECIATION_YEARS) for i in range(N)]


def offset(ebit: float, carried: float, share: float) -> tuple[float, float]:
    """Loss used this year and the carry-forward after it (minimum taxation: EUR 1m in full, then a share)."""
    if ebit < 0:
        return 0.0, carried - ebit
    used = min(carried, min(ebit, LOSS_OFFSET_CAP) + share * max(0.0, ebit - LOSS_OFFSET_CAP))
    return used, carried - used


def tax_rate(i: int) -> float:
    return CIT_RATE[i] * (1 + SOLI) + TRADE_TAX_BASE * TRADE_TAX_MULTIPLIER


def plan() -> dict:
    lines = cost_lines()
    spend = capex()
    dep = depreciation(spend)
    hc_ye, hc_avg = heads(), heads(avg=True)
    cit_cf, trade_cf, cash, receivables_before = 0.0, 0.0, 0.0, 0.0
    out = {}
    for i, year in enumerate(YEARS):
        n = sum(v[0][i] for v in SEGMENTS.values())
        seg_rev = {k: v[0][i] * v[1][i] for k, v in SEGMENTS.items()}
        val_rev = sum(seg_rev.values())
        mk_rev = DEALS[i] * AVG_TICKET * TAKE_RATE
        revenue = val_rev + mk_rev
        hours = sum(v[0][i] * v[2] for v in SEGMENTS.values())
        senior_avg = ROLES["Senior valuers"][1][i]

        def total(group=None, area=None):
            return sum(line["values"][i] for line in lines
                       if (group is None or line["group"] == group) and (area is None or line["area"] == area))

        cogs, opex = total("COGS"), total("Opex")
        ebitda = revenue - cogs - opex
        val_ebitda = val_rev - total(area="valuation")
        ebit = ebitda - dep[i]
        # Loss carry-forwards with minimum taxation, one pool per tax: EUR 1m in full, above it only a share.
        cit_used, cit_cf = offset(ebit, cit_cf, LOSS_OFFSET_SHARE_CIT[i])
        trade_used, trade_cf = offset(ebit, trade_cf, LOSS_OFFSET_SHARE_TRADE)
        cit_taxable, trade_taxable = max(0.0, ebit - cit_used), max(0.0, ebit - trade_used)
        cit = cit_taxable * CIT_RATE[i] * (1 + SOLI)
        trade = trade_taxable * TRADE_TAX_BASE * TRADE_TAX_MULTIPLIER
        tax = cit + trade
        net_income = ebit - tax
        receivables = revenue * RECEIVABLE_DAYS / 365
        equity_in = (ASK if i == 0 else 0) + SEED[i]
        operating_cf = ebitda - tax - (receivables - receivables_before)
        free_cf = operating_cf - spend[i]
        cash += free_cf + equity_in
        receivables_before = receivables
        out[year] = {
            "valuations": n,
            "paid_valuations": sum(SEGMENTS[k][0][i] for k in PAID_SEGMENTS),
            "deals": DEALS[i],
            "revenue": revenue,
            "valuation_revenue": val_rev,
            "marketplace_revenue": mk_rev,
            "segment_revenue": {**seg_rev, "Marketplace (deal fee)": mk_rev},
            "review_hours": hours,
            "senior_utilisation": hours / (senior_avg * REVIEW_HOURS),
            "cogs": cogs,
            "gross_profit": revenue - cogs,
            "gross_margin": (revenue - cogs) / revenue,
            "opex": opex,
            "valuation_opex": total("Opex", "valuation"),
            "valuation_ebitda": val_ebitda,
            "marketplace_ebitda": ebitda - val_ebitda,
            "ebitda": ebitda,
            "ebitda_margin": ebitda / revenue,
            "depreciation": dep[i],
            "ebit": ebit,
            "cit_loss_used": cit_used,
            "cit_loss_carried_forward": cit_cf,
            "trade_loss_used": trade_used,
            "trade_loss_carried_forward": trade_cf,
            "corporate_tax": cit,
            "trade_tax": trade,
            "tax_rate": tax_rate(i),
            "tax": tax,
            "net_income": net_income,
            "receivables": receivables,
            "operating_cash_flow": operating_cf,
            "capex": spend[i],
            "free_cash_flow": free_cf,
            "equity_in": equity_in,
            "cash_end": cash,
            "headcount_ye": int(round(hc_ye[i])),
            "headcount_avg": hc_avg[i],
            "hires": hires()[i],
            "seniors_ye": ROLES["Senior valuers"][0][i],
            "deal_team_ye": ROLES["Deal team"][0][i],
            "revenue_per_head": revenue / hc_avg[i],
            "valuations_per_senior": n / senior_avg,
            "lines": {line["name"]: line["values"][i] for line in lines},
        }
    return out


def proceeds(p: dict) -> dict:
    """Gross spend 2027-28, grouped by purpose; each founder is counted where their role works."""
    first = (0, 1)
    raw = {"Build": 0.0, "Deliver": 0.0, "Sell": 0.0, "Run": 0.0}
    for line in cost_lines():
        amount = sum(line["values"][i] for i in first)
        if line["bucket"] == "Founders":
            for bucket, share in FOUNDER_SPLIT.items():
                raw[bucket] += amount * share
        else:
            raw[line["bucket"]] += amount
    names = {"Build": "Build: product & AI", "Deliver": "Deliver: senior valuers",
             "Sell": "Sell: sales & partnerships", "Run": "Run: operations, legal & compliance"}
    buckets = {names[k]: v for k, v in raw.items()}
    total = sum(buckets.values())
    gross = sum(p[YEARS[i]]["cogs"] + p[YEARS[i]]["opex"] for i in first)
    net_burn = -sum(p[YEARS[i]]["ebitda"] for i in first)
    working_capital = p[YEARS[1]]["receivables"]
    spend = sum(p[YEARS[i]]["capex"] for i in first)
    g27 = p[YEARS[0]]["cogs"] + p[YEARS[0]]["opex"]
    g28 = p[YEARS[1]]["cogs"] + p[YEARS[1]]["opex"]
    runway_zero_revenue = 12 + (ASK - g27 - p[YEARS[0]]["capex"]) / (g28 / 12)
    valuations = sum(p[YEARS[i]]["valuations"] for i in first)
    return {
        "ask": ASK,
        "gross_spend_2027_28": gross,
        "bucket_total": total,
        "buckets": {name: v / total for name, v in buckets.items()},
        "bucket_eur": buckets,
        "net_burn_2027_28": net_burn,
        "working_capital": working_capital,
        "capex": spend,
        "buffer": ASK - net_burn - working_capital - spend,
        "runway_months_zero_revenue": runway_zero_revenue,
        "valuations_2027_28": valuations,
        "revenue_2028": p[YEARS[1]]["revenue"],
        "customers_2028": CUSTOMERS_2028,
    }


DOWNSIDE_VOLUME = 0.6            # A downside: 40% fewer valuations
DOWNSIDE_PRICE = 0.9             # A downside: 10% lower prices
DOWNSIDE_HOURS = 3.0             # A downside: 3 senior hours on the beachhead segment instead of 2
DOWNSIDE_MIN_SENIORS = 1.5       # A downside: never fewer than 1.5 seniors on average


def downside(p: dict, drop_expansion: bool = False) -> dict:
    """Valuation business only: -40% volume, -10% price, 3 senior hours on the beachhead segment; optionally without
    the DACH expansion. The marketplace is left out: it only starts after a seed round. Seniors are hired to need
    (at most 85% busy, at least 1.5); the other costs stay as planned."""
    lines = cost_lines()
    cum, worst, rows = 0.0, 0.0, {}
    for i, year in enumerate(YEARS):
        n = sum(SEGMENTS[k][0][i] for k in PAID_SEGMENTS) * DOWNSIDE_VOLUME
        rev = sum(SEGMENTS[k][0][i] * SEGMENTS[k][1][i] for k in PAID_SEGMENTS) * DOWNSIDE_VOLUME * DOWNSIDE_PRICE
        hours = sum(SEGMENTS[k][0][i] * (DOWNSIDE_HOURS if k.startswith("Investors") else SEGMENTS[k][2])
                    for k in PAID_SEGMENTS) * DOWNSIDE_VOLUME
        seniors = max(DOWNSIDE_MIN_SENIORS, hours / (REVIEW_HOURS * MAX_UTILISATION))
        cogs = (seniors * loaded("Senior valuers", i)
                + n * (AI_COST + data_per_valuation() + HOSTING_COST + INSURANCE_PER_VALUATION)
                + sum(SEGMENTS[k][0][i] * c for k, c in SITE_VISIT_COST.items()) * DOWNSIDE_VOLUME
                + rev * PAYMENTS_RATE)
        opex = sum(line["values"][i] for line in lines if line["group"] == "Opex" and line["area"] == "valuation")
        if drop_expansion:
            opex -= NON_STAFF["DACH expansion"][0][i] * 1000
        ebitda = rev - cogs - opex
        cum += ebitda
        worst = min(worst, cum)
        rows[year] = {"revenue": rev, "ebitda": ebitda, "seniors": seniors}
    cum_by_year, running = {}, 0.0
    for year in YEARS:
        running += rows[year]["ebitda"]
        cum_by_year[year] = running
    breakeven = next((y for y in YEARS if rows[y]["ebitda"] > 0), None)
    usable = ASK - sum(p[YEARS[i]]["capex"] for i in (0, 1)) - p[YEARS[1]]["receivables"]
    out_of_cash = next((y for y in YEARS if cum_by_year[y] < -usable), None)
    result = {"years": rows, "cum": cum_by_year, "ebitda_2031": rows[YEARS[-1]]["ebitda"], "cum_min": worst,
              "breakeven_year": breakeven, "usable_cash": usable, "out_of_cash_year": out_of_cash,
              "extra_cash_needed": max(0.0, -worst - usable)}
    if not drop_expansion:
        result["without_expansion"] = downside(p, drop_expansion=True)
    return result


def team(p: dict) -> dict:
    last = p[YEARS[-1]]
    classic_hours_per_report = BVS_FEE_1M / COURT_RATE           # ~35 h
    classic_reports_low = REVIEW_HOURS / classic_hours_per_report  # ~29 a year
    classic_reports_high = REVIEW_HOURS / CLASSIC_HOURS_LOW        # 50 a year at 20 h
    ye = {name: role[0][-1] for name, role in ROLES.items()}
    return {
        "people_2031": last["headcount_ye"],
        "seniors_2031": last["seniors_ye"],
        "valuations_2031": last["valuations"],
        "deals_2031": last["deals"],
        "platform_2031": ye["Platform & AI"] + ye["Marketplace tech"],
        "sales_ops_2031": ye["Sales"] + ye["Operations"],
        "founders": FOUNDERS,
        "listings_2031": SEGMENTS["Owner listings"][0][-1],
        "deal_team_2031": last["deal_team_ye"],
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
        "inputs": {  # quoted on the backup slide
            "senior_salary": ROLES["Senior valuers"][2], "senior_cost": SENIOR_COST,
            "review_hours": REVIEW_HOURS, "ai_cost": AI_COST, "data_cost": data_per_valuation(),
            "hosting_cost": HOSTING_COST,
            "insurance": INSURANCE_PER_VALUATION, "take_rate": TAKE_RATE, "avg_ticket": AVG_TICKET,
            "workplace": WORKPLACE_PER_MONTH, "it": IT_PER_HEAD, "recruiting": RECRUITING_PER_HIRE,
            "tax_first": tax_rate(0), "tax_last": tax_rate(N - 1), "receivable_days": RECEIVABLE_DAYS,
        },
    }


if __name__ == "__main__":
    numbers = build_numbers()
    path = Path(__file__).with_name("numbers.json")
    path.write_text(json.dumps(numbers, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {path}")
    for year, r in numbers["plan"].items():
        print(f"{year}: {r['valuations']:>5} valuations · revenue €{r['revenue'] / 1e6:5.2f}m · "
              f"EBITDA €{r['ebitda'] / 1e6:+5.2f}m ({r['ebitda_margin']:+.0%}) · net €{r['net_income'] / 1e6:+5.2f}m · "
              f"cash €{r['cash_end'] / 1e6:5.2f}m · {r['headcount_ye']} people")
    print({k: f"{v:.1%}" for k, v in numbers["proceeds"]["buckets"].items()})
    d = numbers["downside"]
    print(f"downside: out of cash {d['out_of_cash_year']}, extra €{d['extra_cash_needed'] / 1e6:.2f}m, "
          f"without DACH €{d['without_expansion']['extra_cash_needed'] / 1e6:.2f}m")
