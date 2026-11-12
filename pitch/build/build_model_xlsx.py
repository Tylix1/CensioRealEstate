"""Builds the Excel financial model, pitch/out/Censio-Financial-Model.xlsx, from the inputs in model.py.

Every input is written once, on the Assumptions sheet (blue), with its kind and source. Every other number is a live
Excel formula, so the workbook recalculates when an input changes. test_model_xlsx.py recalculates the file with
LibreOffice and checks it against model.py, line by line.

    python3 model.py && python3 build_model_xlsx.py
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.series import SeriesLabel
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

import content as C
import model as M
from model_sources import DOC, PEERS, SOURCES

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "out" / "Censio-Financial-Model.xlsx"
YC = ["C", "D", "E", "F", "G"]          # 2027 ... 2031
VERSION = "v1.1"

# ---- Style -------------------------------------------------------------------------------------------------------------
FONT = "Arial"
BLUE, BLACK, GREEN = "0000FF", "000000", "008000"
BRAND, BRAND_WEAK, INK2, LINE = "0B5D4B", "E6F2EE", "475467", "D0D5DD"
EUR = '#,##0;(#,##0);"-"'
NUM = '#,##0;(#,##0);"-"'
DEC1 = '#,##0.0;(#,##0.0);"-"'
PCT = '0.0%;(0.0%);"-"'
LEVER = '0.00"×"'
FMT_BY_UNIT = {"€": EUR, "€/yr": EUR, "€/month": EUR, "€ per valuation": EUR, "€ per deal": EUR, "€ per hire": EUR,
               "€ per head": EUR, "€/h": EUR, "%": PCT, "×": LEVER, "heads": DEC1, "years": NUM, "days": NUM,
               "h": NUM, "h per valuation": DEC1, "valuations": NUM, "deals": NUM, "sales": NUM, "customers": NUM,
               "months": DEC1, "hires": DEC1, "h/yr": NUM, "per senior": NUM, "valuers": NUM, "reports": DEC1,
               "share": PCT, "£": EUR, "$": EUR, "year": "0"}
# A pure link: one cell on another sheet (green). Anything with an operator or function is a calculation (black).
LINK_RE = re.compile(r"^=(?:'[^']+'|[A-Za-z][A-Za-z0-9_]*)!\$?[A-Z]+\$?\d+$")
THIN = Side(style="thin", color=LINE)


def font(color=BLACK, bold=False, size=10, italic=False):
    return Font(name=FONT, color=color, bold=bold, size=size, italic=italic)


class Book:
    def __init__(self):
        self.wb = Workbook()
        self.wb.remove(self.wb.active)
        self.rows: dict[tuple[str, str], int] = {}

    def sheet(self, title: str, subtitle: str, *, years: bool = True, extra: list[tuple[str, int]] | None = None):
        return Sheet(self, title, subtitle, years=years, extra=extra or [("Notes", 70)])


class Sheet:
    """A sheet with label (A), unit (B), five year columns (C-G) and notes columns (H...)."""

    def __init__(self, book: Book, title: str, subtitle: str, *, years: bool, extra: list[tuple[str, int]]):
        self.book, self.title = book, title
        self.ws = book.wb.create_sheet(title)
        ws = self.ws
        ws.sheet_view.showGridLines = False
        ws.column_dimensions["A"].width = 60
        ws.column_dimensions["B"].width = 15
        for c in YC:
            ws.column_dimensions[c].width = 15
        self.extra_cols = []
        for k, (name, width) in enumerate(extra):
            col = get_column_letter(8 + k)
            ws.column_dimensions[col].width = width
            self.extra_cols.append((col, name))
        ws["A1"] = title
        ws["A1"].font = font(BRAND, True, 16)
        ws["A2"] = subtitle
        ws["A2"].font = font(INK2, italic=True)
        self.r = 4
        if years:
            self.header()

    def header(self, labels=None):
        ws = self.ws
        labels = labels or ["", "Unit", *[str(y) for y in M.YEARS], *[n for _, n in self.extra_cols]]
        for k, text in enumerate(labels):
            cell = ws.cell(row=self.r, column=k + 1, value=text)
            cell.font = font("FFFFFF", True)
            cell.fill = PatternFill("solid", fgColor=BRAND)
            cell.alignment = Alignment(horizontal="left" if k in (0, 1) or k > 6 else "right", vertical="center",
                                       indent=2 if k > 6 else 0)
        ws.freeze_panes = ws.cell(row=self.r + 1, column=3)
        self.r += 1

    def section(self, text: str):
        self.r += 1
        ws = self.ws
        for k in range(1, 8 + len(self.extra_cols)):
            ws.cell(row=self.r, column=k).fill = PatternFill("solid", fgColor=BRAND_WEAK)
        ws.cell(row=self.r, column=1, value=text).font = font(BRAND, True)
        self.r += 1

    def note(self, text: str, color=INK2, bold=False):
        cell = self.ws.cell(row=self.r, column=1, value=text)
        cell.font = font(color, bold)
        self.r += 1

    def row(self, key: str | None, label: str, unit: str, cells, *, fmt: str | None = None, notes=(),
            bold=False, top_line=False, lever=False):
        """cells: a list of up to five values/formulas (C-G) or one scalar (C)."""
        ws, r = self.ws, self.r
        if key:
            assert (self.title, key) not in self.book.rows, f"duplicate key {self.title}:{key}"
            self.book.rows[(self.title, key)] = r
        ws.cell(row=r, column=1, value=label).font = font(bold=bold)
        ws.cell(row=r, column=2, value=unit).font = font(INK2)
        fmt = fmt or FMT_BY_UNIT.get(unit, NUM)
        values = cells if isinstance(cells, list) else [cells]
        for c, v in zip(YC, values):
            cell = ws[f"{c}{r}"]
            cell.value = v
            if isinstance(v, str) and v.startswith("="):
                cell.font = font(GREEN if LINK_RE.match(v) else BLACK, bold)
            elif isinstance(v, str):
                cell.font = font(INK2, bold)
            else:
                cell.font = font(BLUE, bold)
            cell.number_format = fmt
            cell.alignment = Alignment(horizontal="right")
            if lever:
                cell.fill = PatternFill("solid", fgColor="FFFF00")
            if top_line:
                cell.border = Border(top=THIN)
        if top_line:
            ws.cell(row=r, column=1).border = Border(top=THIN)
            ws.cell(row=r, column=2).border = Border(top=THIN)
        for (col, _name), text in zip(self.extra_cols, notes):
            ws[f"{col}{r}"] = text
            ws[f"{col}{r}"].font = font(INK2)
            ws[f"{col}{r}"].alignment = Alignment(indent=2)
        self.r += 1
        return r

    def blank(self, n=1):
        self.r += n


BOOK = Book()


def quoted(sheet: str) -> str:
    return f"'{sheet}'" if re.search(r"[^A-Za-z0-9_]", sheet) else sheet


def ref(sheet: str, key: str, col: str | None = None, *, here: str | None = None) -> str:
    """Cell reference: a year column (relative) or the scalar in column C (absolute)."""
    r = BOOK.rows[(sheet, key)]
    cell = f"{col}{r}" if col else f"$C${r}"
    return cell if sheet == here else f"{quoted(sheet)}!{cell}"


def rng(sheet: str, key: str, *, here: str | None = None, cols=("C", "G")) -> str:
    r = BOOK.rows[(sheet, key)]
    cells = f"${cols[0]}${r}:${cols[1]}${r}"
    return cells if sheet == here else f"{quoted(sheet)}!{cells}"


def yearly(fn):
    return [fn(c, i) for i, c in enumerate(YC)]


def prev(c: str) -> str:
    return YC[YC.index(c) - 1]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


A = "Assumptions"


def a(key: str, col: str | None = None, here: str | None = None) -> str:
    return ref(A, key, col, here=here)


# ---- Assumptions -------------------------------------------------------------------------------------------------------
def input_row(s: Sheet, name: str, value, *, key: str | None = None, label: str | None = None, lever=False):
    """One input with its documentation from DOC (label, unit, kind, sources, note)."""
    doc = DOC[name]
    cells = [float(v) for v in value] if isinstance(value, list) else value
    return s.row(key or name, label or doc["label"], doc["unit"], cells, lever=lever,
                 notes=[doc["kind"], ", ".join(doc.get("sources", [])), doc.get("note", "")])


def build_assumptions():
    s = BOOK.sheet("Assumptions", "Every input of the model, entered once. Blue = input; yellow = scenario lever. "
                   "Kind: S sourced · B benchmark · T team experience · A plan assumption (see Sources).",
                   extra=[("Kind", 7), ("Source", 22), ("Why this value", 110)])
    s.section("Scenario levers (1.00× = base plan; the deck shows the base plan)")
    for name in ("LEVER_VOLUME", "LEVER_PRICE", "LEVER_HOURS", "LEVER_DEALS"):
        input_row(s, name, 1.0, lever=True)

    s.section("Valuation business: signed valuations per year")
    for seg, (vol, _price, _hours) in M.SEGMENTS.items():
        input_row(s, f"VOL:{seg}", vol, key=f"vol_{slug(seg)}", label=seg)
    s.section("Valuation business: price per valuation (net of VAT)")
    for seg, (_vol, price, _hours) in M.SEGMENTS.items():
        input_row(s, f"PRICE:{seg}", price, key=f"price_{slug(seg)}", label=seg)
    s.section("Valuation business: senior hours per signed valuation")
    for seg, (_vol, _price, hours) in M.SEGMENTS.items():
        input_row(s, f"HOURS:{seg}", hours, key=f"hours_{slug(seg)}", label=seg)
    input_row(s, "REVIEW_HOURS", M.REVIEW_HOURS)
    input_row(s, "MAX_UTILISATION", M.MAX_UTILISATION)

    s.section("Valuation business: variable cost per signed valuation")
    for name in ("AI_COST", "DATA_COST", "COMPARABLES_FEE", "COMPARABLES_SHARE", "HOSTING_COST",
                 "INSURANCE_PER_VALUATION"):
        input_row(s, name, getattr(M, name))
    for seg, cost in M.SITE_VISIT_COST.items():
        input_row(s, f"SITE_VISIT:{seg}", cost, key=f"site_{slug(seg)}")
    input_row(s, "PAYMENTS_RATE", M.PAYMENTS_RATE)
    input_row(s, "BAD_DEBT_RATE", M.BAD_DEBT_RATE)

    s.section("Marketplace (opens 2030)")
    input_row(s, "DEALS", M.DEALS)
    for name in ("AVG_TICKET", "TAKE_RATE", "DEAL_VARIABLE", "DEALS_PER_MANAGER"):
        input_row(s, name, getattr(M, name))

    s.section("Employer social security (2026 rates and ceilings, held constant)")
    for name in ("EMP_PENSION_RATE", "EMP_UNEMPLOYMENT_RATE", "EMP_INSOLVENCY_RATE", "CEILING_PENSION",
                 "EMP_HEALTH_RATE", "EMP_HEALTH_EXTRA", "EMP_CARE_RATE", "CEILING_HEALTH", "EMP_OTHER_RATE"):
        input_row(s, name, getattr(M, name))

    s.section("Team: planned heads and gross salaries (constant 2027 euros)")
    input_row(s, "ATTRITION", M.ATTRITION)
    for role, (ye, avg, salary, _area, _group) in M.ROLES.items():
        input_row(s, f"YE:{role}", ye, key=f"ye_{slug(role)}", label=f"{role}: heads at year end")
        input_row(s, f"AVG:{role}", avg, key=f"avg_{slug(role)}", label=f"{role}: average heads")
        input_row(s, f"SALARY:{role}", salary, key=f"salary_{slug(role)}", label=f"{role}: gross salary per head")

    s.section("Overhead per head")
    for name in ("WORKPLACE_PER_MONTH", "IT_PER_HEAD", "RECRUITING_PER_HIRE", "SENIOR_SEARCH_FEE",
                 "EQUIPMENT_PER_HIRE", "DEPRECIATION_YEARS"):
        input_row(s, name, getattr(M, name))

    s.section("Other operating costs (€ per year)")
    for name, (values, _area) in M.NON_STAFF.items():
        input_row(s, f"NS:{name}", [v * 1000 for v in values], key=f"ns_{slug(name)}", label=name)

    s.section("Tax (German GmbH in Berlin)")
    input_row(s, "CIT_RATE", M.CIT_RATE)
    for name in ("SOLI", "TRADE_TAX_BASE", "TRADE_TAX_MULTIPLIER", "LOSS_OFFSET_CAP"):
        input_row(s, name, getattr(M, name))
    input_row(s, "LOSS_OFFSET_SHARE_CIT", M.LOSS_OFFSET_SHARE_CIT)
    input_row(s, "LOSS_OFFSET_SHARE_TRADE", M.LOSS_OFFSET_SHARE_TRADE)

    s.section("Funding and working capital")
    input_row(s, "ASK", M.ASK)
    input_row(s, "SEED", M.SEED)
    for name in ("RECEIVABLE_DAYS", "MIN_CASH_MONTHS", "CUSTOMERS_2028"):
        input_row(s, name, getattr(M, name))
    for bucket, share in M.FOUNDER_SPLIT.items():
        input_row(s, f"FOUNDER_SPLIT:{bucket}", share, key=f"founder_split_{slug(bucket)}")

    s.section("Market")
    for name in ("MFH_SALES_2024", "COMMERCIAL_SALES_2024", "VALUATIONS_PER_SALE", "MEAN_MARKET_FEE",
                 "BUY_SIDE_SHARE", "EU_INVESTMENT_2025", "DE_MFH_TURNOVER_2025F", "DE_COMMERCIAL_TURNOVER_2025F"):
        input_row(s, name, getattr(M, name))

    s.section("Downside case (valuation business only) and marketplace sensitivity")
    for name in ("DOWNSIDE_VOLUME", "DOWNSIDE_PRICE", "DOWNSIDE_HOURS", "DOWNSIDE_MIN_SENIORS", "DACH_SHARE"):
        input_row(s, name, getattr(M, name))
    input_row(s, "SENS_DEALS", M.SENS_DEALS)
    input_row(s, "SENS_FEES", M.SENS_FEES)

    s.section("Classic valuation, for comparison")
    for name in ("COURT_RATE", "BVS_FEE_1M", "CLASSIC_HOURS_LOW"):
        input_row(s, name, getattr(M, name))

    s.section("Peer benchmarks (for the Peer check sheet only; not used in the plan)")
    for name, value, _unit, _sid, _note in PEERS:
        input_row(s, name, value, key="peer_" + slug(name.split(":", 1)[1]))
    s.ws.freeze_panes = "C5"


def employer_cost_formula(salary: str) -> str:
    """Salary + social security capped at the contribution ceilings + other employer costs (as model.employer_cost)."""
    pension = f"({a('EMP_PENSION_RATE')}+{a('EMP_UNEMPLOYMENT_RATE')}+{a('EMP_INSOLVENCY_RATE')})"
    health = f"({a('EMP_HEALTH_RATE')}+{a('EMP_HEALTH_EXTRA')}+{a('EMP_CARE_RATE')})"
    return (f"={salary}+MIN({salary},{a('CEILING_PENSION')})*{pension}+MIN({salary},{a('CEILING_HEALTH')})*{health}"
            f"+{salary}*{a('EMP_OTHER_RATE')}")


def per_valuation_cost() -> str:
    """AI + documents + share of register extracts + e-signature + insurance, per signed valuation."""
    return (f"({a('AI_COST')}+{a('DATA_COST')}+{a('COMPARABLES_FEE')}*{a('COMPARABLES_SHARE')}"
            f"+{a('HOSTING_COST')}+{a('INSURANCE_PER_VALUATION')})")


# ---- Revenue -----------------------------------------------------------------------------------------------------------
def build_revenue():
    s = BOOK.sheet("Revenue", "Volumes × prices, senior hours, and the marketplace deal fee.")
    t = s.title
    R = lambda key, c: f"{c}{BOOK.rows[(t, key)]}"  # noqa: E731
    segs = list(M.SEGMENTS)
    s.section("Signed valuations")
    for seg in segs:
        k = slug(seg)
        s.row(f"n_{k}", seg, "valuations", yearly(lambda c, i, k=k: f"={a(f'vol_{k}', c)}*{a('LEVER_VOLUME')}"))
    first, last = BOOK.rows[(t, f"n_{slug(segs[0])}")], BOOK.rows[(t, f"n_{slug(segs[-1])}")]
    s.row("n_total", "All signed valuations", "valuations", yearly(lambda c, i: f"=SUM({c}{first}:{c}{last})"),
          bold=True, top_line=True)
    s.row("n_paid", "Paid valuations (owner listings are free)", "valuations",
          yearly(lambda c, i: "=" + "+".join(R(f"n_{slug(seg)}", c) for seg in M.PAID_SEGMENTS)))

    s.section("Price per valuation")
    for seg in segs:
        k = slug(seg)
        s.row(f"p_{k}", seg, "€ per valuation", yearly(lambda c, i, k=k: f"={a(f'price_{k}', c)}*{a('LEVER_PRICE')}"))

    s.section("Valuation revenue")
    for seg in segs:
        k = slug(seg)
        s.row(f"rev_{k}", seg, "€", yearly(lambda c, i, k=k: f"={R(f'n_{k}', c)}*{R(f'p_{k}', c)}"))
    first, last = BOOK.rows[(t, f"rev_{slug(segs[0])}")], BOOK.rows[(t, f"rev_{slug(segs[-1])}")]
    s.row("rev_val", "Valuation revenue", "€", yearly(lambda c, i: f"=SUM({c}{first}:{c}{last})"), bold=True,
          top_line=True)

    s.section("Senior review hours")
    for seg in segs:
        k = slug(seg)
        s.row(f"h_{k}", f"{seg}: hours per valuation", "h per valuation",
              yearly(lambda c, i, k=k: f"={a(f'hours_{k}')}*{a('LEVER_HOURS')}"))
    s.row("hours_paid", "Review hours: paid valuations", "h", yearly(lambda c, i: "=" + "+".join(
        f"{R('n_' + slug(seg), c)}*{R('h_' + slug(seg), c)}" for seg in M.PAID_SEGMENTS)))
    s.row("hours_list", "Review hours: free owner-listing valuations", "h",
          yearly(lambda c, i: f"={R('n_owner_listings', c)}*{R('h_owner_listings', c)}"))
    s.row("hours", "Senior review hours needed", "h",
          yearly(lambda c, i: f"={R('hours_paid', c)}+{R('hours_list', c)}"), bold=True, top_line=True,
          notes=["Team sheet sizes the senior valuers to these hours"])

    s.section("Marketplace (deal fee on closed deals)")
    s.row("deals", "Deals closed on Censio", "deals", yearly(lambda c, i: f"={a('DEALS', c)}*{a('LEVER_DEALS')}"))
    s.row("ticket", "Average deal size", "€", yearly(lambda c, i: f"={a('AVG_TICKET')}"))
    s.row("gtv", "Transaction volume on Censio", "€", yearly(lambda c, i: f"={R('deals', c)}*{R('ticket', c)}"))
    s.row("take", "Deal fee", "%", yearly(lambda c, i: f"={a('TAKE_RATE')}"))
    s.row("rev_mkt", "Marketplace revenue (deal fees)", "€",
          yearly(lambda c, i: f"={R('gtv', c)}*{R('take', c)}"), bold=True)

    s.section("Total")
    s.row("rev_total", "Total revenue", "€", yearly(lambda c, i: f"={R('rev_val', c)}+{R('rev_mkt', c)}"), bold=True,
          top_line=True)
    s.row("growth", "Growth on prior year", "%", ["", *[
        f"=IF({R('rev_total', prev(c))}=0,0,{R('rev_total', c)}/{R('rev_total', prev(c))}-1)" for c in YC[1:]]])
    s.row("deal_share", "Share of revenue from deal fees", "%", yearly(
        lambda c, i: f"=IF({R('rev_total', c)}=0,0,{R('rev_mkt', c)}/{R('rev_total', c)})"))


# ---- Team --------------------------------------------------------------------------------------------------------------
SIZED = {"Senior valuers": ("Needed for the review hours (at the utilisation cap)",
                            lambda c: f"={ref('Revenue', 'hours', c)}/({a('REVIEW_HOURS')}*{a('MAX_UTILISATION')})"),
         "Deal team": ("Needed for the deals (at the deals-per-manager capacity)",
                       lambda c: f"={ref('Revenue', 'deals', c)}/{a('DEALS_PER_MANAGER')}")}


def build_team():
    s = BOOK.sheet("Team", "Heads (sized to the volume where it needs more than the plan), staff cost, hires, "
                           "overhead per head and equipment.")
    t = s.title
    R = lambda key, c: f"{c}{BOOK.rows[(t, key)]}"  # noqa: E731
    for role, (_ye, _avg, salary, area, group) in M.ROLES.items():
        k = slug(role)
        s.section(f"{role} ({area}, {'cost of sales' if group == 'cogs' else 'operating cost'})")
        if role in SIZED:
            label, formula = SIZED[role]
            s.row(f"needed_{k}", label, "heads", yearly(lambda c, i, f=formula: f(c)))
            s.row(f"avg_{k}", "Average heads (plan, or more if the volume needs it)", "heads", yearly(
                lambda c, i, k=k: f"=MAX({a(f'avg_{k}', c)},{R(f'needed_{k}', c)})"))
            s.row(f"ye_{k}", "Heads at year end (scaled with the average)", "heads", yearly(
                lambda c, i, k=k: f"=IF({a(f'avg_{k}', c)}=0,IF({R(f'avg_{k}', c)}>0,{R(f'avg_{k}', c)},"
                                  f"{a(f'ye_{k}', c)}),{a(f'ye_{k}', c)}*{R(f'avg_{k}', c)}/{a(f'avg_{k}', c)})"))
        else:
            s.row(f"avg_{k}", "Average heads", "heads", yearly(lambda c, i, k=k: f"={a(f'avg_{k}', c)}"))
            s.row(f"ye_{k}", "Heads at year end", "heads", yearly(lambda c, i, k=k: f"={a(f'ye_{k}', c)}"))
        per_year = isinstance(salary, list)
        s.row(f"salary_{k}", "Gross salary per head", "€/yr",
              yearly(lambda c, i, k=k, py=per_year: f"={a(f'salary_{k}', c if py else None)}"))
        s.row(f"loaded_{k}", "Employer cost per head (salary + social security + other)", "€/yr",
              yearly(lambda c, i, k=k: employer_cost_formula(R(f"salary_{k}", c))),
              notes=["Social security up to the contribution ceilings (Assumptions)"])
        s.row(f"cost_{k}", "Staff cost", "€", yearly(lambda c, i, k=k: f"={R(f'avg_{k}', c)}*{R(f'loaded_{k}', c)}"),
              bold=True)
        attrition = "0" if role == "Founders" else a("ATTRITION")
        s.row(f"hires_{k}", "Hires (growth + replacements)", "hires",
              [f"=MAX(0,{R(f'ye_{k}', 'C')})", *[f"=MAX(0,{R(f'ye_{k}', c)}-{R(f'ye_{k}', prev(c))})+{attrition}*"
                                                f"{R(f'ye_{k}', prev(c))}" for c in YC[1:]]],
              notes=["2027: the starting team; later years: growth plus leavers replaced (attrition × last year-end)"])

    s.section("Senior capacity")
    s.row("capacity", "Senior review capacity", "h",
          yearly(lambda c, i: f"={R('avg_senior_valuers', c)}*{a('REVIEW_HOURS')}"))
    s.row("util", "Senior utilisation", "%", yearly(
        lambda c, i: f"=IF({R('capacity', c)}=0,0,{ref('Revenue', 'hours', c)}/{R('capacity', c)})"),
          notes=["At most the cap on Assumptions: seniors are added when the hours need them"])
    s.row("per_senior", "Signed valuations per senior (average heads)", "per senior", yearly(
        lambda c, i: f"=IF({R('avg_senior_valuers', c)}=0,0,{ref('Revenue', 'n_total', c)}/{R('avg_senior_valuers', c)})"))

    roles = list(M.ROLES)
    keys = [slug(r) for r in roles]
    by_area = {area: [slug(r) for r in roles if M.ROLES[r][3] == area] for area in ("valuation", "marketplace")}

    def total(prefix, ks, c):
        return "=" + "+".join(R(f"{prefix}_{k}", c) for k in ks)

    s.section("Totals")
    s.row("ye_total", "Heads at year end", "heads", yearly(lambda c, i: total("ye", keys, c)), bold=True, fmt=NUM)
    s.row("avg_total", "Average heads", "heads", yearly(lambda c, i: total("avg", keys, c)))
    s.row("experts", "Senior experts at year end (valuers + deal team)", "heads", yearly(
        lambda c, i: f"={R('ye_senior_valuers', c)}+{R('ye_deal_team', c)}"), fmt=NUM)
    s.row("staff_total", "Staff cost", "€", yearly(lambda c, i: total("cost", keys, c)), bold=True)
    for area, ks in by_area.items():
        s.row(f"avg_{area}", f"Average heads: {area}", "heads", yearly(lambda c, i, ks=ks: total("avg", ks, c)))
        s.row(f"hires_{area}", f"Hires: {area} (founders excluded)", "hires",
              yearly(lambda c, i, ks=ks: total("hires", [k for k in ks if k != "founders"], c)))
    s.row("hires_all", "Hires incl. founders (for equipment)", "hires", yearly(lambda c, i: total("hires", keys, c)))
    s.row("hires_valuation_all", "Hires incl. founders: valuation business", "hires",
          yearly(lambda c, i: total("hires", by_area["valuation"], c)))

    s.section("Overhead per head")
    for area in by_area:
        sfx = "" if area == "valuation" else "_mkt"
        s.row(f"workplace{sfx}", f"Workplace ({area})", "€", yearly(
            lambda c, i, area=area: f"={R(f'avg_{area}', c)}*{a('WORKPLACE_PER_MONTH')}*12"))
        s.row(f"it{sfx}", f"IT & software ({area})", "€", yearly(
            lambda c, i, area=area: f"={R(f'avg_{area}', c)}*{a('IT_PER_HEAD')}"))
        if area == "valuation":
            s.row("recruiting", "Recruiting (valuation): headhunter fees for seniors, flat cost for others", "€",
                  yearly(lambda c, i: f"=({R('hires_valuation', c)}-{R('hires_senior_valuers', c)})*"
                                      f"{a('RECRUITING_PER_HIRE')}+{R('hires_senior_valuers', c)}*"
                                      f"{R('salary_senior_valuers', c)}*{a('SENIOR_SEARCH_FEE')}"))
        else:
            s.row("recruiting_mkt", "Recruiting (marketplace)", "€", yearly(
                lambda c, i: f"={R('hires_marketplace', c)}*{a('RECRUITING_PER_HIRE')}"))

    s.section("Equipment: a laptop and screen per new head, replaced once written off")
    s.row("year_index", "Year number", "", yearly(lambda c, i: "=COLUMN()-2"), fmt=NUM)
    for sfx, hires_key, label in (("", "hires_all", "all"), ("_val", "hires_valuation_all", "valuation business")):
        s.row(f"equip_new{sfx}", f"New equipment ({label})", "€",
              yearly(lambda c, i, h=hires_key: f"={R(h, c)}*{a('EQUIPMENT_PER_HIRE')}"))
        new = BOOK.rows[(t, f"equip_new{sfx}")]
        s.row(f"equip_replace{sfx}", f"Replacement equipment ({label})", "€", yearly(
            lambda c, i, new=new: f"=IF({R('year_index', c)}>{a('DEPRECIATION_YEARS')},INDEX($C${new}:$G${new},1,"
                                  f"{R('year_index', c)}-{a('DEPRECIATION_YEARS')}),0)"))
        s.row(f"capex{sfx}", f"Equipment bought ({label})", "€", yearly(
            lambda c, i, sfx=sfx: f"={R(f'equip_new{sfx}', c)}+{R(f'equip_replace{sfx}', c)}"), bold=not sfx)
    yi, cx = BOOK.rows[(t, "year_index")], BOOK.rows[(t, "capex")]
    s.row("depreciation", "Depreciation", "€", yearly(
        lambda c, i: f"=SUMPRODUCT(($C${yi}:$G${yi}<={c}{yi})*($C${yi}:$G${yi}>{c}{yi}-{a('DEPRECIATION_YEARS')})"
                     f"*$C${cx}:$G${cx})/{a('DEPRECIATION_YEARS')}"),
          notes=["Straight line over the years on Assumptions, from the year of purchase"])


# ---- P&L ---------------------------------------------------------------------------------------------------------------
def line_formula(name: str, c: str) -> str:
    rv = lambda key: ref("Revenue", key, c)  # noqa: E731
    tm = lambda key: ref("Team", key, c)  # noqa: E731
    fixed = {
        "Senior valuers": f"={tm('cost_senior_valuers')}*IF({rv('hours')}=0,1,{rv('hours_paid')}/{rv('hours')})",
        "AI (per valuation)": f"={rv('n_paid')}*{a('AI_COST')}",
        "Data & documents": f"={rv('n_paid')}*({a('DATA_COST')}+{a('COMPARABLES_FEE')}*{a('COMPARABLES_SHARE')})",
        "Hosting & e-signature": f"={rv('n_paid')}*{a('HOSTING_COST')}",
        "Professional indemnity insurance": f"={rv('n_paid')}*{a('INSURANCE_PER_VALUATION')}",
        "Site visits (travel)": "=" + "+".join(f"{rv('n_' + slug(seg))}*{a('site_' + slug(seg))}"
                                               for seg in M.SITE_VISIT_COST),
        "Payments & bad debt": f"={rv('rev_val')}*({a('PAYMENTS_RATE')}+{a('BAD_DEBT_RATE')})",
        "Owner-listing valuations (free)": f"={tm('cost_senior_valuers')}*IF({rv('hours')}=0,0,{rv('hours_list')}/"
                                           f"{rv('hours')})+{rv('n_owner_listings')}*{per_valuation_cost()}",
        "Deal costs (KYC, data room, contracts)": f"={rv('deals')}*{a('DEAL_VARIABLE')}",
        "Bad debt on deal fees": f"={rv('rev_mkt')}*{a('BAD_DEBT_RATE')}",
        "Workplace": f"={tm('workplace')}", "IT & software": f"={tm('it')}", "Recruiting": f"={tm('recruiting')}",
        "Workplace (marketplace)": f"={tm('workplace_mkt')}", "IT & software (marketplace)": f"={tm('it_mkt')}",
        "Recruiting (marketplace)": f"={tm('recruiting_mkt')}",
    }
    if name in fixed:
        return fixed[name]
    if name in M.ROLES:
        return f"={tm('cost_' + slug(name))}"
    if name in M.NON_STAFF:
        return f"={a('ns_' + slug(name), c)}"
    raise KeyError(name)


DRIVERS = {
    "Senior valuers": "Team staff cost × share of review hours on paid valuations",
    "AI (per valuation)": "paid valuations × AI cost", "Data & documents": "paid valuations × (documents + share × "
    "register extract)", "Hosting & e-signature": "paid valuations × cost",
    "Professional indemnity insurance": "paid valuations × insurance per valuation",
    "Site visits (travel)": "bank valuations × travel per site visit",
    "Payments & bad debt": "valuation revenue × (payment fees + bad debt)",
    "Owner-listing valuations (free)": "senior time on listings + listings × cost per valuation (how the "
                                       "marketplace wins listings)",
    "Deal team": "Team staff cost", "Deal costs (KYC, data room, contracts)": "deals × cost per deal",
    "Bad debt on deal fees": "deal fees × bad debt",
}


def build_pnl():
    s = BOOK.sheet("P&L", "Profit and loss, 2027–2031. Area and bucket tags feed the segment view and Use of funds.",
                   extra=[("Area", 14), ("Use-of-funds bucket", 22), ("Driver", 70)])
    t = s.title
    R = lambda key, c: f"{c}{BOOK.rows[(t, key)]}"  # noqa: E731
    s.section("Revenue")
    for seg in M.SEGMENTS:
        s.row(f"rev_{slug(seg)}", seg, "€", yearly(lambda c, i, seg=seg: f"={ref('Revenue', 'rev_' + slug(seg), c)}"),
              notes=["", "", "Revenue sheet: valuations × price"])
    s.row("rev_mkt", "Marketplace (deal fees)", "€", yearly(lambda c, i: f"={ref('Revenue', 'rev_mkt', c)}"),
          notes=["", "", "Revenue sheet: deals × average deal size × deal fee"])
    first = BOOK.rows[(t, f"rev_{slug(next(iter(M.SEGMENTS)))}")]
    s.row("revenue", "Total revenue", "€", yearly(lambda c, i: f"=SUM({c}{first}:{c}{BOOK.rows[(t, 'rev_mkt')]})"),
          bold=True, top_line=True)

    lines = M.cost_lines()
    for group, title in (("COGS", "Cost of sales"), ("Opex", "Operating costs")):
        s.section(title)
        keys = []
        for line in (ln for ln in lines if ln["group"] == group):
            key = "c_" + slug(line["name"])
            keys.append(key)
            name = line["name"]
            driver = DRIVERS.get(name, "Team sheet" if name in M.ROLES or name.startswith(
                ("Workplace", "IT", "Recruiting")) else "Assumptions: other operating costs")
            s.row(key, name, "€", yearly(lambda c, i, n=name: line_formula(n, c)),
                  notes=[line["area"], line["bucket"], driver])
        f, l = BOOK.rows[(t, keys[0])], BOOK.rows[(t, keys[-1])]
        BOOK.rows[(t, f"_{group.lower()}_first")], BOOK.rows[(t, f"_{group.lower()}_last")] = f, l
        total_key = "cogs" if group == "COGS" else "opex"
        s.row(total_key, f"Total {title.lower()}", "€", yearly(lambda c, i, f=f, l=l: f"=SUM({c}{f}:{c}{l})"),
              bold=True, top_line=True)
        if group == "COGS":
            s.blank()
            s.row("gross_profit", "Gross profit", "€", yearly(lambda c, i: f"={R('revenue', c)}-{R('cogs', c)}"),
                  bold=True)
            s.row("gross_margin", "Gross margin", "%", yearly(
                lambda c, i: f"=IF({R('revenue', c)}=0,0,{R('gross_profit', c)}/{R('revenue', c)})"))
    cost_first, cost_last = BOOK.rows[(t, "_cogs_first")], BOOK.rows[(t, "_opex_last")]
    BOOK.rows[(t, "_cost_first")], BOOK.rows[(t, "_cost_last")] = cost_first, cost_last

    s.section("Earnings")
    s.row("ebitda", "EBITDA", "€", yearly(lambda c, i: f"={R('gross_profit', c)}-{R('opex', c)}"), bold=True)
    s.row("ebitda_margin", "EBITDA margin", "%", yearly(
        lambda c, i: f"=IF({R('revenue', c)}=0,0,{R('ebitda', c)}/{R('revenue', c)})"))
    s.row("depreciation", "Depreciation (equipment)", "€", yearly(lambda c, i: f"={ref('Team', 'depreciation', c)}"))
    s.row("ebit", "EBIT (no debt, so = profit before tax)", "€", yearly(
        lambda c, i: f"={R('ebitda', c)}-{R('depreciation', c)}"), bold=True)

    s.section("Tax: two loss carry-forwards with minimum taxation (corporate tax and trade tax)")
    for tax, label, share in (("cit", "Corporate tax", lambda c: a("LOSS_OFFSET_SHARE_CIT", c)),
                              ("trade", "Trade tax", lambda c: a("LOSS_OFFSET_SHARE_TRADE"))):
        s.row(f"{tax}_open", f"{label}: loss carry-forward at start of year", "€",
              ["=0", *[f"={q}{s.r + 3}" for q in YC[:-1]]], notes=["", "", "last year's closing carry-forward"])
        s.row(f"{tax}_used", f"{label}: loss used against this year's profit", "€", yearly(
            lambda c, i, tax=tax, share=share: f"=IF({R('ebit', c)}<=0,0,MIN({R(tax + '_open', c)},MIN({R('ebit', c)},"
            f"{a('LOSS_OFFSET_CAP')})+{share(c)}*MAX(0,{R('ebit', c)}-{a('LOSS_OFFSET_CAP')})))"),
              notes=["", "", "EUR 1m in full, above it only the share on Assumptions"])
        s.row(f"{tax}_added", f"{label}: loss added this year", "€", yearly(lambda c, i: f"=MAX(0,-{R('ebit', c)})"))
        s.row(f"{tax}_close", f"{label}: loss carry-forward at end of year", "€", yearly(
            lambda c, i, tax=tax: f"={R(tax + '_open', c)}+{R(tax + '_added', c)}-{R(tax + '_used', c)}"))
        assert BOOK.rows[(t, f"{tax}_close")] == BOOK.rows[(t, f"{tax}_open")] + 3
        s.row(f"{tax}_taxable", f"{label}: taxable profit", "€", yearly(
            lambda c, i, tax=tax: f"=MAX(0,{R('ebit', c)}-{R(tax + '_used', c)})"))
    s.row("corporate_tax", "Corporate tax incl. solidarity surcharge", "€", yearly(
        lambda c, i: f"={R('cit_taxable', c)}*{a('CIT_RATE', c)}*(1+{a('SOLI')})"))
    s.row("trade_tax", "Trade tax (Berlin)", "€", yearly(
        lambda c, i: f"={R('trade_taxable', c)}*{a('TRADE_TAX_BASE')}*{a('TRADE_TAX_MULTIPLIER')}"))
    s.row("tax", "Income taxes", "€", yearly(lambda c, i: f"={R('corporate_tax', c)}+{R('trade_tax', c)}"), bold=True)
    s.row("tax_rate", "Statutory rate on profit (memo)", "%", yearly(
        lambda c, i: f"={a('CIT_RATE', c)}*(1+{a('SOLI')})+{a('TRADE_TAX_BASE')}*{a('TRADE_TAX_MULTIPLIER')}"))
    s.row("net_income", "Net income", "€", yearly(lambda c, i: f"={R('ebit', c)}-{R('tax', c)}"), bold=True,
          top_line=True)
    s.row("net_margin", "Net margin", "%", yearly(
        lambda c, i: f"=IF({R('revenue', c)}=0,0,{R('net_income', c)}/{R('revenue', c)})"))

    s.section("Segment view: the valuation business funds the marketplace build")

    def costs(area, c):
        return f"SUMIFS({c}${cost_first}:{c}${cost_last},$H${cost_first}:$H${cost_last},\"{area}\")"

    s.row("rev_valuation", "Valuation revenue", "€", yearly(lambda c, i: f"={ref('Revenue', 'rev_val', c)}"))
    s.row("cost_valuation", "Valuation costs (all lines tagged valuation)", "€",
          yearly(lambda c, i: "=" + costs("valuation", c)))
    s.row("ebitda_valuation", "Valuation business EBITDA", "€", yearly(
        lambda c, i: f"={R('rev_valuation', c)}-{R('cost_valuation', c)}"), bold=True)
    s.row("cost_marketplace", "Marketplace costs (all lines tagged marketplace, incl. free listing valuations)", "€",
          yearly(lambda c, i: "=" + costs("marketplace", c)))
    s.row("ebitda_marketplace", "Marketplace EBITDA", "€", yearly(
        lambda c, i: f"={R('rev_mkt', c)}-{R('cost_marketplace', c)}"), bold=True)

    s.section("Summary figures quoted in the deck")
    s.row("year", "Year", "year", yearly(lambda c, i: f"=VALUE({c}$4)"))
    s.row("profit_flag", "EBITDA positive? (1 = yes)", "", yearly(lambda c, i: f"=IF({R('ebitda', c)}>0,1,0)"))
    s.row("breakeven_year", "First EBITDA-positive year", "year",
          f"=IFERROR(INDEX({rng(t, 'year', here=t)},1,MATCH(1,{rng(t, 'profit_flag', here=t)},0)),0)", bold=True)
    s.row("gm_low", "Lowest gross margin 2029–2031", "%", f"=MIN({rng(t, 'gross_margin', here=t, cols=('E', 'G'))})")
    s.row("gm_high", "Highest gross margin 2029–2031", "%", f"=MAX({rng(t, 'gross_margin', here=t, cols=('E', 'G'))})")


# ---- Cash flow ---------------------------------------------------------------------------------------------------------
def build_cash():
    s = BOOK.sheet("Cash flow", "From EBITDA to cash, the funding rounds, a short balance sheet and the cash cover.")
    t = s.title
    R = lambda key, c: f"{c}{BOOK.rows[(t, key)]}"  # noqa: E731
    p = lambda key, c: ref("P&L", key, c)  # noqa: E731
    s.section("Cash flow")
    s.row("ebitda", "EBITDA", "€", yearly(lambda c, i: f"={p('ebitda', c)}"))
    s.row("tax", "Income taxes paid", "€", yearly(lambda c, i: f"=-{p('tax', c)}"),
          notes=["Paid in the same year (prepayments)"])
    s.row("receivables", "Receivables at year end (memo)", "€", yearly(
        lambda c, i: f"={p('revenue', c)}*{a('RECEIVABLE_DAYS')}/365"),
          notes=["Revenue × payment days / 365 (annual average; VAT timing left out)"])
    s.row("d_receivables", "Increase in receivables", "€",
          [f"=-{R('receivables', 'C')}", *[f"=-({R('receivables', c)}-{R('receivables', prev(c))})" for c in YC[1:]]])
    s.row("operating_cf", "Operating cash flow", "€", yearly(
        lambda c, i: f"={R('ebitda', c)}+{R('tax', c)}+{R('d_receivables', c)}"), bold=True, top_line=True)
    s.row("capex", "Equipment bought (memo)", "€", yearly(lambda c, i: f"={ref('Team', 'capex', c)}"))
    s.row("capex_out", "Equipment bought", "€", yearly(lambda c, i: f"=-{R('capex', c)}"))
    s.row("free_cf", "Free cash flow", "€", yearly(lambda c, i: f"={R('operating_cf', c)}+{R('capex_out', c)}"),
          bold=True)
    s.row("equity", "Equity raised", "€", [f"={a('ASK')}+{a('SEED', 'C')}", *[f"={a('SEED', c)}" for c in YC[1:]]],
          notes=["2027: the pre-seed round; later rounds on Assumptions (seed in 2029)"])
    s.row("cash_open", "Cash at start of year", "€", ["=0", *[f"={q}{s.r + 1}" for q in YC[:-1]]])
    s.row("cash_close", "Cash at end of year", "€", yearly(
        lambda c, i: f"={R('cash_open', c)}+{R('free_cf', c)}+{R('equity', c)}"), bold=True, top_line=True)
    assert BOOK.rows[(t, "cash_close")] == BOOK.rows[(t, "cash_open")] + 1
    s.row("cash_min", "Lowest year-end cash, 2027–2031", "€", f"=MIN({rng(t, 'cash_close', here=t)})", bold=True)

    def costs(c):
        return f"({p('cogs', c)}+{p('opex', c)})"

    s.row("cash_months", "Months of next year's costs covered (year-end cash + a round raised early next year)",
          "months", [*[f"=({R('cash_close', c)}+{R('equity', nxt)})/({costs(nxt)}/12)" for c, nxt in zip(YC, YC[1:])],
                     f"={R('cash_close', 'G')}/({costs('G')}/12)"],
          notes=["2031: this year's costs"])

    s.section("Balance sheet at year end (no debt; taxes paid in the year)")
    s.row("bs_cash", "Cash", "€", yearly(lambda c, i: f"={R('cash_close', c)}"))
    s.row("bs_receivables", "Receivables", "€", yearly(lambda c, i: f"={R('receivables', c)}"))
    s.row("bs_equipment", "Equipment (bought less depreciation, cumulative)", "€", yearly(
        lambda c, i: f"=SUM({ref('Team', 'capex', 'C')}:{ref('Team', 'capex', c).split('!')[1]})"
                     f"-SUM({ref('Team', 'depreciation', 'C')}:{ref('Team', 'depreciation', c).split('!')[1]})"))
    s.row("bs_assets", "Total assets", "€", yearly(
        lambda c, i: f"={R('bs_cash', c)}+{R('bs_receivables', c)}+{R('bs_equipment', c)}"), bold=True, top_line=True)
    s.row("bs_paid_in", "Paid-in equity (cumulative rounds)", "€",
          yearly(lambda c, i: f"=SUM($C${BOOK.rows[(t, 'equity')]}:{c}{BOOK.rows[(t, 'equity')]})"))
    s.row("bs_retained", "Retained earnings (cumulative net income)", "€", yearly(
        lambda c, i: f"=SUM({ref('P&L', 'net_income', 'C')}:{ref('P&L', 'net_income', c).split('!')[1]})"))
    s.row("bs_equity", "Total equity", "€", yearly(lambda c, i: f"={R('bs_paid_in', c)}+{R('bs_retained', c)}"),
          bold=True, top_line=True)
    s.row("bs_diff", "Difference (must be 0)", "€", yearly(lambda c, i: f"={R('bs_assets', c)}-{R('bs_equity', c)}"))

    s.section("Second route to free cash flow (must agree with the first)")
    s.row("fcf2", "Net income + depreciation − increase in receivables − equipment", "€", yearly(
        lambda c, i: f"={p('net_income', c)}+{p('depreciation', c)}+{R('d_receivables', c)}-{R('capex', c)}"))
    s.row("fcf_diff", "Difference (must be 0)", "€", yearly(lambda c, i: f"={R('fcf2', c)}-{R('free_cf', c)}"))


# ---- Unit economics, use of funds, market ------------------------------------------------------------------------------
def build_unit():
    s = BOOK.sheet("Unit economics", "One signed desktop valuation, one closed deal, and the classic comparison.",
                   years=False)
    t = s.title
    s.header(["", "Unit", "Value", "", "", "", "", "Notes"])
    R = lambda key: f"$C${BOOK.rows[(t, key)]}"  # noqa: E731
    s.section("One signed desktop valuation (investors, 2 senior hours)")
    s.row("price", "Price", "€ per valuation", f"={a('price_investors_multi_family', 'G')}",
          notes=["List price: the investor price on Assumptions"])
    s.row("hours", "Senior hours", "h per valuation", f"={a('hours_investors_multi_family')}")
    s.row("senior_hour", "Senior cost per review hour", "€/h", f"={ref('Team', 'loaded_senior_valuers', 'C')}/"
          f"{a('REVIEW_HOURS')}", notes=["Employer cost of a senior / review hours a year (at full use)"])
    s.row("senior", "Senior review", "€ per valuation", f"={R('hours')}*{R('senior_hour')}")
    s.row("data", "Data & documents", "€ per valuation",
          f"={a('DATA_COST')}+{a('COMPARABLES_FEE')}*{a('COMPARABLES_SHARE')}",
          notes=["Official documents + share of valuations × register extract"])
    s.row("hosting", "Hosting & e-signature", "€ per valuation", f"={a('HOSTING_COST')}")
    s.row("ai", "AI", "€ per valuation", f"={a('AI_COST')}")
    s.row("ins_pay", "Insurance & payments", "€ per valuation",
          f"={a('INSURANCE_PER_VALUATION')}+({a('PAYMENTS_RATE')}+{a('BAD_DEBT_RATE')})*{R('price')}")
    s.row("cost", "Direct cost", "€ per valuation", f"=SUM({R('senior')}:{R('ins_pay')})", bold=True, top_line=True)
    s.row("gp", "Gross profit", "€ per valuation", f"={R('price')}-{R('cost')}", bold=True)
    s.row("gm", "Gross margin", "%", f"=IF({R('price')}=0,0,{R('gp')}/{R('price')})", bold=True)
    s.row("gm_cap", "Gross margin with seniors at the utilisation cap", "%",
          f"=IF({R('price')}=0,0,({R('gp')}-{R('senior')}*(1/{a('MAX_UTILISATION')}-1))/{R('price')})",
          notes=["Senior time costs 1/cap more per valuation when seniors are only that busy"])

    s.section("One closed deal (2031)")
    deals = ref("Revenue", "deals", "G")
    s.row("fee", "Deal fee", "€ per deal", f"={a('AVG_TICKET')}*{a('TAKE_RATE')}")
    s.row("deal_var", "Deal costs (KYC, data room, contracts)", "€ per deal", f"={a('DEAL_VARIABLE')}")
    s.row("bad_debt", "Bad debt on the fee", "€ per deal", f"={R('fee')}*{a('BAD_DEBT_RATE')}")
    s.row("deal_team", "Deal team per deal", "€ per deal",
          f"=IF({deals}=0,0,{ref('Team', 'cost_deal_team', 'G')}/{deals})")
    s.row("listing", "Free owner-listing valuations per deal", "€ per deal",
          f"=IF({deals}=0,0,{ref('P&L', 'c_owner_listing_valuations_free', 'G')}/{deals})")
    s.row("deal_contrib", "Contribution per deal", "€ per deal",
          f"={R('fee')}-{R('deal_var')}-{R('bad_debt')}-{R('deal_team')}-{R('listing')}", bold=True, top_line=True)

    s.section("Classic valuation, for comparison")
    s.row("classic_hours", "Expert hours per classic report (BVS fee at €1m / court rate)", "h",
          f"={a('BVS_FEE_1M')}/{a('COURT_RATE')}", fmt=DEC1)
    s.row("classic_low", "Classic reports per valuer a year (at those hours)", "reports",
          f"={a('REVIEW_HOURS')}/{R('classic_hours')}")
    s.row("classic_high", "Classic reports per valuer a year (fast, 20 h)", "reports",
          f"={a('REVIEW_HOURS')}/{a('CLASSIC_HOURS_LOW')}")
    s.row("valuers_low", "Classic valuers needed for the 2031 volume (fast case)", "valuers",
          f"={ref('Revenue', 'n_total', 'G')}/{R('classic_high')}")
    s.row("valuers_high", "Classic valuers needed for the 2031 volume (BVS case)", "valuers",
          f"={ref('Revenue', 'n_total', 'G')}/{R('classic_low')}")
    s.row("censio_per_senior", "Censio: valuations per senior in 2031", "per senior", f"={ref('Team', 'per_senior', 'G')}")


def build_funds():
    s = BOOK.sheet("Use of funds", "Where the pre-seed round goes: all spending 2027–28 by purpose.", years=False)
    t = s.title
    s.header(["", "Unit", "2027–28", "", "", "", "", "Notes"])
    pf, pl = BOOK.rows[("P&L", "_cost_first")], BOOK.rows[("P&L", "_cost_last")]

    def bucket_sum(tag):
        return "+".join(f"SUMIFS('P&L'!{c}${pf}:{c}${pl},'P&L'!$I${pf}:$I${pl},\"{tag}\")" for c in ("C", "D"))

    s.section("Spending 2027–28 by purpose (founders split by role)")
    names = {"Build": "Build: product & AI", "Deliver": "Deliver: senior valuers", "Sell": "Sell: sales & partnerships",
             "Run": "Run: operations, legal & compliance"}
    s.row("founders", "Founders' cost 2027–28 (memo)", "€", f"={bucket_sum('Founders')}")
    rows = []
    for tag, name in names.items():
        split = f"+{a('founder_split_' + slug(tag))}*$C${BOOK.rows[(t, 'founders')]}" if tag in M.FOUNDER_SPLIT else ""
        rows.append(s.row(f"b_{slug(tag)}", name, "€", f"={bucket_sum(tag)}{split}"))
    s.row("b_total", "Total spending 2027–28", "€", f"=SUM(C{rows[0]}:C{rows[-1]})", bold=True, top_line=True)
    for tag, name in names.items():
        s.row(f"share_{slug(tag)}", f"Share: {name}", "%",
              f"=IF($C${BOOK.rows[(t, 'b_total')]}=0,0,$C${BOOK.rows[(t, 'b_' + slug(tag))]}/$C${BOOK.rows[(t, 'b_total')]})")
    s.row("gross", "Check: cost of sales + operating costs 2027–28", "€",
          f"={ref('P&L', 'cogs', 'C')}+{ref('P&L', 'cogs', 'D')}+{ref('P&L', 'opex', 'C')}+{ref('P&L', 'opex', 'D')}")

    s.section("How far the round goes")
    R = lambda key: f"$C${BOOK.rows[(t, key)]}"  # noqa: E731
    s.row("ask", "Pre-seed round", "€", f"={a('ASK')}")
    s.row("net_burn", "Net burn 2027–28 (negative EBITDA)", "€",
          f"=-({ref('P&L', 'ebitda', 'C')}+{ref('P&L', 'ebitda', 'D')})")
    s.row("working_capital", "Working capital (receivables end 2028)", "€", f"={ref('Cash flow', 'receivables', 'D')}")
    s.row("capex", "Equipment 2027–28", "€", f"={ref('Cash flow', 'capex', 'C')}+{ref('Cash flow', 'capex', 'D')}")
    s.row("buffer", "Reserve left from the round", "€",
          f"={R('ask')}-{R('net_burn')}-{R('working_capital')}-{R('capex')}", bold=True, top_line=True)
    s.row("gross27", "Spending 2027", "€", f"={ref('P&L', 'cogs', 'C')}+{ref('P&L', 'opex', 'C')}")
    s.row("gross28", "Spending 2028", "€", f"={ref('P&L', 'cogs', 'D')}+{ref('P&L', 'opex', 'D')}")
    s.row("runway", "Runway at zero revenue", "months",
          f"=12+({R('ask')}-{R('gross27')}-{ref('Cash flow', 'capex', 'C')})/({R('gross28')}/12)",
          notes=["12 months of 2027 spending, then 2028 spending per month; the deck rounds down"])
    s.row("valuations_2027_28", "Signed valuations 2027–28", "valuations",
          f"={ref('Revenue', 'n_total', 'C')}+{ref('Revenue', 'n_total', 'D')}")
    s.row("revenue_2027_28", "Revenue 2027–28", "€",
          f"={ref('Revenue', 'rev_total', 'C')}+{ref('Revenue', 'rev_total', 'D')}")
    s.row("revenue_2028", "Revenue 2028", "€", f"={ref('Revenue', 'rev_total', 'D')}")
    s.row("customers_2028", "Paying customers end of 2028", "customers", f"={a('CUSTOMERS_2028')}")


def build_market():
    s = BOOK.sheet("Market", "Market size: valuations (TAM/SAM/SOM) and the deal engine.", years=False)
    t = s.title
    s.header(["", "Unit", "Value", "", "", "", "", "Notes"])
    R = lambda key: f"$C${BOOK.rows[(t, key)]}"  # noqa: E731
    s.section("Valuations of income property in Germany")
    s.row("income_sales", "Income-property sales 2024 (multi-family + commercial)", "sales",
          f"={a('MFH_SALES_2024')}+{a('COMMERCIAL_SALES_2024')}")
    s.row("tam_valuations", "Valuations a year (× valuations per sale)", "valuations",
          f"={R('income_sales')}*{a('VALUATIONS_PER_SALE')}")
    s.row("tam", "TAM: valuations × average market fee", "€", f"={R('tam_valuations')}*{a('MEAN_MARKET_FEE')}",
          bold=True)
    s.row("sam_valuations", "Buy-side valuations of multi-family purchases", "valuations",
          f"={a('MFH_SALES_2024')}*{a('BUY_SIDE_SHARE')}")
    s.row("sam", "SAM: buy-side multi-family valuations × fee", "€", f"={R('sam_valuations')}*{a('MEAN_MARKET_FEE')}",
          bold=True)
    s.row("som", "SOM 2031: our investor valuations × price", "€",
          f"={a('vol_investors_multi_family', 'G')}*{a('price_investors_multi_family', 'G')}", bold=True)
    s.row("som_share", "Share of SAM valuations", "%", f"={a('vol_investors_multi_family', 'G')}/{R('sam_valuations')}")
    s.section("The deal engine (deal fee on transaction volume)")
    s.row("deal_tam", "Europe: investment volume × deal fee", "€", f"={a('EU_INVESTMENT_2025')}*{a('TAKE_RATE')}",
          bold=True)
    s.row("de_turnover", "Germany: income-property turnover 2025F", "€",
          f"={a('DE_MFH_TURNOVER_2025F')}+{a('DE_COMMERCIAL_TURNOVER_2025F')}")
    s.row("deal_sam", "Germany: income-property turnover × deal fee + valuation TAM", "€",
          f"={R('de_turnover')}*{a('TAKE_RATE')}+{R('tam')}", bold=True)
    s.row("som_total_share", "Censio revenue 2031 as a share of that German pool", "%",
          f"={ref('P&L', 'revenue', 'G')}/{R('deal_sam')}")


def build_downside():
    s = BOOK.sheet("Downside", "Valuation business only, without the marketplace and the seed: fewer valuations, lower "
                   "prices, more senior hours. Seniors are hired to need; other costs stay as planned.")
    t = s.title
    R = lambda key, c: f"{c}{BOOK.rows[(t, key)]}"  # noqa: E731
    s.row("year", "Year", "year", yearly(lambda c, i: f"=VALUE({c}$4)"))
    of, ol = BOOK.rows[("P&L", "_opex_first")], BOOK.rows[("P&L", "_opex_last")]

    def block(p: str, dach: bool, title: str):
        def vol(k, c):
            share = f"*(1-{a('DACH_SHARE')})" if dach and k == "Commercial & DACH" else ""
            return f"{a('vol_' + slug(k), c)}{share}"

        s.section(title)
        s.row(p + "n", "Paid valuations", "valuations", yearly(lambda c, i: "=(" + "+".join(
            vol(k, c) for k in M.PAID_SEGMENTS) + f")*{a('DOWNSIDE_VOLUME')}"))
        s.row(p + "revenue", "Revenue", "€", yearly(lambda c, i: "=(" + "+".join(
            f"{vol(k, c)}*{a('price_' + slug(k), c)}" for k in M.PAID_SEGMENTS)
            + f")*{a('DOWNSIDE_VOLUME')}*{a('DOWNSIDE_PRICE')}"))
        s.row(p + "hours", "Senior hours needed", "h", yearly(lambda c, i: "=(" + "+".join(
            f"{vol(k, c)}*" + (a("DOWNSIDE_HOURS") if k.startswith("Investors") else a("hours_" + slug(k)))
            for k in M.PAID_SEGMENTS) + f")*{a('DOWNSIDE_VOLUME')}"),
              notes=["Investor valuations at the downside hours; other segments as planned"])
        s.row(p + "seniors", "Seniors needed (average)", "heads", yearly(
            lambda c, i: f"=MAX({a('DOWNSIDE_MIN_SENIORS')},{R(p + 'hours', c)}/({a('REVIEW_HOURS')}*"
                         f"{a('MAX_UTILISATION')}))"))
        site = lambda c: "+".join(f"{vol(k, c)}*{a('site_' + slug(k))}" for k in M.SITE_VISIT_COST)  # noqa: E731
        s.row(p + "cogs", "Cost of sales", "€", yearly(
            lambda c, i: f"={R(p + 'seniors', c)}*{ref('Team', 'loaded_senior_valuers', c)}+{R(p + 'n', c)}*"
                         f"{per_valuation_cost()}+({site(c)})*{a('DOWNSIDE_VOLUME')}+{R(p + 'revenue', c)}*"
                         f"({a('PAYMENTS_RATE')}+{a('BAD_DEBT_RATE')})"),
              notes=["Seniors + cost per valuation + travel + payments and bad debt"])
        dach_cost = f"-{a('ns_dach_expansion', '{c}')}" if dach else ""
        s.row(p + "opex", "Operating costs (valuation business, as planned" + (", without DACH)" if dach else ")"),
              "€", yearly(lambda c, i: f"=SUMIFS('P&L'!{c}${of}:{c}${ol},'P&L'!$H${of}:$H${ol},\"valuation\")"
                                       + dach_cost.replace("{c}", c)),
              notes=["P&L operating-cost lines tagged valuation (before any cost cuts)"])
        s.row(p + "ebitda", "EBITDA", "€", yearly(
            lambda c, i: f"={R(p + 'revenue', c)}-{R(p + 'cogs', c)}-{R(p + 'opex', c)}"), bold=True, top_line=True)
        s.row(p + "cum", "Cumulative EBITDA", "€",
              [f"=C{s.r - 1}", *[f"={q}{s.r}+{c}{s.r - 1}" for q, c in zip(YC, YC[1:])]])
        s.row(p + "receivables", "Receivables at year end", "€", yearly(
            lambda c, i: f"={R(p + 'revenue', c)}*{a('RECEIVABLE_DAYS')}/365"))
        capex_val = BOOK.rows[("Team", "capex_val")]
        s.row(p + "equipment", "Equipment bought so far (valuation team)", "€",
              yearly(lambda c, i: f"=SUM(Team!$C${capex_val}:{c}{capex_val})"))
        s.row(p + "cash", "Cash at year end (pre-seed + cumulative EBITDA − receivables − equipment)", "€", yearly(
            lambda c, i: f"={a('ASK')}+{R(p + 'cum', c)}-{R(p + 'receivables', c)}-{R(p + 'equipment', c)}"),
              bold=True)
        s.row(p + "short", "Out of cash this year? (1 = yes)", "", yearly(lambda c, i: f"=IF({R(p + 'cash', c)}<0,1,0)"))
        s.row(p + "out_of_cash_year", "First year out of cash (0 = never)", "year",
              f"=IFERROR(INDEX({rng(t, 'year', here=t)},1,MATCH(1,{rng(t, p + 'short', here=t)},0)),0)", bold=True)
        s.row(p + "cum_min", "Lowest cumulative EBITDA", "€", f"=MIN(0,MIN({rng(t, p + 'cum', here=t)}))")
        s.row(p + "extra", "Extra cash needed by 2031", "€", f"=MAX(0,-MIN({rng(t, p + 'cash', here=t)}))", bold=True)

    block("", False, "Downside: valuation business only")
    block("nd_", True, "Same downside without the DACH expansion (its costs and the DACH share of its segment)")
    s.row("profit_flag", "EBITDA positive? (1 = yes)", "", yearly(lambda c, i: f"=IF({R('ebitda', c)}>0,1,0)"))
    s.row("breakeven_year", "First EBITDA-positive year (0 = never)", "year",
          f"=IFERROR(INDEX({rng(t, 'year', here=t)},1,MATCH(1,{rng(t, 'profit_flag', here=t)},0)),0)")

    s.section("Marketplace sensitivity: 2031 EBITDA if deals or the deal fee differ from plan (deal team as planned)")
    head = s.r
    s.ws.cell(row=head, column=1, value="Deals (share of plan) ↓ · deal fee →").font = font(bold=True)
    for j, c in enumerate(("C", "D", "E")):
        s.ws[f"{c}{head}"] = f"={a('SENS_FEES', c)}"
        s.ws[f"{c}{head}"].number_format = PCT
        s.ws[f"{c}{head}"].font = font(GREEN, True)
    s.r += 1
    deals, ticket, bd, var = (ref("Revenue", "deals", "G"), a("AVG_TICKET"), a("BAD_DEBT_RATE"), a("DEAL_VARIABLE"))
    base = f"({deals}*{ticket}*{a('TAKE_RATE')}*(1-{bd})-{deals}*{var})"
    for j, src_col in enumerate(("C", "D", "E")):
        r = s.r
        BOOK.rows[(t, f"sens_{j}")] = r
        s.ws[f"A{r}"] = f"Deals at this share of plan"
        s.ws[f"A{r}"].font = font()
        s.ws[f"B{r}"] = f"={a('SENS_DEALS', src_col)}"
        s.ws[f"B{r}"].number_format = LEVER
        s.ws[f"B{r}"].font = font(GREEN)
        for c in ("C", "D", "E"):
            d = f"({deals}*$B{r})"
            s.ws[f"{c}{r}"] = (f"={ref('P&L', 'ebitda', 'G')}-{base}+{d}*{ticket}*{c}${head}*(1-{bd})-{d}*{var}")
            s.ws[f"{c}{r}"].number_format = EUR
            s.ws[f"{c}{r}"].font = font()
        s.r += 1
    BOOK.rows[(t, "sens_head")] = head
    s.note("Each cell: plan EBITDA 2031 − plan deal contribution + contribution at these deals and this fee "
           "(fee less bad debt, less cost per deal).")


def build_peers():
    s = BOOK.sheet("Peer check", "Is the plan realistic? Censio next to listed peers, and what has to be true.",
                   years=False, extra=[("What it shows", 90)])
    s.header(["", "Unit", "Value", "", "", "", "", "What it shows"])
    p = lambda key, c="G": ref("P&L", key, c)  # noqa: E731
    pk = lambda name: a("peer_" + slug(name))  # noqa: E731
    s.section("EBITDA margin: Censio next to peers")
    s.row("censio", "Censio 2031, company", "%", f"={p('ebitda_margin')}", bold=True,
          notes=["Valuations plus the second year of the marketplace"])
    s.row("censio_val", "Censio 2031, valuation business", "%",
          f"=IF({p('rev_valuation')}=0,0,{p('ebitda_valuation')}/{p('rev_valuation')})",
          notes=["AI prepares, seniors sign: far above services firms, far below portals"])
    s.row("censio_mkt", "Censio 2031, marketplace (incl. free listing valuations)", "%",
          f"=IF({p('rev_mkt')}=0,0,{p('ebitda_marketplace')}/{p('rev_mkt')})",
          notes=["Deal fees less deal team, deal costs, listing valuations, marketplace tech and marketing"])
    s.row("censio_mkt_2030", "Censio 2030, marketplace in its launch year", "%",
          f"=IF({p('rev_mkt', 'F')}=0,0,{p('ebitda_marketplace', 'F')}/{p('rev_mkt', 'F')})",
          notes=["Build costs fell in 2029, before launch"])
    for name, label, note in (
            ("Scout24 margin", "Scout24 (German portal)", "Mature portals: the long-run ceiling for a marketplace"),
            ("Rightmove margin", "Rightmove (UK portal)", ""), ("REA margin", "REA Group (Australian portal)", ""),
            ("Zillow margin", "Zillow (portal + transactions)", "Transaction businesses earn less than pure portals"),
            ("CoStar margin", "CoStar (building a marketplace)", "Margins fall while a marketplace is built"),
            ("CBRE margin", "CBRE (services incl. valuations)", "People-based valuation and advisory"),
            ("JLL margin", "JLL (services)", ""), ("Savills margin", "Savills (consultancy; profit before tax)", "")):
        s.row(None, label, "%", f"={pk(name)}", notes=[note])

    s.section("Revenue per person")
    s.row("rev_head", "Censio 2031: revenue per average head", "€",
          f"={ref('Revenue', 'rev_total', 'G')}/{ref('Team', 'avg_total', 'G')}", bold=True)
    s.row(None, "Scout24: revenue per employee", "€", f"={pk('Scout24 revenue per head')}")
    s.row(None, "Savills: revenue per staff (GBP)", "£", f"={pk('Savills revenue per head')}")
    s.row(None, "Private SaaS median (USD)", "$", f"={pk('SaaS revenue per head')}")

    s.section("Marketplace volume (2031)")
    deals = ref("Revenue", "deals", "G")
    s.row("deals", "Deals closed on Censio", "deals", f"={deals}", bold=True)
    s.row(None, "Crexi US online auctions, annualised record quarter (whole US platform)", "deals",
          f"={pk('Crexi auctions per quarter')}*4")
    s.row("deal_share", "Share of German income-property sales (2024 count)", "%",
          f"={deals}/({a('MFH_SALES_2024')}+{a('COMMERCIAL_SALES_2024')})")
    s.row("volume_share", "Share of German income-property turnover (2025F)", "%",
          f"={ref('Revenue', 'gtv', 'G')}/{ref('Market', 'de_turnover')}")

    s.section("Deal-manager productivity (2031)")
    team_avg, team_ye = ref("Team", "avg_deal_team", "G"), ref("Team", "ye_deal_team", "G")
    s.row("per_manager_avg", "Deals per deal manager (average heads)", "deals", f"=IF({team_avg}=0,0,{deals}/{team_avg})",
          notes=["The plan's most ambitious number: AI does the paperwork"])
    s.row("per_manager_ye", "Deals per deal manager (year-end heads)", "deals", f"=IF({team_ye}=0,0,{deals}/{team_ye})")
    s.row(None, "US agents: median transactions a year (NAR)", "deals", f"={pk('NAR transactions per agent')}")
    s.row("fee_per_manager", "Censio: deal fees per deal manager (average heads)", "€",
          f"=IF({team_avg}=0,0,{ref('Revenue', 'rev_mkt', 'G')}/{team_avg})")
    s.row(None, "Engel & Völkers: commission per professional", "€", f"={pk('E&V commission per professional')}")

    s.section("What has to be true")
    for line in ("1. A senior checks and signs an AI-prepared valuation in about 2 hours (classic: ~35 hours).",
                 "2. Investors pay €2,000 for a signed desktop valuation in 48 hours.",
                 "3. A seed round closes early in 2029 on the 2028 proof.",
                 "4. From 2030, owners list with a free signed value and ~1,500 deals a year close on Censio by 2031.",
                 "5. Deal managers close ~100 deals a year each because AI does the paperwork (brokers: ~10).",
                 "6. The deal fee holds at 1.5% on ~€1m deals. The Downside sheet shows 2031 EBITDA at half the deals "
                 "or a 1% fee.",
                 "Change the levers on Assumptions to see the plan without any of these."):
        s.note(line, color=BLACK)


# ---- Deck tie-out, checks, sources, cover ------------------------------------------------------------------------------
def deck_number(text: str) -> float:
    """The number printed on a slide: '−€0.6m' -> -0.6, '39%' -> 39, '≈360' -> 360, '€3.6bn+' -> 3.6."""
    t = text.replace("−", "-").replace("≈", "").replace("€", "").replace(",", "").replace("+", "").strip()
    t = re.sub(r"(bn|m|k|%)$", "", t)
    return float(t)


def tie_rows() -> list[tuple]:
    """(slide, figure, model cell, scale, digits, deck text, rounding): every model figure printed in the deck."""
    F, I, n = C.FMT, C.I, C.NUM
    rows = []

    def add(slide, label, cell, scale, digits, shown, how="round"):
        rows.append((slide, label, cell, scale, digits, shown, how))

    pnl, rev, team, cash = "P&L", "Revenue", "Team", "Cash flow"
    add("Market", "Deal-engine TAM (Europe)", ref("Market", "deal_tam"), 1e9, 1, F["deal_tam"])
    add("Market", "Deal-engine SAM (Germany)", ref("Market", "deal_sam"), 1e9, 1, F["deal_sam"])
    add("Market", "European investment volume 2025", a("EU_INVESTMENT_2025"), 1e9, 0, F["eu_investment"])
    add("Market", "German income-property turnover 2025F", ref("Market", "de_turnover"), 1e9, 0,
        F["de_income_turnover"])
    add("Market", "Valuation SAM", ref("Market", "sam"), 1e6, 0, F["sam"])
    add("Market", "Revenue 2031 as a share of the German pool", ref("Market", "som_total_share"), 0.01, 0,
        F["som_total_share"])
    add("Market", "Multi-family sales 2024", a("MFH_SALES_2024"), 1, 0, F["mfh_sales"])
    add("Market / Financials", "Revenue 2031", ref(pnl, "revenue", "G"), 1e6, 1, F["revenue_last"])
    add("Market", "Valuation revenue 2031", ref(rev, "rev_val", "G"), 1e6, 1, F["valuation_revenue_last"])
    add("Market", "Deal-fee revenue 2031", ref(rev, "rev_mkt", "G"), 1e6, 1, F["marketplace_revenue_last"])
    add("Go-to-market", "Price per valuation", ref("Unit economics", "price"), 1, 0, F["price"])
    add("Go-to-market", "Deal fee", a("TAKE_RATE"), 0.01, 1, F["take_rate"])
    add("Go-to-market", "Deals 2030", ref(rev, "deals", "F"), 1, 0, F["deals_first"])
    add("Go-to-market", "Deals 2031", ref(rev, "deals", "G"), 1, 0, F["deals_last"])
    for i, y in enumerate(M.YEARS):
        add("Go-to-market / Financials", f"Revenue {y}", ref(pnl, "revenue", YC[i]), 1e6, 1, F["revenue"][i])
        add("Financials", f"EBITDA {y} (chart)", ref(pnl, "ebitda", YC[i]), 1e6, 1, F["ebitda"][i])
        add("Financials", f"Signed valuations {y}", ref(rev, "n_total", YC[i]), 1, 0, F["valuations"][i])
        add("Financials / Team", f"People at year end {y}", ref(team, "ye_total", YC[i]), 1, 0, F["people"][i])
    add("Financials", "EBITDA 2031", ref(pnl, "ebitda", "G"), 1e6, 1, F["ebitda_last"])
    add("Financials", "EBITDA margin 2031", ref(pnl, "ebitda_margin", "G"), 0.01, 0, F["ebitda_margin_last"])
    add("Financials", "Deal-fee share of revenue 2031", ref(rev, "deal_share", "G"), 0.01, 0, F["deal_share_last"])
    add("Financials", "First EBITDA-positive year", ref(pnl, "breakeven_year"), 1, 0, F["breakeven"])
    low, high = F["company_gm"].rstrip("%").split("–")
    add("Financials (notes)", "Lowest company gross margin 2029–31", ref(pnl, "gm_low"), 0.01, 0, low + "%")
    add("Financials (notes)", "Highest company gross margin 2029–31", ref(pnl, "gm_high"), 0.01, 0, high + "%")
    for key, label in (("senior", "Senior review (2 h)"), ("data", "Data & documents"), ("hosting",
                       "Hosting & e-signature"), ("ai", "AI"), ("ins_pay", "Insurance & payments")):
        name = {"senior": "Senior review (2 h)", "data": "Data & documents", "hosting": "Hosting & e-signature",
                "ai": "AI", "ins_pay": "Insurance & payments"}[key]
        add("Financials", f"Per valuation: {label}", ref("Unit economics", key), 1, 0,
            f"€{C.U['cost_lines'][name]:,.0f}")
    add("Financials", "Gross profit per valuation", ref("Unit economics", "gp"), 1, 0, F["gross_profit"])
    add("Financials", "Gross margin per valuation", ref("Unit economics", "gm"), 0.01, 0, F["gross_margin"])
    add("Financials", "Downside: first year out of cash", ref("Downside", "out_of_cash_year"), 1, 0,
        F["downside_out_of_cash"])
    add("Financials", "Downside: extra cash needed", ref("Downside", "extra"), 1e6, 1, F["downside_extra"])
    add("Financials (notes)", "Downside without DACH: extra cash", ref("Downside", "nd_extra"), 1e6, 1,
        F["downside_extra_no_dach"])
    add("Financials (notes)", "Downside: EBITDA 2031", ref("Downside", "ebitda", "G"), 1e6, 1, F["downside_2031"])
    add("Financials (notes)", "Downside: lowest cumulative EBITDA", ref("Downside", "cum_min"), 1e6, 1,
        F["downside_cum"])
    for j, share in enumerate(M.SENS_DEALS):
        for c, fee in zip(("C", "D", "E"), M.SENS_FEES):
            key = f"{share:g}x{fee:g}"
            if key in C.SENS_SHOWN:
                add("Financials (notes)", f"2031 EBITDA at {share:.0%} of deals and a {fee:.1%} fee",
                    f"Downside!{c}{BOOK.rows[('Downside', f'sens_{j}')]}", 1e6, 1, C.SENS_SHOWN[key])
    add("Team", "Senior experts 2031 (valuers + deal team)", ref(team, "experts", "G"), 1, 0, F["experts_last"])
    add("Team", "Valuations per senior 2031", ref(team, "per_senior", "G"), 1, -1, F["per_senior"])
    add("Team", "Average seniors 2031", ref(team, "avg_senior_valuers", "G"), 1, 1, F["avg_seniors_last"])
    add("Team", "Expert hours per classic report", ref("Unit economics", "classic_hours"), 1, 0, F["classic_hours"])
    add("Team", "Classic reports per valuer (BVS case)", ref("Unit economics", "classic_low"), 1, -1, F["classic_low"])
    add("Team", "Classic reports per valuer (fast case)", ref("Unit economics", "classic_high"), 1, 0, F["classic_high"])
    add("Team", "Classic valuers needed (fast case)", ref("Unit economics", "valuers_low"), 1, -1,
        F["classic_valuers_low"])
    add("Team", "Classic valuers needed (BVS case)", ref("Unit economics", "valuers_high"), 1, -1,
        F["classic_valuers_high"])
    add("Team (notes)", "Revenue per person 2031", ref("Peer check", "rev_head"), 1e6, 1, F["rev_per_head_last"])
    add("Ask", "Pre-seed round", ref("Use of funds", "ask"), 1e6, 1, F["ask"])
    add("Ask", "Spending 2027–28", ref("Use of funds", "b_total"), 1e6, 1, F["spend_2027_28"])
    add("Ask", "Revenue 2027–28", ref("Use of funds", "revenue_2027_28"), 1e6, 1, F["revenue_2027_28"])
    add("Ask", "Revenue 2028", ref("Use of funds", "revenue_2028"), 1e6, 1, F["revenue_2028"])
    add("Ask", "Reserve left from the round", ref("Use of funds", "buffer"), 1e6, 1, F["buffer"])
    add("Ask", "Runway at zero revenue (rounded down)", ref("Use of funds", "runway"), 1, 0, F["runway"], "down")
    add("Ask", "Signed valuations 2027–28", ref("Use of funds", "valuations_2027_28"), 1, 0, F["valuations_2027_28"])
    add("Ask", "Paying customers 2028", ref("Use of funds", "customers_2028"), 1, 0, F["customers_2028"])
    for tag in ("Build", "Deliver", "Sell", "Run"):
        name = {"Build": "Build: product & AI", "Deliver": "Deliver: senior valuers", "Sell":
                "Sell: sales & partnerships", "Run": "Run: operations, legal & compliance"}[tag]
        add("Ask", f"Share of spending: {tag} (rounded to add up to 100%)", ref("Use of funds", "share_" + slug(tag)),
            0.01, 0, f"{C.BUCKET_PCT[name]}%", "share")
    add("Ask (notes)", "Net burn 2027–28", ref("Use of funds", "net_burn"), 1e6, 1, C.eur_m(C.P["net_burn_2027_28"]))
    add("Ask (notes)", "Working capital end 2028", ref("Use of funds", "working_capital"), 1e6, 1,
        C.eur_m(C.P["working_capital"]))
    add("Ask (notes)", "Equipment 2027–28", ref("Use of funds", "capex"), 1e6, 2, C.eur_m(C.P["capex"], 2))
    add("Backup", "Valuation business EBITDA 2031", ref(pnl, "ebitda_valuation", "G"), 1e6, 1,
        C.eur_m(C.LAST["valuation_ebitda"]))
    add("Backup", "Marketplace EBITDA 2031", ref(pnl, "ebitda_marketplace", "G"), 1e6, 1,
        C.eur_m(C.LAST["marketplace_ebitda"]))
    backup_refs = {"Signed valuations": (rev, "n_total", 1, 0), "Deals closed on Censio": (rev, "deals", 1, 0),
                   "Revenue": (pnl, "revenue", 1e6, 1), "of which deal fees": (rev, "rev_mkt", 1e6, 1),
                   "Gross margin": (pnl, "gross_margin", 0.01, 0), "Operating costs": (pnl, "opex", 1e6, 1),
                   "EBITDA": (pnl, "ebitda", 1e6, 1), "EBITDA margin": (pnl, "ebitda_margin", 0.01, 0),
                   "Net income after tax": (pnl, "net_income", 1e6, 1), "Cash at year end": (cash, "cash_close", 1e6, 1),
                   "People at year end": (team, "ye_total", 1, 0)}
    for name, values, _bold in C.BACKUP_ROWS:
        sheet, key, scale, digits = backup_refs[name]
        for i, shown in enumerate(values):
            if shown not in ("–", "n/m"):
                add("Backup table", f"{name} {M.YEARS[i]}", ref(sheet, key, YC[i]), scale, digits, shown)
    add("Backup drivers", "Senior valuer: gross salary", a("salary_senior_valuers"), 1, 0, C.eur(I["senior_salary"]))
    add("Backup drivers", "Senior valuer: employer cost", ref(team, "loaded_senior_valuers", "C"), 1, -2,
        C.eur(round(I["senior_cost"], -2)))
    add("Backup drivers", "Review hours per senior a year", a("REVIEW_HOURS"), 1, 0, f"{I['review_hours']:,}")
    add("Backup drivers", "AI per valuation", a("AI_COST"), 1, 0, C.eur(I["ai_cost"]))
    add("Backup drivers", "Data per valuation", ref("Unit economics", "data"), 1, 0, C.eur(I["data_cost"]))
    add("Backup drivers", "E-signature & hosting per valuation", a("HOSTING_COST"), 1, 0, C.eur(I["hosting_cost"]))
    add("Backup drivers", "Insurance per valuation", a("INSURANCE_PER_VALUATION"), 1, 0, C.eur(I["insurance"]))
    add("Backup drivers", "Workplace per head a month", a("WORKPLACE_PER_MONTH"), 1, 0, C.eur(I["workplace"]))
    add("Backup drivers", "IT per head a year", a("IT_PER_HEAD"), 1, 0, C.eur(I["it"]))
    add("Backup drivers", "Recruiting per hire", a("RECRUITING_PER_HIRE"), 1, 0, C.eur(I["recruiting"]))
    add("Backup drivers", "Headhunter fee for seniors", a("SENIOR_SEARCH_FEE"), 0.01, 0, C.pct(I["senior_search_fee"]))
    add("Backup drivers", "Average deal size", a("AVG_TICKET"), 1e6, 0, C.eur_m(I["avg_ticket"], 0))
    add("Backup drivers", "Tax rate 2027", ref(pnl, "tax_rate", "C"), 0.01, 0, C.pct(I["tax_first"]))
    add("Backup drivers", "Tax rate 2031", ref(pnl, "tax_rate", "G"), 0.01, 0, C.pct(I["tax_last"]))
    add("Backup (notes)", "Seed round 2029", a("SEED", "E"), 1e6, 1, C.eur_m(I["seed"]))
    del n
    return rows


def build_tieout():
    s = BOOK.sheet("Deck tie-out", "Every model figure printed in the deck (slides, backup, speaker notes), linked to "
                   "the cell it comes from.", years=False)
    ws = s.ws
    for col, width in zip("ABCDEFGH", (22, 52, 18, 10, 16, 16, 14, 9)):
        ws.column_dimensions[col].width = width
    s.r = 4
    heads = ["Slide", "Figure", "Model value", "Unit", "Model, rounded", "Deck shows", "Deck number", "Match"]
    for k, text in enumerate(heads):
        cell = ws.cell(row=s.r, column=k + 1, value=text)
        cell.font = font("FFFFFF", True)
        cell.fill = PatternFill("solid", fgColor=BRAND)
        cell.alignment = Alignment(horizontal="right" if k in (2, 4, 5, 6) else "left")
    ws.freeze_panes = "A5"
    s.r += 1
    first = s.r
    units = {1e9: ("€bn", '#,##0.0,,,"bn"'), 1e6: ("€m", '#,##0.00,,"m"'), 1: ("", "#,##0.0"), 0.01: ("%", "0.0%")}
    for slide, label, cell_ref, scale, digits, shown, how in tie_rows():
        r = s.r
        unit, fmt = units[scale]
        ws[f"A{r}"], ws[f"B{r}"] = slide, label
        ws[f"C{r}"] = f"={cell_ref}"
        ws[f"C{r}"].number_format = fmt
        ws[f"C{r}"].font = font(GREEN)
        ws[f"D{r}"] = unit
        if how == "down":
            ws[f"E{r}"] = f"=ROUNDDOWN(C{r}/{scale},{digits})"
        else:
            ws[f"E{r}"] = f"=ROUND(C{r}/{scale},{digits})"
        ws[f"E{r}"].number_format = "General"
        ws[f"F{r}"] = shown
        ws[f"G{r}"] = deck_number(shown)
        ws[f"G{r}"].font = font(INK2, italic=True)
        tol = 1 if how == "share" else 0.0001
        ws[f"H{r}"] = f"=ABS(E{r}-G{r})<={tol}"
        for col in "ABDF":
            ws[f"{col}{r}"].font = font(INK2 if col in "AD" else BLACK)
        for col in "CEFG":
            ws[f"{col}{r}"].alignment = Alignment(horizontal="right")
        s.r += 1
    BOOK.rows[("Deck tie-out", "_first")], BOOK.rows[("Deck tie-out", "_last")] = first, s.r - 1
    s.r += 1
    s.note("Deck shows = the text on the slide or in the speaker notes; Deck number = that text as a number (grey "
           "italic, copied from the deck, not an input).")
    s.note("Match = the workbook, rounded the way the slide rounds it, gives the same number. Use-of-funds shares are "
           "rounded so the four add up to 100%, so they may differ by one point.")


def build_checks():
    s = BOOK.sheet("Checks", "Integrity checks. Each can fail; all must be TRUE for the base plan.", years=False)
    s.ws.column_dimensions["A"].width = 80
    s.header(["Check", "", "Result", "", "", "", "", "How"])
    pnl, cash, team = "P&L", "Cash flow", "Team"
    pf, pl = BOOK.rows[(pnl, "_cost_first")], BOOK.rows[(pnl, "_cost_last")]
    tie_f, tie_l = BOOK.rows[("Deck tie-out", "_first")], BOOK.rows[("Deck tie-out", "_last")]

    def tagged(c):
        return (f"SUMIFS('P&L'!{c}${pf}:{c}${pl},'P&L'!$H${pf}:$H${pl},\"valuation\")"
                f"+SUMIFS('P&L'!{c}${pf}:{c}${pl},'P&L'!$H${pf}:$H${pl},\"marketplace\")")

    tag_terms = "+".join(f"ABS({tagged(c)}-{ref(pnl, 'cogs', c)}-{ref(pnl, 'opex', c)})" for c in YC)
    checks = [
        ("Every cost line carries an area tag: tagged lines add up to cost of sales + operating costs, every year",
         f"=({tag_terms})<1", "P&L columns H and A–G"),
        ("Use-of-funds buckets add up to all spending 2027–28 (every line has a bucket)",
         f"=ABS({ref('Use of funds', 'b_total')}-{ref('Use of funds', 'gross')})<1", "Use of funds sheet"),
        ("Founders' time split adds up to 100%",
         "=ABS(" + "+".join(a('founder_split_' + slug(k)) for k in M.FOUNDER_SPLIT) + "-1)<0.000001", "Assumptions"),
        ("Planned heads cover the volume: no senior valuers or deal managers added beyond the plan",
         f"=SUMPRODUCT(ABS({rng(team, 'avg_senior_valuers')}-{rng(A, 'avg_senior_valuers')}))"
         f"+SUMPRODUCT(ABS({rng(team, 'avg_deal_team')}-{rng(A, 'avg_deal_team')}))<0.001",
         "Fails when volumes or hours outgrow the planned team (the Team sheet then adds heads)"),
        ("Cash never falls below zero", f"={ref(cash, 'cash_min')}>=0", "Cash flow sheet"),
        ("Year-end cash (plus a round early next year) covers the minimum months of next year's costs",
         f"=MIN({rng(cash, 'cash_months')})>={a('MIN_CASH_MONTHS')}", "Cash flow sheet; minimum on Assumptions"),
        ("Balance sheet balances every year (cash + receivables + equipment = paid-in equity + retained earnings)",
         f"=SUMPRODUCT(ABS({rng(cash, 'bs_diff')}))<1", "Cash flow sheet"),
        ("Free cash flow is the same by two routes, every year", f"=SUMPRODUCT(ABS({rng(cash, 'fcf_diff')}))<1",
         "Cash flow sheet"),
        ("Every model figure in the deck matches the workbook",
         f"=COUNTIF('Deck tie-out'!H{tie_f}:H{tie_l},FALSE)=0", "Deck tie-out sheet"),
        ("Scenario levers are at 1.00× (the deck shows the base plan)",
         "=AND(" + ",".join(f"{a(k)}=1" for k in ("LEVER_VOLUME", "LEVER_PRICE", "LEVER_HOURS", "LEVER_DEALS")) + ")",
         "Change the levers to test scenarios; the deck tie-out will then show differences"),
    ]
    first = s.r
    for label, formula, how in checks:
        s.row(None, label, "", formula, fmt="General", notes=[how])
    s.row("all", "All checks pass", "", f"=AND(C{first}:C{s.r - 1})", fmt="General", bold=True, top_line=True)


def build_sources():
    s = BOOK.sheet("Sources", "Public sources behind the inputs (kind S and B on Assumptions). Figures were collected "
                   "in Nov 2026, mostly from search-engine extracts of the linked pages: open each link before "
                   "external use.", years=False)
    ws = s.ws
    for col, width in {"A": 14, "B": 50, "C": 52, "D": 60, "E": 70}.items():
        ws.column_dimensions[col].width = width
    s.r = 4
    for k, text in enumerate(["ID", "Source", "What we take from it", "Figure", "Link"]):
        cell = ws.cell(row=s.r, column=k + 1, value=text)
        cell.font = font("FFFFFF", True)
        cell.fill = PatternFill("solid", fgColor=BRAND)
    ws.freeze_panes = "A5"
    s.r += 1
    for sid, src in SOURCES.items():
        r = s.r
        for col, value in zip("ABCDE", (sid, src["title"], src["use"], src["figure"], src.get("url", ""))):
            ws[f"{col}{r}"] = value
            ws[f"{col}{r}"].font = font(BLACK if col != "E" else "1849A9")
            ws[f"{col}{r}"].alignment = Alignment(wrap_text=True, vertical="top")
        if src.get("url", "").startswith("http"):
            ws[f"E{r}"].hyperlink = src["url"]
        s.r += 1
    s.r += 1
    s.note("Kinds on the Assumptions sheet: S = sourced public figure; B = set from public benchmarks; "
           "T = the founders' market experience; A = plan assumption we have to prove.")


def build_cover():
    ws = BOOK.wb.create_sheet("Cover", 0)
    ws.sheet_view.showGridLines = False
    for col, width in zip("ABCDEFGH", (44, 16, 15, 15, 15, 15, 15, 30)):
        ws.column_dimensions[col].width = width
    ws["A1"] = "Censio RE · Financial model 2027–2031"
    ws["A1"].font = font(BRAND, True, 18)
    ws["A2"] = (f"{VERSION} · built {date.today():%d %b %Y} · EUR, net of VAT, constant 2027 euros · "
                "the backup behind the pitch deck's numbers")
    ws["A2"].font = font(INK2, italic=True)
    text = [
        ("How it works", True),
        ("Inputs live on one sheet (Assumptions, blue). Every other number is a formula: change an input and the "
         "whole model updates.", False),
        ("Each input says what kind it is (S sourced · B benchmark · T team experience · A assumption) and where it "
         "comes from (Sources). Sources were read from search-engine extracts: open the links before external use.",
         False),
        ("Revenue = valuations × price + deals × average deal size × deal fee. Costs = people (gross salary + "
         "employer social security) + cost per valuation and per deal + overhead per head + other operating costs.",
         False),
        ("Senior valuers and deal managers are sized to the volume: if the levers need more people, the Team sheet "
         "adds them and the P&L pays for them.", False),
        ("Colours: blue = input · black = formula · green = link to another sheet · yellow = scenario lever · grey "
         "italic = a number copied from the deck (Deck tie-out).", False),
    ]
    r = 4
    for line, bold in text:
        ws[f"A{r}"] = line
        ws[f"A{r}"].font = font(BRAND if bold else BLACK, bold)
        r += 1
    r += 1
    ws[f"A{r}"] = "Checks"
    ws[f"A{r}"].font = font(BRAND, True)
    ws[f"B{r}"] = f"=IF(Checks!C{BOOK.rows[('Checks', 'all')]},\"All checks pass\",\"A check fails: see Checks\")"
    ws[f"B{r}"].font = font(BLACK, True)
    r += 2
    ws[f"A{r}"] = "Sheets (click to open)"
    ws[f"A{r}"].font = font(BRAND, True)
    r += 1
    for name, what in [
        ("Assumptions", "every input, its kind and source"), ("Revenue", "volumes, prices, review hours, deal fees"),
        ("Team", "heads sized to the volume, salaries, hires, overhead, equipment"),
        ("P&L", "revenue to net income, tax, segment view"), ("Cash flow", "cash, funding, balance sheet, cash cover"),
        ("Unit economics", "one valuation, one deal"), ("Use of funds", "the pre-seed round 2027–28"),
        ("Market", "TAM, SAM, SOM, deal engine"), ("Downside", "valuation business under stress; marketplace grid"),
        ("Peer check", "margins and volumes vs peers"), ("Deck tie-out", "every deck figure → cell"),
        ("Checks", "integrity checks"), ("Sources", "public sources behind the inputs")]:
        ws[f"A{r}"] = f"=HYPERLINK(\"#{quoted(name)}!A1\",\"{name}\")"
        ws[f"A{r}"].font = Font(name=FONT, color="1849A9", bold=True, underline="single")
        ws[f"B{r}"] = what
        ws[f"B{r}"].font = font(INK2)
        r += 1
    r += 1
    head = r
    for k, label in enumerate(["Key figures", "Unit", *[str(y) for y in M.YEARS]]):
        cell = ws.cell(row=r, column=k + 1, value=label)
        cell.font = font("FFFFFF", True)
        cell.fill = PatternFill("solid", fgColor=BRAND)
        cell.alignment = Alignment(horizontal="left" if k < 2 else "right")
    r += 1
    figures = [
        ("Signed valuations", "valuations", "Revenue", "n_total", NUM),
        ("Deals closed on Censio", "deals", "Revenue", "deals", NUM),
        ("Revenue", "€", "P&L", "revenue", EUR),
        ("Gross margin", "%", "P&L", "gross_margin", PCT),
        ("EBITDA", "€", "P&L", "ebitda", EUR),
        ("EBITDA margin", "%", "P&L", "ebitda_margin", PCT),
        ("Net income", "€", "P&L", "net_income", EUR),
        ("Cash at year end", "€", "Cash flow", "cash_close", EUR),
        ("People at year end", "heads", "Team", "ye_total", NUM),
    ]
    for label, unit, sheet, key, fmt in figures:
        ws[f"A{r}"], ws[f"B{r}"] = label, unit
        ws[f"A{r}"].font, ws[f"B{r}"].font = font(), font(INK2)
        for c in YC:
            ws[f"{c}{r}"] = f"={ref(sheet, key, c)}"
            ws[f"{c}{r}"].number_format = fmt
            ws[f"{c}{r}"].font = font(GREEN)
        r += 1
    rev_row, ebitda_row = head + 3, head + 5
    chart = BarChart()
    chart.type = "col"
    chart.title = "Revenue and EBITDA (€)"
    chart.height, chart.width = 7.5, 16
    for row_number, name, colour in ((rev_row, "Revenue", BRAND), (ebitda_row, "EBITDA", "7FD1B9")):
        chart.add_data(Reference(ws, min_col=3, max_col=7, min_row=row_number, max_row=row_number), from_rows=True,
                       titles_from_data=False)
        chart.series[-1].tx = SeriesLabel(v=name)
        chart.series[-1].graphicalProperties.solidFill = colour
    chart.set_categories(Reference(ws, min_col=3, max_col=7, min_row=head, max_row=head))
    chart.y_axis.numFmt = "#,##0"
    chart.y_axis.majorGridlines = None
    ws.add_chart(chart, f"A{r + 1}")


def finish():
    for ws in BOOK.wb.worksheets:
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
        if ws.title in ("Cover", "Assumptions"):
            ws.sheet_properties.tabColor = BRAND
    BOOK.wb.active = 0
    BOOK.wb.calculation.fullCalcOnLoad = True


def build(path: Path = OUT) -> Path:
    global BOOK
    BOOK = Book()
    build_assumptions()
    build_revenue()
    build_team()
    build_pnl()
    build_cash()
    build_unit()
    build_funds()
    build_market()
    build_downside()
    build_peers()
    build_tieout()
    build_checks()
    build_sources()
    build_cover()
    finish()
    path.parent.mkdir(parents=True, exist_ok=True)
    BOOK.wb.save(path)
    return path


if __name__ == "__main__":
    print(f"wrote {build()}")
