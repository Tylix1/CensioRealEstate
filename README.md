# Censio RE — clickable prototype

A clickable prototype of Censio RE: an AI-prepared, valuer-signed property valuation, end to end, on one sample deal.
Everything in it is sample data; it is not a valuation report.

## Kurzüberblick

**Anleitung fürs Team (Schritt für Schritt, ohne Vorwissen):** [ANLEITUNG.md](ANLEITUNG.md): online stellen, testen,
Video aufnehmen, gemeinsam ändern.

**Pitch-Deck (5 Minuten, mit 30-Sekunden-Demo):** [pitch/README.md](pitch/README.md): präsentieren, ändern, neu bauen.

**Was ist das?** Ein klickbarer Prototyp von Censio RE für die Ertragswert-Bewertung eines Mehrfamilienhauses
(Musterstraße 12, 04109 Leipzig, Beispieldaten). Der Auftraggeber (Demo Capital GmbH) lädt seine Unterlagen hoch, die
KI liest sie und legt die Einheiten an, eine feste Rechenlogik ohne KI ermittelt den Ertragswert, und der Senior Valuer
(K. Vogel) prüft die vier Ermessensentscheidungen der KI, lässt per Notiz neu rechnen („Revalue“) und gibt den Bericht
frei. Der Kunde lädt danach das PDF herunter.

**Lokal starten:** `npm ci`, dann `npm run dev` und <http://localhost:3000> öffnen. Ohne weitere Einstellungen läuft
alles im **Demo-Modus**.

**Demo-Modus und Live-KI**
- **Demo-Modus** (Standard, kostenlos): Die fünf Musterdokumente werden aus gespeicherten KI-Ergebnissen „gelesen“;
  Notizen an die KI versteht ein regelbasierter Parser, mit anklickbaren Beispielnotizen.
- **Live-KI:** nur, wenn auf dem Server `ANTHROPIC_API_KEY` und `DEMO_ACCESS_CODE` gesetzt sind **und** der Link den
  Code trägt: `/?code=<Code>`. Das Abzeichen in der Demo-Leiste zeigt dann „Live AI“. Diesen Link nur gezielt
  weitergeben (z. B. an den Professor).
- **Kostenbremse:** Die harte Grenze ist das **monatliche Ausgabenlimit in der Anthropic Console** (Vorschlag: 20 $).
  Ein kompletter Demo-Durchlauf mit Live-KI kostet etwa 0,50 $. Zusätzlich erlaubt die App pro IP-Adresse und Stunde
  3 Dokument-Auslesungen (je 5 PDFs) und 15 Notizen.

