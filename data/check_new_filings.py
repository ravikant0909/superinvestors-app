#!/usr/bin/env python3
"""
Check for New 13F Filings — Automated Monitoring Script

Checks SEC EDGAR for new 13F-HR filings from all configured investors,
compares against cached filings, downloads and processes any new ones.

Designed to run via cron:
    0 6 * * * /usr/bin/python3 /Users/ravf/projects/work/research/investments/superinvestors/data/check_new_filings.py

Key dates for 13F deadlines:
    Q4 filings due by Feb 14
    Q1 filings due by May 15
    Q2 filings due by Aug 14
    Q3 filings due by Nov 14
    Most filers submit within the first week after each deadline.
    This script checks daily; during the 2-week window after each deadline,
    new filings are most likely to appear.

Usage:
    python check_new_filings.py              # Check all active investors
    python check_new_filings.py --verbose    # Verbose output
    python check_new_filings.py --dry-run    # Check without downloading
    python check_new_filings.py --investor berkshire_hathaway  # Single investor
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, date
from pathlib import Path
from typing import Optional

# Ensure the data directory is on the path
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    INVESTORS,
    CACHE_DIR,
    OUTPUT_DIR,
    QUARTER_DEADLINES,
    SEC_EDGAR_API,
    SEC_USER_AGENT,
    SEC_RATE_LIMIT,
)

import requests

# =============================================================================
# Configuration
# =============================================================================

# Where to write notifications about new filings
NOTIFICATIONS_DIR = OUTPUT_DIR / "notifications"
NOTIFICATIONS_DIR.mkdir(parents=True, exist_ok=True)

# Log file for the checker
CHECK_LOG = OUTPUT_DIR / "check_new_filings.log"

# State file: tracks the most recent filing we've seen per investor
STATE_FILE = OUTPUT_DIR / "last_seen_filings.json"


# =============================================================================
# Logging
# =============================================================================

def setup_logging(verbose: bool = False):
    """Configure logging to both file and console."""
    log_level = logging.DEBUG if verbose else logging.INFO

    file_handler = logging.FileHandler(CHECK_LOG, mode="a")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)


logger = logging.getLogger(__name__)


# =============================================================================
# Rate Limiter
# =============================================================================

class RateLimiter:
    """Simple rate limiter: max N requests per second."""

    def __init__(self, max_per_second: int = 10):
        self.min_interval = 1.0 / max_per_second
        self._last_request = 0.0

    def wait(self):
        now = time.monotonic()
        elapsed = now - self._last_request
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request = time.monotonic()


# =============================================================================
# State Management
# =============================================================================

def load_state() -> dict:
    """Load last-seen filing state from disk."""
    if STATE_FILE.exists():
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {}


def save_state(state: dict):
    """Save last-seen filing state to disk."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


# =============================================================================
# Filing Deadline Awareness
# =============================================================================

def get_current_filing_window() -> dict:
    """
    Determine which filing deadline we're near and whether we're in
    the 2-week hot window.

    Returns dict with:
        quarter: int (1-4)
        deadline: str (MM-DD)
        in_hot_window: bool
        days_since_deadline: int (negative = before deadline)
    """
    today = date.today()
    year = today.year

    # Build deadline dates for current year
    windows = []
    for q, info in QUARTER_DEADLINES.items():
        deadline_str = info["deadline"]
        month, day = map(int, deadline_str.split("-"))
        # Q4 deadline (Feb 14) is for the previous year's Q4
        deadline_year = year if q != 4 else year
        deadline_date = date(deadline_year, month, day)
        days_diff = (today - deadline_date).days
        windows.append({
            "quarter": q,
            "deadline": deadline_str,
            "deadline_date": deadline_date,
            "days_since_deadline": days_diff,
            "in_hot_window": 0 <= days_diff <= 14,
        })

    # Find the nearest deadline (past or future)
    windows.sort(key=lambda w: abs(w["days_since_deadline"]))
    nearest = windows[0]

    return nearest


# =============================================================================
# EDGAR API
# =============================================================================

