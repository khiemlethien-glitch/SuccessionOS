#!/usr/bin/env python3
"""
run_auth_chunks.py — Tự động chạy tất cả chunk SQL qua Supabase Management API.

Usage:
    python3 scripts/run_auth_chunks.py --token <MANAGEMENT_API_TOKEN> [--from 2]

Management API token: Supabase Dashboard → Account (avatar góc trái) → Access Tokens → Generate new token
"""

import argparse
import os
import sys
import time
import requests
from pathlib import Path

PROJECT_REF = "psaidbntrvrzodurnisz"
API_URL     = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
CHUNKS_DIR  = Path(__file__).parent / "data" / "auth_chunks"


def run_sql(token: str, sql: str, chunk_name: str) -> bool:
    resp = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
        },
        json={"query": sql},
        timeout=60,
    )
    if resp.status_code in (200, 201):
        return True
    else:
        print(f"\n  ✗ {chunk_name}: HTTP {resp.status_code}")
        try:
            err = resp.json()
            print(f"    {err.get('message', resp.text[:200])}")
        except Exception:
            print(f"    {resp.text[:200]}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", default=os.environ.get("SUPABASE_MGMT_TOKEN", ""))
    parser.add_argument("--from",  dest="from_chunk", type=int, default=2,
                        help="Bắt đầu từ chunk số mấy (default: 2, vì chunk_001 đã chạy tay)")
    args = parser.parse_args()

    token = args.token.strip()
    if not token:
        print("ERROR: Cần Supabase Management API token.")
        print("  Lấy tại: Supabase Dashboard → Account → Access Tokens → Generate new token")
        print("  Rồi chạy: python3 scripts/run_auth_chunks.py --token <token>")
        sys.exit(1)

    chunks = sorted(CHUNKS_DIR.glob("chunk_*.sql"))
    chunks_to_run = [c for c in chunks
                     if int(c.stem.split("_")[1]) >= args.from_chunk]

    if not chunks_to_run:
        print("Không tìm thấy chunk nào cần chạy.")
        sys.exit(0)

    total = len(chunks_to_run)
    print(f"\nChạy {total} chunks (từ chunk_{args.from_chunk:03d})...\n")

    ok = 0
    for i, chunk_file in enumerate(chunks_to_run, 1):
        sql = chunk_file.read_text(encoding="utf-8")
        print(f"  [{i}/{total}] {chunk_file.name} ...", end=" ", flush=True)
        success = run_sql(token, sql, chunk_file.name)
        if success:
            print("✅")
            ok += 1
        else:
            # Tiếp tục chunk tiếp theo dù lỗi
            pass
        if i < total:
            time.sleep(0.3)  # tránh rate limit

    print(f"\n{'='*45}")
    print(f"  Hoàn tất: {ok}/{total} chunks thành công")
    if ok < total:
        print(f"  ⚠ {total-ok} chunk lỗi — kiểm tra output ở trên")
    print(f"{'='*45}\n")


if __name__ == "__main__":
    main()
