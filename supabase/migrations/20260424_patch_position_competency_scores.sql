-- =============================================================================
-- Migration: patch_position_competency_scores
-- Mục đích: Điền competency_scores (điểm mục tiêu 0-100) cho 15 vị trí then chốt.
--           Trước đây cột này tồn tại nhưng bị để trống → gap analysis hiện "Chưa đặt điểm".
--
-- Thang điểm:
--   Critical: 85-95  |  High: 75-87  |  Medium: 65-78
--
-- An toàn chạy lại (idempotent): UPDATE ... WHERE title = ...
-- Chạy trong Supabase SQL Editor.
-- =============================================================================

UPDATE key_positions SET competency_scores = '{"leadership":92,"strategic_thinking":90,"financial_acumen":85}'::jsonb
WHERE title = 'Tổng Giám Đốc';

UPDATE key_positions SET competency_scores = '{"leadership":88,"sales":90,"negotiation":87}'::jsonb
WHERE title = 'Phó TGĐ Kinh Doanh';

UPDATE key_positions SET competency_scores = '{"leadership":88,"operations":90,"logistics":85}'::jsonb
WHERE title = 'Phó TGĐ Vận Hành';

UPDATE key_positions SET competency_scores = '{"hrm":82,"talent_management":80,"leadership":82}'::jsonb
WHERE title = 'Giám đốc Nhân Sự';

UPDATE key_positions SET competency_scores = '{"finance":90,"compliance":87,"leadership":85}'::jsonb
WHERE title = 'Giám đốc Tài Chính';

UPDATE key_positions SET competency_scores = '{"sales":85,"crm":80,"leadership":80}'::jsonb
WHERE title = 'Giám đốc Kinh Doanh';

UPDATE key_positions SET competency_scores = '{"technology":85,"architecture":82,"leadership":78}'::jsonb
WHERE title = 'Giám đốc Công Nghệ';

UPDATE key_positions SET competency_scores = '{"operations":83,"logistics":80,"process_improvement":78}'::jsonb
WHERE title = 'Giám đốc Vận Hành';

UPDATE key_positions SET competency_scores = '{"leadership":82,"sales":80,"operations":78}'::jsonb
WHERE title = 'Giám đốc Chi Nhánh Hà Nội';

UPDATE key_positions SET competency_scores = '{"international_sales":75,"english":78,"negotiation":72}'::jsonb
WHERE title = 'Trưởng phòng KD Quốc Tế';

UPDATE key_positions SET competency_scores = '{"accounting":78,"tax":75,"compliance":72}'::jsonb
WHERE title = 'Trưởng phòng Kế Toán';

UPDATE key_positions SET competency_scores = '{"recruitment":75,"employer_branding":70,"hrm":72}'::jsonb
WHERE title = 'Trưởng phòng Tuyển Dụng';

UPDATE key_positions SET competency_scores = '{"software_development":78,"agile":75,"architecture":72}'::jsonb
WHERE title = 'Trưởng phòng IT Development';

UPDATE key_positions SET competency_scores = '{"warehouse":75,"wms":72,"operations":70}'::jsonb
WHERE title = 'Trưởng phòng Kho Bãi';

UPDATE key_positions SET competency_scores = '{"strategy":85,"analysis":82,"leadership":80}'::jsonb
WHERE title = 'Giám đốc Chiến Lược';

-- Verify
SELECT title, critical_level, competency_scores
FROM key_positions
ORDER BY critical_level DESC, title;