def get_latest_13f_filing(
    cik: str,
    session: requests.Session,
    rate_limiter: RateLimiter,
) -> dict | None:
    """
    Query EDGAR submissions API for the most recent 13F-HR filing.

    Returns dict with:
        accession_number: str
        filing_date: str (YYYY-MM-DD)
        report_date: str (YYYY-MM-DD, quarter end)
        form_type: str
    Or None if no 13F found.
    """
    cik_padded = cik.lstrip("0").zfill(10)
    url = f"{SEC_EDGAR_API}/submissions/CIK{cik_padded}.json"

    rate_limiter.wait()
    try:
        resp = session.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, json.JSONDecodeError) as e:
        logger.error(f"Failed to fetch submissions for CIK {cik}: {e}")
        return None

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    filing_dates = recent.get("filingDate", [])
    report_dates = recent.get("reportDate", [])

    for i, form in enumerate(forms):
        if form in ("13F-HR", "13F-HR/A"):
            return {
                "accession_number": accessions[i] if i < len(accessions) else "",
                "filing_date": filing_dates[i] if i < len(filing_dates) else "",
                "report_date": report_dates[i] if i < len(report_dates) else "",
                "form_type": form,
            }

    return None


def get_cached_filings(investor_key: str) -> list[str]:
    """
    Get list of accession numbers we already have cached for this investor.
    Returns list of accession numbers (with dashes stripped).
    """
    investor_cache = CACHE_DIR / investor_key
    if not investor_cache.exists():
        return []

    cached = []
    for f in investor_cache.glob("*.json"):
        # Files are named like: 0001067983250000XX.json (accession without dashes)
        if f.name != "raw":
            cached.append(f.stem)

    return cached


def is_filing_cached(investor_key: str, accession_number: str) -> bool:
    """Check if we already have this filing cached."""
    safe_accession = accession_number.replace("-", "")
    cache_path = CACHE_DIR / investor_key / f"{safe_accession}.json"
    return cache_path.exists()


# =============================================================================
# Processing
# =============================================================================

def process_new_filing(investor_key: str, investor_config: dict) -> dict | None:
    """
    Download and process a new filing using the existing pipeline.

    Returns the processed filing data, or None on failure.
    """
    try:
        from fetcher_13f import Fetcher13F
        from cusip_mapper import CUSIPMapper

        fetcher = Fetcher13F()
        mapper = CUSIPMapper()

        cik = investor_config["cik"]
        filings = fetcher.fetch_filings(cik, investor_key, quarters_back=2)

        if filings:
            # Map CUSIPs
            for filing in filings:
                mapper.map_holdings(filing["holdings"])

            return filings[0]  # Return the latest
        return None

    except Exception as e:
        logger.error(f"Failed to process filing for {investor_key}: {e}", exc_info=True)
        return None


# =============================================================================
# Notifications
# =============================================================================

