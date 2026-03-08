#!/usr/bin/env python3
"""
Seed the SuperInvestors SQLite database with investor data.

Reads:
  - Schema from schema.sql (repo root)
  - Investor data from data/investors/all_investors_ranked.json

Writes:
  - SQLite database at superinvestors.db (repo root)

Usage:
  python seed_db.py
"""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

# ----- Paths -----
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(PROJECT_ROOT, "schema.sql")
DB_PATH = os.path.join(PROJECT_ROOT, "superinvestors.db")
INVESTORS_JSON = os.path.join(
    PROJECT_ROOT,
    "data",
    "investors",
    "all_investors_ranked.json",
)


def make_slug(name: str) -> str:
    """
    Generate a URL-safe slug from an investor name.

    Examples:
        "Warren Buffett"                 -> "warren-buffett"
        "Ian Cumming & Joe Steinberg"    -> "ian-cumming-joe-steinberg"
        "Loews Corporation (Tisch family)" -> "loews-corporation-tisch-family"
        "Harris Kupperman (Kuppy)"       -> "harris-kupperman-kuppy"
    """
    slug = name.lower()
    # Replace & with nothing (join the names)
    slug = slug.replace("&", "")
    # Replace any non-alphanumeric character (except spaces and hyphens) with space
    slug = re.sub(r"[^a-z0-9\s-]", " ", slug)
    # Collapse whitespace and strip
    slug = re.sub(r"\s+", " ", slug).strip()
    # Replace spaces with hyphens
    slug = slug.replace(" ", "-")
    # Collapse multiple hyphens
    slug = re.sub(r"-+", "-", slug)
    return slug


def map_verdict(verdict_str: str) -> str:
    """
    Map JSON verdict (FOLLOW/WATCH/SKIP) to database verdict_follow column value
    (strong_follow/follow/monitor/ignore).

    Mapping:
        FOLLOW -> follow
        WATCH  -> monitor
        SKIP   -> ignore
    """
    mapping = {
        "FOLLOW": "follow",
        "WATCH": "monitor",
        "SKIP": "ignore",
    }
    return mapping.get(verdict_str, "monitor")


def map_style(philosophy: str, portfolio_style: str) -> str:
    """
    Derive a short style label from the investor's philosophy and portfolio description.
    Returns a concise style string for the investors.style column.
    """
    combined = (philosophy + " " + portfolio_style).lower()

    if "deep value" in combined and "activist" in combined:
        return "Deep Value / Activist"
    if "activist" in combined:
        return "Activist"
    if "quant" in combined or "quantitative" in combined or "algorithmic" in combined:
        return "Quantitative"
    if "macro" in combined or "global macro" in combined:
        return "Global Macro"
    if "special situation" in combined:
        return "Special Situations"
    if "deep value" in combined:
        return "Deep Value"
    if "distressed" in combined:
        return "Distressed / Deep Value"
    if "growth" in combined and "value" in combined:
        return "Growth at a Reasonable Price"
    if "quality" in combined and "compound" in combined:
        return "Quality Compounding"
    if "quality" in combined:
        return "Quality Value"
    if "concentrated" in combined and "value" in combined:
        return "Concentrated Value"
    if "event" in combined or "event-driven" in combined:
        return "Event-Driven"
    if "contrarian" in combined:
        return "Contrarian Value"
    if "growth" in combined:
        return "Growth"
    if "value" in combined:
        return "Value"
    return "Value"


def estimate_aum_range(portfolio_style: str, track_record: str) -> str:
    """
    Estimate AUM range from textual descriptions.
    Returns a human-readable range string.
    """
    combined = (portfolio_style + " " + track_record).lower()

    # Look for explicit dollar amounts
    # Match patterns like "$53.6 billion", "$500M", "$20B-$30B" etc.
    billions_match = re.search(r"\$(\d+(?:\.\d+)?)\s*(?:billion|b\b)", combined)
    millions_match = re.search(r"\$(\d+(?:\.\d+)?)\s*(?:million|m\b)", combined)

    if billions_match:
        val = float(billions_match.group(1))
        if val >= 200:
            return "$200B+"
        if val >= 50:
            return "$50B-$200B"
        if val >= 20:
            return "$20B-$50B"
        if val >= 10:
            return "$10B-$20B"
        if val >= 5:
            return "$5B-$10B"
        if val >= 1:
            return "$1B-$5B"
        return "$500M-$1B"

    if millions_match:
        val = float(millions_match.group(1))
        if val >= 500:
            return "$500M-$1B"
        if val >= 100:
            return "$100M-$500M"
        return "Under $100M"

    return None


