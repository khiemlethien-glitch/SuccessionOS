#!/usr/bin/env python3
"""
import_kpi_nhanvien.py — Import "KPI nhan vien v2.csv" (IPA từ VNResource) vào Supabase.

Cấu trúc file v2:
  - LoaiTieuChi : "E_KPI" (chỉ tiêu KPI) hoặc "E_SKILL" (năng lực)
  - TenTieuChi  : tên tiêu chí (E_SKILL = tên năng lực tiếng Việt)
  - DiemDatDuoc : đóng góp có trọng số của tiêu chí → sum = DiemTongCuoi
  - DiemTongCuoi: tổng điểm đánh giá (scale phụ thuộc template, thường 0-5)
  - XepLoai     : xếp loại (A/B/C…) — thường trống trong file này

Strategy:
  1. Import assessment_summary (DiemTongCuoi → overall_score) cho mọi employee+cycle có điểm
  2. Import assessment_scores chỉ cho E_SKILL rows (10 tiêu chí năng lực)
     - Match TenTieuChi ↔ assessment_criteria.label qua alias + fuzzy
     - Score = DiemDatDuoc (đóng góp có trọng số, scale tuỳ template)
  3. E_KPI rows: bỏ qua criterion-level (TenTieuChi là text dài tiếng Anh, khó match)

Notes về scale:
  - DiemTongCuoi = sum(DiemDatDuoc) — xác nhận qua cross-check dữ liệu
  - Hầu hết employees: DiemTong ~ 0-5 (weight chuẩn)
  - Một số E_SUBMIT: DiemTong > 5 (template đặc biệt, skill weight cao)

Usage:
    export SUPABASE_SERVICE_KEY="eyJ..."
    python3 scripts/import_kpi_nhanvien.py [--dry-run]
"""

import csv
import os
import sys
import argparse
from pathlib import Path
from typing import Optional
from supabase import create_client, Client

SUPABASE_URL = "https://psaidbntrvrzodurnisz.supabase.co"

# Tìm file CSV v2 theo thứ tự ưu tiên
CSV_CANDIDATES = [
    Path.home() / "Downloads" / "KPI nhan vien v2.csv",
    Path(__file__).parent.parent / "Downloads" / "KPI nhan vien v2.csv",
    Path(__file__).parent / "data" / "KPI nhan vien v2.csv",
    # Fallback v1
    Path.home() / "Downloads" / "KPI nhan vien.csv",
]

# Cycle mapping: MaKeHoachDanhGia → assessment_cycles.id (UUID)
CYCLE_MAP = {
    "2022.KPI06": "DD16D8CE-5ED1-499E-833B-7D03E781AE81",
    "2022.KPI12": "0906F035-68C8-4656-8646-99F368151628",
    "2023.KPI06": "693DFBB8-C230-45D4-9FA5-226789335B0C",
    "2023.KPI12": "40EBB268-AA8C-44F3-94EF-63E223196F05",
    "2024.KPI06": "880CF192-AA6E-4552-B4B4-5F615AE2471A",
    "2024.KPI12": "99B2F2D8-7100-4AD0-BA7B-588491F6FFE1",
    "2025.KPI06": "E58D9159-09E3-4AD9-96E4-197A3FAB86CB",
    "2025.KPI12": "14130FB9-1690-4DBF-A7F6-BCAE1DA343D0",
    "2026.KPI06": "F8685EC3-01D2-4488-B8B7-081E71FCB128",
    "2026.KPI12": "8C5562F4-265E-46CC-BC5D-F4CB69B8A556",
}

