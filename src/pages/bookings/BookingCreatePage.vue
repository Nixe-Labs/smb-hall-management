<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import SlotRangePicker from '@/components/booking/SlotRangePicker.vue'
import TamilDemandBadge from '@/components/common/TamilDemandBadge.vue'
import PhoneNumbersInput from '@/components/common/PhoneNumbersInput.vue'
import { mergePhones, splitPhones, validatePhones, telHref, waHref } from '@/lib/utils/phones'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@/lib/utils/payments'
import { dueDateWithin, advancePolicy, advanceOutOfPolicy } from '@/lib/utils/forecast'
import { buildDemandHistory, getDemandForDate, premiumAmount, type DemandHistory } from '@/lib/utils/tamilDemand'
import { PAKSHA_LABEL } from '@/lib/utils/tamilCalendar'
import { formatCurrency } from '@/lib/utils/currency'
import { toISODate } from '@/lib/utils/dates'
import { formatRange } from '@/lib/utils/slots'
import type { DaySlot, PaymentMethod } from '@/types/enums'
import type { Booking, BillCategory, Enquiry, EnquiryDate, EnquiryMatch, BankAccount, EventType } from '@/types/database'
import { diffBillItems, billItemsSubtotal, resolveBillItem, unitDef, prefillQuantity, type FormBillItem, type BillItemSnapshot } from '@/lib/utils/billItems'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const toast = useToast()

// Edit mode: the route /bookings/:id/edit carries the id
const editingId = computed(() => (route.params.id as string | undefined) ?? null)
const isEditing = computed(() => !!editingId.value)
const fromEnquiryId = (route.query.from_enquiry as string | undefined) ?? null

const loading = ref(false)
const range = ref<{
  function_date: string
  start_date: string
  start_slot: DaySlot
  end_date: string
  end_slot: DaySlot
  start_time: string | null
  end_time: string | null
}>({
  function_date: '',
  start_date: '',
  start_slot: 'morning',
  end_date: '',
  end_slot: 'evening',
  start_time: null,
  end_time: null,
})

const form = ref({
  customer_name: '',
  customer_address: '',
  event_type: '',
  event_type_other: '',
  rent: '',
  notes: '',
  expected_advance_amount: '',
  advance_due_date: '',
})

// Event types come from the admin-managed catalogue (Settings → Event Types).
const eventTypes = ref<EventType[]>([])
async function loadEventTypes() {
  const { data } = await supabase
    .from('event_types').select('*').eq('is_active', true).order('sort_order')
  eventTypes.value = (data as EventType[]) ?? []
}
// Does the chosen type want a free-text detail (the "Others" case)?
const eventTypeIsOther = computed(() =>
  eventTypes.value.find(t => t.name === form.value.event_type)?.is_other ?? false
)

// Contact numbers — index 0 is the primary (required). Extras (up to 4 more)
// are stored separately in bookings.customer_phones. Always ≥1 row.
const phones = ref<string[]>([''])

// ── Advance received now (shown in both modes) ───────────────
// In Create: this is the booking-time advance (Advance #1).
// In Edit: this is an additional advance — assigned the next free slot
// (#1/#2/#3). Bank account left blank; fill on the Advances tab.
const advanceNow = ref<{ amount: string; method: PaymentMethod; account_id: string; date: string }>({
  amount: '',
  method: 'cash',
  account_id: '',
  date: toISODate(new Date()),
})
const accounts = ref<BankAccount[]>([])
async function loadAccounts() {
  const { data } = await supabase
    .from('bank_accounts').select('*').eq('is_active', true).order('type').order('name')
  accounts.value = (data as BankAccount[]) ?? []
}
const cashAccountId = computed(() => accounts.value.find(a => a.type === 'cash')?.id ?? '')
// Default the account when method changes — cash → Cash on hand; other methods
// stay blank so the user explicitly picks the receiving bank/wallet.
watch(() => advanceNow.value.method, (m) => {
  if (m === 'cash') advanceNow.value.account_id = cashAccountId.value
  else if (advanceNow.value.account_id === cashAccountId.value) advanceNow.value.account_id = ''
})
const existingAdvanceNumbers = ref<Set<number>>(new Set())
const nextAdvanceSlot = computed<number | null>(() => {
  for (const n of [1, 2, 3]) {
    if (!existingAdvanceNumbers.value.has(n)) return n
  }
  return null
})

// ── Bill items (create + edit) ───────────────────────────────
// FormBillItem and the diff logic live in @/lib/utils/billItems so the
// insert/update/delete reconciliation is unit-testable in isolation.
const billCategories = ref<BillCategory[]>([])
const billItemsForm = ref<FormBillItem[]>([])
// Originals loaded from DB on edit, so save-time can diff for delete-removed.
const originalBillItems = ref<Map<string, BillItemSnapshot>>(new Map())

async function loadBillCategories() {
  const { data } = await supabase
    .from('bill_categories').select('*').eq('is_active', true).order('sort_order')
  billCategories.value = (data as BillCategory[]) ?? []
}

function prefillDefaultBillItems() {
  // The fixed standard table: every active category that has a default
  // amount/rate configured (Settings → Bill Categories) auto-fills on every new
  // booking, so staff never re-add the standard items by hand. Flat categories
  // prefill their amount; per-unit categories prefill the rate AND their default
  // quantity — so a "1 unit" standard charge (gas, cleaning, rooms…) appears at
  // rate × 1 ready to bill, while metered items (default_quantity 0, e.g. AC by
  // the hour, EB by the meter) prefill a blank quantity so they're only billed
  // once the real hours/units are entered.
  billItemsForm.value = billCategories.value
    .filter(c => c.default_amount != null && Number(c.default_amount) > 0)
    .map(c => {
      if (!c.unit) return { category_id: c.id, category_name: c.name, amount: String(c.default_amount) }
      const qty = prefillQuantity(c.default_quantity)
      return { category_id: c.id, category_name: c.name, amount: '0', unit: c.unit, rate: String(c.default_amount), quantity: qty != null ? String(qty) : '' }
    })
}

