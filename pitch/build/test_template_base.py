"""The base deck is empty, small and carries the Censio theme (plan Task 3). Needs pitch/out/base.pptx."""

import re
import zipfile
from pathlib import Path

import pytest
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT

BASE = Path(__file__).resolve().parents[1] / "out" / "base.pptx"
pytestmark = pytest.mark.skipif(not BASE.exists(), reason="run template_base.py with the licensed template first")


def test_base_has_no_slides_or_template_text():
    assert len(Presentation(str(BASE)).slides) == 0
    with zipfile.ZipFile(BASE) as z:
        text = " ".join(z.read(n).decode("utf8", "ignore") for n in z.namelist() if n.endswith(".xml"))
    for leftover in ("Lorem", "Subtitle Here", "PRESENTATION", "creativeslides"):
        assert leftover not in text


def test_theme_is_censio():
    prs = Presentation(str(BASE))
    theme = prs.slide_master.part.part_related_by(RT.THEME).blob.decode("utf8")
    assert re.search(r'<a:accent1>\s*<a:srgbClr val="0B5D4B"', theme)
    assert 'typeface="Space Grotesk"' in theme and 'typeface="Inter"' in theme


def test_size_kept():
    prs = Presentation(str(BASE))
    assert (prs.slide_width, prs.slide_height) == (12192000, 6858000)


def test_base_is_small():
    assert BASE.stat().st_size < 3_000_000
