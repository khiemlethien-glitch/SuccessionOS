-- =============================================================================
-- 20260424_rebuild_summary.sql
-- Rebuild assessment_summary from imported assessment_scores.
-- Chạy SAU khi import_supabase.py hoàn tất.
-- =============================================================================

-- Truncate cũ trước
TRUNCATE TABLE assessment_summary RESTART IDENTITY CASCADE;

-- Tính lại aggregate (avg score per employee × cycle)
INSERT INTO assessment_summary (employee_id, cycle_id, overall_score, rating_label, assessment_type)
SELECT
    s.employee_id,
    s.cycle_id,
    ROUND(AVG(s.score)::NUMERIC, 2)                              AS overall_score,
    CASE
        WHEN AVG(s.score) >= 90 THEN 'Xuất sắc'
        WHEN AVG(s.score) >= 75 THEN 'Tốt'
        WHEN AVG(s.score) >= 60 THEN 'Đạt'
        ELSE 'Cần cải thiện'
    END                                                          AS rating_label,
    COALESCE(cr.assessment_type, 'kpi')                         AS assessment_type
FROM assessment_scores s
JOIN assessment_criteria cr ON cr.id = s.criterion_id
GROUP BY s.employee_id, s.cycle_id, cr.assessment_type
ON CONFLICT (employee_id, cycle_id, assessment_type) DO UPDATE
    SET overall_score = EXCLUDED.overall_score,
        rating_label  = EXCLUDED.rating_label;

-- Verify
SELECT
    cy.name        AS cycle,
    COUNT(*)       AS employees_with_scores
FROM assessment_summary sm
JOIN assessment_cycles cy ON cy.id = sm.cycle_id
GROUP BY cy.name, cy.sort_order
ORDER BY cy.sort_order;
