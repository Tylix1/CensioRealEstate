"""Builds the Censio pitch deck on the re-themed template base.

    python3 pitch/build/deck.py            # reads pitch/out/base.pptx, writes pitch/out/Censio-Pitch.pptx

Inputs: content.py (copy, notes), numbers.json (via content), pitch/assets/*.png (prototype screenshots, mark),
pitch/out/{base.pptx, laptop.png, censio-demo-30s.mp4, demo-poster.png}.
Grid kept from the template: title top-left with a mark to its left, page number square bottom-left.
"""

from __future__ import annotations

import copy
from pathlib import Path

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION, XL_TICK_LABEL_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

import content as C

PITCH = Path(__file__).resolve().parents[1]
ASSETS, OUT = PITCH / "assets", PITCH / "out"

HEAD, BODY = "Space Grotesk", "Inter"
COL = {
    "page": "F2F4F7", "card": "FFFFFF", "subtle": "F9FAFB", "line": "E4E7EC", "line_strong": "D0D5DD",
    "ink": "101828", "ink2": "475467", "muted": "5B6576", "faint": "98A2B3",
    "brand": "0B5D4B", "brand_weak": "E6F2EE", "brand_accent": "7FD1B9",
    "doc": "1849A9", "doc_weak": "EAF1FF",
    "ai": "A3410A", "ai_strong": "F79009", "ai_weak": "FFF4E5", "ai_mid": "FEC84B",
    "valuer": "5B3CC4", "valuer_weak": "F1EDFF", "valuer_line": "BDB4FE",
}
W, H = 13.333, 7.5
LEFT, RIGHT = 1.02, 12.73
CW = RIGHT - LEFT
TOP = 2.2  # content area starts below title + sub headline
LAPTOP_SCREEN = (0.11975, 0.07981, 0.76104, 0.79321)  # x, y, w, h of the transparent screen, as fractions


def rgb(name: str) -> RGBColor:
    return RGBColor.from_string(COL[name])


# ---------------------------------------------------------------- primitives
def text(slide, x, y, w, h, paragraphs, *, size=14, color="ink", font=BODY, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=None, after=0, name=None):
    """paragraphs: a string, or a list of paragraphs; a paragraph is a string or a list of (text, overrides)."""
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        box.name = name
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    if isinstance(paragraphs, str):
        paragraphs = [paragraphs]
    for i, para in enumerate(paragraphs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if spacing:
            p.line_spacing = spacing
        if after and i < len(paragraphs) - 1:
            p.space_after = Pt(after)
        runs = [(para, {})] if isinstance(para, str) else para
        for run_text, over in runs:
            r = p.add_run()
            r.text = run_text
            f = r.font
            f.name = over.get("font", font)
            f.size = Pt(over.get("size", size))
            f.bold = over.get("bold", bold)
            f.color.rgb = rgb(over.get("color", color))
    return box


def box(slide, x, y, w, h, fill="card", line=None, radius=0.08, shape=MSO_SHAPE.ROUNDED_RECTANGLE, dash=False,
        line_width=0.75):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = min(0.5, radius / min(w, h))
    if fill:
        s.fill.solid()
        s.fill.fore_color.rgb = rgb(fill)
    else:
        s.fill.background()
    if line:
        s.line.color.rgb = rgb(line)
        s.line.width = Pt(line_width)
        if dash:
            s.line.dash_style = 4  # MSO_LINE.DASH
    else:
        s.line.fill.background()
    s.shadow.inherit = False
    s.text_frame.text = ""
    return s


def dot(slide, x, y, d, fill):
    return box(slide, x, y, d, d, fill=fill, shape=MSO_SHAPE.OVAL)


def picture(slide, path, x, y, w=None, h=None, crop=None, name=None):
    path = Path(path)
    if crop:
        cropped = OUT / f"crop-{path.stem}-{'-'.join(map(str, crop))}.png"
        if not cropped.exists():
            Image.open(path).crop(crop).save(cropped)
        path = cropped
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w) if w else None,
                                   Inches(h) if h else None)
    if name:
        pic.name = name
    return pic


def laptop_png() -> Path:
    small = OUT / "laptop-2400.png"
    if not small.exists():
        im = Image.open(OUT / "laptop.png")
        im.resize((2400, round(2400 * im.height / im.width)), Image.LANCZOS).save(small)
    return small


def laptop(slide, x, y, w, screen):
    """The template's laptop mockup with `screen` (an image) inside; returns the screen rectangle."""
    im = Image.open(OUT / "laptop.png")
    h = w * im.height / im.width
    sx, sy, sw, sh = (x + LAPTOP_SCREEN[0] * w, y + LAPTOP_SCREEN[1] * h, LAPTOP_SCREEN[2] * w, LAPTOP_SCREEN[3] * h)
    if screen:
        picture(slide, screen, sx, sy, sw, sh, name="Prototype screen")
    picture(slide, laptop_png(), x, y, w, h, name="Laptop mockup")
    return sx, sy, sw, sh


def background(slide, colour):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = rgb(colour)


