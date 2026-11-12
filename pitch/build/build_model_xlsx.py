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
VERSION = "v1.0"

# ---- Style -------------------------------------------------------------------------------------------------------------
FONT = "Arial"
BLUE, BLACK, GREEN = "0000FF", "000000", "008000"
BRAND, BRAND_WEAK, INK2, LINE = "0B5D4B", "E6F2EE", "475467", "D0D5DD"
EUR = '#,##0;(#,##0);"-"'
NUM = '#,##0;(#,##0);"-"'
DEC1 = '#,##0.0;(#,##0.0);"-"'
DEC2 = '#,##0.00;(#,##0.00);"-"'
PCT = '0.0%;(0.0%);"-"'
LEVER = '0.00"×"'
FMT_BY_UNIT = {"€": EUR, "€/yr": EUR, "€/month": EUR, "€ per valuation": EUR, "€ per deal": EUR, "€ per hire": EUR,
               "€ per head": EUR, "€/h": EUR, "%": PCT, "×": LEVER, "heads": DEC1, "years": NUM, "days": NUM,
               "h": DEC1, "h per valuation": DEC1, "valuations": NUM, "deals": NUM, "sales": NUM, "customers": NUM,
               "months": DEC1, "hires": DEC1, "h/yr": NUM, "per senior": NUM, "valuers": NUM, "reports": DEC1,
               "share": PCT, "£": EUR, "$": EUR}
LINK_RE = re.compile(r"^='?[^'!]+'?!\$?[A-Z]+\$?\d+$")
THIN = Side(style="thin", color=LINE)


def font(color=BLACK, bold=False, size=10, italic=False):
    return Font(name=FONT, color=color, bold=bold, size=size, italic=italic)


class Book:
    def __init__(self):
        self.wb = Workbook()
        self.wb.remove(self.wb.active)
        self.rows: dict[tuple[str, str], int] = {}
        self.sheets: dict[str, "Sheet"] = {}

    def sheet(self, title: str, subtitle: str, *, years: bool = True, extra: list[tuple[str, int]] | None = None):
        s = Sheet(self, title, subtitle, years=years, extra=extra or [("Notes", 70)])
        self.sheets[title] = s
        return s


class Sheet:
    """A sheet with label (A), unit (B), five year columns (C-G) and notes columns (H...)."""

    def __init__(self, book: Book, title: str, subtitle: str, *, years: bool, extra: list[tuple[str, int]]):
        self.book, self.title = book, title
        self.ws = book.wb.create_sheet(title)
        ws = self.ws
        ws.sheet_view.showGridLines = False
        ws.column_dimensions["A"].width = 46
        ws.column_dimensions["B"].width = 16
        for c in YC:
            ws.column_dimensions[c].width = 14
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
            cell.alignment = Alignment(horizontal="left" if k in (0, 1) or k > 6 else "right", vertical="center")
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
        cell.alignment = Alignment(wrap_text=False)
        self.r += 1

    def row(self, key: str | None, label: str, unit: str, cells, *, fmt: str | None = None, notes=(),
            bold=False, top_line=False, lever=False):
        """cells: a list of five values/formulas (C-G) or one scalar (C)."""
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
        self.r += 1
        return r

    def blank(self, n=1):
        self.r += n


BOOK = Book()


def ref(sheet: str, key: str, col: str | None = None, *, here: str | None = None) -> str:
    """Cell reference: a year column (relative) or the scalar in column C (absolute)."""
    r = BOOK.rows[(sheet, key)]
    cell = f"{col}{r}" if col else f"$C${r}"
    if sheet == here:
        return cell
    return f"'{sheet}'!{cell}" if " " in sheet or "&" in sheet else f"{sheet}!{cell}"


def rng(sheet: str, key: str, *, here: str | None = None, absolute=True) -> str:
    r = BOOK.rows[(sheet, key)]
    cells = f"$C${r}:$G${r}" if absolute else f"C{r}:G{r}"
    if sheet == here:
        return cells
    return f"'{sheet}'!{cells}" if " " in sheet or "&" in sheet else f"{sheet}!{cells}"


def yearly(fn):
    return [fn(c, i) for i, c in enumerate(YC)]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


# ---- Assumptions -------------------------------------------------------------------------------------------------------
def input_row(s: Sheet, name: str, value, *, key: str | None = None, label: str | None = None, lever=False):
    """One input with its documentation from DOC (label, unit, kind, sources, note)."""
    doc = DOC[name]
    cells = [float(v) if isinstance(v, (int, float)) else v for v in value] if isinstance(value, list) else value
    return s.row(key or name, label or doc["label"], doc["unit"], cells, lever=lever,
                 notes=[doc["kind"], ", ".join(doc.get("sources", [])), doc.get("note", "")])


def build_assumptions():
    s = BOOK.sheet("Assumptions", "Every input of the model, entered once. Blue = input; yellow = scenario lever. "
                   "Kind: S sourced · B benchmark · T team experience · A plan assumption (see Sources).",
                   extra=[("Kind", 7), ("Source", 22), ("Why this value", 95)])
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

    s.section("Valuation business: variable cost per signed valuation (paid and free)")
    for name in ("AI_COST", "DATA_COST", "COMPARABLES_FEE", "COMPARABLES_SHARE", "HOSTING_COST",
                 "INSURANCE_PER_VALUATION"):
        input_row(s, name, getattr(M, name))
    for seg, cost in M.SITE_VISIT_COST.items():
        input_row(s, f"SITE_VISIT:{seg}", cost, key=f"site_{slug(seg)}")
    input_row(s, "PAYMENTS_RATE", M.PAYMENTS_RATE)

    s.section("Marketplace (opens 2030)")
    input_row(s, "DEALS", M.DEALS)
    for name in ("AVG_TICKET", "TAKE_RATE", "DEAL_VARIABLE"):
        input_row(s, name, getattr(M, name))

    s.section("Employer social security (2026 rates and ceilings, held constant)")
    for name in ("EMP_PENSION_RATE", "EMP_UNEMPLOYMENT_RATE", "EMP_INSOLVENCY_RATE", "CEILING_PENSION",
                 "EMP_HEALTH_RATE", "EMP_HEALTH_EXTRA", "EMP_CARE_RATE", "CEILING_HEALTH", "EMP_OTHER_RATE"):
        input_row(s, name, getattr(M, name))

    s.section("Team: heads and gross salaries (constant 2027 euros)")
    input_row(s, "ATTRITION", M.ATTRITION)
    for role, (ye, avg, salary, _area, _group) in M.ROLES.items():
        input_row(s, f"YE:{role}", ye, key=f"ye_{slug(role)}", label=f"{role}: heads at year end")
        input_row(s, f"AVG:{role}", avg, key=f"avg_{slug(role)}", label=f"{role}: average heads")
        input_row(s, f"SALARY:{role}", salary, key=f"salary_{slug(role)}", label=f"{role}: gross salary per head")

    s.section("Overhead per head")
    for name in ("WORKPLACE_PER_MONTH", "IT_PER_HEAD", "RECRUITING_PER_HIRE", "EQUIPMENT_PER_HIRE",
                 "DEPRECIATION_YEARS"):
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
    for name in ("ASK",):
        input_row(s, name, getattr(M, name))
    input_row(s, "SEED", M.SEED)
    for name in ("RECEIVABLE_DAYS", "CUSTOMERS_2028"):
        input_row(s, name, getattr(M, name))
    for bucket, share in M.FOUNDER_SPLIT.items():
        input_row(s, f"FOUNDER_SPLIT:{bucket}", share, key=f"founder_split_{slug(bucket)}")

    s.section("Market")
    for name in ("MFH_SALES_2024", "COMMERCIAL_SALES_2024", "VALUATIONS_PER_SALE", "MEAN_MARKET_FEE",
                 "BUY_SIDE_SHARE", "EU_INVESTMENT_2025", "DE_MFH_TURNOVER_2025F", "DE_COMMERCIAL_TURNOVER_2025F"):
        input_row(s, name, getattr(M, name))

    s.section("Downside case (valuation business only)")
    for name in ("DOWNSIDE_VOLUME", "DOWNSIDE_PRICE", "DOWNSIDE_HOURS", "DOWNSIDE_MIN_SENIORS"):
        input_row(s, name, getattr(M, name))

    s.section("Classic valuation, for comparison")
    for name in ("COURT_RATE", "BVS_FEE_1M", "CLASSIC_HOURS_LOW"):
        input_row(s, name, getattr(M, name))

    s.section("Peer benchmarks (for the Peer check sheet only; not used in the plan)")
    for name, value, _unit, _sid, _note in PEERS:
        input_row(s, name, value, key="peer_" + slug(name.split(":", 1)[1]))
    s.ws.freeze_panes = "C5"


