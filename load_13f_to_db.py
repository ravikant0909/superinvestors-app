#!/usr/bin/env python3
"""
Load 13F holdings data from JSON output files into the SuperInvestors SQLite database.

Reads each data/output/*_13f_*.json file and populates:
- investors (CIK updates)
- securities
- filings_13f
- holdings (latest quarter only)
- holdings_history (all quarters)
- position_changes
"""

import json
import os
import sqlite3
import glob
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "superinvestors.db"
OUTPUT_DIR = BASE_DIR / "data" / "output"

# Manual mapping: investor_key from JSON -> investor slug in DB
# Built by matching CIK/firm_name/manager between JSON files and DB records
INVESTOR_KEY_TO_SLUG = {
    "berkshire_hathaway": "warren-buffett",
    "himalaya_capital": "li-lu",
    "pabrai_funds": "mohnish-pabrai",
    "baupost_group": "seth-klarman",
    "tci_fund": "chris-hohn",
    "saber_capital": "john-huber",
    "akre_capital": "chuck-akre",
    "appaloosa_management": "david-tepper",
    "pershing_square": "bill-ackman",
    "markel_gayner": "tom-gayner",
    "cas_investment": "cliff-sosin",
    "oakcliff_capital": "bryan-lawrence",
    "giverny_capital": "francois-rochon",
    "fundsmith": "terry-smith",
    "semper_augustus": "christopher-bloomstran",
    "dorsey_asset": "pat-dorsey",
    "gardner_russo": "thomas-russo",
    "chou_associates": "francis-chou",
    "harris_associates": "bill-nygren",
    "davis_advisors": "chris-davis",
    "ruane_cunniff": "robert-goldfarb",
    "century_management": "arnold-van-den-berg",
    "horizon_kinetics": "murray-stahl",
    "lone_pine": "stephen-mandel",
    "fairfax_financial": "prem-watsa",
    "atreides_management": "gavin-baker",
    "coatue_management": "philippe-laffont",
    "punch_card": "guy-spier",
}


def parse_quarter(quarter_str):
    """Parse '2025-Q4' into (2025, 4)."""
    m = re.match(r"(\d{4})-Q(\d)", quarter_str)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def quarter_end_date(year, quarter):
    """Return quarter end date as YYYY-MM-DD."""
    ends = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}
    return f"{year}-{ends.get(quarter, '12-31')}"


def make_security_slug(name, ticker):
    """Create a URL-safe slug from company name."""
    base = name.lower()
    base = re.sub(r"[^a-z0-9\s-]", "", base)
    base = re.sub(r"\s+", "-", base.strip())
    base = re.sub(r"-+", "-", base)
    return base[:80] if base else ticker.lower() if ticker else "unknown"


def upsert_security(cur, cusip, name, ticker, put_call=None):
    """Insert or get existing security by CUSIP. Returns security_id."""
    if not cusip:
        return None

    cur.execute("SELECT id FROM securities WHERE cusip = ?", (cusip,))
    row = cur.fetchone()
    if row:
        # Update ticker if we have a real one now and old one was CUSIP-based
        if ticker and not ticker.startswith("0") and len(ticker) <= 6:
            cur.execute(
                "UPDATE securities SET ticker = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND (ticker IS NULL OR length(ticker) > 6)",
                (ticker, row[0]),
            )
        return row[0]

    # Determine if ticker is real or CUSIP-based placeholder
    real_ticker = ticker if (ticker and not re.match(r"^[0-9A-Z]{9}$", ticker) and len(ticker) <= 6) else None

    slug = make_security_slug(name, real_ticker or cusip)
    # Ensure unique slug by appending CUSIP suffix if needed
    base_slug = slug
    suffix = 0
    while True:
        cur.execute("SELECT id FROM securities WHERE slug = ?", (slug,))
        if not cur.fetchone():
            break
        suffix += 1
        slug = f"{base_slug}-{cusip[:6]}" if suffix == 1 else f"{base_slug}-{cusip[:6]}-{suffix}"

    cur.execute(
        """INSERT INTO securities (cusip, ticker, name, slug, security_type)
           VALUES (?, ?, ?, ?, 'common_stock')""",
        (cusip, real_ticker, name, slug),
    )
    return cur.lastrowid