def frame(slide, n, s, dark=False):
    """The template grid: background, eyebrow + mark + title, sub headline, page number square, source line."""
    background(slide, "ink" if dark else "page")
    picture(slide, ASSETS / "censio-mark.png", 0.40, 0.66, 0.42, 0.42, name="Censio mark")
    if s.get("eyebrow"):
        text(slide, LEFT, 0.3, CW, 0.25, [[(s["eyebrow"].upper(), {"bold": True})]], size=10,
             color="brand_accent" if dark else "brand", name="Eyebrow")
    text(slide, LEFT, 0.6, CW, 0.55, s["title"], size=30, font=HEAD, bold=True,
         color="card" if dark else "ink", anchor=MSO_ANCHOR.MIDDLE, name="Title")
    text(slide, LEFT, 1.28, 11.2, 0.62, s["sub"], size=15, color="faint" if dark else "ink2", spacing=1.1,
         name="Sub headline")
    sq = box(slide, 0, 6.92, 0.58, 0.58, fill="ink" if dark else "card", radius=0, shape=MSO_SHAPE.RECTANGLE)
    sq.name = "Page number"
    text(slide, 0, 6.92, 0.58, 0.58, str(n), size=10, color="faint" if dark else "ink2", align=PP_ALIGN.CENTER,
         anchor=MSO_ANCHOR.MIDDLE, name="Page number text")
    line = C.source_line(s)
    if line:
        text(slide, LEFT, 7.02, CW, 0.3, line, size=9, color="muted", name="Sources")


def label(slide, x, y, w, words, color="brand", size=11):
    return text(slide, x, y, w, 0.25, [[(words.upper(), {"bold": True})]], size=size, color=color)


def style_chart(chart, size=11):
    chart.font.name = BODY
    chart.font.size = Pt(size)
    chart.font.color.rgb = rgb("ink2")


def hide_axis(axis):
    axis.visible = False
    axis.has_major_gridlines = False
    axis.has_minor_gridlines = False


# ---------------------------------------------------------------- slides
def s_cover(slide, s):
    background(slide, "brand")
    picture(slide, ASSETS / "censio-mark.png", LEFT, 0.82, 0.56, 0.56, name="Censio mark")
    text(slide, LEFT + 0.72, 0.82, 2.4, 0.56, [[("Censio", {"bold": True, "font": HEAD, "size": 26}),
                                                ("  RE", {"bold": True, "size": 14, "color": "brand_accent"})]],
         color="card", anchor=MSO_ANCHOR.MIDDLE, name="Wordmark")
    text(slide, LEFT, 2.05, 5.75, 2.45, s["title"], size=38, font=HEAD, bold=True, color="card", spacing=1.0,
         name="Title")
    text(slide, LEFT, 4.55, 5.4, 0.7, s["sub"], size=16, color="brand_weak", spacing=1.15, name="Sub headline")
    text(slide, LEFT, 6.55, 5.6, 0.3, "AI Native Ventures · ESMT Berlin · November 2026", size=11,
         color="brand_accent", name="Occasion")
    laptop(slide, 6.75, 1.75, 6.2, ASSETS / "hero-review.png")


def s_vision(slide, s):
    cw = (CW - 0.35) / 2
    card = box(slide, LEFT, TOP + 0.1, cw, 2.75, fill="brand", radius=0.12)
    card.name = "Vision card"
    label(slide, LEFT + 0.4, TOP + 0.45, 3, "Vision", color="brand_accent")
    text(slide, LEFT + 0.4, TOP + 0.85, cw - 0.8, 1.8, s["vision"], size=22, font=HEAD, bold=True, color="card",
         spacing=1.1)
    x2 = LEFT + cw + 0.35
    box(slide, x2, TOP + 0.1, cw, 2.75, fill="card", line="line", radius=0.12).name = "Mission card"
    label(slide, x2 + 0.4, TOP + 0.45, 3, "Mission")
    text(slide, x2 + 0.4, TOP + 0.85, cw - 0.8, 1.8, s["mission"], size=20, font=HEAD, bold=True, spacing=1.1)
    # The colour code the deck (and the prototype) uses.
    y = 5.55
    label(slide, LEFT, y, 4, "Colour code in this deck and in the product", color="ink2", size=10)
    keys = [("ai_strong", "AI does it"), ("valuer", "A senior valuer decides"), ("doc", "Source documents"),
            ("brand", "Censio")]
    x = LEFT
    for colour, words in keys:
        dot(slide, x, y + 0.42, 0.2, colour)
        text(slide, x + 0.3, y + 0.36, 2.5, 0.32, words, size=14, color="ink")
        x += 2.85