A = "Assumptions"


def a(key: str, col: str | None = None, here: str | None = None) -> str:
    return ref(A, key, col, here=here)


def employer_cost_formula(salary: str) -> str:
    """Salary + social security capped at the contribution ceilings + other employer costs (as model.employer_cost)."""
    pension = f"({a('EMP_PENSION_RATE')}+{a('EMP_UNEMPLOYMENT_RATE')}+{a('EMP_INSOLVENCY_RATE')})"
    health = f"({a('EMP_HEALTH_RATE')}+{a('EMP_HEALTH_EXTRA')}+{a('EMP_CARE_RATE')})"
    return (f"={salary}+MIN({salary},{a('CEILING_PENSION')})*{pension}+MIN({salary},{a('CEILING_HEALTH')})*{health}"
            f"+{salary}*{a('EMP_OTHER_RATE')}")


# ---- Revenue -----------------------------------------------------------------------------------------------------------
def build_revenue():
    s = BOOK.sheet("Revenue", "Volumes × prices, senior capacity and the marketplace deal fee.")
    t = s.title
    segs = list(M.SEGMENTS)
    s.section("Signed valuations")
    for seg in segs:
        k = slug(seg)
        s.row(f"n_{k}", seg, "valuations", yearly(lambda c, i, k=k: f"={a(f'vol_{k}', c)}*{a('LEVER_VOLUME')}"))
    first, last = BOOK.rows[(t, f"n_{slug(segs[0])}")], BOOK.rows[(t, f"n_{slug(segs[-1])}")]
    s.row("n_total", "All signed valuations", "valuations", yearly(lambda c, i: f"=SUM({c}{first}:{c}{last})"),
          bold=True, top_line=True)
    paid = [BOOK.rows[(t, f"n_{slug(seg)}")] for seg in M.PAID_SEGMENTS]
    s.row("n_paid", "Paid valuations (owner listings are free)", "valuations",
          yearly(lambda c, i: "=" + "+".join(f"{c}{r}" for r in paid)))

    s.section("Price per valuation")
    for seg in segs:
        k = slug(seg)
        s.row(f"p_{k}", seg, "€ per valuation", yearly(lambda c, i, k=k: f"={a(f'price_{k}', c)}*{a('LEVER_PRICE')}"))

    s.section("Valuation revenue")
    for seg in segs:
        k = slug(seg)
        s.row(f"rev_{k}", seg, "€", yearly(lambda c, i, k=k: f"={c}{BOOK.rows[(t, f'n_{k}')]}*{c}{BOOK.rows[(t, f'p_{k}')]}"))
    first, last = BOOK.rows[(t, f"rev_{slug(segs[0])}")], BOOK.rows[(t, f"rev_{slug(segs[-1])}")]
    s.row("rev_val", "Valuation revenue", "€", yearly(lambda c, i: f"=SUM({c}{first}:{c}{last})"), bold=True,
          top_line=True)

    s.section("Senior time and capacity")
    for seg in segs:
        k = slug(seg)
        s.row(f"h_{k}", f"{seg}: hours per valuation", "h per valuation",
              yearly(lambda c, i, k=k: f"={a(f'hours_{k}')}*{a('LEVER_HOURS')}"))
    s.row("hours", "Senior review hours needed", "h", yearly(lambda c, i: "=" + "+".join(
        f"{c}{BOOK.rows[(t, f'n_{slug(seg)}')]}*{c}{BOOK.rows[(t, f'h_{slug(seg)}')]}" for seg in segs)), bold=True,
          fmt=NUM)
    s.row("seniors_avg", "Senior valuers (average heads)", "heads",
          yearly(lambda c, i: f"={a('avg_senior_valuers', c)}"))
    s.row("capacity", "Senior review capacity", "h",
          yearly(lambda c, i: f"={c}{BOOK.rows[(t, 'seniors_avg')]}*{a('REVIEW_HOURS')}"), fmt=NUM)
    s.row("util", "Senior utilisation", "%", yearly(
        lambda c, i: f"=IF({c}{BOOK.rows[(t, 'capacity')]}=0,0,{c}{BOOK.rows[(t, 'hours')]}/{c}{BOOK.rows[(t, 'capacity')]})"),
          notes=["Plan cap: Assumptions, max utilisation (Checks sheet)"])
    s.row("per_senior", "Valuations per senior", "per senior", yearly(
        lambda c, i: f"=IF({c}{BOOK.rows[(t, 'seniors_avg')]}=0,0,{c}{BOOK.rows[(t, 'n_total')]}/{c}{BOOK.rows[(t, 'seniors_avg')]})"))

    s.section("Marketplace (deal fee on closed deals)")
    s.row("deals", "Deals closed on Censio", "deals", yearly(lambda c, i: f"={a('DEALS', c)}*{a('LEVER_DEALS')}"))
    s.row("ticket", "Average deal size", "€", yearly(lambda c, i: f"={a('AVG_TICKET')}"))
    s.row("gtv", "Transaction volume on Censio", "€",
          yearly(lambda c, i: f"={c}{BOOK.rows[(t, 'deals')]}*{c}{BOOK.rows[(t, 'ticket')]}"))
    s.row("take", "Deal fee", "%", yearly(lambda c, i: f"={a('TAKE_RATE')}"))
    s.row("rev_mkt", "Marketplace revenue (deal fees)", "€",
          yearly(lambda c, i: f"={c}{BOOK.rows[(t, 'gtv')]}*{c}{BOOK.rows[(t, 'take')]}"), bold=True)

    s.section("Total")
    s.row("rev_total", "Total revenue", "€", yearly(
        lambda c, i: f"={c}{BOOK.rows[(t, 'rev_val')]}+{c}{BOOK.rows[(t, 'rev_mkt')]}"), bold=True, top_line=True)
    s.row("growth", "Growth on prior year", "%", ["", *[
        f"=IF({p}{BOOK.rows[(t, 'rev_total')]}=0,0,{c}{BOOK.rows[(t, 'rev_total')]}/{p}{BOOK.rows[(t, 'rev_total')]}-1)"
        for p, c in zip(YC, YC[1:])]])
    s.row("deal_share", "Share of revenue from deal fees", "%", yearly(
        lambda c, i: f"=IF({c}{BOOK.rows[(t, 'rev_total')]}=0,0,{c}{BOOK.rows[(t, 'rev_mkt')]}/{c}{BOOK.rows[(t, 'rev_total')]})"))


