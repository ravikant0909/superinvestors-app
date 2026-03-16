#!/usr/bin/env python3

import ast
import html
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "superinvestors.db"
CONFIG_PATH = ROOT / "data" / "config.py"
REPORT_PATH = ROOT / "testing" / "13f-coverage-gap-report.html"


def load_investor_config():
    tree = ast.parse(CONFIG_PATH.read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "INVESTORS":
                    return ast.literal_eval(node.value)
    raise RuntimeError("INVESTORS constant not found in config.py")


INVESTOR_CONFIG = load_investor_config()
SLUG_TO_CONFIG_KEY = {}
CONFIG_STATUS = {}
for key, row in INVESTOR_CONFIG.items():
    slug = row.get("manager_slug")
    if slug:
        SLUG_TO_CONFIG_KEY[slug] = key
    inferred_slug = None
    manager = row.get("manager")
    if manager:
        inferred_slug = (
            manager.lower()
            .replace("&", " ")
            .replace("/", " ")
            .replace("(", " ")
            .replace(")", " ")
            .replace(",", " ")
        )
        inferred_slug = "-".join(part for part in inferred_slug.split() if part)
    mapped_slug = inferred_slug
    for candidate_key, candidate_slug in {
        "akre_capital": "chuck-akre",
        "altimeter_capital": "brad-gerstner",
        "appaloosa_management": "david-tepper",
        "arlington_value": "allan-mecham",
        "atreides_management": "gavin-baker",
        "baupost_group": "seth-klarman",
        "berkshire_hathaway": "warren-buffett",
        "biglari_capital": "sardar-biglari",
        "bridgewater": "ray-dalio",
        "cas_investment": "cliff-sosin",
        "century_management": "arnold-van-den-berg",
        "chou_associates": "francis-chou",
        "coatue_management": "philippe-laffont",
        "d1_capital": "dan-sundheim",
        "davis_advisors": "chris-davis",
        "dorsey_asset": "pat-dorsey",
        "druckenmiller_duquesne": "stanley-druckenmiller",
        "durable_capital": "henry-ellenbogen",
        "elliott_investment": "paul-singer",
        "fairfax_financial": "prem-watsa",
        "fairholme_capital": "bruce-berkowitz",
        "fundsmith": "terry-smith",
        "gamco_investors": "mario-gabelli",
        "gardner_russo": "thomas-russo",
        "giverny_capital": "francois-rochon",
        "glenview_capital": "larry-robbins",
        "goehring_rozencwajg": "leigh-goehring-adam-rozencwajg",
        "greenlight_capital": "david-einhorn",
        "harris_associates": "bill-nygren",
        "himalaya_capital": "li-lu",
        "horizon_kinetics": "murray-stahl",
        "icahn_enterprises": "carl-icahn",
        "lindsell_train": "nick-train",
        "lone_pine": "stephen-mandel",
        "markel_gayner": "tom-gayner",
        "maverick_capital": "lee-ainslie",
        "miller_value": "bill-miller",
        "oakcliff_capital": "bryan-lawrence",
        "oaktree_capital": "howard-marks",
        "orbimed_advisors": "samuel-isaly",
        "pabrai_funds": "mohnish-pabrai",
        "paulson_co": "john-paulson",
        "pershing_square": "bill-ackman",
        "punch_card": "norbert-lou",
        "ruane_cunniff": "david-poppe",
        "rv_capital": "robert-vinall",
        "saber_capital": "john-huber",
        "scion_asset": "michael-burry",
        "semper_augustus": "christopher-bloomstran",
        "shawspring": "dennis-hong",
        "situational_awareness": "leopold-aschenbrenner",
        "soros_fund": "george-soros",
        "srs_investment": "karthik-sarma",
        "starboard_value": "jeff-smith",
        "tang_capital": "kevin-tang",
        "tci_fund": "chris-hohn",
        "third_avenue": "marty-whitman",
        "third_point": "dan-loeb",
        "tiger_global": "chase-coleman",
        "trian_fund": "nelson-peltz",
        "turtle_creek": "andrew-brenton",
        "viking_global": "andreas-halvorsen",
        "weitz_investment": "wally-weitz",
        "whale_rock": "alex-sacerdote",
    }.items():
        if candidate_key == key:
            mapped_slug = candidate_slug
            break

    if mapped_slug:
        SLUG_TO_CONFIG_KEY[mapped_slug] = key
        CONFIG_STATUS[mapped_slug] = {
            "key": key,
            "files_13f": row.get("files_13f", True),
            "manager": row.get("manager", ""),
            "name": row.get("name", ""),
        }


SHARED_FILING_NOTES = {
    "ted-weschler": "Shares Berkshire's 13F with Warren Buffett/Todd Combs.",
    "todd-combs": "Shares Berkshire's 13F with Warren Buffett/Ted Weschler.",
}


def fetch_rows():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT
          i.name,
          i.slug,
          i.active,
          COUNT(f.id) AS filings_count
        FROM investors i
        LEFT JOIN filings_13f f ON f.investor_id = i.id
        GROUP BY i.id
        ORDER BY i.active DESC, filings_count DESC, i.name ASC
        """
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def classify(row):
    slug = row["slug"]
    config = CONFIG_STATUS.get(slug)

    if row["filings_count"] > 0:
        return "covered"
    if slug in SHARED_FILING_NOTES:
        return "shared-filer-profile"
    if config and not config["files_13f"]:
        return "config-disabled"
    if config and config["files_13f"]:
        return "configured-but-empty"
    return "missing-config"


def bucket_label(bucket):
    return {
        "covered": "Covered",
        "shared-filer-profile": "Shares another covered filing entity",
        "config-disabled": "Config present, 13F disabled",
        "configured-but-empty": "Configured as filer, but no loaded filings",
        "missing-config": "No filing config entry",
    }[bucket]


def note_for(row):
    slug = row["slug"]
    if slug in SHARED_FILING_NOTES:
        return SHARED_FILING_NOTES[slug]
    config = CONFIG_STATUS.get(slug)
    if config and not config["files_13f"]:
        return f"Explicitly disabled in config under `{config['key']}`."
    if config and config["files_13f"]:
        return f"Mapped to config key `{config['key']}`, but the local DB still has zero filings."
    return "No config mapping exists yet."


def table_rows(rows):
    cells = []
    for row in rows:
        bucket = classify(row)
        config = CONFIG_STATUS.get(row["slug"])
        config_key = config["key"] if config else ""
        cells.append(
            "<tr>"
            f"<td>{html.escape(row['name'])}</td>"
            f"<td><code>{html.escape(row['slug'])}</code></td>"
            f"<td>{'Active' if row['active'] else 'Inactive'}</td>"
            f"<td>{row['filings_count']}</td>"
            f"<td>{html.escape(bucket_label(bucket))}</td>"
            f"<td><code>{html.escape(config_key)}</code></td>"
            f"<td>{html.escape(note_for(row))}</td>"
            "</tr>"
        )
    return "\n".join(cells)


def render_report(rows):
    total = len(rows)
    covered = [row for row in rows if row["filings_count"] > 0]
    active_zero = [row for row in rows if row["active"] and row["filings_count"] == 0]
    inactive_with_filings = [row for row in rows if not row["active"] and row["filings_count"] > 0]
    missing_config = [row for row in rows if classify(row) == "missing-config"]
    config_disabled = [row for row in rows if classify(row) == "config-disabled"]
    shared_profiles = [row for row in rows if classify(row) == "shared-filer-profile"]

    summary_cards = [
        ("Profiles", total),
        ("With 13F history", len(covered)),
        ("Active with zero 13F", len(active_zero)),
        ("Missing config", len(missing_config)),
        ("Config disabled", len(config_disabled)),
        ("Inactive but with filings", len(inactive_with_filings)),
    ]

    cards_html = "".join(
        f"""
        <div class="card">
          <div class="value">{value}</div>
          <div class="label">{label}</div>
        </div>
        """
        for label, value in summary_cards
    )

    html_doc = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SuperInvestors 13F Coverage Gap Report</title>
  <style>
    :root {{
      --bg: #f7f7f3;
      --panel: #ffffff;
      --ink: #1c1c1c;
      --muted: #626262;
      --line: #ddddcf;
      --accent: #0f766e;
      --warn: #b45309;
      --bad: #b91c1c;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    .wrap {{
      max-width: 1440px;
      margin: 0 auto;
      padding: 32px 24px 56px;
    }}
    h1, h2 {{
      margin: 0 0 12px;
      line-height: 1.15;
    }}
    p {{
      margin: 0 0 12px;
      color: var(--muted);
    }}
    .hero, .section {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 24px;
    }}
    .hero {{
      background: linear-gradient(180deg, #ffffff 0%, #f5fbfa 100%);
    }}
    .cards {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }}
    .card {{
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      padding: 16px;
    }}
    .value {{
      font-size: 32px;
      font-weight: 800;
      color: var(--accent);
    }}
    .label {{
      color: var(--muted);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    .callout {{
      border-left: 4px solid var(--bad);
      background: #fff7f7;
      padding: 14px 16px;
      border-radius: 10px;
      margin-top: 16px;
      color: #7f1d1d;
    }}
    .subtle {{
      border-left-color: var(--warn);
      background: #fffaf0;
      color: #7c2d12;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }}
    th, td {{
      text-align: left;
      vertical-align: top;
      padding: 10px 12px;
      border-top: 1px solid var(--line);
    }}
    th {{
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      background: #fafaf8;
    }}
    code {{
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }}
    .meta {{
      font-size: 13px;
      color: var(--muted);
      margin-top: 8px;
    }}
    @media (max-width: 900px) {{
      .wrap {{ padding: 20px 14px 40px; }}
      .hero, .section {{ padding: 18px; }}
      table, thead, tbody, tr, th, td {{ display: block; }}
      thead {{ display: none; }}
      tr {{
        border: 1px solid var(--line);
        border-radius: 12px;
        margin-bottom: 12px;
        overflow: hidden;
        background: #fff;
      }}
      td {{
        border-top: 1px solid var(--line);
      }}
      td:first-child {{
        border-top: 0;
        font-weight: 700;
      }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>SuperInvestors 13F Coverage Gap Report</h1>
      <p>This report is the honest answer to the “cover all 149 profiles with 13F data” question. The current roster is much broader than the filing pipeline, so full 149-profile 13F coverage is not a small bug fix.</p>
      <div class="cards">{cards_html}</div>
      <div class="callout">
        Full 149-profile 13F coverage is not a truthful product claim right now. Only {len(covered)} profiles have local filing history. {len(missing_config)} profiles are not even present in the filing config, and {len(config_disabled)} are explicitly disabled there.
      </div>
      <div class="callout subtle">
        Some zero-filing profiles are not simple omissions. A few share another person’s filing entity, and some may never have individual 13F coverage because they are non-US investors, historical legends, private allocators, or sub-scale managers.
      </div>
      <div class="meta">Generated from /Users/ravf/projects/superinvestors-app-deploy/superinvestors.db and /Users/ravf/projects/superinvestors-app-deploy/data/config.py</div>
    </section>

    <section class="section">
      <h2>Active Profiles With Zero 13F History</h2>
      <p>These are the profiles that make the current “149 tracked” roster materially larger than the actual 13F dataset. Most of the remaining data project is here.</p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Filings</th>
            <th>Bucket</th>
            <th>Config Key</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {table_rows(active_zero)}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Inactive Profiles That Already Have Filing History</h2>
      <p>These are historically useful profiles, but they should not be confused with current live filing coverage.</p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Filings</th>
            <th>Bucket</th>
            <th>Config Key</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {table_rows(inactive_with_filings)}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Immediate Product Truths</h2>
      <p>1. The roster can stay at 149 profiles, but the site should keep saying only {len(covered)} currently have filing history.</p>
      <p>2. Reaching “all 149” would require a profile-by-profile decision: add a validated SEC filer mapping, mark it as shared coverage under another entity, or explicitly classify it as non-13F/profile-only.</p>
      <p>3. The fastest honest next step is not bulk-adding questionable mappings. It is to triage the {len(missing_config)} missing-config profiles into real filer candidates versus permanent profile-only entries.</p>
      <p>4. The {len(shared_profiles)} shared-filer profiles should probably display a UI note instead of looking like missing data.</p>
    </section>
  </div>
</body>
</html>
"""
    return html_doc


def main():
    rows = fetch_rows()
    REPORT_PATH.write_text(render_report(rows))
    print(REPORT_PATH)


if __name__ == "__main__":
    main()
