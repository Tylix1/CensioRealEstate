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
    assert m["deal_tam_eur"] == pytest.approx(3.615e9, rel=0.001)   # EUR 241bn x 1.5%
    assert m["deal_sam_eur"] == pytest.approx(1.574e9, rel=0.001)   # EUR 79.2bn x 1.5% + valuation TAM


def test_bank_valuations_include_a_site_visit():
    from model import SEGMENTS, SITE_VISIT_COST
    assert SEGMENTS["Banks"][2] == 6.0 and SITE_VISIT_COST["Banks"] > 0


def test_unit_economics(n):
    u = n["unit"]
    assert u["price"] == 2000
    assert u["cost"] == pytest.approx(442.57, abs=0.01)
    assert u["gross_margin"] == pytest.approx(0.7787, abs=0.0001)


def test_plan(n):
    p = n["plan"]
    assert [p[y]["valuations"] for y in p] == [100, 550, 1450, 3550, 7800]  # incl. free owner-listing valuations
    assert p["2031"]["valuation_revenue"] == pytest.approx(9.16e6)
    assert p["2031"]["marketplace_revenue"] == pytest.approx(22.5e6)  # 1,500 deals x EUR 1m x 1.5%
    assert p["2031"]["revenue"] == pytest.approx(31.66e6)
    assert p["2029"]["marketplace_revenue"] == 0  # the marketplace opens in 2030
    assert p["2028"]["ebitda"] < 0 < p["2029"]["ebitda"]
    assert n["breakeven_year"] == 2029
    assert [p[y]["headcount_ye"] for y in p] == [7, 9, 15, 33, 67]
    assert p["2031"]["ebitda_margin"] == pytest.approx(0.36, abs=0.01)
    assert p["2029"]["valuation_ebitda"] > 0  # valuations alone break even while the marketplace is built
    assert all(p[y]["senior_utilisation"] <= 0.85 for y in p)


def test_proceeds(n):
    r = n["proceeds"]
    assert sum(r["buckets"].values()) == pytest.approx(1.0, abs=0.001)
    assert r["bucket_total"] == pytest.approx(r["gross_spend_2027_28"], rel=0.001)
    assert r["runway_months_zero_revenue"] >= 17  # 12 months of 2027 costs, then ≈5 of 2028
    assert r["ask"] >= r["net_burn_2027_28"] + r["working_capital"] + r["capex"]
    assert r["valuations_2027_28"] == 650


def test_team(n):
    t = n["team"]
    assert t["valuations_per_senior_2031"] == pytest.approx(363, abs=1)
    assert 155 <= t["classic_valuers_low"] <= 157
    assert 271 <= t["classic_valuers_high"] <= 273
    assert t["people_2031"] == 67
    assert t["seniors_2031"] + t["deal_team_2031"] + t["platform_2031"] + t["sales_ops_2031"] + t["founders"] == 67
    assert t["deals_2031"] == 1500


def test_downside_is_reported(n):
    d = n["downside"]
    assert d["cum_min"] < 0
    assert set(d["years"]) == {2027, 2028, 2029, 2030, 2031}
    # In the downside the pre-seed runs out in 2029; by 2031 the gap is about the size of the planned seed, and
    # dropping DACH (its costs and its revenue) narrows it but does not close it.
    assert d["out_of_cash_year"] == 2029
    assert 2.7e6 <= d["extra_cash_needed"] <= 3.0e6
    assert d["extra_cash_needed"] <= sum(__import__("model").SEED)  # the deck says the seed covers it
    assert 2.1e6 <= d["without_expansion"]["extra_cash_needed"] <= 2.5e6


def test_employer_cost_follows_the_ceilings():
    """Social security stops at the contribution ceilings, so the employer share falls as salaries rise."""
    from model import employer_cost
    assert employer_cost(50_000) == pytest.approx(50_000 * (1 + 0.1075 + 0.1055 + 0.02))
    assert employer_cost(120_000) == pytest.approx(120_000 + 101_400 * 0.1075 + 69_750 * 0.1055 + 2_400)
    assert employer_cost(120_000) / 120_000 < employer_cost(80_000) / 80_000


def test_tax_and_cash(n):
    p = n["plan"]
    # Start-up losses are carried forward: no tax until they are used up, then both taxes apply.
    assert [p[y]["tax"] for y in ("2027", "2028", "2029")] == [0, 0, 0]
    assert p["2031"]["cit_loss_carried_forward"] == 0 and p["2031"]["trade_loss_carried_forward"] == 0
    assert 0.25 < p["2031"]["tax"] / p["2031"]["ebit"] < 0.27  # 11% x 1.055 + 14.35% = 25.96%
    # Pre-seed plus the 2029 seed: cash stays positive and covers 3 months of next year's costs at every year end.
    from model import MIN_CASH_MONTHS, SEED
    assert min(p[y]["cash_end"] for y in p) > 0
    assert min(p[y]["cash_months"] for y in p) >= MIN_CASH_MONTHS
    assert sum(p[y]["equity_in"] for y in p) == n["proceeds"]["ask"] + sum(SEED)
    assert all(abs(p[y]["balance_check"]) < 1e-6 for y in p)  # assets = paid-in equity + retained earnings


def test_free_listing_valuations_belong_to_the_marketplace(n):
    """Owners list for free; their valuations are the marketplace's cost of winning listings."""
    from model import SEGMENTS, role_heads, loaded, review_hours, PAID_SEGMENTS
    line = n["plan"]["2031"]["lines"]
    seniors = role_heads("Senior valuers")[1][-1] * loaded("Senior valuers", 4)
    paid = review_hours(4, PAID_SEGMENTS) / review_hours(4)
    assert line["Senior valuers"] == pytest.approx(seniors * paid)
    assert line["Owner-listing valuations (free)"] > SEGMENTS["Owner listings"][0][-1] * 2 * 140  # ≥ 2 senior hours
    assert n["plan"]["2029"]["lines"]["Owner-listing valuations (free)"] == 0


def test_heads_follow_the_volume():
    """The plan's heads cover its volume; more hours or deals add heads (and cost) instead of breaking the cap."""
    import model
    assert all(model.needed("Senior valuers", i) <= model.ROLES["Senior valuers"][1][i] for i in range(model.N))
    assert all(model.needed("Deal team", i) <= model.ROLES["Deal team"][1][i] for i in range(model.N))
    saved = model.DEALS_PER_MANAGER
    try:
        model.DEALS_PER_MANAGER = 50
        assert model.role_heads("Deal team")[1][-1] == pytest.approx(1500 / 50)
        assert model.plan()[2031]["ebitda"] < model.build_numbers()["plan"]["2031"]["ebitda"] + 1  # costlier
    finally:
        model.DEALS_PER_MANAGER = saved


def test_marketplace_sensitivity(n):
    s = n["marketplace_sensitivity"]
    assert s["1x0.015"] == pytest.approx(n["plan"]["2031"]["ebitda"])
    assert s["0.5x0.01"] < s["0.5x0.015"] < s["1x0.015"] < s["1x0.02"]
