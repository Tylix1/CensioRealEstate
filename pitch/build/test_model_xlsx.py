"""The Excel model recomputes model.py with live formulas: same inputs, same results.

Builds the workbook, lets LibreOffice calculate every formula, and compares the results with model.py line by line.
Needs LibreOffice (soffice).
"""

import re
import shutil
import subprocess

import pytest
from openpyxl import load_workbook

import build_model_xlsx as B
import model as M
from model_sources import DOC, SOURCES

pytestmark = pytest.mark.skipif(not shutil.which("soffice"), reason="needs LibreOffice")
YC = B.YC


def recalc(src, outdir):
    subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", str(outdir), str(src)],
                   check=True, capture_output=True, timeout=180)
    return outdir / src.name


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    d = tmp_path_factory.mktemp("model")
    raw = B.build(d / "Censio-Financial-Model.xlsx")
    rows = dict(B.BOOK.rows)
    (d / "calc").mkdir()
    calc = recalc(raw, d / "calc")
    return {"raw": raw, "rows": rows, "values": load_workbook(calc, data_only=True),
            "formulas": load_workbook(raw)}


@pytest.fixture(scope="module")
def plan():
    return M.plan()


def cell(built, sheet, key, col="C"):
    return built["values"][sheet][f"{col}{built['rows'][(sheet, key)]}"].value


def series(built, sheet, key):
    return [cell(built, sheet, key, c) for c in YC]


def approx(values):
    return pytest.approx(values, rel=1e-9, abs=1e-6)


def test_no_formula_errors(built):
    bad = []
    for ws in built["values"].worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and re.match(r"^(#[A-Z/0!?]+|Err:\d+)", c.value):
                    bad.append(f"{ws.title}!{c.coordinate} {c.value}")
    assert not bad, bad[:20]


def test_revenue_and_capacity(built, plan):
    p = [plan[y] for y in M.YEARS]
    assert series(built, "Revenue", "n_total") == approx([r["valuations"] for r in p])
    assert series(built, "Revenue", "deals") == approx([r["deals"] for r in p])
    assert series(built, "Revenue", "rev_val") == approx([r["valuation_revenue"] for r in p])
    assert series(built, "Revenue", "rev_mkt") == approx([r["marketplace_revenue"] for r in p])
    for seg in M.SEGMENTS:
        assert series(built, "Revenue", f"rev_{B.slug(seg)}") == approx([r["segment_revenue"][seg] for r in p])
    assert series(built, "Revenue", "hours") == approx([r["review_hours"] for r in p])
    assert series(built, "Revenue", "util") == approx([r["senior_utilisation"] for r in p])
    assert series(built, "Revenue", "per_senior") == approx([r["valuations_per_senior"] for r in p])


def test_pnl_line_by_line(built, plan):
    p = [plan[y] for y in M.YEARS]
    for line in M.cost_lines():
        assert series(built, "P&L", "c_" + B.slug(line["name"])) == approx(line["values"]), line["name"]
    for key, name in [("revenue", "revenue"), ("cogs", "cogs"), ("gross_profit", "gross_profit"),
                      ("gross_margin", "gross_margin"), ("opex", "opex"), ("ebitda", "ebitda"),
                      ("ebitda_margin", "ebitda_margin"), ("depreciation", "depreciation"), ("ebit", "ebit"),
                      ("cit_used", "cit_loss_used"), ("cit_close", "cit_loss_carried_forward"),
                      ("trade_used", "trade_loss_used"), ("trade_close", "trade_loss_carried_forward"),
                      ("corporate_tax", "corporate_tax"), ("trade_tax", "trade_tax"), ("tax_rate", "tax_rate"),
                      ("tax", "tax"), ("net_income", "net_income"), ("ebitda_valuation", "valuation_ebitda"),
                      ("ebitda_marketplace", "marketplace_ebitda")]:
        assert series(built, "P&L", key) == approx([r[name] for r in p]), key


def test_team_and_cash(built, plan):
    p = [plan[y] for y in M.YEARS]
    assert series(built, "Team", "ye_total") == approx([r["headcount_ye"] for r in p])
    assert series(built, "Team", "avg_total") == approx([r["headcount_avg"] for r in p])
    assert series(built, "Team", "hires_all") == approx([r["hires"] for r in p])
    for key, name in [("receivables", "receivables"), ("operating_cf", "operating_cash_flow"), ("capex", "capex"),
                      ("free_cf", "free_cash_flow"), ("equity", "equity_in"), ("cash_close", "cash_end")]:
        assert series(built, "Cash flow", key) == approx([r[name] for r in p]), key