# Fallback: infer cycle từ KyDanhGiaDen khi MaKeHoachDanhGia trống
END_DATE_TO_CYCLE = {
    "2022-06-30": "DD16D8CE-5ED1-499E-833B-7D03E781AE81",
    "2022-12-31": "0906F035-68C8-4656-8646-99F368151628",
    "2023-06-30": "693DFBB8-C230-45D4-9FA5-226789335B0C",
    "2023-12-31": "40EBB268-AA8C-44F3-94EF-63E223196F05",
    "2024-06-30": "880CF192-AA6E-4552-B4B4-5F615AE2471A",
    "2024-12-31": "99B2F2D8-7100-4AD0-BA7B-588491F6FFE1",
    "2025-06-30": "E58D9159-09E3-4AD9-96E4-197A3FAB86CB",
    "2025-12-31": "14130FB9-1690-4DBF-A7F6-BCAE1DA343D0",
    "2026-06-30": "F8685EC3-01D2-4488-B8B7-081E71FCB128",
    "2026-12-31": "8C5562F4-265E-46CC-BC5D-F4CB69B8A556",
}

# Alias normalisation: TenTieuChi (E_SKILL) → normalised key để khớp DB label
CRITERIA_LABEL_ALIASES = {
    "các phát kiến":                                      "các phát kiến",
    "kiến thức nghề nghiệp - kỹ năng về kỹ thuật":       "kiến thức nghề nghiệp",
    "kiến thức nghề nghiệp - kỹ năng vể kỹ thuật":       "kiến thức nghề nghiệp",
    "kỹ năng giao tiếp (truyền thông)":                   "kỹ năng giao tiếp",
    "làm việc nhóm":                                      "làm việc nhóm",
    "phục vụ khách hàng":                                 "phục vụ khách hàng",
    "sự thích nghi":                                      "sự thích nghi",
    "giám sát":                                           "giám sát",
    "lãnh đạo":                                           "lãnh đạo",
    "tổ chức công việc và hoạch định":                    "tổ chức công việc",
}


def normalise(s: str) -> str:
    return s.strip().lower()


def to_float(s: str) -> Optional[float]:
    s = s.strip()
    if not s or s in ("NULL", "null", ""):
        return None
    # Remove % sign if present
    s = s.rstrip("%")
    try:
        return float(s)
    except ValueError:
        return None


def extract_date(dt_str: str) -> str:
    """'2025-06-30 00:00:00.000' → '2025-06-30'"""
    return dt_str.strip()[:10] if dt_str.strip() else ""


def read_csv(path: Path) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def build_name_map(client: Client) -> dict[str, str]:
    """full_name (lower) → employee UUID."""
    print("  Fetching employees from DB...")
    result = client.table("employees").select("id, full_name").execute()
    name_map: dict[str, str] = {}
    for emp in (result.data or []):
        name_map[normalise(emp["full_name"])] = emp["id"]
    print(f"  Loaded {len(name_map)} employee names from DB")
    return name_map


def build_criteria_map(client: Client) -> dict[str, str]:
    """normalised label → criterion UUID."""
    print("  Fetching assessment_criteria from DB...")
    result = client.table("assessment_criteria").select("id, label").execute()
    crit_map: dict[str, str] = {}
    for c in (result.data or []):
        crit_map[normalise(c["label"])] = c["id"]
    print(f"  Loaded {len(crit_map)} criteria from DB")
    return crit_map


def resolve_cycle(row: dict) -> Optional[str]:
    ma_cycle = row.get("MaKeHoachDanhGia", "").strip()
    if ma_cycle and ma_cycle in CYCLE_MAP:
        return CYCLE_MAP[ma_cycle]
    # Fallback: infer từ ngày kết thúc
    end_raw  = row.get("KyDanhGiaDen", "").strip()
    end_date = extract_date(end_raw)
    return END_DATE_TO_CYCLE.get(end_date)


def resolve_criterion(ten_tieu_chi: str, crit_db: dict[str, str]) -> Optional[str]:
    norm = normalise(ten_tieu_chi)
    # Direct match
    if norm in crit_db:
        return crit_db[norm]
    # Alias lookup
    alias = CRITERIA_LABEL_ALIASES.get(norm)
    if alias:
        if alias in crit_db:
            return crit_db[alias]
        for db_label, cid in crit_db.items():
            if db_label.startswith(alias):
                return cid
    # Partial: DB label starts with first 15 chars of norm
    prefix = norm[:15]
    if len(prefix) >= 6:
        for db_label, cid in crit_db.items():
            if db_label.startswith(prefix):
                return cid
    return None


