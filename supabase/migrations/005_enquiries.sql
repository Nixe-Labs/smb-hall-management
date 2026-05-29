-- ============================================
-- 005 · Enquiries (CRM-lite for prospective customers)
-- ============================================
-- A separate workspace from bookings. Captures every interested caller,
-- including the ones who couldn't book because the date was taken.
-- Two key uses:
--   1. If a booked party cancels, you have a list to call.
--   2. Marketing list for future ads.
--
-- Each enquiry has one primary date + 0..N alternate dates, all stored
-- in enquiry_dates so we can match against any cancelled booking range
-- with a single join.
-- ============================================

-- 1. Status enum
CREATE TYPE enquiry_status AS ENUM ('new', 'contacted', 'offered', 'converted', 'lost');

-- 2. Main enquiries table
CREATE TABLE enquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  customer_email TEXT,
  source TEXT,                    -- e.g. "Phone", "WhatsApp", "Walk-in", "Referral", "Ad"
  status enquiry_status NOT NULL DEFAULT 'new',
  notes TEXT,
  converted_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enquiries_status ON enquiries(status);
CREATE INDEX idx_enquiries_phone ON enquiries(customer_phone);
CREATE INDEX idx_enquiries_created_at ON enquiries(created_at DESC);

-- 3. Per-enquiry requested dates (primary + alternates)
CREATE TABLE enquiry_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enquiry_id UUID NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  requested_date DATE NOT NULL,
  requested_slot day_slot NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enquiry_dates_enquiry  ON enquiry_dates(enquiry_id);
CREATE INDEX idx_enquiry_dates_date     ON enquiry_dates(requested_date, requested_slot);
-- Only one primary date per enquiry
CREATE UNIQUE INDEX idx_enquiry_dates_one_primary
  ON enquiry_dates(enquiry_id) WHERE is_primary;

-- 4. RPC: match enquiries against any (start, end) range of slots
--    Used by the booking cancel modal to surface "who else asked for this date?"
CREATE OR REPLACE FUNCTION enquiries_for_range(
  p_start_date DATE, p_start_slot day_slot,
  p_end_date DATE,   p_end_slot day_slot
)
RETURNS TABLE(
  enquiry_id UUID,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  status enquiry_status,
  source TEXT,
  notes TEXT,
  requested_date DATE,
  requested_slot day_slot,
  is_primary BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
  SELECT
    e.id,
    e.customer_name,
    e.customer_phone,
    e.customer_email,
    e.status,
    e.source,
    e.notes,
    ed.requested_date,
    ed.requested_slot,
    ed.is_primary,
    e.created_at
  FROM enquiries e
  JOIN enquiry_dates ed ON ed.enquiry_id = e.id
  JOIN expand_slots(p_start_date, p_start_slot, p_end_date, p_end_slot) rs
    ON rs.slot_date = ed.requested_date AND rs.slot = ed.requested_slot
  WHERE e.status NOT IN ('converted', 'lost')
  ORDER BY ed.is_primary DESC, e.created_at DESC
$$ LANGUAGE sql STABLE;

-- 5. updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON enquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. RLS
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view enquiries"
  ON enquiries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert enquiries"
  ON enquiries FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update enquiries"
  ON enquiries FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Admin can delete enquiries"
  ON enquiries FOR DELETE TO authenticated USING (is_admin());

ALTER TABLE enquiry_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view enquiry_dates"
  ON enquiry_dates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert enquiry_dates"
  ON enquiry_dates FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update enquiry_dates"
  ON enquiry_dates FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can delete enquiry_dates"
  ON enquiry_dates FOR DELETE TO authenticated USING (is_staff_or_admin());

GRANT EXECUTE ON FUNCTION enquiries_for_range(DATE, day_slot, DATE, day_slot) TO authenticated;

NOTIFY pgrst, 'reload schema';
