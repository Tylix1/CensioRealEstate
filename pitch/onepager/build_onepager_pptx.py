"""Builds the one pager as an editable PowerPoint slide (native shapes and text, no screenshot).

    node pitch/onepager/measure.mjs pitch/out/onepager/onepager.html pitch/out/onepager/layout.json
    python3 pitch/onepager/build_onepager_pptx.py      # writes pitch/out/onepager/Censio-OnePager.pptx

Positions come from the rendered HTML (layout.json, CSS px at 96 px per inch), so the slide matches the PDF.
Copy comes from build_onepager.ONE_PAGER; colours, fonts and shape helpers from the pitch deck builder.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "build"))
sys.path.insert(0, str(HERE))
import deck as D  # noqa: E402
import content as C  # noqa: E402
from build_onepager import ONE_PAGER as O  # noqa: E402

OUT = HERE.parent / "out" / "onepager"
PX = 1 / 96          # inches per CSS px
PT = 0.75            # points per CSS px
LINE = 1.21          # Inter / Space Grotesk: PowerPoint's single spacing is about 1.21 x the font size


def inch(rect, grow=0.0):
    return rect["x"] * PX, rect["y"] * PX, (rect["w"] + grow) * PX, rect["h"] * PX


def runs_from_markup(text, base, highlight):
    """'[[By 2032,]] anyone ...' -> runs; the template's fixed words get the highlight style."""
    parts = re.split(r"(\[\[.+?\]\])", text)
    return [(p[2:-2], highlight) if p.startswith("[[") else (p, base) for p in parts if p]


def tb(slide, rect, paragraphs, size_px, line_height=1.38, grow=2.0, **kw):
    x, y, w, h = inch(rect, grow)
    shape = D.text(slide, x, y, w, h + 0.05, paragraphs, size=size_px * PT, spacing=line_height / LINE, **kw)
    return shape


def letter_space(shape, spc=60):
    for p in shape.text_frame.paragraphs:
        for r in p.runs:
            r._r.get_or_add_rPr().set("spc", str(spc))


def card(slide, rect, fill="card", line="line", radius_px=10, name=None):
    x, y, w, h = inch(rect)
    s = D.box(slide, x, y, w, h, fill=fill, line=line, radius=radius_px * PX)
    if name:
        s.name = name
    return s


def label(slide, rect, words, colour, size_px=9.6):
    s = tb(slide, rect, [[(words.upper(), {"bold": True})]], size_px, line_height=1.2, grow=40, color=colour)
    letter_space(s)
    return s


def body_rect(card_info, below):
    """The text area of a card: inside its padding, from just under `below` to the card's bottom."""
    b, p = card_info["box"], card_info["pad"]
    top = below["y"] + below["h"] + 2
    return {"x": b["x"] + p["l"], "y": top, "w": b["w"] - p["l"] - p["r"], "h": b["y"] + b["h"] - top - 6}