def main():
    parser = argparse.ArgumentParser(description="Import KPI nhân viên v2.csv into Supabase")
    parser.add_argument("--service-key", default=os.environ.get("SUPABASE_SERVICE_KEY", ""))
    parser.add_argument("--dry-run", action="store_true", help="Chỉ phân tích, không insert")
    args = parser.parse_args()

    service_key = args.service_key.strip()
    if not service_key:
        print("ERROR: Cần Supabase service role key.")
        print("  export SUPABASE_SERVICE_KEY='eyJ...'")
        sys.exit(1)

    # Tìm file CSV
    csv_path = None
    for candidate in CSV_CANDIDATES:
        if candidate.exists():
            csv_path = candidate
            break
    if csv_path is None:
        print(f"ERROR: Không tìm thấy file CSV. Thử các đường dẫn:")
        for c in CSV_CANDIDATES:
            print(f"  {c}")
        sys.exit(1)

    client: Client = create_client(SUPABASE_URL, service_key)

    print(f"\n{'='*60}")
    print("  SuccessionOS — Import KPI nhân viên v2")
    print(f"  Source: {csv_path}")
    print(f"  Mode:   {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"{'='*60}\n")

    # ── Load CSV ─────────────────────────────────────────────────
    rows = read_csv(csv_path)
    print(f"  CSV: {len(rows)} rows loaded")

    # ── Load DB lookups ──────────────────────────────────────────
    name_map = build_name_map(client)
    crit_db  = build_criteria_map(client)

    # ── Process rows ─────────────────────────────────────────────
    unmatched_names  = set()
    unmatched_crits  = set()
    unmatched_cycles = set()

    from collections import defaultdict
    # (emp_id, cycle_id) → summary info
    summary_map: dict[tuple, dict] = {}
    scores_list: list[dict] = []

    for r in rows:
        ten_nv    = r["TenNhanVien"].strip()
        loai_tc   = r.get("LoaiTieuChi", "").strip()   # E_KPI | E_SKILL
        ten_tc    = r.get("TenTieuChi", "").strip()    # criterion name (v2)
        diem_tong = to_float(r.get("DiemTongCuoi", ""))
        diem_dat  = to_float(r.get("DiemDatDuoc", "")) # weighted contribution per criterion
        status    = r.get("TrangThaiPhieu", "").strip()
        nhan_xet  = r.get("NhanXet", "").strip() or None
        xep_loai  = r.get("XepLoai", "").strip() or None

        # Skip rows với DiemTongCuoi = 0 và không có DiemDatDuoc (hoàn toàn trống)
        has_data = (diem_tong is not None and diem_tong > 0) or (diem_dat is not None and diem_dat > 0)
        if not has_data:
            continue

        # Resolve employee UUID
        emp_id = name_map.get(normalise(ten_nv))
        if not emp_id:
            unmatched_names.add(ten_nv)
            continue

        # Resolve cycle
        cycle_id = resolve_cycle(r)
        if not cycle_id:
            key_c = r.get("MaKeHoachDanhGia", "").strip() or extract_date(r.get("KyDanhGiaDen", ""))
            unmatched_cycles.add(key_c)
            continue

        # ── Assessment Summary (DiemTongCuoi per employee+cycle) ──
        key = (emp_id, cycle_id)
        if key not in summary_map:
            summary_map[key] = {
                "employee_id":    emp_id,
                "cycle_id":       cycle_id,
                "overall_score":  diem_tong,
                "rating_label":   xep_loai,
                "manager_note":   nhan_xet,
                "strengths":      [],
                "needs_dev":      [],
                "assessment_type": "kpi",
            }
        else:
            # Update nếu chưa có overall_score
            if diem_tong is not None and diem_tong > 0 and not summary_map[key]["overall_score"]:
                summary_map[key]["overall_score"] = diem_tong
            if xep_loai and not summary_map[key]["rating_label"]:
                summary_map[key]["rating_label"] = xep_loai

        # ── Criterion Scores — chỉ E_SKILL ────────────────────────
        if loai_tc != "E_SKILL":
            continue
        if not ten_tc or diem_dat is None:
            continue

        crit_id = resolve_criterion(ten_tc, crit_db)
        if not crit_id:
            unmatched_crits.add(ten_tc)
            continue

        scores_list.append({
            "employee_id":  emp_id,
            "cycle_id":     cycle_id,
            "criterion_id": crit_id,
            "score":        diem_dat,
        })

    # Deduplicate scores — keep last value per (emp, cycle, criterion)
    seen_scores: dict[tuple, dict] = {}
    for s in scores_list:
        k = (s["employee_id"], s["cycle_id"], s["criterion_id"])
        seen_scores[k] = s
    scores_deduped = list(seen_scores.values())

    # ── Report ───────────────────────────────────────────────────
    print(f"\n  📊 Kết quả phân tích:")
    print(f"  Summaries: {len(summary_map)} rows (employee+cycle có điểm)")
    print(f"  Scores:    {len(scores_deduped)} rows (E_SKILL criterion scores)")

    if unmatched_names:
        print(f"\n  ⚠  {len(unmatched_names)} nhân viên không match (theo tên):")
        for n in sorted(unmatched_names):
            print(f"    - {n}")
        print("    → Kiểm tra bảng employees.full_name")

    if unmatched_crits:
        print(f"\n  ⚠  {len(unmatched_crits)} tiêu chí E_SKILL không match:")
        for c in sorted(unmatched_crits):
            print(f"    - {c}")

    if unmatched_cycles:
        print(f"\n  ⚠  {len(unmatched_cycles)} cycle không map được:")
        for c in sorted(unmatched_cycles):
            print(f"    - {c}")

    # Preview summaries
    if args.dry_run:
        print(f"\n  Preview summaries:")
        for (emp_id, cycle_id), info in list(summary_map.items())[:10]:
            # Reverse lookup name
            name = next((k for k, v in name_map.items() if v == emp_id), emp_id[:8])
            print(f"    {name[:25]:25s} cycle={cycle_id[:8]}... overall={info['overall_score']}")
        print(f"\n  [DRY RUN] Không insert. Chạy lại không có --dry-run để import thực.")
        return

    # ── Insert / Upsert ──────────────────────────────────────────
    print(f"\n  Inserting assessment_summary ({len(summary_map)} rows)...")
    sum_records = list(summary_map.values())
    if sum_records:
        try:
            client.table("assessment_summary").upsert(
                sum_records, on_conflict="employee_id,cycle_id,assessment_type"
            ).execute()
            print(f"  ✓ assessment_summary: {len(sum_records)} rows upserted")
        except Exception as e:
            print(f"  ✗ assessment_summary error: {e}")

    print(f"  Inserting assessment_scores ({len(scores_deduped)} rows E_SKILL)...")
    if scores_deduped:
        BATCH = 200
        done  = 0
        for i in range(0, len(scores_deduped), BATCH):
            chunk = scores_deduped[i:i+BATCH]
            try:
                client.table("assessment_scores").upsert(
                    chunk, on_conflict="employee_id,cycle_id,criterion_id"
                ).execute()
                done += len(chunk)
                print(f"  ✓ assessment_scores: {done}/{len(scores_deduped)}", end="\r", flush=True)
            except Exception as e:
                print(f"\n  ✗ scores batch {i//BATCH+1} error: {e}")
        print(f"  ✓ assessment_scores: {done}/{len(scores_deduped)} rows upserted          ")

    print(f"\n{'='*60}")
    print("  ✅ Import complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
