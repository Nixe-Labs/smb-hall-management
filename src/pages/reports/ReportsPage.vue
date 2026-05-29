<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, toISODate } from '@/lib/utils/dates'
import {
  summarize as summarizeForecast,
  bucketForBooking,
  FORECAST_BUCKET_LABEL,
  dueLabel,
  emptyForecastTotals,
  type BucketMode,
  type ForecastBucket,
} from '@/lib/utils/forecast'
import ForecastPopover from '@/components/finance/ForecastPopover.vue'
import TamilDemandBadge from '@/components/common/TamilDemandBadge.vue'
import { buildDemandHistory, getDemandForDate, TIER_LABEL, type DemandHistory, type DemandTier } from '@/lib/utils/tamilDemand'
import type {
  Booking,
  BookingAdvanceForecast,
  BookingPaymentStatus,
  PaymentStatus,
} from '@/types/database'
import type { BookingStatus } from '@/types/enums'

const router = useRouter()

// ────────────────────────────────────────────────────────────
// Filter state
// ────────────────────────────────────────────────────────────

type DatePreset = 'last30' | 'q1' | 'q2' | 'q3' | 'q4' | 'ytd' | 'all' | 'custom'

const datePresets: { k: DatePreset; l: string }[] = [
  { k: 'last30', l: 'Last 30 days' },
  { k: 'q1', l: 'Q1' },
  { k: 'q2', l: 'Q2' },
  { k: 'q3', l: 'Q3' },
  { k: 'q4', l: 'Q4' },
  { k: 'ytd', l: 'Year to date' },
  { k: 'all', l: 'All time' },
]

const datePreset = ref<DatePreset>('ytd')
const dateStart = ref<string>('')      // yyyy-mm-dd
const dateEnd = ref<string>('')        // yyyy-mm-dd
const search = ref<string>('')         // customer name/phone
const statusFilters = ref<BookingStatus[]>([])              // empty = exclude cancelled (default)
const paymentFilters = ref<PaymentStatus[]>([])             // empty = all

const STATUS_OPTIONS: { k: BookingStatus; l: string }[] = [
  { k: 'completed', l: 'Completed' },
  { k: 'upcoming',  l: 'Upcoming' },
  { k: 'cancelled', l: 'Cancelled' },
]

const PAYMENT_OPTIONS: { k: PaymentStatus; l: string }[] = [
  { k: 'paid',    l: 'Paid' },
  { k: 'partial', l: 'Partial' },
  { k: 'unpaid',  l: 'Unpaid' },
]

const activeFilterCount = computed(() => {
  let n = 0
  if (datePreset.value !== 'ytd') n++
  if (search.value.trim()) n++
  if (statusFilters.value.length > 0) n++
  if (paymentFilters.value.length > 0) n++
  return n
})

function resetFilters() {
  datePreset.value = 'ytd'
  applyPresetToInputs('ytd')
  search.value = ''
  statusFilters.value = []
  paymentFilters.value = []
  fetchReport()
}

function isoDate(d: Date): string {
  return toISODate(d)
}

function applyPresetToInputs(preset: DatePreset) {
  const today = new Date()
  const year = today.getFullYear()
  if (preset === 'last30') {
    const back = new Date(today); back.setDate(back.getDate() - 30)
    dateStart.value = isoDate(back); dateEnd.value = isoDate(today)
  } else if (preset === 'q1') { dateStart.value = `${year}-01-01`; dateEnd.value = `${year}-03-31` }
  else if (preset === 'q2')   { dateStart.value = `${year}-04-01`; dateEnd.value = `${year}-06-30` }
  else if (preset === 'q3')   { dateStart.value = `${year}-07-01`; dateEnd.value = `${year}-09-30` }
  else if (preset === 'q4')   { dateStart.value = `${year}-10-01`; dateEnd.value = `${year}-12-31` }
  else if (preset === 'ytd')  { dateStart.value = `${year}-01-01`; dateEnd.value = isoDate(today) }
  else if (preset === 'all')  { dateStart.value = ''; dateEnd.value = '' }
  // 'custom' — leave the inputs as the user set them
}

function pickPreset(preset: DatePreset) {
  datePreset.value = preset
  applyPresetToInputs(preset)
  fetchReport()
}

function onDateInputChange() {
  // Editing the inputs flips us into custom mode
  datePreset.value = 'custom'
  // Validation: start must be <= end if both set
  if (dateStart.value && dateEnd.value && dateStart.value > dateEnd.value) {
    // swap silently — never let the query be invalid
    const t = dateStart.value
    dateStart.value = dateEnd.value
    dateEnd.value = t
  }
  fetchReport()
}

function toggleStatus(s: BookingStatus) {
  const i = statusFilters.value.indexOf(s)
  if (i === -1) statusFilters.value.push(s)
  else statusFilters.value.splice(i, 1)
  fetchReport()
}

function togglePayment(p: PaymentStatus) {
  const i = paymentFilters.value.indexOf(p)
  if (i === -1) paymentFilters.value.push(p)
  else paymentFilters.value.splice(i, 1)
  fetchReport()
}

// Debounced search
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => fetchReport(), 300)
})

