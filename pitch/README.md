# Pitch-Deck (5 Minuten, Englisch)

Dieser Ordner enthält alles, um das Pitch-Deck für Censio neu zu bauen: die Zahlen, die Texte und die Folien. Der Plan mit allen Quellen und Annahmen steht in [`docs/superpowers/specs/2026-11-12-censio-pitch-deck-design.md`](../docs/superpowers/specs/2026-11-12-censio-pitch-deck-design.md).

## Was ihr bekommt

| Datei | Wofür |
|---|---|
| `out/Censio-Pitch.pptx` | Das Deck zum Bearbeiten und Präsentieren. Der Sprechtext steht in den Notizen, das 30-Sekunden-Demo-Video ist auf Folie 5 eingebettet und startet von selbst |
| `out/Censio-Pitch.pdf` | Backup zum Präsentieren, Schriften eingebettet, ohne Video |
| `out/censio-demo-30s.mp4` | Das Demo-Video einzeln, z. B. für Google Slides oder als Backup |

`out/` liegt nicht im Repository. Das Repo ist öffentlich, und das Deck enthält eure Namen und das gekaufte Template. Die Dateien bekommt ihr direkt aus der Session. Teilt sie über Drive oder Teams.

## Präsentieren

1. **Schriften installieren** (einmal, 2 Minuten): [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) und [Inter](https://fonts.google.com/specimen/Inter), jeweils „Get font“ → „Download all“ → installieren. Ohne die Schriften ersetzt PowerPoint sie, dann verrutschen Zeilen. Das PDF sieht immer richtig aus.
2. **Folie 5** spielt das Video automatisch ab. Falls nicht: in PowerPoint auf das Video klicken, „Wiedergabe“ → „Start: Automatisch“.
3. **Google Slides:** PPTX hochladen. Die Schriften sind dort schon vorhanden. Das Video muss man neu einfügen (aus Drive, `censio-demo-30s.mp4`).
4. **Zeit:** Die Folien sind auf 4:45 geplant (davon 0:30 Video), es bleiben 15 Sekunden Puffer für Klicks und Übergaben. Der Sprechtext hat rund 610 gesprochene Wörter, wobei jede Zahl als drei Wörter zählt. Die Sekunden pro Folie stehen in `build/content.py` (`seconds`). Auf Folie 5 stehen in den Notizen Zeitmarken, damit ihr synchron zum Video sprecht.
5. **Fragen:** Unter jedem Sprechtext stehen „If asked“-Antworten und die Quellen.

## Ändern

- **Texte und Sprechtext:** `build/content.py`
- **Zahlen:** `build/model.py`. Danach `python3 pitch/build/model.py` ausführen, das schreibt `numbers.json`. Die Folien lesen die Zahlen nur von dort.
- **Namen und Rollen:** `build/team.local.json` (wird nicht committet). Vorlage: `build/team.example.json`.
- **Layout:** `build/deck.py`

Wer nur ein Wort ändern will, macht das direkt in PowerPoint. Beim nächsten Neubau wäre die Änderung dann aber weg.

## Neu bauen

Voraussetzungen: Python 3 mit `python-pptx`, `Pillow`, `pytest`; Node mit Playwright (im Repo); `ffmpeg`; LibreOffice; die beiden Schriften. Den Prototyp baut und startet ihr ohne API-Key, also im Demo-Modus.

```bash
python3 pitch/build/model.py
```

```bash
npm run build && npm run start -- -p 3100
```

In einem zweiten Terminal:

```bash
node pitch/build/capture.mjs http://localhost:3100 pitch/assets pitch/out
```

```bash
python3 pitch/build/make_video.py pitch/out
```

```bash
python3 pitch/build/template_base.py "<Pfad zum gekauften Template>.pptx" pitch/out
```

```bash
python3 pitch/build/deck.py
```

```bash
bash pitch/build/render.sh
```

```bash
cd pitch/build && python3 -m pytest -q
```

Die Tests prüfen unter anderem: Zahlen auf den Folien gleich Modell, Sprechtext passt in die Zeit, nur Farben aus dem Prototyp, nur die zwei Schriften, Text passt auch mit 10 % breiterer Ersatzschrift, Video und Vorschaubild auf Folie 5.

## One-Pager (Group work 1)

Nach der Kursvorlage (Session 2, S. 37), als PDF und als editierbare PPTX. Die Texte stehen in `onepager/build_onepager.py` (`ONE_PAGER`), die Zahlen kommen aus `build/numbers.json`.

```bash
python3 pitch/onepager/build_onepager.py
```

```bash
node pitch/onepager/render.mjs pitch/out/onepager/onepager.html pitch/out/onepager/Censio-OnePager.pdf pitch/out/onepager/preview.png
```

```bash
node pitch/onepager/measure.mjs pitch/out/onepager/onepager.html pitch/out/onepager/layout.json
```

```bash
python3 pitch/onepager/build_onepager_pptx.py
```

Der Render-Schritt bricht mit einem Fehler ab, sobald Text über eine Karte hinausläuft. Die PPTX übernimmt die Positionen aus der gerenderten Seite.
