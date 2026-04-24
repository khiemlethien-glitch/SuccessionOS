#!/usr/bin/env python3
"""
seed_200_employees.py — Seed hoàn chỉnh 200 nhân viên ITL Group vào Supabase.

Bao gồm đầy đủ:
  - 12 phòng ban (hierarchy cha-con, head_id)
  - 200 nhân viên (5 cấp bậc, hierarchy reports_to + mentor)
  - 15 vị trí then chốt (key_positions)
  - succession_plans (2-3 ứng viên/vị trí)
  - assessment_summary + assessment_scores (4 cycles × nhân viên)
  - external_scores (200 người)
  - employee_extras (200 người)
  - career_roadmaps (senior employees)
  - idp_plans + idp_goals (150 người)
  - mentoring_pairs (40 cặp)
  - calibration_sessions (3 phiên)
  - audit_logs (60 bản ghi)
  - score_weight_config + assessment_display_config (singletons)

Usage:
    export SUPABASE_SERVICE_KEY="eyJ..."
    python3 scripts/seed_200_employees.py
"""

import os, sys, uuid, random, json
from datetime import date, timedelta, datetime
from supabase import create_client, Client

SUPABASE_URL = "https://psaidbntrvrzodurnisz.supabase.co"
SEED = 42
random.seed(SEED)

# ── Existing cycle IDs (đã có trong DB) ─────────────────────────────────────
CYCLE_MID_2024  = "880cf192-aa6e-4552-b4b4-5f615ae2471a"
CYCLE_END_2024  = "99b2f2d8-7100-4ad0-ba7b-588491f6ffe1"
CYCLE_MID_2025  = "e58d9159-09e3-4ad9-96e4-197a3fab86cb"
CYCLE_END_2025  = "14130fb9-1690-4dbf-a7f6-bcae1da343d0"
CYCLE_MID_2026  = "f8685ec3-01d2-4488-b8b7-081e71fcb128"

# ── Existing 360 criteria IDs ────────────────────────────────────────────────
CRIT_LEADERSHIP  = "aed587a2-2295-41b7-896b-1f8b6ef2dc98"   # s7
CRIT_ORG_WORK    = "df6857d4-52e7-49c8-ad26-827f70d043e2"   # s8
CRIT_SUPERVISION = "c4450ef1-bc50-47ae-8541-e0f9a6bf31b7"   # s9
CRIT_KNOWLEDGE   = "dcb04e02-bd08-4e5a-b081-045689975936"   # s10
CRIT_TEAMWORK    = "ffc8a20b-d8f6-402a-96f6-3351aa5e7448"   # s16
CRIT_COMMS       = "e0a96af2-25ce-4b20-827b-502a52440a39"   # s12
CRIT_INNOVATION  = "c6f184fb-8538-490c-b067-44fcbf1b3d14"   # s13
CRIT_CUSTOMER    = "214f4760-29a7-432a-b603-3821471a11e7"   # s14
CRIT_ADAPTABLE   = "07d22a92-4cca-411b-b795-043354bd1168"   # s15

SKILL_CRITERIA = [
    CRIT_LEADERSHIP, CRIT_ORG_WORK, CRIT_SUPERVISION,
    CRIT_KNOWLEDGE, CRIT_TEAMWORK, CRIT_COMMS,
    CRIT_INNOVATION, CRIT_CUSTOMER, CRIT_ADAPTABLE,
]

# ── Vietnamese name pool ─────────────────────────────────────────────────────
LAST_NAMES = ["Nguyễn","Trần","Lê","Phạm","Hoàng","Huỳnh","Vũ","Võ","Đặng","Bùi","Đỗ","Hồ","Ngô","Dương","Lý"]
MALE_MID   = ["Văn","Minh","Quốc","Thanh","Đức","Hữu","Trọng","Đình","Quang","Trí","Bảo","Hồng","Ngọc","Công","Gia"]
MALE_FIRST = ["Sơn","Tuấn","Hùng","Long","Anh","Nam","Nghĩa","Đức","Khoa","Huy","Thành","Phúc","Phương","Bình","Dũng","Hải","Tùng","Khánh","Châu","Lâm"]
FEM_MID    = ["Thị","Minh","Thu","Lan","Ngọc","Phương","Kim","Bích","Thanh","Mỹ","Như","Hồng","Thúy","Thảo","Tú"]
FEM_FIRST  = ["Hoa","Châu","Hằng","Hương","Anh","Mai","Linh","Nguyên","Dung","Ngọc","Tuyền","Hạnh","Lan","Quỳnh","Nhung","Thu","Ánh","Hà","Thư","Chi"]

def rand_name(gender: str, used: set) -> str:
    for _ in range(200):
        ln = random.choice(LAST_NAMES)
        if gender == "M":
            name = f"{ln} {random.choice(MALE_MID)} {random.choice(MALE_FIRST)}"
        else:
            name = f"{ln} {random.choice(FEM_MID)} {random.choice(FEM_FIRST)}"
        if name not in used:
            used.add(name)
            return name
    return f"{random.choice(LAST_NAMES)} NV{len(used)}"

def uid() -> str:
    return str(uuid.uuid4())

def rnd(lo, hi) -> float:
    return round(random.uniform(lo, hi), 1)

def rnd_int(lo, hi) -> int:
    return random.randint(lo, hi)

def past_date(years_ago_max=10, years_ago_min=0) -> str:
    d = date.today() - timedelta(days=random.randint(years_ago_min*365, years_ago_max*365))
    return d.isoformat()

def future_date(months=6) -> str:
    d = date.today() + timedelta(days=random.randint(30, months*30))
    return d.isoformat()

def batch_upsert(sb: Client, table: str, rows: list, conflict: str = None, batch=200):
    total = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i+batch]
        try:
            if conflict:
                sb.table(table).upsert(chunk, on_conflict=conflict).execute()
            else:
                sb.table(table).upsert(chunk).execute()
            total += len(chunk)
        except Exception as e:
            print(f"  ✗ {table} batch {i//batch+1}: {e}")
    print(f"  ✓ {table}: {total} rows")
    return total

