-- ============================================
-- 010 · In-app notification center
-- ============================================
-- A team-wide notifications feed with per-user read state, kept live via
-- Supabase Realtime. Notifications are generated from existing data
-- (advance forecast, upcoming functions, pending balances, open enquiries)
-- and de-duplicated by `dedupe_key`.
--
-- Phase 2 (external email/WhatsApp/push) will read from this same table via
-- an Edge Function + pg_cron — no schema change needed for that.
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         TEXT NOT NULL,                 -- advance_overdue | advance_due | upcoming_function | payment_pending | enquiry_open
  severity     TEXT NOT NULL DEFAULT 'info',  -- info | warning | urgent
  title        TEXT NOT NULL,
  body         TEXT,
  entity_type  TEXT,                          -- booking | enquiry
  entity_id    UUID,
  action_route TEXT,                          -- vue-router name to open
  dedupe_key   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Per-user read state (team-wide notifications, each user marks their own)
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view notifications" ON notifications;
DROP POLICY IF EXISTS "Staff/Admin can insert notifications"     ON notifications;
DROP POLICY IF EXISTS "Admin can delete notifications"           ON notifications;
CREATE POLICY "All authenticated can view notifications" ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert notifications"     ON notifications FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Admin can delete notifications"           ON notifications FOR DELETE TO authenticated USING (is_admin());

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own reads (select)" ON notification_reads;
DROP POLICY IF EXISTS "Users manage their own reads (insert)" ON notification_reads;
DROP POLICY IF EXISTS "Users manage their own reads (delete)" ON notification_reads;
CREATE POLICY "Users manage their own reads (select)" ON notification_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users manage their own reads (insert)" ON notification_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage their own reads (delete)" ON notification_reads FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Realtime ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notification_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_reads;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
