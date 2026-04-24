#!/usr/bin/env python3
"""
import_supabase.py — Import real PTSC client CSV data into Supabase.

Usage:
    python3 scripts/import_supabase.py --service-key <SERVICE_ROLE_KEY>

    Or set env var:
    export SUPABASE_SERVICE_KEY="eyJ..."
    python3 scripts/import_supabase.py

CSV files expected in ~/Downloads/:
    department_data.csv, employees_data.csv, assessment_criteria.csv,
    assessment_cycles.csv, assessment_scores.csv, user_profiles.csv

Import order (FK-safe):
    1. departments          (no deps)
    2. assessment_cycles    (no deps)
    3. assessment_criteria  (no deps)
    4. employees            (→ departments)
    5. assessment_scores    (→ employees, cycles, criteria)
    6. user_profiles        (independent)
"""

import csv
import os
import sys
import argparse
from pathlib import Path
from typing import Any, Optional

from supabase import create_client, Client

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
SUPABASE_URL = "https://psaidbntrvrzodurnisz.supabase.co"
CSV_DIR      = Path(__file__).parent / "data"   # scripts/data/
BATCH_SIZE   = 200   # rows per upsert call


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def nullable(v: str) -> Any:
    """Convert empty string or 'NULL' literal to None."""
    if v in ("", "NULL", "null", "None"):
        return None
    return v


def to_bool(v: str) -> Optional[bool]:
    if v in ("", "NULL", "null"):
        return None
    return v in ("1", "true", "True", "yes")


def to_float(v: str) -> Optional[float]:
    v = nullable(v)
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def to_int(v: str) -> Optional[int]:
    v = nullable(v)
    if v is None:
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def ts(v: str) -> Optional[str]:
    """Normalise timestamp: strip +07:00 offset Supabase can't handle as-is via REST."""
    v = nullable(v)
    if v is None:
        return None
    # Keep as-is — Supabase REST accepts ISO 8601 with timezone offset
    return v


def read_csv(path: Path, has_header: bool):
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        if has_header:
            header = next(reader)
            rows = list(reader)
            return header, rows
        else:
            rows = list(reader)
            return None, rows


def batch_upsert(client: Client, table: str, records: list[dict], on_conflict: str = "id") -> None:
    total = len(records)
    inserted = 0
    for i in range(0, total, BATCH_SIZE):
        chunk = records[i : i + BATCH_SIZE]
        try:
            client.table(table).upsert(chunk, on_conflict=on_conflict).execute()
            inserted += len(chunk)
            print(f"  ✓ {table}: {inserted}/{total}", end="\r", flush=True)
        except Exception as e:
            print(f"\n  ✗ Error at batch {i//BATCH_SIZE + 1}: {e}")
            raise
    print(f"  ✓ {table}: {total}/{total} rows upserted          ")


# ──────────────────────────────────────────────
# Per-table mappers
# ──────────────────────────────────────────────
def map_departments(rows: list[list[str]]) -> list[dict]:
    # CSV cols: id, name, short_name, parent_id, level, sort_order, is_root, head_id, is_active, created_at, updated_at
    # DB cols:  id, name, name_short,  parent_id, level, sort_order,          head_id,             created_at
    result = []
    for r in rows:
        if len(r) < 8:
            continue
        result.append({
            "id":         r[0].strip(),
            "name":       r[1].strip(),
            "name_short": nullable(r[2]),    # short_name → name_short
            "parent_id":  nullable(r[3]),
            "level":      to_int(r[4]),
            "sort_order": to_int(r[5]),
            # is_root (r[6]) — not in DB, skip
            "head_id":    nullable(r[7]),
            # is_active (r[8]), updated_at (r[10]) — not in DB, skip
            "created_at": ts(r[9]),
        })
    return result


def map_assessment_cycles(rows: list[list[str]]) -> list[dict]:
    # NO header, 8 cols: id, name, type, start_date, end_date, status, sort_order, created_at
    result = []
    for r in rows:
        if len(r) < 8:
            continue
        result.append({
            "id":         r[0].strip(),
            "name":       r[1].strip(),
            "type":       nullable(r[2]),
            "start_date": nullable(r[3]),
            "end_date":   nullable(r[4]),
            "status":     nullable(r[5]),
            "sort_order": to_int(r[6]),
            "created_at": ts(r[7]),
        })
    return result


