#!/usr/bin/env python3
"""
generate_auth_sql.py — Generate SQL to bulk-create Supabase auth users + user_profiles.

Vì auth.users không expose qua REST API, cần insert trực tiếp bằng SQL.

Usage:
    python3 scripts/generate_auth_sql.py
    → Output: scripts/data/auth_users.sql  (chạy trong Supabase SQL Editor)
"""

import csv
import json
from pathlib import Path

CSV_PATH   = Path(__file__).parent / "data" / "user_profiles.csv"
OUT_DIR    = Path(__file__).parent / "data" / "auth_chunks"
CHUNK_SIZE = 200   # rows per file (keeps each file small for SQL Editor)

DEFAULT_PASSWORD     = "SuccessionOS@2026"

# Compute bcrypt hash once, reuse for all users
try:
    import bcrypt as _bcrypt
    DEFAULT_PASSWORD_HASH = _bcrypt.hashpw(
        DEFAULT_PASSWORD.encode(), _bcrypt.gensalt(10)
    ).decode()
except ImportError:
    # Fallback: pre-computed hash (bcrypt of "SuccessionOS@2026", cost=10)
    DEFAULT_PASSWORD_HASH = "$2b$10$8q0Qff9EZrl.GatLLSUbl.9fvUFBgN1v0k3BSi.TuMH6uIAWaSpNa"


def nullable(v: str):
    s = v.strip()
    return s if s not in ("", "NULL", "null") else None


def sql_str(v) -> str:
    if v is None:
        return "NULL"
    escaped = str(v).replace("'", "''")
    return f"'{escaped}'"


def main():
    rows = []
    seen_emails = {}   # email → count, để deduplicate

    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        for r in csv.reader(f):
            if len(r) < 9:
                continue
            uid   = r[0].strip()
            name  = r[2].strip()
            email = nullable(r[3])
            role  = nullable(r[4]) or "Viewer"
            created_at = nullable(r[7])
            updated_at = nullable(r[8])

            if not uid:
                continue

            # Nếu email trống hoặc đã dùng → tạo unique placeholder
            if not email or email in seen_emails:
                email = f"{uid.lower()}@placeholder.local"
            seen_emails[email] = seen_emails.get(email, 0) + 1

            rows.append({
                "id":         uid,
                "email":      email,
                "full_name":  name,
                "role":       role,
                "created_at": created_at or "now()",
                "updated_at": updated_at or "now()",
            })

    print(f"Loaded {len(rows)} user_profiles from CSV")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total_chunks = -(-len(rows) // CHUNK_SIZE)  # ceil division

    for chunk_idx, chunk_start in enumerate(range(0, len(rows), CHUNK_SIZE)):
        chunk     = rows[chunk_start : chunk_start + CHUNK_SIZE]
        chunk_num = chunk_idx + 1
        out_file  = OUT_DIR / f"chunk_{chunk_num:03d}_of_{total_chunks:03d}.sql"

        lines = []
        lines.append(f"-- ============================================================")
        lines.append(f"-- auth_users chunk {chunk_num}/{total_chunks}")
        lines.append(f"-- Users {chunk_start+1}–{chunk_start+len(chunk)} of {len(rows)}")
        lines.append(f"-- Default password: {DEFAULT_PASSWORD}")
        lines.append(f"-- ============================================================")
        lines.append("")

        # Part 1: auth.users
        lines.append("INSERT INTO auth.users (")
        lines.append("    instance_id, id, aud, role, email,")
        lines.append("    encrypted_password, email_confirmed_at,")
        lines.append("    raw_app_meta_data, raw_user_meta_data,")
        lines.append("    created_at, updated_at,")
        lines.append("    is_super_admin, confirmation_token, recovery_token,")
        lines.append("    email_change_token_new, email_change")
        lines.append(") VALUES")
        val_rows = []
        for u in chunk:
            # Serialize JSON blobs properly then escape single quotes for SQL
            app_meta  = '{"provider":"email","providers":["email"]}'
            user_meta = json.dumps({"full_name": u["full_name"], "role": u["role"]},
                                   ensure_ascii=False).replace("'", "''")
            val_rows.append(
                f"    ('00000000-0000-0000-0000-000000000000', "
                f"{sql_str(u['id'])}, "
                f"'authenticated', 'authenticated', "
                f"{sql_str(u['email'])}, "
                f"{sql_str(DEFAULT_PASSWORD_HASH)}, "
                f"now(), "
                f"'{app_meta}', "
                f"'{user_meta}', "
                f"{sql_str(u['created_at'])}, "
                f"{sql_str(u['updated_at'])}, "
                f"false, '', '', '', '')"
            )
        lines.append(",\n".join(val_rows))
        lines.append("ON CONFLICT (id) DO NOTHING;")
        lines.append("")

        # Part 2: user_profiles
        lines.append("INSERT INTO user_profiles (id, email, full_name, role, created_at, updated_at)")
        lines.append("VALUES")
        val_rows = []
        for u in chunk:
            val_rows.append(
                f"    ({sql_str(u['id'])}, "
                f"{sql_str(u['email'])}, "
                f"{sql_str(u['full_name'])}, "
                f"{sql_str(u['role'])}, "
                f"{sql_str(u['created_at'])}, "
                f"{sql_str(u['updated_at'])})"
            )
        lines.append(",\n".join(val_rows))
        lines.append("ON CONFLICT (id) DO UPDATE SET")
        lines.append("    email = EXCLUDED.email, full_name = EXCLUDED.full_name,")
        lines.append("    role = EXCLUDED.role, updated_at = EXCLUDED.updated_at;")

        out_file.write_text("\n".join(lines), encoding="utf-8")
        print(f"  chunk {chunk_num}/{total_chunks}: {out_file.name}", end="\r")

    print(f"\n✅ Generated {total_chunks} SQL files → {OUT_DIR}/")
    print()
    print("Bước tiếp theo:")
    print(f"  Supabase Dashboard → SQL Editor → chạy từng file chunk_001 đến chunk_{total_chunks:03d}")
    first_file = OUT_DIR / f"chunk_001_of_{total_chunks:03d}.sql"
    print(f"  Mỗi file = {CHUNK_SIZE} users, ~{first_file.stat().st_size//1024} KB")
    print(f"  Mật khẩu mặc định tất cả users: {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    main()
