"""Checks the built deck against the design (plan Task 4). Needs pitch/out/Censio-Pitch.pptx (deck.py)."""

import re
from pathlib import Path

import pytest
from PIL import Image, ImageFont
from pptx import Presentation
from pptx.util import Emu

import content as C
import deck as D
from deck import COL

DECK = Path(__file__).resolve().parents[1] / "out" / "Censio-Pitch.pptx"
pytestmark = pytest.mark.skipif(not DECK.exists(), reason="build the deck first: python3 deck.py")

FONT_FILES = {
    ("Space Grotesk", True): Path.home() / ".fonts/spacegrotesk/SpaceGrotesk-Bold.ttf",
    ("Space Grotesk", False): Path.home() / ".fonts/spacegrotesk/SpaceGrotesk-Regular.ttf",
    ("Inter", True): Path("/usr/share/fonts/opentype/inter/Inter-Bold.otf"),
    ("Inter", False): Path("/usr/share/fonts/opentype/inter/Inter-Regular.otf"),
}
SLACK = 0.9  # text must fit in 90% of its box width, so a fallback font with wider glyphs still fits


@pytest.fixture(scope="module")
def prs():
    return Presentation(str(DECK))


def slide_text(slide) -> str:
    parts = []
    for shape in slide.shapes:
        if shape.has_text_frame:
            parts.append(shape.text_frame.text)
        if shape.has_table:
            parts.extend(cell.text for row in shape.table.rows for cell in row.cells)
        if shape.has_chart:
            parts.extend(str(c) for c in shape.chart.plots[0].categories)
    return "\n".join(parts)


def test_twelve_slides_in_order(prs):
    """Twelve presented slides, then the appendix (backup for questions) after the ask."""
    assert len(prs.slides) == len(C.SLIDES)
    presented = [s for s in C.SLIDES if not s.get("appendix")]
    assert len(presented) == 12 and C.SLIDES[:12] == presented and presented[-1]["key"] == "ask"
    for slide, s in zip(prs.slides, C.SLIDES):
        assert s["title"] in slide_text(slide)


def test_titles_have_no_final_full_stop():
    for s in C.SLIDES:
        assert not s["title"].endswith(".")


def test_notes_present_with_sources(prs):
    for slide, s in zip(prs.slides, C.SLIDES):
        notes = slide.notes_slide.notes_text_frame.text
        assert notes.startswith(s["notes"])
        if s["sources"]:
            assert "Sources:" in notes


def test_notes_fit_timing():
    """285 s of slides leaves 15 s of the 5 minutes for clicks, the video start and hand-overs.
    Numbers count as spoken words (about three each); 2.3 spoken words a second is a calm pitch pace."""
    assert sum(s["seconds"] for s in C.SLIDES) <= 285
    assert all(s["seconds"] == 0 for s in C.SLIDES if s.get("appendix"))
    total = 0
    for s in (s for s in C.SLIDES if not s.get("appendix")):
        words = C.spoken_words(s["notes"])
        total += words
        assert words <= 2.3 * s["seconds"], f"{s['key']}: {words} spoken words for {s['seconds']} s"
    assert total <= 630


