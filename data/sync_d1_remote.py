#!/usr/bin/env python3
"""
Sync the local superinvestors.db 13F data into the remote Cloudflare D1 database.

This is the previously-missing checked-in local->remote sync. It refreshes only
the 13F DATA tables and deliberately leaves runtime tables (price_cache,
chat_logs) on the remote untouched.

D1 has a per-query CPU limit, so we CANNOT `DELETE FROM table` on the big tables
(a full delete of holdings_history / position_changes, or the cascade from
`DELETE FROM investors`, exceeds the limit and is rolled back). Instead we:
  - wipe each table in CHILD->PARENT order in 50k-row batches (no cascade fires
    because children are emptied first; deleting the 149-row parents is then cheap),
  - then re-insert in PARENT->CHILD order in chunked INSERT files.

Safety:
  - Dry-run by default: generates chunked SQL under /tmp and prints the plan.
  - With --execute it FIRST exports a timestamped remote backup (unless
    --skip-backup), then wipes + reloads. D1 rolls back any single file that fails.

Usage:
  python3 data/seed_db.py && python3 data/load_13f_to_db.py   # rebuild local first
  python3 data/sync_d1_remote.py                 # dry-run: generate SQL + plan
  python3 data/sync_d1_remote.py --execute       # backup remote, then wipe+reload
  python3 data/sync_d1_remote.py --execute --skip-backup

Prereqs: `source ~/.cloudflare_token` and wrangler on PATH (node v24.12.0).
In this environment wrangler reaches Cloudflare THROUGH the proxy, so we keep the
proxy env vars (chunks are small enough not to hit the large-import proxy issue).
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "superinvestors.db")
OUT_DIR = "/tmp/superinvestors-d1-sync"
DB_NAME = "superinvestors"

# Insert order: PARENT -> CHILD (FK-safe).
DATA_TABLES = [
    "investors",
    "investor_scores",
    "securities",
    "filings_13f",
    "holdings",
    "holdings_history",
    "position_changes",
]
# Wipe order: CHILD -> PARENT, so no FK cascade fires and parent deletes are cheap.
WIPE_ORDER = [
    "position_changes",
    "holdings_history",
    "holdings",
    "filings_13f",
    "investor_scores",
    "investors",
    "securities",
]

ROWS_PER_INSERT = 100      # max rows per INSERT statement (also bounded by bytes)
ROWS_PER_FILE = 5000       # rows per chunk file (keeps each import under D1 limits)
DELETE_BATCH = 50000       # rows per delete batch (verified well under D1 CPU limit)
MAX_STMT_BYTES = 50000     # cap each INSERT statement (D1 errors SQLITE_TOOBIG on huge
                           # statements; investors has long biography/philosophy text)


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
        # Pre-render each row's VALUES tuple once.
        rendered = ["(" + ", ".join(sql_value(r[c]) for c in cols) + ")" for r in rows]
        idx = 0
        files_for_table = 0
        prefix = f"INSERT INTO {table} ({collist}) VALUES\n"
        while idx < total:
            seq += 1
            files_for_table += 1
            path = os.path.join(OUT_DIR, f"{seq:03d}_{table}.sql")
            with open(path, "w") as fh:
                rows_in_file = 0
                while idx < total and rows_in_file < ROWS_PER_FILE:
                    group, stmt_bytes = [], 0
                    # Accumulate rows into one INSERT, bounded by count AND bytes.
                    while (idx < total and rows_in_file < ROWS_PER_FILE
                           and len(group) < ROWS_PER_INSERT):
                        v = rendered[idx]
                        if group and stmt_bytes + len(v) > MAX_STMT_BYTES:
                            break
                        group.append(v)
                        stmt_bytes += len(v) + 2
                        idx += 1
                        rows_in_file += 1
                    fh.write(prefix + ",\n".join(group) + ";\n")
            chunk_files.append((path, table))
        print(f"  {table}: {total} rows -> {files_for_table} file(s)")
    conn.close()
    return chunk_files


def _wrangler(args):
    env = dict(os.environ)  # keep proxy: wrangler reaches Cloudflare through it here
    return subprocess.run(["wrangler", *args], env=env, capture_output=True, text=True)


def remote_query_scalar(sql):
    res = _wrangler(["d1", "execute", DB_NAME, "--remote", "--json", "--command", sql])
    if res.returncode != 0:
        print(res.stdout[-1500:]); print(res.stderr[-1500:])
        raise SystemExit(f"FAILED query: {sql}")
    out = res.stdout
    start = out.find("[")
    data = json.loads(out[start:out.rfind("]") + 1])
    results = data[0]["results"]
    return list(results[0].values())[0] if results else 0


def remote_exec(sql_or_file, is_file, label):
    flag = "--file" if is_file else "--command"
    res = _wrangler(["d1", "execute", DB_NAME, "--remote", flag, sql_or_file])
    if res.returncode != 0:
        print(res.stdout[-1500:]); print(res.stderr[-1500:])
        raise SystemExit(f"FAILED: {label}")


def wipe_remote(table):
    while True:
        n = remote_query_scalar(f"SELECT COUNT(*) AS n FROM {table};")
        if not n:
            break
        print(f"  wipe {table}: {n} remaining…")
        remote_exec(
            f"DELETE FROM {table} WHERE rowid IN (SELECT rowid FROM {table} LIMIT {DELETE_BATCH});",
            False, f"delete batch {table}",
        )


def local_max_report_date():
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT MAX(report_date) FROM holdings").fetchone()
    conn.close()
    return row[0] if row and row[0] else None


def log_pipeline_run(report_date, holdings_count):
    y = q = "NULL"
    if report_date and len(report_date) >= 7:
        y = int(report_date[:4])
        q = (int(report_date[5:7]) - 1) // 3 + 1
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    remote_exec(
        "INSERT INTO pipeline_runs (run_type, year, quarter, status, records_processed, completed_at) "
        f"VALUES ('full_refresh', {y}, {q}, 'completed', {holdings_count}, '{now}');",
        False, "log pipeline_run",
    )


def main():
    execute = "--execute" in sys.argv
    skip_backup = "--skip-backup" in sys.argv
    if_changed = "--if-changed" in sys.argv

    # Idempotency guard: skip the whole wipe+reload when the remote is already at
    # (or ahead of) the local latest quarter. Makes scheduled runs safe no-ops
    # with zero downtime until a genuinely new quarter has been loaded locally.
    if execute and if_changed:
        local_date = local_max_report_date()
        remote_date = remote_query_scalar("SELECT MAX(report_date) AS d FROM holdings;")
        print(f"--if-changed: local latest={local_date}  remote latest={remote_date}")
        if remote_date and local_date and str(remote_date) >= str(local_date):
            print("Remote already current; skipping sync (no changes).")
            return

    print("Generating chunked SQL from local DB...")
    chunks = generate()
    print(f"\nGenerated {len(chunks)} chunk files in {OUT_DIR}")

    if not execute:
        print("\nDRY RUN. Re-run with --execute to backup, wipe (batched), and reload remote D1.")
        return

    if not skip_backup:
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = f"/tmp/{DB_NAME}-remote-backup-{ts}.sql"
        print(f"\n[1/3] Backing up remote D1 -> {backup}")
        res = _wrangler(["d1", "export", DB_NAME, "--remote", "--output", backup])
        if res.returncode != 0:
            print(res.stderr[-1500:]); raise SystemExit("Backup failed")
    else:
        print("\n[1/3] Skipping backup (--skip-backup)")

    print(f"\n[2/3] Wiping {len(WIPE_ORDER)} tables (child->parent, batched)…")
    for table in WIPE_ORDER:
        wipe_remote(table)

    print(f"\n[3/3] Inserting {len(chunks)} chunks (parent->child)…")
    for i, (path, table) in enumerate(chunks, 1):
        print(f"  [{i}/{len(chunks)}] {os.path.basename(path)}")
        remote_exec(path, True, f"import {os.path.basename(path)}")

    print("\nVerifying remote counts:")
    counts = {}
    for table in DATA_TABLES:
        counts[table] = remote_query_scalar(f"SELECT COUNT(*) AS n FROM {table};")
        print(f"  {table}: {counts[table]}")

    log_pipeline_run(local_max_report_date(), counts.get("holdings", 0))
    print("Done. Remote D1 refreshed from local DB.")


if __name__ == "__main__":
    main()