def create_database(conn: sqlite3.Connection) -> None:
    """Execute the schema SQL to create all tables and indices."""
    print(f"Reading schema from: {SCHEMA_PATH}")

    with open(SCHEMA_PATH, "r") as f:
        schema_sql = f.read()

    # Extract only DDL statements (PRAGMA, CREATE TABLE, CREATE INDEX).
    # Skip all INSERT statements (seed data) since we'll insert our own data.
    # We use regex to find complete statements rather than naive semicolon splitting,
    # because CREATE TABLE bodies contain parentheses within CHECK constraints
    # that confuse simple semicolon splitting.
    ddl_lines = []
    # Extract PRAGMAs
    for m in re.finditer(r'(PRAGMA\s+[^;]+;)', schema_sql, re.IGNORECASE):
        ddl_lines.append(m.group(1))

    # Extract CREATE TABLE statements (they end with ");" on their own line)
    for m in re.finditer(
        r'(CREATE\s+TABLE\s+\w+\s*\(.*?\)\s*;)',
        schema_sql,
        re.DOTALL | re.IGNORECASE,
    ):
        ddl_lines.append(m.group(1))

    # Extract CREATE [UNIQUE] INDEX statements
    for m in re.finditer(
        r'(CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^;]+;)',
        schema_sql,
        re.IGNORECASE,
    ):
        ddl_lines.append(m.group(1))

    ddl_sql = "\n".join(ddl_lines)

    # executescript runs everything in a single transaction and handles
    # complex statements correctly.
    conn.executescript(ddl_sql)

    # Count what was created
    tables = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"
    ).fetchone()[0]
    indices = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='index'"
    ).fetchone()[0]

    print(f"  Created {tables} tables and {indices} indices.")


def seed_investors(conn: sqlite3.Connection) -> None:
    """Load investor JSON and insert into investors + investor_scores tables."""
    print(f"\nReading investor data from: {INVESTORS_JSON}")

    with open(INVESTORS_JSON, "r") as f:
        investors = json.load(f)

    print(f"  Found {len(investors)} investors to seed.\n")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    inserted = 0
    skipped = 0
    verdicts = {"FOLLOW": 0, "WATCH": 0, "SKIP": 0}

    for i, inv in enumerate(investors, 1):
        name = inv["name"]
        slug = make_slug(name)
        firm = inv.get("firm", "")
        verdict = inv.get("verdict", "WATCH")
        scores = inv.get("scores", {})

        # Check for duplicate slugs
        existing = conn.execute(
            "SELECT id FROM investors WHERE slug = ?", (slug,)
        ).fetchone()
        if existing:
            print(f"  [{i:3d}] SKIP (duplicate slug): {name} -> {slug}")
            skipped += 1
            continue

        # Build fields
        philosophy = inv.get("investment_philosophy", "")
        style = map_style(philosophy, inv.get("portfolio_style", ""))
        aum = estimate_aum_range(
            inv.get("portfolio_style", ""),
            inv.get("track_record", ""),
        )
        biography = inv.get("background", "")
        verdict_summary = inv.get("one_line_summary", "")
        verdict_follow = map_verdict(verdict)

        # Determine if active (retired/deceased -> inactive)
        background_lower = (biography + " " + inv.get("relevance_to_us", "")).lower()
        active = 1
        if any(
            kw in background_lower
            for kw in ["retired", "deceased", "passed away", "died", "collapsed", "wound down", "closed the fund"]
        ):
            active = 0

        # Notable quotes: extract from philosophy or use empty array
        notable_quotes = json.dumps([])

        # Insert into investors table
        conn.execute(
            """
            INSERT INTO investors (
                name, slug, firm_name, cik,
                photo_url, biography, philosophy, notable_quotes,
                style, aum_range, active,
                links_letters, links_interviews, links_other,
                verdict_summary, verdict_follow,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                slug,
                firm,
                None,  # CIK - to be filled later during 13F pipeline
                None,  # photo_url
                biography,
                philosophy,
                notable_quotes,
                style,
                aum,
                active,
                None,  # links_letters
                None,  # links_interviews
                None,  # links_other
                verdict_summary,
                verdict_follow,
                now,
                now,
            ),
        )

        investor_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Insert scores
        composite = scores.get("combined", 0)
        conn.execute(
            """
            INSERT INTO investor_scores (
                investor_id,
                philosophy_score, concentration_score, rationality_score,
                integrity_score, track_record_score, transparency_score,
                relevance_score, agi_awareness_score,
                score_notes, composite_score,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                investor_id,
                scores.get("philosophy_alignment"),
                scores.get("concentration"),
                scores.get("rationality"),
                scores.get("integrity"),
                scores.get("track_record"),
                scores.get("transparency"),
                scores.get("relevance"),
                scores.get("agi_awareness"),
                None,  # score_notes - could be filled later
                composite,
                now,
                now,
            ),
        )

        verdicts[verdict] = verdicts.get(verdict, 0) + 1
        inserted += 1

        # Progress indicator
        verdict_badge = {
            "FOLLOW": "\033[92mFOLLOW\033[0m",
            "WATCH": "\033[93mWATCH\033[0m",
            "SKIP": "\033[91mSKIP\033[0m",
        }.get(verdict, verdict)

        print(
            f"  [{i:3d}/{len(investors)}] {verdict_badge:>20s}  {composite:4.2f}  "
            f"{name:<40s} -> {slug}"
        )

    conn.commit()

    print(f"\n  Seeding complete.")
    print(f"  Inserted: {inserted} investors")
    if skipped:
        print(f"  Skipped:  {skipped} (duplicate slugs)")
    print(f"  Verdicts: {verdicts['FOLLOW']} FOLLOW, {verdicts['WATCH']} WATCH, {verdicts['SKIP']} SKIP")


