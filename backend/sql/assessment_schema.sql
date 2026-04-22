-- =============================================================================
-- Assessment schema — SuccessionOS
-- Chạy trong Supabase SQL Editor (service_role hoặc sau khi disable RLS).
-- =============================================================================

-- Drop tables cũ (nếu có, với schema không tương thích) để tránh FK type mismatch.
-- CASCADE xóa luôn dependent objects (views, FKs). Dev mode — an toàn khi chưa prod.
drop table if exists public.assessment_display_config cascade;
drop table if exists public.assessment_summary        cascade;
drop table if exists public.assessment_scores         cascade;
drop table if exists public.assessment_criteria       cascade;
drop table if exists public.assessment_cycles         cascade;

-- 1. Master catalogue các tiêu chí (admin quản lý)
create table if not exists public.assessment_criteria (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  label       text not null,
  description text,
  weight      numeric not null default 0,      -- % trọng số, cố định
  category    text,                            -- core | output | soft | potential | operational | growth
  sort_order  int default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- 2. Chu kỳ đánh giá
create table if not exists public.assessment_cycles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                   -- "Chu kỳ 2024", "Q1 2024"
  type        text default 'annual',           -- annual | quarterly | mid-year
  start_date  date,
  end_date    date,
  status      text default 'closed',           -- open | closed | locked
  sort_order  int default 0,
  created_at  timestamptz default now()
);

-- 3. Điểm từng tiêu chí per employee × cycle
create table if not exists public.assessment_scores (
  employee_id   text not null,
  cycle_id      uuid not null references public.assessment_cycles(id) on delete cascade,
  criterion_id  uuid not null references public.assessment_criteria(id) on delete cascade,
  score         numeric not null check (score >= 0 and score <= 100),
  created_at    timestamptz default now(),
  primary key (employee_id, cycle_id, criterion_id)
);

-- 4. Tổng hợp + nhận xét quản lý per employee × cycle
create table if not exists public.assessment_summary (
  employee_id    text not null,
  cycle_id       uuid not null references public.assessment_cycles(id) on delete cascade,
  overall_score  numeric check (overall_score >= 0 and overall_score <= 100),
  rating_label   text,                          -- "Xuất sắc" | "Tốt" | "Trung bình" | "Cần cải thiện"
  manager_note   text,
  strengths      text[] default '{}',
  needs_dev      text[] default '{}',
  created_at     timestamptz default now(),
  primary key (employee_id, cycle_id)
);

-- 5. Global display config — tối đa 4 tiêu chí hiển thị trong talent profile
create table if not exists public.assessment_display_config (
  id              int primary key default 1,
  criterion_ids   uuid[] not null default '{}',
  updated_at      timestamptz default now(),
  constraint only_one_row check (id = 1),
  constraint max_four check (coalesce(array_length(criterion_ids, 1), 0) <= 4)
);

-- =============================================================================
-- SEED data
-- =============================================================================

-- 10 tiêu chí phổ biến (trong DB có nhiều hơn thực tế — đây là demo)
insert into public.assessment_criteria (key, label, description, weight, category, sort_order) values
  ('technical',     'Chuyên môn kỹ thuật',  'Kiến thức chuyên môn, kỹ năng nghiệp vụ cốt lõi',       40, 'core',        1),
  ('performance',   'Kết quả & Hiệu suất',  'Đạt KPI, hiệu quả thực thi công việc',                  30, 'output',      2),
  ('behavior',      'Hành vi & Thái độ',    'Thái độ làm việc, tinh thần đồng đội, văn hóa',         20, 'soft',        3),
  ('potential',     'Tiềm năng phát triển', 'Khả năng học hỏi và phát triển dài hạn',                10, 'potential',   4),
  ('attendance',    'Chuyên cần',           'Đi làm đầy đủ, đúng giờ, tuân thủ lịch',                10, 'operational', 5),
  ('innovation',    'Đổi mới sáng tạo',     'Đề xuất ý tưởng, cải tiến quy trình',                   10, 'growth',      6),
  ('leadership',    'Lãnh đạo',             'Dẫn dắt team, kèm cặp nhân sự, ra quyết định',          20, 'potential',   7),
  ('compliance',    'Tuân thủ quy trình',   'Làm đúng quy trình, báo cáo đầy đủ',                    10, 'operational', 8),
  ('collaboration', 'Hợp tác',              'Phối hợp cross-team, giao tiếp hiệu quả',               15, 'soft',        9),
  ('customer',      'Định hướng khách hàng','Đặt nhu cầu khách hàng lên đầu, giải quyết nhanh',      15, 'output',     10)
on conflict (key) do nothing;

