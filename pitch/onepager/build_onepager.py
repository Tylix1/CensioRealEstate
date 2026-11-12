"""Builds the Censio one pager (course template, Session 2 p. 37) as HTML for render.mjs.

    python3 pitch/onepager/build_onepager.py            # writes pitch/out/onepager/onepager.html

Layout follows the course template: venture header; Vision and Mission (left); Playbook (middle); North Star and
Moat (right); Team (bottom). A wedge strip under the header makes the graded "pain point & budget owner" explicit,
and the Moat box ends with the frontier lab test ("If the next model release ships our feature, do we still
exist?"). Numbers come from pitch/build/numbers.json; founder names from the gitignored team.local.json.
"""

from __future__ import annotations

import html
import json
import sys
from pathlib import Path

PITCH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PITCH / "build"))
import content as C  # noqa: E402  (numbers, formatting, team file)

OUT = PITCH / "out" / "onepager"
FONT_DIRS = {
    "Space Grotesk": Path.home() / ".fonts/spacegrotesk",
    "Inter": Path("/usr/share/fonts/opentype/inter"),
}

P = C.PLAN
Y = C.YEARS

ONE_PAGER = {
    "name": "Censio RE",
    "tagline": "AI prepares, senior valuers sign: property valuations in 48 hours, not weeks",
    # Course p. 13: "[Workflow] for [specific user] in [industry]."
    "wedge": "Signed desktop income valuations of multi-family houses for acquisition teams in German residential "
             "real-estate investment.",
    "pain": "Fast or signed, pick one: short reports (2–7 days) are only indicative; a signed full valuation of a "
            "€1–3m building costs €4.4–6.8k and 3–6 weeks (≈35 expert hours, est.), ≈€90–135k a year for a team "
            "pricing ~20 bids. Signing experts (all fields) average 60 years.",
    "budget": "Head of Acquisitions at fund managers, family offices and mid-sized residential investors, whose "
              "investment committee or lender wants an independent, signed value before the bid; paid per deal "
              "from the due-diligence budget (labour, not IT).",
    # Vision, mission and North Star follow the course templates (Session 2, p. 19, 23, 27-29);
    # [[...]] marks the template's fixed words, which the page highlights.
    "vision": "[[By 2032,]] anyone who buys, finances or inherits a building in Europe [[can]] get a signed value "
              "within days and check every figure in it against its source, [[because]] property records have "
              "become machine-readable and experts spend their time only on judgement. [[This matters because]] a "
              "building is most owners' largest asset, and its value should be checked, not taken on trust.",
    "mission": "[[We]] run the senior-only valuation firm [[for]] property investors and lenders, [[by]] letting AI "
               "prepare every figure from documents and public data while senior valuers judge and sign, [[so that]] "
               "a signed value, checkable against its sources within days, [[becomes possible]] for every property "
               "deal.",
    "will": ["own the signed result and its liability", "disclose every AI step in every report",
             "hire only seniors; AI does the junior work"],
    "will_not": ["license our software to other valuers", "publish unsigned automated values (AVMs)",
                 "issue a figure without a source or a named senior's reasoning"],
    "playbook_title": "From one German wedge to the standard for signed property values: DACH first, then Europe",
    "playbook": [
        ("Year 1 · 2027", "Prove the wedge",
         "Signed desktop valuations of multi-family houses for investors' acquisition teams: €2,000 (launch "
         "€1,800), 48 h.",
         P[Y[0]]["valuations"]),
        ("Year 2 · 2028", "Repeatability",
         "Same firms, second budget: quarterly fund and portfolio revaluations; all major German cities.",
         P[Y[1]]["valuations"]),
        ("Year 3 · 2029", "Scale & compound",
         "Banks: lending values with a site visit, signed by HypZert seniors; corrections train our own models.",
         P[Y[2]]["valuations"]),
        ("Year 4 · 2030", "Network effect",
         "Lender panels: every bank that accepts our files makes Censio worth more to each buyer it finances. "
         "Commercial property, Austria, Switzerland.",
         P[Y[3]]["valuations"]),
        ("Year 5 · 2031+", "Lead the category",
         "#1 for signed buy-side valuations of German apartment buildings (≈14% in 2031), the file format banks "
         "accept; then Europe. A separate deal platform on top; valuation fees never tied to a closing.",
         P[Y[4]]["valuations"]),
    ],
    # Course p. 29 (SpaceX): count the unit, set the quality bar, bound the scope, fix the cadence.
    "north_star": "Signed valuations delivered within 48 hours of a client-confirmed document list, every figure "
                  "sourced and the value upheld in a blind re-review of 1 in 10, across all paying clients, "
                  "reviewed weekly.",
    "north_star_parts": [("Unit", "signed valuations"),
                         ("Quality bar", "≤ 48 h · all figures sourced · blind 10% re-review upheld"),
                         ("Scope", "all paying clients (site visits: from the visit)"),
                         ("Cadence", "weekly")],
    "north_star_proxy": "Early proxy: senior minutes per valuation (target ≤ 120). Today: working prototype, "
                        "0 paid valuations.",
    # Course p. 5 moat names, ordered by the playbook stage that builds them (template p. 37: "along that journey").
    "moats": [
        ("Brand & trust", "market · from Y1",
         "We sign, carry indemnity insurance and disclose every AI step."),
        ("Cost advantage", "new with AI · Y1",
         "≈€0.45 of AI (est.) + 2 senior hours (plan) per valuation vs ≈35 billable hours for a full report."),
        ("Workflow lock-in", "amplified by AI · Y2",
         "We keep each client's valuation file: revaluations and refinancing take hours with us, a restart "
         "elsewhere."),
        ("Data flywheel + regulation", "new with AI · Y3",
         "Senior corrections, matched to later sale prices, train our own models; banks need an independent "
         "valuer (CRR III Art. 229)."),
    ],
    "frontier_test": "If the next GPT, Claude or Gemini release ships our feature, do we still exist? Yes: it cuts "
                     "our preparation cost but cannot sign or carry liability, and a valuer using it still bills "
                     "hours, staffs juniors and lacks our correction data and client files. Verdict: defensible "
                     "vertical platform (own data + end-to-end workflow), not a wrapper.",
    "team_model": "Founders are the overhead; the operating team is senior valuers who sign (17 of 28 people in "
                  "2031) plus a small platform team. No juniors: AI does the junior work. First hire: a HypZert / "
                  "öbuv senior valuer.",
}


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def tmpl(text: str) -> str:
    """Escapes text and highlights the course template's fixed words, marked [[like this]]."""
    import re
    return re.sub(r"\[\[(.+?)\]\]", r'<em>\1</em>', esc(text))