**Veröffentlichen:** die sechs Schritte der [Deploy-Checkliste für Vercel](#deploy-checklist-vercel).

**Video aufnehmen:** vor jeder Aufnahme **Reset demo** klicken, dann `/?recording=1` öffnen (blendet die Demo-Leiste
aus). Ablauf: New valuation → Use sample documents → Submit → Open as Senior Valuer → Prüfung 1 öffnen → die
einstudierte Beispielnotiz („Cap rate too low … Use 3.4 %.“) senden → Revision 2 mit €1,210,000 → Prüfungen 2–4
akzeptieren → Approve & send report → Sign & send → als Kunde das PDF herunterladen. Einzelheiten:
[Recording the video](#recording-the-video).

**Prüfen, ob alles läuft:** `npm test` und `npm run e2e`. Der End-to-End-Test spielt den kompletten Video-Ablauf
automatisch durch.

## What this is

One Next.js app with two roles, **Client** (Demo Capital GmbH) and **Senior Valuer** (K. Vogel), and a demo bar to
switch between them, reset the demo and see whether Live AI is on. The sample deal is `CEN-2026-0147`, Musterstraße 12,
04109 Leipzig, valuation date 6 Nov 2026.

- **Client wizard (C1–C4):** property, documents, units, review and submit. Each uploaded PDF is read by Claude, or
  from a committed result in Demo mode, and every quote the AI cites is checked against the PDF's text layer. "AI at
  work" shows the real run log.
- **Valuation (deterministic, no AI):** the Ertragswert (income approach) under ImmoWertV, with sample lookups (land
  value, market report, rent estimate), cross-checks and the four AI judgement calls the valuer has to look at.
- **Valuer review (V1–V4):** the queue; the review screen with "Needs your eye" and the evidence (PDF viewer with the
  quoted passage highlighted, maps); the Revalue loop, where a note to the AI creates a new version with a table of
  changes (and undo); Approve & send report with sign-off.
- **Report (C5):** the delivered report page and a downloadable PDF.
- **How Censio works** (`/how-it-works`): an explainer for the class.

Every screen carries a "Sample data" pill, and the sample PDFs carry a "MUSTER / SAMPLE" watermark. The design is in
`docs/superpowers/specs/2026-11-06-censio-prototype-design.md`, the build plan in
`docs/superpowers/plans/2026-11-06-censio-prototype.md`.

## Quick start

Needs Node.js 22 (LTS) and npm.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000> and choose "Continue as Demo Capital GmbH" or "Continue as Senior Valuer". Without
environment variables the app runs in Demo mode: no API key needed, no cost. The demo state lives in the browser
(localStorage and IndexedDB) and survives a reload; **Reset demo** in the demo bar restores the seeded state.

A production build, as Vercel runs it: `npm run build && npm run start`.

## Environment variables

`.env.example` lists both. For Live AI on your machine, copy it to `.env.local` (git-ignored; `npm run dev` and
`npm run start` read it) and fill in the values.

| Variable | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | The prototype's own Anthropic API key, from a dedicated workspace with a monthly spend limit. |
| `DEMO_ACCESS_CODE` | A code of your choice. Live AI runs only for browsers that opened `/?code=<this code>`. |

Live AI needs both; with either one missing, every request runs in Demo mode. The key never reaches the browser:
only the server routes `/api/extract` and `/api/revalue` use it.

## Demo mode and Live AI

| | Demo mode | Live AI |
|---|---|---|
| When | The default: no key, no or a wrong access code, or a usage limit reached | Both variables set and the browser opened the link with the matching code |
| Badge in the demo bar | `Demo mode` | `Live AI` |
| The five sample PDFs | Read from the committed results in `fixtures/extraction`, labelled "Demo mode" ("Cached result" once recorded live) | Read by Claude, each quote checked against the PDF text |
| Any other PDF | "Live AI is needed to read this document." The wizard continues; the missing document types become flags. | Read by Claude |
| Revalue note | A rule-based parser for the six parameters (e.g. "use 3.4 %", "attic rent 9.50"), with three clickable example notes | Claude, with the same example notes to click; if the call fails or is declined, the rule-based parser |

**The access code link.** Share `https://<your-app>/?code=<DEMO_ACCESS_CODE>`. The app stores the code in that
browser (it survives Reset demo) and removes it from the address bar, so it does not show in recordings or copied
links. Without the code, or with another one, the app stays in Demo mode.

**Usage limits.** A courtesy layer, counted in memory per server instance (so best effort on serverless):

| Limit | Value |
|---|---|
| Live extractions per IP | 3 batches of 5 PDFs per rolling hour |
| Live Revalue notes per IP | 15 per rolling hour |
| Files per deal | 8 |
| Per PDF | 5 MB and 10 pages (on Vercel, request bodies are capped at 4.5 MB) |
| Note length | 1,000 characters |

When a limit is reached, that request falls back to Demo mode: a sample PDF shows its committed result, a note goes
to the rule-based parser.

**Cost and the hard cap.** Both calls use `claude-opus-5-5` ($4 per million input tokens, $20 per million output
tokens). A full extraction of the sample deal costs about $0.30–0.45, one Revalue note $0.03–0.06, one complete demo
run about $0.50. The guarantee is the **monthly spend limit set in the Anthropic Console** for the prototype's own
workspace and key (suggested: $20). Switching to a cheaper model is the founders' call (Claude Sonnet 5.5 costs about
half, Claude Haiku 5.5 a fraction): it is the `MODEL` constant in `src/lib/server/anthropic.ts`.

## Deploy checklist (Vercel)

1. Import the repo into Vercel.
2. Set `ANTHROPIC_API_KEY` and `DEMO_ACCESS_CODE`.
3. Set a monthly spend limit in the Anthropic Console.
4. Open `/?code=<code>` and check that the badge shows `Live AI`.
5. Run `npm run record:extraction` once locally with the key.
6. Use `?recording=1` for takes.

Notes on the steps:

- **1.** The Next.js preset needs no changes. Vercel Hobby is meant for non-commercial use, which suits the class
  prototype; move to Pro once the app is used commercially.
- **2.** Project → Settings → Environment Variables (Production, and Preview if wanted), then redeploy: variables
  apply to new deployments only. Choose a code that is hard to guess.
- **3.** Use a dedicated workspace for the prototype (the Default Workspace takes no spend limit; suggested limit $20
  a month). Create the key in the Claude Console scoped to that workspace: a key without a workspace needs an
  `anthropic-workspace-id` header on every request, which the app does not send. Give the key an expiry that outlasts
  the project.
- **4.** Without the code the badge shows `Demo mode`, which is what everyone else sees. The badge only checks that
  both variables are set, not that Anthropic accepts the key: with the code, "Use sample documents" must label every
  document `Live AI`; a rejected key falls back to the committed results, labelled `Demo mode`. Without the code, also
  check that "Use sample documents" reads all five documents: `/api/extract` must find the committed results
  (`next.config.ts` traces `fixtures/extraction` into that function).
- **5.** With the key and code in `.env.local`: `npm run record:extraction -- --env-file=.env.local`. Then run
  `npm test` and `npm run e2e`, commit `fixtures/extraction` and push; Vercel redeploys and the samples show as
  "Cached result" in Demo mode. See below.
- **6.** See [Recording the video](#recording-the-video).

### `npm run record:extraction`

Replaces the committed extraction results of the five sample PDFs with a real Live AI run (spec §6.4).

- It needs both variables, from the shell or from `--env-file=<path>` (variables already set win). Without them it
  stops with a message, exits non-zero and touches nothing.
- Each sample PDF goes through the extraction route's own code, with the access code: same prompt, schema, limits and
  quote check as the deployed app.
- It writes only if all five were read live, kept their document type, and every quote was found on its page with no
  low-confidence field (either would raise an extraction flag in the demo). Otherwise it exits non-zero and leaves the
  fixtures as they were.
- It lists the cited values that differ from the committed results; `npm test` then checks that the recording still
  reproduces the sample's facts.
- `--dry-run` reads and checks without writing; `--help` lists the options. To go back to the demo fixtures:
  `git checkout fixtures/extraction`.

## Recording the video

The video script of spec §5.2, about 60–90 s. `tests/e2e/demo-path.spec.ts` plays this exact take in recording mode,
so a green `npm run e2e` before a recording session means the path works.

**Before each take**

- Click **Reset demo** in the demo bar. The new request then gets `CEN-2026-0147` again, the stored files are cleared,
  and the access code is kept.
- Then open `/?recording=1` (for a Live AI take, open the `/?code=<code>` link once first: the code is remembered).
  The demo bar and the orientation overlay stay hidden for the whole browser tab; `?recording=0` brings them back,
  for example for the next Reset demo.
- For a take filmed without the browser's own toolbar (a cloud or headless capture), open `/?recording=1&frame=1`
  instead. `?frame=1` draws a browser toolbar with the page's address above the app, as part of the page, so the
  address is in the footage and zooms with it; `?frame=0` removes it.

**The take**

1. Continue as Demo Capital GmbH → **New valuation** → Next → **Use sample documents** (or open "Download sample
   documents", save the files and drag them in, for a real drag and drop). The five documents are read with their key
   findings → Next: "The AI created 8 units from your tenant list." → Next → **Submit**.
2. "AI at work" runs for a few seconds and ends with "With senior valuer for review".
3. **Open as Senior Valuer**, which switches the role without the demo bar → open check 1, "Cap rate 3.0 %", and its
   evidence.
4. The rehearsed note: click the example note "Cap rate too low for this micro-location: the committee range for
   pre-war multi-family houses in this district is 3.25–3.75 %. Use 3.4 %." → **Send note & revalue**. "AI is
   revising…", then Revision 2: €1,300,000 → **€1,210,000** (−6.9 %).
5. Accept checks 2–4 (**Accept 9.60 €/m²**, **Accept 5 years**, **Accept ±€0**): "4 of 4 reviewed".
6. **Approve & send report** → **Sign & send** → "Report sent to Demo Capital GmbH" → **View as the client**: the
   request shows "Delivered" → **Open report** → **Download PDF**.

**Tips**

- **Accept remaining** in the approval sheet accepts every call not yet reviewed with one click; the review log records
  them as accepted at sign-off without opening. Handy in rehearsals; in the video, accept checks 2–4 so the sheet shows
  "4 of 4 reviewed" and no unchecked AI call is signed.
- **Undo last revision** on the revision banner returns to the previous version if a take goes wrong; the review log
  keeps every version.
- With Live AI each document takes several seconds to read, and the hourly limits apply. Keep a Demo mode take as a
  backup.
- The layout is designed at 1440 px wide; it also works on a 390 px phone.

## Tests

| Command | What it runs |
|---|---|
| `npm test` | Vitest unit tests: valuation engine, rent estimator, flags, figure registry, revisions, pipeline, report, the API routes (with a stubbed Claude client) and the recording script's argument handling |
| `npm run typecheck` | `next typegen`, then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run e2e` | Playwright end-to-end tests, the demo path included; builds the app and starts it on port 3100 |

- End-to-end tests always run in Demo mode: `playwright.config.ts` clears both variables for the server it starts.
  `E2E_PORT` sets another port. Outside CI, an app already running on that port is reused, so stop old servers first.
- On a new machine, install the browser once: `npx playwright install chromium`.
- One spec: `npx playwright test tests/e2e/demo-path.spec.ts`.
- `npm run generate:samples` regenerates the sample PDFs, photos and demo fixtures. The output is deterministic, and a
  live recording of an unchanged PDF is kept.

## Project structure

```text
src/
  app/                      routes (App Router)
    page.tsx                C1 sign in
    client/                 C2 dashboard; new/ C3 wizard; deals/[id]/processing C4; deals/[id]/report C5
    valuer/                 V1 review queue; deals/[id] V2 review with V3 revisions and V4 approval;
                            deals/[id]/report the valuer's report preview
    how-it-works/           P1 explainer for the class
    api/extract/            POST: reads one PDF with Claude, or answers with its committed result
    api/revalue/            POST: a valuer's note → structured changes (Claude or the rule-based parser)
    api/mode/               GET: Live AI or Demo mode for an access code
    dev/viewer/             test harness for the PDF viewer and the maps (?dev=1 in a production build)
  components/               client/, valuer/, report/, pdf/, map/, demo/ (demo bar, orientation), ui/
  lib/                      pure TypeScript domain modules, unit-tested
    valuation/ rent/ lookups/ flags/ registry/ revisions/ pipeline/ deal/
    extraction/ revalue/ report/ store/ server/ data/ format.ts
public/sample/              the five sample PDFs and three photos
fixtures/extraction/        committed extraction results, keyed by each PDF's SHA-256 (index.json)
scripts/                    generate-samples.ts, record-extraction.ts
tests/unit/                 Vitest
tests/e2e/                  Playwright; demo-path.spec.ts is the video take
docs/superpowers/           spec, plan, mockups and the comparables data
```

For developers: this is Next.js 16 with Cache Components, whose APIs differ from older versions; see `AGENTS.md`
and the guides in `node_modules/next/dist/docs/`.
