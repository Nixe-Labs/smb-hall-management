-- ============================================
-- 016 · Add 'afternoon' as a third bookable slot
-- ============================================
-- The hall can be booked for a morning, afternoon, OR evening function, so the
-- day_slot enum grows from {morning, evening} to {morning, afternoon, evening}.
--
-- IMPORTANT — run this migration ON ITS OWN (separate transaction):
--   * Postgres forbids USING a freshly-added enum value in the same
--     transaction that adds it. Migration 017 (which writes 'afternoon' rows
--     into booking_slots) therefore lives in a separate file and must run
--     AFTER this one has committed.
--   * If applying by hand in the Supabase SQL editor, execute THIS file first,
--     then 017 as a second, separate run — do not paste them together.
--
-- Ordering matters: AFTER 'morning' places it between morning and evening so
-- the existing range constraint (start_slot <= end_slot) keeps working
-- (morning < afternoon < evening).
-- ============================================

ALTER TYPE day_slot ADD VALUE IF NOT EXISTS 'afternoon' AFTER 'morning';