async function loadBillItemsForBooking(bookingId: string) {
  const { data } = await supabase
    .from('bill_items').select('id, category_id, amount, unit, rate, quantity').eq('booking_id', bookingId)
  const rows = (data as { id: string; category_id: string; amount: number; unit: string | null; rate: number | null; quantity: number | null }[]) ?? []
  billItemsForm.value = rows.map(r => ({
    category_id: r.category_id,
    category_name: billCategories.value.find(c => c.id === r.category_id)?.name ?? 'Unknown',
    amount: String(r.amount),
    unit: r.unit,
    rate: r.rate != null ? String(r.rate) : '',
    quantity: r.quantity != null ? String(r.quantity) : '',
    _existing_id: r.id,
  }))
  originalBillItems.value = new Map(rows.map(r => [r.id, {
    amount: Number(r.amount),
    unit: r.unit ?? null,
    rate: r.rate != null ? Number(r.rate) : null,
    quantity: r.quantity != null ? Number(r.quantity) : null,
  }]))
}

const availableCategoriesForAdd = computed(() => {
  const used = new Set(billItemsForm.value.map(r => r.category_id))
  return billCategories.value.filter(c => !used.has(c.id))
})

const billItemsTotal = computed(() => billItemsSubtotal(billItemsForm.value))

function addBillItemRow(e: Event) {
  const sel = e.target as HTMLSelectElement
  const id = sel.value
  if (!id) return
  const cat = billCategories.value.find(c => c.id === id)
  if (!cat) return
  if (cat.unit) {
    // Per-unit: seed the rate and the category's default quantity. Metered
    // items (default_quantity 0) seed a blank quantity so the user must enter
    // the hours/units before the line counts.
    const qty = prefillQuantity(cat.default_quantity)
    billItemsForm.value.push({
      category_id: cat.id,
      category_name: cat.name,
      amount: '0',
      unit: cat.unit,
      rate: cat.default_amount != null ? String(cat.default_amount) : '',
      quantity: qty != null ? String(qty) : '',
    })
  } else {
    billItemsForm.value.push({
      category_id: cat.id,
      category_name: cat.name,
      amount: cat.default_amount != null ? String(cat.default_amount) : '0',
    })
  }
  sel.value = ''  // reset dropdown
}

function removeBillItemRow(i: number) {
  billItemsForm.value.splice(i, 1)
}

// Live line total for a per-unit row (rate × quantity), for display.
function lineTotal(item: FormBillItem): number {
  return resolveBillItem(item).amount
}
function unitShort(unit: string | null | undefined): string {
  return unitDef(unit)?.short ?? ''
}
function unitQtyLabel(unit: string | null | undefined): string {
  return unitDef(unit)?.qty ?? 'qty'
}

// Reconcile billItemsForm against what's currently in the DB for `bookingId`.
// Diff is computed by the pure helper; this function owns only the I/O.
async function syncBillItems(bookingId: string) {
  const { inserts, updates, deletes } = diffBillItems(
    billItemsForm.value,
    originalBillItems.value,
    bookingId,
  )
  if (deletes.length) await supabase.from('bill_items').delete().in('id', deletes)
  for (const u of updates) {
    await supabase.from('bill_items').update({ amount: u.amount }).eq('id', u.id)
  }
  if (inserts.length) await supabase.from('bill_items').insert(inserts)
}

// Due date rule (owner): the balance is expected "within 30 days" of booking
// → today + 30, capped at the function date if the event is sooner. The user's
// manual edits win; while untouched we keep it in sync with the function date.
let dueDateTouched = false
watch(
  () => range.value.function_date,
  (next) => {
    if (!dueDateTouched && !isEditing.value) {
      form.value.advance_due_date = dueDateWithin(next || null)
    }
  }
)
function onDueDateInput(e: Event) {
  dueDateTouched = true
  form.value.advance_due_date = (e.target as HTMLInputElement).value
}

// ── Expected advance = balance after the first advance ───────
// Owner's rule: Expected advance auto-fills to (total bill − first advance),
// i.e. the outstanding balance, and stays in sync until the user overrides it.
// Create-mode only — in edit mode `advanceNow` is an *additional* advance, so
// we leave the stored forecast untouched.
let expectedTouched = false
const firstAdvanceAmount = computed(() => Number(advanceNow.value.amount) || 0)
const suggestedExpected = computed(() => Math.max(0, totalBill.value - firstAdvanceAmount.value))
function onExpectedInput(e: Event) {
  expectedTouched = true
  form.value.expected_advance_amount = (e.target as HTMLInputElement).value
}

async function loadForEdit(id: string) {
  const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single()
  if (error || !data) {
    toast.add({ severity: 'error', summary: 'Not found', detail: 'Booking not found', life: 5000 })
    router.push({ name: 'bookings' })
    return
  }
  const b = data as Booking
  // Cancelled bookings are treated as terminal everywhere else — the Edit
  // button is hidden on the detail page. Honor that for direct URL access
  // too, otherwise users could deep-link past the gate and silently edit a
  // record they'd consider closed.
  if (b.status === 'cancelled') {
    toast.add({ severity: 'warn', summary: 'Cancelled', detail: 'Cancelled bookings cannot be edited.', life: 4000 })
    router.push({ name: 'booking-detail', params: { id } })
    return
  }
  range.value = {
    function_date: b.function_date,
    start_date: b.start_date,
    start_slot: b.start_slot,
    end_date: b.end_date,
    end_slot: b.end_slot,
    start_time: b.start_time,
    end_time: b.end_time,
  }
  form.value = {
    customer_name: b.customer_name,
    customer_address: b.customer_address ?? '',
    event_type: b.event_type ?? '',
    event_type_other: b.event_type_other ?? '',
    rent: b.rent != null ? String(b.rent) : '',
    notes: b.notes ?? '',
    expected_advance_amount: b.expected_advance_amount != null ? String(b.expected_advance_amount) : '',
    advance_due_date: b.advance_due_date ?? '',
  }
  phones.value = mergePhones(b.customer_phone, b.customer_phones)
  // Keep the existing due-date + forecast on edit; don't let the auto-fill
  // watchers overwrite values that were already saved on this booking.
  dueDateTouched = true
  expectedTouched = true
  // Snapshot the loaded range so the conflict-popup can suppress when unchanged
  originalRange.value = { ...range.value }
  // Pull this booking's existing bill items into the edit form
  await loadBillItemsForBooking(id)
  // If no bill items exist on this booking, surface the standard defaults
  // (Guest Rooms / Audio / Additional Kitchen / Cleaning) — same as Create
  if (billItemsForm.value.length === 0) prefillDefaultBillItems()
  // Which advance slots are already used (so the form picks the next free one)
  const { data: advs } = await supabase.from('advance_payments').select('advance_number').eq('booking_id', id)
  existingAdvanceNumbers.value = new Set(((advs as { advance_number: number }[]) ?? []).map(a => a.advance_number))
}

