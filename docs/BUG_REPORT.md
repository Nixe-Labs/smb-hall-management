# Bug Report — discovered while writing tests

**Scope:** full-app sweep. **Method:** unit tests (`tests/unit/`), code audit, read-only SQL probes (`supabase/audit.sql`), manual test plan (`docs/MANUAL_TEST_PLAN.md`).

**Severity legend:**
- 🔴 **critical** — data corruption, money lost, security
- 🟠 **high** — wrong totals, broken workflow, regression risk
- 🟡 **medium** — confusing UX, inconsistency, sharp edge
- 🟢 **low** — cosmetic, polish

## Status (last sweep)

**Fixed in this commit** — verified by tests + build:

| ID | Fix |
|----|-----|
| M-03 | Cancelled bookings now bounce out of the edit route with a toast |
| M-04 | Booking form rejects end_time ≤ start_time on same-day bookings |
| M-05 | `expectedExceedsTotal` clamps the total to `max(0, …)` so the warning never reads "exceeds -₹5K" |
| M-06 | `seed_mock_data.sql` inserts the three named bank accounts before referencing them — fresh DBs no longer end up with NULL deposit_account_id on every seeded advance |
| L-01 / L-02 | `tamilDateLabel`, `formatDate`, `formatDateShort` all now return `'—'` for null (was `''` / `'-'`) |
| (testability) | `syncBillItems` diff extracted to `src/lib/utils/billItems.ts` — 16 new unit tests cover insert / update / delete / negative discount / blank / garbage |
| (testability) | Treasury chain math extracted to `src/lib/utils/treasury.ts` — 15 new unit tests cover single-hop / multi-hop / null landing / unrelated transfers / zero amount / distribution |

**Still open** (explicitly skipped, see notes per item below): H-01, H-02, H-03, M-01, M-02, M-07, L-03, L-04.

---

## 🟠 High

### H-01 · Booking `deposits` are invisible in Treasury balances
**Where:** `account_balance` view in `supabase/migrations/013_treasury.sql`
**Repro:** Booking detail → Deposits tab → add a deposit to Bank A for ₹10K. Open `/treasury`. Bank A's balance is unchanged.
**Why it matters:** The existing per-booking `deposits` table represents money landing in an account, just like advances do. Treasury silently ignores it. An operator who relies on Treasury for "what's in the bank" gets a number that's understated by every deposit ever recorded.
**Options:**
1. Union `deposits` into the `account_balance` view's inflow side.
2. Deprecate the `deposits` table entirely (its purpose overlaps `advance_payments.deposit_account_id`).
3. Document the v1 boundary clearly in the Treasury UI.
**Recommendation:** Option 1 short-term, Option 2 long-term. Picked Option 3 implicitly with the "v1 covers inflows + transfers" copy, but the gap is invisible to users who don't read help text.

### H-02 · Pre-013 non-cash advances have NULL `deposit_account_id` and are invisible in Treasury
**Where:** `advance_payments` rows created before migration 013, where `payment_method != 'cash'`
**Repro:** Run `audit.sql` block **B3** in Supabase SQL editor → returns every advance that's missing a receiving account. These rupees don't show up in any `account_balance` row.
**Why it matters:** A clean-looking dashboard with a multi-lakh discrepancy vs the actual bank balance.
**Fix path:** A one-off SQL backfill script (`UPDATE advance_payments SET deposit_account_id = <best-guess account> WHERE ...`) — but the "best guess" depends on the operator's history. Best done via the Booking Detail UI now that "Received in account" is required.

### H-03 · `is_range_available` race / slot conflict between booking create + concurrent enquiry conversion
**Where:** `BookingCreatePage.attemptSave()` chain
**Repro:** Two staff users simultaneously try to create bookings for the same slot. The Postgres unique constraint on `booking_slots(slot_date, slot)` will reject the second, but the **UI's pre-save conflict check uses a separate read**, so the second user sees no conflict popup — only the post-save toast.
**Why it matters:** Confusing for the loser of the race. They see the friendly conflict check pass, then a brittle "Slots unavailable" error on submit. The DB safety net catches it, but the UX implies success then fails.
**Fix path:** Acceptable as-is for low concurrency; revisit if multi-staff workflow becomes common.

