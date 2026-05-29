-- ============================================
-- 002 · Half-day slot bookings + occupancy stats
-- ============================================
-- Adds: morning/evening slot model, range columns on bookings,
--       a denormalised booking_slots table for conflict checks
--       and occupancy stats, kept in sync by triggers.
-- Existing bookings are backfilled as full-day on their function_date.
-- ============================================

-- 1. ENUM: order matters — 'morning' < 'evening'
CREATE TYPE day_slot AS ENUM ('morning', 'evening');

-- 2. Range columns on bookings
ALTER TABLE bookings
  ADD COLUMN start_date DATE,
  ADD COLUMN start_slot day_slot,
  ADD COLUMN end_date   DATE,
  ADD COLUMN end_slot   day_slot;

-- Backfill existing rows: each existing booking occupies the full day
UPDATE bookings SET
  start_date = function_date, start_slot = 'morning',
  end_date   = function_date, end_slot   = 'evening'
WHERE start_date IS NULL;

ALTER TABLE bookings
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN start_slot SET NOT NULL,
  ALTER COLUMN end_date   SET NOT NULL,
  ALTER COLUMN end_slot   SET NOT NULL;

-- Range must be ordered: (start_date, start_slot) <= (end_date, end_slot)
ALTER TABLE bookings
  ADD CONSTRAINT bookings_range_valid CHECK (
    (start_date, start_slot) <= (end_date, end_slot)
  );

CREATE INDEX idx_bookings_start_date ON bookings(start_date);
CREATE INDEX idx_bookings_end_date   ON bookings(end_date);

-- 3. Denormalised slot occupancy (source of truth for conflicts + stats)
CREATE TABLE booking_slots (
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  slot_date  DATE NOT NULL,
  slot       day_slot NOT NULL,
  PRIMARY KEY (slot_date, slot)
);
CREATE INDEX idx_booking_slots_booking ON booking_slots(booking_id);

-- 4. Helper: enumerate all (date, slot) pairs covered by a range
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

-- 5. Helper: live availability check for a proposed range
--    Pass exclude_booking when editing an existing booking
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

-- 6. Trigger: keep booking_slots in sync with bookings
--    Cancelled bookings free their slots automatically.
--    SECURITY DEFINER lets the trigger bypass RLS on booking_slots so we can
--    block direct writes from authenticated users.
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

CREATE TRIGGER trg_sync_booking_slots
AFTER INSERT OR UPDATE OF start_date, start_slot, end_date, end_slot, status
ON bookings
FOR EACH ROW EXECUTE FUNCTION sync_booking_slots();

-- 7. Backfill booking_slots from existing (non-cancelled) bookings
INSERT INTO booking_slots (booking_id, slot_date, slot)
SELECT b.id, e.slot_date, e.slot
FROM bookings b
CROSS JOIN LATERAL expand_slots(b.start_date, b.start_slot, b.end_date, b.end_slot) e
WHERE b.status <> 'cancelled'
ON CONFLICT (slot_date, slot) DO NOTHING;

-- 8. RLS — read-only for authenticated; writes only via trigger
ALTER TABLE booking_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view booking_slots"
  ON booking_slots FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON booking_slots FROM authenticated;
GRANT  SELECT ON booking_slots TO authenticated;

GRANT EXECUTE ON FUNCTION expand_slots(DATE, day_slot, DATE, day_slot) TO authenticated;
GRANT EXECUTE ON FUNCTION is_range_available(DATE, day_slot, DATE, day_slot, UUID) TO authenticated;

-- Reload PostgREST schema cache so the new columns/RPCs are visible
NOTIFY pgrst, 'reload schema';
