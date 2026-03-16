#!/usr/bin/env python3
"""
SuperInvestors 13F Pipeline - Main Entry Point

Fetches latest 13F-HR filings for all configured investors,
maps CUSIPs to tickers, computes position changes vs previous quarter,
and saves structured results to data/output/.

Usage:
    python run_pipeline.py --all                    # Process all investors
    python run_pipeline.py --investor berkshire_hathaway  # Single investor
    python run_pipeline.py --investor himalaya_capital --quarters 4
    python run_pipeline.py --list                   # List available investors
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

# Ensure the data directory is on the path
sys.path.insert(0, str(Path(__file__).parent))

from config import INVESTORS, OUTPUT_DIR, LOG_FILE
from fetcher_13f import Fetcher13F
from cusip_mapper import CUSIPMapper
from position_tracker import PositionTracker, format_quarter_label


def setup_logging(verbose: bool = False):
    """Configure logging to both file and console."""
    log_level = logging.DEBUG if verbose else logging.INFO

    # File handler
    file_handler = logging.FileHandler(LOG_FILE, mode="a")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )

    # Console handler
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


def process_investor(
    investor_key: str,
    investor_config: dict,
    fetcher: Fetcher13F,
    mapper: CUSIPMapper,
    tracker: PositionTracker,
    quarters_back: int = 2,
) -> dict:
    """
    Process a single investor: fetch 13F, map CUSIPs, compute changes.

    Returns a result dict with all data.
    """
    name = investor_config["name"]
    cik = investor_config["cik"]
    manager = investor_config["manager"]

    print(f"\n{'='*70}")
    print(f"  {name}")
    print(f"  Manager: {manager} | CIK: {cik}")
    print(f"{'='*70}")

    # Step 1: Fetch 13F filings
    print(f"  [1/3] Fetching 13F-HR filings (last {quarters_back} quarters)...")
    t0 = time.time()
    filings = fetcher.fetch_filings(cik, investor_key, quarters_back=quarters_back)
    elapsed = time.time() - t0

    if not filings:
        print(f"  ERROR: No 13F filings found for {name}.")
        return {
            "investor_key": investor_key,
            "name": name,
            "cik": cik,
            "manager": manager,
            "status": "NO_FILINGS",
            "error": "No 13F-HR filings found",
        }

    print(f"  Found {len(filings)} filing(s) in {elapsed:.1f}s")

    for f in filings:
        quarter = format_quarter_label(f.get("report_date", ""))
        print(
            f"    - {quarter} ({f['filing_date']}) | "
            f"{f['holdings_count']} holdings | "
            f"${f['total_value_thousands'] / 1_000_000:.1f}B"
        )

    # Step 2: Map CUSIPs to tickers
    print(f"  [2/3] Mapping CUSIPs to tickers...")
    for filing in filings:
        mapper.map_holdings(filing["holdings"])

    latest = filings[0]
    mapped_count = sum(
        1 for h in latest["holdings"]
        if h.get("ticker", h["cusip"]) != h["cusip"]
    )
    total_count = len(latest["holdings"])
    print(f"    Mapped {mapped_count}/{total_count} positions to tickers")

    # Step 3: Compute position changes
    changes_result = None
    if len(filings) >= 2:
        print(f"  [3/3] Computing position changes...")
        current_quarter = format_quarter_label(filings[0].get("report_date", ""))
        previous_quarter = format_quarter_label(filings[1].get("report_date", ""))

        changes_result = tracker.compare(
            filings[0]["holdings"],
            filings[1]["holdings"],
            current_quarter,
            previous_quarter,
        )

        summary = changes_result["summary"]
        print(
            f"    {current_quarter} vs {previous_quarter}: "
            f"{summary['new']} NEW, "
            f"{summary['increased']} INCREASED, "
            f"{summary['decreased']} DECREASED, "
            f"{summary['sold_out']} SOLD_OUT, "
            f"{summary['unchanged']} UNCHANGED"
        )

        # Show significant changes
        significant = tracker.get_significant_changes(
            changes_result, min_value_thousands=10_000
        )
        if significant:
            print(f"\n    Significant changes (>$10M):")
            for c in significant[:15]:
                ticker = c.get("ticker", c.get("cusip", "???"))
                ctype = c["change_type"]
                if ctype == "NEW":
                    print(
                        f"      + NEW     {ticker:8s} "
                        f"{c['current_shares']:>12,} shares  "
                        f"${c['current_value'] / 1000:>8,.1f}M"
                    )
                elif ctype == "SOLD_OUT":
                    print(
                        f"      - SOLD    {ticker:8s} "
                        f"{c['previous_shares']:>12,} shares  "
                        f"${c['previous_value'] / 1000:>8,.1f}M"
                    )
                elif ctype == "INCREASED":
                    pct = c.get("share_change_pct", 0) or 0
                    print(
                        f"      ^ UP      {ticker:8s} "
                        f"{c['share_delta']:>+12,} shares ({pct:>+.1f}%)  "
                        f"${c['current_value'] / 1000:>8,.1f}M"
                    )
                elif ctype == "DECREASED":
                    pct = c.get("share_change_pct", 0) or 0
                    print(
                        f"      v DOWN    {ticker:8s} "
                        f"{c['share_delta']:>+12,} shares ({pct:>+.1f}%)  "
                        f"${c['current_value'] / 1000:>8,.1f}M"
                    )
            if len(significant) > 15:
                print(f"      ... and {len(significant) - 15} more")
    else:
        print(f"  [3/3] Skipping changes (only 1 filing available)")

    # Build top holdings for the latest quarter
    top_holdings = sorted(
        latest["holdings"], key=lambda h: h.get("value", 0), reverse=True
    )[:20]

    print(f"\n    Top 10 Holdings ({format_quarter_label(latest.get('report_date', ''))}):")
    for i, h in enumerate(top_holdings[:10], 1):
        ticker = h.get("ticker", h.get("cusip", "???"))
        pct = (
            h["value"] / latest["total_value_thousands"] * 100
            if latest["total_value_thousands"] > 0
            else 0
        )
        print(
            f"      {i:2d}. {ticker:8s} "
            f"${h['value'] / 1000:>8,.1f}M  "
            f"{h['shares']:>12,} shares  "
            f"({pct:.1f}%)"
        )

    # Assemble result
    result = {
        "investor_key": investor_key,
        "name": name,
        "cik": cik,
        "manager": manager,
        "style": investor_config.get("style", ""),
        "status": "OK",
        "processed_at": datetime.utcnow().isoformat(),
        "filings_count": len(filings),
        "latest_quarter": format_quarter_label(filings[0].get("report_date", "")),
        "latest_filing_date": filings[0].get("filing_date", ""),
        "latest_holdings_count": filings[0]["holdings_count"],
        "latest_total_value_thousands": filings[0]["total_value_thousands"],
        "top_holdings": [
            {
                "ticker": h.get("ticker", h.get("cusip", "")),
                "name": h.get("name_of_issuer", ""),
                "cusip": h.get("cusip", ""),
                "value_thousands": h.get("value", 0),
                "shares": h.get("shares", 0),
                "weight_pct": round(
                    h["value"] / latest["total_value_thousands"] * 100, 2
                )
                if latest["total_value_thousands"] > 0
                else 0,
            }
            for h in top_holdings
        ],
        "changes": changes_result,
        "filings": filings,
    }

    return result


def save_results(results: list[dict], output_dir: Path):
    """Save results to JSON files in the output directory."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d")

    # Individual investor files
    for result in results:
        key = result["investor_key"]
        filepath = output_dir / f"{key}_13f_{timestamp}.json"
        with open(filepath, "w") as f:
            json.dump(result, f, indent=2, default=str)
        logger.info(f"Saved: {filepath}")

    # Combined summary file
    summary = {
        "generated_at": datetime.utcnow().isoformat(),
        "investors_processed": len(results),
        "investors_successful": sum(1 for r in results if r["status"] == "OK"),
        "investors": [],
    }

    for r in results:
        investor_summary = {
            "key": r["investor_key"],
            "name": r["name"],
            "manager": r["manager"],
            "status": r["status"],
        }
        if r["status"] == "OK":
            investor_summary.update({
                "latest_quarter": r.get("latest_quarter", ""),
                "holdings_count": r.get("latest_holdings_count", 0),
                "total_value_millions": round(
                    r.get("latest_total_value_thousands", 0) / 1000, 1
                ),
                "top_3": [
                    f"{h['ticker']} ({h['weight_pct']}%)"
                    for h in r.get("top_holdings", [])[:3]
                ],
            })
            if r.get("changes"):
                s = r["changes"]["summary"]
                investor_summary["changes_summary"] = (
                    f"{s['new']}N {s['increased']}I {s['decreased']}D "
                    f"{s['sold_out']}S {s['unchanged']}U"
                )
        summary["investors"].append(investor_summary)

    summary_path = output_dir / f"summary_13f_{timestamp}.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    logger.info(f"Saved summary: {summary_path}")

    # Also save/overwrite a "latest" symlink-like file
    latest_path = output_dir / "latest_summary.json"
    with open(latest_path, "w") as f:
        json.dump(summary, f, indent=2)

    return summary_path


