-- ============================================
-- 019 · Add UPI and Bank Transfer payment methods
-- ============================================
-- The payment_method enum was {cash, cheque, online}. The owner wants to record
-- UPI and Bank Transfer distinctly. We ADD the two new values and KEEP 'online'
-- so existing advance_payments rows stay valid; the app simply stops offering
-- 'online' for new entries (it still displays correctly).
--
-- ALTER TYPE ... ADD VALUE is allowed inside a transaction on PG12+ as long as
-- the new value isn't USED in the same transaction. We only add them here (no
-- inserts/backfill), so a single migration is safe.
-- ============================================

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'upi';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'bank_transfer';