def upsert_filing(cur, investor_id, filing_data):
    """Insert a 13F filing record. Returns filing_id."""
    accession = filing_data["accession_number"]

    cur.execute("SELECT id FROM filings_13f WHERE accession_number = ?", (accession,))
    row = cur.fetchone()
    if row:
        return row[0]

    report_date = filing_data.get("report_date", "")
    filing_date = filing_data.get("filing_date", "")

    # Parse year/quarter from report_date
    if report_date:
        year = int(report_date[:4])
        month = int(report_date[5:7])
        quarter = (month - 1) // 3 + 1
    else:
        year, quarter = 0, 0

    total_value = filing_data.get("total_value_thousands", 0)
    holdings_count = filing_data.get("holdings_count", 0)

    try:
        cur.execute(
            """INSERT INTO filings_13f (investor_id, accession_number, filing_date, report_date, quarter, year, total_value, position_count, processed)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (investor_id, accession, filing_date, report_date, quarter, year, total_value, holdings_count),
        )
        return cur.lastrowid
    except sqlite3.IntegrityError:
        # Duplicate investor+quarter, get existing
        cur.execute("SELECT id FROM filings_13f WHERE accession_number = ?", (accession,))
        row = cur.fetchone()
        return row[0] if row else None


def load_investor_file(cur, filepath):
    """Load a single investor's 13F data from JSON."""
    with open(filepath) as f:
        data = json.load(f)

    investor_key = data.get("investor_key", "")
    cik = data.get("cik", "")
    name = data.get("name", "")

    # Map to DB investor
    slug = INVESTOR_KEY_TO_SLUG.get(investor_key)
    if not slug:
        print(f"  SKIP: No slug mapping for investor_key={investor_key}")
        return

    cur.execute("SELECT id FROM investors WHERE slug = ?", (slug,))
    row = cur.fetchone()
    if not row:
        print(f"  SKIP: Investor slug '{slug}' not found in DB")
        return
    investor_id = row[0]

    # Update CIK on investor record
    if cik:
        cik_padded = cik.lstrip("0")
        cik_formatted = f"0{cik}" if not cik.startswith("0") else cik
        cur.execute(
            "UPDATE investors SET cik = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND (cik IS NULL OR cik = '')",
            (cik, investor_id),
        )

    filings = data.get("filings", [])
    if not filings:
        print(f"  SKIP: No filings for {investor_key}")
        return

    # Sort filings by report_date to process oldest first
    filings_sorted = sorted(filings, key=lambda f: f.get("report_date", ""))

    latest_report_date = filings_sorted[-1].get("report_date", "") if filings_sorted else ""

    # Track previous quarter holdings for change computation
    prev_holdings = {}  # cusip -> {shares, value, pct}

    for filing_idx, filing in enumerate(filings_sorted):
        filing_id = upsert_filing(cur, investor_id, filing)
        if not filing_id:
            continue

        report_date = filing.get("report_date", "")
        filing_date = filing.get("filing_date", "")
        total_value = filing.get("total_value_thousands", 0)
        holdings_list = filing.get("holdings", [])

        year = int(report_date[:4]) if report_date else 0
        month = int(report_date[5:7]) if report_date else 0
        quarter = (month - 1) // 3 + 1 if month else 0

        is_latest = (report_date == latest_report_date)

        # Track current quarter holdings for change computation
        current_holdings = {}

        for rank, holding in enumerate(holdings_list, 1):
            cusip = holding.get("cusip", "")
            h_name = holding.get("name_of_issuer", holding.get("name", "Unknown"))
            h_ticker = holding.get("ticker", "")
            h_value = holding.get("value", holding.get("value_thousands", 0))
            h_shares = holding.get("shares", 0)
            put_call = holding.get("put_call")
            investment_discretion = holding.get("investment_discretion", "SOLE")

            # Normalize put_call
            if put_call:
                put_call = put_call.upper()
                if put_call not in ("PUT", "CALL"):
                    put_call = None

            security_id = upsert_security(cur, cusip, h_name, h_ticker, put_call)
            if not security_id:
                continue

            # Calculate pct_of_portfolio
            pct = 0.0
            if total_value and total_value > 0:
                pct = round((h_value / total_value) * 100, 4)

            # Aggregate by cusip+put_call for change tracking
            change_key = (cusip, put_call)
            if change_key in current_holdings:
                current_holdings[change_key]["shares"] += h_shares
                current_holdings[change_key]["value"] += h_value
                current_holdings[change_key]["pct"] += pct
            else:
                current_holdings[change_key] = {
                    "shares": h_shares,
                    "value": h_value,
                    "pct": pct,
                    "security_id": security_id,
                }

            # Insert into holdings_history
            try:
                cur.execute(
                    """INSERT OR REPLACE INTO holdings_history
                       (investor_id, security_id, filing_id, year, quarter, report_date, filing_date,
                        shares, value, pct_of_portfolio, put_call, investment_discretion, position_rank)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (investor_id, security_id, filing_id, year, quarter, report_date, filing_date,
                     h_shares, h_value, pct, put_call, investment_discretion, rank),
                )
            except sqlite3.IntegrityError:
                pass  # Duplicate, skip

            # Insert into holdings (latest quarter only)
            if is_latest:
                try:
                    cur.execute(
                        """INSERT OR REPLACE INTO holdings
                           (investor_id, security_id, filing_id, shares, value, pct_of_portfolio,
                            put_call, investment_discretion, position_rank, report_date, filing_date)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (investor_id, security_id, filing_id, h_shares, h_value, pct,
                         put_call, investment_discretion, rank, report_date, filing_date),
                    )
                except sqlite3.IntegrityError:
                    pass

        # Compute position changes between this quarter and previous
        if prev_holdings:
            all_keys = set(prev_holdings.keys()) | set(current_holdings.keys())
            for key in all_keys:
                cusip_k, pc_k = key
                prev = prev_holdings.get(key, {"shares": 0, "value": 0, "pct": 0, "security_id": None})
                curr = current_holdings.get(key, {"shares": 0, "value": 0, "pct": 0, "security_id": None})

                sec_id = curr.get("security_id") or prev.get("security_id")
                if not sec_id:
                    continue

                shares_before = prev["shares"]
                shares_after = curr["shares"]
                shares_change = shares_after - shares_before

                if shares_change == 0:
                    continue  # Unchanged, skip

                value_before = prev["value"]
                value_after = curr["value"]
                value_change = value_after - value_before

                pct_before = prev["pct"]
                pct_after = curr["pct"]

                if shares_before == 0 and shares_after > 0:
                    change_type = "new"
                elif shares_before > 0 and shares_after == 0:
                    change_type = "sold_out"
                elif shares_change > 0:
                    change_type = "increased"
                else:
                    change_type = "decreased"

                shares_change_pct = None
                if shares_before > 0:
                    shares_change_pct = round((shares_change / shares_before) * 100, 2)

                try:
                    cur.execute(
                        """INSERT OR REPLACE INTO position_changes
                           (investor_id, security_id, filing_id, year, quarter, report_date,
                            change_type, shares_before, shares_after, shares_change, shares_change_pct,
                            value_before, value_after, value_change,
                            pct_of_portfolio_before, pct_of_portfolio_after)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (investor_id, sec_id, filing_id, year, quarter, report_date,
                         change_type, shares_before, shares_after, shares_change, shares_change_pct,
                         value_before, value_after, value_change,
                         pct_before, pct_after),
                    )
                except sqlite3.IntegrityError:
                    pass

        prev_holdings = current_holdings

    # Also load changes from the JSON "changes" field for the latest filing
    # (These may have better data than our computed ones since they may span non-adjacent quarters)
    changes_data = data.get("changes", {})
    if isinstance(changes_data, dict):
        change_list = changes_data.get("changes", [])
        if change_list and filings_sorted:
            latest_filing = filings_sorted[-1]
            latest_filing_id = None
            cur.execute("SELECT id FROM filings_13f WHERE accession_number = ?",
                        (latest_filing["accession_number"],))
            r = cur.fetchone()
            if r:
                latest_filing_id = r[0]

            lr = latest_filing.get("report_date", "")
            ly = int(lr[:4]) if lr else 0
            lm = int(lr[5:7]) if lr else 0
            lq = (lm - 1) // 3 + 1 if lm else 0

            for change in change_list:
                cusip = change.get("cusip", "")
                ch_name = change.get("name_of_issuer", "")
                ch_ticker = change.get("ticker", "")
                ch_type = change.get("change_type", "").lower()

                if ch_type not in ("new", "increased", "decreased", "sold_out"):
                    continue

                security_id = upsert_security(cur, cusip, ch_name, ch_ticker)
                if not security_id:
                    continue

                shares_before = change.get("previous_shares", 0)
                shares_after = change.get("current_shares", 0)
                shares_change = change.get("share_delta", shares_after - shares_before)
                shares_change_pct = change.get("share_change_pct")
                value_before = change.get("previous_value", 0)
                value_after = change.get("current_value", 0)
                value_change = change.get("value_delta", value_after - value_before)

                try:
                    cur.execute(
                        """INSERT OR REPLACE INTO position_changes
                           (investor_id, security_id, filing_id, year, quarter, report_date,
                            change_type, shares_before, shares_after, shares_change, shares_change_pct,
                            value_before, value_after, value_change)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (investor_id, security_id, latest_filing_id, ly, lq, lr,
                         ch_type, shares_before, shares_after, shares_change, shares_change_pct,
                         value_before, value_after, value_change),
                    )
                except sqlite3.IntegrityError:
                    pass

    print(f"  Loaded {investor_key} -> {slug} (investor_id={investor_id})")


def generate_conviction_index(cur):
    """Generate conviction_data/index.json for positions >= 10% of portfolio."""
    cur.execute("""
        SELECT
            h.pct_of_portfolio as weight,
            h.value,
            h.shares,
            sec.ticker, sec.name as company_name, sec.cusip,
            i.name as investor_name, i.slug as investor_slug
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        JOIN investors i ON h.investor_id = i.id
        WHERE h.pct_of_portfolio >= 10.0
        ORDER BY h.pct_of_portfolio DESC
    """)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]

    conviction_bets = []
    for row in rows:
        r = dict(zip(cols, row))
        conviction_bets.append({
            "investor_name": r["investor_name"],
            "investor_slug": r["investor_slug"],
            "ticker": r["ticker"] or r["cusip"],
            "company_name": r["company_name"],
            "weight_pct": round(r["weight"], 2),
            "value_thousands": r["value"],
        })

    output_dir = BASE_DIR / "conviction_data"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / "index.json"

    with open(output_path, "w") as f:
        json.dump({
            "generated_at": __import__("datetime").datetime.now().isoformat(),
            "total_conviction_bets": len(conviction_bets),
            "threshold_pct": 10.0,
            "bets": conviction_bets,
        }, f, indent=2)

    print(f"\nConviction index: {len(conviction_bets)} positions >= 10% written to {output_path}")


