# SMB Hall Management — Manual Test Plan

Walk-through checklist for every screen + flow. Each scenario lists the steps and the **expected outcome**. Tick boxes off as you go. **Run in a non-production environment** — many scenarios mutate data.

> If a scenario's expected outcome does not happen, that's a bug. Capture it in `BUG_REPORT.md` with the scenario ID (e.g. **B-04**) and what you actually saw.

---

## How to use

1. Sign in as **admin** for the first pass (highest privileges, sees everything).
2. After admin pass, repeat the role-gating section (**RLS**) as **staff** then **viewer**.
3. On mobile: repeat the **Mobile** section in iOS Safari (PWA-installed) and Android Chrome.
4. Open DevTools → Console during the run. Any red error is a finding.

---

## A · Auth & Routing

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| A-01 | Login happy path | Sign in with admin creds | Lands on /dashboard; sidebar shows all 7 items |
| A-02 | Wrong password | Try a bad password | Inline error, no navigation |
| A-03 | Session persistence | Close + reopen tab | Still signed in, no login redirect |
| A-04 | Sign out | Click "Sign out" in sidebar | Redirect to /auth/login |
| A-05 | Deep-link while logged out | Paste /bookings into address bar while logged out | Redirect to /auth/login |
| A-06 | Deep-link while logged in | Paste /treasury into address bar | Lands directly on Treasury |
| A-07 | Sidebar nav reliability | Click each sidebar item in order, then rapid-click any two items | Every click navigates; no "stuck" state. No console `[nav] push failed` lines |
| A-08 | Mobile bottom-nav reliability | Same as A-07 on mobile width (<820px) | Bottom nav switches reliably; buttons have visible tap feedback |
| A-09 | Browser back / forward | Navigate dashboard → bookings → enquiries, then back/forward | Forward/back works without freezing |

## B · Bookings

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| B-01 | Create — happy path | New booking with name, half-day slot, rent | Saves; redirects to list; booking appears |
| B-02 | Create — required fields | Submit empty | Toast warning, no save |
| B-03 | Create — peak Tamil date underpriced | Pick a peak Tamil date (e.g. a Vaikasi date); rent under suggested | Modal: "This is peak — premium not reflected" with Cancel / Save anyway / Apply premium |
| B-04 | Create — conflict with enquiry | Pick a date matching an open enquiry | Modal lists conflicting enquiries before save |
| B-05 | Create — slot already taken | Pick a slot already held by another booking | Trigger-level rejection; toast "Slots unavailable" |
| B-06 | Create — IST midnight edge | Create a booking with function_date = today, when local time is between 18:30 and midnight | Date saved is **today's local date**, not yesterday |
| B-07 | Create — advance at booking, no account picked | Fill advance amount but skip "Received in account" | Save blocked; toast "Pick an account" |
| B-08 | Create — advance at booking, cash auto-routes | Method = cash | Account defaults to "Cash on hand" without manual pick |
| B-09 | Create — bill items defaults | Open form | Four standard items appear with default amounts (Guest Rooms ₹12K, Audio ₹4K, Additional Kitchen ₹3K, Cleaning ₹2K) |
| B-10 | Create — bill item negative (discount) | Add Discount category with -2000 | Saves; appears in bill items list with the negative sign |
| B-11 | Create — expected advance > total bill | Enter expected > rent + bill items | Inline red note; on save, confirm modal with "Sync to total bill & save" |
| B-12 | List — filter by status | Apply status filter | List narrows correctly |
| B-13 | List — search by name + phone | Search by partial name; search by phone | Matches both fields |
| B-14 | Detail — payment summary | Open a booking with advances + bill items | Rent + bill items = total bill; advance + deposits = total paid; pending = max(0, ...) |
| B-15 | Detail — Edit button visibility | Detail page of a non-cancelled booking | Edit button visible |
| B-16 | Detail — Edit cancelled booking | Detail of a cancelled booking | Edit button hidden |
| B-17 | Edit — defaults bill items prefilled | Edit a booking with 0 bill items | Defaults appear (Guest Rooms, Audio, etc.) ready to keep/remove |
| B-18 | Edit — advance field visible | Edit a booking | "Record an advance payment" section visible (helper text shows next free slot) |
| B-19 | Edit — conflict popup suppressed when date unchanged | Edit without changing the date | NO conflict popup for matching enquiries |
| B-20 | Edit — conflict popup fires when date changed | Change the date | Conflict popup fires for the new date |
| B-21 | Edit — all 3 advance slots used | Edit a booking that already has 3 advances; try to record another | Inputs disabled; helper text "All 3 advance slots already used" |
| B-22 | Calendar view | /bookings/calendar | Bookings render at their slot positions; today highlighted |
| B-23 | Calendar — month navigation | Use prev / next arrows | Smooth navigation, bookings reload per month |
| B-24 | Delete a booking | Admin: delete a booking | Cascades to advances + bill items + booking_slots |

