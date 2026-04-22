-- =============================================================================
-- SEED-ONLY script — chạy sau khi assessment_schema.sql đã tạo bảng xong.
-- Không drop/alter gì, chỉ insert. Safe chạy lại nhiều lần (on conflict do nothing).
-- =============================================================================

-- 1. Tiêu chí (10 cái)
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

-- 2. Cycles (5 cái). Nếu name đã tồn tại thì bỏ qua — vì name chưa có UNIQUE,
-- ta dùng NOT EXISTS guard thủ công.
insert into public.assessment_cycles (name, type, start_date, end_date, status, sort_order)
select v.* from (values
  ('Chu kỳ 2024'::text,      'annual'::text,    '2024-01-01'::date, '2024-12-31'::date, 'closed'::text, 1),
  ('Q4 2024',                'quarterly',       '2024-10-01',       '2024-12-31',       'closed',       2),
  ('Mid-year 2024',          'mid-year',        '2024-07-01',       '2024-07-15',       'closed',       3),
  ('Chu kỳ 2025',            'annual',          '2025-01-01',       '2025-12-31',       'open',         4),
  ('Q1 2025',                'quarterly',       '2025-01-01',       '2025-03-31',       'closed',       5)
) as v(name, type, start_date, end_date, status, sort_order)
where not exists (select 1 from public.assessment_cycles c where c.name = v.name);

-- 3. Display config — singleton, default 4 tiêu chí đầu
insert into public.assessment_display_config (id, criterion_ids)
  select 1, array(
    select id from public.assessment_criteria
    where key in ('technical','performance','behavior','potential')
    order by sort_order
  )
on conflict (id) do update set criterion_ids = excluded.criterion_ids, updated_at = now();

-- 4. Scores + summary cho TẤT CẢ employee đang active — generate random để có data demo.
-- Chỉ thêm nếu chưa có.
do $$
declare
  cy record;
  emp record;
  cri record;
  rnd_score numeric;
  overall_sum numeric;
  weight_sum numeric;
begin
  -- Chỉ seed cho 50 employees đầu tiên (để không quá nặng)
  for cy in (select id, name from public.assessment_cycles order by sort_order) loop
    for emp in (
      select id, full_name from public.v_employees
      where is_active = true
      order by id
      limit 50
    ) loop
      overall_sum := 0;
      weight_sum := 0;

      -- Insert scores cho 4 tiêu chí chính (technical, performance, behavior, potential)
      for cri in (
        select id, key, weight from public.assessment_criteria
        where key in ('technical','performance','behavior','potential')
      ) loop
        -- Điểm random 70-95
        rnd_score := 70 + floor(random() * 26);
        insert into public.assessment_scores (employee_id, cycle_id, criterion_id, score)
        values (emp.id, cy.id, cri.id, rnd_score)
        on conflict do nothing;
        overall_sum := overall_sum + rnd_score * cri.weight;
        weight_sum := weight_sum + cri.weight;
      end loop;

      -- Summary
      insert into public.assessment_summary (employee_id, cycle_id, overall_score, rating_label, manager_note, strengths, needs_dev)
      values (
        emp.id, cy.id,
        round(overall_sum / nullif(weight_sum, 0), 1),
        case
          when overall_sum / nullif(weight_sum, 0) >= 90 then 'Xuất sắc'
          when overall_sum / nullif(weight_sum, 0) >= 80 then 'Tốt'
          when overall_sum / nullif(weight_sum, 0) >= 70 then 'Trung bình'
          else 'Cần cải thiện'
        end,
        'Nhận xét tự động từ hệ thống — cần quản lý điền thêm chi tiết.',
        array['Hoàn thành KPI đúng hạn','Tinh thần trách nhiệm cao'],
        array['Cần phát triển kỹ năng lãnh đạo','Nâng cao khả năng tiếng Anh']
      )
      on conflict (employee_id, cycle_id) do nothing;
    end loop;
  end loop;
end $$;

-- Kiểm tra kết quả
select 'cycles' as table_name, count(*) from public.assessment_cycles
union all select 'criteria', count(*) from public.assessment_criteria
union all select 'scores',   count(*) from public.assessment_scores
union all select 'summary',  count(*) from public.assessment_summary
union all select 'display_config', count(*) from public.assessment_display_config;