-- Cycles
insert into public.assessment_cycles (name, type, start_date, end_date, status, sort_order) values
  ('Chu kỳ 2024',      'annual',    '2024-01-01', '2024-12-31', 'closed', 1),
  ('Q4 2024',          'quarterly', '2024-10-01', '2024-12-31', 'closed', 2),
  ('Mid-year 2024',    'mid-year',  '2024-07-01', '2024-07-15', 'closed', 3),
  ('Chu kỳ 2025',      'annual',    '2025-01-01', '2025-12-31', 'open',   4),
  ('Q1 2025',          'quarterly', '2025-01-01', '2025-03-31', 'closed', 5)
on conflict do nothing;

-- Default display config = 4 tiêu chí đầu (technical, performance, behavior, potential)
insert into public.assessment_display_config (id, criterion_ids)
  select 1, array(
    select id from public.assessment_criteria
    where key in ('technical','performance','behavior','potential')
    order by sort_order
  )
on conflict (id) do update set criterion_ids = excluded.criterion_ids;

-- =============================================================================
-- Seed demo assessments cho E001 (Nguyễn Văn Sơn — TGĐ) trong "Chu kỳ 2024"
-- Để talent profile hiển thị luôn có data test.
-- =============================================================================
do $$
declare
  cy_2024 uuid;
  cy_2025 uuid;
  c_tech uuid; c_perf uuid; c_beh uuid; c_pot uuid;
begin
  select id into cy_2024 from public.assessment_cycles where name = 'Chu kỳ 2024' limit 1;
  select id into cy_2025 from public.assessment_cycles where name = 'Chu kỳ 2025' limit 1;
  select id into c_tech  from public.assessment_criteria where key = 'technical'   limit 1;
  select id into c_perf  from public.assessment_criteria where key = 'performance' limit 1;
  select id into c_beh   from public.assessment_criteria where key = 'behavior'    limit 1;
  select id into c_pot   from public.assessment_criteria where key = 'potential'   limit 1;

  -- 2024 scores for E001
  insert into public.assessment_scores (employee_id, cycle_id, criterion_id, score) values
    ('E001', cy_2024, c_tech, 96),
    ('E001', cy_2024, c_perf, 88),
    ('E001', cy_2024, c_beh,  82),
    ('E001', cy_2024, c_pot,  85)
  on conflict do nothing;

  insert into public.assessment_summary (employee_id, cycle_id, overall_score, rating_label, manager_note, strengths, needs_dev) values
    ('E001', cy_2024, 91, 'Xuất sắc',
     'Cần quyết định nhanh về career track. Rủi ro mất người cao nếu không có lộ trình rõ. Principal Engineer là con đường phù hợp nhất.',
     array['FEA analysis ở đẳng cấp quốc tế','Đầu ra thiết kế không có lỗi major','Mentor hiệu quả'],
     array['Chưa thăng chức 4 năm','Chưa có mentor','KTP tiến độ thấp 40%'])
  on conflict (employee_id, cycle_id) do update set
    overall_score = excluded.overall_score,
    manager_note  = excluded.manager_note,
    strengths     = excluded.strengths,
    needs_dev     = excluded.needs_dev;

  -- 2025 partial scores
  insert into public.assessment_scores (employee_id, cycle_id, criterion_id, score) values
    ('E001', cy_2025, c_tech, 92),
    ('E001', cy_2025, c_perf, 90),
    ('E001', cy_2025, c_beh,  85),
    ('E001', cy_2025, c_pot,  88)
  on conflict do nothing;

  insert into public.assessment_summary (employee_id, cycle_id, overall_score, rating_label, manager_note, strengths, needs_dev) values
    ('E001', cy_2025, 89, 'Tốt',
     'Đang chu kỳ mở — đánh giá tạm thời nửa đầu năm.',
     array['Duy trì kết quả ổn định','Bắt đầu mentor 2 người mới'],
     array['Cần định hướng career track rõ ràng'])
  on conflict (employee_id, cycle_id) do update set
    overall_score = excluded.overall_score,
    manager_note  = excluded.manager_note,
    strengths     = excluded.strengths,
    needs_dev     = excluded.needs_dev;
end $$;

-- =============================================================================
-- RBAC — role trên user_profiles
-- =============================================================================
alter table if exists public.user_profiles
  add column if not exists role text default 'Admin' check (role in ('Admin','HR Manager','Line Manager','Viewer'));

-- =============================================================================
-- Disable RLS (dev mode — bật lại + viết policy trước khi production)
-- =============================================================================
alter table public.assessment_criteria       disable row level security;
alter table public.assessment_cycles         disable row level security;
alter table public.assessment_scores         disable row level security;
alter table public.assessment_summary        disable row level security;
alter table public.assessment_display_config disable row level security;