def batch_insert(sb: Client, table: str, rows: list, batch=200):
    """Insert only (no upsert) — for tables without reliable unique constraints."""
    total = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i+batch]
        try:
            sb.table(table).insert(chunk).execute()
            total += len(chunk)
        except Exception as e:
            print(f"  ✗ {table} batch {i//batch+1}: {e}")
    print(f"  ✓ {table}: {total} rows")
    return total

# ═══════════════════════════════════════════════════════════════════════════════
def main():
    key = os.environ.get("SUPABASE_SERVICE_KEY","").strip()
    if not key:
        print("ERROR: export SUPABASE_SERVICE_KEY=..."); sys.exit(1)
    sb: Client = create_client(SUPABASE_URL, key)
    print(f"\n{'='*60}\n  SuccessionOS — Seed 200 Employees\n{'='*60}\n")

    # ── STEP 0: TRUNCATE ────────────────────────────────────────────────────
    print("[ 0 ] Truncating all tables...")

    # UUID-PK tables: use a UUID that doesn't exist
    uuid_pk_tables = [
        "audit_logs","calibration_sessions","mentoring_pairs",
        "idp_goals","idp_plans","succession_plans","career_roadmaps",
    ]
    # composite-PK / employee_id-PK tables
    emp_pk_tables = [
        "employee_extras","external_scores","assessment_scores","assessment_summary",
    ]
    # text-PK tables (deleted in reverse FK order)
    text_pk_tables = ["key_positions","employees","departments"]

    NULL_UUID = "00000000-0000-0000-0000-000000000000"
    for t in uuid_pk_tables:
        try:
            sb.table(t).delete().neq("id", NULL_UUID).execute()
            print(f"  cleared {t}")
        except Exception as e:
            print(f"  warn: {t}: {e}")
    for t in emp_pk_tables:
        try:
            sb.table(t).delete().neq("employee_id", "__never__").execute()
            print(f"  cleared {t}")
        except Exception as e:
            print(f"  warn: {t}: {e}")
    for t in text_pk_tables:
        try:
            sb.table(t).delete().neq("id", "__never__").execute()
            print(f"  cleared {t}")
        except Exception as e:
            print(f"  warn: {t}: {e}")
    print("  ✓ Tables cleared\n")

    # ── STEP 1: DEPARTMENTS ─────────────────────────────────────────────────
    print("[ 1 ] Seeding departments...")
    D = {k: uid() for k in ["BGD","HR","FIN","SALES","IT","OPS","MKT","LEGAL","ADM","HAN","DAD","PLAN"]}

    dept_rows = [
        {"id":D["BGD"],  "name":"Ban Giám Đốc",                  "name_short":"BGĐ",  "parent_id":None,     "level":0,"sort_order":0},
        {"id":D["HR"],   "name":"Phòng Nhân Sự & Hành Chính",    "name_short":"HR",   "parent_id":D["BGD"], "level":1,"sort_order":1},
        {"id":D["FIN"],  "name":"Phòng Tài Chính - Kế Toán",     "name_short":"FIN",  "parent_id":D["BGD"], "level":1,"sort_order":2},
        {"id":D["SALES"],"name":"Phòng Kinh Doanh",              "name_short":"KD",   "parent_id":D["BGD"], "level":1,"sort_order":3},
        {"id":D["IT"],   "name":"Phòng Công Nghệ Thông Tin",     "name_short":"IT",   "parent_id":D["BGD"], "level":1,"sort_order":4},
        {"id":D["OPS"],  "name":"Phòng Vận Hành & Kho Bãi",      "name_short":"OPS",  "parent_id":D["BGD"], "level":1,"sort_order":5},
        {"id":D["MKT"],  "name":"Phòng Marketing",               "name_short":"MKT",  "parent_id":D["BGD"], "level":1,"sort_order":6},
        {"id":D["LEGAL"],"name":"Phòng Pháp Lý & Tuân Thủ",     "name_short":"PLG",  "parent_id":D["BGD"], "level":1,"sort_order":7},
        {"id":D["ADM"],  "name":"Phòng Hành Chính - Tổng Hợp",  "name_short":"HC",   "parent_id":D["HR"],  "level":2,"sort_order":8},
        {"id":D["HAN"],  "name":"Chi Nhánh Hà Nội",              "name_short":"HAN",  "parent_id":D["BGD"], "level":1,"sort_order":9},
        {"id":D["DAD"],  "name":"Chi Nhánh Đà Nẵng",             "name_short":"DAD",  "parent_id":D["BGD"], "level":1,"sort_order":10},
        {"id":D["PLAN"], "name":"Phòng Kế Hoạch & Chiến Lược",  "name_short":"KH",   "parent_id":D["BGD"], "level":1,"sort_order":11},
    ]
    batch_upsert(sb, "departments", dept_rows)

    # ── STEP 2: SINGLETONS ──────────────────────────────────────────────────
    print("\n[ 2 ] Seeding singletons...")
    sb.table("score_weight_config").upsert({"id":1,"assessment_weight":60,"weight_360":40}).execute()
    sb.table("assessment_display_config").upsert({
        "id":1,
        "criterion_ids":[CRIT_LEADERSHIP, CRIT_KNOWLEDGE, CRIT_TEAMWORK, CRIT_COMMS],
    }).execute()
    print("  ✓ score_weight_config + assessment_display_config")

    # ── STEP 3: EMPLOYEES ───────────────────────────────────────────────────
    print("\n[ 3 ] Seeding 200 employees...")

    # Define org blueprint: (dept, position, level_int, count, gender)
    # level: 1=C-Suite, 2=Director, 3=Manager, 4=Senior, 5=Staff
    BLUEPRINT = [
        # C-Suite (L1)
        (D["BGD"],  "Tổng Giám Đốc",                     1, 1, "M"),
        (D["BGD"],  "Phó Tổng Giám Đốc Kinh Doanh",      1, 1, "M"),
        (D["BGD"],  "Phó Tổng Giám Đốc Vận Hành",        1, 1, "F"),
        # Directors (L2)
        (D["HR"],   "Giám đốc Nhân Sự",                  2, 1, "F"),
        (D["FIN"],  "Giám đốc Tài Chính",                 2, 1, "M"),
        (D["SALES"],"Giám đốc Kinh Doanh",               2, 1, "M"),
        (D["IT"],   "Giám đốc Công Nghệ",                2, 1, "M"),
        (D["OPS"],  "Giám đốc Vận Hành",                 2, 1, "M"),
        (D["MKT"],  "Giám đốc Marketing",                2, 1, "F"),
        (D["LEGAL"],"Giám đốc Pháp Lý",                  2, 1, "F"),
        (D["HAN"],  "Giám đốc Chi Nhánh Hà Nội",         2, 1, "M"),
        (D["DAD"],  "Giám đốc Chi Nhánh Đà Nẵng",        2, 1, "M"),
        (D["PLAN"], "Giám đốc Chiến Lược",               2, 1, "M"),
        # Managers (L3)
        (D["HR"],   "Trưởng phòng Tuyển Dụng",           3, 1, "F"),
        (D["HR"],   "Trưởng phòng Đào Tạo & Phát Triển", 3, 1, "F"),
        (D["HR"],   "Trưởng phòng C&B",                  3, 1, "F"),
        (D["FIN"],  "Trưởng phòng Kế Toán",              3, 1, "F"),
        (D["FIN"],  "Trưởng phòng Kiểm Toán Nội Bộ",     3, 1, "M"),
        (D["SALES"],"Trưởng phòng KD Quốc Tế",           3, 1, "M"),
        (D["SALES"],"Trưởng phòng KD Nội Địa",           3, 1, "M"),
        (D["SALES"],"Trưởng phòng CSKH",                 3, 1, "F"),
        (D["IT"],   "Trưởng phòng Phát Triển",           3, 1, "M"),
        (D["IT"],   "Trưởng phòng Hạ Tầng & Bảo Mật",   3, 1, "M"),
        (D["OPS"],  "Trưởng phòng Kho Bãi",              3, 1, "M"),
        (D["OPS"],  "Trưởng phòng Điều Phối Vận Chuyển", 3, 1, "M"),
        (D["MKT"],  "Trưởng phòng Marketing Số",         3, 1, "F"),
        (D["ADM"],  "Trưởng phòng Hành Chính",           3, 1, "F"),
        (D["HAN"],  "Trưởng phòng KD Hà Nội",            3, 1, "M"),
        (D["DAD"],  "Trưởng phòng KD Đà Nẵng",           3, 1, "M"),
        # Senior Staff (L4)
        (D["HR"],   "Chuyên viên Tuyển Dụng Cao Cấp",    4, 3, "F"),
        (D["HR"],   "Chuyên viên Đào Tạo Cao Cấp",       4, 2, "F"),
        (D["HR"],   "Chuyên viên C&B Cao Cấp",           4, 2, "F"),
        (D["FIN"],  "Kế Toán Trưởng",                    4, 3, "F"),
        (D["FIN"],  "Kiểm Toán Viên Cao Cấp",            4, 2, "M"),
        (D["SALES"],"Chuyên viên KD Cao Cấp",            4, 5, "M"),
        (D["SALES"],"Key Account Manager",               4, 4, "M"),
        (D["IT"],   "Senior Developer",                  4, 5, "M"),
        (D["IT"],   "Senior DevOps Engineer",            4, 2, "M"),
        (D["IT"],   "Business Analyst Cao Cấp",          4, 3, "F"),
        (D["OPS"],  "Supervisor Kho Bãi",                4, 4, "M"),
        (D["OPS"],  "Chuyên viên Logistics Cao Cấp",     4, 4, "M"),
        (D["MKT"],  "Senior Marketing Executive",        4, 3, "F"),
        (D["LEGAL"],"Chuyên viên Pháp Lý Cao Cấp",      4, 3, "F"),
        (D["HAN"],  "Chuyên viên KD HN Cao Cấp",        4, 3, "M"),
        (D["DAD"],  "Chuyên viên KD ĐN Cao Cấp",        4, 2, "M"),
        # Staff (L5)
        (D["HR"],   "Chuyên viên Tuyển Dụng",            5, 4, "F"),
        (D["HR"],   "Chuyên viên Đào Tạo",               5, 3, "F"),
        (D["FIN"],  "Kế Toán Viên",                      5, 5, "F"),
        (D["FIN"],  "Chuyên viên Tài Chính",             5, 4, "F"),
        (D["SALES"],"Chuyên viên Kinh Doanh",            5,10, "M"),
        (D["SALES"],"Nhân viên CSKH",                   5, 6, "F"),
        (D["IT"],   "Developer",                        5, 7, "M"),
        (D["IT"],   "QC Engineer",                      5, 4, "F"),
        (D["IT"],   "System Admin",                     5, 3, "M"),
        (D["OPS"],  "Nhân viên Kho Bãi",               5, 8, "M"),
        (D["OPS"],  "Nhân viên Vận Chuyển",             5, 8, "M"),
        (D["OPS"],  "Chuyên viên Logistics",            5, 6, "M"),
        (D["MKT"],  "Marketing Executive",              5, 5, "F"),
        (D["MKT"],  "Content Creator",                  5, 3, "F"),
        (D["LEGAL"],"Chuyên viên Pháp Lý",             5, 4, "F"),
        (D["ADM"],  "Nhân viên Hành Chính",            5, 5, "F"),
        (D["ADM"],  "Lễ Tân",                          5, 3, "F"),
        (D["HAN"],  "Chuyên viên KD HN",               5, 5, "M"),
        (D["HAN"],  "Nhân viên Hỗ Trợ HN",            5, 4, "F"),
        (D["DAD"],  "Chuyên viên KD ĐN",               5, 4, "M"),
        (D["DAD"],  "Nhân viên Hỗ Trợ ĐN",            5, 3, "F"),
        (D["PLAN"], "Chuyên viên Kế Hoạch",            5, 4, "M"),
    ]

    # Expand blueprint
    used_names = set()
    emp_list = []
    for (dept, pos, lvl, cnt, g) in BLUEPRINT:
        for _ in range(cnt):
            emp_list.append((dept, pos, lvl, g))

    while len(emp_list) < 200:
        emp_list.append((D["OPS"], "Nhân viên Kho Bãi", 5, "M"))
    emp_list = emp_list[:200]

    # Sort by level so managers come before staff (important for hierarchy)
    emp_list.sort(key=lambda x: x[2])

    emps = []
    by_lvl: dict = {}

    for i, (dept, pos, lvl, g) in enumerate(emp_list):
        eid    = uid()
        gender = "Nam" if g == "M" else "Nữ"
        name   = rand_name(g, used_names)

        # Build email (safe ASCII approximation)
        ascii_name = name.lower()
        for ch, rep in [("đ","d"),("ă","a"),("â","a"),("ê","e"),("ô","o"),("ơ","o"),("ư","u"),
                        ("ị","i"),("ộ","o"),("ế","e"),("ạ","a"),("ề","e"),("ổ","o"),("ả","a"),
                        ("ợ","o"),("ụ","u"),("ứ","u"),("ự","u"),("ặ","a"),("ắ","a"),("ằ","a"),
                        ("ế","e"),("ệ","e"),("ễ","e"),("ề","e"),("ỉ","i"),("ỳ","y"),("ỵ","y"),
                        (" ",".")]:
            ascii_name = ascii_name.replace(ch, rep)
        email = ascii_name[:28] + f"{i}@itlgroup.vn"

        hire_y = rnd_int(2015 - (lvl-1)*2, 2023 - (lvl-1))
        hire_d = date(hire_y, rnd_int(1,12), rnd_int(1,28))
        tenure = round((date.today() - hire_d).days / 365.25, 1)
        exp    = max(1, int(round(tenure + rnd(1, 4))))

        perf   = rnd(65, 98) if lvl <= 2 else (rnd(55, 95) if lvl == 3 else rnd(45, 95))
        pot    = rnd(60, 95) if lvl <= 2 else (rnd(50, 90) if lvl == 3 else rnd(40, 90))
        risk   = rnd(5, 30)  if lvl <= 2 else (rnd(10, 50) if lvl == 3 else rnd(10, 65))

        # Talent tier — valid enum: "Kế thừa" | "Tiềm năng" | "Nòng cốt"
        if perf >= 80 and pot >= 75:
            tier = "Kế thừa"      # Top performers = succession candidates
        elif perf >= 65 or pot >= 65:
            tier = "Tiềm năng"    # Good potential
        else:
            tier = "Nòng cốt"     # Core / baseline

        # Readiness — valid enum: "Ready Now" | "Ready in 1 Year" | "Ready in 2 Years"
        if lvl <= 2:
            ready = "Ready Now"
        elif lvl == 3 and perf >= 80:
            ready = "Ready Now"
        elif perf >= 75:
            ready = random.choice(["Ready Now", "Ready in 1 Year"])
        elif perf >= 60:
            ready = random.choice(["Ready in 1 Year", "Ready in 2 Years"])
        else:
            ready = "Ready in 2 Years"   # No "Not Ready" in enum

        # Competency scores (0-100)
        base = perf * 0.7 + pot * 0.3
        comp_t = min(100, round(base + rnd(-10, 10), 1))
        comp_l = min(100, round(base + rnd(-15, 10), 1))
        comp_c = min(100, round(base + rnd(-10, 15), 1))
        comp_p = min(100, round(base + rnd(-10, 10), 1))
        comp_a = min(100, round(base + rnd(-10, 15), 1))

        risk_band = "Low" if risk < 30 else ("Medium" if risk < 60 else "High")
        risk_reasons = []
        if risk >= 50:
            risk_reasons = random.sample(["Thiếu mentor","KTP chưa hoàn thiện","Hiệu suất biến động","Chưa có kế hoạch kế thừa","Thâm niên thấp"], 2)

        next_pos = {1: None, 2: "Tổng Giám Đốc", 3: "Giám đốc", 4: "Trưởng phòng", 5: "Chuyên viên Cao Cấp"}.get(lvl)

        emp = {
            "id":                    eid,
            "full_name":             name,
            "email":                 email,
            "phone":                 f"09{rnd_int(10000000,99999999)}",
            "gender":                gender,
            "date_of_birth":         date(2000 - rnd_int(25,45), rnd_int(1,12), rnd_int(1,28)).isoformat(),
            "department_id":         dept,
            "position":              pos,
            "level":                 lvl,        # integer 1-5 ✓
            "hire_date":             hire_d.isoformat(),
            "tenure_years":          tenure,
            "years_of_experience":   exp,         # integer ✓
            "contract_type":         "Toàn thời gian" if tenure > 0.5 else "Thử việc",
            "talent_tier":           tier,
            "readiness_level":       ready,
            "target_position":       next_pos,
            "performance_score":     perf,
            "potential_score":       pot,
            "risk_score":            risk,
            # overall_score is GENERATED — DO NOT INSERT
            # risk_band is GENERATED — DO NOT INSERT
            "risk_reasons":          risk_reasons,
            "comp_technical":        comp_t,
            "comp_leadership":       comp_l,
            "comp_communication":    comp_c,
            "comp_problem_solving":  comp_p,
            "comp_adaptability":     comp_a,
            "comp_target_technical":      min(100, comp_t + rnd(5,20)),
            "comp_target_leadership":     min(100, comp_l + rnd(5,20)),
            "comp_target_communication":  min(100, comp_c + rnd(5,20)),
            "comp_target_problem_solving":min(100, comp_p + rnd(5,20)),
            "comp_target_adaptability":   min(100, comp_a + rnd(5,20)),
            "ktp_progress":          rnd_int(0, 100),
            "is_active":             True,
            # internal use only (not inserted)
            "_lvl":                  lvl,
            "_dept":                 dept,
        }
        emps.append(emp)
        by_lvl.setdefault(lvl, []).append(eid)

    # Pass 1: insert without reports_to_id / mentor_id
    # Strip internal fields before inserting
    insert_emps = [{k: v for k, v in e.items() if not k.startswith("_")} for e in emps]
    batch_upsert(sb, "employees", insert_emps)

    # Pass 2: wire reports_to_id and mentor_id
    print("  Wiring reports_to + mentor links...")
    mentor_pool = by_lvl.get(3, []) + by_lvl.get(2, [])

    for e in emps:
        lvl_num = e["_lvl"]
        mgr_ids = by_lvl.get(lvl_num - 1, [])
        reports_to = random.choice(mgr_ids) if mgr_ids else None
        mentor = random.choice(mentor_pool) if mentor_pool and lvl_num >= 4 else None
        if mentor == e["id"]: mentor = None
        e["_reports_to"] = reports_to
        e["_mentor"]     = mentor
        try:
            sb.table("employees").update({
                "reports_to_id": reports_to,
                "mentor_id":     mentor,
            }).eq("id", e["id"]).execute()
        except Exception:
            pass
    print(f"  ✓ reports_to + mentor wired ({len(emps)} employees)")

    # Wire department head_id (first employee of each dept at lowest level number = highest rank)
    print("  Wiring department head_id...")
    dept_heads: dict = {}
    for e in emps:
        d = e["_dept"]
        lvl_num = e["_lvl"]
        if d not in dept_heads or lvl_num < emps[next(i for i,x in enumerate(emps) if x["id"]==dept_heads[d])]["_lvl"]:
            dept_heads[d] = e["id"]
    for dept_id, head_id in dept_heads.items():
        try:
            sb.table("departments").update({"head_id": head_id}).eq("id", dept_id).execute()
        except: pass
    print(f"  ✓ {len(dept_heads)} department heads set")

    all_emp_ids  = [e["id"] for e in emps]
    mgr_ids_all  = by_lvl.get(2, []) + by_lvl.get(3, [])
    senior_ids   = by_lvl.get(3, []) + by_lvl.get(4, [])
    staff_ids    = by_lvl.get(4, []) + by_lvl.get(5, [])

    # ── STEP 4: KEY POSITIONS ───────────────────────────────────────────────
    print("\n[ 4 ] Seeding key positions...")
    KP = {}
    # Each tuple: (title, dept, critical_level, required_competencies, competency_scores)
    # competency_scores maps each competency key to a 0-100 target score.
    # Critical: 85-95  |  High: 75-87  |  Medium: 65-78
    kp_defs = [
        ("Tổng Giám Đốc",               D["BGD"],  "Critical",
         ["leadership","strategic_thinking","financial_acumen"],
         {"leadership": 92, "strategic_thinking": 90, "financial_acumen": 85}),
        ("Phó TGĐ Kinh Doanh",           D["BGD"],  "Critical",
         ["leadership","sales","negotiation"],
         {"leadership": 88, "sales": 90, "negotiation": 87}),
        ("Phó TGĐ Vận Hành",             D["BGD"],  "Critical",
         ["leadership","operations","logistics"],
         {"leadership": 88, "operations": 90, "logistics": 85}),
        ("Giám đốc Nhân Sự",             D["HR"],   "High",
         ["hrm","talent_management","leadership"],
         {"hrm": 82, "talent_management": 80, "leadership": 82}),
        ("Giám đốc Tài Chính",           D["FIN"],  "Critical",
         ["finance","compliance","leadership"],
         {"finance": 90, "compliance": 87, "leadership": 85}),
        ("Giám đốc Kinh Doanh",          D["SALES"],"High",
         ["sales","crm","leadership"],
         {"sales": 85, "crm": 80, "leadership": 80}),
        ("Giám đốc Công Nghệ",           D["IT"],   "High",
         ["technology","architecture","leadership"],
         {"technology": 85, "architecture": 82, "leadership": 78}),
        ("Giám đốc Vận Hành",            D["OPS"],  "High",
         ["operations","logistics","process_improvement"],
         {"operations": 83, "logistics": 80, "process_improvement": 78}),
        ("Giám đốc Chi Nhánh Hà Nội",   D["HAN"],  "High",
         ["leadership","sales","operations"],
         {"leadership": 82, "sales": 80, "operations": 78}),
        ("Trưởng phòng KD Quốc Tế",     D["SALES"],"Medium",
         ["international_sales","english","negotiation"],
         {"international_sales": 75, "english": 78, "negotiation": 72}),
        ("Trưởng phòng Kế Toán",        D["FIN"],  "Medium",
         ["accounting","tax","compliance"],
         {"accounting": 78, "tax": 75, "compliance": 72}),
        ("Trưởng phòng Tuyển Dụng",     D["HR"],   "Medium",
         ["recruitment","employer_branding","hrm"],
         {"recruitment": 75, "employer_branding": 70, "hrm": 72}),
        ("Trưởng phòng IT Development", D["IT"],   "Medium",
         ["software_development","agile","architecture"],
         {"software_development": 78, "agile": 75, "architecture": 72}),
        ("Trưởng phòng Kho Bãi",        D["OPS"],  "Medium",
         ["warehouse","wms","operations"],
         {"warehouse": 75, "wms": 72, "operations": 70}),
        ("Giám đốc Chiến Lược",         D["PLAN"], "High",
         ["strategy","analysis","leadership"],
         {"strategy": 85, "analysis": 82, "leadership": 80}),
    ]

    l1_ids = by_lvl.get(1, [])
    l2_ids = by_lvl.get(2, [])
    l3_ids = by_lvl.get(3, [])
    hp1 = iter(list(l1_ids)); hp2 = iter(list(l2_ids)); hp3 = iter(list(l3_ids))

    kp_rows = []
    for title, dept, crit, comps, comp_scores in kp_defs:
        pid = uid()
        KP[title] = pid
        if crit == "Critical":
            holder = next(hp1, None) or next(hp2, None)
        elif crit == "High":
            holder = next(hp2, None) or next(hp3, None)
        else:
            holder = next(hp3, None) or next(hp2, None)

        kp_rows.append({
            "id": pid,
            "title": title,
            "department_id": dept,
            "current_holder_id": holder,
            "critical_level": crit,
            # risk_level is GENERATED — DO NOT INSERT
            "required_competencies": comps,
            "competency_scores": comp_scores,
            "successor_count": 0,
            "ready_now_count": 0,
            "is_active": True,
        })
    batch_upsert(sb, "key_positions", kp_rows)

    # ── STEP 5: SUCCESSION PLANS ────────────────────────────────────────────
    print("\n[ 5 ] Seeding succession plans...")
    succ_rows = []
    candidate_pool = list(senior_ids + mgr_ids_all)
    random.shuffle(candidate_pool)
    cand_iter = iter(candidate_pool)
    pos_succ_count: dict = {}
    pos_ready_count: dict = {}

    for kp in kp_rows:
        n_successors = rnd_int(2, 3)
        used_cands = set()
        for prio in range(1, n_successors + 1):
            cand = next(cand_iter, None)
            if not cand or cand in used_cands:
                cand = random.choice(candidate_pool)
            used_cands.add(cand)
            readiness = ["Ready Now","Ready in 1 Year","Ready in 2 Years"][prio - 1]
            succ_rows.append({
                "id":          uid(),
                "position_id": kp["id"],
                "talent_id":   cand,
                "readiness":   readiness,
                "priority":    prio,
                "gap_score":   rnd_int(5, 35),
            })
            pos_succ_count[kp["id"]] = pos_succ_count.get(kp["id"], 0) + 1
            if readiness == "Ready Now":
                pos_ready_count[kp["id"]] = pos_ready_count.get(kp["id"], 0) + 1

    # Use insert (no ON CONFLICT — no unique constraint on position_id,talent_id)
    batch_insert(sb, "succession_plans", succ_rows)

    # Update successor_count + ready_now_count
    for kp in kp_rows:
        try:
            sb.table("key_positions").update({
                "successor_count": pos_succ_count.get(kp["id"], 0),
                "ready_now_count": pos_ready_count.get(kp["id"], 0),
            }).eq("id", kp["id"]).execute()
        except: pass

    # ── STEP 6: ASSESSMENT DATA ─────────────────────────────────────────────
    print("\n[ 6 ] Seeding assessment data...")
    summary_rows = []; score_rows = []; ext_rows = []
    use_cycles = [CYCLE_MID_2024, CYCLE_END_2024, CYCLE_MID_2025, CYCLE_END_2025]

    for e in emps:
        lvl_num = e["_lvl"]
        n_cycles = 4 if lvl_num <= 3 else rnd_int(2, 4)
        emp_cycles = use_cycles[-n_cycles:]

        for cyc in emp_cycles:
            base_score = e["performance_score"] / 20  # 0-100 → 0-5
            overall = round(max(1.0, min(5.0, base_score + rnd(-0.3, 0.3))), 2)

            labels = ["Cần cải thiện","Đạt","Khá","Tốt","Xuất sắc"]
            rating = labels[min(4, max(0, int(overall) - 1))]

            summary_rows.append({
                "employee_id":    e["id"],
                "cycle_id":       cyc,
                "overall_score":  overall,
                "rating_label":   rating,
                "manager_note":   random.choice([
                    "Hoàn thành tốt các mục tiêu đề ra.",
                    "Cần cải thiện kỹ năng quản lý thời gian.",
                    "Thể hiện tinh thần làm việc nhóm xuất sắc.",
                    "Đóng góp tích cực vào dự án chiến lược.",
                    "Cần phát triển thêm kỹ năng lãnh đạo.",
                ]),
                "strengths":      random.sample(["Sáng kiến","Giao tiếp","Phân tích","Lãnh đạo","Kỹ thuật","Học hỏi nhanh"], 2),
                "needs_dev":      random.sample(["Quản lý thời gian","Kỹ năng trình bày","Tư duy chiến lược","Kỹ năng đàm phán"], 2),
                "assessment_type":"kpi",
            })

            crits_for_lvl = SKILL_CRITERIA if lvl_num <= 3 else random.sample(SKILL_CRITERIA, 6)
            for crit_id in crits_for_lvl:
                base_crit = base_score + rnd(-0.5, 0.5)
                score_rows.append({
                    "employee_id":  e["id"],
                    "cycle_id":     cyc,
                    "criterion_id": crit_id,
                    "score":        round(max(1.0, min(5.0, base_crit)), 2),
                })

        # External scores (latest cycle)
        ext_rows.append({
            "employee_id":    e["id"],
            "cycle_id":       CYCLE_END_2025,
            "assessment_score": round(max(1.0, min(5.0, e["performance_score"] / 20 + rnd(-0.2, 0.2))), 2),
            "score_360":      round(max(1.0, min(5.0, e["potential_score"] / 20 + rnd(-0.3, 0.3))), 2),
            # criteria_json skipped — PostgREST schema cache issue, has DEFAULT '[]'
        })

    batch_upsert(sb, "assessment_summary", summary_rows, conflict="employee_id,cycle_id,assessment_type")
    batch_upsert(sb, "assessment_scores",  score_rows,   conflict="employee_id,cycle_id,criterion_id")
    batch_insert(sb, "external_scores",    ext_rows)

    # ── STEP 7: EMPLOYEE EXTRAS ─────────────────────────────────────────────
    print("\n[ 7 ] Seeding employee_extras...")
    projects = ["ERP Migration","WMS Upgrade","Digital Transformation","CRM Implementation","ISO Certification","Market Expansion HAN","Sustainability Initiative","AI Forecasting"]
    roles360 = ["Quản lý trực tiếp","Đồng nghiệp cùng cấp","Cấp dưới","Khách hàng nội bộ"]
    extras = []
    for e in emps:
        proj = random.choice(projects)
        a360_score = round(rnd(3.0, 5.0), 2)
        extras.append({
            "employee_id":       e["id"],
            "project_name":      proj,
            "project_type":      random.choice(["Công nghệ","Vận hành","Kinh doanh","Hành chính"]),
            "project_role":      random.choice(["Lead","Member","Sponsor","Contributor"]),
            "project_client":    random.choice(["Nội bộ","Khách hàng A","Khách hàng B","Đối tác C"]),
            "project_value":     f"{rnd_int(1,50)}B VNĐ",
            "project_status":    random.choice(["active","completed","planning"]),
            "kt_successor":      None,
            "kt_overall_progress": rnd_int(0, 100),
            "kt_items":          [],
            "a360_overall":      a360_score,
            "a360_benchmark":    5.0,
            "a360_period":       "2025",
            "a360_sources":      [{"role": r, "score": round(rnd(3.0, 5.0), 1)} for r in random.sample(roles360, 3)],
            "a360_criteria":     [
                {"label":"Lãnh đạo",    "score": round(rnd(2.5,5.0),1)},
                {"label":"Giao tiếp",   "score": round(rnd(3.0,5.0),1)},
                {"label":"Làm việc nhóm","score":round(rnd(3.0,5.0),1)},
            ],
            "a360_strengths":    random.sample(["Giải quyết vấn đề","Sáng tạo","Đáng tin cậy","Kỹ năng kỹ thuật","Hỗ trợ nhóm"], 2),
            "a360_needs_dev":    random.sample(["Kỹ năng trình bày","Quản lý ưu tiên","Tư duy chiến lược"], 1),
            "a360_manager_note": "Nhân viên có tiềm năng phát triển tốt.",
            "training_hours":    rnd_int(20, 120),
            "last_promotion_year": rnd_int(2019, 2024),
        })
    batch_upsert(sb, "employee_extras", extras, conflict="employee_id")

    # ── STEP 8: CAREER ROADMAPS ─────────────────────────────────────────────
    print("\n[ 8 ] Seeding career_roadmaps...")
    roadmap_emps = [e for e in emps if e["_lvl"] <= 4]
    roadmap_emps = random.sample(roadmap_emps, min(80, len(roadmap_emps)))
    roadmap_rows = []
    for e in roadmap_emps:
        tracks = ["expert","manager"] if random.random() > 0.5 else [random.choice(["expert","manager"])]
        for track in tracks:
            roadmap_rows.append({
                "id":                uid(),
                "employee_id":       e["id"],
                "track":             track,
                "status":            random.choice(["confirmed","draft","confirmed"]),
                "ai_summary":        f"Lộ trình phát triển {track} cho {e['full_name']} dựa trên điểm năng lực và mục tiêu tổ chức.",
                "confidence_score":  rnd_int(70, 95),   # INTEGER 0-100 ✓
                "estimated_timeline":"18-24 tháng",
                "target_position":   e.get("target_position","Cấp cao hơn"),
                "strengths":         [{"area":"Kỹ thuật","note":"Nền tảng vững chắc"},{"area":"Giao tiếp","note":"Hiệu quả"}],
                "challenges":        [{"area":"Lãnh đạo","note":"Cần phát triển thêm"}],
                "skill_gaps":        [{"skill":"Quản lý dự án","priority":"High"},{"skill":"Tư duy chiến lược","priority":"Medium"}],
                "phases":            [
                    {"phase":1,"title":"Củng cố nền tảng","duration":"6 tháng",
                     "activities":["Hoàn thiện kỹ năng hiện tại","Tham gia dự án chiến lược"],
                     "milestones":["Đạt chứng chỉ","Hoàn thành KPI"]},
                    {"phase":2,"title":"Mở rộng vai trò","duration":"12 tháng",
                     "activities":["Dẫn dắt nhóm nhỏ","Mentoring junior"],
                     "milestones":["Thăng cấp trung gian"]},
                    {"phase":3,"title":"Đảm nhận vị trí mới","duration":"6 tháng",
                     "activities":["Onboarding vị trí mới","Xây dựng team"],
                     "milestones":["Hoàn thành chuyển đổi"]},
                ],
                "generated_at":      datetime.now().isoformat(),
                "confirmed_at":      datetime.now().isoformat() if random.random() > 0.3 else None,
            })
    # career_roadmaps has UNIQUE(employee_id, track)
    batch_upsert(sb, "career_roadmaps", roadmap_rows, conflict="employee_id,track")

    # ── STEP 9: IDP PLANS + GOALS ───────────────────────────────────────────
    print("\n[ 9 ] Seeding IDP plans + goals...")
    idp_emps = random.sample(all_emp_ids, 150)
    idp_plan_rows = []
    idp_goal_rows = []
    hr_mgr = mgr_ids_all[0] if mgr_ids_all else None

    # goal_type valid enum values: "Training", "Certification", "Project", "Mentoring" (Title Case)
    GOAL_TEMPLATES = [
        ("Hoàn thành khóa học Lãnh đạo Nâng Cao","Training","leadership"),
        ("Đạt chứng chỉ PMP","Certification","technical"),
        ("Tham gia dự án chuyển đổi số","Project","technical"),
        ("Mentoring 2 nhân viên junior","Mentoring","leadership"),
        ("Hoàn thành khóa Quản lý Tài Chính","Training","technical"),
        ("Cải thiện kỹ năng thuyết trình","Training","soft_skills"),
        ("Lead 1 dự án end-to-end","Project","leadership"),
        ("Hoàn thành chứng chỉ SHRM","Certification","technical"),
        ("Nghiên cứu và đề xuất quy trình mới","Project","technical"),
        ("Tham gia hội thảo quốc tế","Training","soft_skills"),
        ("Xây dựng KPI dashboard cho team","Project","technical"),
        ("Hoàn thành khóa học Agile/Scrum","Certification","technical"),
    ]

    for emp_id in idp_emps:
        plan_id = uid()
        year    = random.choice([2025, 2026])
        progress= rnd_int(15, 90)
        status  = "Active" if year == 2025 else random.choice(["Active","Pending"])
        emp_obj = next(e for e in emps if e["id"] == emp_id)

        idp_plan_rows.append({
            "id":               plan_id,
            "employee_id":      emp_id,
            "year":             year,
            "status":           status,
            "overall_progress": progress,
            # target_position does NOT exist in DB schema
            "approved_by_l1_id": hr_mgr,
            "approved_by_l1_at": past_date(1, 0) + "T00:00:00+00:00",
        })

        goals_sample = random.sample(GOAL_TEMPLATES, rnd_int(3, 5))
        for j, (title, gtype, cat) in enumerate(goals_sample):
            g_progress = rnd_int(0, 100)
            g_status   = "Completed" if g_progress == 100 else ("In Progress" if g_progress > 0 else "Not Started")
            idp_goal_rows.append({
                "id":       uid(),
                "idp_id":   plan_id,       # FK column is idp_id ✓
                "title":    title,
                "type":     gtype,
                "category": cat,
                "deadline": future_date(12),
                "status":   g_status,
                "progress": g_progress,
                "mentor_id": None,          # optional FK to employees
            })

    batch_insert(sb, "idp_plans", idp_plan_rows)
    batch_insert(sb, "idp_goals", idp_goal_rows)

    # ── STEP 10: MENTORING PAIRS ────────────────────────────────────────────
    print("\n[10] Seeding mentoring pairs...")
    mentor_candidates = list(mgr_ids_all)
    mentee_candidates = list(staff_ids)
    random.shuffle(mentor_candidates); random.shuffle(mentee_candidates)
    mentoring_rows = []
    used_pairs = set()
    focuses = [
        "Phát triển kỹ năng lãnh đạo",
        "Nâng cao kỹ thuật chuyên môn",
        "Kỹ năng giao tiếp & thuyết trình",
        "Tư duy chiến lược",
        "Quản lý dự án",
        "Phát triển kinh doanh",
    ]

    for i in range(min(40, len(mentor_candidates), len(mentee_candidates))):
        mentor = mentor_candidates[i % len(mentor_candidates)]
        mentee = mentee_candidates[i]
        if mentor == mentee or (mentor, mentee) in used_pairs:
            continue
        used_pairs.add((mentor, mentee))
        started = past_date(2, 0)
        status = random.choice(["Active", "Active", "Completed"])

        mentoring_rows.append({
            "id":        uid(),
            "mentor_id": mentor,
            "mentee_id": mentee,
            "focus_area": random.choice(focuses),   # column is focus_area ✓
            "start_date": started,
            "end_date":   future_date(6) if status == "Active" else past_date(0, 0),
            "status":     status,
            # sessions_completed, sessions_total, next_session NOT in DB schema
        })
    batch_insert(sb, "mentoring_pairs", mentoring_rows)

    # ── STEP 11: CALIBRATION SESSIONS ──────────────────────────────────────
    print("\n[11] Seeding calibration sessions...")
    # calibration_sessions schema: id, name, cycle, department_id, status, locked_at, locked_by_id
    hr_dir_id = by_lvl.get(2, [None])[0]  # First Director as locked_by
    cal_rows = [
        {
            "id":           uid(),
            "name":         "Calibration Đánh Giá Giữa Năm 2024",
            "cycle":        "2024-mid",
            "department_id": D["HR"],
            "status":       "Completed",
            "locked_at":    "2024-06-30T17:00:00+00:00",
            "locked_by_id": hr_dir_id,
        },
        {
            "id":           uid(),
            "name":         "Calibration Đánh Giá Cuối Năm 2024",
            "cycle":        "2024-end",
            "department_id": D["HR"],
            "status":       "Completed",
            "locked_at":    "2024-12-27T17:00:00+00:00",
            "locked_by_id": hr_dir_id,
        },
        {
            "id":           uid(),
            "name":         "Calibration Đánh Giá Giữa Năm 2025",
            "cycle":        "2025-mid",
            "department_id": D["HR"],
            "status":       "In Progress",
            "locked_at":    None,
            "locked_by_id": None,
        },
    ]
    batch_insert(sb, "calibration_sessions", cal_rows)

    # ── STEP 12: AUDIT LOGS ─────────────────────────────────────────────────
    print("\n[12] Seeding audit logs...")
    # audit_logs schema: id, user_id(uuid FK user_profiles), action, entity, entity_id, old_value, new_value, created_at
    # user_id is FK to user_profiles — set null since we have no auth users
    entities  = ["employees","succession_plans","idp_plans","key_positions"]
    actions   = ["CREATE","UPDATE","VIEW","APPROVE"]
    audit_rows = []
    for i in range(60):
        entity = random.choice(entities)
        action = random.choice(actions)
        target_emp = random.choice(emps)
        ago_days = rnd_int(0, 180)
        audit_rows.append({
            "id":        uid(),
            "user_id":   None,                   # FK to auth users — null OK
            "action":    action,
            "entity":    entity,
            "entity_id": target_emp["id"],
            "old_value": None,
            "new_value": {"updated_by": "seed_script", "field": action.lower()},
            "created_at": (datetime.now() - timedelta(days=ago_days)).isoformat() + "+00:00",
        })
    batch_insert(sb, "audit_logs", audit_rows)

    print(f"\n{'='*60}")
    print("  ✅ Seed hoàn tất!")
    print(f"  Departments:      {len(dept_rows)}")
    print(f"  Employees:        {len(emps)}")
    print(f"  Key Positions:    {len(kp_rows)}")
    print(f"  Succession Plans: {len(succ_rows)}")
    print(f"  Assess Summary:   {len(summary_rows)}")
    print(f"  Assess Scores:    {len(score_rows)}")
    print(f"  External Scores:  {len(ext_rows)}")
    print(f"  Employee Extras:  {len(extras)}")
    print(f"  Career Roadmaps:  {len(roadmap_rows)}")
    print(f"  IDP Plans:        {len(idp_plan_rows)}")
    print(f"  IDP Goals:        {len(idp_goal_rows)}")
    print(f"  Mentoring Pairs:  {len(mentoring_rows)}")
    print(f"  Calibrations:     {len(cal_rows)}")
    print(f"  Audit Logs:       {len(audit_rows)}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