def s_problem(slide, s):
    gap = 0.35
    cw = (CW - 2 * gap) / 3
    for i, (tag, big, small) in enumerate(s["stats"]):
        x = LEFT + i * (cw + gap)
        box(slide, x, TOP + 0.15, cw, 2.85, fill="card", line="line", radius=0.1).name = f"Stat card {i + 1}"
        label(slide, x + 0.35, TOP + 0.45, cw - 0.7, tag, color="valuer" if tag == "People" else "ink2")
        text(slide, x + 0.35, TOP + 0.8, cw - 0.7, 0.8, big, size=34, font=HEAD, bold=True)
        text(slide, x + 0.35, TOP + 1.75, cw - 0.7, 1.1, small, size=14, color="ink2", spacing=1.1)
    y = 5.55
    box(slide, LEFT, y, CW, 0.75, fill="valuer_weak", radius=0.1).name = "Hours band"
    text(slide, LEFT + 0.35, y, CW - 0.7, 0.75, s["footnote"], size=15, color="valuer", anchor=MSO_ANCHOR.MIDDLE)


def s_solution(slide, s):
    y = TOP + 0.05
    chips = {"ai": ("ai_weak", "ai"), "rules": ("brand_weak", "brand"), "valuer": ("valuer_weak", "valuer")}
    for kind, verb, what in s["steps"]:
        weak, strong = chips[kind]
        chip = box(slide, LEFT, y, 1.35, 0.52, fill=weak, radius=0.26)
        chip.name = f"Step {verb}"
        text(slide, LEFT, y, 1.35, 0.52, [[(verb, {"bold": True})]], size=14, color=strong, align=PP_ALIGN.CENTER,
             anchor=MSO_ANCHOR.MIDDLE)
        text(slide, LEFT + 1.55, y, 4.75, 0.52, what, size=13, color="ink", anchor=MSO_ANCHOR.MIDDLE, spacing=1.05)
        y += 0.66
    text(slide, LEFT, y + 0.02, 6.3, 0.3, [[("AI", {"bold": True, "color": "ai"}), ("  reads, researches, flags · ", {}),
                                          ("Rules", {"bold": True, "color": "brand"}), ("  compute · ", {}),
                                          ("Senior", {"bold": True, "color": "valuer"}), ("  decides and signs", {})]],
         size=11.5, color="ink2", name="Who does what")
    # The senior's moment in the product: an AI judgement call and Revalue, large enough to read.
    pw = 4.6
    px = RIGHT - pw
    ph = pw * 780 / 1232
    box(slide, px - 0.06, TOP - 0.01, pw + 0.12, ph + 0.12, fill="card", line="line", radius=0.08)
    picture(slide, ASSETS / "flag-evidence.png", px, TOP + 0.05, pw, ph, crop=(584, 860, 1816, 1640),
            name="Prototype: AI judgement call and Revalue")
    text(slide, px, TOP + ph + 0.2, pw, 0.5, s["caption"], size=11, color="ink2", spacing=1.05)
    y = 5.85
    gap = 0.35
    cw = (CW - 2 * gap) / 3
    for i, (big, small) in enumerate(s["proof"]):
        x = LEFT + i * (cw + gap)
        box(slide, x, y, cw, 0.95, fill="card", line="line", radius=0.1)
        text(slide, x + 0.3, y, cw - 0.6, 0.95, [[(big, {"bold": True, "font": HEAD, "size": 20})],
                                                  [(small, {"size": 12, "color": "ink2"})]],
             anchor=MSO_ANCHOR.MIDDLE, spacing=1.0)


def s_demo(slide, s):
    w = 7.6
    im = Image.open(OUT / "laptop.png")
    h = w * im.height / im.width
    x, y = (W - w) / 2, 2.0
    picture(slide, laptop_png(), x, y, w, h, name="Laptop mockup")
    sx, sy, sw, sh = (x + LAPTOP_SCREEN[0] * w, y + LAPTOP_SCREEN[1] * h, LAPTOP_SCREEN[2] * w, LAPTOP_SCREEN[3] * h)
    movie = slide.shapes.add_movie(str(OUT / "censio-demo-30s.mp4"), Inches(sx), Inches(sy), Inches(sw), Inches(sh),
                                   poster_frame_image=str(OUT / "demo-poster.png"), mime_type="video/mp4")
    movie.name = "Demo video (30 s)"
    autoplay(slide, movie)
    text(slide, x, y + h + 0.08, w, 0.3, "▶  Demo video, 30 s · starts by itself", size=11, color="faint",
         align=PP_ALIGN.CENTER, name="Video caption")


def autoplay(slide, movie):
    """Starts the video by itself when the slide appears (PowerPoint: Playback > Start: Automatically).

    python-pptx writes only the media node, which waits for a click on the video. This adds the main sequence
    PowerPoint itself writes for an automatic start.
    """
    spid = movie.shape_id
    ms = 30_000  # the demo video is cut to exactly 30 seconds (make_video.py)
    xml = f"""<p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:tnLst><p:par>
<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>
<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>
<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>
<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>
<p:par><p:cTn id="5" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>
<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="6" dur="{ms}" fill="hold"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:cmd>
</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>
</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>
<p:video><p:cMediaNode vol="80000"><p:cTn id="7" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cMediaNode></p:video>
</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>"""
    old = slide._element.find(qn("p:timing"))
    new = etree.fromstring(xml.replace("\n", ""))
    if old is not None:
        old.getparent().replace(old, new)
    else:
        slide._element.append(new)


