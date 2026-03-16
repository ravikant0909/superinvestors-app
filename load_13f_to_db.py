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
CUSIP_MAP_PATH = BASE_DIR / "data" / "cusip_ticker_map.json"

# Manual mapping: investor_key from JSON -> investor slug in DB
# Built by matching CIK/firm_name/manager between JSON files and DB records
INVESTOR_KEY_TO_SLUG = {
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
}

_CUSIP_TO_TICKER = None


def load_cusip_ticker_map():
    """Load the cached CUSIP -> ticker map once."""
    global _CUSIP_TO_TICKER
    if _CUSIP_TO_TICKER is not None:
        return _CUSIP_TO_TICKER

    try:
        with open(CUSIP_MAP_PATH) as f:
            data = json.load(f)
        _CUSIP_TO_TICKER = data.get("cusip_to_ticker", {})
    except Exception:
        _CUSIP_TO_TICKER = {}

    return _CUSIP_TO_TICKER


def normalize_ticker(cusip, ticker):
    """Prefer the cached CUSIP map over whatever stale ticker was embedded in the JSON."""
    mapped = load_cusip_ticker_map().get(cusip or "")
    return (mapped or ticker or "").strip().upper()


def normalize_holdings_list(holdings_list):
    """Aggregate duplicate holdings by CUSIP before loading them into the DB."""
    aggregated = {}

    for holding in holdings_list:
        cusip = holding.get("cusip", "")
        key = (cusip, holding.get("put_call"))
        normalized = aggregated.get(key)

        name = holding.get("name_of_issuer", holding.get("name", "Unknown"))
        ticker = normalize_ticker(cusip, holding.get("ticker", ""))
        value = holding.get("value", holding.get("value_thousands", 0)) or 0
        shares = holding.get("shares", 0) or 0

        if normalized:
            normalized["value"] += value
            normalized["shares"] += shares
            if ticker:
                normalized["ticker"] = ticker
            if not normalized["name_of_issuer"] and name:
                normalized["name_of_issuer"] = name
            continue

        aggregated[key] = {
            "ticker": ticker,
            "name_of_issuer": name,
            "cusip": cusip,
            "value": value,
            "shares": shares,
            "put_call": holding.get("put_call"),
            "investment_discretion": holding.get("investment_discretion", "SOLE"),
        }

    return sorted(
        aggregated.values(),
        key=lambda item: item.get("value", 0),
        reverse=True,
    )


def clear_stale_cik_assignments(cur):
    """Undo the two known bad slug mappings from earlier DB loads."""
    cur.execute(
        "UPDATE investors SET cik = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE slug = 'guy-spier' AND cik = '1631664'"
    )
    cur.execute(
        "UPDATE investors SET cik = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE slug = 'robert-goldfarb' AND cik = '1720792'"
    )


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
        cur.execute("SELECT slug FROM investors WHERE cik = ? AND id != ?", (cik, investor_id))
        conflict = cur.fetchone()
        if conflict:
            print(f"  WARN: CIK {cik} already assigned to {conflict[0]}; skipping investor CIK update")
        else:
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
        year = int(report_date[:4]) if report_date else 0
        month = int(report_date[5:7]) if report_date else 0
        quarter = (month - 1) // 3 + 1 if month else 0

        is_latest = (report_date == latest_report_date)

        holdings_list = filing.get("holdings", [])
        if is_latest and not holdings_list and data.get("top_holdings"):
            holdings_list = data.get("top_holdings", [])
        holdings_list = normalize_holdings_list(holdings_list)

        # Track current quarter holdings for change computation
        current_holdings = {}

        for rank, holding in enumerate(holdings_list, 1):
            cusip = holding.get("cusip", "")
            h_name = holding.get("name_of_issuer", holding.get("name", "Unknown"))
            h_ticker = normalize_ticker(cusip, holding.get("ticker", ""))
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
                ch_ticker = normalize_ticker(cusip, change.get("ticker", ""))
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