def test_unit_market_funds_downside(built, plan):
    n = M.build_numbers()
    u = n["unit"]
    assert cell(built, "Unit economics", "price") == approx(u["price"])
    assert cell(built, "Unit economics", "senior") == approx(u["cost_lines"]["Senior review (2 h)"])
    assert cell(built, "Unit economics", "cost") == approx(u["cost"])
    assert cell(built, "Unit economics", "gm") == approx(u["gross_margin"])
    assert cell(built, "Unit economics", "valuers_low") == approx(n["team"]["classic_valuers_low"])
    assert cell(built, "Unit economics", "valuers_high") == approx(n["team"]["classic_valuers_high"])
    m = n["market"]
    for key, name in [("tam", "tam_eur"), ("sam", "sam_eur"), ("som", "som_2031_eur"), ("deal_tam", "deal_tam_eur"),
                      ("deal_sam", "deal_sam_eur")]:
        assert cell(built, "Market", key) == approx(m[name]), key
    pr = n["proceeds"]
    names = {"Build": "Build: product & AI", "Deliver": "Deliver: senior valuers", "Sell": "Sell: sales & partnerships",
             "Run": "Run: operations, legal & compliance"}
    for tag, name in names.items():
        assert cell(built, "Use of funds", "b_" + B.slug(tag)) == approx(pr["bucket_eur"][name]), tag
    for key in ("buffer", "working_capital", "capex", "net_burn"):
        assert cell(built, "Use of funds", key) == approx(pr[key if key != "net_burn" else "net_burn_2027_28"]), key
    assert cell(built, "Use of funds", "runway") == approx(pr["runway_months_zero_revenue"])
    d = n["downside"]
    assert series(built, "Downside", "ebitda") == approx([d["years"][y]["ebitda"] for y in M.YEARS])
    assert cell(built, "Downside", "extra") == approx(d["extra_cash_needed"])
    assert cell(built, "Downside", "extra_nd") == approx(d["without_expansion"]["extra_cash_needed"])
    assert str(cell(built, "Downside", "out_of_cash_year")) == str(d["out_of_cash_year"])


def test_all_checks_pass(built):
    assert cell(built, "Checks", "all") is True
    rows = built["rows"]
    tie = built["values"]["Deck tie-out"]
    misses = [tie[f"B{r}"].value for r in range(rows[("Deck tie-out", "_first")], rows[("Deck tie-out", "_last")] + 1)
              if tie[f"H{r}"].value is not True]
    assert not misses, misses


def test_numbers_live_only_on_assumptions(built):
    """Outside Assumptions every number is a formula (the tie-out's printed deck values are the one exception)."""
    hard = []
    for ws in built["formulas"].worksheets:
        if ws.title in ("Assumptions", "Sources"):
            continue
        for row in ws.iter_rows(min_row=5):
            for c in row:
                if isinstance(c.value, (int, float)) and not isinstance(c.value, bool):
                    if ws.title == "Deck tie-out" and c.column_letter == "G":
                        continue
                    hard.append(f"{ws.title}!{c.coordinate}={c.value}")
    assert not hard, hard[:20]


def test_every_input_is_documented():
    for name, d in DOC.items():
        assert d["label"] and d["unit"] and d["note"] is not None, name
        for sid in d["sources"]:
            assert sid in SOURCES, f"{name}: unknown source {sid}"
        if d["kind"] in ("S", "B"):
            assert d["sources"], f"{name} is kind {d['kind']} but names no source"
    for sid, s in SOURCES.items():
        assert s["title"] and s["use"] and s["figure"], sid


def test_inputs_drive_the_model(built, tmp_path):
    """Change one input (volume lever 1.1x) and the outputs move: the workbook is a live model."""
    wb = load_workbook(built["raw"])
    wb["Assumptions"][f"C{built['rows'][('Assumptions', 'LEVER_VOLUME')]}"] = 1.1
    path = tmp_path / "lever.xlsx"
    wb.save(path)
    (tmp_path / "calc").mkdir()
    out = load_workbook(recalc(path, tmp_path / "calc"), data_only=True)
    r = built["rows"][("Revenue", "n_total")]
    assert out["Revenue"][f"G{r}"].value == pytest.approx(M.plan()[2031]["valuations"] * 1.1)
    checks = out["Checks"][f"C{built['rows'][('Checks', 'all')]}"].value
    assert checks is False  # the lever check and the deck tie-out flag that the deck no longer matches
