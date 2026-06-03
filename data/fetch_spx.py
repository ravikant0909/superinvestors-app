#!/usr/bin/env python3
"""
Fetch S&P 500 (^GSPC) quarter-end closes from Yahoo Finance so the History view
can benchmark each investor's annualized return vs the index over the same period.

Writes data/spx_quarter_closes.json (committed):
  { "latest": <float>, "latest_asof": "YYYY-MM-DD", "quarters": { "YYYY-Qn": close, ... } }

The quarter close = the last available monthly close in months 3/6/9/12.
"latest" = the most recent monthly close (≈ "now").

Usage: python3 data/fetch_spx.py
"""

import json
import os
import urllib.request
from datetime import datetime, timezone

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spx_quarter_closes.json")
URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=20y&interval=1mo"


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    data = json.load(urllib.request.urlopen(req, timeout=30))
    res = data["chart"]["result"][0]
    ts = res["timestamp"]
    closes = res["indicators"]["quote"][0]["close"]

    quarters = {}
    latest = None
    latest_asof = None
    for t, c in zip(ts, closes):
        if c is None:
            continue
        dt = datetime.fromtimestamp(t, tz=timezone.utc)
        latest, latest_asof = round(c, 2), dt.strftime("%Y-%m-%d")
        if dt.month in (3, 6, 9, 12):
            quarters[f"{dt.year}-Q{(dt.month - 1) // 3 + 1}"] = round(c, 2)

    payload = {"latest": latest, "latest_asof": latest_asof, "quarters": quarters}
    with open(OUT, "w") as fh:
        json.dump(payload, fh, indent=0)
    print(f"Wrote {len(quarters)} quarter closes to {OUT}; latest {latest} as of {latest_asof}")


if __name__ == "__main__":
    main()