def map_assessment_criteria(rows: list[list[str]]) -> list[dict]:
    # CSV cols: id, key,  name,  description, weight, category, is_draft, is_active, type,            created_at
    # DB cols:  id, key,  label, description, weight, category,            is_active, assessment_type, created_at
    result = []
    for r in rows:
        if len(r) < 10:
            continue
        result.append({
            "id":              r[0].strip(),
            "key":             nullable(r[1]),
            "label":           r[2].strip(),        # name → label
            "description":     nullable(r[3]),
            "weight":          to_float(r[4]),
            "category":        nullable(r[5]),
            # is_draft (r[6]) — not in DB, skip
            "is_active":       to_bool(r[7]),
            "assessment_type": nullable(r[8]) or "kpi",
            "created_at":      ts(r[9]),
        })
    return result


TALENT_TIER_MAP = {
    "Tiem nang":  "Tiềm năng",
    "Tiềm năng":  "Tiềm năng",
    "Nong cot":   "Nòng cốt",
    "Nòng cốt":   "Nòng cốt",
    "Ke thua":    "Kế thừa",
    "Kế thừa":    "Kế thừa",
}


def to_array(v: str) -> Optional[list]:
    """Convert non-empty string to single-item array, else None."""
    v = nullable(v)
    if v is None:
        return None
    return [v]


def map_employees(rows: list[list[str]]) -> list[dict]:
    # CSV: id, full_name, position, department_id, email, hire_date, tenure_years, years_of_experience,
    #      reports_to_id, target_position, departure_reasons, is_active, created_at, updated_at,
    #      talent_tier, potential_level(*skip), performance_score, potential_score, risk_score,
    #      readiness_level, ktp_progress, overall_score(*skip generated), mentor_id, risk_reasons,
    #      comp_technical, comp_leadership, comp_communication, comp_problem_solving, comp_adaptability
    result = []
    skipped = 0
    seen_emails: dict = {}
    for r in rows:
        if len(r) < 29:
            continue
        if not nullable(r[3]):          # department_id NOT NULL in DB
            skipped += 1
            continue
        # Deduplicate email — nếu đã dùng thì tạo unique placeholder
        email = nullable(r[4])
        if not email or email in seen_emails:
            email = f"{r[0].strip().lower()}@placeholder.local"
        seen_emails[email] = True
        raw_tier = nullable(r[14])
        result.append({
            "id":                   r[0].strip(),
            "full_name":            r[1].strip(),
            "position":             nullable(r[2]),
            "department_id":        nullable(r[3]),
            "email":                email,
            "hire_date":            nullable(r[5]),
            "tenure_years":         to_float(r[6]),
            "years_of_experience":  to_int(r[7]),        # integer in DB
            "reports_to_id":        nullable(r[8]),
            "target_position":      nullable(r[9]),
            "departure_reasons":    to_array(r[10]),     # text[] in DB
            "is_active":            to_bool(r[11]),
            "created_at":           ts(r[12]),
            "updated_at":           ts(r[13]),
            "talent_tier":          TALENT_TIER_MAP.get(raw_tier, raw_tier),
            # r[15] = potential_level — not in DB, skip
            "performance_score":    to_float(r[16]),
            "potential_score":      to_float(r[17]),
            "risk_score":           to_float(r[18]),
            "readiness_level":      nullable(r[19]),
            "ktp_progress":         to_int(r[20]),       # integer in DB
            # r[21] = overall_score — generated column, skip
            "mentor_id":            nullable(r[22]),
            "risk_reasons":         to_array(r[23]),     # text[] in DB
            "comp_technical":       to_float(r[24]),
            "comp_leadership":      to_float(r[25]),
            "comp_communication":   to_float(r[26]),
            "comp_problem_solving": to_float(r[27]),
            "comp_adaptability":    to_float(r[28]),
        })
    if skipped:
        print(f"  ⚠ Skipped {skipped} rows with missing department_id")
    return result