def main():
    print(f"Database: {DB_PATH}")
    print(f"Output dir: {OUTPUT_DIR}")

    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        sys.exit(1)

    json_files = sorted(glob.glob(str(OUTPUT_DIR / "*_13f_*.json")))
    # Exclude summary file
    json_files = [f for f in json_files if "summary_13f" not in os.path.basename(f)]

    print(f"Found {len(json_files)} investor JSON files\n")

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    # Clear existing data (fresh load)
    print("Clearing existing data...")
    cur.execute("DELETE FROM position_changes")
    cur.execute("DELETE FROM holdings_history")
    cur.execute("DELETE FROM holdings")
    cur.execute("DELETE FROM filings_13f")
    cur.execute("DELETE FROM securities")
    conn.commit()

    for filepath in json_files:
        basename = os.path.basename(filepath)
        print(f"\nProcessing: {basename}")
        try:
            load_investor_file(cur, filepath)
            conn.commit()
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            conn.rollback()

    # Generate conviction index
    print("\n--- Generating conviction_data/index.json ---")
    generate_conviction_index(cur)
    conn.commit()

    # Print summary stats
    print("\n=== LOAD SUMMARY ===")
    for table in ["securities", "filings_13f", "holdings", "holdings_history", "position_changes"]:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        count = cur.fetchone()[0]
        print(f"  {table}: {count} rows")

    # Top 10 holdings by pct_of_portfolio
    print("\n=== TOP 10 HOLDINGS BY PCT OF PORTFOLIO ===")
    cur.execute("""
        SELECT i.name, sec.ticker, sec.name, h.pct_of_portfolio, h.value
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        JOIN investors i ON h.investor_id = i.id
        ORDER BY h.pct_of_portfolio DESC
        LIMIT 10
    """)
    for row in cur.fetchall():
        inv, ticker, sec_name, pct, val = row
        ticker_display = ticker or "N/A"
        print(f"  {inv}: {ticker_display} ({sec_name}) - {pct:.2f}% - ${val:,.0f}K")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
