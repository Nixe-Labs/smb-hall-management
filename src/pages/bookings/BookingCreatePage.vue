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
import { formatRange } from '@/lib/utils/slots'
import type { DaySlot } from '@/types/enums'
import type { Enquiry, EnquiryDate, EnquiryMatch } from '@/types/database'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const toast = useToast()

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
async function fetchMatches() {
  const r = range.value
  if (!r.start_date || !r.end_date) { matchingEnquiries.value = []; return }
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
const premiumConfirmed = ref(false)
const conflictConfirmed = ref(false)

onMounted(() => {
  if (fromEnquiryId) prefillFromEnquiry(fromEnquiryId)
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

async function doSave() {
  const r = range.value
  // Live availability check before insert (UNIQUE on booking_slots is the safety net)
  const { data: available, error: rpcErr } = await supabase.rpc('is_range_available', {
    s_date: r.start_date,
    s_slot: r.start_slot,
    e_date: r.end_date,
    e_slot: r.end_slot,
    exclude_booking: null,
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
    const { data: created, error } = await supabase.from('bookings').insert({
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

    // If this booking was converted from an enquiry, link them and mark enquiry converted
    if (fromEnquiryId && created?.id) {
      await supabase
        .from('enquiries')
        .update({ status: 'converted', converted_booking_id: created.id })
        .eq('id', fromEnquiryId)
    }

    toast.add({ severity: 'success', summary: 'Created', detail: 'Booking created successfully', life: 3000 })
    router.push({ name: 'bookings' })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to create booking'
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
      <button class="smb-nav-iconbtn" @click="router.push({ name: 'bookings' })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
      </button>
      <span class="t-mono" style="color:var(--ash)">02 / BOOKINGS / NEW</span>
    </div>

    <div style="padding-top:8px;padding-bottom:32px" class="fade-up">
      <div class="t-eyebrow" style="margin-bottom:12px">New entry</div>
      <h1 class="t-h1">Book a date.</h1>
      <p style="color:var(--ash);margin-top:12px;max-width:520px">
        Confirm a function with the customer's details. The hall use period can span across days — pick a start and end half-day.
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

      <div style="border-top:1px solid var(--hair);padding-top:18px">
        <div class="t-eyebrow" style="margin-bottom:12px">Advance forecast (optional)</div>
        <div class="form-grid-2">
          <div>
            <label class="field-label">Expected advance (₹)</label>
            <input type="number" class="input" v-model="form.expected_advance_amount" placeholder="e.g. 50000" min="0" />
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

      <div>
        <label class="field-label">Notes</label>
        <textarea class="input" v-model="form.notes" placeholder="Anything specific to this function"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button type="submit" class="btn btn-primary" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12l5 5L20 7"/></svg>
          {{ loading ? 'Creating…' : 'Create booking' }}
        </button>
        <button type="button" class="btn" @click="router.push({ name: 'bookings' })">Cancel</button>
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
</style>
