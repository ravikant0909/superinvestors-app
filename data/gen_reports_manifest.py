#!/usr/bin/env python3
"""
Generate a manifest of the reports-v3 deep-dive research reports so the
SuperInvestors site can deep-link to them by ticker.

The reports already live (deployed) in the `work` repo at
  https://work-66h.pages.dev/research/investments/universe/reports-v3/<TICKER>
so we do NOT copy them — we just record which tickers have a POPULATED report
and link out. New reports auto-appear here as the work pipeline regenerates them.

Reads:  <reports-v3 dir> (in the work repo)
Writes: data/reports_manifest.json (committed; imported by src/lib/static-reports.ts)

Handles both report formats:
  - V1: `const STOCK = {...}` + SUMMARY_MD/FINANCIALS_MD/BUSINESS_MD/FUTURE_MD.
        Empty shell = all four *_MD are "".
  - V2: fact-sheet (no STOCK/_MD vars); always treated as populated.
Excludes archived `<TICKER>-v1.html` files.

Usage: python3 data/gen_reports_manifest.py
"""

import json
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
REPORTS_DIR = "/Users/ravf/projects/work/research/investments/universe/reports-v3"
BASE_URL = "https://work-66h.pages.dev/research/investments/universe/reports-v3"
OUT_PATH = os.path.join(BASE_DIR, "reports_manifest.json")

MD_DECL = re.compile(r'const (?:SUMMARY|FINANCIALS|BUSINESS|FUTURE)_MD\s*=', re.I)
MD_EMPTY = re.compile(r'const (?:SUMMARY|FINANCIALS|BUSINESS|FUTURE)_MD\s*=\s*"";', re.I)
STOCK_OBJ = re.compile(r'const STOCK\s*=\s*(\{.*?\})\s*;', re.DOTALL)
NAME_KV = re.compile(r'"name"\s*:\s*"([^"]+)"')
SECTOR_KV = re.compile(r'"sector"\s*:\s*"([^"]*)"')
TITLE = re.compile(r'<title>([^<]*)</title>', re.I)


def parse_report(path, ticker):
    text = open(path, encoding="utf-8", errors="replace").read()

    total_md = len(MD_DECL.findall(text))
    empty_md = len(MD_EMPTY.findall(text))
    is_v1 = total_md > 0
    has_content = not (is_v1 and empty_md >= total_md)  # V1 all-empty => shell

    name, sector = None, None
    m = STOCK_OBJ.search(text)
    if m:
        try:
            obj = json.loads(m.group(1))
            name = obj.get("name") or None
            sector = obj.get("sector") or None
        except Exception:
            nm = NAME_KV.search(m.group(1))
            sm = SECTOR_KV.search(m.group(1))
            name = nm.group(1) if nm else None
            sector = sm.group(1) if sm else None
    if not name:
        tm = TITLE.search(text)
        if tm:
            parts = [p.strip() for p in tm.group(1).split("—")]
            if len(parts) >= 2:
                name = parts[1]
    return {
        "ticker": ticker,
        "name": name or ticker,
        "sector": sector,
        "version": "V1" if is_v1 else "V2",
        "has_content": has_content,
        "url": f"{BASE_URL}/{ticker}",
    }


def main():
    if not os.path.isdir(REPORTS_DIR):
        raise SystemExit(f"ERROR: reports dir not found: {REPORTS_DIR}")
    reports, skipped_empty = [], 0
    for fn in sorted(os.listdir(REPORTS_DIR)):
        if not fn.endswith(".html"):
            continue
        stem = fn[:-5]
        if stem.lower().endswith("-v1"):  # archived V1 versions
            continue
        ticker = stem.upper()
        if not re.match(r"^[A-Z0-9.\-]+$", ticker):
            continue
        rec = parse_report(os.path.join(REPORTS_DIR, fn), ticker)
        if rec["has_content"]:
            reports.append({k: rec[k] for k in ("ticker", "name", "sector", "version", "url")})
        else:
            skipped_empty += 1

    reports.sort(key=lambda r: r["ticker"])
    with open(OUT_PATH, "w") as fh:
        json.dump(reports, fh, indent=0)
    print(f"Wrote {len(reports)} populated reports to {OUT_PATH} "
          f"(skipped {skipped_empty} empty shells)")


if __name__ == "__main__":
    main()
