-- ============================================
-- Mock data seed (self-contained: migrates + seeds)
-- ============================================
-- Run this in the Supabase SQL Editor. Anchored to "today" = 2026-05-27.
--
-- Section A applies migrations 002-006 idempotently — safe to run whether
-- you've applied none, some, or all of them. Section B wipes bookings +
-- enquiries (cascades to their children) and seeds mock data.
--
-- Leaves bill_categories, expense_categories, bank_accounts, profiles
-- untouched (migration 001 / your auth users stay as-is).
-- ============================================

BEGIN;

-- ============================================================================
-- SECTION A — Schema bring-up (idempotent versions of migrations 002 → 006)
-- ============================================================================

-- ---------- 002 · Half-day slot bookings ----------
DO $$ BEGIN
  CREATE TYPE day_slot AS ENUM ('morning', 'evening');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_slot day_slot;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_date   DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_slot   day_slot;

UPDATE bookings SET
  start_date = function_date, start_slot = 'morning',
  end_date   = function_date, end_slot   = 'evening'
WHERE start_date IS NULL;

ALTER TABLE bookings
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN start_slot SET NOT NULL,
  ALTER COLUMN end_date   SET NOT NULL,
  ALTER COLUMN end_slot   SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_range_valid CHECK (
    (start_date, start_slot) <= (end_date, end_slot)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_start_date ON bookings(start_date);
CREATE INDEX IF NOT EXISTS idx_bookings_end_date   ON bookings(end_date);

CREATE TABLE IF NOT EXISTS booking_slots (
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  slot_date  DATE NOT NULL,
  slot       day_slot NOT NULL,
  PRIMARY KEY (slot_date, slot)
);
CREATE INDEX IF NOT EXISTS idx_booking_slots_booking ON booking_slots(booking_id);

CREATE OR REPLACE FUNCTION expand_slots(
  s_date DATE, s_slot day_slot,
  e_date DATE, e_slot day_slot
)
RETURNS TABLE(slot_date DATE, slot day_slot) AS $$
  SELECT d::DATE, sl
  FROM generate_series(s_date, e_date, INTERVAL '1 day') d
  CROSS JOIN (VALUES ('morning'::day_slot), ('evening'::day_slot)) v(sl)
  WHERE (d::DATE > s_date OR sl >= s_slot)
    AND (d::DATE < e_date OR sl <= e_slot)
  ORDER BY d, sl
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_range_available(
  s_date DATE, s_slot day_slot,
  e_date DATE, e_slot day_slot,
  exclude_booking UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM expand_slots(s_date, s_slot, e_date, e_slot) r
    JOIN booking_slots bs
      ON bs.slot_date = r.slot_date AND bs.slot = r.slot
    WHERE exclude_booking IS NULL OR bs.booking_id <> exclude_booking
  )
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION sync_booking_slots()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM booking_slots WHERE booking_id = NEW.id;

  IF NEW.status <> 'cancelled' THEN
    INSERT INTO booking_slots (booking_id, slot_date, slot)
    SELECT NEW.id, slot_date, slot
    FROM expand_slots(NEW.start_date, NEW.start_slot, NEW.end_date, NEW.end_slot);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_booking_slots ON bookings;
CREATE TRIGGER trg_sync_booking_slots
AFTER INSERT OR UPDATE OF start_date, start_slot, end_date, end_slot, status
ON bookings
FOR EACH ROW EXECUTE FUNCTION sync_booking_slots();

INSERT INTO booking_slots (booking_id, slot_date, slot)
SELECT b.id, e.slot_date, e.slot
FROM bookings b
CROSS JOIN LATERAL expand_slots(b.start_date, b.start_slot, b.end_date, b.end_slot) e
WHERE b.status <> 'cancelled'
ON CONFLICT (slot_date, slot) DO NOTHING;

ALTER TABLE booking_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view booking_slots" ON booking_slots;
CREATE POLICY "All authenticated can view booking_slots"
  ON booking_slots FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON booking_slots FROM authenticated;
GRANT  SELECT ON booking_slots TO authenticated;
GRANT EXECUTE ON FUNCTION expand_slots(DATE, day_slot, DATE, day_slot) TO authenticated;
GRANT EXECUTE ON FUNCTION is_range_available(DATE, day_slot, DATE, day_slot, UUID) TO authenticated;

-- ---------- 003 · Advance forecast ----------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS expected_advance_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_due_date        DATE;

CREATE INDEX IF NOT EXISTS idx_bookings_advance_due_date
  ON bookings(advance_due_date)
  WHERE advance_due_date IS NOT NULL;

-- ---------- 004 · Payment status + forecast that counts deposits ----------
DROP VIEW IF EXISTS bookings_advance_forecast;
CREATE VIEW bookings_advance_forecast
WITH (security_invoker = true) AS
SELECT
  b.id,
  b.function_date,
  b.start_date,
  b.start_slot,
  b.end_date,
  b.end_slot,
  b.customer_name,
  b.customer_phone,
  b.rent,
  b.status,
  b.expected_advance_amount,
  b.advance_due_date,
  (COALESCE(adv.total, 0) + COALESCE(dep.total, 0))::NUMERIC(12,2) AS collected_advance,
  GREATEST(
    COALESCE(b.expected_advance_amount, 0) - COALESCE(adv.total, 0) - COALESCE(dep.total, 0),
    0
  )::NUMERIC(12,2) AS advance_owed
FROM bookings b
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total FROM advance_payments GROUP BY booking_id
) adv ON adv.booking_id = b.id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total FROM deposits GROUP BY booking_id
) dep ON dep.booking_id = b.id;

