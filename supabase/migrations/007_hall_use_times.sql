-- ============================================
-- 007 · Hall-use clock times (optional, reference only)
-- ============================================
-- Adds an optional start/end clock time to a booking's hall-use period.
-- These are recorded for reference and shown on the booking, invoice,
-- list and calendar — they do NOT affect availability or conflict
-- detection, which stays on the morning/evening half-day slot model.
--
-- Both columns are nullable: a booking can be saved without times.
-- ============================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_time   TIME;

-- Reload PostgREST schema cache so the new columns are visible
NOTIFY pgrst, 'reload schema';