def map_assessment_scores(rows: list[list[str]], valid_cycle_ids: set, valid_criterion_ids: set) -> list[dict]:
    # NO header, 5 cols: employee_id, cycle_id, criterion_id, score, created_at
    result = []
    skipped = 0
    for r in rows:
        if len(r) < 5:
            continue
        cycle_id = r[1].strip().upper()
        criterion_id = r[2].strip().upper()
        if cycle_id not in valid_cycle_ids:
            skipped += 1
            continue
        if criterion_id not in valid_criterion_ids:
            skipped += 1
            continue
        result.append({
            "employee_id":  r[0].strip(),
            "cycle_id":     r[1].strip(),
            "criterion_id": r[2].strip(),
            "score":        to_float(r[3]),
            "created_at":   ts(r[4]),
        })
    if skipped:
        print(f"  ⚠ Skipped {skipped} score rows with orphan FK references")
    # Deduplicate: keep last occurrence of each (employee_id, cycle_id, criterion_id)
    seen = {}
    for rec in result:
        key = (rec["employee_id"], rec["cycle_id"], rec["criterion_id"])
        seen[key] = rec
    deduped = list(seen.values())
    if len(deduped) < len(result):
        print(f"  ⚠ Removed {len(result) - len(deduped)} duplicate score rows")
    return deduped


def map_user_profiles(rows: list[list[str]]) -> list[dict]:
    # CSV cols: id, employee_code(*skip), full_name, email, role, status(*skip), manager_id(*skip), created_at, updated_at
    # DB cols:  id, email, full_name, role, department, talent_id, avatar_url, created_at, updated_at
    result = []
    for r in rows:
        if len(r) < 9:
            continue
        result.append({
            "id":         r[0].strip(),
            # r[1] = employee_code — not in DB
            "full_name":  r[2].strip(),
            "email":      nullable(r[3]),
            "role":       nullable(r[4]),
            # r[5] = status, r[6] = manager_id — not in DB
            "created_at": ts(r[7]),
            "updated_at": ts(r[8]),
        })
    return result


