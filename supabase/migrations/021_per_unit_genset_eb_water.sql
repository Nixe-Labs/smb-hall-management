-- ============================================
-- 021 · Generator, EB and Water are per-unit rates
-- ============================================
-- The owner bills these by quantity, like AC. Mark them per-unit with the
-- 'unit' scale (shows as "/unit", quantity in "units"). Their existing
-- default_amount becomes the per-unit RATE:
--   Generator ₹1,500/unit · EB ₹25/unit · Water ₹3,000/unit
--
-- The booking form already renders any category with a `unit` as a
-- rate × quantity row (prefilled with the rate, blank quantity), so these
-- only bill once the quantity is entered — no flat charge. Run after 020.
-- ============================================

UPDATE bill_categories
  SET unit = 'piece'              -- 'piece' is the "/unit" scale (× units)
  WHERE name IN ('Generator', 'EB', 'Water');

NOTIFY pgrst, 'reload schema';
