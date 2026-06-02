#!/usr/bin/env python3
"""
Per-investor 13F staleness health check.

Reads the local superinvestors.db, compares each filer's latest 13F report_date
against the most recent quarter whose 13F filing deadline has passed, and flags
filers that are behind. Writes a machine-readable report the site/UI can consume.

Usage:
  python3 data/check_staleness.py            # print report
  python3 data/check_staleness.py --json      # also write data/output/staleness.json

Status:
  current : up to date with the most recent filed quarter
  stale   : 1 quarter behind (amber)
  rotten  : 2+ quarters behind (red) — likely a dead CIK or a filer that stopped
"""

import json
import os
import sqlite3
import sys
from datetime import date

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "superinvestors.db")
OUT_PATH = os.path.join(BASE_DIR, "output", "staleness.json")


def quarter_of(d: date) -> int:
    return (d.month - 1) // 3 + 1


def expected_latest_quarter_end(today: date) -> date:
    """Most recent quarter end whose ~45-day 13F deadline has already passed."""
    y = today.year
    candidates = [
        (date(y, 12, 31), date(y + 1, 2, 14)),
        (date(y, 9, 30), date(y, 11, 14)),
        (date(y, 6, 30), date(y, 8, 14)),
        (date(y, 3, 31), date(y, 5, 15)),
        (date(y - 1, 12, 31), date(y, 2, 14)),
    ]
    for q_end, deadline in candidates:
        if today >= deadline:
            return q_end
    return date(y - 1, 9, 30)


def quarters_between(later: date, earlier: date) -> int:
    return (later.year - earlier.year) * 4 + (quarter_of(later) - quarter_of(earlier))


def parse_date(s: str):
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


def main():
    write_json = "--json" in sys.argv
    today = date.today()
    expected = expected_latest_quarter_end(today)

    if not os.path.exists(DB_PATH):
        print(f"ERROR: {DB_PATH} not found. Run seed_db.py + load_13f_to_db.py first.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT i.name, i.slug,
               MAX(f.report_date) AS latest_report_date,
               COUNT(*) AS filings_count
        FROM investors i
        JOIN filings_13f f ON f.investor_id = i.id
        GROUP BY i.id
        ORDER BY latest_report_date ASC, i.name ASC
        """
    ).fetchall()
    conn.close()

    report = []
    for r in rows:
        latest = parse_date(r["latest_report_date"]) if r["latest_report_date"] else None
        if latest is None:
            status, behind = "rotten", None
        else:
            behind = quarters_between(expected, latest)
            status = "current" if behind <= 0 else ("stale" if behind == 1 else "rotten")
        report.append({
            "name": r["name"],
            "slug": r["slug"],
            "latest_report_date": r["latest_report_date"],
            "quarters_behind": behind,
            "status": status,
            "filings_count": r["filings_count"],
        })

    counts = {"current": 0, "stale": 0, "rotten": 0}
    for x in report:
        counts[x["status"]] += 1

    print(f"As of {today.isoformat()}  |  expected latest quarter end: {expected.isoformat()}")
    print(f"Filers with 13F data: {len(report)}  "
          f"(current={counts['current']}  stale={counts['stale']}  rotten={counts['rotten']})\n")
    flagged = [x for x in report if x["status"] != "current"]
    if not flagged:
        print("All filers current.")
    else:
        print("FLAGGED (behind the expected quarter):")
        for x in flagged:
            qb = "n/a" if x["quarters_behind"] is None else f"{x['quarters_behind']}q"
            print(f"  [{x['status'].upper():6}] {x['name'][:32]:32} latest={x['latest_report_date']}  behind={qb}")

    if write_json:
        os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
        with open(OUT_PATH, "w") as fh:
            json.dump({
                "generated_at": today.isoformat(),
                "expected_quarter_end": expected.isoformat(),
                "counts": counts,
                "filers": report,
            }, fh, indent=2)
        print(f"\nWrote {OUT_PATH}")


if __name__ == "__main__":
    main()