def s_market(slide, s):
    base_y, cx = 6.3, LEFT + 2.15
    sizes = [4.1, 2.6, 1.25]
    fills = ["brand_weak", "brand_accent", "brand"]
    for (tag, value, when, _), d, fill in zip(s["rings"], sizes, fills):
        ring = dot(slide, cx - d / 2, base_y - d, d, fill)
        ring.name = f"{tag} circle"
        if fill == "brand_weak":
            ring.line.color.rgb = rgb("brand_accent")
            ring.line.width = Pt(1)
    tops = [base_y - sizes[0] + 0.45, base_y - sizes[1] + 0.45, base_y - sizes[2] / 2 - 0.2]
    for (tag, value, when, _), ly, colour in zip(s["rings"], tops, ["ink", "ink", "card"]):
        text(slide, cx - 1.0, ly, 2.0, 0.4, [[(tag, {"bold": True, "font": HEAD})]], size=18, color=colour,
             align=PP_ALIGN.CENTER)
    text(slide, LEFT, base_y + 0.08, 4.3, 0.25, "Circles not to scale", size=9, color="muted", align=PP_ALIGN.CENTER)
    x = 6.0
    y = TOP + 0.1
    for (tag, value, when, desc), fill in zip(s["rings"], fills):
        legend_dot = dot(slide, x, y + 0.12, 0.26, fill)
        if fill == "brand_weak":
            legend_dot.line.color.rgb = rgb("brand_accent")
            legend_dot.line.width = Pt(1)
        text(slide, x + 0.45, y, 6.2, 0.45, [[(value, {"bold": True, "font": HEAD, "size": 24}),
                                             (f"  {tag} · {when}", {"size": 13, "color": "ink2", "bold": True})]])
        text(slide, x + 0.45, y + 0.5, 6.2, 0.62, desc, size=13, color="ink2", spacing=1.05)
        y += 1.2
    box(slide, x, y + 0.05, RIGHT - x, 0.95, fill="card", line="line", radius=0.1)
    text(slide, x + 0.25, y + 0.05, RIGHT - x - 0.5, 0.95, s["on_top"], size=12, color="ink2",
         anchor=MSO_ANCHOR.MIDDLE, spacing=1.05)


def s_competition(slide, s):
    mx, my, mw, mh = LEFT + 0.45, TOP + 0.1, 5.95, 4.15
    box(slide, mx + mw / 2, my, mw / 2, mh / 2, fill="brand_weak", radius=0, shape=MSO_SHAPE.RECTANGLE).name = "Target"
    box(slide, mx, my, mw, mh, fill=None, line="line_strong", radius=0, shape=MSO_SHAPE.RECTANGLE)
    ln = slide.shapes.add_connector(1, Inches(mx + mw / 2), Inches(my), Inches(mx + mw / 2), Inches(my + mh))
    ln.line.color.rgb = rgb("line")
    ln2 = slide.shapes.add_connector(1, Inches(mx), Inches(my + mh / 2), Inches(mx + mw), Inches(my + mh / 2))
    ln2.line.color.rgb = rgb("line")
    top, bottom = s["axis"]
    text(slide, 0.2, my + 0.05, mx - 0.3, 0.5, [[(top, {"bold": True})]], size=10.5, color="ink2",
         align=PP_ALIGN.RIGHT, spacing=1.0)
    text(slide, 0.2, my + mh - 0.3, mx - 0.3, 0.3, [[(bottom, {"bold": True})]], size=10.5, color="ink2",
         align=PP_ALIGN.RIGHT)
    text(slide, mx, my + mh + 0.08, 1.5, 0.3, "Weeks", size=11, color="ink2", bold=True)
    text(slide, mx + mw - 1.5, my + mh + 0.08, 1.5, 0.3, "Hours", size=11, color="ink2", bold=True,
         align=PP_ALIGN.RIGHT)
    text(slide, mx + mw / 2 - 1.5, my + mh + 0.08, 3, 0.3, "time to value", size=11, color="muted",
         align=PP_ALIGN.CENTER)

    def player(key, x, y, w, fill="card", line="line", colour="ink", sub="ink2"):
        name, who, facts = s["players"][key]
        box(slide, x, y, w, 1.45, fill=fill, line=line, radius=0.1).name = f"Player {key}"
        text(slide, x + 0.2, y + 0.12, w - 0.4, 1.25, [
            [(name, {"bold": True, "size": 13, "color": colour})],
            [(who, {"size": 10.5, "color": sub})],
            [(facts, {"size": 10.5, "color": sub, "bold": True})],
        ], spacing=1.05)

    cw = mw / 2 - 0.4
    player("classic", mx + 0.2, my + 0.25, cw)
    player("censio", mx + mw / 2 + 0.2, my + 0.25, cw, fill="brand", line=None, colour="card", sub="brand_weak")
    player("short", mx + 0.2, my + mh / 2 + 0.25, cw)
    player("avm", mx + mw / 2 + 0.2, my + mh / 2 + 0.25, cw)
    x = 7.95
    y = TOP + 0.1
    for kind, head, body in s["why"]:
        colour = "valuer" if kind == "valuer" else "brand"
        fill = "valuer_weak" if kind == "valuer" else "brand_weak"
        box(slide, x, y, RIGHT - x, 2.05, fill=fill, radius=0.1)
        text(slide, x + 0.3, y + 0.22, RIGHT - x - 0.6, 0.35, [[(head, {"bold": True})]], size=15, color=colour)
        text(slide, x + 0.3, y + 0.62, RIGHT - x - 0.6, 1.4, body, size=12, color="ink", spacing=1.06)
        y += 2.2


