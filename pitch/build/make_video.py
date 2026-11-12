"""Cuts the raw demo recording (capture.mjs) to exactly 30 seconds: H.264 MP4 plus a poster frame.

    python3 pitch/build/make_video.py pitch/out
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

TARGET_SECONDS = 30.0


def main(out_dir: Path) -> None:
    raw = out_dir / "demo-raw.webm"
    marks = json.loads((out_dir / "demo-marks.json").read_text())
    start, end = marks["start"], marks["end"]
    factor = TARGET_SECONDS / (end - start)
    mp4 = out_dir / "censio-demo-30s.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{end - start:.3f}", "-i", str(raw),
         "-vf", f"setpts=PTS*{factor:.5f},fps=30,scale=1920:1200:flags=lanczos", "-an",
         "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         str(mp4)],
        check=True,
    )
    # Poster: the revision after the senior's note (differs from the cover's review screen).
    poster_at = (marks["accept"] - start) * factor - 0.3
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{poster_at:.2f}", "-i", str(mp4), "-frames:v", "1",
         str(out_dir / "demo-poster.png")],
        check=True,
    )
    for stray in out_dir.glob("page@*.webm"):
        stray.unlink()
    print(f"wrote {mp4} (speed x{1 / factor:.2f}) and demo-poster.png")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "pitch/out"))
