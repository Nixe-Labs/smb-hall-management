-- ============================================
-- production_reset.sql · Wipe seed/test data for go-live
-- ============================================
-- Run this in the Supabase SQL Editor when you're ready to launch.
-- Everything is wrapped in a single transaction — to DRY-RUN first,
-- change the final `COMMIT;` to `ROLLBACK;`, run the whole file, inspect
-- the counts in the result panel, then re-run with `COMMIT;`.
--
-- WIPED (transactional / test data):
--   • bookings + advance_payments + bill_items + expenses + deposits + booking_slots
--   • enquiries + enquiry_dates
--   • notifications + notification_reads
--
-- KEPT (do NOT need to touch — production-essential):
--   • Schema, triggers, views, RLS policies, functions (every migration 001-011)
--   • Auth users + profiles (admins/staff/viewers — they keep logging in)
--   • Default lookups seeded by migration 001:
--       bill_categories, expense_categories, bank_accounts
--     These are the working catalog (GST Bill, Cleaning, EB, SMB AC, …).
--     Edit them via Settings if you want to rename, deactivate, or add.
--
-- ============================================
-- ALTERNATIVE — surgical: if you want to keep bookings/enquiries you
-- created yourself during testing and remove ONLY the rows seeded by
-- supabase/seed_mock_data.sql, comment out the two TRUNCATE statements
-- below and uncomment this block. (Seed rows use fixed-prefix UUIDs.)
-- ----
-- DELETE FROM bookings    WHERE id::text LIKE '00000001-0000-0000-0000-%';
-- DELETE FROM enquiries   WHERE id::text LIKE '00000002-0000-0000-0000-%';
-- DELETE FROM notifications;       -- generated; fine to drop
-- ============================================

BEGIN;

-- Wipes bookings AND every table FK-related to it via TRUNCATE CASCADE:
-- advance_payments, bill_items, expenses, deposits, booking_slots,
-- enquiries (FK: converted_booking_id), enquiry_dates.
TRUNCATE bookings CASCADE;

-- Notifications hold no FK to bookings/enquiries; wipe explicitly.
-- CASCADE follows notification_reads → notifications.
TRUNCATE notifications CASCADE;

-- ── Verification ─────────────────────────────────────────────
-- Transactional tables should all be 0. Profiles / default lookups
-- should be unchanged. Review the result panel before COMMIT.
SELECT 'bookings'                     AS object, COUNT(*) AS count FROM bookings
UNION ALL SELECT 'enquiries',                    COUNT(*) FROM enquiries
UNION ALL SELECT 'advance_payments',             COUNT(*) FROM advance_payments
UNION ALL SELECT 'bill_items',                   COUNT(*) FROM bill_items
UNION ALL SELECT 'expenses',                     COUNT(*) FROM expenses
UNION ALL SELECT 'deposits',                     COUNT(*) FROM deposits
UNION ALL SELECT 'booking_slots',                COUNT(*) FROM booking_slots
UNION ALL SELECT 'enquiry_dates',                COUNT(*) FROM enquiry_dates
UNION ALL SELECT 'notifications',                COUNT(*) FROM notifications
UNION ALL SELECT 'notification_reads',           COUNT(*) FROM notification_reads
UNION ALL SELECT '— profiles (kept) —',          COUNT(*) FROM profiles
UNION ALL SELECT '— bill_categories (kept) —',   COUNT(*) FROM bill_categories
UNION ALL SELECT '— expense_categories (kept) —',COUNT(*) FROM expense_categories
UNION ALL SELECT '— bank_accounts (kept) —',     COUNT(*) FROM bank_accounts;

-- If everything looks right, commit. To abort, change to ROLLBACK and re-run.
COMMIT;

-- ── After running ────────────────────────────────────────────
-- 1. Reload the app (and the PWA, if installed) — the notification center
--    will be empty until staff start using the app; client-side generation
--    will create fresh notifications from your real bookings.
-- 2. Removing TEST AUTH USERS (e.g. throwaway accounts you created during
--    testing) is done from the Supabase dashboard → Authentication → Users.
--    Deleting an auth.users row will cascade-delete the matching profile
--    via the ON DELETE CASCADE on profiles.id.