async function prefillFromEnquiry(id: string) {
  const [{ data: enq }, { data: dates }] = await Promise.all([
    supabase.from('enquiries').select('*').eq('id', id).single(),
    supabase.from('enquiry_dates').select('*').eq('enquiry_id', id).order('is_primary', { ascending: false }),
  ])
  if (!enq) return
  const enquiry = enq as Enquiry
  const dateList = (dates as EnquiryDate[]) ?? []
  const primary = dateList.find(d => d.is_primary) ?? dateList[0]
  form.value.customer_name = enquiry.customer_name
  phones.value = mergePhones(enquiry.customer_phone, enquiry.customer_phones)
  form.value.customer_address = enquiry.customer_address ?? ''
  form.value.event_type = enquiry.event_type ?? ''
  form.value.event_type_other = enquiry.event_type_other ?? ''
  if (enquiry.notes) form.value.notes = enquiry.notes
  if (primary) {
    range.value = {
      function_date: primary.function_date,
      start_date: primary.start_date,
      start_slot: primary.start_slot,
      end_date: primary.end_date,
      end_slot: primary.end_slot,
      start_time: null,
      end_time: null,
    }
  }
}

const demandHistory = ref<DemandHistory | null>(null)
async function loadDemandHistory() {
  const { data } = await supabase
    .from('bookings')
    .select('function_date')
    .neq('status', 'cancelled')
  const dates = ((data as { function_date: string }[]) ?? []).map(b => b.function_date)
  demandHistory.value = buildDemandHistory(dates)
}

// ── Tamil-season demand intimation ──────────────────────────
const demandInfo = computed(() => getDemandForDate(range.value.function_date, demandHistory.value))
const isHotDate = computed(() => {
  const t = demandInfo.value?.demand.tier
  return t === 'peak' || t === 'high'
})
const premiumLabel = computed(() => {
  const pct = demandInfo.value?.demand.premiumPct ?? 0
  return pct > 0 ? `+${pct}%` : `${pct}%`
})
// suggested rent = base × (1 + premium%), only when a base rent + premium exist
const suggestedRent = computed(() => {
  const info = demandInfo.value
  const base = Number(form.value.rent)
  if (!info || !base || !info.demand.premiumPct) return null
  return base + premiumAmount(base, info.demand.premiumPct)
})
// hide the apply button once the current rent already equals the applied figure
const premiumAppliedValue = ref<number | null>(null)
const showApply = computed(() =>
  suggestedRent.value != null && Number(form.value.rent) !== premiumAppliedValue.value
)
function applyPremium() {
  if (suggestedRent.value == null) return
  premiumAppliedValue.value = suggestedRent.value
  form.value.rent = String(suggestedRent.value)
  toast.add({ severity: 'success', summary: 'Premium applied', detail: `Rent set to ${formatCurrency(suggestedRent.value)}`, life: 3000 })
}

// Toast when a peak/high Tamil-season date is chosen
let lastToastedDate = ''
watch(
  () => range.value.function_date,
  (d) => {
    if (!d || d === lastToastedDate) return
    const info = getDemandForDate(d, demandHistory.value)
    if (info && (info.demand.tier === 'peak' || info.demand.tier === 'high')) {
      lastToastedDate = d
      toast.add({
        severity: 'info',
        summary: `${info.demand.label} date`,
        detail: `${info.tamil.month.en} · ${PAKSHA_LABEL[info.tamil.paksha].short}. Suggested premium ${info.demand.premiumPct > 0 ? '+' : ''}${info.demand.premiumPct}%.`,
        life: 6000,
      })
    }
  }
)

// ── Conflicting enquiries (people who wanted this date) ──────
const matchingEnquiries = ref<EnquiryMatch[]>([])
// Snapshot of the booking's range when edit mode loads — used to suppress
// the conflict popup if the user hasn't actually changed the dates.
const originalRange = ref<typeof range.value | null>(null)
const rangeUnchanged = computed(() => {
  const o = originalRange.value
  if (!o) return false
  const r = range.value
  return r.start_date === o.start_date && r.start_slot === o.start_slot
    && r.end_date === o.end_date && r.end_slot === o.end_slot
})
async function fetchMatches() {
  const r = range.value
  if (!r.start_date || !r.end_date) { matchingEnquiries.value = []; return }
  // In edit mode, the booking is already on this date — leftover open enquiries
  // matching the same range aren't a *new* conflict; only show if the date has
  // actually been changed in this edit session.
  if (isEditing.value && rangeUnchanged.value) { matchingEnquiries.value = []; return }
  const { data } = await supabase.rpc('enquiries_for_range', {
    p_start_date: r.start_date, p_start_slot: r.start_slot,
    p_end_date: r.end_date, p_end_slot: r.end_slot,
  })
  // Don't surface the enquiry we're converting from as a "conflict"
  matchingEnquiries.value = ((data as EnquiryMatch[]) ?? []).filter(m => m.enquiry_id !== fromEnquiryId)
}
let matchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => [range.value.start_date, range.value.start_slot, range.value.end_date, range.value.end_slot],
  () => {
    conflictConfirmed.value = false
    if (matchTimer) clearTimeout(matchTimer)
    matchTimer = setTimeout(fetchMatches, 300)
  }
)

// ── Save pipeline with chained confirmations ─────────────────
const showUnderpriced = ref(false)
const showConflict = ref(false)
const showExpectedExceeds = ref(false)
const premiumConfirmed = ref(false)
const conflictConfirmed = ref(false)
const expectedConfirmed = ref(false)

// Total bill = rent + bill items (live as the user edits the form).
const totalBill = computed(() => (Number(form.value.rent) || 0) + billItemsTotal.value)

