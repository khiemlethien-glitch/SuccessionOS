-- ══════════════════════════════════════════════════════════════════════════════
-- Mentoring feature — two new standalone tables
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mentoring_pairs (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id        text NOT NULL REFERENCES employees(id),
  mentee_id        text NOT NULL REFERENCES employees(id),
  skills           text[] NOT NULL DEFAULT '{}',       -- criterion keys
  skill_labels     text[] NOT NULL DEFAULT '{}',       -- human labels
  status           text NOT NULL DEFAULT 'pending_mentor'
                   CHECK (status IN ('pending_mentor','pending_lm','pending_hr','active','completed','rejected','cancelled')),
  initiated_by     text NOT NULL DEFAULT 'mentee'
                   CHECK (initiated_by IN ('mentee','lm','hr')),
  initiator_id     uuid REFERENCES auth.users(id),
  start_date       date,
  duration_months  int DEFAULT 6,
  monthly_hours    int DEFAULT 8,
  goals            text,
  justification    text,
  reject_reason    text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  CONSTRAINT no_self_mentoring CHECK (mentor_id <> mentee_id)
);

CREATE TABLE IF NOT EXISTS mentoring_sessions (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pair_id          uuid NOT NULL REFERENCES mentoring_pairs(id) ON DELETE CASCADE,
  session_date     date NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60,
  title            text NOT NULL,
  mentee_notes     text,
  mentor_feedback  text,
  status           text NOT NULL DEFAULT 'pending_confirm'
                   CHECK (status IN ('pending_confirm','confirmed','auto_confirmed')),
  logged_by        text REFERENCES employees(id),
  confirmed_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentoring_pairs_mentor  ON mentoring_pairs(mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentoring_pairs_mentee  ON mentoring_pairs(mentee_id);
CREATE INDEX IF NOT EXISTS idx_mentoring_pairs_status  ON mentoring_pairs(status);
CREATE INDEX IF NOT EXISTS idx_mentoring_sessions_pair ON mentoring_sessions(pair_id);

-- ── RLS policies ──────────────────────────────────────────────────────────────
ALTER TABLE mentoring_pairs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentoring_sessions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all pairs (frontend will filter by role)
CREATE POLICY "mentoring_pairs_read" ON mentoring_pairs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mentoring_pairs_insert" ON mentoring_pairs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "mentoring_pairs_update" ON mentoring_pairs
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "mentoring_sessions_read" ON mentoring_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mentoring_sessions_insert" ON mentoring_sessions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "mentoring_sessions_update" ON mentoring_sessions
  FOR UPDATE TO authenticated USING (true);