# ---- Team --------------------------------------------------------------------------------------------------------------
def build_team():
    s = BOOK.sheet("Team", "Heads, staff cost (gross salary + employer on-costs), hires and overhead per head.")
    t = s.title
    for role, (_ye, _avg, salary, area, group) in M.ROLES.items():
        k = slug(role)
        s.section(f"{role} ({area}, {'cost of sales' if group == 'cogs' else 'operating cost'})")
        s.row(f"ye_{k}", "Heads at year end", "heads", yearly(lambda c, i, k=k: f"={a(f'ye_{k}', c)}"))
        s.row(f"avg_{k}", "Average heads", "heads", yearly(lambda c, i, k=k: f"={a(f'avg_{k}', c)}"))
        per_year = isinstance(salary, list)
        s.row(f"salary_{k}", "Gross salary per head", "€/yr",
              yearly(lambda c, i, k=k, py=per_year: f"={a(f'salary_{k}', c if py else None)}"))
        s.row(f"loaded_{k}", "Employer cost per head (salary + social security + other)", "€/yr",
              yearly(lambda c, i, k=k: employer_cost_formula(f"{c}{BOOK.rows[(t, f'salary_{k}')]}")),
              notes=["Social security up to the contribution ceilings (Assumptions)"])
        s.row(f"cost_{k}", "Staff cost", "€", yearly(
            lambda c, i, k=k: f"={c}{BOOK.rows[(t, f'avg_{k}')]}*{c}{BOOK.rows[(t, f'loaded_{k}')]}"), bold=True)
        attrition = "0" if role == "Founders" else a("ATTRITION")
        ye = BOOK.rows[(t, f"ye_{k}")]
        s.row(f"hires_{k}", "Hires (growth + replacements)", "hires",
              [f"=MAX(0,C{ye})", *[f"=MAX(0,{c}{ye}-{p}{ye})+{attrition}*{p}{ye}" for p, c in zip(YC, YC[1:])]],
              notes=["2027: the starting team; later years: growth plus leavers replaced (attrition × last year-end)"])

    roles = list(M.ROLES)
    by_area = {area: [slug(r) for r in roles if M.ROLES[r][3] == area] for area in ("valuation", "marketplace")}

    def total(prefix, keys, c):
        return "=" + "+".join(f"{c}{BOOK.rows[(t, f'{prefix}_{k}')]}" for k in keys)

    s.section("Totals")
    all_keys = [slug(r) for r in roles]
    s.row("ye_total", "Heads at year end", "heads", yearly(lambda c, i: total("ye", all_keys, c)), bold=True, fmt=NUM)
    s.row("avg_total", "Average heads", "heads", yearly(lambda c, i: total("avg", all_keys, c)))
    s.row("staff_total", "Staff cost", "€", yearly(lambda c, i: total("cost", all_keys, c)), bold=True)
    for area, keys in by_area.items():
        s.row(f"avg_{area}", f"Average heads: {area}", "heads", yearly(lambda c, i, keys=keys: total("avg", keys, c)))
        hire_keys = [k for k in keys if k != "founders"]
        s.row(f"hires_{area}", f"Hires: {area} (founders excluded)", "hires",
              yearly(lambda c, i, keys=hire_keys: total("hires", keys, c)))
    s.row("hires_all", "Hires incl. founders (for equipment)", "hires", yearly(lambda c, i: total("hires", all_keys, c)))

    s.section("Overhead per head")
    for area in by_area:
        sfx = "" if area == "valuation" else "_mkt"
        s.row(f"workplace{sfx}", f"Workplace ({area})", "€", yearly(
            lambda c, i, area=area: f"={c}{BOOK.rows[(t, f'avg_{area}')]}*{a('WORKPLACE_PER_MONTH')}*12"))
        s.row(f"it{sfx}", f"IT & software ({area})", "€", yearly(
            lambda c, i, area=area: f"={c}{BOOK.rows[(t, f'avg_{area}')]}*{a('IT_PER_HEAD')}"))
        s.row(f"recruiting{sfx}", f"Recruiting ({area})", "€", yearly(
            lambda c, i, area=area: f"={c}{BOOK.rows[(t, f'hires_{area}')]}*{a('RECRUITING_PER_HIRE')}"))
    s.row("capex", "Equipment bought (capex)", "€", yearly(
        lambda c, i: f"={c}{BOOK.rows[(t, 'hires_all')]}*{a('EQUIPMENT_PER_HIRE')}"), bold=True)
    s.row("year_index", "Year number", "", yearly(lambda c, i: "=COLUMN()-2"), fmt=NUM)
    yi, cx = BOOK.rows[(t, "year_index")], BOOK.rows[(t, "capex")]
    s.row("depreciation", "Depreciation", "€", yearly(
        lambda c, i: f"=SUMPRODUCT(($C${yi}:$G${yi}<={c}{yi})*($C${yi}:$G${yi}>{c}{yi}-{a('DEPRECIATION_YEARS')})"
                     f"*$C${cx}:$G${cx})/{a('DEPRECIATION_YEARS')}"),
          notes=["Straight line over the years on Assumptions, from the year of purchase"])


# ---- P&L ---------------------------------------------------------------------------------------------------------------
def line_formula(name: str, c: str) -> str:
    rv = lambda key: ref("Revenue", key, c)  # noqa: E731
    tm = lambda key: ref("Team", key, c)  # noqa: E731
    role_keys = {r: f"cost_{slug(r)}" for r in M.ROLES}
    fixed = {
        "AI (per valuation)": f"={rv('n_total')}*{a('AI_COST')}",
        "Data & documents": f"={rv('n_total')}*({a('DATA_COST')}+{a('COMPARABLES_FEE')}*{a('COMPARABLES_SHARE')})",
        "Hosting & e-signature": f"={rv('n_total')}*{a('HOSTING_COST')}",
        "Professional indemnity insurance": f"={rv('n_total')}*{a('INSURANCE_PER_VALUATION')}",
        "Site visits (travel)": "=" + "+".join(f"{rv('n_' + slug(seg))}*{a('site_' + slug(seg))}"
                                               for seg in M.SITE_VISIT_COST),
        "Payments & bad debt": f"={rv('rev_val')}*{a('PAYMENTS_RATE')}",
        "Deal costs (KYC, data room, contracts)": f"={rv('deals')}*{a('DEAL_VARIABLE')}",
        "Workplace": f"={tm('workplace')}", "IT & software": f"={tm('it')}", "Recruiting": f"={tm('recruiting')}",
        "Workplace (marketplace)": f"={tm('workplace_mkt')}", "IT & software (marketplace)": f"={tm('it_mkt')}",
        "Recruiting (marketplace)": f"={tm('recruiting_mkt')}",
    }
    if name in fixed:
        return fixed[name]
    if name in role_keys:
        return f"={tm(role_keys[name])}"
    if name in M.NON_STAFF:
        return f"={a('ns_' + slug(name), c)}"
    raise KeyError(name)