// Catches the "stale forecast" case — e.g. rent was edited from 24L down
// to 2.4L but Expected Advance still says 20L. Uses the live total bill so
// expecting >rent is fine when bill items legitimately push the total higher.
// We do NOT require tb>0 so the case "rent=0 but expected=5K" still warns;
// but we clamp totalBill to 0 so heavy-discount edge cases ("expected ₹1K
// exceeds total -₹5K") read as "exceeds ₹0" instead of confusing the user.
const expectedExceedsTotal = computed(() => {
  const exp = Number(form.value.expected_advance_amount)
  return exp > 0 && exp > Math.max(0, totalBill.value)
})

// Reset the "Save anyway" acknowledgement whenever any input that feeds the
// check changes (rent, expected, or any bill-item amount).
watch(
  () => [form.value.rent, form.value.expected_advance_amount, billItemsTotal.value],
  () => { expectedConfirmed.value = false }
)

// Auto-fill Expected advance with the balance (total bill − first advance) as
// the rent / bill items / first advance change. Only while the user hasn't
// overridden it, and never in edit mode. Stays blank until a rent is entered.
watch(
  () => [totalBill.value, firstAdvanceAmount.value],
  () => {
    if (isEditing.value || expectedTouched) return
    if (!(Number(form.value.rent) > 0)) { form.value.expected_advance_amount = ''; return }
    form.value.expected_advance_amount = suggestedExpected.value > 0 ? String(suggestedExpected.value) : ''
  }
)

// ── Advance policy: the booking advance should be 40–60% of rent ──────
// Owner's rule (math lives in forecast.ts). We suggest the 50% midpoint and
// softly warn (never block) when the entered advance falls outside the band.
// Create mode only — in edit mode `advanceNow` is an additional payment, not
// the booking deposit.
const rentForAdvance = computed(() => Number(form.value.rent) || 0)
const advancePol = computed(() => advancePolicy(rentForAdvance.value))
const advanceMin = computed(() => advancePol.value.min)
const advanceMax = computed(() => advancePol.value.max)
const advanceSuggested = computed(() => advancePol.value.suggested)

let advanceTouched = false
function onAdvanceAmountInput(e: Event) {
  advanceTouched = true
  advanceNow.value.amount = (e.target as HTMLInputElement).value
}

// Prefill the first advance to the 50% midpoint of rent until staff override or
// clear it (when no advance is taken). Stays blank until a rent is entered.
watch(
  () => rentForAdvance.value,
  () => {
    if (isEditing.value || advanceTouched) return
    advanceNow.value.amount = advanceSuggested.value > 0 ? String(advanceSuggested.value) : ''
  }
)

// Soft warning when the booking advance lands outside 40–60% of rent. Never for
// an edit-mode top-up.
const advanceOutOfRange = computed(() =>
  !isEditing.value && advanceOutOfPolicy(Number(advanceNow.value.amount), rentForAdvance.value)
)
const advanceBelowMin = computed(() => Number(advanceNow.value.amount) < advanceMin.value)

onMounted(async () => {
  // Categories must be loaded before edit prefill (to resolve names) or
  // before create prefill (to populate defaults)
  await Promise.all([loadBillCategories(), loadAccounts(), loadEventTypes()])
  // Default cash receipts to the Cash on hand account
  if (advanceNow.value.method === 'cash' && !advanceNow.value.account_id) {
    advanceNow.value.account_id = cashAccountId.value
  }
  if (isEditing.value) {
    await loadForEdit(editingId.value!)
  } else {
    if (fromEnquiryId) await prefillFromEnquiry(fromEnquiryId)
    prefillDefaultBillItems()
    // Seed the "within 30 days" due date even before a function date is picked.
    if (!dueDateTouched) form.value.advance_due_date = dueDateWithin(range.value.function_date || null)
  }
  loadDemandHistory()
})

function handleSubmit() {
  const r = range.value
  if (!r.function_date || !r.start_date || !r.end_date || !form.value.customer_name || !form.value.rent) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Please fill in dates, customer name, and rent', life: 3000 })
    return
  }
  const phoneError = validatePhones(phones.value, { requireFirst: true })
  if (phoneError) {
    toast.add({ severity: 'warn', summary: 'Check mobile numbers', detail: phoneError, life: 4000 })
    return
  }
  // Hall-use times are advisory, not used for math — but inverted times
  // (end before start) on a same-day booking are almost certainly a typo,
  // and would render as e.g. "11:00 PM → 10:00 AM" on the bill.
  if (r.start_time && r.end_time && r.start_date === r.end_date && r.end_time <= r.start_time) {
    toast.add({ severity: 'warn', summary: 'Check times', detail: 'Hall-use end time must be after the start time.', life: 4000 })
    return
  }
  // If they're recording an advance, the receiving account is required so it
  // shows up in Treasury. (Cash defaults itself; only non-cash needs a pick.)
  if (Number(advanceNow.value.amount) > 0 && nextAdvanceSlot.value != null && !advanceNow.value.account_id) {
    toast.add({ severity: 'warn', summary: 'Pick an account', detail: 'Choose which account the advance landed in — needed for the Treasury balance.', life: 4000 })
    return
  }
  attemptSave()
}

// Runs the pre-save confirmations in order; each modal re-enters this after
// the user acknowledges. Falls through to doSave() once all are cleared.
function attemptSave() {
  // 1. Peak/high date whose rent doesn't include the suggested premium
  if (!premiumConfirmed.value && isHotDate.value && showApply.value && (demandInfo.value?.demand.premiumPct ?? 0) > 0) {
    showUnderpriced.value = true
    return
  }
  // 2. Existing enquiries that wanted this date
  if (!conflictConfirmed.value && matchingEnquiries.value.length > 0) {
    showConflict.value = true
    return
  }
  // 3. Expected advance is larger than total bill (probably a stale forecast)
  if (!expectedConfirmed.value && expectedExceedsTotal.value) {
    showExpectedExceeds.value = true
    return
  }
  void doSave()
}

