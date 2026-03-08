#!/usr/bin/env python3
"""
Fetch current stock prices and historical quarter price ranges for all tickers
found in the 13F output data.

Uses:
  - Finnhub API for current prices (requires FINNHUB_API_KEY env var)
  - Yahoo Finance chart API for historical quarter price ranges (no key needed)

Usage:
  cd data && python fetch_prices.py
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package not installed. Run: pip install requests")
    sys.exit(1)

# ── Configuration ──────────────────────────────────────────────────────────────

OUTPUT_DIR = Path(__file__).parent / "output"
PRICES_FILE = OUTPUT_DIR / "prices.json"
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
YAHOO_USER_AGENT = "SuperInvestors Research"
BATCH_SIZE = 10
BATCH_DELAY = 1.1  # seconds between batches (Finnhub free tier: 60 req/min)

# ── Collect Tickers ────────────────────────────────────────────────────────────


def collect_tickers() -> set[str]:
    """Scan all 13F output files and collect unique non-CUSIP tickers."""
    tickers = set()
    for f in OUTPUT_DIR.glob("*_13f_*.json"):
        try:
            data = json.loads(f.read_text())
            for h in data.get("top_holdings", []):
                ticker = h.get("ticker", "")
                # Skip CUSIP-only tickers (5+ digits)
                if ticker and not re.match(r"^\d{5,}", ticker):
                    tickers.add(ticker)
        except (json.JSONDecodeError, KeyError):
            continue
    return tickers


def collect_quarters() -> set[str]:
    """Collect all quarters mentioned in filings data."""
    quarters = set()
    for f in OUTPUT_DIR.glob("*_13f_*.json"):
        try:
            data = json.loads(f.read_text())
            if data.get("latest_quarter"):
                quarters.add(data["latest_quarter"])
            if data.get("changes", {}).get("previous_quarter"):
                quarters.add(data["changes"]["previous_quarter"])
        except (json.JSONDecodeError, KeyError):
            continue
    return quarters


# ── Quarter Date Ranges ────────────────────────────────────────────────────────


def quarter_to_dates(quarter: str) -> tuple[int, int]:
    """
    Convert quarter string like '2025-Q4' to Unix timestamps (start, end).
    Q1 = Jan 1 - Mar 31, Q2 = Apr 1 - Jun 30,
    Q3 = Jul 1 - Sep 30, Q4 = Oct 1 - Dec 31
    """
    match = re.match(r"(\d{4})-Q(\d)", quarter)
    if not match:
        raise ValueError(f"Invalid quarter format: {quarter}")

    year = int(match.group(1))
    q = int(match.group(2))

    quarter_months = {1: (1, 3), 2: (4, 6), 3: (7, 9), 4: (10, 12)}
    start_month, end_month = quarter_months[q]

    start = datetime(year, start_month, 1, tzinfo=timezone.utc)
    # End of quarter: last day of end_month
    if end_month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, end_month + 1, 1, tzinfo=timezone.utc)

    return int(start.timestamp()), int(end.timestamp())


# ── Finnhub: Current Prices ───────────────────────────────────────────────────


def fetch_current_price(ticker: str) -> dict | None:
    """Fetch current price from Finnhub API."""
    try:
        resp = requests.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": ticker, "token": FINNHUB_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("c") and data["c"] > 0:
            return {"price": round(data["c"], 2), "prev_close": round(data.get("pc", 0), 2)}
    except Exception as e:
        print(f"  WARN: Finnhub failed for {ticker}: {e}")
    return None


def fetch_all_current_prices(tickers: list[str]) -> dict:
    """Fetch current prices in batches to respect rate limits."""
    results = {}
    batches = [tickers[i : i + BATCH_SIZE] for i in range(0, len(tickers), BATCH_SIZE)]

    for batch_idx, batch in enumerate(batches):
        if batch_idx > 0:
            time.sleep(BATCH_DELAY)

        print(f"  Batch {batch_idx + 1}/{len(batches)}: {', '.join(batch[:5])}...")

        with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
            futures = {executor.submit(fetch_current_price, t): t for t in batch}
            for future in as_completed(futures):
                ticker = futures[future]
                result = future.result()
                if result:
                    results[ticker] = result

    return results


# ── Yahoo Finance: Historical Quarter Ranges ──────────────────────────────────


def fetch_quarter_range(ticker: str, period1: int, period2: int) -> dict | None:
    """Fetch historical daily close prices from Yahoo Finance and compute min/max/avg."""
    try:
        resp = requests.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}",
            params={"period1": period1, "period2": period2, "interval": "1d"},
            headers={"User-Agent": YAHOO_USER_AGENT},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        closes = data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
        # Filter out None values
        valid_closes = [c for c in closes if c is not None]
        if not valid_closes:
            return None

        return {
            "min": round(min(valid_closes), 2),
            "max": round(max(valid_closes), 2),
            "avg": round(sum(valid_closes) / len(valid_closes), 2),
        }
    except Exception as e:
        print(f"  WARN: Yahoo Finance failed for {ticker}: {e}")
    return None


def fetch_all_quarter_ranges(tickers: list[str], quarters: list[str]) -> dict:
    """Fetch historical ranges for all tickers across all quarters."""
    results = {}

    for quarter in sorted(quarters):
        print(f"\n  Quarter {quarter}:")
        try:
            period1, period2 = quarter_to_dates(quarter)
        except ValueError as e:
            print(f"    Skipping: {e}")
            continue

        quarter_data = {}
        batches = [tickers[i : i + BATCH_SIZE] for i in range(0, len(tickers), BATCH_SIZE)]

        for batch_idx, batch in enumerate(batches):
            if batch_idx > 0:
                time.sleep(0.5)  # Be polite to Yahoo

            print(f"    Batch {batch_idx + 1}/{len(batches)}: {', '.join(batch[:5])}...")

            with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
                futures = {
                    executor.submit(fetch_quarter_range, t, period1, period2): t
                    for t in batch
                }
                for future in as_completed(futures):
                    ticker = futures[future]
                    result = future.result()
                    if result:
                        quarter_data[ticker] = result

        if quarter_data:
            results[quarter] = quarter_data

    return results


# ── Main ───────────────────────────────────────────────────────────────────────


def main():
    print("=== SuperInvestors Price Fetcher ===\n")

    # Collect tickers
    tickers = sorted(collect_tickers())
    quarters = sorted(collect_quarters())
    print(f"Found {len(tickers)} unique tickers across {len(quarters)} quarters")
    print(f"Quarters: {', '.join(quarters)}\n")

    if not tickers:
        print("ERROR: No tickers found. Make sure 13F data exists in data/output/")
        sys.exit(1)

    if not FINNHUB_API_KEY:
        print("ERROR: FINNHUB_API_KEY environment variable not set.")
        print("  Set it with: export FINNHUB_API_KEY=your_key_here")
        print("  Get a free key at: https://finnhub.io/register")
        sys.exit(1)

    # Fetch current prices
    print(f"[1/2] Fetching current prices from Finnhub ({len(tickers)} tickers)...")
    current_prices = fetch_all_current_prices(tickers)
    print(f"  Got prices for {len(current_prices)}/{len(tickers)} tickers\n")

    # Fetch historical ranges
    print(f"[2/2] Fetching historical ranges from Yahoo Finance...")
    quarter_ranges = fetch_all_quarter_ranges(tickers, quarters)
    total_ranges = sum(len(v) for v in quarter_ranges.values())
    print(f"\n  Got ranges for {total_ranges} ticker-quarter combinations\n")

    # Write output
    output = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "current_prices": current_prices,
        "quarter_ranges": quarter_ranges,
    }

    PRICES_FILE.write_text(json.dumps(output, indent=2))
    print(f"Written to {PRICES_FILE}")
    print(f"  Current prices: {len(current_prices)}")
    print(f"  Quarter ranges: {len(quarter_ranges)} quarters")
    print("\nDone.")


if __name__ == "__main__":
    main()