GRANT SELECT ON bookings_advance_forecast TO authenticated;

CREATE OR REPLACE VIEW bookings_payment_status
WITH (security_invoker = true) AS
SELECT
  b.id AS booking_id,
  b.function_date,
  b.status AS booking_status,
  b.rent,
  COALESCE(bills.total, 0)::NUMERIC(12,2) AS bill_items_total,
  COALESCE(adv.total, 0)::NUMERIC(12,2)   AS advance_paid,
  COALESCE(dep.total, 0)::NUMERIC(12,2)   AS deposit_paid,
  (b.rent + COALESCE(bills.total, 0))::NUMERIC(12,2)                              AS total_bill,
  (COALESCE(adv.total, 0) + COALESCE(dep.total, 0))::NUMERIC(12,2)                AS total_paid,
  GREATEST(
    b.rent + COALESCE(bills.total, 0) - COALESCE(adv.total, 0) - COALESCE(dep.total, 0),
    0
  )::NUMERIC(12,2) AS pending,
  CASE
    WHEN COALESCE(adv.total, 0) + COALESCE(dep.total, 0) >= b.rent + COALESCE(bills.total, 0) THEN 'paid'
    WHEN COALESCE(adv.total, 0) + COALESCE(dep.total, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS payment_status
FROM bookings b
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total FROM bill_items GROUP BY booking_id
) bills ON bills.booking_id = b.id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total FROM advance_payments GROUP BY booking_id
) adv ON adv.booking_id = b.id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total FROM deposits GROUP BY booking_id
) dep ON dep.booking_id = b.id;

GRANT SELECT ON bookings_payment_status TO authenticated;

-- ---------- 005 · Enquiries ----------
DO $$ BEGIN
  CREATE TYPE enquiry_status AS ENUM ('new', 'converted', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  customer_email TEXT,
  source TEXT,
  status enquiry_status NOT NULL DEFAULT 'new',
  notes TEXT,
  converted_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status     ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_phone      ON enquiries(customer_phone);
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON enquiries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON enquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view enquiries" ON enquiries;
DROP POLICY IF EXISTS "Staff/Admin can insert enquiries"    ON enquiries;
DROP POLICY IF EXISTS "Staff/Admin can update enquiries"    ON enquiries;
DROP POLICY IF EXISTS "Admin can delete enquiries"          ON enquiries;
CREATE POLICY "All authenticated can view enquiries" ON enquiries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert enquiries"    ON enquiries FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update enquiries"    ON enquiries FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Admin can delete enquiries"          ON enquiries FOR DELETE TO authenticated USING (is_admin());

-- ---------- 006 · Enquiry dates with full slot ranges ----------
-- Drop any previous shape of enquiry_dates (the older 005 version had different columns)
DROP FUNCTION IF EXISTS enquiries_for_range(DATE, day_slot, DATE, day_slot);
DROP TABLE    IF EXISTS enquiry_dates;

CREATE TABLE enquiry_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enquiry_id    UUID NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  function_date DATE NOT NULL,
  start_date    DATE NOT NULL,
  start_slot    day_slot NOT NULL,
  end_date      DATE NOT NULL,
  end_slot      day_slot NOT NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enquiry_dates_range_valid CHECK (
    (start_date, start_slot) <= (end_date, end_slot)
  )
);
CREATE INDEX        idx_enquiry_dates_enquiry     ON enquiry_dates(enquiry_id);
CREATE INDEX        idx_enquiry_dates_range       ON enquiry_dates(start_date, end_date);
CREATE UNIQUE INDEX idx_enquiry_dates_one_primary ON enquiry_dates(enquiry_id) WHERE is_primary;