def s_traction(slide, s):
    box(slide, LEFT, TOP + 0.05, 5.1, 2.05, fill="brand", radius=0.12).name = "North star"
    label(slide, LEFT + 0.4, TOP + 0.35, 3, "North star", color="brand_accent")
    text(slide, LEFT + 0.4, TOP + 0.7, 4.4, 0.88, "Signed valuations delivered within 48 hours", size=22, font=HEAD,
         bold=True, color="card", spacing=1.05)
    text(slide, LEFT + 0.4, TOP + 1.62, 4.6, 0.3, s["star_note"], size=12, color="brand_accent")
    y = TOP + 2.35
    label(slide, LEFT, y, 4, "Input metrics", color="ink2", size=10)
    y += 0.35
    for head, tail in s["inputs"]:
        box(slide, LEFT, y, 5.1, 0.55, fill="card", line="line", radius=0.08)
        text(slide, LEFT + 0.25, y, 4.7, 0.55, [[(head, {"bold": True}), ("  " + tail, {"color": "ink2"})]], size=13,
             anchor=MSO_ANCHOR.MIDDLE)
        y += 0.66
    x0 = 6.75
    line = slide.shapes.add_connector(1, Inches(x0 + 0.13), Inches(TOP + 0.35), Inches(x0 + 0.13), Inches(6.3))
    line.line.color.rgb = rgb("line_strong")
    line.line.width = Pt(1.5)
    y = TOP + 0.1
    for i, (when, head, body) in enumerate(s["timeline"]):
        dot(slide, x0, y + 0.12, 0.26, "brand" if i == 0 else "card").line.color.rgb = rgb("brand")
        text(slide, x0 + 0.55, y, RIGHT - x0 - 0.55, 0.3, [[(when.upper(), {"bold": True})]], size=11,
             color="brand" if i == 0 else "ink2")
        text(slide, x0 + 0.55, y + 0.3, RIGHT - x0 - 0.55, 0.4, [[(head, {"bold": True, "font": HEAD})]], size=19)
        text(slide, x0 + 0.55, y + 0.75, RIGHT - x0 - 0.55, 0.6, body, size=13, color="ink2", spacing=1.08)
        y += 1.4


def s_gtm(slide, s):
    y = TOP + 0.05
    cw = 6.2
    for i, (year, who, price, how) in enumerate(s["path"]):
        first = i == 0
        box(slide, LEFT, y, cw, 0.78, fill="brand" if first else "card", line=None if first else "line",
            radius=0.1).name = f"Segment {year}"
        text(slide, LEFT + 0.25, y, 0.75, 0.78, [[(year, {"bold": True})]], size=13,
             color="brand_accent" if first else "brand", anchor=MSO_ANCHOR.MIDDLE)
        text(slide, LEFT + 1.05, y + 0.1, 3.9, 0.6, [[(who, {"bold": True})], [(how, {"size": 11})]], size=13.5,
             color="card" if first else "ink", spacing=1.05)
        text(slide, LEFT + cw - 1.25, y, 1.0, 0.78, [[(price, {"bold": True, "font": HEAD})]], size=16,
             color="card" if first else "ink", align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
        y += 0.9
    box(slide, LEFT, y + 0.05, cw, 0.8, fill=None, line="faint", radius=0.1, dash=True).name = "Later option"
    text(slide, LEFT + 0.25, y + 0.05, cw - 0.5, 0.8, s["later"], size=11.5, color="ink2",
         anchor=MSO_ANCHOR.MIDDLE, spacing=1.05)
    # Native stacked columns: revenue by segment, totals in the category labels.
    data = CategoryChartData()
    data.categories = [f"{y}\n{r}" for y, r in zip(C.YEARS, C.FMT["revenue"])]
    names = list(C.PLAN[C.YEARS[0]]["segment_revenue"])
    for name in names:
        data.add_series(name, [C.PLAN[y]["segment_revenue"][name] / 1e6 for y in C.YEARS])
    x = 7.6
    gf = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_STACKED, Inches(x), Inches(TOP), Inches(RIGHT - x),
                                Inches(4.35), data)
    gf.name = "Revenue by segment"
    chart = gf.chart
    style_chart(chart, 11)
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.TOP
    chart.legend.include_in_layout = False
    chart.legend.font.size = Pt(10)
    hide_axis(chart.value_axis)
    chart.category_axis.format.line.color.rgb = rgb("line_strong")
    chart.category_axis.tick_labels.font.size = Pt(11)
    chart.category_axis.tick_labels.font.bold = True
    plot = chart.plots[0]
    plot.gap_width = 55
    for series, colour in zip(plot.series, ["brand", "brand_accent", "ink2", "line_strong"]):
        series.format.fill.solid()
        series.format.fill.fore_color.rgb = rgb(colour)