def build_pnl():
    s = BOOK.sheet("P&L", "Profit and loss, 2027–2031. Area and bucket tags feed the segment view and Use of funds.",
                   extra=[("Area", 13), ("Use-of-funds bucket", 20), ("Driver", 62)])
    t = s.title
    rv = lambda key, c: ref("Revenue", key, c, here=t)  # noqa: E731
    s.section("Revenue")
    for seg in M.SEGMENTS:
        s.row(f"rev_{slug(seg)}", seg, "€", yearly(lambda c, i, seg=seg: f"={rv('rev_' + slug(seg), c)}"),
              notes=["valuation", "", "Revenue sheet: valuations × price"])
    s.row("rev_mkt", "Marketplace (deal fees)", "€", yearly(lambda c, i: f"={rv('rev_mkt', c)}"),
          notes=["marketplace", "", "Revenue sheet: deals × average deal size × deal fee"])
    first = BOOK.rows[(t, f"rev_{slug(next(iter(M.SEGMENTS)))}")]
    last = BOOK.rows[(t, "rev_mkt")]
    s.row("revenue", "Total revenue", "€", yearly(lambda c, i: f"=SUM({c}{first}:{c}{last})"), bold=True,
          top_line=True)

    lines = M.cost_lines()
    drivers = {
        "Senior valuers": "Team: average seniors × employer cost", "AI (per valuation)": "all signed valuations × AI cost",
        "Hosting & e-signature": "all signed valuations × cost",
        "Professional indemnity insurance": "all signed valuations × insurance per valuation",
        "Site visits (travel)": "bank valuations × travel per site visit",
        "Payments & bad debt": "valuation revenue × rate",
        "Data & documents": "all signed valuations × (documents + share × register extract)",
        "Deal team": "Team: average deal team × employer cost", "Deal costs (KYC, data room, contracts)":
        "deals × cost per deal", "Founders": "Team: 4 founders × employer cost",
    }
    for group, title in (("COGS", "Cost of sales"), ("Opex", "Operating costs")):
        s.section(title)
        keys = []
        for line in (ln for ln in lines if ln["group"] == group):
            key = "c_" + slug(line["name"])
            keys.append(key)
            driver = drivers.get(line["name"], "Team sheet" if line["name"] in M.ROLES or line["name"].startswith(
                ("Workplace", "IT", "Recruiting")) else "Assumptions: other operating costs")
            s.row(key, line["name"], "€", yearly(lambda c, i, n=line["name"]: line_formula(n, c)),
                  notes=[line["area"], line["bucket"], driver])
        f, l = BOOK.rows[(t, keys[0])], BOOK.rows[(t, keys[-1])]
        BOOK.rows[(t, f"_{group.lower()}_first")], BOOK.rows[(t, f"_{group.lower()}_last")] = f, l
        total_key = "cogs" if group == "COGS" else "opex"
        s.row(total_key, f"Total {title.lower()}", "€", yearly(lambda c, i, f=f, l=l: f"=SUM({c}{f}:{c}{l})"),
              bold=True, top_line=True)
        if group == "COGS":
            s.blank()
            s.row("gross_profit", "Gross profit", "€", yearly(
                lambda c, i: f"={c}{BOOK.rows[(t, 'revenue')]}-{c}{BOOK.rows[(t, 'cogs')]}"), bold=True)
            s.row("gross_margin", "Gross margin", "%", yearly(
                lambda c, i: f"=IF({c}{BOOK.rows[(t, 'revenue')]}=0,0,{c}{BOOK.rows[(t, 'gross_profit')]}/{c}{BOOK.rows[(t, 'revenue')]})"))
    cost_first = BOOK.rows[(t, "c_" + slug(lines[0]["name"]))]
    cost_last = BOOK.rows[(t, "opex")] - 1

    s.section("Earnings")
    R = lambda key, c: f"{c}{BOOK.rows[(t, key)]}"  # noqa: E731
    s.row("ebitda", "EBITDA", "€", yearly(lambda c, i: f"={R('gross_profit', c)}-{R('opex', c)}"), bold=True)
    s.row("ebitda_margin", "EBITDA margin", "%", yearly(
        lambda c, i: f"=IF({R('revenue', c)}=0,0,{R('ebitda', c)}/{R('revenue', c)})"))
    s.row("depreciation", "Depreciation (equipment)", "€", yearly(
        lambda c, i: f"={ref('Team', 'depreciation', c, here=t)}"))
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
    area_rng = f"$H${cost_first}:$H${cost_last}"

    def costs(area, c):
        return f"SUMIFS({c}${cost_first}:{c}${cost_last},{area_rng},\"{area}\")"

    s.row("rev_valuation", "Valuation revenue", "€", yearly(lambda c, i: f"={rv('rev_val', c)}"))
    s.row("cost_valuation", "Valuation costs (all lines tagged valuation)", "€",
          yearly(lambda c, i: "=" + costs("valuation", c)))
    s.row("ebitda_valuation", "Valuation business EBITDA", "€", yearly(
        lambda c, i: f"={R('rev_valuation', c)}-{R('cost_valuation', c)}"), bold=True)
    s.row("cost_marketplace", "Marketplace costs (all lines tagged marketplace)", "€",
          yearly(lambda c, i: "=" + costs("marketplace", c)))
    s.row("ebitda_marketplace", "Marketplace EBITDA", "€", yearly(
        lambda c, i: f"={R('rev_mkt', c)}-{R('cost_marketplace', c)}"), bold=True)
    BOOK.rows[(t, "_cost_first")], BOOK.rows[(t, "_cost_last")] = cost_first, cost_last