function applyAndSave() {
  applyPremium()
  premiumConfirmed.value = true
  showUnderpriced.value = false
  attemptSave()
}
function saveAnyway() {
  premiumConfirmed.value = true
  showUnderpriced.value = false
  attemptSave()
}
function continueWithConflict() {
  conflictConfirmed.value = true
  showConflict.value = false
  attemptSave()
}
function saveAnywayExpected() {
  expectedConfirmed.value = true
  showExpectedExceeds.value = false
  attemptSave()
}
function syncExpectedToTotal() {
  form.value.expected_advance_amount = String(totalBill.value)
  expectedConfirmed.value = true
  showExpectedExceeds.value = false
  attemptSave()
}

async function doSave() {
  const r = range.value
  // Live availability check — when editing, exclude this booking's own slots
  const { data: available, error: rpcErr } = await supabase.rpc('is_range_available', {
    s_date: r.start_date,
    s_slot: r.start_slot,
    e_date: r.end_date,
    e_slot: r.end_slot,
    exclude_booking: editingId.value,
  })
  if (rpcErr) {
    toast.add({ severity: 'error', summary: 'Error', detail: rpcErr.message, life: 5000 })
    return
  }
  if (available === false) {
    toast.add({ severity: 'warn', summary: 'Slots unavailable', detail: 'One or more slots in this range are already booked', life: 5000 })
    return
  }

  loading.value = true
  try {
    const { primary: primaryPhone, extras: extraPhones } = splitPhones(phones.value)
    const payload = {
      function_date: r.function_date,
      start_date: r.start_date,
      start_slot: r.start_slot,
      end_date: r.end_date,
      end_slot: r.end_slot,
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      customer_name: form.value.customer_name,
      customer_phone: primaryPhone,
      customer_phones: extraPhones,
      customer_address: form.value.customer_address || null,
      event_type: form.value.event_type || null,
      event_type_other: eventTypeIsOther.value ? (form.value.event_type_other || null) : null,
      rent: Number(form.value.rent),
      notes: form.value.notes || null,
      expected_advance_amount: form.value.expected_advance_amount ? Number(form.value.expected_advance_amount) : null,
      advance_due_date: form.value.advance_due_date || null,
    }

    if (isEditing.value) {
      const { error } = await supabase.from('bookings').update(payload).eq('id', editingId.value!)
      if (error) {
        if (error.code === '23505') {
          toast.add({ severity: 'warn', summary: 'Slots unavailable', detail: 'A booking was just created for one of these slots — please pick a different range', life: 5000 })
        } else {
          throw error
        }
        return
      }
      await syncBillItems(editingId.value!)

      // Optional advance payment entered on the edit form → next free slot
      const advAmountEdit = Number(advanceNow.value.amount)
      if (advAmountEdit > 0) {
        if (nextAdvanceSlot.value == null) {
          toast.add({ severity: 'warn', summary: 'Advance limit reached', detail: 'All 3 advance slots are already filled. Use the Advances tab to manage.', life: 5000 })
        } else {
          await supabase.from('advance_payments').insert({
            booking_id: editingId.value!,
            advance_number: nextAdvanceSlot.value,
            amount: advAmountEdit,
            payment_method: advanceNow.value.method,
            payment_date: advanceNow.value.date || toISODate(new Date()),
            deposit_account_id: advanceNow.value.account_id || null,
          })
        }
      }

      toast.add({ severity: 'success', summary: 'Updated', detail: 'Booking updated successfully', life: 3000 })
      router.push({ name: 'booking-detail', params: { id: editingId.value! } })
    } else {
      const { data: created, error } = await supabase.from('bookings').insert({
        ...payload,
        status: 'upcoming',
        created_by: authStore.user?.id,
      }).select('id').single()
      if (error) {
        // Trigger may have hit the booking_slots primary-key constraint if a race occurred
        if (error.code === '23505') {
          toast.add({ severity: 'warn', summary: 'Slots unavailable', detail: 'A booking was just created for one of these slots — please pick a different range', life: 5000 })
        } else {
          throw error
        }
        return
      }

      // Optional: advance paid at booking → recorded as Advance #1
      const advAmount = Number(advanceNow.value.amount)
      if (created?.id && advAmount > 0) {
        await supabase.from('advance_payments').insert({
          booking_id: created.id,
          advance_number: nextAdvanceSlot.value ?? 1,
          amount: advAmount,
          payment_method: advanceNow.value.method,
          payment_date: advanceNow.value.date || toISODate(new Date()),
          deposit_account_id: advanceNow.value.account_id || null,
        })
      }

      // Bill items (pre-filled defaults + any the user added)
      if (created?.id) await syncBillItems(created.id)

      // If this booking was converted from an enquiry, link them and mark enquiry converted
      if (fromEnquiryId && created?.id) {
        await supabase
          .from('enquiries')
          .update({ status: 'converted', converted_booking_id: created.id })
          .eq('id', fromEnquiryId)
      }

      toast.add({ severity: 'success', summary: 'Created', detail: 'Booking created successfully', life: 3000 })
      router.push({ name: 'bookings' })
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : (isEditing.value ? 'Failed to update booking' : 'Failed to create booking')
    toast.add({ severity: 'error', summary: 'Error', detail: message, life: 5000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="screen" style="max-width:760px">
    <!-- Back -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-top:24px" class="fade-in">
      <button class="smb-nav-iconbtn" @click="isEditing ? router.push({ name: 'booking-detail', params: { id: editingId! } }) : router.push({ name: 'bookings' })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
      </button>
      <span class="t-mono" style="color:var(--ash)">02 / BOOKINGS / {{ isEditing ? 'EDIT' : 'NEW' }}</span>
    </div>

    <div style="padding-top:8px;padding-bottom:32px" class="fade-up">
      <div class="t-eyebrow" style="margin-bottom:12px">{{ isEditing ? 'Edit booking' : 'New entry' }}</div>
      <h1 class="t-h1">{{ isEditing ? 'Edit booking.' : 'Book a date.' }}</h1>
      <p style="color:var(--ash);margin-top:12px;max-width:520px">
        {{ isEditing
          ? 'Update any of the booking details below. Advances, bill items, expenses and deposits are managed from the booking page.'
          : "Confirm a function with the customer's details. The hall use period can span across days — pick a start and end half-day." }}
      </p>
    </div>

    <!-- novalidate: bill amounts use a 1000 step but exact values (e.g. EB ₹25)
         must still save — validation is handled in handleSubmit via toasts. -->
    <form class="form-stack fade-up delay-2" @submit.prevent="handleSubmit" novalidate>
      <SlotRangePicker v-model="range" :show-times="true" />

      <!-- Live flag: enquiries that wanted this date -->
      <button
        v-if="matchingEnquiries.length > 0"
        type="button"
        class="enq-conflict-flag"
        @click="showConflict = true"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        {{ matchingEnquiries.length }} {{ matchingEnquiries.length === 1 ? 'enquiry' : 'enquiries' }} wanted this date — view
      </button>

      <div>
        <label class="field-label">Customer Name *</label>
        <input class="input" v-model="form.customer_name" placeholder="Full name" required />
      </div>
      <PhoneNumbersInput v-model="phones" :require-first="true" />
      <div class="form-grid-2">
        <div>
          <label class="field-label">Type of event</label>
          <select class="input" v-model="form.event_type">
            <option value="">— Select —</option>
            <option v-for="t in eventTypes" :key="t.id" :value="t.name">{{ t.name }}</option>
          </select>
        </div>
        <div v-if="eventTypeIsOther">
          <label class="field-label">Specify event</label>
          <input class="input" v-model="form.event_type_other" placeholder="e.g. Birthday, Temple function" />
        </div>
      </div>
      <div>
        <label class="field-label">Address</label>
        <textarea class="input" v-model="form.customer_address" placeholder="Full address"></textarea>
      </div>
      <!-- Peak/high Tamil-season nudge -->
      <div v-if="isHotDate && demandInfo" class="demand-banner" :class="'tier-' + demandInfo.demand.tier">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="flex-shrink:0;margin-top:1px"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        <div>
          <strong>{{ demandInfo.demand.label }} date</strong> — {{ demandInfo.tamil.month.en }} · {{ PAKSHA_LABEL[demandInfo.tamil.paksha].short }}.
          Most bookings on this date carry a premium ({{ premiumLabel }}).
        </div>
      </div>

      <div>
        <label class="field-label">Rent Amount (₹) *</label>
        <input type="number" class="input" v-model="form.rent" placeholder="0" min="0" required />
        <button
          v-if="showApply && demandInfo && suggestedRent != null"
          type="button"
          class="demand-apply"
          @click="applyPremium"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg>
          Apply {{ demandInfo.tamil.month.en }} {{ premiumLabel }} → {{ formatCurrency(suggestedRent) }}
        </button>
      </div>

      <TamilDemandBadge
        v-if="range.function_date"
        :date-str="range.function_date"
        :history="demandHistory"
        :rent="Number(form.rent) || null"
        variant="card"
      />

      <!-- Bill items (defaults pre-filled, editable, removable) -->
      <div style="border-top:1px solid var(--hair);padding-top:18px">
        <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="t-eyebrow">Bill items (optional)</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash)">
            Subtotal {{ formatCurrency(billItemsTotal) }} <span style="color:var(--ash-2);margin-left:6px">·</span>
            Total bill <span style="color:var(--ink);font-weight:600">{{ formatCurrency(totalBill) }}</span>
          </div>
        </div>
        <div v-if="billItemsForm.length === 0" style="font-size:12px;color:var(--ash);margin-bottom:8px">
          No bill items yet — add one below if you want to bill extras alongside the rent.
        </div>
        <!-- Flat row: a single amount. Per-unit row: rate × quantity = total. -->
        <template v-for="(item, i) in billItemsForm" :key="item._existing_id ?? item.category_id">
          <div v-if="!item.unit" class="bill-row">
            <div class="bill-row-label">{{ item.category_name }}</div>
            <input type="number" class="input bill-row-input" v-model="item.amount" placeholder="0" step="1000" min="0" />
            <button type="button" class="smb-nav-iconbtn" @click="removeBillItemRow(i)" :title="`Remove ${item.category_name}`">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div v-else class="bill-row bill-row-unit">
            <div class="bill-row-label">
              {{ item.category_name }}
              <span class="bill-unit-tag">{{ unitShort(item.unit) }}</span>
            </div>
            <div class="bill-unit-calc">
              <span class="bill-unit-cur">₹</span>
              <input type="number" class="input bill-unit-input" v-model="item.rate" placeholder="rate" min="0" :title="`Rate ${unitShort(item.unit)}`" />
              <span class="bill-unit-x">×</span>
              <input type="number" class="input bill-unit-input" v-model="item.quantity" :placeholder="unitQtyLabel(item.unit)" min="0" :title="unitQtyLabel(item.unit)" />
              <span class="bill-unit-eq">= {{ formatCurrency(lineTotal(item)) }}</span>
            </div>
            <button type="button" class="smb-nav-iconbtn" @click="removeBillItemRow(i)" :title="`Remove ${item.category_name}`">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
        </template>
        <div v-if="availableCategoriesForAdd.length" style="margin-top:8px">
          <select class="input" :value="''" @change="addBillItemRow">
            <option value="">+ Add bill item …</option>
            <option v-for="c in availableCategoriesForAdd" :key="c.id" :value="c.id">
              {{ c.name }}<template v-if="c.unit"> ({{ c.default_amount != null ? formatCurrency(Number(c.default_amount)) : '' }}{{ unitShort(c.unit) }})</template>
            </option>
          </select>
        </div>
      </div>

      <div style="border-top:1px solid var(--hair);padding-top:18px">
        <div class="t-eyebrow" style="margin-bottom:12px">Balance &amp; due date (optional)</div>
        <div class="form-grid-2">
          <div>
            <label class="field-label">Balance to collect (₹)</label>
            <input type="number" class="input" :value="form.expected_advance_amount" @input="onExpectedInput" placeholder="e.g. 50000" min="0" />
            <p v-if="!isEditing" style="margin-top:6px;font-size:12px;color:var(--ash)">
              Auto-set to the balance — total bill {{ formatCurrency(totalBill) }} − first advance {{ formatCurrency(firstAdvanceAmount) }} = <strong style="color:var(--ink)">{{ formatCurrency(suggestedExpected) }}</strong>. Edit to override. Drives the dashboard collection forecast.
            </p>
            <p v-if="expectedExceedsTotal" style="margin-top:6px;font-size:12px;color:var(--signal-red,#c0392b)">
              Greater than total bill ({{ formatCurrency(Number(form.expected_advance_amount)) }} &gt; {{ formatCurrency(totalBill) }}) — likely a leftover from the previous rent / bill items.
            </p>
          </div>
          <div>
            <label class="field-label">Balance due by</label>
            <input type="date" class="input" :value="form.advance_due_date" @input="onDueDateInput" />
            <p style="margin-top:6px;font-size:12px;color:var(--ash)">
              Defaults to 30 days from today (or the function date if that's sooner).
            </p>
          </div>
        </div>
      </div>

      <!-- Advance received now (Create: #1; Edit: next free slot) -->
      <div style="border-top:1px solid var(--hair);padding-top:18px">
        <div class="t-eyebrow" style="margin-bottom:12px">
          {{ isEditing ? 'Record an advance payment (optional)' : 'First advance — received at booking (optional)' }}
        </div>
        <p v-if="nextAdvanceSlot != null" style="font-size:12px;color:var(--ash);margin:-4px 0 12px">
          <template v-if="isEditing">
            Adds a new payment to this booking, saved as
            <strong>Advance #{{ nextAdvanceSlot }}</strong> — visible on the Advances tab afterwards. Bank account is left blank; fill it there.
          </template>
          <template v-else>
            Some customers pay an advance right at booking. Record it here and it's saved as
            <strong>Advance #1</strong> — visible on the Advances tab afterwards.
          </template>
        </p>
        <p v-else style="font-size:12px;color:var(--signal-red,#c0392b);margin:-4px 0 12px">
          All 3 advance slots are already used on this booking — manage them on the Advances tab.
        </p>
        <div class="form-grid-2">
          <div>
            <label class="field-label">Amount (₹)</label>
            <input type="number" class="input" :value="advanceNow.amount" @input="onAdvanceAmountInput" placeholder="e.g. 10000" min="0" :disabled="nextAdvanceSlot == null" />
          </div>
          <div>
            <label class="field-label">Payment method</label>
            <select class="input" v-model="advanceNow.method" :disabled="nextAdvanceSlot == null">
              <option v-for="m in PAYMENT_METHODS" :key="m" :value="m">{{ PAYMENT_METHOD_LABEL[m] }}</option>
            </select>
          </div>
        </div>
        <!-- Advance policy: 40–60% of rent. Suggest the 50% midpoint, warn (don't block) if outside. -->
        <p v-if="!isEditing && rentForAdvance > 0 && nextAdvanceSlot != null" style="font-size:12px;color:var(--ash);margin:8px 0 0">
          Policy: advance is <strong style="color:var(--ink)">40–60% of rent</strong> — {{ formatCurrency(advanceMin) }}–{{ formatCurrency(advanceMax) }}. Suggested 50% = <strong style="color:var(--ink)">{{ formatCurrency(advanceSuggested) }}</strong> (prefilled — clear it if no advance was collected).
        </p>
        <p v-if="advanceOutOfRange" style="font-size:12px;color:var(--signal-red,#c0392b);margin:6px 0 0">
          {{ formatCurrency(Number(advanceNow.amount)) }} is {{ advanceBelowMin ? 'below 40%' : 'above 60%' }} of rent ({{ formatCurrency(advanceMin) }}–{{ formatCurrency(advanceMax) }}). Save anyway if that's intended.
        </p>
        <div v-if="nextAdvanceSlot != null" class="form-grid-2" style="margin-top:12px">
          <div>
            <label class="field-label">Advance date</label>
            <input type="date" class="input" v-model="advanceNow.date" />
            <p style="font-size:11px;color:var(--ash);margin-top:6px">When the advance was actually received. Defaults to today.</p>
          </div>
        </div>
        <div v-if="Number(advanceNow.amount) > 0 && nextAdvanceSlot != null" style="margin-top:12px">
          <label class="field-label">Received in account *</label>
          <select class="input" v-model="advanceNow.account_id">
            <option value="">— Pick where the money landed —</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}<span v-if="a.type !== 'bank'"> ({{ a.type }})</span></option>
          </select>
          <p style="font-size:11px;color:var(--ash);margin-top:6px">Drives the Treasury balance. Cash defaults to the Cash on hand account; UPI / cheque / bank transfer — pick the receiving account.</p>
        </div>
      </div>

      <div>
        <label class="field-label">Notes</label>
        <textarea class="input" v-model="form.notes" placeholder="Anything specific to this function"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button type="submit" class="btn btn-primary" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12l5 5L20 7"/></svg>
          {{ loading ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save changes' : 'Create booking') }}
        </button>
        <button type="button" class="btn" @click="isEditing ? router.push({ name: 'booking-detail', params: { id: editingId! } }) : router.push({ name: 'bookings' })">Cancel</button>
      </div>
    </form>

    <!-- Under-priced peak-date confirm -->
    <teleport to="body">
      <div v-if="showUnderpriced && demandInfo" class="smb-modal-overlay" @click.self="showUnderpriced = false">
        <div class="smb-modal">
          <div class="smb-modal-head">
            <h3 class="t-h3">{{ demandInfo.demand.label }} date</h3>
            <button class="smb-nav-iconbtn" @click="showUnderpriced = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <p style="color:var(--ash);line-height:1.6">
              This is a <strong style="color:var(--ink)">{{ demandInfo.demand.label }}</strong> Tamil-season date —
              <strong style="color:var(--ink)">{{ demandInfo.tamil.month.en }} · {{ PAKSHA_LABEL[demandInfo.tamil.paksha].short }}</strong>.
              The suggested premium ({{ premiumLabel }}<span v-if="suggestedRent != null"> → {{ formatCurrency(suggestedRent) }}</span>)
              isn't reflected in the rent. Save without it?
            </p>
          </div>
          <div class="smb-modal-foot">
            <button class="btn" @click="showUnderpriced = false">Cancel</button>
            <button class="btn" @click="saveAnyway">Save anyway</button>
            <button class="btn btn-primary" @click="applyAndSave">Apply premium &amp; save</button>
          </div>
        </div>
      </div>

      <!-- Conflicting enquiries confirm -->
      <div v-if="showConflict" class="smb-modal-overlay" @click.self="showConflict = false">
        <div class="smb-modal">
          <div class="smb-modal-head">
            <h3 class="t-h3">Enquiries wanted this date</h3>
            <button class="smb-nav-iconbtn" @click="showConflict = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <p style="color:var(--ash);line-height:1.55;margin-bottom:14px">
              {{ matchingEnquiries.length }} open {{ matchingEnquiries.length === 1 ? 'enquiry' : 'enquiries' }}
              asked for an overlapping date. Booking this date for someone else means these leads miss out —
              you may want to call them or offer an alternate.
            </p>
            <div
              v-for="m in matchingEnquiries"
              :key="m.enquiry_id + m.start_date + m.start_slot"
              class="cancel-enq-row"
            >
              <div style="min-width:0;flex:1">
                <div style="font-weight:600;font-size:14px">{{ m.customer_name }}</div>
                <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:3px;letter-spacing:0.04em">
                  <a v-if="telHref(m.customer_phone)" :href="telHref(m.customer_phone)!" @click.stop style="color:var(--accent-ink);text-decoration:none">{{ m.customer_phone }}</a>
                  <span v-else>{{ m.customer_phone || 'no phone' }}</span>
                  <a v-if="waHref(m.customer_phone)" :href="waHref(m.customer_phone)!" target="_blank" rel="noopener" @click.stop style="margin-left:8px;color:#1a8a4a;text-decoration:none">wa</a>
                  <span style="margin-left:8px">· {{ formatRange(m) }}</span>
                  <span v-if="m.is_primary" style="margin-left:8px;color:var(--accent-ink)">PRIMARY</span>
                  <span v-else style="margin-left:8px">ALT</span>
                </div>
              </div>
              <button class="smb-filter-pill" @click.stop="router.push({ name: 'enquiry-detail', params: { id: m.enquiry_id } })">Open →</button>
            </div>
          </div>
          <div class="smb-modal-foot">
            <button class="btn" @click="showConflict = false">Go back</button>
            <button class="btn btn-primary" @click="continueWithConflict">Continue booking</button>
          </div>
        </div>
      </div>

      <!-- Balance exceeds total bill confirm -->
      <div v-if="showExpectedExceeds" class="smb-modal-overlay" @click.self="showExpectedExceeds = false">
        <div class="smb-modal">
          <div class="smb-modal-head">
            <h3 class="t-h3">Balance to collect exceeds total bill</h3>
            <button class="smb-nav-iconbtn" @click="showExpectedExceeds = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <p style="color:var(--ash);line-height:1.55">
              You're saving with a <strong style="color:var(--ink)">Balance to collect of {{ formatCurrency(Number(form.expected_advance_amount)) }}</strong>
              against a <strong style="color:var(--ink)">Total bill of {{ formatCurrency(totalBill) }}</strong>
              ({{ formatCurrency(Number(form.rent) || 0) }} rent + {{ formatCurrency(billItemsTotal) }} bill items).
              The balance is larger than the total bill — usually a leftover from earlier values.
            </p>
          </div>
          <div class="smb-modal-foot">
            <button class="btn" @click="showExpectedExceeds = false">Cancel</button>
            <button class="btn" @click="saveAnywayExpected">Save anyway</button>
            <button class="btn btn-primary" @click="syncExpectedToTotal">Sync to total bill &amp; save</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.demand-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--accent, #b5651d);
  background: var(--accent-soft, rgba(181,101,29,0.10));
  color: var(--ink);
  font-size: 13px;
  line-height: 1.45;
}
.demand-banner svg { color: var(--accent-ink, #b5651d); }
.demand-banner strong { color: var(--accent-ink, #b5651d); }

.demand-apply {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 7px 12px;
  border: 1px solid var(--accent-ink, #b5651d);
  border-radius: 999px;
  background: transparent;
  color: var(--accent-ink, #b5651d);
  font: 600 12px/1 var(--font-mono, monospace);
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.demand-apply:hover { background: var(--accent-soft, rgba(181,101,29,0.10)); }

.enq-conflict-flag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  margin-top: -6px;
  padding: 8px 12px;
  border: 1px solid var(--signal-red, #c0392b);
  border-radius: 8px;
  background: transparent;
  color: var(--signal-red, #c0392b);
  font: 500 12px/1 var(--font-mono, monospace);
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.enq-conflict-flag:hover { background: rgba(192, 57, 43, 0.07); }

.bill-row {
  display: grid;
  grid-template-columns: 1fr 140px 42px;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed var(--hair);
}
.bill-row:last-of-type { border-bottom: none; }
.bill-row-label {
  font-size: 13.5px;
  color: var(--ink);
  font-weight: 500;
}
.bill-row-input { padding: 8px 10px; text-align: right; }

/* Per-unit row reuses the flat-row grid (label · inputs · remove) but lets the
   middle column auto-size to the rate×qty cluster. Because the remove column is
   fixed, the cluster's right edge and the × button line up exactly with the
   flat amount boxes above/below. */
.bill-row-unit {
  grid-template-columns: 1fr auto 42px;
}
.bill-unit-tag {
  margin-left: 6px;
  font: 500 10.5px/1 var(--font-mono, monospace);
  color: var(--accent-ink, #b5651d);
  letter-spacing: 0.02em;
}
.bill-unit-calc {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.bill-unit-cur { color: var(--ash); font-size: 13px; }
.bill-unit-input { width: 76px; padding: 8px 10px; text-align: right; }
.bill-unit-x, .bill-unit-eq { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--ash); white-space: nowrap; }
.bill-unit-eq { color: var(--ink); font-weight: 600; min-width: 84px; text-align: right; }

@media (max-width: 520px) {
  .bill-row { grid-template-columns: 1fr 110px 38px; gap: 8px; }
  .bill-row-label { font-size: 12.5px; }
  /* Stack on narrow screens: label + × on top, the rate×qty cluster below. */
  .bill-row-unit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 8px;
  }
  .bill-row-unit .bill-row-label { flex: 1 1 auto; order: 1; }
  .bill-row-unit > .smb-nav-iconbtn { order: 2; }
  .bill-row-unit .bill-unit-calc { order: 3; flex: 1 1 100%; margin-top: 6px; }
  .bill-unit-input { width: 64px; }
}
</style>
