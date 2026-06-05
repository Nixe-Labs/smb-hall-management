-- ============================================
-- 015 · Per-unit bill items (rate × quantity)
-- ============================================
-- Some line items are priced per-unit, not as a flat charge — e.g. AC at
-- ₹3,000 per hour. Billing them as a single flat number is wrong: the
-- amount depends on how many units (hours / days / pieces / plates) the
-- customer actually used.
--
-- Design — fully backward compatible:
--   * bill_categories.unit  → when set ('hour'|'day'|'piece'|'plate'),
--     the category is per-unit and default_amount is read as the RATE per
--     unit. When NULL the category stays flat exactly as before.
--   * bill_items gains unit / rate / quantity as a descriptive breakdown.
--     `amount` REMAINS the line total (rate × quantity, or the flat value),
--     so every existing aggregation — calculations.ts, the
--     bookings_payment_status view, invoice subtotals — keeps working
--     untouched. The breakdown columns only drive display.
-- ============================================

ALTER TABLE bill_categories ADD COLUMN IF NOT EXISTS unit TEXT;

ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS rate NUMERIC(12,2);
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2);

COMMENT ON COLUMN bill_categories.unit IS
  'When set (hour/day/piece/plate) the category is per-unit and default_amount is the per-unit rate. NULL = flat charge.';
COMMENT ON COLUMN bill_items.unit IS 'Snapshot of the unit at billing time; NULL for flat items.';
COMMENT ON COLUMN bill_items.rate IS 'Per-unit rate snapshot; NULL for flat items.';
COMMENT ON COLUMN bill_items.quantity IS 'Units billed (rate × quantity = amount); NULL for flat items.';

-- Seed / convert the AC line to ₹3,000 per hour.
INSERT INTO bill_categories (name, is_default, sort_order, default_amount, unit)
  SELECT 'AC', true, 16, 3000, 'hour'
  WHERE NOT EXISTS (SELECT 1 FROM bill_categories WHERE lower(name) = 'ac');

UPDATE bill_categories
  SET default_amount = 3000, unit = 'hour'
  WHERE lower(name) = 'ac';
