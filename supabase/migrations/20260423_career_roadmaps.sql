-- ══════════════════════════════════════════════════════════════
--  career_roadmaps — AI-generated career development roadmaps
--  Run this in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS career_roadmaps (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       text        NOT NULL,
  track             text        NOT NULL CHECK (track IN ('expert', 'manager')),
  status            text        NOT NULL DEFAULT 'confirmed',

  -- AI summary block
  ai_summary        text,
  confidence_score  integer     CHECK (confidence_score BETWEEN 0 AND 100),
  estimated_timeline text,
  target_position   text,
  strengths         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  challenges        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  alternative_path  text,

  -- Tab content
  skill_gaps        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  phases            jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Audit
  generated_at      timestamptz DEFAULT now(),
  confirmed_at      timestamptz,
  confirmed_by      text,

  UNIQUE (employee_id, track)
);

-- Disable RLS for now (same pattern as other tables in this project)
ALTER TABLE career_roadmaps DISABLE ROW LEVEL SECURITY;

-- Index for fast lookup by employee
CREATE INDEX IF NOT EXISTS idx_career_roadmaps_employee
  ON career_roadmaps (employee_id);