CREATE OR REPLACE FUNCTION enquiries_for_range(
  p_start_date DATE, p_start_slot day_slot,
  p_end_date   DATE, p_end_slot   day_slot
)
RETURNS TABLE(
  enquiry_id     UUID,
  customer_name  TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  status         enquiry_status,
  source         TEXT,
  notes          TEXT,
  function_date  DATE,
  start_date     DATE,
  start_slot     day_slot,
  end_date       DATE,
  end_slot       day_slot,
  is_primary     BOOLEAN,
  created_at     TIMESTAMPTZ
) AS $$
  SELECT DISTINCT
    e.id, e.customer_name, e.customer_phone, e.customer_email,
    e.status, e.source, e.notes,
    ed.function_date, ed.start_date, ed.start_slot, ed.end_date, ed.end_slot,
    ed.is_primary, e.created_at
  FROM enquiries e
  JOIN enquiry_dates ed ON ed.enquiry_id = e.id
  WHERE e.status NOT IN ('converted', 'lost')
    AND EXISTS (
      SELECT 1
      FROM expand_slots(p_start_date, p_start_slot, p_end_date, p_end_slot) qry
      JOIN expand_slots(ed.start_date, ed.start_slot, ed.end_date, ed.end_slot) enq
        ON qry.slot_date = enq.slot_date AND qry.slot = enq.slot
    )
  ORDER BY ed.is_primary DESC, e.created_at DESC
$$ LANGUAGE sql STABLE;

ALTER TABLE enquiry_dates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view enquiry_dates" ON enquiry_dates;
DROP POLICY IF EXISTS "Staff/Admin can insert enquiry_dates"    ON enquiry_dates;
DROP POLICY IF EXISTS "Staff/Admin can update enquiry_dates"    ON enquiry_dates;
DROP POLICY IF EXISTS "Staff/Admin can delete enquiry_dates"    ON enquiry_dates;
CREATE POLICY "All authenticated can view enquiry_dates" ON enquiry_dates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert enquiry_dates"    ON enquiry_dates FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update enquiry_dates"    ON enquiry_dates FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can delete enquiry_dates"    ON enquiry_dates FOR DELETE TO authenticated USING (is_staff_or_admin());

GRANT EXECUTE ON FUNCTION enquiries_for_range(DATE, day_slot, DATE, day_slot) TO authenticated;

-- ---------- 007 · Hall-use clock times (optional, reference only) ----------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_time   TIME;

-- ---------- 009 · Enquiry lost reason ----------
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- ---------- 010 · Notification center ----------
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'info',
  title        TEXT NOT NULL,
  body         TEXT,
  entity_type  TEXT,
  entity_id    UUID,
  action_route TEXT,
  dedupe_key   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notification_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_reads;
  END IF;
END $$;

-- ---------- 011 · Role caps (2 admin, 5 staff, unlimited viewer) ----------
CREATE OR REPLACE FUNCTION enforce_role_caps()
RETURNS TRIGGER AS $$
DECLARE cnt INT;
BEGIN
  IF NEW.role = 'admin' THEN
    SELECT count(*) INTO cnt FROM profiles WHERE role = 'admin' AND id <> NEW.id;
    IF cnt >= 2 THEN RAISE EXCEPTION 'Admin limit reached — only 2 admin accounts are allowed.'; END IF;
  ELSIF NEW.role = 'staff' THEN
    SELECT count(*) INTO cnt FROM profiles WHERE role = 'staff' AND id <> NEW.id;
    IF cnt >= 5 THEN RAISE EXCEPTION 'Staff limit reached — only 5 staff accounts are allowed.'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_role_caps ON profiles;
