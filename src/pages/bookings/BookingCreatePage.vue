<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import SlotRangePicker from '@/components/booking/SlotRangePicker.vue'
import TamilDemandBadge from '@/components/common/TamilDemandBadge.vue'
import { defaultDueDate } from '@/lib/utils/forecast'
import { buildDemandHistory, getDemandForDate, premiumAmount, type DemandHistory } from '@/lib/utils/tamilDemand'
import { PAKSHA_LABEL } from '@/lib/utils/tamilCalendar'
import { formatCurrency } from '@/lib/utils/currency'
import { toISODate } from '@/lib/utils/dates'
import { formatRange } from '@/lib/utils/slots'
import type { DaySlot, PaymentMethod } from '@/types/enums'
import type { Booking, BillCategory, Enquiry, EnquiryDate, EnquiryMatch } from '@/types/database'

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
  customer_phone: '',
  customer_address: '',
  rent: '',
  notes: '',
  expected_advance_amount: '',
  advance_due_date: '',
})

// ── Advance received now (shown in both modes) ───────────────
// In Create: this is the booking-time advance (Advance #1).
// In Edit: this is an additional advance — assigned the next free slot
// (#1/#2/#3). Bank account left blank; fill on the Advances tab.
const advanceNow = ref<{ amount: string; method: PaymentMethod }>({
  amount: '',
  method: 'cash',
})
const existingAdvanceNumbers = ref<Set<number>>(new Set())
const nextAdvanceSlot = computed<number | null>(() => {
  for (const n of [1, 2, 3]) {
    if (!existingAdvanceNumbers.value.has(n)) return n
  }
  return null
})

// ── Bill items (create + edit) ───────────────────────────────
interface FormBillItem {
  category_id: string
  category_name: string
  amount: string
  _existing_id?: string  // bill_items.id when loaded from an existing booking
}
const billCategories = ref<BillCategory[]>([])
const billItemsForm = ref<FormBillItem[]>([])
// Originals loaded from DB on edit, so save-time can diff for delete-removed.
const originalBillItems = ref<Map<string, number>>(new Map())

async function loadBillCategories() {
  const { data } = await supabase
    .from('bill_categories').select('*').eq('is_active', true).order('sort_order')
  billCategories.value = (data as BillCategory[]) ?? []
}

function prefillDefaultBillItems() {
  billItemsForm.value = billCategories.value
    .filter(c => c.default_amount != null && Number(c.default_amount) > 0)
    .map(c => ({ category_id: c.id, category_name: c.name, amount: String(c.default_amount) }))
}

async function loadBillItemsForBooking(bookingId: string) {
  const { data } = await supabase
    .from('bill_items').select('id, category_id, amount').eq('booking_id', bookingId)
  const rows = (data as { id: string; category_id: string; amount: number }[]) ?? []
  billItemsForm.value = rows.map(r => ({
    category_id: r.category_id,
    category_name: billCategories.value.find(c => c.id === r.category_id)?.name ?? 'Unknown',
    amount: String(r.amount),
    _existing_id: r.id,
  }))
  originalBillItems.value = new Map(rows.map(r => [r.id, Number(r.amount)]))
}

const availableCategoriesForAdd = computed(() => {
  const used = new Set(billItemsForm.value.map(r => r.category_id))
  return billCategories.value.filter(c => !used.has(c.id))
})

const billItemsTotal = computed(() =>
  billItemsForm.value.reduce((s, r) => s + (Number(r.amount) || 0), 0)
)

function addBillItemRow(e: Event) {
  const sel = e.target as HTMLSelectElement
  const id = sel.value
  if (!id) return
  const cat = billCategories.value.find(c => c.id === id)
  if (!cat) return
  billItemsForm.value.push({
    category_id: cat.id,
    category_name: cat.name,
    amount: cat.default_amount != null ? String(cat.default_amount) : '0',
  })
  sel.value = ''  // reset dropdown
}

function removeBillItemRow(i: number) {
  billItemsForm.value.splice(i, 1)
}

/**
 * Reconcile billItemsForm against what's currently in the DB for `bookingId`.
 *   - new rows with amount > 0 → INSERT
 *   - existing rows whose amount changed → UPDATE
 *   - existing rows now at 0/empty, or removed from the form → DELETE
 */