def verify_database(conn: sqlite3.Connection) -> None:
    """Run verification queries and print summary."""
    print("\n" + "=" * 60)
    print("DATABASE VERIFICATION")
    print("=" * 60)

    # Investor count
    total = conn.execute("SELECT COUNT(*) FROM investors").fetchone()[0]
    print(f"\n  Total investors:  {total}")

    # By verdict
    for verdict in ["follow", "monitor", "ignore"]:
        label = {"follow": "FOLLOW", "monitor": "WATCH", "ignore": "SKIP"}.get(verdict, verdict)
        count = conn.execute(
            "SELECT COUNT(*) FROM investors WHERE verdict_follow = ?",
            (verdict,),
        ).fetchone()[0]
        print(f"    {label:>8s}: {count}")

    # Active vs inactive
    active = conn.execute(
        "SELECT COUNT(*) FROM investors WHERE active = 1"
    ).fetchone()[0]
    inactive = conn.execute(
        "SELECT COUNT(*) FROM investors WHERE active = 0"
    ).fetchone()[0]
    print(f"\n  Active:   {active}")
    print(f"  Inactive: {inactive}")

    # Score distribution
    avg_score = conn.execute(
        "SELECT AVG(composite_score) FROM investor_scores"
    ).fetchone()[0]
    max_score = conn.execute(
        "SELECT MAX(composite_score) FROM investor_scores"
    ).fetchone()[0]
    min_score = conn.execute(
        "SELECT MIN(composite_score) FROM investor_scores"
    ).fetchone()[0]
    print(f"\n  Composite scores:")
    print(f"    Average: {avg_score:.2f}")
    print(f"    Max:     {max_score:.2f}")
    print(f"    Min:     {min_score:.2f}")

    # Top 10 investors
    print(f"\n  Top 10 by composite score:")
    rows = conn.execute(
        """
        SELECT i.name, i.firm_name, i.verdict_follow, s.composite_score
        FROM investors i
        JOIN investor_scores s ON s.investor_id = i.id
        ORDER BY s.composite_score DESC
        LIMIT 10
        """
    ).fetchall()
    for rank, (name, firm, verdict, score) in enumerate(rows, 1):
        print(f"    {rank:2d}. {score:.2f}  {name:<30s}  ({firm})")

    # Count tables
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    print(f"\n  Tables in database: {len(tables)}")
    for (table_name,) in tables:
        count = conn.execute(f"SELECT COUNT(*) FROM [{table_name}]").fetchone()[0]
        if count > 0:
            print(f"    {table_name:<30s} {count:>6d} rows")

    print(f"\n  Database file: {DB_PATH}")
    size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f"  Database size: {size_mb:.2f} MB")


def main():
    # Remove existing database if present
    if os.path.exists(DB_PATH):
        print(f"Removing existing database: {DB_PATH}")
        os.remove(DB_PATH)

    print(f"Creating database: {DB_PATH}\n")

    conn = sqlite3.connect(DB_PATH)

    try:
        # Step 1: Create schema
        create_database(conn)

        # Step 2: Seed investors
        seed_investors(conn)

        # Step 3: Verify
        verify_database(conn)

        print("\nDone.")

    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