def s_team(slide, s):
    def stack(x, title, tiers, fills, text_colours):
        text(slide, x, TOP + 0.05, 2.95, 0.3, [[(title, {"bold": True})]], size=13, align=PP_ALIGN.CENTER)
        widths = [1.05, 1.95, 2.95]
        y = TOP + 0.5
        for (words, _), w, fill, colour in zip(tiers, widths, fills, text_colours):
            bx = x + (2.95 - w) / 2
            box(slide, bx, y, w, 0.55, fill=fill, radius=0.08).name = f"{title}: {words}"
            text(slide, bx, y, w, 0.55, [[(words, {"bold": True})]], size=11.5, color=colour, align=PP_ALIGN.CENTER,
                 anchor=MSO_ANCHOR.MIDDLE)
            y += 0.64

    stack(LEFT, "Classic valuation firm", s["classic"], ["line_strong", "line_strong", "line"], ["ink", "ink", "ink2"])
    stack(LEFT + 3.3, "Censio", s["censio"], ["brand", "valuer", "ai_weak"], ["card", "card", "ai"])
    y = 4.55
    for i, (big, small) in enumerate(s["stats"]):
        x = LEFT + i * 3.3
        text(slide, x, y, 2.95, 0.55, [[(big, {"bold": True, "font": HEAD})]], size=28,
             color="ink" if i == 0 else "valuer", align=PP_ALIGN.CENTER)
        text(slide, x, y + 0.58, 2.95, 0.65, small, size=12, color="ink2", spacing=1.05, align=PP_ALIGN.CENTER)
    box(slide, LEFT, 5.95, 6.25, 0.62, fill="card", line="line", radius=0.08).name = "Bridge"
    text(slide, LEFT + 0.2, 5.95, 5.85, 0.62, s["bridge"], size=12, color="ink", anchor=MSO_ANCHOR.MIDDLE,
         spacing=1.02)
    # Right: founders as overhead, then the whole 2031 team as one bar.
    x0 = 7.85
    label(slide, x0, TOP + 0.05, 4.9, "Founders (overhead) · all ESMT Berlin", color="ink2", size=10)
    team = C.load_team()
    for i, member in enumerate(team[:4]):
        col, row = i % 2, i // 2
        x = x0 + col * 2.5
        y = TOP + 0.42 + row * 0.95
        initials = "".join(part[0] for part in member["name"].split()[:2]).upper()
        dot(slide, x, y, 0.58, "brand_weak").name = f"Founder {i + 1} avatar"
        text(slide, x, y, 0.58, 0.58, [[(initials, {"bold": True})]], size=12.5, color="brand", align=PP_ALIGN.CENTER,
             anchor=MSO_ANCHOR.MIDDLE)
        text(slide, x + 0.7, y - 0.02, 1.75, 0.85, [
            [(member["name"], {"bold": True, "size": 12, "color": "ink"})],
            [(member["role"], {"size": 11, "color": "ink2"})],
        ], spacing=1.02, name=f"Founder {i + 1}")
    y = TOP + 2.45
    total = sum(n for _, n, _ in C.TEAM_2031)
    label(slide, x0, y, 4.9, f"Censio in 2031: {total} people, no juniors", color="ink2", size=10)
    bar_w = RIGHT - x0
    bx = x0
    for name, count, colour in C.TEAM_2031:
        w = bar_w * count / total
        box(slide, bx, y + 0.32, w - 0.03, 0.5, fill=colour, radius=0.06).name = f"Team 2031: {name}"
        text(slide, bx, y + 0.32, w - 0.03, 0.5, [[(str(count), {"bold": True, "font": HEAD})]], size=14,
             color="ink" if colour == "brand_accent" else "card", align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        bx += w
    legend = []
    for i, (name, count, colour) in enumerate(C.TEAM_2031):
        legend += [("■ ", {"color": colour, "size": 10}), (name, {"color": "ink2"}),
                   ("  " if i < len(C.TEAM_2031) - 1 else "", {})]
    text(slide, x0, y + 0.9, bar_w, 0.3, [legend], size=9.5, name="Team 2031 legend")
    box(slide, x0, 5.95, RIGHT - x0, 0.62, fill="valuer_weak", radius=0.08).name = "First hire"
    text(slide, x0 + 0.2, 5.95, RIGHT - x0 - 0.4, 0.62, s["first_hire"], size=12, color="valuer",
         anchor=MSO_ANCHOR.MIDDLE, bold=True)


def s_financials(slide, s):
    data = CategoryChartData()
    data.categories = [f"{y}\n{v} valuations\n{p} people" for y, v, p in
                       zip(C.YEARS, C.FMT["valuations"], C.FMT["people"])]
    data.add_series("Revenue", [C.PLAN[y]["revenue"] / 1e6 for y in C.YEARS])
    data.add_series("EBITDA", [C.PLAN[y]["ebitda"] / 1e6 for y in C.YEARS])
    gf = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(LEFT), Inches(TOP), Inches(6.7),
                                Inches(3.95), data)
    gf.name = "Revenue and EBITDA"
    chart = gf.chart
    style_chart(chart, 11)
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.TOP
    chart.legend.include_in_layout = False
    hide_axis(chart.value_axis)
    chart.category_axis.format.line.color.rgb = rgb("line_strong")
    chart.category_axis.tick_labels.font.size = Pt(10)
    chart.category_axis.tick_label_position = XL_TICK_LABEL_POSITION.LOW
    plot = chart.plots[0]
    plot.gap_width = 60
    plot.overlap = -10
    for series, colour in zip(plot.series, ["brand", "brand_accent"]):
        series.format.fill.solid()
        series.format.fill.fore_color.rgb = rgb(colour)
        series.invert_if_negative = False
        labels = series.data_labels
        labels.show_value = True
        labels.number_format = '[<0]"−€"0.0"m";"€"0.0"m"'
        labels.number_format_is_linked = False
        labels.position = XL_LABEL_POSITION.OUTSIDE_END
        labels.font.size = Pt(10.5)
        labels.font.color.rgb = rgb("ink")
    text(slide, LEFT, 6.3, 6.7, 0.55, s["downside"], size=11, color="ink2", spacing=1.05, name="Downside")
    # One valuation, line by line: senior time is the cost; AI is a rounding error.
    x, w = 8.15, RIGHT - 8.15
    box(slide, x, TOP, w, 4.6, fill="card", line="line", radius=0.12).name = "Unit economics"
    label(slide, x + 0.35, TOP + 0.3, w - 0.7, "One signed desktop valuation", color="ink2", size=10)
    u = C.U
    lines = [("Price", u["price"], "brand", False)]
    colours = {"Senior review (2 h)": "valuer", "AI": "ai_strong", "Data & documents": "doc"}
    names = {"AI": "AI (est.)"}
    for name, value in u["cost_lines"].items():
        lines.append((names.get(name, name), value, colours.get(name, "faint"), True))
    y = TOP + 0.7
    bar_x, bar_w = x + 2.35, w - 2.35 - 0.35
    for name, value, colour, minus in lines:
        text(slide, x + 0.35, y, 2.0, 0.34, name, size=12, color="ink", anchor=MSO_ANCHOR.MIDDLE)
        bw = max(0.03, bar_w * 0.62 * value / u["price"])
        box(slide, bar_x, y + 0.07, bw, 0.2, fill=colour, radius=0.04)
        amount = f"−€{value:,.0f}" if minus else f"€{value:,.0f}"
        text(slide, bar_x + bw + 0.08, y, 1.2, 0.34, amount, size=12, color="ink", bold=not minus,
             anchor=MSO_ANCHOR.MIDDLE)
        y += 0.42
    sep = slide.shapes.add_connector(1, Inches(x + 0.35), Inches(y + 0.05), Inches(x + w - 0.35), Inches(y + 0.05))
    sep.line.color.rgb = rgb("line_strong")
    text(slide, x + 0.35, y + 0.15, w - 0.7, 0.45, [[("Gross profit ", {"bold": True}),
                                                     (f"{C.FMT['gross_profit']} · {C.FMT['gross_margin']}",
                                                      {"bold": True, "font": HEAD, "size": 18, "color": "brand"})]],
         size=13, anchor=MSO_ANCHOR.MIDDLE)
    text(slide, x + 0.35, y + 0.65, w - 0.7, 0.75,
         f"At full senior use; company gross margin {C.FMT['company_gm']} in 2029–31. Bank valuations add a "
         "site visit (6 h, €100 travel).", size=10.5, color="ink2", spacing=1.05)


