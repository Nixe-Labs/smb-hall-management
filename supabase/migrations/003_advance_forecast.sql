-- ============================================
-- 003 · Advance forecast
-- ============================================
-- Adds an "expected" side to the advance lifecycle so the dashboard can
-- forecast money still to be collected.
--
-- Both columns are nullable on purpose: a booking only enters the forecast
-- once a target amount AND due date are set. Existing bookings stay NULL
-- and are invisible to the forecast until backfilled (via the detail page
-- 'Edit forecast' modal, or directly in SQL).
-- ============================================

-- 1. Columns on bookings
ALTER TABLE bookings
  ADD COLUMN expected_advance_amount NUMERIC(12,2),
  ADD COLUMN advance_due_date        DATE;

-- Index used by the forecast query (filter on advance_due_date)
CREATE INDEX idx_bookings_advance_due_date
  ON bookings(advance_due_date)
  WHERE advance_due_date IS NOT NULL;

-- 2. View: per-booking collected vs owed
--    security_invoker = true so the view obeys the caller's RLS on the
--    underlying tables (bookings + advance_payments) instead of running
--    as the view owner.
CREATE OR REPLACE VIEW bookings_advance_forecast
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
  COALESCE(SUM(a.amount), 0)::NUMERIC(12,2) AS collected_advance,
  GREATEST(
    COALESCE(b.expected_advance_amount, 0) - COALESCE(SUM(a.amount), 0),
    0
  )::NUMERIC(12,2) AS advance_owed
FROM bookings b
LEFT JOIN advance_payments a ON a.booking_id = b.id
GROUP BY b.id;

GRANT SELECT ON bookings_advance_forecast TO authenticated;

-- Reload PostgREST schema cache so the new columns + view are visible
NOTIFY pgrst, 'reload schema';
