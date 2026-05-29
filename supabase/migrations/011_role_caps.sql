-- ============================================
-- 011 · Role caps — max 2 admins, 5 staff, unlimited viewers
-- ============================================
-- Authoritative enforcement at the DB level: this trigger rejects any
-- INSERT or role-changing UPDATE on profiles that would exceed the caps.
-- It covers every path — in-app role changes, the signup trigger
-- (handle_new_user), and direct edits — so the limit can't be bypassed.
-- SECURITY DEFINER so the count works regardless of who triggers it.
-- ============================================

CREATE OR REPLACE FUNCTION enforce_role_caps()
RETURNS TRIGGER AS $$
DECLARE
  cnt INT;
BEGIN
  IF NEW.role = 'admin' THEN
    SELECT count(*) INTO cnt FROM profiles WHERE role = 'admin' AND id <> NEW.id;
    IF cnt >= 2 THEN
      RAISE EXCEPTION 'Admin limit reached — only 2 admin accounts are allowed.';
    END IF;
  ELSIF NEW.role = 'staff' THEN
    SELECT count(*) INTO cnt FROM profiles WHERE role = 'staff' AND id <> NEW.id;
    IF cnt >= 5 THEN
      RAISE EXCEPTION 'Staff limit reached — only 5 staff accounts are allowed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_role_caps ON profiles;
CREATE TRIGGER trg_enforce_role_caps
BEFORE INSERT OR UPDATE OF role ON profiles
FOR EACH ROW EXECUTE FUNCTION enforce_role_caps();

NOTIFY pgrst, 'reload schema';
