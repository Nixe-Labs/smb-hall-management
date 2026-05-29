-- ============================================
-- 006 · Enquiry dates as full slot ranges
-- ============================================
-- Aligns enquiry date entries with the booking model: each requested
-- entry now has a function_date + (start_date, start_slot) → (end_date, end_slot)
-- range, so customers can ask for things like "18 evening to 19 morning"
-- and we can match against booked ranges using slot intersection.
--
-- Wipes existing enquiry rows (user opted in — no real data yet).
-- ============================================

-- Drop the old function and the dates table
DROP FUNCTION IF EXISTS enquiries_for_range(DATE, day_slot, DATE, day_slot);
DROP TABLE  IF EXISTS enquiry_dates;

-- Wipe any orphan enquiry rows so the new schema starts clean
TRUNCATE enquiries CASCADE;

-- Recreate enquiry_dates with full range fields
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

CREATE INDEX idx_enquiry_dates_enquiry  ON enquiry_dates(enquiry_id);
CREATE INDEX idx_enquiry_dates_range    ON enquiry_dates(start_date, end_date);
CREATE UNIQUE INDEX idx_enquiry_dates_one_primary
  ON enquiry_dates(enquiry_id) WHERE is_primary;

-- New matching RPC: an enquiry matches the query range if their
-- expanded slot lists intersect on at least one (date, slot) pair.
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
    e.id,
    e.customer_name,
    e.customer_phone,
    e.customer_email,
    e.status,
    e.source,
    e.notes,
    ed.function_date,
    ed.start_date,
    ed.start_slot,
    ed.end_date,
    ed.end_slot,
    ed.is_primary,
    e.created_at
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

-- RLS on the new dates table
ALTER TABLE enquiry_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view enquiry_dates"
  ON enquiry_dates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert enquiry_dates"
  ON enquiry_dates FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update enquiry_dates"
  ON enquiry_dates FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can delete enquiry_dates"
  ON enquiry_dates FOR DELETE TO authenticated USING (is_staff_or_admin());

GRANT EXECUTE ON FUNCTION enquiries_for_range(DATE, day_slot, DATE, day_slot) TO authenticated;

NOTIFY pgrst, 'reload schema';
