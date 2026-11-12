#!/usr/bin/env bash
# Renders the deck to PDF (fonts embedded) and slide PNGs for visual checks.
#   bash pitch/build/render.sh            (needs LibreOffice, poppler, and Space Grotesk + Inter installed)
set -euo pipefail
OUT="$(cd "$(dirname "$0")/../out" && pwd)"
cd "$OUT"
rm -f Censio-Pitch.pdf
soffice --headless --convert-to pdf --outdir "$OUT" Censio-Pitch.pptx >/dev/null 2>&1 \
  || python3 "${PPTX_SKILL:-/nonexistent}/scripts/office/soffice.py" --headless --convert-to pdf --outdir "$OUT" Censio-Pitch.pptx
rm -rf render && mkdir render
pdftoppm -png -r 110 Censio-Pitch.pdf render/slide
pdffonts Censio-Pitch.pdf