def font_faces() -> str:
    faces = []
    files = {
        ("Space Grotesk", 500): FONT_DIRS["Space Grotesk"] / "SpaceGrotesk-Medium.ttf",
        ("Space Grotesk", 700): FONT_DIRS["Space Grotesk"] / "SpaceGrotesk-Bold.ttf",
        ("Inter", 400): FONT_DIRS["Inter"] / "Inter-Regular.otf",
        ("Inter", 600): FONT_DIRS["Inter"] / "Inter-SemiBold.otf",
        ("Inter", 700): FONT_DIRS["Inter"] / "Inter-Bold.otf",
    }
    for (family, weight), path in files.items():
        if path.exists():
            faces.append(f"@font-face {{ font-family: '{family}'; font-weight: {weight}; "
                         f"src: url('{path.as_uri()}'); }}")
    return "\n".join(faces)


def build() -> Path:
    o = ONE_PAGER
    team = C.load_team()
    mark = (PITCH / "assets" / "censio-mark.png").as_uri()
    playbook_rows = "\n".join(
        f"""<li class="stage{' wedge' if i == 0 else ''}{' lead' if i == len(o['playbook']) - 1 else ''}">
              <div class="when">{esc(when)}</div>
              <div class="what"><b>{esc(theme)}.</b> {esc(text)}</div>
              <div class="ns"><span>{n:,}</span>signed/yr (plan) · {n / o['playbook'][0][3]:.0f}×</div>
            </li>"""
        for i, (when, theme, text, n) in enumerate(o["playbook"]))
    moats = "\n".join(
        f"""<li><b>{esc(name)}</b> <span class="tag">{esc(tag)}</span><br>{esc(text)}</li>"""
        for name, tag, text in o["moats"])
    founders = "\n".join(
        f"""<div class="founder"><div class="avatar">{esc(''.join(p[0] for p in m['name'].split()[:2]).upper())}</div>
              <div><b>{esc(m['name'])}</b><br><span>{esc(m['role'])} · {esc(m.get('school', ''))}</span></div></div>"""
        for m in team[:4])
    ns_parts = "".join(f"<div><span>{esc(k)}</span>{esc(v)}</div>" for k, v in o["north_star_parts"])
    will = "".join(f"<li>{esc(x)}</li>" for x in o["will"])
    will_not = "".join(f"<li>{esc(x)}</li>" for x in o["will_not"])
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Censio RE · One pager</title>
<style>
{font_faces()}
:root {{
  --page:#f2f4f7; --card:#ffffff; --line:#e4e7ec; --line-strong:#d0d5dd; --ink:#101828; --ink2:#475467;
  --muted:#5b6576; --brand:#0b5d4b; --brand-weak:#e6f2ee; --brand-accent:#7fd1b9; --ai:#a3410a;
  --ai-weak:#fff4e5; --ai-strong:#f79009; --valuer:#5b3cc4; --valuer-weak:#f1edff; --doc:#1849a9;
}}
@page {{ size: 13.333in 7.5in; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ background: var(--page); }}
body {{ font-family: 'Inter', sans-serif; color: var(--ink); font-size: 10.4px; line-height: 1.38; }}
.page {{ width: 1280px; height: 720px; padding: 0 22px 16px; display: grid;
  grid-template-rows: 54px auto 1fr 74px; gap: 9px; overflow: hidden; }}