# ---- Cash flow ---------------------------------------------------------------------------------------------------------
def build_cash():
    s = BOOK.sheet("Cash flow", "From EBITDA to cash: tax, receivables, equipment and the funding rounds.")
    t = s.title
    R = lambda key, c: f"{c}{BOOK.rows[(t, key)]}"  # noqa: E731
    p = lambda key, c: ref("P&L", key, c, here=t)  # noqa: E731
    s.section("Cash flow")
    s.row("ebitda", "EBITDA", "€", yearly(lambda c, i: f"={p('ebitda', c)}"))
    s.row("tax", "Income taxes paid", "€", yearly(lambda c, i: f"=-{p('tax', c)}"),
          notes=["Paid in the same year (prepayments)"])
    s.row("receivables", "Receivables at year end (memo)", "€", yearly(
        lambda c, i: f"={p('revenue', c)}*{a('RECEIVABLE_DAYS')}/365"), notes=["Revenue × payment days / 365"])
    rec = BOOK.rows[(t, "receivables")]
    s.row("d_receivables", "Increase in receivables", "€",
          [f"=-C{rec}", *[f"=-({c}{rec}-{q}{rec})" for q, c in zip(YC, YC[1:])]])
    s.row("operating_cf", "Operating cash flow", "€", yearly(
        lambda c, i: f"={R('ebitda', c)}+{R('tax', c)}+{R('d_receivables', c)}"), bold=True, top_line=True)
    s.row("capex", "Equipment bought (memo)", "€", yearly(lambda c, i: f"={ref('Team', 'capex', c, here=t)}"))
    s.row("capex_out", "Equipment bought", "€", yearly(lambda c, i: f"=-{R('capex', c)}"))
    s.row("free_cf", "Free cash flow", "€", yearly(lambda c, i: f"={R('operating_cf', c)}+{R('capex_out', c)}"),
          bold=True)
    s.row("equity", "Equity raised", "€", [f"={a('ASK')}+{a('SEED', 'C')}", *[f"={a('SEED', c)}" for c in YC[1:]]],
          notes=["2027: the pre-seed round; later rounds on Assumptions (none in the base plan)"])
    s.row("cash_open", "Cash at start of year", "€", ["=0", *[f"={q}{s.r + 1}" for q in YC[:-1]]])
    s.row("cash_close", "Cash at end of year", "€", yearly(
        lambda c, i: f"={R('cash_open', c)}+{R('free_cf', c)}+{R('equity', c)}"), bold=True, top_line=True)
    assert BOOK.rows[(t, "cash_close")] == BOOK.rows[(t, "cash_open")] + 1
    s.row("cash_min", "Lowest year-end cash, 2027–2031", "€",
          f"=MIN({rng(t, 'cash_close', here=t)})", bold=True)


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
    s.row("senior_hour", "Senior cost per review hour", "€/h", f"={ref('Team', 'loaded_senior_valuers', 'C')}/{a('REVIEW_HOURS')}",
          notes=["Employer cost of a senior / review hours a year"])
    s.row("senior", "Senior review", "€ per valuation", f"={R('hours')}*{R('senior_hour')}")
    s.row("data", "Data & documents", "€ per valuation",
          f"={a('DATA_COST')}+{a('COMPARABLES_FEE')}*{a('COMPARABLES_SHARE')}",
          notes=["Official documents + share of valuations × register extract"])
    s.row("hosting", "Hosting & e-signature", "€ per valuation", f"={a('HOSTING_COST')}")
    s.row("ai", "AI", "€ per valuation", f"={a('AI_COST')}")
    s.row("ins_pay", "Insurance & payments", "€ per valuation",
          f"={a('INSURANCE_PER_VALUATION')}+{a('PAYMENTS_RATE')}*{R('price')}")
    s.row("cost", "Direct cost", "€ per valuation", f"=SUM({R('senior')}:{R('ins_pay')})", bold=True, top_line=True)
    s.row("gp", "Gross profit", "€ per valuation", f"={R('price')}-{R('cost')}", bold=True)
    s.row("gm", "Gross margin", "%", f"=IF({R('price')}=0,0,{R('gp')}/{R('price')})", bold=True)

    s.section("One closed deal (2031)")
    s.row("fee", "Deal fee", "€ per deal", f"={a('AVG_TICKET')}*{a('TAKE_RATE')}")
    s.row("deal_var", "Deal costs (KYC, data room, contracts)", "€ per deal", f"={a('DEAL_VARIABLE')}")
    s.row("deal_team", "Deal team per deal", "€ per deal",
          f"=IF({ref('Revenue', 'deals', 'G')}=0,0,{ref('Team', 'cost_deal_team', 'G')}/{ref('Revenue', 'deals', 'G')})")
    s.row("listing", "Free owner-listing valuations per deal", "€ per deal",
          f"=IF({ref('Revenue', 'deals', 'G')}=0,0,{ref('Revenue', 'n_owner_listings', 'G')}*({R('cost')}-{a('PAYMENTS_RATE')}*{R('price')})/{ref('Revenue', 'deals', 'G')})",
          notes=["Listings × direct cost of a valuation (no payment fee) / deals"])
    s.row("deal_contrib", "Contribution per deal", "€ per deal",
          f"={R('fee')}-{R('deal_var')}-{R('deal_team')}-{R('listing')}", bold=True, top_line=True)

    s.section("Classic valuation, for comparison")
    s.row("classic_hours", "Expert hours per classic report (BVS fee at €1m / court rate)", "h",
          f"={a('BVS_FEE_1M')}/{a('COURT_RATE')}")
    s.row("classic_low", "Classic reports per valuer a year (at those hours)", "reports",
          f"={a('REVIEW_HOURS')}/{R('classic_hours')}")
    s.row("classic_high", "Classic reports per valuer a year (fast, 20 h)", "reports",
          f"={a('REVIEW_HOURS')}/{a('CLASSIC_HOURS_LOW')}")
    s.row("valuers_low", "Classic valuers needed for the 2031 volume (fast case)", "valuers",
          f"={ref('Revenue', 'n_total', 'G')}/{R('classic_high')}")
    s.row("valuers_high", "Classic valuers needed for the 2031 volume (BVS case)", "valuers",
          f"={ref('Revenue', 'n_total', 'G')}/{R('classic_low')}")
    s.row("censio_per_senior", "Censio: valuations per senior in 2031", "per senior", f"={ref('Revenue', 'per_senior', 'G')}")


def build_funds():
    s = BOOK.sheet("Use of funds", "Where the pre-seed round goes: all spending 2027–28 by purpose.", years=False)
    t = s.title
    s.header(["", "Unit", "2027–28", "Share", "", "", "", "Notes"])
    pnl_first, pnl_last = BOOK.rows[("P&L", "_cost_first")], BOOK.rows[("P&L", "_cost_last")]

    def bucket_sum(tag):
        return "+".join(f"SUMIFS('P&L'!{c}${pnl_first}:{c}${pnl_last},'P&L'!$I${pnl_first}:$I${pnl_last},\"{tag}\")"
                        for c in ("C", "D"))

    s.section("Spending 2027–28 by purpose (founders split by role)")
    names = {"Build": "Build: product & AI", "Deliver": "Deliver: senior valuers", "Sell": "Sell: sales & partnerships",
             "Run": "Run: operations, legal & compliance"}
    s.row("founders", "Founders' cost 2027–28 (memo)", "€", f"={bucket_sum('Founders')}")
    rows = []
    for tag, name in names.items():
        split = f"+{a('founder_split_' + slug(tag))}*$C${BOOK.rows[(t, 'founders')]}" if tag in M.FOUNDER_SPLIT else ""
        rows.append(s.row(f"b_{slug(tag)}", name, "€", f"={bucket_sum(tag)}{split}"))
    s.row("b_total", "Total spending 2027–28", "€", f"=SUM(C{rows[0]}:C{rows[-1]})", bold=True, top_line=True)
    total = BOOK.rows[(t, "b_total")]
    for r in rows:
        cell = s.ws[f"D{r}"]
        cell.value = f"=IF($C${total}=0,0,C{r}/$C${total})"
        cell.number_format = PCT
        cell.font = font()
    s.row("gross", "Check: cost of sales + operating costs 2027–28", "€",
          f"='P&L'!C{BOOK.rows[('P&L', 'cogs')]}+'P&L'!D{BOOK.rows[('P&L', 'cogs')]}"
          f"+'P&L'!C{BOOK.rows[('P&L', 'opex')]}+'P&L'!D{BOOK.rows[('P&L', 'opex')]}")

    s.section("How far the round goes")
    R = lambda key: f"$C${BOOK.rows[(t, key)]}"  # noqa: E731
    s.row("ask", "Pre-seed round", "€", f"={a('ASK')}")
    s.row("net_burn", "Net burn 2027–28 (negative EBITDA)", "€",
          f"=-('P&L'!C{BOOK.rows[('P&L', 'ebitda')]}+'P&L'!D{BOOK.rows[('P&L', 'ebitda')]})")
    s.row("working_capital", "Working capital (receivables end 2028)", "€", f"={ref('Cash flow', 'receivables', 'D')}")
    s.row("capex", "Equipment 2027–28", "€",
          f"={ref('Cash flow', 'capex', 'C')}+{ref('Cash flow', 'capex', 'D')}")
    s.row("buffer", "Reserve left from the round", "€",
          f"={R('ask')}-{R('net_burn')}-{R('working_capital')}-{R('capex')}", bold=True, top_line=True)
    s.row("gross27", "Spending 2027", "€",
          f"='P&L'!C{BOOK.rows[('P&L', 'cogs')]}+'P&L'!C{BOOK.rows[('P&L', 'opex')]}")
    s.row("gross28", "Spending 2028", "€",
          f"='P&L'!D{BOOK.rows[('P&L', 'cogs')]}+'P&L'!D{BOOK.rows[('P&L', 'opex')]}")
    s.row("runway", "Runway at zero revenue", "months",
          f"=12+({R('ask')}-{R('gross27')}-{ref('Cash flow', 'capex', 'C')})/({R('gross28')}/12)",
          notes=["12 months of 2027 spending, then 2028 spending per month"])
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
    s.row("som_share", "Share of SAM valuations", "%",
          f"={a('vol_investors_multi_family', 'G')}/{R('sam_valuations')}")
    s.section("The deal engine (deal fee on transaction volume)")
    s.row("deal_tam", "Europe: investment volume × deal fee", "€", f"={a('EU_INVESTMENT_2025')}*{a('TAKE_RATE')}",
          bold=True)
    s.row("deal_sam", "Germany: income-property turnover × deal fee + valuation TAM", "€",
          f"=({a('DE_MFH_TURNOVER_2025F')}+{a('DE_COMMERCIAL_TURNOVER_2025F')})*{a('TAKE_RATE')}+{R('tam')}", bold=True)