## C · Advances

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| C-01 | Add advance via detail page | Booking detail → Advances tab → + Add | Modal opens; account defaults to Cash if method=cash |
| C-02 | Add advance — required account | Try saving with no account picked | Toast "Pick an account"; no save |
| C-03 | Add advance — 4th attempt | Booking already has 3 advances; try Add | Toast "Maximum 3 advance payments allowed" |
| C-04 | Edit advance | Change amount or method | Saves; cash↔non-cash flip clears/sets account default appropriately |
| C-05 | Delete advance | Admin only: delete an advance | Disappears; Treasury balance updates after navigating away/back |

## D · Bill items

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| D-01 | Edit page — add from dropdown | Edit → "+ Add bill item" → pick category | Row appears with the category's default_amount (if any) |
| D-02 | Edit page — remove a row | Click × on a row | Row removed; on save, row is deleted from DB |
| D-03 | Edit page — change amount to 0 | Set amount to 0 and save | Row deleted (insert/update branch skips 0) |
| D-04 | Edit page — discount row | Add Discount with -2000 | Saves; subtotal reflects the discount |
| D-05 | Detail — bill items render | Look at the Bill items tab | Each row shows category + amount; totals match |

## E · Enquiries

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| E-01 | Create — minimal | New enquiry: name + one preferred date | Saves; appears in list with status `new` |
| E-02 | Mark as lost | Change status to `lost` | Required field appears: "Lost reason"; cannot save without it |
| E-03 | Convert to booking | "Convert" button on an enquiry | Opens new-booking form prefilled; on save, enquiry status → `converted`, link populated |
| E-04 | List — filter by status | Apply status filter chips | List narrows correctly |
| E-05 | Conflict highlight | Pick a date matching a booking | Conflict warning visible |
| E-06 | Edit dates | Add / remove preferred dates | Saves correctly |

## F · Treasury / Money

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| F-01 | Balance cards | /treasury | One card per active account; balance = inflows + transfers in − transfers out |
| F-02 | Grand total | Top of page | Sum of all active account balances |
| F-03 | Movements ledger | Default view | Last 500 movements; most recent first |
| F-04 | Filter by account | Pick a specific account | Only its movements show |
| F-05 | Filter by type | Pick `inflow` | Only inflows show; etc. |
| F-06 | Click an inflow row | Click a row with a booking_id | Navigates to that booking's detail |
| F-07 | Record transfer (global) | Cash → Bank A, amount, date | Saves; both account balances update |
| F-08 | Record transfer — same source and dest | Try to pick same account on both sides | DB rejects (CHECK constraint); toast surfaces the error |
| F-09 | Record transfer — overdraw | Source has ₹5K; record ₹10K transfer | Warning shown but save allowed (for back-dated entries); balance can go negative |
| F-10 | Booking search | Type 2+ characters of a customer name | Dropdown of matches; click → trail loads |
| F-11 | Booking trail — landing accounts | Pick a booking with advances | Each advance shows landing account + amount + method |
| F-12 | Booking trail — current location | A booking whose cash was moved | Chain shows: Landed in Cash → Moved to HDFC on D — current location HDFC |
| F-13 | Per-advance Move | Click Move on an advance | Modal: from = current location (disabled), amount = locked to full advance, to = picker |
| F-14 | Per-advance Move — second hop | Move ADV-01 Cash→HDFC; move again | From should now be HDFC; chain shows both moves |
| F-15 | Distribution summary | Trail panel for a booking with 3 advances at different accounts | Chips show ₹X in each account |
| F-16 | Viewer role | Sign in as viewer | "Record transfer" button hidden; "Move" buttons hidden; can browse |
| F-17 | Move — no source account | An advance with no deposit_account_id; trail loaded | Move button hidden; the row is still listed for visibility |

## G · Notifications

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| G-01 | Bell shows unread count | Have unread notifications | Badge shows count |
| G-02 | Open panel | Click bell | List in reverse-chronological order |
| G-03 | Click a notification | Click an item with action_route | Navigates to that route; marked read |
| G-04 | Mark all read | Use "Mark all read" | Badge clears; items shown as read |
| G-05 | Body refreshes on regen | A notification whose source booking changed (e.g. rent edited) | Body text reflects the new value (no stale ignoreDuplicates issue) |
| G-06 | Generation respects role | Sign in as viewer; reload | No notifications are generated by this session (generate() is staff/admin only) |