async function syncBillItems(bookingId: string) {
  const inserts: { booking_id: string; category_id: string; amount: number }[] = []
  const updates: { id: string; amount: number }[] = []
  const deletes: string[] = []
  const seen = new Set<string>()

  for (const row of billItemsForm.value) {
    const amount = Number(row.amount) || 0
    // Non-zero is the "keep" condition — negative is valid for Discount entries.
    if (row._existing_id) {
      seen.add(row._existing_id)
      if (amount !== 0) {
        const orig = originalBillItems.value.get(row._existing_id)
        if (orig !== amount) updates.push({ id: row._existing_id, amount })
      } else {
        deletes.push(row._existing_id)
      }
    } else if (amount !== 0) {
      inserts.push({ booking_id: bookingId, category_id: row.category_id, amount })
    }
  }
  // Originals removed by the user entirely
  for (const id of originalBillItems.value.keys()) {
    if (!seen.has(id)) deletes.push(id)
  }

  if (deletes.length) await supabase.from('bill_items').delete().in('id', deletes)
  for (const u of updates) {
    await supabase.from('bill_items').update({ amount: u.amount }).eq('id', u.id)
  }
  if (inserts.length) await supabase.from('bill_items').insert(inserts)
}

// User's manual edits to advance_due_date win — only auto-default while it's blank.
let dueDateTouched = false
watch(
  () => range.value.function_date,
  (next) => {
    if (next && !dueDateTouched && !form.value.advance_due_date) {
      form.value.advance_due_date = defaultDueDate(next)
    }
  }
)
function onDueDateInput(e: Event) {
  dueDateTouched = true
  form.value.advance_due_date = (e.target as HTMLInputElement).value
}

async function loadForEdit(id: string) {
  const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single()
  if (error || !data) {
    toast.add({ severity: 'error', summary: 'Not found', detail: 'Booking not found', life: 5000 })
    router.push({ name: 'bookings' })
    return
  }
  const b = data as Booking
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
    customer_phone: b.customer_phone ?? '',
    customer_address: b.customer_address ?? '',
    rent: b.rent != null ? String(b.rent) : '',
    notes: b.notes ?? '',
    expected_advance_amount: b.expected_advance_amount != null ? String(b.expected_advance_amount) : '',
    advance_due_date: b.advance_due_date ?? '',
  }
  // Keep the existing due-date; don't let the function-date watcher auto-default it.
  dueDateTouched = true
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
  form.value.customer_phone = enquiry.customer_phone ?? ''
  form.value.customer_address = enquiry.customer_address ?? ''
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

function telHref(phone: string | null): string | null {
  if (!phone) return null
  const c = phone.replace(/[^\d+]/g, '')
  return c ? `tel:${c}` : null
}
function waHref(phone: string | null): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (d.length === 10) d = '91' + d
  return d ? `https://wa.me/${d}` : null
}

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
// We do NOT require tb>0 so the case "rent=0 but expected=5K" still warns.
const expectedExceedsTotal = computed(() => {
  const exp = Number(form.value.expected_advance_amount)
  return exp > 0 && exp > totalBill.value
})

// Reset the "Save anyway" acknowledgement whenever any input that feeds the
// check changes (rent, expected, or any bill-item amount).
watch(
  () => [form.value.rent, form.value.expected_advance_amount, billItemsTotal.value],
  () => { expectedConfirmed.value = false }
)

onMounted(async () => {
  // Categories must be loaded before edit prefill (to resolve names) or
  // before create prefill (to populate defaults)
  await loadBillCategories()
  if (isEditing.value) {
    await loadForEdit(editingId.value!)
  } else {
    if (fromEnquiryId) await prefillFromEnquiry(fromEnquiryId)
    prefillDefaultBillItems()
  }
  loadDemandHistory()
})

