-- ============================================
-- 018 · Event types (managed list) + editable advance date support
-- ============================================
-- Adds a "type of event" to bookings and enquiries, driven by an
-- admin-managed catalogue (like bill_categories / expense_categories) so the
-- owner can grow the list from Settings without code changes.
--
-- The chosen type is stored as TEXT on the booking/enquiry (a snapshot of the
-- name) plus an optional free-text detail used when the "Others" type is
-- picked. Existing rows simply have NULL — nothing is modified.
-- ============================================

CREATE TABLE IF NOT EXISTS event_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  -- When true, picking this type reveals a free-text box (the "Others" case).
  is_other BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON event_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view event_types" ON event_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert event_types" ON event_types FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin can update event_types" ON event_types FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin can delete event_types" ON event_types FOR DELETE TO authenticated USING (is_admin());

-- Seed the starting catalogue
INSERT INTO event_types (name, is_other, sort_order)
SELECT v.name, v.is_other, v.sort_order
FROM (VALUES
  ('Wedding Reception', false, 1),
  ('Engagement',        false, 2),
  ('Family event',      false, 3),
  ('Corporate event',   false, 4),
  ('Others',            true,  5)
) AS v(name, is_other, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM event_types);

-- Booking + enquiry carry the selected type (name snapshot) and an optional
-- free-text detail for the "Others" case.
ALTER TABLE bookings  ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE bookings  ADD COLUMN IF NOT EXISTS event_type_other TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS event_type_other TEXT;

COMMENT ON COLUMN bookings.event_type IS 'Selected event-type name (snapshot). NULL = unspecified.';
COMMENT ON COLUMN bookings.event_type_other IS 'Free-text detail when the chosen type is the "Others" one.';
