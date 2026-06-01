-- ==================================================================
-- audit.sql — READ-ONLY integrity probes for the SMB hall DB
-- ==================================================================
-- Run this in the Supabase SQL editor any time you want a health
-- check. Every statement is a SELECT — no UPDATE / INSERT / DELETE
-- anywhere. Each block is annotated with what would constitute a
-- "finding" if rows come back; an empty result set means clean.
--
-- Organisation:
--   A · Bookings & slot integrity
--   B · Advance payments
--   C · Bill items
--   D · Treasury (accounts, balances, transfers)
--   E · Enquiries
--   F · Notifications
--   G · Auth / RLS surface
--   H · Cross-table sanity
-- ==================================================================


-- ============================================
-- A · BOOKINGS & SLOT INTEGRITY
-- ============================================

-- A1 · Bookings whose end is before their start (impossible range)
SELECT 'A1 · inverted booking range' AS check, id, function_date,
       start_date, start_slot, end_date, end_slot, customer_name
FROM bookings
WHERE (start_date, CASE start_slot WHEN 'morning' THEN 0 ELSE 1 END)
    > (end_date,   CASE end_slot   WHEN 'morning' THEN 0 ELSE 1 END);

-- A2 · function_date should fall within [start_date, end_date]
SELECT 'A2 · function_date outside range' AS check, id, function_date,
       start_date, end_date, customer_name
FROM bookings
WHERE function_date < start_date OR function_date > end_date;

-- A3 · Active bookings without any booking_slots rows
-- (the sync_booking_slots trigger should have created them; a missing
-- row means the trigger failed and the calendar will look free even
-- though the booking exists)
SELECT 'A3 · upcoming booking missing slots' AS check, b.id, b.function_date, b.customer_name
FROM bookings b
LEFT JOIN booking_slots bs ON bs.booking_id = b.id
WHERE b.status <> 'cancelled' AND bs.booking_id IS NULL;

-- A4 · Slot count mismatch (number of booking_slots rows ≠ expected
-- expansion of the date+slot range). Catches partial slot syncs.
WITH expected AS (
  SELECT id,
         (
           (end_date - start_date) * 2
           + CASE end_slot   WHEN 'evening' THEN 1 ELSE 0 END
           - CASE start_slot WHEN 'evening' THEN 1 ELSE 0 END
           + 1
         ) AS n
  FROM bookings
  WHERE status <> 'cancelled'
),
actual AS (
  SELECT booking_id, COUNT(*) AS n FROM booking_slots GROUP BY booking_id
)
SELECT 'A4 · slot count mismatch' AS check, e.id, e.n AS expected_slots,
       COALESCE(a.n, 0) AS actual_slots
FROM expected e LEFT JOIN actual a ON a.booking_id = e.id
WHERE e.n IS DISTINCT FROM COALESCE(a.n, 0);

-- A5 · Bookings flagged 'upcoming' but the function_date is in the past
-- (these should auto-roll to 'completed' via the migration trigger)
SELECT 'A5 · upcoming but past function_date' AS check,
       id, function_date, customer_name
FROM bookings
WHERE status = 'upcoming' AND function_date < CURRENT_DATE;

-- A6 · Cancelled bookings that still hold booking_slots (the sync
-- trigger should clear them; if any remain, that calendar slot is
-- falsely marked taken)
SELECT 'A6 · cancelled booking still has slots' AS check,
       b.id, b.customer_name, COUNT(bs.*) AS leaked_slots
FROM bookings b
JOIN booking_slots bs ON bs.booking_id = b.id
WHERE b.status = 'cancelled'
GROUP BY b.id, b.customer_name;

-- A7 · Same slot held by two bookings (the booking_slots PK should
-- prevent this, but a stale trigger could leave duplicates)
SELECT 'A7 · slot collision' AS check, slot_date, slot, COUNT(*) AS booking_count
FROM booking_slots
GROUP BY slot_date, slot
HAVING COUNT(*) > 1;


-- ============================================
-- B · ADVANCE PAYMENTS
-- ============================================

-- B1 · advance_number outside [1,3] (CHECK constraint should hold)
SELECT 'B1 · advance_number out of range' AS check, id, booking_id, advance_number
FROM advance_payments
WHERE advance_number NOT BETWEEN 1 AND 3;

-- B2 · Duplicate advance_number per booking (UNIQUE constraint
-- should hold; probe in case of a missed migration)
SELECT 'B2 · duplicate advance_number per booking' AS check,
       booking_id, advance_number, COUNT(*) AS rows
FROM advance_payments
GROUP BY booking_id, advance_number
HAVING COUNT(*) > 1;

-- B3 · Advances with amount > 0 but no deposit_account_id — these
-- silently disappear from the Treasury balance until corrected
SELECT 'B3 · advance with no receiving account' AS check,
       ap.id, ap.booking_id, b.customer_name, ap.advance_number,
       ap.amount, ap.payment_method, ap.payment_date
FROM advance_payments ap
LEFT JOIN bookings b ON b.id = ap.booking_id
WHERE ap.amount > 0 AND ap.deposit_account_id IS NULL;

