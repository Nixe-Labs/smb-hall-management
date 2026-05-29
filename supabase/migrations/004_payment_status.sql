-- ============================================
-- 004 · Payment status + forecast that counts deposits
-- ============================================
-- Two changes:
--
-- 1. Update bookings_advance_forecast so the "collected" side counts
--    BOTH advance_payments AND deposits. (Earlier we agreed deposits are
--    customer payments, so they should count toward the advance target.)
--
-- 2. Add bookings_payment_status: a per-booking view with total_bill,
--    total_paid, pending, and a payment_status enum-ish text.
--    Powers the PAID / partial badge on Pipeline rows.
--
-- Both views use security_invoker so the caller's RLS on the underlying
-- tables (bookings + advance_payments + deposits + bill_items) applies.
-- ============================================

-- 1. Replace bookings_advance_forecast to also include deposits
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
  SELECT booking_id, SUM(amount) AS total
  FROM advance_payments
  GROUP BY booking_id
) adv ON adv.booking_id = b.id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total
  FROM deposits
  GROUP BY booking_id
) dep ON dep.booking_id = b.id;

GRANT SELECT ON bookings_advance_forecast TO authenticated;

-- 2. New view: per-booking payment status
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
  SELECT booking_id, SUM(amount) AS total
  FROM bill_items
  GROUP BY booking_id
) bills ON bills.booking_id = b.id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total
  FROM advance_payments
  GROUP BY booking_id
) adv ON adv.booking_id = b.id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total
  FROM deposits
  GROUP BY booking_id
) dep ON dep.booking_id = b.id;

GRANT SELECT ON bookings_payment_status TO authenticated;

NOTIFY pgrst, 'reload schema';