def build_downside():
    s = BOOK.sheet("Downside", "Valuation business only: fewer valuations, lower prices, more senior hours. "
                   "Seniors are hired to need; other costs stay as planned.")
    t = s.title
    R = lambda key, c: f"{c}{BOOK.rows[(t, key)]}"  # noqa: E731
    paid = M.PAID_SEGMENTS
    s.section("Volume and revenue")
    s.row("n", "Paid valuations", "valuations", yearly(lambda c, i: "=(" + "+".join(
        a("vol_" + slug(k), c) for k in paid) + f")*{a('DOWNSIDE_VOLUME')}"))
    s.row("revenue", "Revenue", "€", yearly(lambda c, i: "=(" + "+".join(
        f"{a('vol_' + slug(k), c)}*{a('price_' + slug(k), c)}" for k in paid)
        + f")*{a('DOWNSIDE_VOLUME')}*{a('DOWNSIDE_PRICE')}"))

    def hours(c):
        return "+".join(f"{a('vol_' + slug(k), c)}*"
                        + (a("DOWNSIDE_HOURS") if k.startswith("Investors") else a("hours_" + slug(k)))
                        for k in paid)

    s.row("hours", "Senior hours needed", "h", yearly(lambda c, i: f"=({hours(c)})*{a('DOWNSIDE_VOLUME')}"),
          fmt=NUM, notes=["Investor valuations at the downside hours; other segments as planned"])
    s.row("seniors", "Seniors needed (average)", "heads", yearly(
        lambda c, i: f"=MAX({a('DOWNSIDE_MIN_SENIORS')},{R('hours', c)}/({a('REVIEW_HOURS')}*{a('MAX_UTILISATION')}))"))
    s.section("Costs and EBITDA")
    per_valuation = (f"({a('AI_COST')}+{a('DATA_COST')}+{a('COMPARABLES_FEE')}*{a('COMPARABLES_SHARE')}"
                     f"+{a('HOSTING_COST')}+{a('INSURANCE_PER_VALUATION')})")

    def site(c):
        return "+".join(f"{a('vol_' + slug(k), c)}*{a('site_' + slug(k))}" for k in M.SITE_VISIT_COST)

    s.row("cogs", "Cost of sales", "€", yearly(
        lambda c, i: f"={R('seniors', c)}*{ref('Team', 'loaded_senior_valuers', c)}+{R('n', c)}*{per_valuation}"
                     f"+({site(c)})*{a('DOWNSIDE_VOLUME')}+{R('revenue', c)}*{a('PAYMENTS_RATE')}"),
          notes=["Seniors + cost per valuation + travel + payments"])
    of, ol = BOOK.rows[("P&L", "_opex_first")], BOOK.rows[("P&L", "_opex_last")]
    s.row("opex", "Operating costs (valuation business, as planned)", "€", yearly(
        lambda c, i: f"=SUMIFS('P&L'!{c}${of}:{c}${ol},'P&L'!$H${of}:$H${ol},\"valuation\")"),
          notes=["P&L operating-cost lines tagged valuation"])
    s.row("ebitda", "EBITDA", "€", yearly(lambda c, i: f"={R('revenue', c)}-{R('cogs', c)}-{R('opex', c)}"),
          bold=True, top_line=True)
    s.row("cum", "Cumulative EBITDA", "€", [f"=C{s.r - 1}", *[f"={q}{s.r}+{c}{s.r - 1}" for q, c in zip(YC, YC[1:])]])
    s.row("usable", "Usable cash from the round (after equipment and receivables)", "€",
          f"={ref('Use of funds', 'ask')}-{ref('Use of funds', 'capex')}-{ref('Use of funds', 'working_capital')}")
    usable = ref(t, "usable", here=t)
    s.row("short", "Out of cash this year? (1 = yes)", "", yearly(lambda c, i: f"=IF({R('cum', c)}<-{usable},1,0)"),
          fmt=NUM)
    s.row("profit_flag", "EBITDA positive? (1 = yes)", "", yearly(lambda c, i: f"=IF({R('ebitda', c)}>0,1,0)"), fmt=NUM)
    s.row("out_of_cash_year", "First year out of cash", "",
          f"=IFERROR(INDEX($C$4:$G$4,MATCH(1,{rng(t, 'short', here=t)},0)),\"never\")", bold=True, fmt="General")
    s.row("breakeven_year", "First EBITDA-positive year", "",
          f"=IFERROR(INDEX($C$4:$G$4,MATCH(1,{rng(t, 'profit_flag', here=t)},0)),\"never\")", fmt="General")
    s.row("extra", "Extra cash needed", "€", f"=MAX(0,-MIN(0,MIN({rng(t, 'cum', here=t)}))-{usable})", bold=True)
    s.section("Same downside without the DACH expansion")
    s.row("ebitda_nd", "EBITDA without DACH expansion", "€", yearly(
        lambda c, i: f"={R('ebitda', c)}+{a('ns_dach_expansion', c)}"))
    s.row("cum_nd", "Cumulative EBITDA", "€",
          [f"=C{s.r - 1}", *[f"={q}{s.r}+{c}{s.r - 1}" for q, c in zip(YC, YC[1:])]])
    s.row("extra_nd", "Extra cash needed", "€", f"=MAX(0,-MIN(0,MIN({rng(t, 'cum_nd', here=t)}))-{usable})",
          bold=True)