def main():
    parser = argparse.ArgumentParser(
        description="SuperInvestors 13F Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python run_pipeline.py --all
    python run_pipeline.py --investor berkshire_hathaway
    python run_pipeline.py --investor himalaya_capital --quarters 8
    python run_pipeline.py --list
        """,
    )
    parser.add_argument(
        "--investor",
        type=str,
        help="Process a specific investor (use key from config)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all configured investors",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all configured investors and exit",
    )
    parser.add_argument(
        "--quarters",
        type=int,
        default=12,
        help="Number of quarters to fetch (default: 12, ~3 years of history)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose/debug logging",
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    # List mode
    if args.list:
        print("\nConfigured Investors:")
        print("-" * 90)
        active_count = 0
        for key, inv in INVESTORS.items():
            files = inv.get("files_13f", True)
            status = "" if files else "  [SKIP - no 13F]"
            print(
                f"  {key:25s}  CIK {inv['cik']:>10s}  "
                f"{inv['manager']:40s}  {inv['style']}{status}"
            )
            if files:
                active_count += 1
        print(f"\nTotal: {len(INVESTORS)} investors ({active_count} active 13F filers)")
        return

    # Determine which investors to process
    if args.investor:
        if args.investor not in INVESTORS:
            print(f"ERROR: Unknown investor key '{args.investor}'")
            print(f"Available keys: {', '.join(INVESTORS.keys())}")
            sys.exit(1)
        investor_keys = [args.investor]
    elif args.all:
        # Skip investors that don't file 13F (non-US, inactive)
        investor_keys = [
            k for k, v in INVESTORS.items()
            if v.get("files_13f", True)
        ]
    else:
        parser.print_help()
        print("\nERROR: Specify --investor KEY or --all")
        sys.exit(1)

    # Initialize components
    print(f"\n{'#'*70}")
    print(f"  SuperInvestors 13F Pipeline")
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Investors: {len(investor_keys)}")
    print(f"  Quarters: {args.quarters}")
    print(f"{'#'*70}")

    fetcher = Fetcher13F()
    mapper = CUSIPMapper()
    tracker = PositionTracker()

    # Pre-load CUSIP mapper
    print("\nPre-loading CUSIP-to-ticker mapping...")
    t0 = time.time()
    _ = mapper.map_cusip("037833100", "APPLE INC")  # Trigger load
    stats = mapper.get_stats()
    print(
        f"  Loaded {stats['cusip_entries']} CUSIP entries, "
        f"{stats['name_entries']} name entries in {time.time() - t0:.1f}s"
    )

    # Process each investor
    results = []
    total_start = time.time()

    for i, key in enumerate(investor_keys, 1):
        print(f"\n[{i}/{len(investor_keys)}] Processing: {key}")
        try:
            result = process_investor(
                key,
                INVESTORS[key],
                fetcher,
                mapper,
                tracker,
                quarters_back=args.quarters,
            )
            results.append(result)
        except Exception as e:
            logger.error(f"Failed to process {key}: {e}", exc_info=True)
            results.append({
                "investor_key": key,
                "name": INVESTORS[key]["name"],
                "cik": INVESTORS[key]["cik"],
                "manager": INVESTORS[key]["manager"],
                "status": "ERROR",
                "error": str(e),
            })

    # Save results
    print(f"\n{'='*70}")
    print("Saving results...")
    summary_path = save_results(results, OUTPUT_DIR)
    total_elapsed = time.time() - total_start

    # Final summary
    ok_count = sum(1 for r in results if r["status"] == "OK")
    err_count = sum(1 for r in results if r["status"] != "OK")

    print(f"\n{'#'*70}")
    print(f"  Pipeline Complete")
    print(f"  Processed: {ok_count} OK, {err_count} errors")
    print(f"  Time: {total_elapsed:.1f}s")
    print(f"  Output: {OUTPUT_DIR}")
    print(f"  Summary: {summary_path}")
    print(f"{'#'*70}\n")


if __name__ == "__main__":
    main()