def write_notification(new_filings: list[dict]):
    """
    Write a notification file summarizing new filings found.

    Also prints to stdout (visible in cron email output).
    """
    if not new_filings:
        return

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    notification_path = NOTIFICATIONS_DIR / f"new_filings_{timestamp}.txt"

    lines = []
    lines.append("=" * 70)
    lines.append(f"  NEW 13F FILINGS DETECTED — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("=" * 70)
    lines.append("")

    for entry in new_filings:
        inv_key = entry["investor_key"]
        inv_config = entry["investor_config"]
        filing = entry["filing_info"]

        lines.append(f"  {inv_config['manager']:40s}  ({inv_config['name']})")
        lines.append(f"    Filing Date:   {filing['filing_date']}")
        lines.append(f"    Report Date:   {filing['report_date']} (quarter end)")
        lines.append(f"    Accession:     {filing['accession_number']}")
        lines.append(f"    Form:          {filing['form_type']}")

        if entry.get("processed"):
            processed = entry["processed"]
            lines.append(
                f"    Holdings:      {processed['holdings_count']} positions, "
                f"${processed['total_value_thousands'] / 1_000_000:.1f}B total"
            )
            # Top 5 holdings
            top = sorted(
                processed.get("holdings", []),
                key=lambda h: h.get("value", 0),
                reverse=True,
            )[:5]
            if top:
                lines.append("    Top 5:")
                for h in top:
                    ticker = h.get("ticker", h.get("cusip", "???"))
                    lines.append(
                        f"      {ticker:8s}  ${h['value'] / 1000:>8,.1f}M  "
                        f"{h['shares']:>12,} shares"
                    )
        lines.append("")

    lines.append("=" * 70)
    lines.append(
        f"  Run pipeline for full analysis:"
    )
    lines.append(
        f"    python /Users/ravf/projects/work/research/investments/"
        f"superinvestors/data/run_pipeline.py --all"
    )
    lines.append("=" * 70)

    notification_text = "\n".join(lines)

    # Write to file
    with open(notification_path, "w") as f:
        f.write(notification_text)

    # Print to stdout (for cron email)
    print(notification_text)

    logger.info(f"Notification written to: {notification_path}")


# =============================================================================
# Main Check Loop
# =============================================================================

def check_all_investors(
    investor_keys: list[str] | None = None,
    dry_run: bool = False,
) -> list[dict]:
    """
    Check all (or specified) investors for new 13F filings.

    Args:
        investor_keys: Optional list of investor keys to check.
                       If None, checks all active 13F filers.
        dry_run: If True, only check — don't download or process.

    Returns:
        List of dicts for each new filing found.
    """
    # Filter to active 13F filers only
    if investor_keys is None:
        investor_keys = [
            k for k, v in INVESTORS.items()
            if v.get("files_13f", True)
        ]

    # Load state
    state = load_state()

    # HTTP session
    session = requests.Session()
    session.headers.update({
        "User-Agent": SEC_USER_AGENT,
        "Accept-Encoding": "gzip, deflate",
    })
    rate_limiter = RateLimiter(SEC_RATE_LIMIT)

    # Filing window info
    window = get_current_filing_window()
    hot_str = " ** HOT WINDOW **" if window["in_hot_window"] else ""
    logger.info(
        f"Filing window: Q{window['quarter']} deadline {window['deadline']}, "
        f"{window['days_since_deadline']}d since deadline{hot_str}"
    )

    new_filings = []
    checked = 0
    errors = 0

    for inv_key in investor_keys:
        inv_config = INVESTORS[inv_key]
        cik = inv_config["cik"]
        manager = inv_config["manager"]

        logger.debug(f"Checking {inv_key} (CIK {cik}) — {manager}")

        # Get latest filing from EDGAR
        latest = get_latest_13f_filing(cik, session, rate_limiter)
        checked += 1

        if latest is None:
            logger.warning(f"  {inv_key}: No 13F filings found on EDGAR")
            errors += 1
            continue

        accession = latest["accession_number"]
        filing_date = latest["filing_date"]
        report_date = latest["report_date"]

        # Compare against state
        last_seen = state.get(inv_key, {}).get("last_accession", "")
        is_cached = is_filing_cached(inv_key, accession)

        if accession == last_seen and is_cached:
            logger.debug(
                f"  {inv_key}: No new filing (latest: {filing_date}, "
                f"period: {report_date})"
            )
            continue

        # NEW FILING DETECTED
        logger.info(
            f"  ** NEW FILING ** {inv_key}: {manager} — "
            f"filed {filing_date}, period {report_date}, "
            f"accession {accession}"
        )

        entry = {
            "investor_key": inv_key,
            "investor_config": inv_config,
            "filing_info": latest,
            "processed": None,
        }

        if not dry_run:
            # Download and process
            logger.info(f"  Downloading and processing {inv_key}...")
            processed = process_new_filing(inv_key, inv_config)
            if processed:
                entry["processed"] = processed
                logger.info(
                    f"  Processed: {processed['holdings_count']} holdings, "
                    f"${processed['total_value_thousands'] / 1_000_000:.1f}B"
                )
            else:
                logger.warning(f"  Failed to process filing for {inv_key}")

            # Update state
            state[inv_key] = {
                "last_accession": accession,
                "filing_date": filing_date,
                "report_date": report_date,
                "checked_at": datetime.utcnow().isoformat(),
            }

        new_filings.append(entry)

    # Save updated state
    if not dry_run:
        save_state(state)

    return new_filings, checked, errors


# =============================================================================
# Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Check for new 13F filings from configured superinvestors",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Cron setup (check daily at 6am):
    0 6 * * * /usr/bin/python3 /Users/ravf/projects/work/research/investments/superinvestors/data/check_new_filings.py

13F Filing Deadlines:
    Q4 (Dec 31) -> due Feb 14    Q1 (Mar 31) -> due May 15
    Q2 (Jun 30) -> due Aug 14    Q3 (Sep 30) -> due Nov 14
        """,
    )
    parser.add_argument(
        "--investor",
        type=str,
        help="Check a specific investor only",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Check only, don't download or process new filings",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output",
    )
    parser.add_argument(
        "--init-state",
        action="store_true",
        help="Initialize state from currently cached filings (first run)",
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    logger.info("=" * 50)
    logger.info("13F Filing Checker — Starting")
    logger.info(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    # Determine which investors to check
    investor_keys = None
    if args.investor:
        if args.investor not in INVESTORS:
            print(f"ERROR: Unknown investor '{args.investor}'")
            print(f"Available: {', '.join(INVESTORS.keys())}")
            sys.exit(1)
        if not INVESTORS[args.investor].get("files_13f", True):
            print(f"WARNING: {args.investor} is marked as not filing 13F")
        investor_keys = [args.investor]

    # Initialize state from cache if requested
    if args.init_state:
        logger.info("Initializing state from cached filings...")
        state = load_state()
        session = requests.Session()
        session.headers.update({
            "User-Agent": SEC_USER_AGENT,
            "Accept-Encoding": "gzip, deflate",
        })
        rate_limiter = RateLimiter(SEC_RATE_LIMIT)

        keys = investor_keys or [
            k for k, v in INVESTORS.items()
            if v.get("files_13f", True)
        ]

        for inv_key in keys:
            inv_config = INVESTORS[inv_key]
            latest = get_latest_13f_filing(inv_config["cik"], session, rate_limiter)
            if latest:
                state[inv_key] = {
                    "last_accession": latest["accession_number"],
                    "filing_date": latest["filing_date"],
                    "report_date": latest["report_date"],
                    "checked_at": datetime.utcnow().isoformat(),
                }
                logger.info(
                    f"  {inv_key}: latest = {latest['filing_date']} "
                    f"(period {latest['report_date']})"
                )
            else:
                logger.warning(f"  {inv_key}: no 13F found")

        save_state(state)
        logger.info(f"State initialized for {len(state)} investors")
        logger.info(f"State file: {STATE_FILE}")
        return

    # Run the check
    t0 = time.time()
    new_filings, checked, errors = check_all_investors(
        investor_keys=investor_keys,
        dry_run=args.dry_run,
    )
    elapsed = time.time() - t0

    # Summary
    logger.info("")
    logger.info("=" * 50)
    logger.info(f"Check complete in {elapsed:.1f}s")
    logger.info(f"  Investors checked: {checked}")
    logger.info(f"  Errors: {errors}")
    logger.info(f"  New filings found: {len(new_filings)}")

    if new_filings:
        mode = "[DRY RUN] " if args.dry_run else ""
        logger.info(f"  {mode}New filings:")
        for entry in new_filings:
            filing = entry["filing_info"]
            config = entry["investor_config"]
            logger.info(
                f"    {config['manager']:40s}  "
                f"filed {filing['filing_date']}  "
                f"period {filing['report_date']}"
            )

        # Write notification
        if not args.dry_run:
            write_notification(new_filings)
    else:
        logger.info("  No new filings. All up to date.")

    logger.info("=" * 50)


if __name__ == "__main__":
    main()
