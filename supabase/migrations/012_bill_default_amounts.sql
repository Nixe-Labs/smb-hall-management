-- ============================================
-- 012 · Default amounts on bill categories + standard SMB items
-- ============================================
-- Adds an optional `default_amount` on bill_categories so the booking form
-- can pre-populate standard line items (Guest Rooms, Audio, etc.) that
-- staff can edit per booking. New categories are added without disturbing
-- existing seeded ones; the existing `Cleaning` category gets a default.
-- ============================================

ALTER TABLE bill_categories ADD COLUMN IF NOT EXISTS default_amount NUMERIC(12,2);

-- Standard items shown pre-filled on the booking form
INSERT INTO bill_categories (name, is_default, sort_order, default_amount)
  SELECT 'Guest Rooms', true, 13, 12000
  WHERE NOT EXISTS (SELECT 1 FROM bill_categories WHERE name = 'Guest Rooms');

INSERT INTO bill_categories (name, is_default, sort_order, default_amount)
  SELECT 'Audio', true, 14, 4000
  WHERE NOT EXISTS (SELECT 1 FROM bill_categories WHERE name = 'Audio');

INSERT INTO bill_categories (name, is_default, sort_order, default_amount)
  SELECT 'Additional Kitchen', true, 15, 3000
  WHERE NOT EXISTS (SELECT 1 FROM bill_categories WHERE name = 'Additional Kitchen');

-- Set defaults in case the rows existed without one
UPDATE bill_categories SET default_amount = 12000 WHERE name = 'Guest Rooms'        AND default_amount IS NULL;
UPDATE bill_categories SET default_amount = 4000  WHERE name = 'Audio'              AND default_amount IS NULL;
UPDATE bill_categories SET default_amount = 3000  WHERE name = 'Additional Kitchen' AND default_amount IS NULL;
UPDATE bill_categories SET default_amount = 2000  WHERE name = 'Cleaning'           AND default_amount IS NULL;

NOTIFY pgrst, 'reload schema';
