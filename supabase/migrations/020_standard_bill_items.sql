-- ============================================
-- 020 · Lock in the standard bill-items set
-- ============================================
-- The owner's fixed standard table on every booking:
--   Cleaning, Guest Rooms, Audio, Additional Kitchen, AC, Gas, Water, EB, Generator
--
-- A category auto-fills on a new booking when it's ACTIVE and has a
-- default_amount set. This migration guarantees all nine qualify:
--   * insert any that are missing (with the amount shown in the form),
--   * make sure they're active (un-retire if needed),
--   * fill a default ONLY where one isn't already set — never overwriting an
--     amount the owner has tuned in Settings.
-- AC's unit (per-unit, from migration 015) is left untouched; COALESCE keeps
-- its existing rate.
-- ============================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('Cleaning',           20000, 2),
      ('Guest Rooms',        12000, 13),
      ('Audio',               4000, 14),
      ('Additional Kitchen',  3000, 15),
      ('AC',                  3000, 6),
      ('Gas',                 2500, 5),
      ('Water',               3000, 4),
      ('EB',                    25, 3),
      ('Generator',           1500, 8)
    ) AS v(name, amt, sort_order)
  LOOP
    IF EXISTS (SELECT 1 FROM bill_categories WHERE name = rec.name) THEN
      UPDATE bill_categories
        SET is_active = true,
            default_amount = COALESCE(default_amount, rec.amt)
        WHERE name = rec.name;
    ELSE
      INSERT INTO bill_categories (name, is_default, is_active, sort_order, default_amount)
      VALUES (rec.name, true, true, rec.sort_order, rec.amt);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