## H · Settings (admin only)

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| H-01 | Settings landing | /settings | All sub-pages listed |
| H-02 | Bill categories CRUD | Add / edit / deactivate a bill category | Reflects in booking-form dropdown |
| H-03 | Expense categories CRUD | Same as H-02 for expenses | Mirror behaviour |
| H-04 | Bank accounts — add cash | Add new account, type=Cash | bank_name + account_number fields hidden |
| H-05 | Bank accounts — add bank | Add a bank account, type=Bank | bank_name + account_number visible |
| H-06 | Bank accounts — retire | Set is_active=false on an account in use | Account hidden from new advance dropdowns; existing references still display name |
| H-07 | Users CRUD | Create staff, viewer, second admin | Respects 2 admin / 5 staff cap |

## I · Reports

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| I-01 | Filter — date preset | Pick "Q1" | List narrows to Q1 |
| I-02 | Filter — payment status | Pick "Pending" | Only bookings with pending > 0 |
| I-03 | Filter — search by name (single-quote name) | Search a customer with a `'` in their name | Search runs without SQL injection; matches found |
| I-04 | Filter — search with % | Search `%` literal | No SQL wildcard interpretation (escapeIlike works) |
| I-05 | Forecast popover | Hover over Overdue or Total | Popover shows breakdown |
| I-06 | PDF export | Generate report PDF | PDF downloads with formatted bill |
| I-07 | Tamil date column | A booking on a Tamil-named date | Tamil month/paksha rendered |

## J · PWA / Service worker

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| J-01 | Install prompt — iOS | iOS Safari → Share → Add to Home Screen | Icon installs; launching it opens at base path (no 404) |
| J-02 | Install prompt — Android | Chrome → Install | Same as above |
| J-03 | Offline-then-online | Toggle network off, click nav | Should reach the app shell from cache; data ops surface a friendly error |
| J-04 | Auto-update after deploy | Push a new deploy; tab still open | After this load, future deploys auto-take-over without reload |

## K · Mobile responsiveness

| ID  | Scenario | Steps | Expected |
|-----|----------|-------|----------|
| K-01 | Sidebar hidden | Resize to <820px | Sidebar hides; bottom nav appears |
| K-02 | Tap targets | Tap each bottom nav icon | Each is ≥44px tall; tap responds within 100ms (no 300ms delay) |
| K-03 | Calendar grid | Calendar at 320px wide | Grid does not horizontal-overflow |
| K-04 | Forms readable | Any form at 320px wide | Inputs fit; labels not clipped |
| K-05 | Modals fit | Trigger any modal at 320px | No clipping; close button reachable |

## L · RLS / Role gating

For each role (admin, staff, viewer), run the table below.

| ID  | Scenario | Admin | Staff | Viewer |
|-----|----------|:-----:|:-----:|:-----:|
| L-01 | View /dashboard | ✓ | ✓ | ✓ |
| L-02 | View /bookings | ✓ | ✓ | ✓ |
| L-03 | Create booking | ✓ | ✓ | ✗ |
| L-04 | Edit booking | ✓ | ✓ | ✗ |
| L-05 | Delete booking | ✓ | ✗ | ✗ |
| L-06 | View /enquiries | ✓ | ✓ | ✓ |
| L-07 | Create enquiry | ✓ | ✓ | ✗ |
| L-08 | View /treasury | ✓ | ✓ | ✓ |
| L-09 | Record transfer | ✓ | ✓ | ✗ |
| L-10 | Per-advance Move | ✓ | ✓ | ✗ |
| L-11 | Delete transfer | ✓ | ✗ | ✗ |
| L-12 | View /settings | ✓ | ✗ | ✗ |
| L-13 | Manage users | ✓ | ✗ | ✗ |
| L-14 | Direct URL access to admin-only page as viewer | viewer types `/settings` | — | — | redirect to /dashboard |

> Important: role gating happens in **two places** — router guard (UI) and Postgres RLS (DB). For each L-row, ideally verify both: the UI hides the action, AND a direct API call still fails. (UI tests cover the first; API tests cover the second.)

---

## End-of-pass summary

After completing the full pass, fill in:

- Pass date: __________
- Build commit SHA: __________
- Number of items not ticked: __
- Bugs added to `BUG_REPORT.md`: __

Hand off to the next reviewer if there are open items.