def test_numbers_match_model(prs):
    by_key = {s["key"]: slide for slide, s in zip(prs.slides, C.SLIDES)}
    F = C.FMT
    expect = {
        "market": [F["deal_tam"], F["deal_sam"], F["revenue_last"], F["eu_investment"], F["de_income_turnover"],
                   F["valuation_revenue_last"], F["marketplace_revenue_last"], F["deals_last"], F["sam"]],
        "gtm": [F["price"], F["take_rate"], *F["revenue"]],
        "team": [F["per_senior"], F["people_last"], F["experts_last"], F["valuations_last"], F["deals_last"],
                 F["classic_valuers_low"], F["classic_valuers_high"]],
        "financials": [F["breakeven"], F["revenue_last"], F["ebitda_last"], F["gross_profit"],
                       F["gross_margin"], F["downside_extra"], *F["valuations"], *F["people"]],
        "ask": [F["ask"], F["revenue_2028"], F["valuations_2027_28"], F["customers_2028"], F["runway"],
                F["spend_2027_28"], F["revenue_2027_28"], F["buffer"]],
        "backup": [v for _name, values, _bold in C.BACKUP_ROWS for v in values] + F["revenue"] + F["ebitda"],
    }
    for key, values in expect.items():
        text = slide_text(by_key[key])
        for value in values:
            assert value in text, f"{value} missing on {key}"
    # Chart data equals the model.
    fin = next(sh for sh in by_key["financials"].shapes if sh.has_chart).chart
    revenue = list(fin.plots[0].series[0].values)
    assert revenue == pytest.approx([C.PLAN[y]["revenue"] / 1e6 for y in C.YEARS])
    ask = next(sh for sh in by_key["ask"].shapes if sh.has_chart).chart
    assert sum(ask.plots[0].series[0].values) == pytest.approx(1.0, abs=0.001)


def test_no_placeholder_text(prs):
    for slide in prs.slides:
        text = slide_text(slide) + slide.notes_slide.notes_text_frame.text
        assert not re.search(r"lorem|ipsum|subtitle here|write your|\bTODO\b|\[insert|xxx", text, re.I)


def test_only_palette_colours(prs):
    allowed = {v.upper() for v in COL.values()}
    for n, slide in enumerate(prs.slides, start=1):
        for shape in slide.shapes:
            colours = []
            if shape.shape_type == 1:  # AUTO_SHAPE
                if shape.fill.type == 1:
                    colours.append(str(shape.fill.fore_color.rgb))
            if shape.has_text_frame:
                for p in shape.text_frame.paragraphs:
                    for r in p.runs:
                        if r.font.color and r.font.color.type is not None:
                            colours.append(str(r.font.color.rgb))
            for colour in colours:
                assert colour.upper() in allowed, f"slide {n}: {shape.name} uses {colour}"


def test_fonts(prs):
    for n, slide in enumerate(prs.slides, start=1):
        for shape in slide.shapes:
            if shape.has_text_frame:
                for p in shape.text_frame.paragraphs:
                    for r in p.runs:
                        assert r.font.name in ("Space Grotesk", "Inter"), f"slide {n}: {shape.name} {r.font.name}"


def _wrapped_height(shape) -> float:
    """Greedy word wrap with the real fonts at SLACK x box width; returns the text height in inches."""
    width = Emu(shape.width).inches * SLACK * 72  # points
    height = 0.0
    for p in shape.text_frame.paragraphs:
        runs = [r for r in p.runs if r.text]
        if not runs:
            continue
        spacing = p.line_spacing if isinstance(p.line_spacing, float) else 1.2
        size = max(r.font.size.pt for r in runs)
        words = []
        for r in runs:
            font = ImageFont.truetype(str(FONT_FILES[(r.font.name, bool(r.font.bold))]), 200)
            for i, word in enumerate(re.split(r"(\s+)", r.text)):
                if word:
                    words.append((word, font.getlength(word) * r.font.size.pt / 200))
        lines, line = 1, 0.0
        for word, w in words:
            if word.isspace():
                line += w
                continue
            if line + w > width and line > 0:
                lines += 1
                line = w
            else:
                line += w
        height += lines * size * max(spacing, 1.0) * 1.17 / 72
        if p.space_after is not None:
            height += p.space_after.pt / 72
    return height


def test_text_fits_with_slack(prs):
    problems = []
    for n, slide in enumerate(prs.slides, start=1):
        for shape in slide.shapes:
            if not shape.has_text_frame or not shape.text_frame.text.strip():
                continue
            need = _wrapped_height(shape)
            have = Emu(shape.height).inches
            if need > have + 0.08:
                problems.append(f"slide {n}: '{shape.text_frame.text[:40]}' needs {need:.2f} in, box {have:.2f} in")
    assert not problems, "\n".join(problems)