CREATE TRIGGER trg_enforce_role_caps
BEFORE INSERT OR UPDATE OF role ON profiles
FOR EACH ROW EXECUTE FUNCTION enforce_role_caps();

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SECTION B — Wipe + seed mock data
-- ============================================================================

TRUNCATE bookings  CASCADE;  -- cascades to advance_payments, bill_items, expenses, deposits, booking_slots
TRUNCATE enquiries CASCADE;  -- cascades to enquiry_dates

-- ---------- BOOKINGS ----------
INSERT INTO bookings (
  id, function_date, customer_name, customer_phone, customer_address,
  rent, status, notes,
  start_date, start_slot, end_date, end_slot,
  expected_advance_amount, advance_due_date
) VALUES
  -- COMPLETED (history)
  ('00000001-0000-0000-0000-000000000001', '2026-02-27', 'Rajesh Kumar', '+91 9842012001', 'No 12, Ramnagar, Coimbatore',
    120000, 'completed', 'Wedding — south Indian style. Mandap setup by family.',
    '2026-02-27', 'morning', '2026-02-27', 'evening', 50000, '2026-02-15'),

  ('00000001-0000-0000-0000-000000000002', '2026-03-27', 'Priya & Arun', '+91 9842012002', '45 Gandhi Street, Tiruppur',
    150000, 'completed', 'Reception. Stage decoration by hall.',
    '2026-03-27', 'morning', '2026-03-27', 'evening', 60000, '2026-03-10'),

  ('00000001-0000-0000-0000-000000000003', '2026-04-27', 'Iyer Family', '+91 9842012003', '78 Brahmin Street, Salem',
    60000, 'completed', 'Pooja function — morning slot only.',
    '2026-04-27', 'morning', '2026-04-27', 'morning', 25000, '2026-04-15'),

  ('00000001-0000-0000-0000-000000000004', '2026-04-14', 'Kavitha Ramesh', '+91 9842012004', '32 East Avenue, Erode',
    100000, 'completed', '60th birthday celebration.',
    '2026-04-14', 'morning', '2026-04-14', 'evening', 40000, '2026-04-01'),

  -- CANCELLED
  ('00000001-0000-0000-0000-000000000005', '2026-04-25', 'Sundar Murthy', '+91 9842012005', '11 Lake View Road, Coimbatore',
    130000, 'cancelled', 'Cancelled — customer postponed indefinitely.',
    '2026-04-25', 'morning', '2026-04-25', 'evening', 50000, '2026-04-10'),

  ('00000001-0000-0000-0000-000000000006', '2026-05-20', 'Meera & Vikram', '+91 9842012006', '8 Race Course Road, Coimbatore',
    140000, 'cancelled', 'Engagement cancelled — family situation.',
    '2026-05-20', 'morning', '2026-05-20', 'evening', 50000, '2026-05-05'),

  -- UPCOMING
  ('00000001-0000-0000-0000-000000000007', '2026-05-27', 'Lakshmi Narayanan', '+91 9842012007', '21 Temple Street, Coimbatore',
    50000, 'upcoming', 'Engagement — morning slot only.',
    '2026-05-27', 'morning', '2026-05-27', 'morning', 20000, '2026-05-15'),

  ('00000001-0000-0000-0000-000000000008', '2026-05-28', 'Subramanian R', '+91 9842012008', '99 Avinashi Road, Tiruppur',
    110000, 'upcoming', 'Wedding — paid early in full to lock the date.',
    '2026-05-28', 'morning', '2026-05-28', 'evening', 50000, '2026-05-01'),

  ('00000001-0000-0000-0000-000000000009', '2026-05-30', 'Anitha & Karthik', '+91 9842012009', '17 Sungam, Coimbatore',
    220000, 'upcoming', '2-day wedding — morning of 30 to evening of 31.',
    '2026-05-30', 'morning', '2026-05-31', 'evening', 80000, '2026-05-15'),

  ('00000001-0000-0000-0000-000000000010', '2026-06-03', 'Raghavan Iyengar', '+91 9842012010', '5 Diwan Road, Erode',
    35000, 'upcoming', '80th birthday — evening slot.',
    '2026-06-03', 'evening', '2026-06-03', 'evening', 15000, '2026-05-20'),

  ('00000001-0000-0000-0000-000000000011', '2026-06-10', 'Divya Suresh', '+91 9842012011', '102 RS Puram, Coimbatore',
    130000, 'upcoming', 'Wedding.',
    '2026-06-10', 'morning', '2026-06-10', 'evening', 50000, '2026-05-30'),

  ('00000001-0000-0000-0000-000000000012', '2026-06-26', 'Bhavani Krishnan', '+91 9842012012', '4 Trichy Road, Coimbatore',
    140000, 'upcoming', 'Wedding reception.',
    '2026-06-26', 'morning', '2026-06-26', 'evening', 60000, '2026-06-15'),

  ('00000001-0000-0000-0000-000000000013', '2026-07-08', 'Sruthi Bala', '+91 9842012013', '66 New Layout, Coimbatore',
    45000, 'upcoming', 'Engagement — morning only.',
    '2026-07-08', 'morning', '2026-07-08', 'morning', 20000, '2026-06-15'),

  ('00000001-0000-0000-0000-000000000014', '2026-07-25', 'Vidya & Vishal', '+91 9842012014', '13 GN Mills, Coimbatore',
    300000, 'upcoming', '3-day wedding event — Mehendi, Wedding, Reception.',
    '2026-07-25', 'morning', '2026-07-27', 'evening', 120000, '2026-07-01'),

  ('00000001-0000-0000-0000-000000000015', '2026-08-27', 'Praveen Kumar', '+91 9842012015', '88 Mettupalayam Road, Coimbatore',
    115000, 'upcoming', 'Wedding — no forecast set yet.',
    '2026-08-27', 'morning', '2026-08-27', 'evening', NULL, NULL),

  ('00000001-0000-0000-0000-000000000016', '2026-09-15', 'Sankar Velu', '+91 9842012016', '3 Saibaba Colony, Coimbatore',
    175000, 'upcoming', 'Wedding reception.',
    '2026-09-15', 'morning', '2026-09-15', 'evening', 70000, '2026-08-30'),

  ('00000001-0000-0000-0000-000000000017', '2025-08-15', 'Murugan Pandian', '+91 9842012017', '7 Town Hall Road, Coimbatore',
    100000, 'cancelled', 'Cancelled long back. Kept for records.',
    '2025-08-15', 'morning', '2025-08-15', 'evening', 40000, '2025-08-01');

