-- ============================================
-- SMB Marriage Hall Management - Database Schema
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom Types
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'viewer');
CREATE TYPE booking_status AS ENUM ('upcoming', 'completed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'cheque', 'online');

-- ============================================
-- TABLES
-- ============================================

-- Profiles (linked to Supabase auth)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bill Categories
CREATE TABLE bill_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expense Categories
CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bank Accounts
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  account_number TEXT,
  bank_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  function_date DATE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  rent NUMERIC(12,2) NOT NULL DEFAULT 0,
  status booking_status NOT NULL DEFAULT 'upcoming',
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_function_date ON bookings(function_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_customer_name ON bookings(customer_name);

-- Advance Payments
CREATE TABLE advance_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  advance_number INTEGER NOT NULL CHECK (advance_number BETWEEN 1 AND 3),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_date DATE,
  payment_method payment_method,
  deposit_date DATE,
  deposit_account_id UUID REFERENCES bank_accounts(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id, advance_number)
);

CREATE INDEX idx_advance_payments_booking ON advance_payments(booking_id);

-- Bill Items
CREATE TABLE bill_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES bill_categories(id),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bill_items_booking ON bill_items(booking_id);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES expense_categories(id),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_booking ON expenses(booking_id);

-- Deposits
CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deposits_booking ON deposits(booking_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_staff_or_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'staff')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- TRIGGERS: updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON advance_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bill_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON deposits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bill_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON expense_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TRIGGER: Auto-create profile on signup
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'viewer'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- RLS POLICIES
-- ============================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update profiles" ON profiles FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view bookings" ON bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert bookings" ON bookings FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update bookings" ON bookings FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Admin can delete bookings" ON bookings FOR DELETE TO authenticated USING (is_admin());

-- Advance Payments
ALTER TABLE advance_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view advance_payments" ON advance_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert advance_payments" ON advance_payments FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update advance_payments" ON advance_payments FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Admin can delete advance_payments" ON advance_payments FOR DELETE TO authenticated USING (is_admin());

-- Bill Items
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view bill_items" ON bill_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert bill_items" ON bill_items FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update bill_items" ON bill_items FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Admin can delete bill_items" ON bill_items FOR DELETE TO authenticated USING (is_admin());

-- Expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view expenses" ON expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert expenses" ON expenses FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update expenses" ON expenses FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Admin can delete expenses" ON expenses FOR DELETE TO authenticated USING (is_admin());

-- Deposits
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view deposits" ON deposits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff/Admin can insert deposits" ON deposits FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());
CREATE POLICY "Staff/Admin can update deposits" ON deposits FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY "Admin can delete deposits" ON deposits FOR DELETE TO authenticated USING (is_admin());

-- Bill Categories (Admin only write)
ALTER TABLE bill_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view bill_categories" ON bill_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert bill_categories" ON bill_categories FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin can update bill_categories" ON bill_categories FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin can delete bill_categories" ON bill_categories FOR DELETE TO authenticated USING (is_admin());

-- Expense Categories (Admin only write)
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view expense_categories" ON expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert expense_categories" ON expense_categories FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin can update expense_categories" ON expense_categories FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin can delete expense_categories" ON expense_categories FOR DELETE TO authenticated USING (is_admin());

-- Bank Accounts (Admin only write)
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view bank_accounts" ON bank_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert bank_accounts" ON bank_accounts FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin can update bank_accounts" ON bank_accounts FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin can delete bank_accounts" ON bank_accounts FOR DELETE TO authenticated USING (is_admin());

-- ============================================
-- SEED DATA
-- ============================================

-- Default Bill Categories
INSERT INTO bill_categories (name, is_default, sort_order) VALUES
  ('GST Bill', true, 1),
  ('Cleaning', true, 2),
  ('EB', true, 3),
  ('Water', true, 4),
  ('Gas', true, 5),
  ('AC', true, 6),
  ('Room rent', true, 7),
  ('Generator', true, 8),
  ('Previous day', true, 9),
  ('Others', true, 10),
  ('Discount', true, 11),
  ('GST Amount', true, 12);

-- Default Expense Categories
INSERT INTO expense_categories (name, is_default, sort_order) VALUES
  ('Ladies cleaning', true, 1),
  ('Toilet cleaning', true, 2),
  ('Tractor', true, 3),
  ('Staff payments', true, 4),
  ('Cleaning materials', true, 5),
  ('Tea & food', true, 6),
  ('Septic', true, 7),
  ('Others', true, 8);

-- Default Bank Accounts
INSERT INTO bank_accounts (name) VALUES
  ('SMB AC'),
  ('Niranjana AC'),
  ('Petty Cash');

-- ============================================
-- PERMISSIONS
-- ============================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant table access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant sequence usage
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO authenticated;

-- Grant auth admin access to profiles (for signup trigger)
GRANT ALL ON public.profiles TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
