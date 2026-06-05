-- ============================================
-- 014 · Multiple contact numbers on bookings + enquiries
-- ============================================
-- The owner often needs more than one number for a function (the
-- person who booked, plus family / coordinator who actually pick up).
--
-- Design: the existing single `customer_phone` column stays as the
-- canonical PRIMARY number — every existing read (search, invoice,
-- treasury, reports, RPCs) keeps working untouched. We add a
-- `customer_phones` array holding ONLY the additional numbers
-- (up to 4 more, for 5 total). Nothing is migrated into the array;
-- old rows simply have an empty array.
-- ============================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_phones TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS customer_phones TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN bookings.customer_phones IS
  'Additional contact numbers (the primary stays in customer_phone). Up to 4 extras.';
COMMENT ON COLUMN enquiries.customer_phones IS
  'Additional contact numbers (the primary stays in customer_phone). Up to 4 extras.';