-- ---------- ADVANCE PAYMENTS ----------
INSERT INTO advance_payments (
  booking_id, advance_number, amount, payment_date, payment_method,
  deposit_date, deposit_account_id, notes
) VALUES
  ('00000001-0000-0000-0000-000000000001', 1, 20000, '2026-01-15', 'cash',   '2026-01-16', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       'Token advance'),
  ('00000001-0000-0000-0000-000000000001', 2, 20000, '2026-02-05', 'online', '2026-02-05', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       'UPI'),
  ('00000001-0000-0000-0000-000000000001', 3, 10000, '2026-02-20', 'cheque', '2026-02-22', (SELECT id FROM bank_accounts WHERE name = 'Niranjana AC'), 'Cheque #45123'),

  ('00000001-0000-0000-0000-000000000002', 1, 30000, '2026-02-10', 'cash',   '2026-02-11', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),
  ('00000001-0000-0000-0000-000000000002', 2, 30000, '2026-03-05', 'online', '2026-03-05', (SELECT id FROM bank_accounts WHERE name = 'Niranjana AC'), 'GPay'),

  ('00000001-0000-0000-0000-000000000003', 1, 25000, '2026-04-05', 'cash',   '2026-04-06', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),

  ('00000001-0000-0000-0000-000000000004', 1, 20000, '2026-03-10', 'online', '2026-03-10', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),
  ('00000001-0000-0000-0000-000000000004', 2, 20000, '2026-03-25', 'online', '2026-03-25', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),
  ('00000001-0000-0000-0000-000000000004', 3, 20000, '2026-04-10', 'cash',   '2026-04-11', (SELECT id FROM bank_accounts WHERE name = 'Niranjana AC'), 'Final advance'),

  ('00000001-0000-0000-0000-000000000005', 1, 25000, '2026-03-25', 'cash',   '2026-03-26', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       'Refund issued separately'),

  ('00000001-0000-0000-0000-000000000006', 1, 30000, '2026-04-12', 'online', '2026-04-12', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),
  ('00000001-0000-0000-0000-000000000006', 2, 20000, '2026-04-28', 'cheque', '2026-04-30', (SELECT id FROM bank_accounts WHERE name = 'Niranjana AC'), 'Cheque #45867'),

  ('00000001-0000-0000-0000-000000000007', 1, 10000, '2026-05-10', 'cash',   '2026-05-11', (SELECT id FROM bank_accounts WHERE name = 'Petty Cash'),   NULL),

  ('00000001-0000-0000-0000-000000000008', 1, 30000, '2026-04-20', 'online', '2026-04-20', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),
  ('00000001-0000-0000-0000-000000000008', 2, 20000, '2026-05-01', 'online', '2026-05-01', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),

  ('00000001-0000-0000-0000-000000000009', 1, 40000, '2026-05-05', 'online', '2026-05-05', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       'First advance'),

  ('00000001-0000-0000-0000-000000000011', 1, 30000, '2026-05-22', 'online', '2026-05-22', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),

  ('00000001-0000-0000-0000-000000000012', 1, 30000, '2026-05-15', 'cash',   '2026-05-16', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       NULL),
  ('00000001-0000-0000-0000-000000000012', 2, 30000, '2026-05-25', 'online', '2026-05-25', (SELECT id FROM bank_accounts WHERE name = 'Niranjana AC'), NULL),

  ('00000001-0000-0000-0000-000000000014', 1, 50000, '2026-05-20', 'online', '2026-05-20', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       'Booking advance'),

  ('00000001-0000-0000-0000-000000000015', 1, 20000, '2026-05-12', 'cash',   '2026-05-13', (SELECT id FROM bank_accounts WHERE name = 'Petty Cash'),   NULL);

