#!/usr/bin/env python3
"""
Sync the local superinvestors.db 13F data into the remote Cloudflare D1 database.

This is the previously-missing checked-in local->remote sync. It refreshes only
the 13F DATA tables and deliberately leaves runtime tables (price_cache,
chat_logs) on the remote untouched.

Safety:
  - Dry-run by default: generates chunked SQL under /tmp and prints the plan.
    Nothing touches production unless you pass --execute.
  - With --execute it FIRST exports a timestamped remote backup, then imports.
  - Large tables are chunked to stay within D1's per-file import limits, and
    proxy env vars are unset for the remote calls (see CLAUDE.md proxy note).

Usage:
  python3 data/seed_db.py && python3 data/load_13f_to_db.py   # rebuild local first
  python3 data/sync_d1_remote.py                # dry-run: generate SQL + plan
  python3 data/sync_d1_remote.py --execute      # backup remote, then import

Prereqs: `source ~/.cloudflare_token` and wrangler on PATH (node v24.12.0).
"""

import os
import subprocess
import sys
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "superinvestors.db")
OUT_DIR = "/tmp/superinvestors-d1-sync"
DB_NAME = "superinvestors"

# Only these tables are refreshed from local. Runtime tables (price_cache,
# chat_logs) are intentionally excluded so live caches/logs survive.
DATA_TABLES = [
    "investors",
    "investor_scores",
    "securities",
    "filings_13f",
    "holdings",
    "holdings_history",
    "position_changes",
]

ROWS_PER_INSERT = 100      # rows per INSERT statement
ROWS_PER_FILE = 5000       # rows per chunk file (keeps each import under D1 limits)


def sql_value(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    s = str(v).replace("'", "''")
    return "'" + s + "'"


def generate():
    import sqlite3
    if not os.path.exists(DB_PATH):
        print(f"ERROR: {DB_PATH} not found. Rebuild it first (seed_db.py + load_13f_to_db.py).")
        sys.exit(1)
    os.makedirs(OUT_DIR, exist_ok=True)
    # clear old chunks
    for f in os.listdir(OUT_DIR):
        if f.endswith(".sql"):
            os.remove(os.path.join(OUT_DIR, f))

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    chunk_files = []
    seq = 0
    for table in DATA_TABLES:
        cur = conn.execute(f"SELECT * FROM {table}")
        cols = [d[0] for d in cur.description]
        collist = ", ".join(cols)
        rows = cur.fetchall()
        total = len(rows)
        idx = 0
        files_for_table = 0
        first_file_for_table = True
        while idx < total:
            seq += 1
            files_for_table += 1
            path = os.path.join(OUT_DIR, f"{seq:03d}_{table}.sql")
            with open(path, "w") as fh:
                if first_file_for_table:
                    fh.write(f"DELETE FROM {table};\n")
                    first_file_for_table = False
                end = min(idx + ROWS_PER_FILE, total)
                batch = rows[idx:end]
                for b in range(0, len(batch), ROWS_PER_INSERT):
                    group = batch[b:b + ROWS_PER_INSERT]
                    values = ",\n".join(
                        "(" + ", ".join(sql_value(r[c]) for c in cols) + ")" for r in group
                    )
                    fh.write(f"INSERT INTO {table} ({collist}) VALUES\n{values};\n")
                idx = end
            chunk_files.append((path, table))
        print(f"  {table}: {total} rows -> {files_for_table} file(s)")
    conn.close()
    return chunk_files


def run_remote(args, label):
    env = dict(os.environ)
    for var in ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY",
                "ALL_PROXY", "all_proxy", "no_proxy", "NO_PROXY"]:
        env.pop(var, None)
    print(f"  -> {label}")
    res = subprocess.run(args, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout[-2000:])
        print(res.stderr[-2000:])
        raise SystemExit(f"FAILED: {label}")


def main():
    execute = "--execute" in sys.argv
    print("Generating chunked SQL from local DB...")
    chunks = generate()
    print(f"\nGenerated {len(chunks)} chunk files in {OUT_DIR}")

    if not execute:
        print("\nDRY RUN. Review the SQL, then re-run with --execute to:")
        print("  1) export a timestamped remote backup")
        print(f"  2) DELETE + reload {len(DATA_TABLES)} tables on remote D1 '{DB_NAME}'")
        print("     (price_cache and chat_logs are left untouched)")
        return

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = f"/tmp/{DB_NAME}-remote-backup-{ts}.sql"
    print(f"\n[1/2] Backing up remote D1 -> {backup}")
    run_remote(["wrangler", "d1", "export", DB_NAME, "--remote", "--output", backup],
               "export remote backup")

    print(f"\n[2/2] Importing {len(chunks)} chunks into remote D1...")
    for path, table in chunks:
        run_remote(["wrangler", "d1", "execute", DB_NAME, "--remote", "--file", path,
                    "--yes"], f"import {os.path.basename(path)}")
    print("\nDone. Remote D1 refreshed from local DB.")


if __name__ == "__main__":
    main()
