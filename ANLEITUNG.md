# Anleitung fürs Team: Censio-Prototyp

Diese Anleitung erklärt Schritt für Schritt und ohne Vorwissen, wie ihr den Prototyp online stellt, durchklickt, für
das Video aufnehmt und gemeinsam weiterentwickelt. Die technische Doku (Englisch) steht in der [README](README.md);
die App selbst ist auf Englisch.

„Claude“ meint hier Claude Code, die KI, die den Prototyp gebaut hat. Ihr erreicht Claude über eine Session auf
[claude.ai/code](https://claude.ai/code) mit diesem Repo (Abschnitt 5.3).

Die Menünamen bei Vercel, GitHub und Anthropic ändern sich manchmal leicht; gemeint ist jeweils der beschriebene
Schritt.

## Auf einen Blick

| Frage | Antwort |
|---|---|
| Wo liegt die App? | Komplett in diesem GitHub-Repo: [github.com/Tylix1/CensioRealEstate](https://github.com/Tylix1/CensioRealEstate). Es ist **öffentlich**: Jeder mit dem Link kann den Code lesen. Alles darin sind Beispieldaten. |
| Welcher Stand gilt? | Der Branch `claude/beautiful-franklin-vnn3gb`. Er ist der Standard-Branch des Repos, also der **Hauptstand**, den GitHub anzeigt und Vercel veröffentlicht. Der Name stammt von Claude Code; bitte nicht umbenennen oder löschen. |
| Was kostet das? | Im **Demo-Modus** nichts. Nur die optionale **Live-KI** kostet Geld: etwa 0,50 $ pro komplettem Durchlauf, gedeckelt durch ein Monatslimit (Abschnitt 2). |
| Was macht `.claude/settings.json`? | Es schaltet das Plugin „Superpowers“ für alle ein, die mit Claude Code an diesem Repo arbeiten. Das ist gewollt, bitte drin lassen. |
| Was darf nie ins Repo? | API-Key, Zugangscode und echte Dokumente mit Personen- oder Kundendaten. Das gilt auch für Issues und Kommentare: Alles ist öffentlich. |
| Sieht das Team, was ich klicke? | Nein. Der Demo-Stand liegt im **eigenen Browser**. Jede Person hat ihre eigene Demo, und **Reset demo** setzt nur die eigene zurück. |

## 1. Online stellen mit Vercel (ca. 15 Minuten)

Danach habt ihr einen Link, den jeder im Browser öffnen kann.

1. Auf [vercel.com](https://vercel.com) **Sign Up** → **Continue with GitHub**, am besten mit dem GitHub-Konto, dem das
   Repo gehört (**Tylix1**).
2. **Add New… → Project**, in der Liste **CensioRealEstate** wählen → **Import**. Fehlt das Repo in der Liste: dem Link
   zu den GitHub-Berechtigungen folgen und Vercel Zugriff auf dieses Repo geben.
3. Auf der nächsten Seite **nichts ändern** (Vercel erkennt Next.js selbst) → **Deploy**.
4. Nach 2–4 Minuten zeigt Vercel den Link, etwa `https://<projektname>.vercel.app`. Öffnen: Die App läuft im
   **Demo-Modus**.
5. Kurz prüfen: den Ablauf aus Abschnitt 3 bis **Use sample documents** klicken. Alle fünf Dokumente müssen gelesen
   werden (jedes mit dem Label „Demo mode“), und in der Prüfansicht sollte die Karte Straßen zeigen.
6. Den Link an Claude schicken (Abschnitt 7).

Ab jetzt veröffentlicht Vercel jede Änderung am Hauptstand automatisch. Für andere Branches, etwa Änderungen eines
Teammitglieds, baut Vercel eigene **Preview-Links**.

Gut zu wissen:

- Der kostenlose **Hobby-Plan** ist für nicht-kommerzielle Projekte gedacht; für den Class-Prototyp passt das. Sobald
  Censio die App kommerziell nutzt: auf **Pro** wechseln.
- **Preview-Links** zeigt Vercel meist nur nach einem Vercel-Login (Projekt → Settings → **Deployment Protection**).
  Der Haupt-Link ist öffentlich.
- **„Build failed“:** im Vercel-Projekt unter **Deployments** den roten Eintrag öffnen, Screenshot vom Log an Claude.
- **„Deployment blocked … commit author …“:** Diese Sperre betrifft laut Vercel vor allem private Repos im Hobby-Plan.
  Unser Repo ist öffentlich, sie sollte also nicht kommen. Falls doch: Screenshot an Claude.

## 2. Live-KI einschalten (optional)

Ohne diesen Schritt läuft alles im Demo-Modus: Die fünf Musterdokumente werden aus gespeicherten KI-Ergebnissen
„gelesen“, und Notizen an die KI versteht ein regelbasierter Parser. Für das Video reicht das. Mit Live-KI liest Claude
die PDFs wirklich, auch eigene, und versteht frei formulierte Notizen.

### 2.1 Anthropic-Konto mit Kostenbremse

1. In der [Anthropic Console](https://console.anthropic.com) ein Konto anlegen und unter **Billing** Guthaben kaufen;
   10–20 $ reichen für viele Durchläufe.
2. Einen eigenen **Workspace** für den Prototyp anlegen (z. B. „Censio Prototyp“) und dort ein **monatliches
   Ausgabenlimit** setzen, Vorschlag **20 $**. Das ist die harte Grenze: Mehr kann die App nicht kosten.
3. In diesem Workspace unter **API Keys** einen Key erstellen und kopieren. Er wird nur einmal angezeigt.

### 2.2 Zugangscode ausdenken

Live-KI läuft nur in Browsern, die einmal den Link mit dem Code geöffnet haben; alle anderen sehen den Demo-Modus.
Nehmt einen **langen** Code, der sich nicht erraten lässt, z. B. vier zufällige Wörter und eine Zahl wie
`kran-tulpe-elbe-nebel-47` (bitte einen eigenen ausdenken). Falsch eingegebene Codes bremst die App nicht, deshalb lang.

### 2.3 In Vercel eintragen

1. Vercel-Projekt → **Settings → Environment Variables**.
2. Zwei Einträge für die Umgebung **Production** anlegen:
   - `ANTHROPIC_API_KEY` = der Key aus 2.1
   - `DEMO_ACCESS_CODE` = der Code aus 2.2
3. **Neu veröffentlichen**, denn Variablen gelten erst für neue Deployments: **Deployments** → oberster Eintrag →
   **⋯** → **Redeploy**.

### 2.4 Prüfen

`https://<projektname>.vercel.app/?code=<euer-Code>` öffnen. In der dunklen Leiste oben steht jetzt **Live AI** statt
**Demo mode**. Der Browser merkt sich den Code und nimmt ihn aus der Adresszeile; im Video ist er also nicht zu sehen.

Zum Ausprobieren reicht **Use sample documents**: Mit Live-KI liest Claude die fünf PDFs jetzt wirklich, jedes in
einigen Sekunden. Eigene PDFs lassen sich per Drag & Drop hochladen. In der Prüfansicht könnt ihr eine eigene Notiz
frei formulieren, z. B. „Use a cap rate of 3.5 %“.

Wichtig:

- Key und Code **nie** in GitHub (Dateien, Issues, Kommentare) und nie in einen Chat. Sie gehören nur in Vercel, bei
  Entwicklern zusätzlich lokal in die Datei `.env.local`.
- Den Code-Link nur gezielt weitergeben, z. B. an den Professor.
- **Kosten:** ein kompletter Durchlauf etwa 0,50 $, eine Notiz an die KI 3–6 Cent. Zusätzlich bremst die App pro
  IP-Adresse und Stunde: 3 Dokument-Auslesungen (je 5 PDFs) und 15 Notizen. Ist ein Limit erreicht, läuft diese
  Anfrage im Demo-Modus.
- **Datenschutz:** Mit Live-KI gehen hochgeladene PDFs zur Auswertung an die Anthropic-API. Nur Muster- oder
  **anonymisierte** Dokumente hochladen; eine echte Mieterliste enthält Personendaten.
- **Dateigröße:** online höchstens ca. 4 MB pro PDF (Vercel begrenzt Uploads auf 4,5 MB) und 10 Seiten; bis zu 8
  Dateien pro Auftrag.

## 3. Testen: einmal komplett durchklicken (ca. 5 Minuten)

Die dunkle Leiste oben ist die **Demo-Steuerung**: **View as Client / Senior Valuer** wechselt die Rolle, das
Abzeichen zeigt **Demo mode** oder **Live AI**, **Orientation** öffnet die Kurzerklärung, **How it works** die
Erklärseite für die Class, und rechts setzt **Reset demo** alles zurück. Beim ersten Besuch erscheint das Fenster
„How this demo works“: **Got it** klicken.

Der Ablauf ist genau der des Videos. Haken dran, wenn ihr seht, was in der rechten Spalte steht:

| # | Klick | Das solltet ihr sehen |
|---|---|---|
| 1 | **Reset demo** | Die Startseite |
| 2 | **Continue as Demo Capital GmbH** | Die Kunden-Übersicht |
| 3 | **New valuation** | Schritt „Property“, die Adresse Musterstraße 12 ist schon ausgefüllt |
| 4 | **Next** → **Use sample documents** | Fünf Dokumente werden gelesen, jedes mit seinen Kernaussagen (z. B. „plot 480 m²“), dazu drei Fotos |
| 5 | **Next** | „The AI created 8 units from your tenant list.“ |
| 6 | **Next** → **Submit** | „AI at work“ läuft einige Sekunden und endet mit „With senior valuer for review“ |
| 7 | **Open as Senior Valuer** | Die Prüfansicht mit €1,300,000, „You sign 4 AI judgement calls · 0 of 4 reviewed“, Karte und Foto |
| 8 | Prüfpunkt 1 (Cap rate 3.0 %) öffnen | Die Was-wäre-wenn-Zeile „3.5 % → €1.19 M“ und unter „Evidence“ die Quelle (Marktbericht) |
| 9 | Beispielnotiz „Cap rate too low … Use 3.4 %.“ anklicken → **Send note & revalue** | „AI is revising…“, dann **Revision 2** mit **€1,210,000** (−6.9 %) und der Tabelle „What changed“: 3.0 % → 3.4 % |
| 10 | Prüfpunkte 2, 3 und 4 öffnen und **Accept 9.60 €/m²**, **Accept 5 years**, **Accept ±€0** klicken | „4 of 4 reviewed“ |
| 11 | **Approve & send report** → **Sign & send** | „Report sent to Demo Capital GmbH“ |
| 12 | **View as the client** → **Open report** → **Download PDF** | Der Auftrag steht auf „Delivered“; die Datei `Censio_Report_CEN-2026-0147_v2.pdf` wird geladen |

Wenn etwas schiefgeht: **Undo last revision** auf dem Revisions-Banner nimmt die letzte Revision zurück, **Reset demo**
setzt alles zurück.

Außerdem prüfen:

- [ ] Die Erklärseite **How it works** (für den Professor) liest sich verständlich.
- [ ] Am Handy denselben Link öffnen: Nichts sollte seitlich scrollen.
- [ ] **Safari** auf Mac und iPhone: konnte Claude noch nicht testen.
- [ ] Die **Karten** zeigen Straßen (in Claudes Testumgebung war der Kartendienst gesperrt).
- [ ] Mit Live-KI (Abschnitt 2.4): Die Dokumente werden live gelesen, und eine frei formulierte Notiz führt zu einer
      sinnvollen Revision.

**Automatische Tests:** Der Code hat 465 Unit-Tests und 43 End-to-End-Tests; einer davon klickt den kompletten
Video-Ablauf selbst durch. In einer Claude-Code-Session reicht der Satz „Führe alle Tests aus“. Entwickler starten sie
lokal mit `npm test` und `npm run e2e` (Details in der README).

## 4. Video aufnehmen

1. **Reset demo** klicken.
2. Für eine Aufnahme mit Live-KI vorher einmal den Code-Link öffnen; der Code wird gemerkt.
3. `https://<projektname>.vercel.app/?recording=1` öffnen. Damit verschwinden Demo-Leiste und Orientierungsfenster
   für diesen Tab. `?recording=0` holt die Leiste zurück, etwa für das nächste **Reset demo**.
4. Den Ablauf aus Abschnitt 3 klicken, Schritte 2–12 (etwa 60–90 Sekunden).

Tipps:

- Browser im Vollbild, Zoom 100 %; das Layout ist für 1440 px Breite gestaltet. Lesezeichenleiste und
  Benachrichtigungen ausblenden.
- Bildschirmaufnahme: am Mac **⇧⌘5**, unter Windows das **Snipping Tool** (Aufnahme) oder die **Xbox Game Bar**
  (Win+G).
- Zum Proben geht es schneller mit **Accept remaining** im Freigabe-Fenster: Es akzeptiert alle noch offenen
  Prüfpunkte auf einmal. Im Video lieber 2–4 einzeln akzeptieren, damit „4 of 4 reviewed“ zu sehen ist.
- Mit Live-KI braucht jedes Dokument einige Sekunden, und die Stundenlimits gelten. Immer auch eine Aufnahme im
  Demo-Modus als Reserve machen.

## 5. Zusammenarbeiten: So ändert das Team etwas

### 5.1 Zugang

- **Ansehen** kann jeder: Das Repo ist öffentlich, die App läuft über den Vercel-Link.
- **Ändern:** Der Besitzer des Repos (GitHub-Konto Tylix1) lädt Teammitglieder ein: im Repo **Settings →
  Collaborators → Add people** → GitHub-Namen eingeben. Die Einladung kommt per E-Mail und muss angenommen werden.

### 5.2 Fehler und Wünsche melden (für alle, ganz ohne Technik)

Im Repo oben auf **Issues → New issue**: kurzer Titel, was ihr geklickt habt, was ihr erwartet habt und was passiert
ist, dazu ein Screenshot (einfach ins Textfeld ziehen). Jedes Issue bekommt eine Nummer; in einer Claude-Code-Session
genügt dann „Behebe Issue #3“. Issues sind öffentlich: keine echten Kundendaten hinein.

### 5.3 Selbst ändern mit Claude Code (empfohlen)

Voraussetzung: ein Claude-Konto mit Zugang zu Claude Code und der Zugang aus 5.1.

1. Einmalig GitHub mit Claude verbinden: [claude.ai/connect-github](https://claude.ai/connect-github). Die
   Claude-GitHub-App ist auf diesem Repo schon installiert.
2. Auf [claude.ai/code](https://claude.ai/code) eine neue Session starten und das Repo **Tylix1/CensioRealEstate**
   auswählen.
3. In normalen Worten beschreiben, was sich ändern soll, gern auf Deutsch, z. B. „Ändere auf der Startseite die
   Überschrift in …“ oder „Behebe Issue #3“. Claude kennt die Projektregeln aus `AGENTS.md`, der README und dieser
   Anleitung.
4. Claude arbeitet auf einem eigenen Branch, führt die Tests aus und lädt die Änderung hoch. Vercel baut dafür einen
   **Preview-Link** (im Vercel-Projekt unter **Deployments**).
5. Passt alles: Claude bitten, einen **Pull Request** zu erstellen, ihn auf GitHub öffnen und **Merge pull request**
   klicken. Vercel veröffentlicht den neuen Stand dann automatisch unter dem Haupt-Link.

Eine neue Session kennt den bisherigen Chatverlauf nicht, findet aber alles Wichtige im Repo: README, Spezifikation,
Bauplan und diese Anleitung.

Spielregeln:

- Eine Session pro Thema; nicht zwei Leute gleichzeitig am selben Bildschirm der App.
- Die Oberfläche bleibt Englisch (für die Class).
- Wer Beispielzahlen ändert, ändert auch die Werte im Video-Ablauf (€1,300,000 → €1,210,000). Claude passt die Tests
  dann mit an; vorher kurz im Team abstimmen.
- Bitte keine Dateien direkt auf GitHub im Hauptstand bearbeiten: Ein Tippfehler im Code kann die Seite lahmlegen.
  Lieber über Claude Code oder ein Issue.

### 5.4 Lokal starten (nur für Entwickler)

Node.js 22 (LTS) installieren, dann:

```bash
git clone https://github.com/Tylix1/CensioRealEstate.git
cd CensioRealEstate
npm ci
npm run dev
```

Danach <http://localhost:3000> öffnen. Für Live-KI auf dem eigenen Rechner `.env.example` nach `.env.local` kopieren
und beide Werte eintragen; diese Datei wird nie hochgeladen.

### 5.5 Wo steht was?

Hilft, um Claude gezielt zu sagen, was sich ändern soll:

| Was | Wo |
|---|---|
| Die Seiten (Texte, Aufbau) | `src/app/…` (z. B. `src/app/page.tsx` = Startseite) und `src/components/…` |
| Zahlen des Beispiel-Auftrags | `src/lib/data/seed.ts` |
| Marktbericht (Liegenschaftszinsen) | `src/lib/lookups/marketReport.ts` |
| Bodenrichtwert | `src/lib/lookups/boris.ts` |
| Bewirtschaftungskosten und Modellwerte | `src/lib/lookups/costs.ts` |
| Rechenweg (Ertragswert) | `src/lib/valuation/engine.ts` |
| Musterdokumente und Fotos | `public/sample/`, erzeugt von `scripts/generate-samples.ts` |
| Konzept und Design | `docs/superpowers/specs/2026-11-06-censio-prototype-design.md` |

## 6. Wo ihr unterstützen könnt

- [ ] Vercel einrichten (Abschnitt 1) und Claude den Link schicken.
- [ ] Anthropic-Konto, Guthaben, Monatslimit, Key und Code in Vercel (Abschnitt 2), dann prüfen, ob „Live AI“
      erscheint.
- [ ] Optional: echte KI-Ergebnisse für die Musterdokumente aufnehmen (`npm run record:extraction`, siehe README).
      Danach steht im Demo-Modus „Cached result“ statt „Demo mode“, und die gespeicherten Ergebnisse stammen
      nachweislich von Claude. Das macht entweder ein Entwickler lokal mit dem Key oder Claude in einer
      Claude-Code-Session. Dort fragt Claude den Key über ein sicheres Formular ab; bitte nie in den Chat einfügen.
- [ ] Safari (Mac und iPhone) und ein Android-Handy testen.
- [ ] Fachlicher Check durch jemanden mit Bewertungserfahrung: Prüfansicht und PDF-Bericht lesen (Begriffe, Zahlen,
      Plausibilität) und Auffälligkeiten als Issue melden.
- [ ] Video-Probe im Aufnahmemodus (Abschnitt 4): Was ist zu schnell, zu langsam oder unklar?
- [ ] Die offenen Entscheidungen aus Abschnitt 8 treffen.
- [ ] Das Feedback des Professors als Issues festhalten.

## 7. Material, das Claude noch braucht

| Material | Wofür | Bitte so |
|---|---|---|
| Der Vercel-Link | Den Online-Stand prüfen | URL in die Claude-Code-Session |
| Video-Briefing | Ablauf, Tempo und Texte darauf abstimmen | Datum, Länge, Format (z. B. 16:9 in 1080p, evtl. zusätzlich Hochformat), was unbedingt vorkommen soll, Sprache des Voice-overs |
| 3 Fotos | Ersetzen die gezeichneten Platzhalter: Fassade, Dachterrasse, Wohnzimmer im Dachgeschoss | JPG quer im Format 3:2, mindestens 1200 × 800 px, mit Nutzungsrechten; am besten ein Gründerzeit-Mehrfamilienhaus; keine Personen, Hausnummern oder Kennzeichen |
| Logo und Farben (falls vorhanden) | Branding in der App und im PDF-Bericht | SVG oder PNG, Farbcodes, evtl. Schrift |
| Aufgabenstellung des Professors | Die Erklärseite „How it works“ und die Story darauf zuschneiden | Text oder PDF mit Aufgabe bzw. Bewertungskriterien |
| Anonymisierte echte Dokumente (optional) | Prüfen, ob die KI echte Layouts zuverlässig liest | Selbst über den Live-KI-Link hochladen und Claude beschreiben, was falsch gelesen wurde; die Dokumente nicht ins Repo oder in Issues legen |
| Echte Marktdaten (optional) | Den ImmoScout-Datensatz oder echte Marktbericht-Werte statt der Beispielwerte nutzen | Datei plus Quelle und Nutzungsrechte |

**Dateien wie Fotos oder Logo hochladen:** Im Repo auf GitHub **Add file → Upload files**, Dateien hineinziehen, unten
**Create a new branch for this commit and start a pull request** wählen → **Propose changes**. Dann Claude Bescheid
geben; Claude baut sie ein. Achtung: Das Repo ist öffentlich, also nur Dateien, die öffentlich sein dürfen.

## 8. Bekannte Grenzen und offene Entscheidungen

Grenzen (bewusst, für einen Prototyp in Ordnung):

- Alles sind Beispieldaten, kein echtes Gutachten. Jede Seite trägt „Sample data“, die Muster-PDFs ein Wasserzeichen.
- Noch nicht getestet: Live-KI mit einem echten Key (in Claudes Umgebung gibt es keinen), Safari und die Karten auf dem
  Online-Link.
- Eigene PDFs liest nur die Live-KI. Im Demo-Modus erscheint „Live AI is needed to read this document.“, und der
  Ablauf geht trotzdem weiter.
- Die Stundenlimits zählt jede Server-Instanz für sich; sie sind nur eine Höflichkeitsbremse. Die echte Kostengrenze
  ist das Monatslimit in der Anthropic Console.
- Bei sehr vielen Anpassungen bricht die Wert-Herleitung in der Prüfansicht in mehrere Zeilen um. Fürs Video
  unkritisch.

Offene Entscheidungen (sagt Claude einfach, was ihr wollt):

1. **Beispiel-Auftrag vor dem Absenden:** Nach **Reset demo** steht CEN-2026-0147 schon auf der Kunden-Übersicht,
   damit man auch direkt als Senior Valuer einsteigen kann. Fürs Video könnte er dort erst nach **Submit** erscheinen.
2. **Beispielnotizen:** Unter jedem Prüfpunkt stehen dieselben Beispielnotizen. Sollen sie zum jeweiligen Prüfpunkt
   passen?
3. **KI-Modell:** Die App nutzt ein großes Claude-Modell. Ein kleineres kostet etwa die Hälfte oder deutlich weniger,
   liest aber unter Umständen weniger zuverlässig. Für den Prototyp ist die Empfehlung, es so zu lassen; es ist eine
   einzige Stelle im Code (README, Absatz „Cost and the hard cap“).

## 9. Hilfe

- Technische Details: [README](README.md) (Englisch).
- Fragen zum Code oder zu dieser Anleitung: in einer Claude-Code-Session mit diesem Repo einfach fragen, z. B. „Wo
  steht der Text der Startseite?“ oder „Erkläre mir den Rechenweg der Bewertung“.
