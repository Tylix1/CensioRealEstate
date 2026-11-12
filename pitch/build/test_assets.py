"""The prototype screenshots and the demo video exist and are usable (plan Task 2)."""

import json
import subprocess
from pathlib import Path

import pytest
from PIL import Image, ImageStat

PITCH = Path(__file__).resolve().parents[1]
SHOTS = ["hero-review", "flag-evidence", "revision", "ai-at-work", "wizard-documents", "report", "approve-sheet"]


@pytest.mark.parametrize("name", SHOTS)
def test_screenshot(name):
    image = Image.open(PITCH / "assets" / f"{name}.png")
    assert image.size == (2880, 1800)
    assert max(ImageStat.Stat(image.convert("L")).stddev) > 10, "blank screenshot"


def test_demo_video():
    mp4 = PITCH / "out" / "censio-demo-30s.mp4"
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
         "-of", "json", str(mp4)], capture_output=True, text=True, check=True).stdout)
    assert 29.0 <= float(probe["format"]["duration"]) <= 31.0
    stream = probe["streams"][0]
    assert stream["codec_name"] == "h264"
    assert (stream["width"], stream["height"]) == (1920, 1200)


def test_poster():
    poster = Image.open(PITCH / "out" / "demo-poster.png")
    assert poster.size == (1920, 1200)
    assert max(ImageStat.Stat(poster.convert("L")).stddev) > 10