header {{ background: var(--ink); color: #fff; margin: 0 -22px; padding: 0 22px; display: flex; align-items: center;
  gap: 12px; }}
header img {{ width: 30px; height: 30px; }}
header h1 {{ font-family: 'Space Grotesk'; font-weight: 700; font-size: 25px; letter-spacing: -0.01em; }}
header .tag {{ font-size: 13.5px; color: var(--brand-accent); margin-left: 6px; }}
header .meta {{ margin-left: auto; font-size: 10.5px; color: #98a2b3; text-align: right; }}
.label {{ font-weight: 700; font-size: 9.6px; letter-spacing: 0.08em; text-transform: uppercase; }}
.strip {{ display: grid; grid-template-columns: 1.1fr 1.45fr 1.45fr; gap: 9px; }}
.strip > div {{ background: var(--card); border: 1px solid var(--line); border-radius: 9px; padding: 8px 12px; }}
.strip .label {{ color: var(--brand); margin-bottom: 2px; }}
.strip .wedge-box {{ border-color: var(--brand); }}
.strip .wedge-box p {{ font-family: 'Space Grotesk'; font-weight: 700; font-size: 13px; line-height: 1.25; }}
.cols {{ display: grid; grid-template-columns: 1fr 1.32fr 1.12fr; gap: 9px; min-height: 0; }}
.col {{ display: flex; flex-direction: column; gap: 9px; min-height: 0; }}
.box {{ background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 13px; }}
.dark {{ background: var(--brand); border-color: var(--brand); color: #fff; }}
.dark .label {{ color: var(--brand-accent); }}
.statement {{ font-family: 'Space Grotesk'; font-weight: 500; font-size: 13.4px; line-height: 1.3; margin-top: 4px; }}
.vision {{ flex: 1.15; }} .mission {{ flex: 1; }}
.statement em {{ font-style: normal; color: var(--brand-accent); font-weight: 700; }}
.mission .statement {{ font-size: 12.6px; }}
.guard {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 7px; font-size: 9.6px;
  color: #e6f2ee; }}
.guard b {{ display: block; color: var(--brand-accent); font-size: 9.2px; letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 1px; }}
.guard ul {{ list-style: none; }} .guard li::before {{ content: "· "; }}
.playbook {{ flex: 1; display: flex; flex-direction: column; }}
.playbook h2 {{ font-family: 'Space Grotesk'; font-weight: 700; font-size: 13.4px; margin: 3px 0 7px; }}
.playbook ol {{ list-style: none; display: flex; flex-direction: column; gap: 5px; flex: 1; }}
.stage {{ display: grid; grid-template-columns: 74px 1fr 84px; gap: 9px; align-items: center; padding: 6px 9px;
  border: 1px solid var(--line); border-radius: 8px; flex: 1; }}
.stage .when {{ font-weight: 700; color: var(--brand); font-size: 10px; line-height: 1.2; }}
.stage .ns {{ text-align: right; color: var(--ink2); font-size: 9px; line-height: 1.15; }}
.stage .ns span {{ display: block; font-family: 'Space Grotesk'; font-weight: 700; font-size: 15px;
  color: var(--ink); }}
.stage.wedge {{ background: var(--brand-weak); border-color: var(--brand-accent); }}
.stage.lead {{ background: var(--ink); border-color: var(--ink); color: #fff; }}
.stage.lead .when {{ color: var(--brand-accent); }} .stage.lead .ns, .stage.lead .ns span {{ color: #fff; }}
.northstar {{ flex: 0 0 auto; border-color: var(--ai-strong); }}
.northstar .label {{ color: var(--ai); }}
.northstar .statement {{ font-weight: 700; font-size: 12.4px; }}
.parts {{ display: grid; grid-template-columns: repeat(4, auto); gap: 2px 10px; margin-top: 6px; font-size: 9.4px; }}
.parts span {{ display: block; color: var(--muted); font-size: 8.4px; text-transform: uppercase;
  letter-spacing: 0.06em; font-weight: 600; }}
.proxy {{ margin-top: 5px; color: var(--ink2); font-size: 9.5px; }}
.moat {{ flex: 1; min-height: 0; }}
.moat .label {{ color: var(--valuer); }}
.moat ul {{ list-style: none; margin-top: 4px; display: flex; flex-direction: column; gap: 3.5px; }}
.moat li {{ font-size: 9.6px; line-height: 1.3; }}
.moat .tag {{ color: var(--muted); font-size: 8.4px; text-transform: uppercase; letter-spacing: 0.05em; }}
.test {{ margin-top: 5px; background: var(--valuer-weak); border-radius: 7px; padding: 6px 9px; font-size: 9.7px;
  line-height: 1.32; color: #2b2161; }}
.test b {{ color: var(--valuer); }}
footer {{ background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px 13px;
  display: grid; grid-template-columns: 62px repeat(4, 1fr) 2.05fr; gap: 10px; align-items: center; }}
footer .label {{ color: var(--brand); }}
.founder {{ display: flex; gap: 8px; align-items: center; font-size: 10.4px; line-height: 1.25; }}
.founder span {{ color: var(--ink2); font-size: 9.6px; }}
.avatar {{ flex: 0 0 34px; height: 34px; border-radius: 50%; background: var(--brand-weak); color: var(--brand);
  display: grid; place-items: center; font-weight: 700; font-size: 11.5px; }}
footer .model {{ font-size: 9.6px; color: var(--valuer); background: var(--valuer-weak); border-radius: 7px;
  padding: 6px 9px; line-height: 1.3; }}
footer .model b {{ color: var(--valuer); }}
</style></head>
<body><div class="page">
  <header>
    <img src="{mark}" alt="">
    <h1>{esc(o['name'])}</h1><span class="tag">{esc(o['tagline'])}</span>
    <div class="meta">One pager · AI-Native Ventures · ESMT Berlin<br>November 2026</div>
  </header>
  <section class="strip">
    <div class="wedge-box"><div class="label">Wedge</div><p>{esc(o['wedge'])}</p></div>
    <div><div class="label">Pain point</div>{esc(o['pain'])}</div>
    <div><div class="label">Budget owner</div>{esc(o['budget'])}</div>
  </section>
  <section class="cols">
    <div class="col">
      <div class="box dark vision"><div class="label">Vision · the world in 2032</div>
        <p class="statement">{tmpl(o['vision'])}</p></div>
      <div class="box dark mission"><div class="label">Mission · our contribution</div>
        <p class="statement">{tmpl(o['mission'])}</p>
        <div class="guard"><div><b>We will</b><ul>{will}</ul></div><div><b>We will not</b><ul>{will_not}</ul></div></div>
      </div>
    </div>
    <div class="col">
      <div class="box playbook"><div class="label" style="color:var(--brand)">Playbook · five years of focus</div>
        <h2>{esc(o['playbook_title'])}</h2>
        <ol>{playbook_rows}</ol>
      </div>
    </div>
    <div class="col">
      <div class="box northstar"><div class="label">North Star · one metric</div>
        <p class="statement">{esc(o['north_star'])}</p>
        <div class="parts">{ns_parts}</div>
        <p class="proxy">{esc(o['north_star_proxy'])}</p>
      </div>
      <div class="box moat"><div class="label">Moat · built along the journey</div>
        <ul>{moats}</ul>
        <div class="test"><b>Frontier lab test.</b> {esc(o['frontier_test'])}</div>
      </div>
    </div>
  </section>
  <footer>
    <div class="label">Team</div>
    {founders}
    <div class="model"><b>AI-native team.</b> {esc(o['team_model'])}</div>
  </footer>
</div></body></html>
"""
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / "onepager.html"
    out.write_text(page)
    return out


if __name__ == "__main__":
    print("wrote", build())