def cell_text(cell, value, bold=False, colour="ink", align=PP_ALIGN.LEFT):
    cell.fill.background()
    cell.margin_left = cell.margin_right = Inches(0.04)
    cell.margin_top = cell.margin_bottom = Inches(0.02)
    tf = cell.text_frame
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = str(value)
    r.font.name = BODY
    r.font.size = Pt(11)
    r.font.bold = bold
    r.font.color.rgb = rgb(colour)


def plain_table(table_shape):
    """Removes the built-in table style banding so the table sits on the page like text."""
    tbl = table_shape._element.graphic.graphicData.tbl
    pr = tbl.tblPr
    for attr in ("firstRow", "bandRow"):
        pr.set(attr, "0")


def s_ask(slide, s):
    data = CategoryChartData()
    names = list(C.BUCKETS)
    data.categories = names
    data.add_series("Use of proceeds", [C.BUCKETS[n] for n in names])
    d = 2.8
    gf = slide.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Inches(LEFT - 0.1), Inches(TOP + 0.1), Inches(d),
                                Inches(d), data)
    gf.name = "Use of proceeds"
    chart = gf.chart
    style_chart(chart)
    chart.has_legend = False
    chart.has_title = False
    plot = chart.plots[0]
    colours = ["ai_strong", "valuer", "brand", "ink2"]
    for point, colour in zip(plot.series[0].points, colours):
        point.format.fill.solid()
        point.format.fill.fore_color.rgb = rgb(colour)
        point.format.line.color.rgb = rgb("page")
    hole = plot._element.find(qn("c:holeSize"))
    if hole is None:
        hole = etree.SubElement(plot._element, qn("c:holeSize"))
    hole.set("val", "62")
    text(slide, LEFT - 0.1, TOP + 0.1 + d / 2 - 0.42, d, 0.85,
         [[(C.FMT["spend_2027_28"], {"bold": True, "font": HEAD, "size": 26})],
          [("spend 2027–28", {"size": 11, "color": "ink2"})]], align=PP_ALIGN.CENTER, spacing=1.0)
    y = TOP + 0.15
    for name, colour in zip(names, colours):
        dot(slide, 4.45, y + 0.1, 0.22, colour)
        head, _, _ = name.partition(": ")
        text(slide, 4.8, y, 3.0, 0.62, [[(f"{C.pct(C.BUCKETS[name])}  ", {"bold": True, "font": HEAD, "size": 17}),
                                         (head, {"bold": True, "size": 13})],
                                        [(C.LEGEND_TAILS[name], {"size": 11, "color": "ink2"})]], spacing=1.0)
        y += 0.72
    text(slide, LEFT, TOP + d + 0.25, 6.9, 0.5, s["donut_caption"], size=11, color="ink2", spacing=1.05,
         name="Donut caption")
    x0 = 8.15
    label(slide, x0, TOP + 0.05, 4, "Milestones", color="ink2", size=10)
    y = TOP + 0.4
    for when, what in s["milestones"]:
        box(slide, x0, y, RIGHT - x0, 0.78, fill="card", line="line", radius=0.08)
        text(slide, x0 + 0.25, y, RIGHT - x0 - 0.5, 0.78, [[(when + "  ", {"bold": True, "color": "brand"}),
                                                             (what, {})]], size=12.5, anchor=MSO_ANCHOR.MIDDLE,
             spacing=1.05)
        y += 0.9
    box(slide, LEFT, 5.95, CW, 0.82, fill="brand", radius=0.12).name = "Closing"
    picture(slide, ASSETS / "censio-mark.png", LEFT + 0.3, 6.11, 0.5, 0.5)
    text(slide, LEFT + 1.0, 5.95, CW - 1.3, 0.82, s["closing"], size=24, font=HEAD, bold=True, color="card",
         anchor=MSO_ANCHOR.MIDDLE)


