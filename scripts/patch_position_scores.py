#!/usr/bin/env python3
"""
patch_position_scores.py — Cập nhật competency_scores cho 15 vị trí then chốt.

Chỉ UPDATE các hàng đã có trong DB (match bằng title), không xoá hay tạo mới.

Usage:
    export SUPABASE_SERVICE_KEY="eyJ..."
    python3 scripts/patch_position_scores.py
"""

import os, sys
from supabase import create_client

SUPABASE_URL = "https://psaidbntrvrzodurnisz.supabase.co"

def main():
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not key:
        print("ERROR: SUPABASE_SERVICE_KEY not set")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, key)

    # Map: position title → competency_scores (0-100 targets)
    # Critical: 85-95  |  High: 75-87  |  Medium: 65-78
    SCORES: dict[str, dict[str, int]] = {
        "Tổng Giám Đốc":               {"leadership": 92, "strategic_thinking": 90, "financial_acumen": 85},
        "Phó TGĐ Kinh Doanh":          {"leadership": 88, "sales": 90, "negotiation": 87},
        "Phó TGĐ Vận Hành":            {"leadership": 88, "operations": 90, "logistics": 85},
        "Giám đốc Nhân Sự":            {"hrm": 82, "talent_management": 80, "leadership": 82},
        "Giám đốc Tài Chính":          {"finance": 90, "compliance": 87, "leadership": 85},
        "Giám đốc Kinh Doanh":         {"sales": 85, "crm": 80, "leadership": 80},
        "Giám đốc Công Nghệ":          {"technology": 85, "architecture": 82, "leadership": 78},
        "Giám đốc Vận Hành":           {"operations": 83, "logistics": 80, "process_improvement": 78},
        "Giám đốc Chi Nhánh Hà Nội":   {"leadership": 82, "sales": 80, "operations": 78},
        "Trưởng phòng KD Quốc Tế":     {"international_sales": 75, "english": 78, "negotiation": 72},
        "Trưởng phòng Kế Toán":        {"accounting": 78, "tax": 75, "compliance": 72},
        "Trưởng phòng Tuyển Dụng":     {"recruitment": 75, "employer_branding": 70, "hrm": 72},
        "Trưởng phòng IT Development": {"software_development": 78, "agile": 75, "architecture": 72},
        "Trưởng phòng Kho Bãi":        {"warehouse": 75, "wms": 72, "operations": 70},
        "Giám đốc Chiến Lược":         {"strategy": 85, "analysis": 82, "leadership": 80},
    }

    # Fetch existing positions to get IDs
    res = sb.table("key_positions").select("id, title").execute()
    positions = res.data or []
    print(f"Found {len(positions)} key_positions in DB")

    updated = 0
    skipped = 0
    for pos in positions:
        title = pos["title"]
        scores = SCORES.get(title)
        if not scores:
            print(f"  ⚠ No score mapping for: {title!r}")
            skipped += 1
            continue
        try:
            sb.table("key_positions").update({"competency_scores": scores}).eq("id", pos["id"]).execute()
            print(f"  ✓ {title}: {scores}")
            updated += 1
        except Exception as e:
            print(f"  ✗ {title}: {e}")

    print(f"\nDone: {updated} updated, {skipped} skipped")

if __name__ == "__main__":
    main()
