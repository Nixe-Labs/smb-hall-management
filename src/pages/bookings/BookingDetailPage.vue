<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/composables/usePermissions'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatTimeRange } from '@/lib/utils/dates'
import { calculateBookingSummary } from '@/lib/utils/calculations'
import { defaultDueDate, dueLabel } from '@/lib/utils/forecast'
import { formatRange } from '@/lib/utils/slots'
import type { Booking, AdvancePayment, BillItem, Expense, Deposit, BillCategory, ExpenseCategory, BankAccount, EnquiryMatch } from '@/types/database'
import TamilDemandBadge from '@/components/common/TamilDemandBadge.vue'
import AdvancePaymentList from '@/components/finance/AdvancePaymentList.vue'
import BillItemsTable from '@/components/finance/BillItemsTable.vue'
import ExpensesTable from '@/components/finance/ExpensesTable.vue'
import DepositsTable from '@/components/finance/DepositsTable.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { canEdit, canDelete } = usePermissions()

const bookingId = computed(() => route.params.id as string)
const activeTab = ref('advances')
const showCancel = ref(false)
const showDelete = ref(false)
const showEditForecast = ref(false)
const cancelling = ref(false)
const deleting = ref(false)
const savingForecast = ref(false)
const loading = ref(true)
const editForecast = ref<{ expected_advance_amount: string; advance_due_date: string }>({
  expected_advance_amount: '',
  advance_due_date: '',
})
const matchingEnquiries = ref<EnquiryMatch[]>([])
const loadingEnquiries = ref(false)

const booking = ref<Booking | null>(null)
const creatorName = ref<string | null>(null)
const advances = ref<AdvancePayment[]>([])
const billItems = ref<BillItem[]>([])
const expenses = ref<Expense[]>([])
const deposits = ref<Deposit[]>([])
const billCategories = ref<BillCategory[]>([])
const expenseCategories = ref<ExpenseCategory[]>([])
const bankAccounts = ref<BankAccount[]>([])

const summary = computed(() => {
  if (!booking.value) return null
  return calculateBookingSummary(booking.value.rent, advances.value, billItems.value, expenses.value, deposits.value)
})

const advanceOwed = computed(() => {
  const b = booking.value
  if (!b || b.expected_advance_amount == null) return null
  const collected = advances.value.reduce((s, a) => s + Number(a.amount), 0)
  return Math.max(Number(b.expected_advance_amount) - collected, 0)
})

const dueLabelText = computed(() =>
  booking.value?.advance_due_date ? dueLabel(booking.value.advance_due_date) : null
)

const hallUseTimeText = computed(() =>
  booking.value ? formatTimeRange(booking.value.start_time, booking.value.end_time) : ''
)

function openEditForecast() {
  if (!booking.value) return
  editForecast.value = {
    expected_advance_amount: booking.value.expected_advance_amount != null ? String(booking.value.expected_advance_amount) : '',
    advance_due_date: booking.value.advance_due_date ?? defaultDueDate(booking.value.function_date),
  }
  showEditForecast.value = true
}

async function saveForecast() {
  if (!booking.value) return
  savingForecast.value = true
  try {
    const expected = editForecast.value.expected_advance_amount
      ? Number(editForecast.value.expected_advance_amount)
      : null
    const due = editForecast.value.advance_due_date || null
    const { error } = await supabase
      .from('bookings')
      .update({ expected_advance_amount: expected, advance_due_date: due })
      .eq('id', bookingId.value)
    if (error) throw error
    booking.value.expected_advance_amount = expected
    booking.value.advance_due_date = due
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Forecast updated', life: 3000 })
    showEditForecast.value = false
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to save forecast'
    toast.add({ severity: 'error', summary: 'Error', detail: message, life: 5000 })
  } finally {
    savingForecast.value = false
  }
}