BUILDERS = {
    "cover": s_cover, "vision": s_vision, "problem": s_problem, "solution": s_solution, "demo": s_demo,
    "market": s_market, "competition": s_competition, "traction": s_traction, "gtm": s_gtm, "team": s_team,
    "financials": s_financials, "ask": s_ask,
}


def page_background(prs):
    """The master background becomes the prototype's page grey (template: 95% white)."""
    bg = prs.slide_master._element.find(".//" + qn("p:bg"))
    if bg is not None:
        fill = bg.find(".//" + qn("a:solidFill"))
        for child in list(fill):
            fill.remove(child)
        etree.SubElement(fill, qn("a:srgbClr"), val=COL["page"])


def video_cues() -> str:
    """Timestamps in the 30-second video, from the capture marks, so the narration can follow the picture."""
    import json
    marks = json.loads((OUT / "demo-marks.json").read_text())
    factor = 30.0 / (marks["end"] - marks["start"])
    steps = [("documents", "client uploads"), ("ai-at-work", "AI at work"), ("review", "valuer review"),
             ("revalue", "note & revalue"), ("accept", "accepts the rest"), ("sign", "signs"),
             ("report", "client's report")]
    cues = [f"{int((marks[k] - marks['start']) * factor) // 60}:{int((marks[k] - marks['start']) * factor) % 60:02d}"
            f" {what}" for k, what in steps]
    return "Video cues: " + " · ".join(cues)


def build_deck(base: Path = OUT / "base.pptx", out: Path = OUT / "Censio-Pitch.pptx") -> Path:
    prs = Presentation(str(base))
    page_background(prs)
    layout = prs.slide_layouts[0]
    for n, s in enumerate(C.SLIDES, start=1):
        slide = prs.slides.add_slide(layout)
        if s["key"] not in ("cover",):
            frame(slide, n, s, dark=s["key"] == "demo")
        BUILDERS[s["key"]](slide, s)
        slide.notes_slide.notes_text_frame.text = C.notes_text(s, video_cues() if s["key"] == "demo" else "")
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_table:
                plain_table(shape)
    prs.core_properties.title = "Censio — pitch"
    prs.core_properties.author = "Censio team"
    prs.save(str(out))
    return out


if __name__ == "__main__":
    print("wrote", build_deck())