// ────────────────────────────────────────────────────────────
// Forecast strip
// ────────────────────────────────────────────────────────────

const forecastMode = ref<BucketMode>('calendar')
const bucketModes: BucketMode[] = ['calendar', 'rolling']
const forecastRows = ref<BookingAdvanceForecast[]>([])
const forecastTotals = computed(() =>
  forecastRows.value.length === 0
    ? emptyForecastTotals()
    : summarizeForecast(forecastRows.value, forecastMode.value)
)
const forecastList = computed(() =>
  [...forecastRows.value]
    .filter(r => r.expected_advance_amount != null && Number(r.advance_owed) > 0)
    .sort((a, b) => {
      const ad = a.advance_due_date ?? '9999-12-31'
      const bd = b.advance_due_date ?? '9999-12-31'
      return ad < bd ? -1 : ad > bd ? 1 : 0
    })
)

// Rows that make up each forecast cell — uses the active calendar/rolling mode
function bucketRows(bucket: ForecastBucket | 'total'): BookingAdvanceForecast[] {
  if (bucket === 'total') return forecastList.value
  return forecastList.value.filter(r => bucketForBooking(r, forecastMode.value) === bucket)
}
function goToBooking(id: string) {
  router.push({ name: 'booking-detail', params: { id } })
}

// ────────────────────────────────────────────────────────────
// Report data
// ────────────────────────────────────────────────────────────

interface ReportRow extends Booking {
  total_bill: number
  total_expenses: number
  total_advance: number
  total_deposits: number
  total_paid: number
  pending: number
  profit: number
  payment_status: PaymentStatus
}

interface CategoryRow { id: string; name: string; amount: number; count: number }
interface BankRow    { id: string; name: string; advance: number; deposit: number; total: number }

const rows = ref<ReportRow[]>([])
const billsByCategory = ref<CategoryRow[]>([])
const expensesByCategory = ref<CategoryRow[]>([])
const collectedByBank = ref<BankRow[]>([])
const loading = ref(false)

const totals = computed(() => {
  const revenue = rows.value.reduce((s, r) => s + r.total_bill, 0)
  const expenses = rows.value.reduce((s, r) => s + r.total_expenses, 0)
  const advance = rows.value.reduce((s, r) => s + r.total_advance, 0)
  const deposits = rows.value.reduce((s, r) => s + r.total_deposits, 0)
  const collected = advance + deposits
  const pending = rows.value.reduce((s, r) => s + r.pending, 0)
  const profit = revenue - expenses
  const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0
  return { revenue, expenses, advance, deposits, collected, pending, profit, marginPct }
})

const expensePct = computed(() =>
  totals.value.revenue > 0 ? Math.round(totals.value.expenses / totals.value.revenue * 100) : 0
)
const collectedPct = computed(() =>
  totals.value.revenue > 0 ? Math.round(totals.value.collected / totals.value.revenue * 100) : 0
)

// ── Tamil season summary over the filtered rows ──────────────
const demandHistory = ref<DemandHistory | null>(null)
async function loadDemandHistory() {
  const { data } = await supabase.from('bookings').select('function_date').neq('status', 'cancelled')
  demandHistory.value = buildDemandHistory(((data as { function_date: string }[]) ?? []).map(b => b.function_date))
}