def build(layout_path: Path = OUT / "layout.json", out: Path = OUT / "Censio-OnePager.pptx") -> Path:
    L = json.loads(layout_path.read_text())
    prs = Presentation(str(D.OUT / "base.pptx"))
    D.page_background(prs)
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    D.background(slide, "page")

    # Header band
    x, y, w, h = inch(L["header"])
    D.box(slide, x, y, w, h, fill="ink", radius=0, shape=MSO_SHAPE.RECTANGLE).name = "Header"
    mx, my, mw, mh = inch(L["mark"])
    D.picture(slide, D.ASSETS / "censio-mark.png", mx, my, mw, mh, name="Censio mark")
    tb(slide, L["h1"], [[(O["name"], {"bold": True, "font": D.HEAD})]], 25, line_height=1.2, grow=8, color="card",
       anchor=MSO_ANCHOR.MIDDLE)
    tb(slide, L["tag"], O["tagline"], 13.5, line_height=1.2, grow=10, color="brand_accent", anchor=MSO_ANCHOR.MIDDLE)
    meta = dict(L["meta"])
    meta["x"] -= 40
    meta["w"] += 40
    tb(slide, meta, ["One pager · AI-Native Ventures · ESMT Berlin", "November 2026"], 10.5, line_height=1.3,
       grow=0, color="faint", align=PP_ALIGN.RIGHT)

    # Wedge, pain point, budget owner
    for i, (info, (title, text_)) in enumerate(zip(L["strip"], [("Wedge", O["wedge"]), ("Pain point", O["pain"]),
                                                                ("Budget owner", O["budget"])])):
        card(slide, info["box"], line="brand" if i == 0 else "line", radius_px=9, name=f"{title} card")
        label(slide, info["label"], title, "brand")
        area = body_rect(info, info["label"])
        if i == 0:
            tb(slide, area, [[(text_, {"bold": True, "font": D.HEAD})]], 13, line_height=1.25)
        else:
            tb(slide, area, text_, 10.4)

    # Vision and mission (dark cards)
    v = L["vision"]
    card(slide, v["box"], fill="brand", line=None, name="Vision card")
    label(slide, v["label"], "Vision · the world in 2032", "brand_accent")
    tb(slide, v["statement"], [runs_from_markup(O["vision"], {"font": D.HEAD, "color": "card"},
                                                {"font": D.HEAD, "color": "brand_accent", "bold": True})],
       13.4, line_height=1.3)
    m = L["mission"]
    card(slide, m["box"], fill="brand", line=None, name="Mission card")
    label(slide, m["label"], "Mission · our contribution", "brand_accent")
    tb(slide, m["statement"], [runs_from_markup(O["mission"], {"font": D.HEAD, "color": "card"},
                                                 {"font": D.HEAD, "color": "brand_accent", "bold": True})],
       12.6, line_height=1.3)
    for rect, head, items in zip(m["guard"], ["We will", "We will not"], [O["will"], O["will_not"]]):
        paras = [[(head.upper(), {"bold": True, "color": "brand_accent", "size": 9.2 * PT})]]
        paras += [[("· " + it, {})] for it in items]
        s = tb(slide, rect, paras, 9.6, line_height=1.38, color="brand_weak")
        s.text_frame.paragraphs[0].runs[0]._r.get_or_add_rPr().set("spc", "50")

    # Playbook
    pb = L["playbook"]
    card(slide, pb["box"], name="Playbook card")
    label(slide, pb["label"], "Playbook · five years of focus", "brand")
    tb(slide, pb["title"], [[(O["playbook_title"], {"bold": True, "font": D.HEAD})]], 13.4, line_height=1.3)
    for i, (st, (when, theme, text_, target, unit)) in enumerate(zip(pb["stages"], O["playbook"])):
        wedge, lead = i == 0, i == len(O["playbook"]) - 1
        fill = "brand_weak" if wedge else ("ink" if lead else "card")
        line = "brand_accent" if wedge else (None if lead else "line")
        card(slide, st["box"], fill=fill, line=line, radius_px=8, name=f"Stage {i + 1}")
        tb(slide, st["when"], [[(when, {"bold": True})]], 10, line_height=1.2, grow=4,
           color="brand_accent" if lead else "brand", anchor=MSO_ANCHOR.MIDDLE)
        ink = "card" if lead else "ink"
        tb(slide, st["what"], [[(theme + ".", {"bold": True}), (" " + text_, {})]], 10.4, line_height=1.38,
           color=ink)
        ns = dict(st["ns"])
        ns["x"] -= 6
        small = {"color": "card" if lead else "ink2"}
        tb(slide, ns, [[(target, {"bold": True, "font": D.HEAD, "size": 15 * PT, "color": ink})],
                       [(unit, small)], [("North Star target", small)]],
           9, line_height=1.15, grow=6, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)

    # North Star: one metric per phase
    ns = L["northstar"]
    card(slide, ns["box"], line="ai_strong", name="North Star card")
    label(slide, ns["label"], "North Star · one metric per phase", "ai")
    for i, (blk, data) in enumerate(zip(ns["blocks"], O["north_stars"])):
        if i:
            bx, by, bw, _ = inch(blk["box"])
            sep = slide.shapes.add_connector(1, D.Inches(bx), D.Inches(by), D.Inches(bx + bw), D.Inches(by))
            sep.line.color.rgb = D.rgb("line")
        tb(slide, blk["phase"], [[(data["phase"], {"bold": True})]], 9, line_height=1.2, grow=20, color="ai")
        tb(slide, blk["statement"], [[(data["statement"], {"bold": True, "font": D.HEAD})]], 11.2, line_height=1.25)
        runs = []
        for j, (k, v) in enumerate(data["parts"]):
            runs += [(k.upper(), {"bold": True, "color": "muted", "size": 7.4 * PT}), (" " + v, {})]
            if j < len(data["parts"]) - 1:
                runs.append(("  ·  ", {}))
        tb(slide, blk["parts"], [runs], 8.3, line_height=1.3, grow=12, color="ink2")
    tb(slide, ns["proxy"], O["north_star_proxy"], 9, line_height=1.3, color="ink2")

    # Moat and frontier lab test
    mo = L["moat"]
    card(slide, mo["box"], name="Moat card")
    label(slide, mo["label"], "Moat · built along the journey", "valuer")
    for rect, (name, tag, text_) in zip(mo["items"], O["moats"]):
        tb(slide, rect, [[(name, {"bold": True}), ("  " + tag.upper(), {"color": "muted", "size": 8.4 * PT}),
                          ("  " + text_, {})]], 9.6, line_height=1.3)
    tx, ty, tw, th = inch(mo["test"])
    D.box(slide, tx, ty, tw, th, fill="valuer_weak", radius=7 * PX).name = "Frontier lab test"
    inner = {"x": mo["test"]["x"] + 9, "y": mo["test"]["y"] + 5, "w": mo["test"]["w"] - 18, "h": mo["test"]["h"] - 8}
    tb(slide, inner, [[("Frontier lab test.", {"bold": True, "color": "valuer"}), (" " + O["frontier_test"], {})]],
       9.7, line_height=1.32, color="ink")

    # Team
    f = L["footer"]
    card(slide, f["box"], name="Team card")
    label(slide, f["label"], "Team", "brand")
    team = C.load_team()
    for i, (slot, member) in enumerate(zip(f["founders"], team[:4])):
        ax, ay, aw, ah = inch(slot["avatar"])
        D.dot(slide, ax, ay, aw, "brand_weak").name = f"Founder {i + 1} avatar"
        initials = "".join(p[0] for p in member["name"].split()[:2]).upper()
        D.text(slide, ax, ay, aw, ah, [[(initials, {"bold": True})]], size=11.5 * PT, color="brand",
               align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        tb(slide, slot["text"], [[(member["name"], {"bold": True})],
                                 [(f"{member['role']} · {member.get('school', '')}", {"color": "ink2",
                                                                                     "size": 9.6 * PT})]],
           10.4, line_height=1.25, grow=8, anchor=MSO_ANCHOR.MIDDLE)
    mx, my, mw, mh = inch(f["model"])
    D.box(slide, mx, my, mw, mh, fill="valuer_weak", radius=7 * PX).name = "AI-native team"
    inner = {"x": f["model"]["x"] + 9, "y": f["model"]["y"] + 6, "w": f["model"]["w"] - 18, "h": f["model"]["h"] - 10}
    tb(slide, inner, [[("AI-native team.", {"bold": True}), (" " + O["team_model"], {})]], 9.6, line_height=1.3,
       color="valuer")

    prs.core_properties.title = "Censio RE · One pager"
    prs.core_properties.author = "Censio team"
    prs.save(str(out))
    return out


if __name__ == "__main__":
    print("wrote", build())
