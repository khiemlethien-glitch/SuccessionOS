-- ══════════════════════════════════════════════════════════════════════════════
-- 20260429_fix_mentoring_sessions.sql
--
-- Vấn đề: migration gốc 20260428_mentoring.sql có dòng
--   initiator_id uuid REFERENCES auth.users(id)
-- → schema auth không tồn tại trên PostgreSQL nội bộ → migration fail
-- → mentoring_sessions CHƯA được tạo → PostgREST timeout khi query.
--
-- Fix:
--   1. Tạo mentoring_sessions nếu chưa có (bỏ ref sang auth.users)
--   2. Disable RLS trên cả 2 bảng (nhất quán với các bảng khác trong dev)
--   3. NOTIFY PostgREST reload schema cache
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Tạo mentoring_sessions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mentoring_sessions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pair_id          uuid        NOT NULL REFERENCES mentoring_pairs(id) ON DELETE CASCADE,
  session_date     date        NOT NULL,
  duration_minutes int         NOT NULL DEFAULT 60,
  title            text        NOT NULL,
  mentee_notes     text,
  mentor_feedback  text,
  status           text        NOT NULL DEFAULT 'pending_confirm'
                   CHECK (status IN ('pending_confirm', 'confirmed', 'auto_confirmed')),
  logged_by        text,           -- employee id (text/uuid) — no FK to avoid type conflicts
  confirmed_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentoring_sessions_pair ON mentoring_sessions(pair_id);
CREATE INDEX IF NOT EXISTS idx_mentoring_sessions_date ON mentoring_sessions(session_date);

-- ── 2. Disable RLS (nhất quán với disable_rls_dev migration) ─────────────
ALTER TABLE mentoring_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE mentoring_pairs    DISABLE ROW LEVEL SECURITY;

-- ── 3. Grant cho postgres role (role mà PostgREST dùng trên DB nội bộ) ───
GRANT ALL ON mentoring_sessions TO postgres;
GRANT ALL ON mentoring_pairs    TO postgres;

-- ── 4. Thông báo PostgREST reload schema cache ────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── Verify ────────────────────────────────────────────────────────────────
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('mentoring_pairs', 'mentoring_sessions')
ORDER BY tablename;
