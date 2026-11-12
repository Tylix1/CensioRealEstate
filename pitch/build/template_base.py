"""Turns the team's licensed pitch template into an empty, Censio-themed base deck.

    python3 pitch/build/template_base.py <template.pptx> pitch/out

Keeps the slide master, its blank "Title Slide" layout and the 13.333 x 7.5 in canvas; exports the template's
laptop mockup (slide 189) to laptop.png; deletes all sample slides and the other layouts (their media goes with
them on save); sets the theme colours and fonts to the prototype's tokens. The template itself is a licensed
asset and is never copied into the repository.
"""

from __future__ import annotations

import sys
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS = {"a": A}
LAPTOP_SLIDE = 189  # 1-based, "Laptop Device"
KEEP_LAYOUT = "Title Slide"

THEME_COLOURS = {
    "dk1": "101828",      # ink
    "lt1": "FFFFFF",      # card
    "dk2": "0B5D4B",      # brand
    "lt2": "F2F4F7",      # page
    "accent1": "0B5D4B",  # brand
    "accent2": "F79009",  # AI
    "accent3": "5B3CC4",  # valuer
    "accent4": "1849A9",  # documents
    "accent5": "7FD1B9",  # brand accent
    "accent6": "475467",  # ink 2
    "hlink": "0B5D4B",
    "folHlink": "5B3CC4",
}
HEAD_FONT, BODY_FONT = "Space Grotesk", "Inter"


def export_laptop(prs, out: Path) -> Path:
    slide = prs.slides[LAPTOP_SLIDE - 1]
    picture = next(s for s in slide.shapes if s.shape_type == 13)  # PICTURE
    path = out / f"laptop.{picture.image.ext}"
    path.write_bytes(picture.image.blob)
    return path


def drop_slides(prs) -> None:
    id_list = prs.slides._sldIdLst
    for sld_id in list(id_list):
        prs.part.drop_rel(sld_id.rId)
        id_list.remove(sld_id)


def drop_layouts(prs) -> None:
    master = prs.slide_master
    id_list = master._element.find("{http://schemas.openxmlformats.org/presentationml/2006/main}sldLayoutIdLst")
    for layout, entry in zip(list(master.slide_layouts), list(id_list)):
        if layout.name != KEEP_LAYOUT:
            master.part.drop_rel(entry.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"))
            id_list.remove(entry)


def retheme(prs) -> None:
    theme_part = prs.slide_master.part.part_related_by(RT.THEME)
    root = etree.fromstring(theme_part.blob)
    scheme = root.find(".//a:clrScheme", NS)
    scheme.set("name", "Censio")
    for name, hex_value in THEME_COLOURS.items():
        slot = scheme.find(f"a:{name}", NS)
        for child in list(slot):
            slot.remove(child)
        etree.SubElement(slot, f"{{{A}}}srgbClr", val=hex_value)
    fonts = root.find(".//a:fontScheme", NS)
    fonts.set("name", "Censio")
    for tag, face in (("majorFont", HEAD_FONT), ("minorFont", BODY_FONT)):
        fonts.find(f"a:{tag}/a:latin", NS).set("typeface", face)
    theme_part._blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def make_base(template: Path, out: Path) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    prs = Presentation(str(template))
    export_laptop(prs, out)
    drop_slides(prs)
    drop_layouts(prs)
    retheme(prs)
    base = out / "base.pptx"
    prs.save(str(base))
    return base


if __name__ == "__main__":
    template_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2] if len(sys.argv) > 2 else "pitch/out")
    print("wrote", make_base(template_path, out_dir))