const computedStatus = computed(() => {
  if (!booking.value) return null
  if (booking.value.status === 'cancelled') return 'cancelled'
  const d = new Date(booking.value.function_date + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  if (d.getTime() < t.getTime()) return 'completed'
  if (d.getTime() === t.getTime()) return 'ongoing'
  return 'upcoming'
})

const statusLabel = computed(() => {
  const m: Record<string, string> = { ongoing: 'Today', completed: 'Completed', cancelled: 'Cancelled', upcoming: 'Upcoming' }
  return m[computedStatus.value ?? ''] ?? ''
})

async function fetchAll() {
  loading.value = true
  try {
    const [bookingRes, advancesRes, billItemsRes, expensesRes, depositsRes, billCatRes, expCatRes, bankRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('id', bookingId.value).single(),
      supabase.from('advance_payments').select('*').eq('booking_id', bookingId.value).order('advance_number'),
      supabase.from('bill_items').select('*').eq('booking_id', bookingId.value),
      supabase.from('expenses').select('*').eq('booking_id', bookingId.value),
      supabase.from('deposits').select('*').eq('booking_id', bookingId.value),
      supabase.from('bill_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('expense_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('bank_accounts').select('*').eq('is_active', true),
    ])
    booking.value = bookingRes.data as Booking
    advances.value = (advancesRes.data as AdvancePayment[]) ?? []
    billItems.value = (billItemsRes.data as BillItem[]) ?? []
    expenses.value = (expensesRes.data as Expense[]) ?? []
    deposits.value = (depositsRes.data as Deposit[]) ?? []
    billCategories.value = (billCatRes.data as BillCategory[]) ?? []
    expenseCategories.value = (expCatRes.data as ExpenseCategory[]) ?? []
    bankAccounts.value = (bankRes.data as BankAccount[]) ?? []

    // Resolve who created the booking
    creatorName.value = null
    if (booking.value?.created_by) {
      const { data: prof } = await supabase
        .from('profiles').select('full_name').eq('id', booking.value.created_by).single()
      creatorName.value = (prof as { full_name: string | null } | null)?.full_name ?? null
    }
  } finally {
    loading.value = false
  }
}

async function openCancel() {
  showCancel.value = true
  if (!booking.value) return
  loadingEnquiries.value = true
  matchingEnquiries.value = []
  try {
    const { data } = await supabase.rpc('enquiries_for_range', {
      p_start_date: booking.value.start_date,
      p_start_slot: booking.value.start_slot,
      p_end_date: booking.value.end_date,
      p_end_slot: booking.value.end_slot,
    })
    matchingEnquiries.value = (data as EnquiryMatch[]) ?? []
  } finally {
    loadingEnquiries.value = false
  }
}

async function cancelBooking() {
  cancelling.value = true
  try {
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId.value)
    if (error) throw error
    if (booking.value) booking.value.status = 'cancelled'
    toast.add({ severity: 'success', summary: 'Cancelled', detail: 'Booking cancelled', life: 3000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 })
  } finally {
    cancelling.value = false
    showCancel.value = false
  }
}

async function deleteBooking() {
  deleting.value = true
  try {
    await Promise.all([
      supabase.from('advance_payments').delete().eq('booking_id', bookingId.value),
      supabase.from('bill_items').delete().eq('booking_id', bookingId.value),
      supabase.from('expenses').delete().eq('booking_id', bookingId.value),
      supabase.from('deposits').delete().eq('booking_id', bookingId.value),
    ])
    const { error } = await supabase.from('bookings').delete().eq('id', bookingId.value)
    if (error) throw error
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Booking deleted', life: 3000 })
    router.push({ name: 'bookings' })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 })
  } finally {
    deleting.value = false
    showDelete.value = false
  }
}

async function generateInvoice() {
  const { buildInvoiceDocument } = await import('@/lib/pdf/invoiceTemplate')
  const { downloadInvoice } = await import('@/lib/pdf/pdfGenerator')
  if (!booking.value || !summary.value) return
  const doc = buildInvoiceDocument({ booking: booking.value, advances: advances.value, billItems: billItems.value, billCategories: billCategories.value, summary: summary.value })
  downloadInvoice(doc, `Invoice-${booking.value.customer_name}-${booking.value.function_date}.pdf`)
}

onMounted(fetchAll)
</script>