---

## 🟡 Medium

### M-01 · Calendar-mode "this week" bucket excludes past dates in the same week
**Where:** `src/lib/utils/forecast.ts:75-77` — `if (diff < 0) return 'overdue'` fires before the calendar-mode branch.
**Repro:** `bucketFor({ due_date: '2026-05-12', expected: 10000, owed: 5000 }, 'calendar', new Date(2026, 4, 15))` returns `'overdue'`, not `'this_week'`, even though 12 May is in the same calendar week as 15 May.
**Why it matters:** A user filtering "This week's forecast" sees an item that's two days overdue as a separate "Overdue" entry instead of grouped with the rest of this week. Whether this is desired is a product call — the function's behaviour is the same in both modes.
**Fix path:** Either document explicitly, or change calendar mode so overdue-but-this-week items appear in `this_week` (with an overdue flag).

### M-02 · Treasury `currentAccountId` math breaks if anyone bypasses the UI to record a partial-amount transfer
**Where:** `src/pages/treasury/TreasuryPage.vue` chain computation
**Repro:** The per-advance Move modal locks `amount` to the full advance value. But a SQL insert (or future feature change) could record `account_transfers` with `source_advance_id` set and `amount < advance.amount`. The chain logic still treats it as the whole advance moving, mis-locating the remainder.
**Why it matters:** The UI lock is the only invariant — there's no DB-level enforcement (and shouldn't be, since the column legitimately accepts smaller amounts for aggregate transfers tagged at a single advance).
**Fix path:** Either (a) enforce full-amount equality in the DB via a check or trigger when `source_advance_id` is set, or (b) rewrite the chain to track remaining-amount-per-account instead of "last-to wins."

### M-03 · Booking edit on a cancelled booking is reachable via direct URL
**Where:** Detail page hides the Edit button for cancelled bookings; route guard does not.
**Repro:** Cancel a booking. Browser URL → `/bookings/<id>/edit`. Form loads, you can save changes.
**Why it matters:** Probably fine for fixing typos on a cancelled record. But the "Cancelled" status is otherwise treated as terminal, so users might not expect the route to remain editable. Trigger doesn't re-add booking_slots (status is still 'cancelled'), so this is harmless but inconsistent.
**Fix path:** Either remove the route, or add a banner "Editing a cancelled booking" inside the form.

### M-04 · `start_time` / `end_time` have no validation: an end-before-start time is accepted
**Where:** `BookingCreatePage.vue` — `range.start_time`, `range.end_time`
**Repro:** Create a booking with start_time = `23:00` and end_time = `10:00`. Saves. `formatTimeRange` renders `"11:00 PM → 10:00 AM"`.
**Why it matters:** Cosmetic mostly — until somebody computes booking duration from these strings.
**Fix path:** Client-side validation that `end_time > start_time` when on the same day; or interpret them as "use" times only with no math attached (which is already true).

### M-05 · `expectedExceedsTotal` warns even when total_bill is negative
**Where:** `BookingCreatePage.vue` `expectedExceedsTotal` computed
**Repro:** Rent = ₹10K. Add a Discount bill item for -₹15K (total bill = -₹5K). Set Expected = ₹1K. Warning fires: "Expected (₹1K) exceeds total bill (-₹5K)." Math is right; the wording is odd.
**Why it matters:** Edge case; probably impossible in practice (discount > rent is unusual). Worth a copy tweak if encountered.
**Fix path:** Either clamp `totalBill` to `max(0, ...)` in the comparison, or change copy.

### M-06 · `seed_mock_data.sql` references account names ('SMB AC', 'Niranjana AC', 'Petty Cash') that may not exist in a fresh DB
**Where:** `supabase/seed_mock_data.sql` line ~493
**Repro:** Run the seed against a DB that hasn't been seeded with these specific account names. The `(SELECT id FROM bank_accounts WHERE name = '...')` returns NULL → `deposit_account_id` is NULL on every seeded advance.
**Why it matters:** Dev environments expecting Treasury balances from seed data see all advances orphaned.
**Fix path:** The seed should `INSERT … ON CONFLICT DO NOTHING` the accounts before referencing them.