-- ---------- BILL ITEMS (completed bookings only) ----------
INSERT INTO bill_items (booking_id, category_id, amount, notes) VALUES
  -- B01 Rajesh — totals ≈ 33,800
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'EB'),         4500, '3 days power usage'),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'Water'),      1500, NULL),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'Cleaning'),   2000, NULL),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'Gas'),         800, NULL),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'AC'),         6000, 'Full-day AC'),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'Generator'),  1500, NULL),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'Room rent'),  5000, '4 rooms'),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'GST Bill'),  12000, NULL),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'GST Amount'), 2160, '18% on GST Bill items'),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bill_categories WHERE name = 'Discount'),  -1660, 'Loyalty discount'),

  -- B02 Priya & Arun — totals ≈ 18,400
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM bill_categories WHERE name = 'EB'),         3000, NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM bill_categories WHERE name = 'Water'),      1200, NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM bill_categories WHERE name = 'Cleaning'),   2000, NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM bill_categories WHERE name = 'AC'),         5000, NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM bill_categories WHERE name = 'Generator'),  1200, NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM bill_categories WHERE name = 'GST Bill'),   6000, NULL),

  -- B03 Iyer Family — totals ≈ 8,500
  ('00000001-0000-0000-0000-000000000003', (SELECT id FROM bill_categories WHERE name = 'EB'),         1500, NULL),
  ('00000001-0000-0000-0000-000000000003', (SELECT id FROM bill_categories WHERE name = 'Cleaning'),   1500, NULL),
  ('00000001-0000-0000-0000-000000000003', (SELECT id FROM bill_categories WHERE name = 'Water'),       500, NULL),
  ('00000001-0000-0000-0000-000000000003', (SELECT id FROM bill_categories WHERE name = 'GST Bill'),   5000, NULL),

  -- B04 Kavitha — totals ≈ 22,000
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM bill_categories WHERE name = 'EB'),         3500, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM bill_categories WHERE name = 'Water'),      1000, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM bill_categories WHERE name = 'Cleaning'),   2000, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM bill_categories WHERE name = 'AC'),         5500, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM bill_categories WHERE name = 'Room rent'),  3000, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM bill_categories WHERE name = 'GST Bill'),   7000, NULL);

