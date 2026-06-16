-- ============================================
-- 022 · Every variable item is per-unit + a default quantity
-- ============================================
-- The owner's model: Total Bill = Rent + variable expenses, where every
-- variable expense is billed as rate × quantity (e.g. "1 room → 1 unit gas").
-- Migrations 015/021 already made AC, Generator, EB and Water per-unit. This
-- finishes the job:
--
--   1. Adds bill_categories.default_quantity — the quantity PREFILLED on a new
--      booking for a per-unit category (editable per booking). Column default 1,
--      so every existing category backfills to "1 unit". This is the owner's
--      "fixed quantity per booking, unless overridden" behaviour.
--
--   2. Converts the remaining flat standard items — Cleaning, Guest Rooms,
--      Audio, Additional Kitchen, Gas — to per-unit with the 'piece' scale
--      (shows "/unit", quantity in "units"). Their existing default_amount
--      becomes the per-unit RATE, and default_quantity = 1 keeps the standard
--      charge identical (rate × 1) while letting staff bump the quantity.
--
--   3. AC (per hour) and EB (per meter unit) are genuinely metered — there is
--      no sensible "1 unit" default. They keep default_quantity = 0 so they
--      appear on the booking present-but-unbilled until staff enter the real
--      hours / units, exactly as before.
--
-- `amount` on bill_items stays the resolved line total (rate × quantity), so
-- calculations.ts, the payment-status view and invoice subtotals are untouched.
-- Existing saved bill_items keep their stored shape — only NEW bookings pick up
-- the per-unit prefill. Run after 020 and 021.
-- ============================================

ALTER TABLE bill_categories ADD COLUMN IF NOT EXISTS default_quantity NUMERIC(12,2) DEFAULT 1;

COMMENT ON COLUMN bill_categories.default_quantity IS
  'Per-unit categories: quantity prefilled on a new booking (editable per booking). 0/NULL = present but unbilled until usage is entered. Ignored for flat categories.';

-- 2 · Convert the remaining flat standard items to per-unit (rate × quantity).
UPDATE bill_categories
  SET unit = 'piece'              -- 'piece' is the "/unit" scale (× units)
  WHERE name IN ('Cleaning', 'Guest Rooms', 'Audio', 'Additional Kitchen', 'Gas')
    AND unit IS NULL;

-- 3 · Metered items have no fixed default — bill only on entered usage.
UPDATE bill_categories
  SET default_quantity = 0
  WHERE name IN ('AC', 'EB');

NOTIFY pgrst, 'reload schema';