function handleSubmit() {
  const r = range.value
  if (!r.function_date || !r.start_date || !r.end_date || !form.value.customer_name || !form.value.rent) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Please fill in dates, customer name, and rent', life: 3000 })
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
    const payload = {
      function_date: r.function_date,
      start_date: r.start_date,
      start_slot: r.start_slot,
      end_date: r.end_date,
      end_slot: r.end_slot,
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      customer_name: form.value.customer_name,
      customer_phone: form.value.customer_phone || null,
      customer_address: form.value.customer_address || null,
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
            payment_date: toISODate(new Date()),
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
          payment_date: toISODate(new Date()),
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

    <form class="form-stack fade-up delay-2" @submit.prevent="handleSubmit">
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

      <div class="form-grid-2">
        <div>
          <label class="field-label">Customer Name *</label>
          <input class="input" v-model="form.customer_name" placeholder="Full name" required />
        </div>
        <div>
          <label class="field-label">Phone</label>
          <input class="input" v-model="form.customer_phone" placeholder="+91 …" />
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
        <div v-for="(item, i) in billItemsForm" :key="item._existing_id ?? item.category_id" class="bill-row">
          <div class="bill-row-label">{{ item.category_name }}</div>
          <input type="number" class="input bill-row-input" v-model="item.amount" placeholder="0" />
          <button type="button" class="smb-nav-iconbtn" @click="removeBillItemRow(i)" :title="`Remove ${item.category_name}`">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
          </button>
        </div>
        <div v-if="availableCategoriesForAdd.length" style="margin-top:8px">
          <select class="input" :value="''" @change="addBillItemRow">
            <option value="">+ Add bill item …</option>
            <option v-for="c in availableCategoriesForAdd" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>

      <div style="border-top:1px solid var(--hair);padding-top:18px">
        <div class="t-eyebrow" style="margin-bottom:12px">Advance forecast (optional)</div>
        <div class="form-grid-2">
          <div>
            <label class="field-label">Expected advance (₹)</label>
            <input type="number" class="input" v-model="form.expected_advance_amount" placeholder="e.g. 50000" min="0" />
            <p v-if="expectedExceedsTotal" style="margin-top:6px;font-size:12px;color:var(--signal-red,#c0392b)">
              Greater than total bill ({{ formatCurrency(Number(form.expected_advance_amount)) }} &gt; {{ formatCurrency(totalBill) }}) — likely a leftover from the previous rent / bill items.
            </p>
          </div>
          <div>
            <label class="field-label">Advance due by</label>
            <input type="date" class="input" :value="form.advance_due_date" @input="onDueDateInput" />
            <p style="margin-top:6px;font-size:12px;color:var(--ash)">
              Defaults to 30 days before the function date.
            </p>
          </div>
        </div>
      </div>

      <!-- Advance received now (Create: #1; Edit: next free slot) -->
      <div style="border-top:1px solid var(--hair);padding-top:18px">
        <div class="t-eyebrow" style="margin-bottom:12px">
          {{ isEditing ? 'Record an advance payment (optional)' : 'Advance received at booking (optional)' }}
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
            <input type="number" class="input" v-model="advanceNow.amount" placeholder="e.g. 10000" min="0" :disabled="nextAdvanceSlot == null" />
          </div>
          <div>
            <label class="field-label">Payment method</label>
            <select class="input" v-model="advanceNow.method" :disabled="nextAdvanceSlot == null">
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online</option>
            </select>
          </div>
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

      <!-- Expected-advance exceeds total bill confirm -->
      <div v-if="showExpectedExceeds" class="smb-modal-overlay" @click.self="showExpectedExceeds = false">
        <div class="smb-modal">
          <div class="smb-modal-head">
            <h3 class="t-h3">Expected advance exceeds total bill</h3>
            <button class="smb-nav-iconbtn" @click="showExpectedExceeds = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <p style="color:var(--ash);line-height:1.55">
              You're saving with <strong style="color:var(--ink)">Expected advance {{ formatCurrency(Number(form.expected_advance_amount)) }}</strong>
              against a <strong style="color:var(--ink)">Total bill of {{ formatCurrency(totalBill) }}</strong>
              ({{ formatCurrency(Number(form.rent) || 0) }} rent + {{ formatCurrency(billItemsTotal) }} bill items).
              The expected advance is larger than the total bill — usually a leftover from earlier values.
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

@media (max-width: 520px) {
  .bill-row { grid-template-columns: 1fr 110px 38px; gap: 8px; }
  .bill-row-label { font-size: 12.5px; }
}
</style>