def build_peers():
    s = BOOK.sheet("Peer check", "Is the plan realistic? Censio in 2031 next to listed peers, and what has to be "
                   "true.", years=False, extra=[("What it shows", 90)])
    t = s.title
    s.header(["", "Unit", "Value", "", "", "", "", "What it shows"])
    p = lambda key, c="G": ref("P&L", key, c)  # noqa: E731
    pk = lambda name: a("peer_" + slug(name))  # noqa: E731
    s.section("EBITDA margin: Censio 2031 next to peers")
    s.row("censio", "Censio 2031, company", "%", f"={p('ebitda_margin')}", bold=True,
          notes=["Valuations plus the second year of the marketplace"])
    s.row("censio_val", "Censio 2031, valuation business", "%",
          f"=IF({p('rev_valuation')}=0,0,{p('ebitda_valuation')}/{p('rev_valuation')})",
          notes=["AI prepares, seniors sign: far above services firms, far below portals"])
    s.row("censio_mkt", "Censio 2031, marketplace", "%",
          f"=IF({p('rev_mkt')}=0,0,{p('ebitda_marketplace')}/{p('rev_mkt')})",
          notes=["Deal fees minus deal team, deal costs, marketplace tech and marketing"])
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

    s.section("Marketplace reality check (2031)")
    deals, team_avg = ref("Revenue", "deals", "G"), ref("Team", "avg_deal_team", "G")
    s.row("deals", "Deals closed on Censio", "deals", f"={deals}", bold=True)
    s.row("deal_share", "Share of German income-property sales (2024 count)", "%",
          f"={deals}/({a('MFH_SALES_2024')}+{a('COMMERCIAL_SALES_2024')})")
    s.row("volume_share", "Share of German income-property turnover (2025F)", "%",
          f"={ref('Revenue', 'gtv', 'G')}/({a('DE_MFH_TURNOVER_2025F')}+{a('DE_COMMERCIAL_TURNOVER_2025F')})")
    s.row("per_manager_avg", "Deals per deal manager (average heads)", "deals",
          f"=IF({team_avg}=0,0,{deals}/{team_avg})", notes=["The plan's most ambitious number: AI does the paperwork"])
    s.row("per_manager_ye", "Deals per deal manager (year-end heads)", "deals",
          f"=IF({ref('Team', 'ye_deal_team', 'G')}=0,0,{deals}/{ref('Team', 'ye_deal_team', 'G')})")
    s.row(None, "US agents: median transactions a year (NAR)", "deals", f"={pk('NAR transactions per agent')}")
    s.row(None, "Crexi US online auctions, annualised record quarter", "deals",
          f"={pk('Crexi auctions per quarter')}*4")
    s.row("fee_per_manager", "Censio: deal fees per deal manager (average heads)", "€",
          f"=IF({team_avg}=0,0,{ref('Revenue', 'rev_mkt', 'G')}/{team_avg})")
    s.row(None, "Engel & Völkers: commission per professional", "€", f"={pk('E&V commission per professional')}")

    s.section("What has to be true")
    for line in ("1. A senior checks and signs an AI-prepared valuation in about 2 hours (classic: ~35 hours).",
                 "2. Investors pay €2,000 for a signed desktop valuation in 48 hours.",
                 "3. From 2030, owners list with a signed value and ~1,500 deals a year close on Censio by 2031.",
                 "4. AI-assisted deal managers close far more deals each than brokers do today.",
                 "Change the levers on Assumptions to see the plan without any of these."):
        s.note(line, color=BLACK)


# ---- Deck tie-out, checks, sources, cover ------------------------------------------------------------------------------
def tie_rows():
    """(slide, what the deck says, model cell, scale, digits, deck value) for every model figure in the deck."""
    n = C.NUM
    p, last = n["plan"], n["plan"]["2031"]
    rows = [
        ("Market", "Deal-engine TAM (Europe)", ref("Market", "deal_tam"), 1e9, 1, n["market"]["deal_tam_eur"], C.FMT["deal_tam"]),
        ("Market", "Deal-engine SAM (Germany)", ref("Market", "deal_sam"), 1e9, 1, n["market"]["deal_sam_eur"], C.FMT["deal_sam"]),
        ("Market", "Valuation SAM", ref("Market", "sam"), 1e6, 0, n["market"]["sam_eur"], C.FMT["sam"]),
        ("Market / Financials", "Revenue 2031", ref("P&L", "revenue", "G"), 1e6, 1, last["revenue"], C.FMT["revenue_last"]),
        ("Market", "Valuation revenue 2031", ref("Revenue", "rev_val", "G"), 1e6, 1, last["valuation_revenue"],
         C.FMT["valuation_revenue_last"]),
        ("Market", "Deal-fee revenue 2031", ref("Revenue", "rev_mkt", "G"), 1e6, 1, last["marketplace_revenue"],
         C.FMT["marketplace_revenue_last"]),
        ("Go-to-market", "Price per valuation", ref("Unit economics", "price"), 1, 0, n["unit"]["price"], C.FMT["price"]),
        ("Go-to-market", "Deal fee", ref("Assumptions", "TAKE_RATE"), 0.01, 1, n["market"]["take_rate"], C.FMT["take_rate"]),
    ]
    for i, y in enumerate(M.YEARS):
        rows.append(("Go-to-market / Financials", f"Revenue {y}", ref("P&L", "revenue", YC[i]), 1e6, 1,
                     p[str(y)]["revenue"], C.FMT["revenue"][i]))
    for i, y in enumerate(M.YEARS):
        rows.append(("Financials", f"Signed valuations {y}", ref("Revenue", "n_total", YC[i]), 1, 0,
                     p[str(y)]["valuations"], C.FMT["valuations"][i]))
        rows.append(("Financials", f"People at year end {y}", ref("Team", "ye_total", YC[i]), 1, 0,
                     p[str(y)]["headcount_ye"], C.FMT["people"][i]))
    rows += [
        ("Financials", "EBITDA 2031", ref("P&L", "ebitda", "G"), 1e6, 1, last["ebitda"], C.FMT["ebitda_last"]),
        ("Financials", "EBITDA margin 2031", ref("P&L", "ebitda_margin", "G"), 0.01, 0, last["ebitda_margin"],
         C.FMT["ebitda_margin_last"]),
        ("Financials", "Gross profit per valuation", ref("Unit economics", "gp"), 1, 0,
         n["unit"]["price"] - n["unit"]["cost"], C.FMT["gross_profit"]),
        ("Financials", "Gross margin per valuation", ref("Unit economics", "gm"), 0.01, 0, n["unit"]["gross_margin"],
         C.FMT["gross_margin"]),
        ("Financials", "Downside: extra cash needed", ref("Downside", "extra"), 1e6, 1,
         n["downside"]["extra_cash_needed"], C.FMT["downside_extra"]),
        ("Financials", "Downside without DACH: extra cash", ref("Downside", "extra_nd"), 1e6, 1,
         n["downside"]["without_expansion"]["extra_cash_needed"], C.FMT["downside_extra_no_dach"]),
        ("Team", "Valuations per senior 2031", ref("Revenue", "per_senior", "G"), 1, 0,
         n["team"]["valuations_per_senior_2031"], C.FMT["per_senior"]),
        ("Team", "Classic valuers needed (fast case)", ref("Unit economics", "valuers_low"), 1, 0,
         n["team"]["classic_valuers_low"], C.FMT["classic_valuers_low"]),
        ("Team", "Classic valuers needed (BVS case)", ref("Unit economics", "valuers_high"), 1, 0,
         n["team"]["classic_valuers_high"], C.FMT["classic_valuers_high"]),
        ("Ask", "Pre-seed round", ref("Use of funds", "ask"), 1e6, 1, n["proceeds"]["ask"], C.FMT["ask"]),
        ("Ask", "Spending 2027–28", ref("Use of funds", "b_total"), 1e6, 1, n["proceeds"]["bucket_total"],
         C.FMT["spend_2027_28"]),
        ("Ask", "Revenue 2027–28", ref("Use of funds", "revenue_2027_28"), 1e6, 1,
         p["2027"]["revenue"] + p["2028"]["revenue"], C.FMT["revenue_2027_28"]),
        ("Ask", "Reserve left from the round", ref("Use of funds", "buffer"), 1e6, 1, n["proceeds"]["buffer"],
         C.FMT["buffer"]),
        ("Ask", "Runway at zero revenue", ref("Use of funds", "runway"), 1, 0,
         n["proceeds"]["runway_months_zero_revenue"], C.FMT["runway"]),
        ("Ask", "Signed valuations 2027–28", ref("Use of funds", "valuations_2027_28"), 1, 0,
         n["proceeds"]["valuations_2027_28"], C.FMT["valuations_2027_28"]),
    ]
    return rows


