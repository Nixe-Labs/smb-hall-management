-- ============================================
-- 013 · Treasury: account types, transfers, balance + movements views
-- ============================================
-- Adds a lightweight ledger on top of the existing bank_accounts +
-- advance_payments tables so the user can answer:
--   * Where is the money right now? (per-account live balance)
--   * How did it get there? (unified inflow + transfer movements)
--
-- We do NOT introduce a parallel "accounts" table — we extend
-- bank_accounts with a `type` column (cash/bank/wallet) and seed a
-- single "Cash on hand" row. advance_payments.deposit_account_id is
-- repurposed as the canonical "received in account" field. The
-- existing per-booking `deposits` table is untouched and out of scope
-- for v1.
--
-- v1 scope: inflow (advance_payments) + transfers. Expenses are NOT
-- factored into balances yet (deliberate user choice).
-- ============================================

-- 1. Account type taxonomy ----------------------------------------
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'bank';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_type_check'
  ) THEN
    ALTER TABLE bank_accounts
      ADD CONSTRAINT bank_accounts_type_check
      CHECK (type IN ('cash', 'bank', 'wallet'));
  END IF;
END $$;

-- 2. Reclassify obvious cash drawers + seed if still missing -----
-- The base seed creates a "Petty Cash" row defaulting to type='bank'
-- (because the column didn't exist when it was inserted). That row is
-- conceptually a cash drawer — promote it instead of creating a
-- parallel "Cash on hand" entry that would shadow it.
UPDATE bank_accounts
   SET type = 'cash'
 WHERE type <> 'cash'
   AND name ILIKE ANY (ARRAY['Petty Cash', 'Cash on hand', 'Cash', 'Counter Cash']);

INSERT INTO bank_accounts (name, type, is_active)
  SELECT 'Cash on hand', 'cash', true
  WHERE NOT EXISTS (
    SELECT 1 FROM bank_accounts WHERE type = 'cash'
  );

-- 3. Transfers table ----------------------------------------------
-- `source_advance_id` (nullable) lets us attribute a transfer to a
-- specific advance payment when the user initiates a "Move funds"
-- from the booking trail. Aggregate transfers from the global
-- Treasury page leave it NULL.
CREATE TABLE IF NOT EXISTS account_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  to_account_id   UUID NOT NULL REFERENCES bank_accounts(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_advance_id UUID REFERENCES advance_payments(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_transfers_from   ON account_transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_to     ON account_transfers(to_account_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_date   ON account_transfers(transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_account_transfers_source ON account_transfers(source_advance_id) WHERE source_advance_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON account_transfers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE account_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated can view account_transfers" ON account_transfers;
CREATE POLICY "All authenticated can view account_transfers"
  ON account_transfers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff/Admin can insert account_transfers" ON account_transfers;
CREATE POLICY "Staff/Admin can insert account_transfers"
  ON account_transfers FOR INSERT TO authenticated WITH CHECK (is_staff_or_admin());

DROP POLICY IF EXISTS "Staff/Admin can update account_transfers" ON account_transfers;
CREATE POLICY "Staff/Admin can update account_transfers"
  ON account_transfers FOR UPDATE TO authenticated USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());

DROP POLICY IF EXISTS "Admin can delete account_transfers" ON account_transfers;
CREATE POLICY "Admin can delete account_transfers"
  ON account_transfers FOR DELETE TO authenticated USING (is_admin());

-- 4. Balance view -------------------------------------------------
-- Per-account live position = inflows + transfers_in - transfers_out.
-- v1 deliberately excludes the existing `expenses` and `deposits`
-- tables; those can be folded in later without breaking this view.
CREATE OR REPLACE VIEW account_balance AS
SELECT
  a.id   AS account_id,
  a.name,
  a.type,
  a.is_active,
  COALESCE(inflows.amount, 0)       AS inflow_total,
  COALESCE(transfers_in.amount, 0)  AS transfers_in_total,
  COALESCE(transfers_out.amount, 0) AS transfers_out_total,
  COALESCE(inflows.amount, 0)
    + COALESCE(transfers_in.amount, 0)
    - COALESCE(transfers_out.amount, 0) AS balance
FROM bank_accounts a
LEFT JOIN (
  SELECT deposit_account_id AS account_id, SUM(amount) AS amount
  FROM advance_payments
  WHERE deposit_account_id IS NOT NULL
  GROUP BY deposit_account_id
) inflows ON inflows.account_id = a.id
LEFT JOIN (
  SELECT to_account_id AS account_id, SUM(amount) AS amount
  FROM account_transfers
  GROUP BY to_account_id
) transfers_in ON transfers_in.account_id = a.id
LEFT JOIN (
  SELECT from_account_id AS account_id, SUM(amount) AS amount
  FROM account_transfers
  GROUP BY from_account_id
) transfers_out ON transfers_out.account_id = a.id;

-- 5. Unified movements ledger ------------------------------------
-- Three movement types: inflow, transfer_in, transfer_out.
-- Each row is anchored to ONE account so filtering by account is
-- trivial. Transfers appear twice (once per side) by design.
CREATE OR REPLACE VIEW account_movements AS
SELECT
  ('adv:' || ap.id::text)   AS movement_id,
  ap.id                     AS source_id,
  'inflow'                  AS movement_type,
  ap.deposit_account_id     AS account_id,
  NULL::UUID                AS other_account_id,
  ap.amount,
  ap.payment_date           AS movement_date,
  ap.payment_method::TEXT   AS method,
  ap.booking_id,
  ('Advance #' || ap.advance_number) AS label,
  ap.notes,
  ap.created_at
FROM advance_payments ap
WHERE ap.deposit_account_id IS NOT NULL AND ap.amount > 0

UNION ALL

SELECT
  ('xfer-out:' || t.id::text) AS movement_id,
  t.id                       AS source_id,
  'transfer_out'             AS movement_type,
  t.from_account_id          AS account_id,
  t.to_account_id            AS other_account_id,
  t.amount,
  t.transfer_date            AS movement_date,
  NULL                       AS method,
  NULL::UUID                 AS booking_id,
  'Transfer out'             AS label,
  t.notes,
  t.created_at
FROM account_transfers t

UNION ALL

SELECT
  ('xfer-in:' || t.id::text) AS movement_id,
  t.id                       AS source_id,
  'transfer_in'              AS movement_type,
  t.to_account_id            AS account_id,
  t.from_account_id          AS other_account_id,
  t.amount,
  t.transfer_date            AS movement_date,
  NULL                       AS method,
  NULL::UUID                 AS booking_id,
  'Transfer in'              AS label,
  t.notes,
  t.created_at
FROM account_transfers t;

-- 6. Backfill: route cash advances to Cash on hand --------------
-- Existing cash advances with no deposit_account_id get pointed at
-- the Cash on hand account so balances are immediately meaningful.
UPDATE advance_payments ap
SET deposit_account_id = (SELECT id FROM bank_accounts WHERE type = 'cash' ORDER BY created_at LIMIT 1)
WHERE ap.deposit_account_id IS NULL
  AND ap.payment_method = 'cash'
  AND ap.amount > 0;

NOTIFY pgrst, 'reload schema';
