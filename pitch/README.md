# Pitch-Deck (5 Minuten, Englisch)

Dieser Ordner enthält alles, um das Pitch-Deck für Censio neu zu bauen: die Zahlen, die Texte und die Folien. Der Plan mit allen Quellen und Annahmen steht in [`docs/superpowers/specs/2026-11-12-censio-pitch-deck-design.md`](../docs/superpowers/specs/2026-11-12-censio-pitch-deck-design.md).

## Was ihr bekommt

| Datei | Wofür |
|---|---|
| `out/Censio-Pitch.pptx` | Das Deck zum Bearbeiten und Präsentieren. Der Sprechtext steht in den Notizen, das 30-Sekunden-Demo-Video ist auf Folie 5 eingebettet und startet von selbst |
| `out/Censio-Pitch.pdf` | Backup zum Präsentieren, Schriften eingebettet, ohne Video |
| `out/censio-demo-30s.mp4` | Das Demo-Video einzeln, z. B. für Google Slides oder als Backup |
| `out/Censio-Financial-Model.xlsx` | Das Finanzmodell hinter allen Zahlen im Deck (Backup für Fragen), siehe unten |

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

## Finanzmodell (Backup)

`out/Censio-Financial-Model.xlsx` ist das Modell hinter Umsatz, Marge, EBITDA und Cash im Deck. Folie 13 (Anhang, nach der Ask-Folie) fasst es zusammen. Präsentiert wird sie nicht, sie ist für Fragen gedacht.

**So ist es aufgebaut:**

- **Assumptions:** Jede Eingabe steht genau einmal hier, in blauer Schrift. Daneben steht die Art:
  - **S:** öffentliche Quelle (z. B. Steuersätze, Sozialabgaben, GEWOS)
  - **B:** aus öffentlichen Benchmarks abgeleitet (z. B. Gehälter, Büro, Gebühren)
  - **T:** eure Markterfahrung (Preis)
  - **A:** unsere Annahme, die wir beweisen müssen (Volumen, 2 Senior-Stunden, Deals)

  Dazu steht in jeder Zeile, warum der Wert so gewählt ist und welche Quelle dahintersteht.
- **Alle anderen Blätter rechnen nur mit Formeln:**
  - Revenue, Team und P&L: vom Umsatz über die Kosten bis zum Jahresüberschuss, mit Steuer und Verlustvortrag
  - Cash flow und Use of funds: Liquidität und wofür die Runde ausgegeben wird
  - Unit economics: eine Bewertung, ein Deal
  - Market und Downside: Marktgröße und der Stressfall
- **Peer check** stellt eure Marge und die Deal-Zahlen neben Scout24, Zillow, CBRE & Co. Das Blatt zeigt offen, was stimmen muss. Am ehrgeizigsten sind 1.500 Deals 2031 und rund 75 Deals pro Deal-Manager.
- **Deck tie-out** verknüpft jede Zahl im Deck mit ihrer Zelle.
- **Checks** muss überall TRUE zeigen.
- **Sources** listet alle Quellen mit Link.

**Ausprobieren:** Auf Assumptions stehen gelbe Hebel für Volumen, Preis, Senior-Stunden und Deals (1,00× = Plan). Ändert man einen Hebel, rechnet das ganze Modell neu. Checks und Deck tie-out zeigen dann an, dass das Deck nicht mehr zum Modell passt. So ist es gewollt.

**Zahlen im Deck ändern:** Die Eingaben stehen in `build/model.py`, die Erklärungen und Quellen in `build/model_sources.py`. Danach neu bauen:

```bash
python3 pitch/build/model.py && python3 pitch/build/build_model_xlsx.py && python3 pitch/build/deck.py
```

Eine Änderung nur in der Excel-Datei ändert das Deck nicht.

**Prüfen:** `cd pitch/build && python3 -m pytest -q`. Der Test `test_model_xlsx.py` lässt LibreOffice alle Formeln rechnen und vergleicht jede Zeile mit `model.py`.

**Vorsicht bei den Quellen:**
- Die meisten Seiten konnten aus der Build-Umgebung nur über Such-Auszüge gelesen werden. Ein zweiter Suchlauf hat sie gegengeprüft. Wo das nicht ging, steht es bei der Quelle.
- Vor externer Nutzung einmal die Links öffnen.
- Die Berufshaftpflicht (€50 pro Bewertung) ist ein Platzhalter, bis ein Makler ein Angebot macht.

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