def map_assessment_summary(rows: list[list[str]], valid_cycle_ids: set) -> list[dict]:
    # NO header, 10 cols:
    # employee_id, cycle_id, overall_score, rating_label,
    # manager_note, strengths, needs_dev, assessment_type, created_at, updated_at(*skip)
    result = []
    skipped = 0
    for r in rows:
        if len(r) < 9:
            continue
        if r[1].strip().upper() not in valid_cycle_ids:
            skipped += 1
            continue
        result.append({
            "employee_id":   r[0].strip(),
            "cycle_id":      r[1].strip(),
            "overall_score": to_float(r[2]),
            "rating_label":  nullable(r[3]),
            "manager_note":  nullable(r[4]),
            "strengths":     nullable(r[5]),
            "needs_dev":     nullable(r[6]),
            "assessment_type": nullable(r[7]) or "kpi",
            "created_at":    ts(r[8]),
            # r[9] = updated_at — not in DB schema, skip
        })
    if skipped:
        print(f"  ⚠ Skipped {skipped} rows with orphan cycle_id")
    # Deduplicate on unique constraint (employee_id, cycle_id, assessment_type)
    seen = {}
    for rec in result:
        key = (rec["employee_id"], rec["cycle_id"], rec["assessment_type"])
        seen[key] = rec
    deduped = list(seen.values())
    if len(deduped) < len(result):
        print(f"  ⚠ Removed {len(result) - len(deduped)} duplicate rows")
    return deduped


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Import PTSC CSV data into Supabase")
    parser.add_argument("--service-key", default=os.environ.get("SUPABASE_SERVICE_KEY", ""))
    parser.add_argument("--csv-dir", default=str(CSV_DIR))
    parser.add_argument("--skip-truncate", action="store_true",
                        help="Skip truncate (use upsert-only mode)")
    args = parser.parse_args()

    service_key = args.service_key.strip()
    if not service_key:
        print("ERROR: Need Supabase service role key.")
        print("  Set SUPABASE_SERVICE_KEY env var or pass --service-key <key>")
        print("  Get it from: Supabase Dashboard → Settings → API → service_role (secret)")
        sys.exit(1)

    csv_dir = Path(args.csv_dir)
    client: Client = create_client(SUPABASE_URL, service_key)

    print(f"\n{'='*55}")
    print("  SuccessionOS — Supabase Data Import")
    print(f"  Source: {csv_dir}")
    print(f"{'='*55}\n")

    # ── Step 1: departments ──────────────────────
    print("[1/6] departments")
    _, rows = read_csv(csv_dir / "department_data.csv", has_header=True)
    records = map_departments(rows)
    print(f"  Loaded {len(records)} rows from CSV")
    batch_upsert(client, "departments", records)

    # ── Step 2: assessment_cycles ────────────────
    print("[2/6] assessment_cycles")
    _, cycle_rows = read_csv(csv_dir / "assessment_cycles.csv", has_header=False)
    records = map_assessment_cycles(cycle_rows)
    print(f"  Loaded {len(records)} rows from CSV")
    batch_upsert(client, "assessment_cycles", records)
    valid_cycle_ids = {r[0].strip().upper() for r in cycle_rows if r}

    # ── Step 3: assessment_criteria ─────────────
    print("[3/6] assessment_criteria")
    _, crit_rows = read_csv(csv_dir / "assessment_criteria.csv", has_header=False)
    records = map_assessment_criteria(crit_rows)
    print(f"  Loaded {len(records)} rows from CSV")
    batch_upsert(client, "assessment_criteria", records)
    valid_criterion_ids = {r[0].strip().upper() for r in crit_rows if r}

    # ── Step 4: employees (2-pass for self-referential FK) ──────────
    print("[4/6] employees")
    _, dept_rows_raw = read_csv(csv_dir / "department_data.csv", has_header=True)
    valid_dept_ids = {r[0].strip().upper() for r in dept_rows_raw if r}

    _, emp_rows = read_csv(csv_dir / "employees_data.csv", has_header=True)
    records = map_employees(emp_rows)
    # Filter out employees whose department_id is not in departments table
    before = len(records)
    records = [r for r in records if r["department_id"] and r["department_id"].upper() in valid_dept_ids]
    if len(records) < before:
        print(f"  ⚠ Skipped {before - len(records)} rows with invalid department_id")
    print(f"  Loaded {len(records)} rows from CSV")

    # Pass 1: insert without reports_to_id (avoids FK chicken-and-egg)
    pass1 = [{**r, "reports_to_id": None} for r in records]
    batch_upsert(client, "employees", pass1)

    # Pass 2: update reports_to_id — group by manager to minimise API calls
    from collections import defaultdict
    by_mgr: dict = defaultdict(list)
    for r in records:
        if r["reports_to_id"]:
            by_mgr[r["reports_to_id"]].append(r["id"])
    if by_mgr:
        total_links = sum(len(v) for v in by_mgr.values())
        print(f"  Pass 2: updating {total_links} reports_to_id links ({len(by_mgr)} unique managers)...")
        done = 0
        IN_CHUNK = 100   # max IDs per .in_() call to avoid URL too long
        for mgr_id, emp_ids in by_mgr.items():
            try:
                for i in range(0, len(emp_ids), IN_CHUNK):
                    chunk = emp_ids[i : i + IN_CHUNK]
                    client.table("employees").update({"reports_to_id": mgr_id}).in_("id", chunk).execute()
                    done += len(chunk)
                    print(f"  Pass 2: {done}/{total_links}", end="\r", flush=True)
            except Exception as e:
                print(f"\n  ⚠ Skip manager {mgr_id[:8]}...: {e}")
        print(f"  ✓ Pass 2: {done}/{total_links} links updated          ")

    # ── Step 5: assessment_scores ────────────────
    print("[5/6] assessment_scores")
    _, rows = read_csv(csv_dir / "assessment_scores.csv", has_header=False)
    records = map_assessment_scores(rows, valid_cycle_ids, valid_criterion_ids)
    print(f"  Loaded {len(records)} rows from CSV")
    batch_upsert(client, "assessment_scores", records,
                 on_conflict="employee_id,cycle_id,criterion_id")

    # ── Step 6: assessment_summary ───────────────
    print("[6/7] assessment_summary")
    _, rows = read_csv(csv_dir / "assessment_summary.csv", has_header=False)
    records = map_assessment_summary(rows, valid_cycle_ids)
    print(f"  Loaded {len(records)} rows from CSV")
    batch_upsert(client, "assessment_summary", records,
                 on_conflict="employee_id,cycle_id,assessment_type")

    # ── Step 7: user_profiles ────────────────────
    print("[7/7] user_profiles — skipped (requires auth.users FK, already imported separately)")

    print(f"\n{'='*55}")
    print("  ✅ Import complete!")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    main()