### M-07 · `payment_method` enum vs UPI / GPay
**Where:** `src/types/enums.ts` — `PaymentMethod` is `'cash' | 'cheque' | 'online'`
**Repro:** A user paid via GPay. The UI offers `online` as the closest match. The Treasury can't tell GPay-online from net-banking-online from card-online.
**Why it matters:** Treasury reporting can't slice by sub-method. Probably fine for SMB scale.
**Fix path:** Either expand the enum (`'cash' | 'cheque' | 'upi' | 'card' | 'bank_transfer' | 'online'`) and migrate, or accept the granularity.

---

## 🟢 Low

### L-01 · `tamilDateLabel(null)` returns `''` while every other display helper returns `'—'`
**Where:** `src/lib/utils/tamilCalendar.ts:94`
**Repro:** `tamilDateLabel(null) === ''` — but `formatDate(null) === '-'`, `formatTime(null) === ''` (one of the two also uses `''`).
**Why it matters:** Mild inconsistency. Cells in tables that should show a placeholder render as empty whitespace.
**Fix path:** Standardise on one (recommend `'—'`).

### L-02 · `formatDate(null)` returns `'-'` (ASCII hyphen) while UI elsewhere uses `'—'` (em-dash)
**Where:** `src/lib/utils/dates.ts:5`
**Repro:** Look at any cell in the booking list where `function_date` is missing — it shows `-`; same null in Tamil date column shows `—` from `dueLabel`.
**Why it matters:** Cosmetic.

### L-03 · `escapeIlike` doesn't escape single quotes
**Where:** `ReportsPage.vue:264`, `TreasuryPage.vue:newly-added`
**Repro:** Search for a customer named `O'Brien`. The `'` passes through to PostgREST. PostgREST handles the comma-separated filter syntax, not raw SQL, so this is actually safe (no SQL injection), but malformed queries could result if a name contains special characters not in the escape list.
**Why it matters:** Defensive depth. Not exploitable; just brittle.
**Fix path:** Audit the postgrest-js syntax for which characters need escaping in `or()`.

### L-04 · The `deposits` table semantically overlaps `advance_payments.deposit_account_id`
**Where:** Database design
**Why it matters:** Two ways to record "money landed in account X for booking Y" is one too many. Treasury uses one; booking detail uses the other.
**Fix path:** Deprecate `deposits`, migrate existing rows to `advance_payments`-style entries, or vice versa. Out of scope for now.

---

## ⚠️ Testability gaps (not bugs, but worth fixing)

These live as inline logic inside `.vue` components and can't currently be unit-tested:

| Logic | Lives in | Refactor target |
|---|---|---|
| `syncBillItems` — the insert/update/delete diff | `BookingCreatePage.vue` | Extract to `src/lib/utils/billItems.ts` and unit-test |
| Treasury chain computation (`currentAccountId`, `bookingTrail`) | `TreasuryPage.vue` | Extract to `src/lib/utils/treasury.ts` and unit-test |
| `expectedExceedsTotal` rule | `BookingCreatePage.vue` | Extract to `src/lib/utils/billItems.ts` |
| `nextAdvanceSlot` selector | `BookingCreatePage.vue` | Extract to `src/lib/utils/advances.ts` |
| Conflict-suppression in edit (`rangeUnchanged`) | `BookingCreatePage.vue` | Extract |

Each of these is exactly the kind of subtle math that benefits from tests. **Recommend: a follow-up PR that extracts these helpers and adds tests, without behaviour changes.**

---

## How to verify the audit findings on your DB

Run `supabase/audit.sql` in the Supabase SQL editor (admin role required for `bookings_payment_status` view access). Any rows returned are findings. Treat empty results as green.

The first time you run it, expect rows from **B3** (pre-013 non-cash advances) and possibly **H-03** (completed booking with money owed — informational, not a bug). Everything else returning empty is the baseline you want.