def build_tieout():
    s = BOOK.sheet("Deck tie-out", "Every model figure on the slides, linked to the cell it comes from.", years=False)
    s.ws.column_dimensions["A"].width = 24
    s.ws.column_dimensions["B"].width = 38
    for col, width in zip("CDEFGH", (16, 12, 14, 14, 14, 10)):
        s.ws.column_dimensions[col].width = width
    s.r = 4
    heads = ["Slide", "Figure", "Model value", "Shown in", "Model, rounded", "Deck shows", "Deck value", "Match"]
    for k, text in enumerate(heads):
        cell = s.ws.cell(row=s.r, column=k + 1, value=text)
        cell.font = font("FFFFFF", True)
        cell.fill = PatternFill("solid", fgColor=BRAND)
    s.ws.freeze_panes = "A5"
    s.r += 1
    first = s.r
    unit_name = {1e9: "€bn", 1e6: "€m", 1: "units", 0.01: "%"}
    for slide, label, cell_ref, scale, digits, value, shown in tie_rows():
        r = s.r
        s.ws[f"A{r}"], s.ws[f"B{r}"] = slide, label
        s.ws[f"C{r}"] = f"={cell_ref}"
        s.ws[f"C{r}"].number_format = '#,##0.0000;(#,##0.0000)'
        s.ws[f"C{r}"].font = font(GREEN)
        s.ws[f"D{r}"] = unit_name[scale]
        s.ws[f"E{r}"] = f"=ROUND(C{r}/{scale},{digits})"
        s.ws[f"F{r}"] = shown
        s.ws[f"G{r}"] = round(value / scale, digits)
        s.ws[f"G{r}"].font = font(BLUE)
        s.ws[f"H{r}"] = f"=ABS(E{r}-G{r})<0.0001"
        for col in "ABDF":
            s.ws[f"{col}{r}"].font = font(INK2 if col in "AD" else BLACK)
        s.r += 1
    BOOK.rows[("Deck tie-out", "_first")], BOOK.rows[("Deck tie-out", "_last")] = first, s.r - 1
    s.r += 1
    s.note("Deck value = the number printed on the slide (from numbers.json). Match = the workbook, rounded the way "
           "the slide rounds it, gives the same number.")


def build_checks():
    s = BOOK.sheet("Checks", "Integrity checks. All must be TRUE.", years=False)
    s.ws.column_dimensions["A"].width = 70
    s.ws.column_dimensions["C"].width = 12
    s.header(["Check", "", "Result", "", "", "", "", "How"])
    pnl, rev, cash, team = "P&L", "Revenue", "Cash flow", "Team"
    tie_f, tie_l = BOOK.rows[("Deck tie-out", "_first")], BOOK.rows[("Deck tie-out", "_last")]
    checks = [
        ("Revenue sheet total equals P&L revenue, every year",
         f"=SUMPRODUCT(ABS({rng(rev, 'rev_total')}-{rng(pnl, 'revenue')}))<1", "sum of differences < €1"),
        ("Segment EBITDA (valuation + marketplace) equals EBITDA, every year",
         f"=SUMPRODUCT(ABS({rng(pnl, 'ebitda_valuation')}+{rng(pnl, 'ebitda_marketplace')}-{rng(pnl, 'ebitda')}))<1",
         "every cost line carries an area tag"),
        ("Senior utilisation stays at or below the plan cap, every year",
         f"=MAX({rng(rev, 'util')})<={a('MAX_UTILISATION')}+0.000001", "Revenue sheet vs Assumptions"),
        ("Cash never falls below zero (base plan)", f"={ref(cash, 'cash_min')}>=0", "Cash flow sheet"),
        ("Use-of-funds buckets add up to all spending 2027–28",
         f"=ABS({ref('Use of funds', 'b_total')}-{ref('Use of funds', 'gross')})<1", "Use of funds sheet"),
        ("Founders' time split adds up to 100%",
         "=ABS(" + "+".join(a('founder_split_' + slug(k)) for k in M.FOUNDER_SPLIT) + "-1)<0.000001", "Assumptions"),
        ("Loss carry-forwards are never negative",
         f"=AND(MIN({rng(pnl, 'cit_close')})>=-0.01,MIN({rng(pnl, 'trade_close')})>=-0.01)", "P&L tax block"),
        ("Cash flow: closing cash = opening + free cash flow + equity, every year",
         f"=SUMPRODUCT(ABS({rng(cash, 'cash_close')}-{rng(cash, 'cash_open')}-{rng(cash, 'free_cf')}-{rng(cash, 'equity')}))<1",
         "Cash flow sheet"),
        ("Headcount at year end equals the sum of the roles, every year",
         f"=SUMPRODUCT(ABS({rng(team, 'ye_total')}-(" + "+".join(rng(team, 'ye_' + slug(r)) for r in M.ROLES) + ")))<0.001",
         "Team sheet"),
        ("Every model figure in the deck matches the workbook",
         f"=COUNTIF('Deck tie-out'!H{tie_f}:H{tie_l},FALSE)=0", "Deck tie-out sheet"),
        ("Scenario levers are at 1.00× (the deck shows the base plan)",
         "=AND(" + ",".join(f"{a(k)}=1" for k in ("LEVER_VOLUME", "LEVER_PRICE", "LEVER_HOURS", "LEVER_DEALS")) + ")",
         "change the levers to test scenarios; the deck tie-out will then show differences"),
    ]
    first = s.r
    for label, formula, how in checks:
        s.row(None, label, "", formula, fmt="General", notes=[how])
    s.row("all", "All checks pass", "", f"=AND(C{first}:C{s.r - 1})", fmt="General", bold=True, top_line=True)


def build_sources():
    s = BOOK.sheet("Sources", "Public sources behind the inputs (kind S and B on Assumptions). Accessed Nov 2026.",
                   years=False)
    ws = s.ws
    widths = {"A": 14, "B": 46, "C": 52, "D": 38, "E": 70}
    for col, width in widths.items():
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
    for col, width in zip("ABCDEFGH", (40, 16, 14, 14, 14, 14, 14, 30)):
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
         "comes from (Sources).", False),
        ("Revenue = valuations × price + deals × average deal size × deal fee. Costs = people (gross salary + "
         "employer on-costs) + cost per valuation and per deal + overhead per head + other operating costs.", False),
        ("Deck tie-out links every model figure on the slides to its cell; Checks must all be TRUE.", False),
        ("Colours: blue = input · black = formula · green = link to another sheet · yellow = scenario lever.", False),
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
    ws[f"B{r}"].font = font(GREEN, True)
    r += 2
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
    ws.add_chart(chart, f"A{r + 2}")
    r += 18
    ws[f"A{r}"] = "Sheets"
    ws[f"A{r}"].font = font(BRAND, True)
    r += 1
    for name, what in [
        ("Assumptions", "every input, its kind and source"), ("Revenue", "volumes, prices, senior capacity, deal fees"),
        ("Team", "heads, salaries, hires, overhead per head"), ("P&L", "revenue to net income, tax, segment view"),
        ("Cash flow", "EBITDA to cash, funding, equipment"), ("Unit economics", "one valuation, one deal"),
        ("Use of funds", "the pre-seed round 2027–28"), ("Market", "TAM, SAM, SOM, deal engine"),
        ("Downside", "valuation business under stress"), ("Peer check", "margins and volumes vs peers"),
        ("Deck tie-out", "every slide figure → cell"),
        ("Checks", "integrity checks"), ("Sources", "public sources behind the inputs")]:
        ws[f"A{r}"], ws[f"B{r}"] = name, what
        ws[f"A{r}"].font, ws[f"B{r}"].font = font(bold=True), font(INK2)
        ws[f"A{r}"].hyperlink = f"#'{name}'!A1"
        r += 1


def finish():
    for ws in BOOK.wb.worksheets:
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
        ws.sheet_properties.tabColor = BRAND if ws.title in ("Cover", "Assumptions") else None
    BOOK.wb.active = 0


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
