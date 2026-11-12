"""Pins the pitch numbers to the approved design (spec appendix B and the plan, Task 1)."""

import pytest

from model import build_numbers


@pytest.fixture(scope="module")
def n():
    return build_numbers()


def test_market(n):
    m = n["market"]
    assert m["income_sales_2024"] == 73_500
    assert m["tam_eur"] == pytest.approx(385.9e6, abs=0.5e6)
    assert m["sam_eur"] == pytest.approx(60.7e6, abs=0.2e6)
    assert m["som_2031_eur"] == 4.8e6
    assert m["som_share_of_sam"] == pytest.approx(0.138, abs=0.002)


def test_bank_valuations_include_a_site_visit():
    from model import SEGMENTS, SITE_VISIT_COST
    assert SEGMENTS["Banks"][2] == 6.0 and SITE_VISIT_COST["Banks"] > 0


def test_unit_economics(n):
    u = n["unit"]
    assert u["price"] == 2000
    assert u["cost"] == pytest.approx(425)
    assert u["gross_margin"] == pytest.approx(0.7875)


def test_plan(n):
    p = n["plan"]
    assert [p[y]["valuations"] for y in p] == [100, 550, 1450, 2950, 4800]
    assert p["2031"]["revenue"] == pytest.approx(9.16e6)
    assert p["2028"]["ebitda"] < 0 < p["2029"]["ebitda"]
    assert n["breakeven_year"] == 2029
    assert [p[y]["headcount_ye"] for y in p] == [7, 9, 13, 20, 28]
    assert p["2031"]["ebitda_margin"] == pytest.approx(0.34, abs=0.01)
    assert all(p[y]["senior_utilisation"] <= 0.85 for y in p)


def test_proceeds(n):
    r = n["proceeds"]
    assert sum(r["buckets"].values()) == pytest.approx(1.0, abs=0.001)
    assert r["bucket_total"] == pytest.approx(r["gross_spend_2027_28"], rel=0.001)
    assert r["runway_months_zero_revenue"] >= 18
    assert r["ask"] >= r["net_burn_2027_28"] + r["working_capital"] + r["capex"]
    assert r["valuations_2027_28"] == 650


def test_team(n):
    t = n["team"]
    assert t["valuations_per_senior_2031"] == pytest.approx(331, abs=1)
    assert 95 <= t["classic_valuers_low"] <= 97
    assert 167 <= t["classic_valuers_high"] <= 169
    assert t["people_2031"] == 28


def test_downside_is_reported(n):
    d = n["downside"]
    assert d["cum_min"] < 0
    assert set(d["years"]) == {2027, 2028, 2029, 2030, 2031}
    # Dropping the DACH expansion (2030-31) covers the downside's extra cash need.
    assert d["extra_cash_needed"] <= 900_000 + 20_000