interface SeasonStat { tier: DemandTier; label: string; count: number; rent: number }
const seasonSummary = computed<SeasonStat[]>(() => {
  const acc: Record<DemandTier, { count: number; rent: number }> = {
    peak: { count: 0, rent: 0 }, high: { count: 0, rent: 0 },
    normal: { count: 0, rent: 0 }, low: { count: 0, rent: 0 },
  }
  for (const r of rows.value) {
    const info = getDemandForDate(r.function_date, demandHistory.value)
    if (!info) continue
    acc[info.demand.tier].count++
    acc[info.demand.tier].rent += Number(r.rent)
  }
  return (['peak', 'high', 'normal', 'low'] as DemandTier[])
    .map(tier => ({ tier, label: TIER_LABEL[tier], ...acc[tier] }))
    .filter(s => s.count > 0)
})

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function getStatus(b: Booking): 'ongoing' | 'upcoming' | 'completed' | 'cancelled' {
  if (b.status === 'cancelled') return 'cancelled'
  const d = new Date(b.function_date + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  if (d.getTime() < t.getTime()) return 'completed'
  if (d.getTime() === t.getTime()) return 'ongoing'
  return 'upcoming'
}

const statusLabels: Record<string, string> = {
  ongoing: 'Today', upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled'
}

function fmt(n: number) {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (Math.abs(n) >= 1000)   return `₹${Math.round(n / 1000)}K`
  return `₹${Math.round(n)}`
}

// PostgREST `.or()` accepts a comma-separated list where filter values
// can include `%` / `_` wildcards. We escape the user's input first.
function escapeIlike(s: string): string {
  return s.replace(/[\\%_,()]/g, m => '\\' + m)
}

const dateRangeLabel = computed(() => {
  if (datePreset.value === 'all') return 'All time'
  if (dateStart.value && dateEnd.value) return `${formatDate(dateStart.value)} → ${formatDate(dateEnd.value)}`
  if (dateStart.value) return `From ${formatDate(dateStart.value)}`
  if (dateEnd.value) return `Until ${formatDate(dateEnd.value)}`
  return 'All time'
})

// ────────────────────────────────────────────────────────────
// Data fetching
// ────────────────────────────────────────────────────────────

async function fetchReport() {
  loading.value = true
  try {
    // 1) Bookings query with server-side filters
    let q = supabase.from('bookings').select('*').order('function_date', { ascending: false })

    if (dateStart.value) q = q.gte('function_date', dateStart.value)
    if (dateEnd.value)   q = q.lte('function_date', dateEnd.value)

    if (statusFilters.value.length > 0) {
      q = q.in('status', statusFilters.value)
    } else {
      q = q.neq('status', 'cancelled')   // sensible default
    }

    const term = search.value.trim()
    if (term) {
      const pat = `%${escapeIlike(term)}%`
      q = q.or(`customer_name.ilike.${pat},customer_phone.ilike.${pat}`)
    }

    const { data: bookingData, error } = await q
    if (error) throw error
    const bookings = (bookingData as Booking[]) ?? []

    if (bookings.length === 0) {
      rows.value = []
      billsByCategory.value = []
      expensesByCategory.value = []
      collectedByBank.value = []
      // Still fetch the forecast — it's independent of report filters
      await fetchForecast()
      return
    }

    const ids = bookings.map(b => b.id)

    // 2) Related data + lookups + forecast — all in parallel
    const [billRes, expRes, advRes, depRes, payRes, billCatRes, expCatRes, bankRes, forecastRes] = await Promise.all([
      supabase.from('bill_items').select('booking_id, category_id, amount').in('booking_id', ids),
      supabase.from('expenses').select('booking_id, category_id, amount').in('booking_id', ids),
      supabase.from('advance_payments').select('booking_id, amount, deposit_account_id').in('booking_id', ids),
      supabase.from('deposits').select('booking_id, bank_account_id, amount').in('booking_id', ids),
      supabase.from('bookings_payment_status').select('booking_id, payment_status').in('booking_id', ids),
      supabase.from('bill_categories').select('id, name'),
      supabase.from('expense_categories').select('id, name'),
      supabase.from('bank_accounts').select('id, name'),
      supabase
        .from('bookings_advance_forecast')
        .select('*')
        .gte('function_date', isoDate(new Date()))
        .neq('status', 'cancelled'),
    ])

    const billCatById = new Map<string, string>()
    ;(billCatRes.data ?? []).forEach((c: { id: string; name: string }) => billCatById.set(c.id, c.name))
    const expCatById = new Map<string, string>()
    ;(expCatRes.data ?? []).forEach((c: { id: string; name: string }) => expCatById.set(c.id, c.name))
    const bankById = new Map<string, string>()
    ;(bankRes.data ?? []).forEach((b: { id: string; name: string }) => bankById.set(b.id, b.name))

    const paymentByBooking = new Map<string, PaymentStatus>()
    ;(payRes.data as Pick<BookingPaymentStatus, 'booking_id' | 'payment_status'>[] ?? [])
      .forEach(p => paymentByBooking.set(p.booking_id, p.payment_status))

    // 3) Payment-status filter is applied client-side after fetching the view
    let kept = bookings
    if (paymentFilters.value.length > 0) {
      const set = new Set(paymentFilters.value)
      kept = bookings.filter(b => {
        const ps = paymentByBooking.get(b.id) ?? 'unpaid'
        return set.has(ps)
      })
    }
    const keptIds = new Set(kept.map(b => b.id))

    // 4) Aggregate per-booking and per-category
    const billByBk = new Map<string, number>()
    const billByCat = new Map<string, CategoryRow>()
    ;(billRes.data ?? []).forEach((i: { booking_id: string; category_id: string; amount: number }) => {
      if (!keptIds.has(i.booking_id)) return
      const amt = Number(i.amount)
      billByBk.set(i.booking_id, (billByBk.get(i.booking_id) ?? 0) + amt)
      const cur = billByCat.get(i.category_id) ?? { id: i.category_id, name: billCatById.get(i.category_id) ?? 'Unknown', amount: 0, count: 0 }
      cur.amount += amt
      cur.count += 1
      billByCat.set(i.category_id, cur)
    })

    const expByBk = new Map<string, number>()
    const expByCat = new Map<string, CategoryRow>()
    ;(expRes.data ?? []).forEach((i: { booking_id: string; category_id: string; amount: number }) => {
      if (!keptIds.has(i.booking_id)) return
      const amt = Number(i.amount)
      expByBk.set(i.booking_id, (expByBk.get(i.booking_id) ?? 0) + amt)
      const cur = expByCat.get(i.category_id) ?? { id: i.category_id, name: expCatById.get(i.category_id) ?? 'Unknown', amount: 0, count: 0 }
      cur.amount += amt
      cur.count += 1
      expByCat.set(i.category_id, cur)
    })

    const advByBk = new Map<string, number>()
    const advByBank = new Map<string, number>()
    ;(advRes.data ?? []).forEach((i: { booking_id: string; amount: number; deposit_account_id: string | null }) => {
      if (!keptIds.has(i.booking_id)) return
      const amt = Number(i.amount)
      advByBk.set(i.booking_id, (advByBk.get(i.booking_id) ?? 0) + amt)
      if (i.deposit_account_id) {
        advByBank.set(i.deposit_account_id, (advByBank.get(i.deposit_account_id) ?? 0) + amt)
      }
    })

    const depByBk = new Map<string, number>()
    const depByBank = new Map<string, number>()
    ;(depRes.data ?? []).forEach((i: { booking_id: string; bank_account_id: string; amount: number }) => {
      if (!keptIds.has(i.booking_id)) return
      const amt = Number(i.amount)
      depByBk.set(i.booking_id, (depByBk.get(i.booking_id) ?? 0) + amt)
      depByBank.set(i.bank_account_id, (depByBank.get(i.bank_account_id) ?? 0) + amt)
    })

    // 5) Build rows
    const built: ReportRow[] = kept.map(b => {
      const bill = billByBk.get(b.id) ?? 0
      const exp = expByBk.get(b.id) ?? 0
      const adv = advByBk.get(b.id) ?? 0
      const dep = depByBk.get(b.id) ?? 0
      const total_bill = Number(b.rent) + bill
      const total_paid = adv + dep
      const pending = Math.max(total_bill - total_paid, 0)
      const profit = total_bill - exp
      return {
        ...b,
        total_bill,
        total_expenses: exp,
        total_advance: adv,
        total_deposits: dep,
        total_paid,
        pending,
        profit,
        payment_status: paymentByBooking.get(b.id) ?? 'unpaid',
      }
    })

    rows.value = built
    billsByCategory.value = Array.from(billByCat.values()).sort((a, b) => b.amount - a.amount)
    expensesByCategory.value = Array.from(expByCat.values()).sort((a, b) => b.amount - a.amount)

    const bankIds = new Set<string>()
    advByBank.forEach((_v, k) => bankIds.add(k))
    depByBank.forEach((_v, k) => bankIds.add(k))
    collectedByBank.value = Array.from(bankIds).map(id => {
      const advance = advByBank.get(id) ?? 0
      const deposit = depByBank.get(id) ?? 0
      return { id, name: bankById.get(id) ?? 'Unknown', advance, deposit, total: advance + deposit }
    }).sort((a, b) => b.total - a.total)

    forecastRows.value = (forecastRes.data as BookingAdvanceForecast[]) ?? []
  } finally {
    loading.value = false
  }
}

async function fetchForecast() {
  const { data } = await supabase
    .from('bookings_advance_forecast')
    .select('*')
    .gte('function_date', isoDate(new Date()))
    .neq('status', 'cancelled')
  forecastRows.value = (data as BookingAdvanceForecast[]) ?? []
}

// ────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────

function csvEscape(v: string | number): string {
  let s = String(v)
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function exportCSV() {
  const headers = ['Date','Customer','Phone','Status','Total Bill','Advance','Deposits','Total Paid','Pending','Expenses','Profit','Payment']
  const csvRows = rows.value.map(r => [
    r.function_date,
    r.customer_name,
    r.customer_phone ?? '',
    statusLabels[getStatus(r)] ?? '',
    r.total_bill,
    r.total_advance,
    r.total_deposits,
    r.total_paid,
    r.pending,
    r.total_expenses,
    r.profit,
    r.payment_status,
  ])
  const csv = [headers, ...csvRows].map(r => r.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `smb-report-${isoDate(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportPDF() {
  const { buildReportDocument } = await import('@/lib/pdf/reportTemplate')
  const { downloadInvoice } = await import('@/lib/pdf/pdfGenerator')

  const doc = buildReportDocument({
    filters: {
      dateLabel: dateRangeLabel.value,
      search: search.value,
      statuses: statusFilters.value.length > 0 ? statusFilters.value : ['completed', 'upcoming'],
      paymentStatuses: paymentFilters.value,
    },
    totals: { ...totals.value },
    forecast: forecastTotals.value,
    forecastMode: forecastMode.value,
    billsByCategory: billsByCategory.value.map(c => ({ name: c.name, amount: c.amount, count: c.count })),
    expensesByCategory: expensesByCategory.value.map(c => ({ name: c.name, amount: c.amount, count: c.count })),
    collectedByBank: collectedByBank.value.map(b => ({ name: b.name, advance: b.advance, deposit: b.deposit, total: b.total })),
    bookings: rows.value.map(r => ({
      function_date: r.function_date,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      status: statusLabels[getStatus(r)] ?? r.status,
      total_bill: r.total_bill,
      total_advance: r.total_advance,
      total_deposits: r.total_deposits,
      total_paid: r.total_paid,
      pending: r.pending,
      total_expenses: r.total_expenses,
      profit: r.profit,
      payment_status: r.payment_status,
    })),
  })

  downloadInvoice(doc, `smb-report-${isoDate(new Date())}.pdf`)
}

// ────────────────────────────────────────────────────────────
// Init
// ────────────────────────────────────────────────────────────

onMounted(() => {
  applyPresetToInputs('ytd')
  fetchReport()
  loadDemandHistory()
})
</script>

<template>
  <div class="screen">
    <!-- Header -->
    <div class="fade-in" style="padding-top:32px;margin-bottom:24px">
      <div class="t-eyebrow" style="margin-bottom:12px">04 / Reports</div>
      <h1 class="t-h1">Financial reports.</h1>
    </div>

    <!-- ── Forecast strip ────────────────────────────────────── -->
    <section class="rep-forecast fade-up">
      <div class="rep-forecast-head">
        <div>
          <div class="t-eyebrow" style="margin-bottom:6px">Advance forecast</div>
          <h3 class="t-h3">Cash to collect.</h3>
        </div>
        <div class="rep-mode">
          <button
            v-for="m in bucketModes"
            :key="m"
            :class="['rep-mode-btn', forecastMode === m ? 'is-active' : '']"
            @click="forecastMode = m"
          >{{ m === 'calendar' ? 'Calendar' : 'Rolling' }}</button>
        </div>
      </div>

      <div class="rep-forecast-grid">
        <ForecastPopover title="Overdue" align="left" :rows="bucketRows('overdue')" empty-text="Nothing overdue — all clear." @select="goToBooking">
          <div class="rep-fc-cell">
            <div class="t-eyebrow">Overdue</div>
            <div class="rep-fc-num" :style="{ color: forecastTotals.overdue > 0 ? 'var(--signal-red)' : 'var(--ink)' }">{{ fmt(forecastTotals.overdue) }}</div>
            <div class="rep-fc-foot">{{ forecastTotals.counts.overdue }} owing</div>
          </div>
        </ForecastPopover>
        <ForecastPopover title="This week" align="left" :rows="bucketRows('this_week')" empty-text="Nothing due this week." @select="goToBooking">
          <div class="rep-fc-cell">
            <div class="t-eyebrow">This week</div>
            <div class="rep-fc-num">{{ fmt(forecastTotals.this_week) }}</div>
            <div class="rep-fc-foot">{{ forecastTotals.counts.this_week }} owing</div>
          </div>
        </ForecastPopover>
        <ForecastPopover title="This month" align="left" :rows="bucketRows('this_month')" empty-text="Nothing due this month." @select="goToBooking">
          <div class="rep-fc-cell">
            <div class="t-eyebrow">This month</div>
            <div class="rep-fc-num">{{ fmt(forecastTotals.this_month) }}</div>
            <div class="rep-fc-foot">{{ forecastTotals.counts.this_month }} owing</div>
          </div>
        </ForecastPopover>
        <ForecastPopover title="This year" align="left" :rows="bucketRows('this_year')" empty-text="Nothing due this year." @select="goToBooking">
          <div class="rep-fc-cell">
            <div class="t-eyebrow">This year</div>
            <div class="rep-fc-num">{{ fmt(forecastTotals.this_year) }}</div>
            <div class="rep-fc-foot">{{ forecastTotals.counts.this_year }} owing</div>
          </div>
        </ForecastPopover>
        <ForecastPopover title="Total owed" align="right" :rows="bucketRows('total')" empty-text="Nothing owing." @select="goToBooking">
          <div class="rep-fc-cell">
            <div class="t-eyebrow">Total owed</div>
            <div class="rep-fc-num" style="color:var(--accent-ink)">{{ fmt(forecastTotals.total_owed) }}</div>
            <div class="rep-fc-foot">{{ forecastTotals.bookings_with_target }} on forecast</div>
          </div>
        </ForecastPopover>
      </div>

      <div v-if="forecastList.length === 0" class="rep-fc-empty">
        Nothing on the forecast — set an expected amount + due date on any booking.
      </div>
      <div v-else class="rep-fc-rows">
        <div
          v-for="b in forecastList.slice(0, 6)"
          :key="b.id"
          class="rep-fc-row"
          @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
        >
          <div class="rep-fc-row-date">{{ b.advance_due_date ? formatDate(b.advance_due_date) : '—' }}</div>
          <div class="rep-fc-row-name">
            <span style="font-weight:600">{{ b.customer_name }}</span>
            <span :class="['fc-pill', 'fc-' + (bucketForBooking(b, forecastMode) ?? 'later')]">
              {{ FORECAST_BUCKET_LABEL[bucketForBooking(b, forecastMode) ?? 'later'] }} · {{ dueLabel(b.advance_due_date) }}
            </span>
          </div>
          <div class="rep-fc-row-amt">{{ fmt(Number(b.advance_owed)) }}</div>
        </div>
      </div>
    </section>

    <!-- ── Filters ────────────────────────────────────────────── -->
    <section class="rep-filters fade-up">
      <div class="rep-filters-head">
        <div class="t-eyebrow">Filters</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span v-if="activeFilterCount > 0" style="font-family:var(--font-mono);font-size:11px;color:var(--ash)">
            {{ activeFilterCount }} active
          </span>
          <button class="rep-reset" :disabled="activeFilterCount === 0" @click="resetFilters">Reset</button>
        </div>
      </div>

      <!-- Date presets -->
      <div class="rep-filter-row">
        <span class="rep-filter-label">Period</span>
        <div class="rep-pills">
          <button
            v-for="p in datePresets"
            :key="p.k"
            :class="['smb-filter-pill', datePreset === p.k ? 'is-active' : '']"
            @click="pickPreset(p.k)"
          >{{ p.l }}</button>
          <button
            :class="['smb-filter-pill', datePreset === 'custom' ? 'is-active' : '']"
            @click="datePreset = 'custom'"
          >Custom</button>
        </div>
      </div>

      <!-- Custom date inputs -->
      <div v-if="datePreset === 'custom'" class="rep-filter-row">
        <span class="rep-filter-label">Range</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input
            type="date"
            class="rep-input"
            v-model="dateStart"
            :max="dateEnd || undefined"
            @change="onDateInputChange"
          />
          <span style="color:var(--ash);font-family:var(--font-mono);font-size:12px">→</span>
          <input
            type="date"
            class="rep-input"
            v-model="dateEnd"
            :min="dateStart || undefined"
            @change="onDateInputChange"
          />
        </div>
      </div>

      <!-- Customer search -->
      <div class="rep-filter-row">
        <span class="rep-filter-label">Customer</span>
        <input
          v-model="search"
          type="search"
          maxlength="80"
          class="rep-input rep-input-wide"
          placeholder="Search by name or phone"
        />
      </div>

      <!-- Status -->
      <div class="rep-filter-row">
        <span class="rep-filter-label">Status</span>
        <div class="rep-pills">
          <button
            v-for="s in STATUS_OPTIONS"
            :key="s.k"
            :class="['smb-filter-pill', statusFilters.includes(s.k) ? 'is-active' : '']"
            @click="toggleStatus(s.k)"
          >{{ s.l }}</button>
        </div>
        <span v-if="statusFilters.length === 0" style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-left:8px">
          default · excludes cancelled
        </span>
      </div>

      <!-- Payment status -->
      <div class="rep-filter-row">
        <span class="rep-filter-label">Payment</span>
        <div class="rep-pills">
          <button
            v-for="p in PAYMENT_OPTIONS"
            :key="p.k"
            :class="['smb-filter-pill', paymentFilters.includes(p.k) ? 'is-active' : '']"
            @click="togglePayment(p.k)"
          >{{ p.l }}</button>
        </div>
      </div>
    </section>

    <!-- ── Loading ────────────────────────────────────────────── -->
    <div v-if="loading" class="loading-center">
      <div class="smb-spinner"></div>
    </div>

    <template v-else>
      <!-- ── Summary strip ──────────────────────────────────── -->
      <section class="rep-summary fade-up">
        <div>
          <div class="t-eyebrow" style="margin-bottom:12px">Revenue</div>
          <div class="t-num" style="font-size:clamp(2rem,4vw,3rem)">{{ formatCurrency(totals.revenue) }}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:8px">{{ rows.length }} bookings</div>
        </div>
        <div>
          <div class="t-eyebrow" style="margin-bottom:12px">Collected</div>
          <div class="t-num" style="font-size:clamp(2rem,4vw,3rem);color:var(--accent-ink)">{{ formatCurrency(totals.collected) }}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:8px">{{ collectedPct }}% of revenue · advance {{ fmt(totals.advance) }}, deposits {{ fmt(totals.deposits) }}</div>
        </div>
        <div>
          <div class="t-eyebrow" style="margin-bottom:12px">Expenses</div>
          <div class="t-num" style="font-size:clamp(2rem,4vw,3rem);color:var(--signal-red)">{{ formatCurrency(totals.expenses) }}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:8px">{{ expensePct }}% of revenue</div>
        </div>
        <div>
          <div class="t-eyebrow" style="margin-bottom:12px">Net Profit</div>
          <div class="t-num" style="font-size:clamp(2rem,4vw,3rem);color:var(--accent-ink)">{{ formatCurrency(totals.profit) }}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:8px">{{ totals.marginPct }}% margin · pending {{ fmt(totals.pending) }}</div>
        </div>
      </section>

      <!-- ── Tamil season summary ───────────────────────────── -->
      <div v-if="seasonSummary.length" class="rep-season fade-up">
        <span class="t-eyebrow">Tamil season</span>
        <span
          v-for="s in seasonSummary"
          :key="s.tier"
          class="rep-season-item"
          :class="'tier-' + s.tier"
        >
          <span class="rep-season-dot"></span>
          {{ s.label }} · {{ s.count }} <span class="rep-season-rent">({{ fmt(s.rent) }})</span>
        </span>
      </div>

      <!-- ── Export actions ─────────────────────────────────── -->
      <div class="smb-table-toolbar" style="margin-top:24px">
        <div style="display:flex;align-items:baseline;gap:12px">
          <span class="t-eyebrow">Detail</span>
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--ash)">{{ dateRangeLabel }}</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn" @click="exportCSV" :disabled="rows.length === 0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export CSV
          </button>
          <button class="btn btn-primary" @click="exportPDF" :disabled="rows.length === 0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6M9 9h1"/></svg>
            Export PDF
          </button>
        </div>
      </div>

      <!-- ── Breakdown panels ───────────────────────────────── -->
      <div class="rep-breakdown-grid fade-up">
        <!-- Bills -->
        <div class="rep-panel">
          <div class="rep-panel-head">
            <div class="t-eyebrow">Bill items</div>
            <span class="rep-panel-sum">{{ fmt(billsByCategory.reduce((s, c) => s + c.amount, 0)) }}</span>
          </div>
          <div v-if="billsByCategory.length === 0" class="rep-panel-empty">No bill items in this period.</div>
          <table v-else class="rep-panel-table">
            <tbody>
              <tr v-for="c in billsByCategory" :key="c.id">
                <td>{{ c.name }}</td>
                <td class="rep-panel-count">{{ c.count }}</td>
                <td class="rep-panel-amt">{{ formatCurrency(c.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Expenses -->
        <div class="rep-panel">
          <div class="rep-panel-head">
            <div class="t-eyebrow">Expenses</div>
            <span class="rep-panel-sum" style="color:var(--signal-red)">{{ fmt(expensesByCategory.reduce((s, c) => s + c.amount, 0)) }}</span>
          </div>
          <div v-if="expensesByCategory.length === 0" class="rep-panel-empty">No expenses in this period.</div>
          <table v-else class="rep-panel-table">
            <tbody>
              <tr v-for="c in expensesByCategory" :key="c.id">
                <td>{{ c.name }}</td>
                <td class="rep-panel-count">{{ c.count }}</td>
                <td class="rep-panel-amt" style="color:var(--signal-red)">−{{ formatCurrency(c.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Collected by bank -->
        <div class="rep-panel">
          <div class="rep-panel-head">
            <div class="t-eyebrow">Collected by bank</div>
            <span class="rep-panel-sum" style="color:var(--accent-ink)">{{ fmt(collectedByBank.reduce((s, b) => s + b.total, 0)) }}</span>
          </div>
          <div v-if="collectedByBank.length === 0" class="rep-panel-empty">No advance/deposit activity yet.</div>
          <table v-else class="rep-panel-table">
            <thead>
              <tr>
                <th style="text-align:left">Account</th>
                <th class="rep-panel-amt">Advance</th>
                <th class="rep-panel-amt">Deposits</th>
                <th class="rep-panel-amt">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in collectedByBank" :key="b.id">
                <td>{{ b.name }}</td>
                <td class="rep-panel-amt" style="color:var(--ash)">{{ formatCurrency(b.advance) }}</td>
                <td class="rep-panel-amt" style="color:var(--ash)">{{ formatCurrency(b.deposit) }}</td>
                <td class="rep-panel-amt" style="font-weight:600">{{ formatCurrency(b.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Bookings table ─────────────────────────────────── -->
      <div class="smb-table-wrap fade-up" style="margin-top:24px">
        <table class="table table-cards">
          <thead>
            <tr>
              <th style="width:130px">Date</th>
              <th>Customer</th>
              <th style="text-align:right">Bill</th>
              <th style="text-align:right">Paid</th>
              <th style="text-align:right">Pending</th>
              <th style="text-align:right">Expenses</th>
              <th style="text-align:right">Profit</th>
              <th style="width:140px">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rows.length === 0">
              <td colspan="8" style="text-align:center;color:var(--ash);padding:60px">No data for these filters.</td>
            </tr>
            <tr
              v-for="r in rows"
              :key="r.id"
              @click="router.push({ name: 'booking-detail', params: { id: r.id } })"
            >
              <td data-label="Date">
                {{ formatDate(r.function_date) }}
                <div style="margin-top:4px">
                  <TamilDemandBadge :date-str="r.function_date" :history="demandHistory" variant="mini" />
                </div>
              </td>
              <td data-label="Customer">
                <div style="font-weight:600">{{ r.customer_name }}</div>
                <div v-if="r.customer_phone" style="color:var(--ash);font-size:12px;margin-top:2px">{{ r.customer_phone }}</div>
              </td>
              <td data-label="Bill" style="text-align:right;font-family:var(--font-display);font-weight:600;font-variant-numeric:tabular-nums">{{ formatCurrency(r.total_bill) }}</td>
              <td data-label="Paid" style="text-align:right;color:var(--accent-ink);font-variant-numeric:tabular-nums">{{ formatCurrency(r.total_paid) }}</td>
              <td
                data-label="Pending"
                style="text-align:right;font-variant-numeric:tabular-nums"
                :style="{ color: r.pending > 0 ? 'var(--signal-red)' : 'var(--ash)' }"
              >{{ formatCurrency(r.pending) }}</td>
              <td data-label="Expenses" style="text-align:right;color:var(--signal-red);font-variant-numeric:tabular-nums">−{{ formatCurrency(r.total_expenses) }}</td>
              <td
                data-label="Profit"
                style="text-align:right;font-family:var(--font-display);font-weight:600;font-variant-numeric:tabular-nums"
                :style="{ color: r.profit >= 0 ? 'var(--accent-ink)' : 'var(--signal-red)' }"
              >{{ formatCurrency(r.profit) }}</td>
              <td data-label="Status">
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                  <span :class="['tag', 'tag-' + getStatus(r)]">{{ statusLabels[getStatus(r)] }}</span>
                  <span :class="['pay-pill', 'pay-' + r.payment_status]">{{ r.payment_status }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── Forecast strip ─────────────────────────────────────────── */
.rep-forecast {
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
  padding: 24px 0;
  margin-bottom: 24px;
}
.rep-forecast-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.rep-mode {
  display: inline-flex;
  border: 1px solid var(--hair);
  border-radius: 999px;
  padding: 2px;
  background: var(--paper);
}
.rep-mode-btn {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 6px 14px;
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ash);
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.rep-mode-btn.is-active {
  background: var(--ink);
  color: var(--paper);
}
.rep-forecast-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--hair);
  margin-bottom: 14px;
}
.rep-fc-cell { display: flex; flex-direction: column; gap: 4px; }
.rep-fc-num {
  font: 600 clamp(1.05rem, 1.7vw, 1.4rem)/1 var(--font-display);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}
.rep-fc-foot { font: 500 10px/1.2 var(--font-mono); color: var(--ash); letter-spacing: 0.04em; }
.rep-fc-empty {
  padding: 20px 0;
  color: var(--ash);
  font-size: 13px;
  text-align: center;
}
.rep-fc-rows { display: flex; flex-direction: column; }
.rep-fc-row {
  display: grid;
  grid-template-columns: 130px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--hair);
  cursor: pointer;
  transition: background-color 120ms ease, padding-left 120ms ease;
}
.rep-fc-row:last-child { border-bottom: none; }
.rep-fc-row:hover { padding-left: 6px; }
.rep-fc-row-date {
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.06em;
  color: var(--ash);
  text-transform: uppercase;
}
.rep-fc-row-name {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}
.rep-fc-row-amt {
  font: 600 0.95rem/1 var(--font-display);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .rep-forecast-grid { grid-template-columns: 1fr 1fr; }
}

/* ── Filters ────────────────────────────────────────────────── */
.rep-filters {
  border-bottom: 1px solid var(--hair);
  padding: 0 0 24px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rep-filters-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.rep-reset {
  appearance: none;
  background: transparent;
  border: 0;
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ash);
  cursor: pointer;
  padding: 4px 0;
}
.rep-reset:not(:disabled):hover { color: var(--ink); }
.rep-reset:disabled { opacity: 0.4; cursor: not-allowed; }

.rep-filter-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.rep-filter-label {
  min-width: 78px;
  font: 500 10px/1 var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ash);
}
.rep-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.rep-input {
  appearance: none;
  border: 1px solid var(--hair);
  background: var(--paper);
  color: var(--ink);
  padding: 8px 12px;
  font: 400 13px/1.2 var(--font-sans, system-ui);
  border-radius: 6px;
  outline: none;
  transition: border-color 120ms ease;
}
.rep-input:focus { border-color: var(--ink); }
.rep-input-wide { flex: 1; min-width: 220px; max-width: 360px; }

/* ── Breakdown panels ───────────────────────────────────────── */
.rep-breakdown-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
  margin-top: 8px;
}
.rep-panel {
  padding: 20px 24px;
  border-right: 1px solid var(--hair);
}
.rep-panel:last-child { border-right: none; }
.rep-panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 8px;
}
.rep-panel-sum {
  font: 600 1.1rem/1 var(--font-display);
  font-variant-numeric: tabular-nums;
}
.rep-panel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rep-panel-table td, .rep-panel-table th {
  padding: 8px 0;
  border-bottom: 1px solid var(--hair);
}
.rep-panel-table tr:last-child td { border-bottom: none; }
.rep-panel-table th {
  font: 500 10px/1 var(--font-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ash);
  text-align: right;
  padding-bottom: 8px;
}
.rep-panel-count { width: 40px; text-align: right; color: var(--ash); font-family: var(--font-mono); font-size: 11px; }
.rep-panel-amt { text-align: right; font-variant-numeric: tabular-nums; }
.rep-panel-empty {
  padding: 24px 0;
  color: var(--ash);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 900px) {
  .rep-breakdown-grid { grid-template-columns: 1fr; }
  .rep-panel { border-right: none; border-bottom: 1px solid var(--hair); }
  .rep-panel:last-child { border-bottom: none; }
}

/* ── Tamil season summary ───────────────────────────────────── */
.rep-season {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding: 12px 0 0;
  border-top: 1px solid var(--hair);
}
.rep-season-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font: 500 12px/1 var(--font-mono);
  letter-spacing: 0.02em;
  color: var(--ash);
  --tier: var(--ash);
}
.rep-season-item.tier-peak   { --tier: var(--accent-ink, #b5651d); }
.rep-season-item.tier-high   { --tier: var(--accent-ink, #b5651d); }
.rep-season-item.tier-normal { --tier: var(--ash, #888); }
.rep-season-item.tier-low    { --tier: var(--signal-red, #c0392b); }
.rep-season-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tier);
}
.rep-season-rent { color: var(--ash-2, #aaa); }
</style>
