-- ============================================
-- 009 · Enquiry lost reason
-- ============================================
-- Optional free-text note explaining why an enquiry was marked lost
-- (e.g. "chose another hall", "budget too high", "date taken").
-- Nullable; cleared automatically when status moves away from 'lost'.
-- ============================================

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS lost_reason TEXT;

NOTIFY pgrst, 'reload schema';
