#!/usr/bin/env python3
"""
Generate a static index of stocks held by tracked investors, for the
/stocks/[ticker] static export (generateStaticParams) and the /stocks index page.

Reads:  superinvestors.db (rebuild it first with seed_db.py + load_13f_to_db.py)
Writes: data/stocks_index.json  (committed; imported by src/lib/static-stocks.ts)

One entry per uppercased ticker (deduped, keeping the row with the most holders).

Usage: python3 data/gen_stocks_index.py
"""

import json
import os
import re
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "superinvestors.db")
OUT_PATH = os.path.join(BASE_DIR, "stocks_index.json")

# Tickers safe to use as a URL path segment in a static export.
SAFE_TICKER = re.compile(r"^[A-Za-z0-9.\-]+$")


def main():
    if not os.path.exists(DB_PATH):
        raise SystemExit(f"ERROR: {DB_PATH} not found. Rebuild it first.")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT sec.ticker, sec.name, sec.sector,
               COUNT(DISTINCT h.investor_id) AS holder_count,
               SUM(h.value) AS total_value
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        WHERE sec.ticker IS NOT NULL AND TRIM(sec.ticker) <> ''
        GROUP BY sec.id
        ORDER BY holder_count DESC
        """
    ).fetchall()
    conn.close()

    by_ticker = {}
    for r in rows:
        ticker = (r["ticker"] or "").strip().upper()
        if not ticker or not SAFE_TICKER.match(ticker):
            continue
        existing = by_ticker.get(ticker)
        if existing is None or r["holder_count"] > existing["holder_count"]:
            by_ticker[ticker] = {
                "ticker": ticker,
                "name": r["name"],
                "sector": r["sector"],
                "holder_count": r["holder_count"],
                "total_value": r["total_value"] or 0,
            }

    # Union with the existing committed index so tickers are NEVER dropped when a given
    # run's DB is shallow/incomplete (CI re-fetches only ~12 quarters and a partial fetch
    # can miss investors). The static /stocks/[ticker] pages must cover every ticker that
    # /api/stocks (served from the full D1 data) can return, or those links 404.
    try:
        with open(OUT_PATH) as fh:
            for s in json.load(fh):
                t = (s.get("ticker") or "").strip().upper()
                if t and t not in by_ticker:
                    by_ticker[t] = s
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    stocks = sorted(
        by_ticker.values(),
        key=lambda s: (-s["holder_count"], -s["total_value"]),
    )
    with open(OUT_PATH, "w") as fh:
        json.dump(stocks, fh)
    print(f"Wrote {len(stocks)} unique tickers to {OUT_PATH}")


if __name__ == "__main__":
    main()
