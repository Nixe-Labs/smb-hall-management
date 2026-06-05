-- ============================================
-- 017 · Teach the availability engine about the afternoon slot
-- ============================================
-- Run AFTER 016 has committed (see the note in 016 — the new enum value can't
-- be used in the same transaction it was added in).
--
-- Two parts:
--   1. expand_slots() previously hard-coded (morning, evening). Rewrite it to
--      enumerate WHATEVER values exist in the day_slot enum, so it's correct
--      now and future-proof if a fourth slot is ever added. is_range_available,
--      enquiries_for_range and the sync trigger all call expand_slots(), so
--      they inherit afternoon-awareness automatically — no other changes.
--   2. Re-expand booking_slots for every active booking. Existing full-day
--      (morning→evening) bookings were expanded under the OLD 2-slot rule, so
--      they occupy only morning+evening — NOT afternoon. Without this backfill
--      an "Afternoon only" booking could be accepted on a date that's already
--      booked all day. This rewrites occupancy so spanning ranges claim the
--      afternoon slot too.
-- ============================================

-- 1. Enum-agnostic slot enumeration
CREATE OR REPLACE FUNCTION expand_slots(
  s_date DATE, s_slot day_slot,
  e_date DATE, e_slot day_slot
)
RETURNS TABLE(slot_date DATE, slot day_slot) AS $$
  SELECT d::DATE, sl
  FROM generate_series(s_date, e_date, INTERVAL '1 day') d
  CROSS JOIN unnest(enum_range(NULL::day_slot)) AS sl
  WHERE (d::DATE > s_date OR sl >= s_slot)
    AND (d::DATE < e_date OR sl <= e_slot)
  ORDER BY d, sl
$$ LANGUAGE sql STABLE;

-- 2. Re-expand existing occupancy under the new 3-slot rule
DELETE FROM booking_slots;
INSERT INTO booking_slots (booking_id, slot_date, slot)
SELECT b.id, e.slot_date, e.slot
FROM bookings b
CROSS JOIN LATERAL expand_slots(b.start_date, b.start_slot, b.end_date, b.end_slot) e
WHERE b.status <> 'cancelled'
ON CONFLICT (slot_date, slot) DO NOTHING;