<template>
  <div class="screen">
    <!-- Back -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-top:24px" class="fade-in">
      <button class="smb-nav-iconbtn" @click="router.push({ name: 'bookings' })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
      </button>
      <span class="t-mono" style="color:var(--ash)">02 / BOOKINGS / {{ bookingId }}</span>
    </div>

    <div v-if="loading" class="loading-center"><div class="smb-spinner"></div></div>

    <template v-else-if="booking">
      <!-- Detail hero -->
      <div class="detail-hero fade-up">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:24px;flex-wrap:wrap">
          <div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
              <span :class="['tag', 'tag-' + computedStatus]">{{ statusLabel }}</span>
              <span class="t-mono" style="color:var(--ash)">{{ formatDate(booking.function_date) }}</span>
              <span v-if="creatorName" class="t-mono" style="color:var(--ash)">· Booked by {{ creatorName }}</span>
            </div>
            <h1 class="t-h1" style="max-width:800px">{{ booking.customer_name }}.</h1>
            <div class="t-mono" style="color:var(--ash);margin-top:12px;font-size:12px;letter-spacing:0.04em">
              HALL USE · {{ formatRange(booking) }}<span v-if="hallUseTimeText"> · {{ hallUseTimeText }}</span>
            </div>
            <div style="margin-top:10px">
              <TamilDemandBadge :date-str="booking.function_date" variant="inline" />
            </div>
            <div v-if="booking.notes" style="color:var(--ash);margin-top:12px;font-size:14px">{{ booking.notes }}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" @click="generateInvoice">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
              Invoice
            </button>
            <button v-if="canEdit && computedStatus !== 'cancelled'" class="btn btn-sm btn-danger" @click="openCancel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
              Cancel
            </button>
            <button v-if="canDelete" class="btn btn-sm btn-danger" @click="showDelete = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Meta grid -->
      <div class="detail-meta-grid fade-up delay-2">
        <div class="detail-meta-cell">
          <div class="label">Hall Rent</div>
          <div class="value">{{ formatCurrency(booking.rent) }}</div>
        </div>
        <div class="detail-meta-cell">
          <div class="label">Total Bill</div>
          <div class="value">{{ summary ? formatCurrency(summary.total_bill) : '—' }}</div>
        </div>
        <div class="detail-meta-cell">
          <div class="label">Total Paid</div>
          <div class="value" style="color:var(--accent-ink)">{{ summary ? formatCurrency(summary.total_paid) : '—' }}</div>
        </div>
        <div class="detail-meta-cell">
          <div class="label">Pending Balance</div>
          <div class="value" :style="{ color: summary && summary.pending_balance > 0 ? 'var(--signal-red)' : 'var(--ink)' }">
            {{ summary ? formatCurrency(summary.pending_balance) : '—' }}
          </div>
        </div>
      </div>

      <!-- Customer + Financial summary -->
      <div class="dash-grid fade-up delay-3" style="min-height:0">
        <div style="min-height:0">
          <div class="t-eyebrow" style="margin-bottom:8px">Customer</div>
          <h2 class="t-h2" style="margin-bottom:24px">Contact</h2>
          <div class="form-grid-2" style="gap:24px">
            <div>
              <div class="t-eyebrow" style="margin-bottom:8px">Phone</div>
              <div style="font-size:16px">{{ booking.customer_phone || '—' }}</div>
            </div>
            <div>
              <div class="t-eyebrow" style="margin-bottom:8px">Address</div>
              <div style="font-size:14px;line-height:1.5">{{ booking.customer_address || '—' }}</div>
            </div>
          </div>
        </div>
        <div style="min-height:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div class="t-eyebrow">Financial Summary</div>
            <button v-if="canEdit" class="smb-filter-pill" @click="openEditForecast">
              {{ booking?.expected_advance_amount != null ? 'Edit forecast' : 'Set forecast' }}
            </button>
          </div>
          <h2 class="t-h2" style="margin-bottom:24px">Breakdown</h2>
          <div v-if="summary">
            <div class="fin-row"><span class="fin-label">Hall Rent</span><span class="fin-value">{{ formatCurrency(summary.rent) }}</span></div>
            <div class="fin-row"><span class="fin-label">Bill Items</span><span class="fin-value">+ {{ formatCurrency(summary.bill_items_total) }}</span></div>
            <div class="fin-row is-bold"><span class="fin-label">Total Bill <span style="font-weight:400;color:var(--ash);font-size:11px;margin-left:6px">rent + bill items</span></span><span class="fin-value">{{ formatCurrency(summary.total_bill) }}</span></div>

            <div class="fin-row" style="margin-top:14px"><span class="fin-label">Advance Collected</span><span class="fin-value">{{ formatCurrency(summary.total_advance) }}</span></div>
            <div class="fin-row"><span class="fin-label">Total Deposits</span><span class="fin-value">+ {{ formatCurrency(summary.total_deposits) }}</span></div>
            <div class="fin-row is-bold"><span class="fin-label">Total Paid <span style="font-weight:400;color:var(--ash);font-size:11px;margin-left:6px">advance + deposits</span></span><span class="fin-value" style="color:var(--accent-ink)">{{ formatCurrency(summary.total_paid) }}</span></div>

            <div class="fin-row is-bold" style="margin-top:14px"><span class="fin-label">Pending Balance <span style="font-weight:400;color:var(--ash);font-size:11px;margin-left:6px">total bill − total paid</span></span><span class="fin-value" :style="{ color: summary.pending_balance > 0 ? 'var(--signal-red)' : 'var(--ink)' }">{{ formatCurrency(summary.pending_balance) }}</span></div>
            <div v-if="summary.excess_shortage > 0" class="fin-row"><span class="fin-label" style="color:var(--ash)">Excess paid</span><span class="fin-value" style="color:var(--accent-ink)">{{ formatCurrency(summary.excess_shortage) }}</span></div>

            <div class="fin-row" style="margin-top:14px"><span class="fin-label">Total Expenses</span><span class="fin-value" style="color:var(--signal-red)">− {{ formatCurrency(summary.total_expenses) }}</span></div>
            <div class="fin-row is-bold is-accent" :style="{ color: summary.net_profit >= 0 ? 'var(--accent-ink)' : 'var(--signal-red)' }"><span class="fin-label">Net Profit <span style="font-weight:400;color:var(--ash);font-size:11px;margin-left:6px">total bill − expenses</span></span><span class="fin-value">{{ formatCurrency(summary.net_profit) }}</span></div>
          </div>

          <div v-if="booking?.expected_advance_amount != null" style="margin-top:24px;padding-top:18px;border-top:1px solid var(--hair)">
            <div class="t-eyebrow" style="margin-bottom:12px">Advance Forecast</div>
            <div class="fin-row">
              <span class="fin-label">Expected Advance</span>
              <span class="fin-value">{{ formatCurrency(Number(booking.expected_advance_amount)) }}</span>
            </div>
            <div class="fin-row">
              <span class="fin-label">Due By</span>
              <span class="fin-value">{{ booking.advance_due_date ? formatDate(booking.advance_due_date) : '—' }}<span v-if="dueLabelText" style="margin-left:8px;font:500 11px/1 var(--font-mono);letter-spacing:.06em;color:var(--ash);text-transform:uppercase">{{ dueLabelText }}</span></span>
            </div>
            <div class="fin-row is-bold" :style="{ color: (advanceOwed ?? 0) > 0 ? 'var(--signal-red)' : 'var(--accent-ink)' }">
              <span class="fin-label">Advance Owed</span>
              <span class="fin-value">{{ formatCurrency(advanceOwed ?? 0) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div style="margin-top:32px" class="fade-up delay-4">
        <div class="smb-tabs">
          <button
            v-for="t in [
              { k: 'advances', l: 'Advances',  n: advances.length },
              { k: 'bills',    l: 'Bill Items', n: billItems.length },
              { k: 'expenses', l: 'Expenses',   n: expenses.length },
              { k: 'deposits', l: 'Deposits',   n: deposits.length },
            ]"
            :key="t.k"
            :class="['smb-tab', activeTab === t.k ? 'is-active' : '']"
            @click="activeTab = t.k"
          >
            {{ t.l }} <span class="count">[{{ String(t.n).padStart(2,'0') }}]</span>
          </button>
        </div>

        <div v-if="activeTab === 'advances'">
          <AdvancePaymentList :booking-id="bookingId" :advances="advances" :bank-accounts="bankAccounts" :can-edit="canEdit" @updated="fetchAll" />
        </div>
        <div v-else-if="activeTab === 'bills'">
          <BillItemsTable :booking-id="bookingId" :bill-items="billItems" :categories="billCategories" :can-edit="canEdit" :can-delete="canDelete" @updated="fetchAll" />
        </div>
        <div v-else-if="activeTab === 'expenses'">
          <ExpensesTable :booking-id="bookingId" :expenses="expenses" :categories="expenseCategories" :can-edit="canEdit" :can-delete="canDelete" @updated="fetchAll" />
        </div>
        <div v-else-if="activeTab === 'deposits'">
          <DepositsTable :booking-id="bookingId" :deposits="deposits" :bank-accounts="bankAccounts" :can-edit="canEdit" :can-delete="canDelete" @updated="fetchAll" />
        </div>
      </div>
    </template>

    <div v-else style="padding:80px 0;text-align:center;color:var(--ash)">Booking not found</div>

    <!-- Cancel modal -->
    <teleport to="body">
      <div v-if="showCancel" class="smb-modal-overlay" @click.self="showCancel = false">
        <div class="smb-modal">
          <div class="smb-modal-head">
            <h3 class="t-h3">Cancel booking?</h3>
            <button class="smb-nav-iconbtn" @click="showCancel = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <p style="color:var(--ash);line-height:1.6">
              This will mark <strong style="color:var(--ink)">{{ booking?.customer_name }}</strong>'s booking on
              <strong style="color:var(--ink)">{{ formatDate(booking?.function_date ?? '') }}</strong> as cancelled.
              The date will become available for new bookings.
            </p>

            <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--hair)">
              <div class="t-eyebrow" style="margin-bottom:10px">
                Enquiries for this date
                <span v-if="!loadingEnquiries" class="t-mono" style="margin-left:8px;color:var(--ash)">[{{ String(matchingEnquiries.length).padStart(2, '0') }}]</span>
              </div>
              <div v-if="loadingEnquiries" style="color:var(--ash);font-size:13px;padding:12px 0">Looking up enquiries…</div>
              <div v-else-if="matchingEnquiries.length === 0" style="color:var(--ash);font-size:13px;padding:8px 0">
                No-one else asked for this date. The slot will simply free up.
              </div>
              <div v-else>
                <p style="color:var(--ash);font-size:13px;line-height:1.5;margin-bottom:12px">
                  These customers asked for this date — call them before you cancel:
                </p>
                <div
                  v-for="m in matchingEnquiries"
                  :key="m.enquiry_id + m.start_date + m.start_slot + m.end_date + m.end_slot"
                  class="cancel-enq-row"
                >
                  <div style="min-width:0;flex:1">
                    <div style="font-weight:600;font-size:14px">{{ m.customer_name }}</div>
                    <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:3px;letter-spacing:0.04em">
                      {{ m.customer_phone || 'no phone' }}
                      <span style="margin-left:8px">Function {{ formatDate(m.function_date) }}</span>
                      <span style="margin-left:8px">· {{ formatRange(m) }}</span>
                      <span v-if="m.is_primary" style="margin-left:8px;color:var(--accent-ink)">PRIMARY</span>
                      <span v-else style="margin-left:8px">ALT</span>
                    </div>
                  </div>
                  <button class="smb-filter-pill" @click.stop="router.push({ name: 'enquiry-detail', params: { id: m.enquiry_id } })">Open →</button>
                </div>
              </div>
            </div>
          </div>
          <div class="smb-modal-foot">
            <button class="btn" @click="showCancel = false">Keep</button>
            <button class="btn btn-primary btn-danger" :disabled="cancelling" @click="cancelBooking">
              {{ cancelling ? 'Cancelling…' : 'Cancel booking' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showEditForecast" class="smb-modal-overlay" @click.self="showEditForecast = false">
        <div class="smb-modal">
          <div class="smb-modal-head">
            <h3 class="t-h3">Advance forecast</h3>
            <button class="smb-nav-iconbtn" @click="showEditForecast = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <div style="display:flex;flex-direction:column;gap:14px">
              <div>
                <label class="field-label">Expected advance (₹)</label>
                <input type="number" class="input" v-model="editForecast.expected_advance_amount" placeholder="e.g. 50000" min="0" />
              </div>
              <div>
                <label class="field-label">Advance due by</label>
                <input type="date" class="input" v-model="editForecast.advance_due_date" />
                <p style="margin-top:6px;font-size:12px;color:var(--ash)">
                  Leave amount blank to remove this booking from the forecast.
                </p>
              </div>
            </div>
          </div>
          <div class="smb-modal-foot">
            <button class="btn" @click="showEditForecast = false">Cancel</button>
            <button class="btn btn-primary" :disabled="savingForecast" @click="saveForecast">
              {{ savingForecast ? 'Saving…' : 'Save forecast' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showDelete" class="smb-modal-overlay" @click.self="showDelete = false">
        <div class="smb-modal">
          <div class="smb-modal-head">
            <h3 class="t-h3">Delete booking?</h3>
            <button class="smb-nav-iconbtn" @click="showDelete = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <p style="color:var(--ash);line-height:1.6">
              This will permanently delete <strong style="color:var(--ink)">{{ booking?.customer_name }}</strong>'s booking
              and all associated records. This cannot be undone.
            </p>
          </div>
          <div class="smb-modal-foot">
            <button class="btn" @click="showDelete = false">Keep</button>
            <button class="btn btn-primary btn-danger" :disabled="deleting" @click="deleteBooking">
              {{ deleting ? 'Deleting…' : 'Delete booking' }}
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>