def generate_conviction_index(_cur=None):
    """Generate conviction indexes plus fetchable static assets for runtime page loading."""
    output_dir = BASE_DIR / "conviction_data"
    output_dir.mkdir(exist_ok=True)
    public_conviction_dir = BASE_DIR / "public" / "conviction-data"
    public_conviction_detail_dir = public_conviction_dir / "details"
    public_runtime_dir = BASE_DIR / "public" / "runtime-data"
    public_conviction_detail_dir.mkdir(parents=True, exist_ok=True)
    public_runtime_dir.mkdir(parents=True, exist_ok=True)

    for stale_file in public_conviction_detail_dir.glob("*.json"):
        stale_file.unlink()

    conviction_bets = []
    slug_to_key = {slug: key for key, slug in INVESTOR_KEY_TO_SLUG.items()}
    for filepath in sorted(output_dir.glob("*.json")):
        if filepath.name == "index.json":
            continue

        try:
            with open(filepath) as f:
                raw = json.load(f)
        except Exception:
            continue

        investor = raw.get("investor", {}) or {}
        position = raw.get("position", {}) or {}
        thesis = raw.get("thesis", {}) or {}

        investor_slug = raw.get("investor_slug") or investor.get("slug")
        investor_name = raw.get("investor_name") or investor.get("name")
        firm_name = raw.get("firm_name") or investor.get("firm")
        ticker = raw.get("ticker") or position.get("ticker")
        company_name = raw.get("company_name") or position.get("company")
        weight_pct = raw.get("weight_pct")
        if weight_pct is None:
            weight_pct = position.get("pct_of_portfolio")

        value_thousands = raw.get("value_thousands")
        if not isinstance(value_thousands, (int, float)):
                value_millions = raw.get("value_millions")
                if isinstance(value_millions, (int, float)):
                    value_thousands = round(value_millions * 1000)
                else:
                    market_value = position.get("market_value")
                    value_thousands = round(market_value / 1000) if isinstance(market_value, (int, float)) else 0
                    value_millions = round((value_thousands or 0) / 1000, 3)
        else:
            value_millions = round((value_thousands or 0) / 1000, 3)

        if not investor_slug or not ticker:
            continue

        thesis_headline = raw.get("thesis_headline") or thesis.get("title")
        if not thesis_headline:
            thesis_headline = f"{investor_name or 'Unknown'} on {company_name or ticker}"

        page_slug = f"{investor_slug}-{ticker}"
        detail_path = f"/conviction-data/details/{page_slug}.json"

        public_payload = dict(raw)
        public_payload["slug"] = page_slug
        public_payload["investor_key"] = slug_to_key.get(investor_slug)
        public_payload["detail_path"] = detail_path

        with open(public_conviction_detail_dir / f"{page_slug}.json", "w") as f:
            json.dump(public_payload, f, indent=2)

        conviction_bets.append({
            "investor_name": investor_name or "Unknown",
            "investor_slug": investor_slug,
            "investor_key": slug_to_key.get(investor_slug),
            "firm_name": firm_name or "",
            "ticker": ticker,
            "company_name": company_name or ticker,
            "weight_pct": round(weight_pct, 2) if isinstance(weight_pct, (int, float)) else None,
            "value_thousands": int(value_thousands or 0),
            "value_millions": round(value_millions or 0, 3),
            "thesis_headline": thesis_headline,
            "slug": page_slug,
            "detail_path": detail_path,
        })

    conviction_bets.sort(
        key=lambda item: (
            -(item["weight_pct"] or 0),
            item["investor_slug"],
            item["ticker"],
        )
    )
    payload = {
        "generated_at": __import__("datetime").datetime.now().isoformat(),
        "total_conviction_bets": len(conviction_bets),
        "threshold_pct": None,
        "source": "published_conviction_detail_files",
        "bets": conviction_bets,
    }

    output_path = output_dir / "index.json"
    with open(output_path, "w") as f:
        json.dump(payload, f, indent=2)

    public_index_path = public_conviction_dir / "index.json"
    with open(public_index_path, "w") as f:
        json.dump(payload, f, indent=2)

    runtime_asset_sources = {
        BASE_DIR / "data" / "output" / "prices.json": public_runtime_dir / "prices.json",
        BASE_DIR / "data" / "investors" / "portfolio_adjustments.json": public_runtime_dir / "portfolio-adjustments.json",
    }
    for source_path, target_path in runtime_asset_sources.items():
        if not source_path.exists():
            continue
        try:
            with open(source_path) as f:
                runtime_payload = json.load(f)
            with open(target_path, "w") as f:
                json.dump(runtime_payload, f, indent=2)
        except Exception:
            continue

    print(f"\nConviction index: {len(conviction_bets)} published analyses written to {output_path}")
    print(f"Static conviction assets: {public_index_path} + {len(conviction_bets)} detail files")


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

    clear_stale_cik_assignments(cur)
    conn.commit()

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