-- B4 · Advances pointing at deactivated accounts (will show "Unknown"
-- on the trail and won't be selectable in dropdowns)
SELECT 'B4 · advance points at retired account' AS check,
       ap.id, ap.booking_id, ap.amount, ba.name AS account_name
FROM advance_payments ap
JOIN bank_accounts ba ON ba.id = ap.deposit_account_id
WHERE ba.is_active = false AND ap.amount > 0;

-- B5 · Negative advance amounts (shouldn't happen — refunds belong
-- elsewhere)
SELECT 'B5 · negative advance amount' AS check, id, booking_id, amount
FROM advance_payments
WHERE amount < 0;

-- B6 · Advance payment_date much later than its booking's
-- function_date (booking already happened; advance after the fact?)
SELECT 'B6 · advance recorded long after function_date' AS check,
       ap.id, ap.booking_id, b.customer_name,
       b.function_date, ap.payment_date,
       (ap.payment_date - b.function_date) AS days_after
FROM advance_payments ap
JOIN bookings b ON b.id = ap.booking_id
WHERE ap.payment_date IS NOT NULL
  AND ap.payment_date > b.function_date + INTERVAL '7 days';


-- ============================================
-- C · BILL ITEMS
-- ============================================

-- C1 · Bill items with amount = 0 (should have been deleted by the
-- sync logic; if present, the user sees a row that contributes
-- nothing)
SELECT 'C1 · zero-amount bill item' AS check, bi.id, bi.booking_id, bc.name AS category
FROM bill_items bi
JOIN bill_categories bc ON bc.id = bi.category_id
WHERE bi.amount = 0;

-- C2 · Duplicate (booking, category) pairs — the UI prevents this
-- but a direct insert could create duplicates
SELECT 'C2 · duplicate bill item per booking+category' AS check,
       booking_id, category_id, COUNT(*) AS rows
FROM bill_items
GROUP BY booking_id, category_id
HAVING COUNT(*) > 1;

-- C3 · Bill items referencing inactive categories
SELECT 'C3 · bill item with retired category' AS check,
       bi.id, bi.booking_id, bc.name AS retired_category
FROM bill_items bi
JOIN bill_categories bc ON bc.id = bi.category_id
WHERE bc.is_active = false;


-- ============================================
-- D · TREASURY (accounts, balances, transfers)
-- ============================================

-- D1 · Accounts of unknown type (should be cash|bank|wallet)
SELECT 'D1 · account with unknown type' AS check, id, name, type
FROM bank_accounts
WHERE type NOT IN ('cash', 'bank', 'wallet');

-- D2 · Multiple cash accounts — usually only one Cash on hand
-- (informational; multiple is legal but worth flagging)
SELECT 'D2 · multiple cash accounts (informational)' AS check, id, name
FROM bank_accounts
WHERE type = 'cash' AND is_active = true;

-- D3 · Accounts ending up with a negative balance — overdrawn
-- transfers, or an inflow accidentally pointed at the wrong account
SELECT 'D3 · account with negative balance' AS check,
       account_id, name, balance, inflow_total,
       transfers_in_total, transfers_out_total
FROM account_balance
WHERE balance < 0;

-- D4 · Transfers where from = to (CHECK should prevent, probe
-- defensively)
SELECT 'D4 · transfer with same from and to' AS check,
       id, amount, transfer_date, notes
FROM account_transfers
WHERE from_account_id = to_account_id;

-- D5 · Tagged transfers (source_advance_id set) whose from_account
-- doesn't match the advance's current location — chain corruption.
-- The first transfer's from should equal the advance's
-- deposit_account_id, and each subsequent from should equal the
-- previous to.
WITH chain AS (
  SELECT t.id, t.source_advance_id, t.transfer_date, t.created_at,
         t.from_account_id, t.to_account_id,
         LAG(t.to_account_id) OVER (PARTITION BY t.source_advance_id
                                    ORDER BY t.transfer_date, t.created_at) AS prev_to,
         ap.deposit_account_id AS landed_in
  FROM account_transfers t
  JOIN advance_payments ap ON ap.id = t.source_advance_id
)
SELECT 'D5 · transfer chain mismatch' AS check, id, source_advance_id,
       from_account_id, prev_to, landed_in
FROM chain
WHERE from_account_id <> COALESCE(prev_to, landed_in);

-- D6 · Transfers tagged at an advance whose deposit_account_id is
-- NULL (the chain has no anchor — UI hides Move but a direct insert
-- could create this)
SELECT 'D6 · tagged transfer with no anchor advance account' AS check,
       t.id, t.source_advance_id, ap.amount AS advance_amount
FROM account_transfers t
JOIN advance_payments ap ON ap.id = t.source_advance_id
WHERE ap.deposit_account_id IS NULL;

-- D7 · Same-day duplicate transfers between the same accounts and
-- amount (likely accidental double-tap)
SELECT 'D7 · suspected duplicate transfer (same day, same accounts, same amount)' AS check,
       from_account_id, to_account_id, transfer_date, amount, COUNT(*) AS dup_count
FROM account_transfers
GROUP BY from_account_id, to_account_id, transfer_date, amount
HAVING COUNT(*) > 1;


-- ============================================
-- E · ENQUIRIES
-- ============================================

-- E1 · Status='converted' but no converted_booking_id
SELECT 'E1 · converted enquiry missing booking link' AS check,
       id, customer_name
FROM enquiries
WHERE status = 'converted' AND converted_booking_id IS NULL;

-- E2 · converted_booking_id points at a booking that doesn't exist
-- (FK should prevent but RLS deletes could leave stale references)
SELECT 'E2 · converted enquiry references missing booking' AS check,
       e.id, e.customer_name, e.converted_booking_id
FROM enquiries e
LEFT JOIN bookings b ON b.id = e.converted_booking_id
WHERE e.converted_booking_id IS NOT NULL AND b.id IS NULL;

-- E3 · Status='lost' but no lost_reason recorded
SELECT 'E3 · lost enquiry with no reason' AS check, id, customer_name
FROM enquiries
WHERE status = 'lost' AND (lost_reason IS NULL OR lost_reason = '');

-- E4 · Enquiry with no dates rows (every enquiry should have at
-- least one preferred date)
SELECT 'E4 · enquiry with zero dates' AS check, e.id, e.customer_name, e.status
FROM enquiries e
LEFT JOIN enquiry_dates ed ON ed.enquiry_id = e.id
WHERE ed.enquiry_id IS NULL;

-- E5 · Multiple primary dates on a single enquiry (only one should
-- be flagged is_primary)
SELECT 'E5 · multiple primary dates on enquiry' AS check,
       enquiry_id, COUNT(*) AS primary_count
FROM enquiry_dates
WHERE is_primary = true
GROUP BY enquiry_id
HAVING COUNT(*) > 1;


-- ============================================
-- F · NOTIFICATIONS
-- ============================================

-- F1 · Duplicate dedupe_key (the UNIQUE index should prevent; probe
-- in case migration missed it)
SELECT 'F1 · duplicate notification dedupe_key' AS check,
       dedupe_key, COUNT(*) AS rows
FROM notifications
GROUP BY dedupe_key
HAVING COUNT(*) > 1;

-- F2 · Notifications older than 90 days still present (informational
-- — pruning is the operator's choice)
SELECT 'F2 · notifications older than 90 days (informational)' AS check, COUNT(*) AS rows
FROM notifications
WHERE created_at < now() - INTERVAL '90 days';

-- F3 · Read-receipts pointing at non-existent notifications
SELECT 'F3 · orphaned notification_read' AS check, nr.notification_id, nr.user_id
FROM notification_reads nr
LEFT JOIN notifications n ON n.id = nr.notification_id
WHERE n.id IS NULL;


-- ============================================
-- G · AUTH / RLS SURFACE
-- ============================================

-- G1 · Profiles with no role assigned
SELECT 'G1 · profile with NULL role' AS check, id, email, full_name
FROM profiles
WHERE role IS NULL;

-- G2 · Profiles flagged inactive that still have role=admin (cannot
-- be used, but suggests stale config)
SELECT 'G2 · inactive admin profile' AS check, id, email, full_name
FROM profiles
WHERE is_active = false AND role = 'admin';

-- G3 · Bookings whose created_by points at a missing profile
SELECT 'G3 · booking created_by orphan' AS check, b.id, b.customer_name, b.created_by
FROM bookings b
LEFT JOIN profiles p ON p.id = b.created_by
WHERE b.created_by IS NOT NULL AND p.id IS NULL;


-- ============================================
-- H · CROSS-TABLE SANITY
-- ============================================

-- H1 · Booking summary cross-check (rent + bill items vs the
-- payment_status view): the view's total_bill should match what
-- the client computes
SELECT 'H1 · payment_status total_bill mismatch' AS check,
       bps.booking_id, b.customer_name, bps.total_bill,
       (b.rent + COALESCE(bi.sum, 0)) AS recomputed_total
FROM bookings_payment_status bps
JOIN bookings b ON b.id = bps.booking_id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS sum FROM bill_items GROUP BY booking_id
) bi ON bi.booking_id = bps.booking_id
WHERE bps.total_bill <> (b.rent + COALESCE(bi.sum, 0));

-- H2 · pending balance should never exceed total bill
SELECT 'H2 · pending > total_bill (suspicious)' AS check,
       booking_id, total_bill, pending
FROM bookings_payment_status
WHERE pending > total_bill;

-- H3 · Bookings with status='completed' but pending > 0 — completed
-- means past, but money may still be owed; informational
SELECT 'H3 · completed booking with money owed (informational)' AS check,
       b.id, b.customer_name, b.function_date,
       bps.total_bill, bps.total_paid, bps.pending
FROM bookings b
JOIN bookings_payment_status bps ON bps.booking_id = b.id
WHERE b.function_date < CURRENT_DATE
  AND b.status <> 'cancelled'
  AND bps.pending > 0;

-- ============================================
-- END
-- ============================================
