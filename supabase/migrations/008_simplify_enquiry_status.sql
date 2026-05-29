-- ============================================
-- 008 · Simplify enquiry statuses → new / converted / lost
-- ============================================
-- Drops the CRM-style middle states (contacted, offered). Existing
-- enquiries in those states are remapped to 'new' (still active leads).
--
-- The enquiries_for_range RPC returns the enquiry_status type, so it
-- depends on the enum — we drop it before swapping the type and recreate
-- it afterwards (unchanged logic).
-- ============================================

BEGIN;

-- 1. Remap the removed statuses to 'new'
UPDATE enquiries SET status = 'new' WHERE status::text IN ('contacted', 'offered');

-- 2. Drop the dependent RPC before altering the enum
DROP FUNCTION IF EXISTS enquiries_for_range(DATE, day_slot, DATE, day_slot);

-- 3. Swap the enum to the reduced set
ALTER TYPE enquiry_status RENAME TO enquiry_status_old;
CREATE TYPE enquiry_status AS ENUM ('new', 'converted', 'lost');

ALTER TABLE enquiries ALTER COLUMN status DROP DEFAULT;
ALTER TABLE enquiries
  ALTER COLUMN status TYPE enquiry_status USING status::text::enquiry_status;
ALTER TABLE enquiries ALTER COLUMN status SET DEFAULT 'new';

DROP TYPE enquiry_status_old;

-- 4. Recreate the matching RPC against the new enum (logic unchanged)
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

GRANT EXECUTE ON FUNCTION enquiries_for_range(DATE, day_slot, DATE, day_slot) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