-- ---------- EXPENSES ----------
INSERT INTO expenses (booking_id, category_id, amount, description) VALUES
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM expense_categories WHERE name = 'Ladies cleaning'),   1000, NULL),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM expense_categories WHERE name = 'Toilet cleaning'),    500, NULL),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM expense_categories WHERE name = 'Staff payments'),    3000, '6 staff x ₹500'),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM expense_categories WHERE name = 'Tea & food'),        2000, 'Staff meals'),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM expense_categories WHERE name = 'Cleaning materials'), 800, 'Phenyl, disinfectant'),

  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM expense_categories WHERE name = 'Ladies cleaning'),   1200, NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM expense_categories WHERE name = 'Staff payments'),    3500, NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM expense_categories WHERE name = 'Tea & food'),        2500, NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM expense_categories WHERE name = 'Tractor'),           1500, 'Garbage haul'),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM expense_categories WHERE name = 'Septic'),            3000, NULL),

  ('00000001-0000-0000-0000-000000000003', (SELECT id FROM expense_categories WHERE name = 'Ladies cleaning'),    500, NULL),
  ('00000001-0000-0000-0000-000000000003', (SELECT id FROM expense_categories WHERE name = 'Staff payments'),    1500, NULL),
  ('00000001-0000-0000-0000-000000000003', (SELECT id FROM expense_categories WHERE name = 'Tea & food'),         800, NULL),

  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM expense_categories WHERE name = 'Ladies cleaning'),    800, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM expense_categories WHERE name = 'Toilet cleaning'),    400, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM expense_categories WHERE name = 'Staff payments'),    2500, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM expense_categories WHERE name = 'Cleaning materials'), 600, NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM expense_categories WHERE name = 'Others'),             400, 'Florist tip');

-- ---------- DEPOSITS (customer payments banked) ----------
INSERT INTO deposits (booking_id, bank_account_id, amount, deposit_date, notes) VALUES
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       60000, '2026-02-28', 'Balance — part 1'),
  ('00000001-0000-0000-0000-000000000001', (SELECT id FROM bank_accounts WHERE name = 'Niranjana AC'), 43800, '2026-03-01', 'Balance — part 2'),

  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       80000, '2026-03-28', NULL),
  ('00000001-0000-0000-0000-000000000002', (SELECT id FROM bank_accounts WHERE name = 'Niranjana AC'), 28400, '2026-03-29', NULL),

  ('00000001-0000-0000-0000-000000000003', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       30000, '2026-04-28', 'Customer paid balance partially'),

  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       50000, '2026-04-15', NULL),
  ('00000001-0000-0000-0000-000000000004', (SELECT id FROM bank_accounts WHERE name = 'Niranjana AC'), 12000, '2026-04-15', 'Cash balance banked'),

  ('00000001-0000-0000-0000-000000000008', (SELECT id FROM bank_accounts WHERE name = 'SMB AC'),       60000, '2026-05-10', 'Balance pre-paid');