def test_shapes_inside_slide(prs):
    w, h = prs.slide_width, prs.slide_height
    for n, slide in enumerate(prs.slides, start=1):
        for shape in slide.shapes:
            assert shape.left >= 0 and shape.top >= 0, f"slide {n}: {shape.name}"
            assert shape.left + shape.width <= w + 1 and shape.top + shape.height <= h + 1, f"slide {n}: {shape.name}"


def test_demo_slide_has_video_and_poster(prs):
    demo = prs.slides[[s["key"] for s in C.SLIDES].index("demo")]
    movies = [sh for sh in demo.shapes if sh.shape_type == 16]  # MEDIA
    assert len(movies) == 1
    rels = [r.reltype for r in demo.part.rels.values()]
    assert any(t.endswith("/video") for t in rels)
    assert any(t.endswith("/image") for t in rels)  # poster frame
    assert "mainSeq" in demo.part.blob.decode("utf8")  # starts automatically
    assert "Video cues:" in demo.notes_slide.notes_text_frame.text


def test_team_slide_uses_team_file(prs):
    team = prs.slides[[s["key"] for s in C.SLIDES].index("team")]
    text = slide_text(team)
    for member in C.load_team():
        assert member["name"] in text and member["role"] in text


def test_desktop_scope_is_said():
    """The product is a desktop valuation; the deck must say so wherever it compares with full reports."""
    text = "\n".join(slide_text(sl) for sl in Presentation(str(DECK)).slides)
    assert "desktop valuation" in text and "full report" in text and "site visit" in text


def test_colour_code_is_kept(prs):
    """Orange (AI) appears only on AI elements: never on the problem slide's human-time band or on money slices."""
    problem = prs.slides[[s["key"] for s in C.SLIDES].index("problem")]
    for shape in problem.shapes:
        if shape.shape_type == 1 and shape.fill.type == 1:
            assert str(shape.fill.fore_color.rgb) not in ("FFF4E5", "F79009"), shape.name


def test_text_boxes_do_not_overlap(prs):
    """Two text boxes with text never share space (labels colliding, captions running into banners)."""
    problems = []
    for n, slide in enumerate(prs.slides, start=1):
        boxes = [s for s in slide.shapes if s.has_text_frame and s.text_frame.text.strip()]
        for i, a in enumerate(boxes):
            for b in boxes[i + 1:]:
                w = min(a.left + a.width, b.left + b.width) - max(a.left, b.left)
                h = min(a.top + a.height, b.top + b.height) - max(a.top, b.top)
                if w > Emu(36000) and h > Emu(36000):  # more than 1 mm both ways
                    problems.append(f"slide {n}: '{a.text_frame.text[:25]}' / '{b.text_frame.text[:25]}'")
    assert not problems, "\n".join(problems)


def test_banners_clear_of_text(prs):
    """Filled shapes that carry their own text (closing banner, bands) do not sit under other slide text."""
    ask = prs.slides[[s["key"] for s in C.SLIDES].index("ask")]
    banner = next(s for s in ask.shapes if s.name == "Closing")
    caption = next(s for s in ask.shapes if s.name == "Donut caption")
    assert caption.top + caption.height <= banner.top


def test_demo_video_is_embedded_undistorted(prs):
    """The demo slide carries the team's recording (if present) at its own aspect ratio, not stretched."""
    demo = prs.slides[[s["key"] for s in C.SLIDES].index("demo")]
    movie = next(sh for sh in demo.shapes if sh.shape_type == 16)
    video = D.demo_video()
    pw, ph = Image.open(video["poster"]).size
    assert movie.width / movie.height == pytest.approx(pw / ph, rel=0.01)
    blobs = [r.target_part.blob for r in demo.part.rels.values() if r.reltype.endswith("/video")]
    assert len(blobs) == 1 and len(blobs[0]) == video["path"].stat().st_size
    if video["cues"]:
        assert f"{video['cues'][0][0] // 60}:{video['cues'][0][0] % 60:02d}" in demo.notes_slide.notes_text_frame.text