-- ---------- ENQUIRIES ----------
INSERT INTO enquiries (
  id, customer_name, customer_phone, customer_address, customer_email,
  source, status, notes, converted_booking_id
) VALUES
  ('00000002-0000-0000-0000-000000000001', 'Vimala R',      '+91 9842030001', 'No 5, KK Pudur, Coimbatore', 'vimala.r@example.com',  'Phone',    'new',       'Wants budget quote for daughter wedding.', NULL),
  ('00000002-0000-0000-0000-000000000002', 'Mahesh A',      '+91 9842030002', 'Sundarapuram, Coimbatore',   NULL,                    'WhatsApp', 'new','Sent rate card. Awaiting reply.',          NULL),
  ('00000002-0000-0000-0000-000000000003', 'Geetha N',      '+91 9842030003', '12 NSR Road, Coimbatore',    'geetha.n@example.com',  'Walk-in',  'new',       'Asked about a 5% discount for August booking.',  NULL),
  ('00000002-0000-0000-0000-000000000004', 'Subramanian R', '+91 9842012008', '99 Avinashi Road, Tiruppur', NULL,                    'Referral', 'converted', 'Converted to booking.',                    '00000001-0000-0000-0000-000000000008'),
  ('00000002-0000-0000-0000-000000000005', 'Ramesh P',      '+91 9842030005', 'Peelamedu, Coimbatore',       NULL,                    'Phone',    'lost',      'Date clashed with Anitha & Karthik. Chose another hall.', NULL),
  ('00000002-0000-0000-0000-000000000006', 'Anandhi K',     '+91 9842030006', 'Saravanampatti, Coimbatore',  'anandhi.k@example.com', 'Ad',       'new',       'Interested in evening-only slot for housewarming.', NULL),
  ('00000002-0000-0000-0000-000000000007', 'Bhuvana S',     '+91 9842030007', 'Singanallur, Coimbatore',     NULL,                    'WhatsApp', 'new','Two date options being considered.',       NULL),
  ('00000002-0000-0000-0000-000000000008', 'Vasanthi K',    '+91 9842030008', 'Vadavalli, Coimbatore',       NULL,                    'Phone',    'new',       'Wanted same date as Sundar — try again after his cancel.', NULL),
  ('00000002-0000-0000-0000-000000000009', 'Latha M',       '+91 9842030009', 'Ganapathy, Coimbatore',       'latha.m@example.com',   'Walk-in',  'new',       'Requested 20 May morning, originally booked by Meera.', NULL);

-- ---------- ENQUIRY DATES ----------
INSERT INTO enquiry_dates (
  enquiry_id, function_date, start_date, start_slot, end_date, end_slot, is_primary, notes
) VALUES
  ('00000002-0000-0000-0000-000000000001', '2026-06-15', '2026-06-15', 'morning', '2026-06-15', 'evening', true,  NULL),

  ('00000002-0000-0000-0000-000000000002', '2026-07-20', '2026-07-20', 'morning', '2026-07-20', 'morning', true,  NULL),
  ('00000002-0000-0000-0000-000000000002', '2026-07-21', '2026-07-21', 'morning', '2026-07-21', 'morning', false, 'Backup option'),

  ('00000002-0000-0000-0000-000000000003', '2026-08-10', '2026-08-10', 'morning', '2026-08-10', 'evening', true,  NULL),

  ('00000002-0000-0000-0000-000000000004', '2026-05-28', '2026-05-28', 'morning', '2026-05-28', 'evening', true,  NULL),

  ('00000002-0000-0000-0000-000000000005', '2026-05-30', '2026-05-30', 'morning', '2026-05-30', 'morning', true,  NULL),

  ('00000002-0000-0000-0000-000000000006', '2026-07-10', '2026-07-10', 'evening', '2026-07-10', 'evening', true,  NULL),

  ('00000002-0000-0000-0000-000000000007', '2026-08-15', '2026-08-15', 'morning', '2026-08-15', 'evening', true,  NULL),
  ('00000002-0000-0000-0000-000000000007', '2026-08-22', '2026-08-22', 'morning', '2026-08-22', 'evening', false, 'Second preference'),

  -- E8 overlaps cancelled B05 date (2026-04-25)
  ('00000002-0000-0000-0000-000000000008', '2026-04-25', '2026-04-25', 'morning', '2026-04-25', 'evening', true,  NULL),

  -- E9 overlaps cancelled B06 date (2026-05-20)
  ('00000002-0000-0000-0000-000000000009', '2026-05-20', '2026-05-20', 'morning', '2026-05-20', 'morning', true,  NULL);

COMMIT;

-- ============================================
-- Sanity checks (optional — run separately after the seed)
-- ============================================
-- SELECT status, COUNT(*) FROM bookings GROUP BY status;
-- SELECT payment_status, COUNT(*) FROM bookings_payment_status GROUP BY payment_status;
-- SELECT customer_name, expected_advance_amount, collected_advance, advance_owed, advance_due_date
--   FROM bookings_advance_forecast
--   WHERE advance_due_date IS NOT NULL
--   ORDER BY advance_due_date;
-- SELECT * FROM enquiries_for_range('2026-04-25', 'morning', '2026-04-25', 'evening');
