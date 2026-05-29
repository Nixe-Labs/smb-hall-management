<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils/currency'
import { bucketForBooking, dueLabel, summarize, FORECAST_BUCKET_LABEL, type ForecastBucket } from '@/lib/utils/forecast'
import ForecastPopover from '@/components/finance/ForecastPopover.vue'
import TamilDemandBadge from '@/components/common/TamilDemandBadge.vue'
import { TAMIL_MONTHS, getTamilDate } from '@/lib/utils/tamilCalendar'
import { monthTier, buildDemandHistory, TIER_LABEL, type DemandHistory, type DemandTier } from '@/lib/utils/tamilDemand'
import type { Booking, BookingAdvanceForecast, BookingPaymentStatus, PaymentStatus } from '@/types/database'

const router = useRouter()
const loading = ref(true)

const totalRevenue = ref(0)
const totalCollected = ref(0)
const totalExpenses = ref(0)
const totalBookings = ref(0)
const completedBookings = ref(0)
const upcomingBookings = ref(0)
const paymentStatusByBooking = ref<Record<string, BookingPaymentStatus>>({})
const weekBookings = ref<Booking[]>([])
const upcomingList = ref<Booking[]>([])
const recentList = ref<Booking[]>([])
const todayBooking = ref<Booking | null>(null)

const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthlyRevenue = ref<number[]>(allMonths.map(() => 0))
const currentMonth = ref(new Date().getMonth())

const forecastRows = ref<BookingAdvanceForecast[]>([])
const forecastTotals = computed(() => summarize(forecastRows.value))
const forecastList = computed(() =>
  [...forecastRows.value]
    .filter(r => r.expected_advance_amount != null && Number(r.advance_owed) > 0)
    .sort((a, b) => {
      // overdue first, then ascending due date
      const ad = a.advance_due_date ?? '9999-12-31'
      const bd = b.advance_due_date ?? '9999-12-31'
      return ad < bd ? -1 : ad > bd ? 1 : 0
    })
)
const forecastById = computed(() => {
  const m: Record<string, BookingAdvanceForecast> = {}
  for (const r of forecastRows.value) m[r.id] = r
  return m
})

// Rows that make up each forecast cell — rolling mode matches forecastTotals
function bucketRows(bucket: ForecastBucket | 'total'): BookingAdvanceForecast[] {
  if (bucket === 'total') return forecastList.value
  return forecastList.value.filter(r => bucketForBooking(r) === bucket)
}
function goToBooking(id: string) {
  router.push({ name: 'booking-detail', params: { id } })
}

function pipelinePill(id: string) {
  const r = forecastById.value[id]
  if (!r || r.expected_advance_amount == null) return null
  const owed = Number(r.advance_owed)
  if (owed <= 0) return null
  return {
    bucket: bucketForBooking(r) ?? 'later',
    owed,
    due_label: dueLabel(r.advance_due_date),
  }
}

function paymentStatusFor(id: string): PaymentStatus | null {
  const ps = paymentStatusByBooking.value[id]
  return ps ? ps.payment_status : null
}

function paymentPaidAmount(id: string): number {
  const ps = paymentStatusByBooking.value[id]
  return ps ? Number(ps.total_paid) : 0
}

const today = new Date()
const todayStr = today.toISOString().slice(0, 10)
const todayFormatted = today.toLocaleDateString('en-IN', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
}).toUpperCase()
const currentYear = today.getFullYear()

// ── Tamil season demand outlook ──────────────────────────────
const demandHistory = ref<DemandHistory | null>(null)
const tamilNowMonth = getTamilDate(todayStr)
interface SeasonCell { ino: number; name: string; ta: string; tier: DemandTier; label: string; current: boolean }
const seasonOutlook = computed<SeasonCell[]>(() => {
  const startIno = tamilNowMonth?.month.ino ?? 0
  return Array.from({ length: 12 }, (_, i) => {
    const ino = (startIno + i) % 12
    const tier = monthTier(ino)
    return { ino, name: TAMIL_MONTHS[ino]!.en, ta: TAMIL_MONTHS[ino]!.ta, tier, label: TIER_LABEL[tier], current: i === 0 }
  })
})

const netProfit = computed(() => totalRevenue.value - totalExpenses.value)
const marginPct = computed(() => totalRevenue.value > 0 ? Math.round((netProfit.value / totalRevenue.value) * 100) : 0)
const revenueLakh = computed(() => Math.round(totalRevenue.value / 100000))

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${Math.round(n / 1000)}K`
  return `₹${Math.round(n)}`
}

function getStatus(b: Booking): 'ongoing' | 'upcoming' | 'completed' | 'cancelled' {
  if (b.status === 'cancelled') return 'cancelled'
  const d = new Date(b.function_date + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  if (d.getTime() < t.getTime()) return 'completed'
  if (d.getTime() === t.getTime()) return 'ongoing'
  return 'upcoming'
}

function shortDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function longDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

// Bar chart
const barMax = computed(() => Math.max(...monthlyRevenue.value, 1))

const tickerItems = computed(() => {
  const items: string[] = []
  if (upcomingBookings.value > 0) items.push(`${upcomingBookings.value} UPCOMING EVENTS ON THE BOOKS`)
  items.push(`FY ${currentYear} REVENUE · ${fmt(totalRevenue.value)}`)
  items.push(`COLLECTED · ${fmt(totalCollected.value)}`)
  if (completedBookings.value > 0) items.push(`${completedBookings.value} EVENTS DELIVERED`)
  if (weekBookings.value.length > 0) items.push(`THIS WEEK · ${weekBookings.value.length} EVENTS SCHEDULED`)
  items.push(`NET PROFIT · ${fmt(netProfit.value)} · ${marginPct.value}% MARGIN`)
  if (totalBookings.value > 0) items.push(`TOTAL BOOKINGS · ${totalBookings.value}`)
  if (upcomingList.value[0]) items.push(`NEXT EVENT — ${upcomingList.value[0].customer_name}`)
  return items.length > 0 ? items : ['SMB MARRIAGE HALL · TIRUNELVELI · EST. 1996']
})

async function fetchData() {
  loading.value = true
  try {
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    const weekStart = startOfWeek.toISOString().slice(0, 10)
    const weekEnd = endOfWeek.toISOString().slice(0, 10)
    const yearStart = `${currentYear}-01-01`
    const yearEnd = `${currentYear}-12-31`

    const [
      { count: total },
      { count: completed },
      { count: upcoming },
      { data: yearBookingRents },
      { data: yearBills },
      { data: yearAdvances },
      { data: yearDeposits },
      { data: yearExpenses },
      { data: weekData },
      { data: upcomingData },
      { data: recentData },
      { data: todayData },
      { data: forecastData },
      { data: paymentStatusData },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }).neq('status', 'cancelled'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).lt('function_date', todayStr).neq('status', 'cancelled'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('function_date', todayStr).neq('status', 'cancelled'),
      supabase.from('bookings').select('rent, function_date').gte('function_date', yearStart).lte('function_date', yearEnd).neq('status', 'cancelled'),
      supabase.from('bill_items').select('amount, bookings!inner(function_date, status)').gte('bookings.function_date', yearStart).lte('bookings.function_date', yearEnd).neq('bookings.status', 'cancelled'),
      supabase.from('advance_payments').select('amount, bookings!inner(function_date, status)').gte('bookings.function_date', yearStart).lte('bookings.function_date', yearEnd).neq('bookings.status', 'cancelled'),
      supabase.from('deposits').select('amount, bookings!inner(function_date, status)').gte('bookings.function_date', yearStart).lte('bookings.function_date', yearEnd).neq('bookings.status', 'cancelled'),
      supabase.from('expenses').select('amount, bookings!inner(function_date, status)').gte('bookings.function_date', yearStart).lte('bookings.function_date', yearEnd).neq('bookings.status', 'cancelled'),
      supabase.from('bookings').select('*').gte('function_date', weekStart).lte('function_date', weekEnd).neq('status', 'cancelled').order('function_date'),
      supabase.from('bookings').select('*').gte('function_date', todayStr).neq('status', 'cancelled').order('function_date').limit(8),
      supabase.from('bookings').select('*').lt('function_date', todayStr).neq('status', 'cancelled').order('function_date', { ascending: false }).limit(8),
      supabase.from('bookings').select('*').eq('function_date', todayStr).neq('status', 'cancelled').limit(1),
      supabase.from('bookings_advance_forecast').select('*').gte('function_date', todayStr).neq('status', 'cancelled'),
      supabase.from('bookings_payment_status').select('*').gte('function_date', yearStart).lte('function_date', yearEnd).neq('booking_status', 'cancelled'),
    ])

    const rentsTotal = (yearBookingRents as any[])?.reduce((s: number, b: any) => s + Number(b.rent), 0) ?? 0
    const billsTotal = (yearBills as any[])?.reduce((s: number, i: any) => s + Number(i.amount), 0) ?? 0
    const advancesTotal = (yearAdvances as any[])?.reduce((s: number, i: any) => s + Number(i.amount), 0) ?? 0
    const depositsTotal = (yearDeposits as any[])?.reduce((s: number, i: any) => s + Number(i.amount), 0) ?? 0

    totalRevenue.value = rentsTotal + billsTotal
    totalCollected.value = advancesTotal + depositsTotal
    totalExpenses.value = (yearExpenses as any[])?.reduce((s: number, i: any) => s + Number(i.amount), 0) ?? 0
    totalBookings.value = total ?? 0
    completedBookings.value = completed ?? 0
    upcomingBookings.value = upcoming ?? 0
    weekBookings.value = (weekData as Booking[]) ?? []
    upcomingList.value = (upcomingData as Booking[]) ?? []
    recentList.value = (recentData as Booking[]) ?? []
    todayBooking.value = (todayData as Booking[])?.[0] ?? null

    // Monthly revenue for the current year = booking rent + bill items, bucketed by function_date
    const byMonth: number[] = allMonths.map(() => 0)
    ;(yearBookingRents as any[])?.forEach((b: any) => {
      const m = new Date(b.function_date).getMonth()
      if (m >= 0 && m < 12) byMonth[m]! += Number(b.rent)
    })
    ;(yearBills as any[])?.forEach((item: any) => {
      const m = new Date(item.bookings?.function_date).getMonth()
      if (m >= 0 && m < 12) byMonth[m]! += Number(item.amount)
    })
    monthlyRevenue.value = byMonth

    forecastRows.value = (forecastData as BookingAdvanceForecast[]) ?? []

    // Tamil demand history — count past bookings per Tamil month
    const { data: allFnDates } = await supabase.from('bookings').select('function_date').neq('status', 'cancelled')
    demandHistory.value = buildDemandHistory(((allFnDates as { function_date: string }[]) ?? []).map(b => b.function_date))

    const psMap: Record<string, BookingPaymentStatus> = {}
    ;((paymentStatusData as BookingPaymentStatus[]) ?? []).forEach(r => { psMap[r.booking_id] = r })
    paymentStatusByBooking.value = psMap
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
</script>

<template>
  <div>
    <!-- Marquee ticker -->
    <div class="marquee" style="border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair)">
      <div class="marquee-track">
        <template v-for="_ in 3" :key="_">
          <template v-for="(item, i) in tickerItems" :key="i">
            <span class="marquee-item">{{ item }}</span>
            <span class="marquee-dot">●</span>
          </template>
        </template>
      </div>
    </div>

    <div class="screen">
      <!-- Loading -->
      <div v-if="loading" class="loading-center">
        <div class="smb-spinner"></div>
      </div>

      <template v-else>
        <!-- Masthead -->
        <div class="masthead fade-in">
          <div class="masthead-l">
            <div class="t-mono" style="color: var(--ash)">VOL. 02 · FY {{ currentYear }}</div>
            <div class="t-mono" style="color: var(--ash)">{{ todayFormatted }}</div>
          </div>
          <div class="masthead-c">
            <span class="masthead-title t-display-italic">The Ledger</span>
          </div>
          <div class="masthead-r">
            <div class="t-mono" style="color: var(--ash)">EST. 1996 · ₹ FY {{ currentYear }}</div>
          </div>
        </div>

        <!-- Cover Hero -->
        <div class="cover">
          <!-- Left: big number -->
          <div class="cover-l fade-up">
            <div class="cover-eyebrow">
              <span class="t-mono" style="color: var(--ash)">I · TOTAL REVENUE</span>
              <span class="t-mono" style="color: var(--ash)">FY {{ currentYear }} · YTD</span>
            </div>
            <div class="cover-num">
              <span class="cover-currency">₹</span>
              <span style="display: inline-block">{{ revenueLakh }}</span>
              <span class="cover-num-suffix t-display-italic">L</span>
            </div>
            <div class="cover-strap">
              A <em class="t-display-italic">{{ netProfit > 0 ? 'strong' : 'building' }}</em> year, with
              <strong>{{ completedBookings }} events</strong> delivered,
              <strong>{{ upcomingBookings }} on the books</strong>,
              <strong>{{ fmt(totalCollected) }} collected</strong>
              and <strong>{{ fmt(netProfit) }} profit</strong> through
              {{ new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long' }) }}.
            </div>
            <div class="cover-metrics">
              <div class="cover-metric">
                <div class="t-eyebrow">Net profit</div>
                <div class="cover-metric-num">{{ fmt(netProfit) }}</div>
                <div class="cover-metric-delta">{{ marginPct }}% margin</div>
              </div>
              <div class="cover-metric">
                <div class="t-eyebrow">Collected</div>
                <div class="cover-metric-num" style="color:var(--accent-ink)">{{ fmt(totalCollected) }}</div>
                <div class="cover-metric-delta">advance + deposits</div>
              </div>
              <div class="cover-metric">
                <div class="t-eyebrow">Expenses</div>
                <div class="cover-metric-num">{{ fmt(totalExpenses) }}</div>
                <div class="cover-metric-delta">operational</div>
              </div>
            </div>

            <!-- Advance forecast — fills the cover-l space -->
            <div class="cover-forecast">
              <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:18px">
                <div>
                  <div class="t-eyebrow" style="margin-bottom:6px">Advance forecast</div>
                  <h3 class="t-h3">Cash to collect.</h3>
                </div>
                <span class="t-mono" style="color:var(--ash);font-size:11px">
                  {{ forecastList.length }} owing
                </span>
              </div>

              <div class="cover-forecast-kpis">
                <ForecastPopover title="Overdue" align="left" :rows="bucketRows('overdue')" empty-text="Nothing overdue — all clear." @select="goToBooking">
                  <div class="cover-fc-cell">
                    <div class="t-eyebrow">Overdue</div>
                    <div class="cover-fc-num" :style="{ color: forecastTotals.overdue > 0 ? 'var(--signal-red)' : 'var(--ink)' }">
                      {{ fmt(forecastTotals.overdue) }}
                    </div>
                    <div class="cover-fc-delta">{{ forecastTotals.overdue > 0 ? 'follow up now' : 'all clear' }}</div>
                  </div>
                </ForecastPopover>
                <ForecastPopover title="This week" align="left" :rows="bucketRows('this_week')" empty-text="Nothing due this week." @select="goToBooking">
                  <div class="cover-fc-cell">
                    <div class="t-eyebrow">This week</div>
                    <div class="cover-fc-num">{{ fmt(forecastTotals.this_week) }}</div>
                    <div class="cover-fc-delta">next 7 days</div>
                  </div>
                </ForecastPopover>
                <ForecastPopover title="This month" align="left" :rows="bucketRows('this_month')" empty-text="Nothing due this month." @select="goToBooking">
                  <div class="cover-fc-cell">
                    <div class="t-eyebrow">This month</div>
                    <div class="cover-fc-num">{{ fmt(forecastTotals.this_month) }}</div>
                    <div class="cover-fc-delta">next 30 days</div>
                  </div>
                </ForecastPopover>
                <ForecastPopover title="Total owed" align="right" :rows="bucketRows('total')" empty-text="Nothing owing." @select="goToBooking">
                  <div class="cover-fc-cell">
                    <div class="t-eyebrow">Total</div>
                    <div class="cover-fc-num" style="color:var(--accent-ink)">{{ fmt(forecastTotals.total_owed) }}</div>
                    <div class="cover-fc-delta">{{ forecastTotals.bookings_with_target }} on books</div>
                  </div>
                </ForecastPopover>
              </div>

              <div v-if="forecastList.length === 0" class="cover-fc-empty">
                No advances on the forecast — set an expected amount + due date on any booking.
              </div>
              <div v-else class="cover-fc-list">
                <div
                  v-for="b in forecastList.slice(0, 4)"
                  :key="b.id"
                  class="cover-fc-row"
                  @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
                >
                  <div class="cover-fc-row-date">{{ b.advance_due_date ? shortDate(b.advance_due_date) : '—' }}</div>
                  <div class="cover-fc-row-name">
                    <div class="reveal-line">{{ b.customer_name }}</div>
                    <span :class="['fc-pill', 'fc-' + (bucketForBooking(b) ?? 'later')]">
                      {{ FORECAST_BUCKET_LABEL[bucketForBooking(b) ?? 'later'] }} · {{ dueLabel(b.advance_due_date) }}
                    </span>
                  </div>
                  <div class="cover-fc-row-amt">{{ fmt(Number(b.advance_owed)) }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: feature card — today's or next upcoming -->
          <div v-if="todayBooking || upcomingList[0]" class="cover-r fade-up delay-2"
               @click="router.push({ name: 'booking-detail', params: { id: (todayBooking || upcomingList[0])!.id } })">
            <!-- Geometric artwork -->
            <div class="cover-art" style="background: var(--paper-3)">
              <svg viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;position:absolute;inset:0">
                <defs>
                  <linearGradient id="hero-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="var(--paper-2)"/>
                    <stop offset="100%" stop-color="var(--hair)"/>
                  </linearGradient>
                </defs>
                <rect width="400" height="280" fill="url(#hero-grad)"/>
                <circle cx="300" cy="60" r="90" fill="rgba(181,101,29,0.08)"/>
                <circle cx="80" cy="220" r="60" fill="rgba(181,101,29,0.05)"/>
                <path d="M0,140 Q200,40 400,160" stroke="rgba(26,26,26,0.12)" stroke-width="1" fill="none"/>
                <path d="M0,180 Q200,100 400,200" stroke="rgba(26,26,26,0.06)" stroke-width="1" fill="none"/>
              </svg>
              <div class="cover-art-label">
                <span class="t-mono" style="color: var(--ash)">{{ (todayBooking || upcomingList[0])?.id }}</span>
              </div>
            </div>
            <div class="cover-r-meta">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <span :class="['tag', 'tag-' + getStatus(todayBooking || upcomingList[0]!)]">
                  {{ getStatus(todayBooking || upcomingList[0]!) }}
                </span>
                <span class="t-mono" style="color: var(--ash)">{{ shortDate((todayBooking || upcomingList[0])!.function_date) }}</span>
              </div>
              <div class="t-eyebrow" style="margin-bottom: 8px">
                {{ longDate((todayBooking || upcomingList[0])!.function_date).toUpperCase() }}
              </div>
              <h3 class="cover-r-title">
                {{ (todayBooking || upcomingList[0])!.customer_name }}.
              </h3>
              <div class="cover-r-stats">
                <div>
                  <div class="t-eyebrow">Rent</div>
                  <div class="cover-r-stat-num">{{ fmt((todayBooking || upcomingList[0])!.rent) }}</div>
                </div>
                <div>
                  <div class="t-eyebrow">Status</div>
                  <div class="cover-r-stat-num" style="text-transform:capitalize">{{ getStatus(todayBooking || upcomingList[0]!) }}</div>
                </div>
                <div>
                  <div class="t-eyebrow">Date</div>
                  <div class="cover-r-stat-num">{{ shortDate((todayBooking || upcomingList[0])!.function_date) }}</div>
                </div>
              </div>
              <div class="cover-r-cta reveal-line">Open booking →</div>
            </div>
          </div>
          <div v-else class="cover-r fade-up delay-2" style="align-items:center;justify-content:center;color:var(--ash)">
            <div style="text-align:center;padding:48px 24px">
              <div class="t-eyebrow" style="margin-bottom:16px">No upcoming events</div>
              <button class="btn btn-primary" @click="router.push({ name: 'booking-create' })">Book a date →</button>
            </div>
          </div>
        </div>

        <!-- Section break II — Performance -->
        <div class="section-break fade-in">
          <div class="section-break-num t-display-italic">II</div>
          <div class="section-break-rule"></div>
          <div class="t-mono" style="color: var(--ash)">Performance · Year to date</div>
        </div>

        <!-- KPI strip -->
        <div class="kpi-strip fade-up delay-2">
          <div class="kpi-cell">
            <div class="kpi-cell-label">
              <span class="t-eyebrow">Revenue</span>
              <span class="t-mono" style="color:var(--ash-2)">FY {{ currentYear }}</span>
            </div>
            <div class="kpi-cell-num">{{ fmt(totalRevenue) }}</div>
            <div class="kpi-cell-foot">
              <span class="kpi-delta">rent + bill items</span>
              <span class="t-mono" style="font-size:10px;color:var(--ash-2)">{{ totalBookings }} bookings</span>
            </div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-cell-label">
              <span class="t-eyebrow">Collected</span>
              <span class="t-mono" style="color:var(--ash-2)">FY {{ currentYear }}</span>
            </div>
            <div class="kpi-cell-num" style="color:var(--accent-ink)">{{ fmt(totalCollected) }}</div>
            <div class="kpi-cell-foot">
              <span class="kpi-delta">advance + deposits</span>
              <span class="t-mono" style="font-size:10px;color:var(--ash-2)">{{ totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0 }}% of bill</span>
            </div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-cell-label">
              <span class="t-eyebrow">Expenses</span>
              <span class="t-mono" style="color:var(--ash-2)">FY {{ currentYear }}</span>
            </div>
            <div class="kpi-cell-num">{{ fmt(totalExpenses) }}</div>
            <div class="kpi-cell-foot">
              <span class="kpi-delta is-down">operational costs</span>
            </div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-cell-label">
              <span class="t-eyebrow">Net Profit</span>
              <span class="t-mono" style="color:var(--ash-2)">Margin</span>
            </div>
            <div class="kpi-cell-num" :style="{ color: netProfit >= 0 ? 'var(--accent-ink)' : 'var(--signal-red)' }">{{ fmt(netProfit) }}</div>
            <div class="kpi-cell-foot">
              <span class="kpi-delta">{{ marginPct }}% margin</span>
              <span class="t-mono" style="font-size:10px;color:var(--ash-2)">revenue − expenses</span>
            </div>
          </div>
        </div>

        <!-- Tamil season · demand outlook -->
        <div class="tamil-season fade-up delay-3">
          <div class="tamil-season-head">
            <div>
              <div class="t-eyebrow" style="margin-bottom:8px">Tamil season · demand outlook</div>
              <h3 class="t-h3">Pricing seasons.</h3>
            </div>
            <div v-if="tamilNowMonth" class="tamil-season-now">
              <span class="t-eyebrow" style="display:block;margin-bottom:6px">Right now</span>
              <TamilDemandBadge :date-str="todayStr" :history="demandHistory" variant="inline" />
            </div>
          </div>
          <div class="season-grid">
            <div
              v-for="m in seasonOutlook"
              :key="m.ino"
              :class="['season-chip', 'tier-' + m.tier, m.current ? 'is-current' : '']"
            >
              <div class="season-chip-month">{{ m.name }}</div>
              <div class="season-chip-ta">{{ m.ta }}</div>
              <div class="season-chip-tier">{{ m.label }}</div>
            </div>
          </div>
          <p class="tamil-season-note">
            Traditional wedding-season demand by Tamil month. Valarpirai (waxing) dates run higher within each month;
            advisory only — your pricing stays in your hands.
          </p>
        </div>

        <!-- Revenue chart + this week -->
        <div class="dash-grid">
          <!-- Bar chart -->
          <div class="fade-up delay-3">
            <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap">
              <div>
                <div class="t-eyebrow" style="margin-bottom:8px">Revenue Analytics</div>
                <h3 class="t-h3">{{ currentYear }} · Monthly</h3>
              </div>
              <span class="t-mono" style="color:var(--ash)">FY {{ currentYear }}</span>
            </div>
            <div class="bar-chart">
              <div v-for="(rev, i) in monthlyRevenue" :key="i" class="bar-item">
                <div class="bar-track">
                  <div
                    class="bar-fill"
                    :class="{
                      'is-accent': i === currentMonth,
                      'is-future': i > currentMonth
                    }"
                    :style="{ height: Math.max((rev / barMax) * 100, 1) + '%' }"
                    :title="formatCurrency(rev)"
                  ></div>
                </div>
                <div class="bar-label" :style="{ color: i === currentMonth ? 'var(--ink)' : 'var(--ash)' }">
                  {{ (allMonths[i] ?? '').slice(0, 3).toUpperCase() }}
                </div>
              </div>
            </div>
          </div>

          <!-- This week -->
          <div class="fade-up delay-4">
            <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:16px;gap:16px;flex-wrap:wrap">
              <div>
                <div class="t-eyebrow" style="margin-bottom:8px">This Week</div>
                <h3 class="t-h3">{{ weekBookings.length }} events</h3>
              </div>
              <a class="reveal-line" style="cursor:pointer;font-size:12px;color:var(--ash)" @click="router.push({ name: 'bookings-calendar' })">View calendar →</a>
            </div>
            <div v-if="weekBookings.length === 0" style="padding:48px 0;text-align:center;color:var(--ash)">
              No bookings this week
            </div>
            <div
              v-for="b in weekBookings.slice(0, 6)"
              :key="b.id"
              class="week-row"
              @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
            >
              <div class="week-day">
                <div class="week-day-num">{{ new Date(b.function_date + 'T00:00:00').getDate() }}</div>
                <div class="week-day-mon">{{ new Date(b.function_date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' }).toUpperCase() }}</div>
              </div>
              <div style="min-width:0">
                <div style="font-weight:600;font-size:14px">{{ b.customer_name }}</div>
                <div style="color:var(--ash);font-size:12px;margin-top:3px">{{ fmt(b.rent) }}</div>
              </div>
              <span :class="['tag', 'tag-' + getStatus(b)]">{{ getStatus(b) }}</span>
            </div>
          </div>
        </div>

        <!-- Section break III — Calendar / Activity -->
        <div class="section-break fade-in">
          <div class="section-break-num t-display-italic">III</div>
          <div class="section-break-rule"></div>
          <div class="t-mono" style="color: var(--ash)">Calendar · Activity</div>
        </div>

        <!-- Recent + Upcoming -->
        <div class="dash-grid" style="border-bottom: none">
          <!-- Recent -->
          <div class="fade-up delay-5">
            <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:24px;gap:16px">
              <div>
                <div class="t-eyebrow" style="margin-bottom:8px">Activity</div>
                <h2 class="t-h2" style="display:inline">
                  Recent
                  <span style="margin-left:12px;color:var(--ash);font-size:13px;font-weight:400;font-family:var(--font-mono);letter-spacing:0.06em;vertical-align:middle">
                    [{{ String(recentList.length).padStart(2, '0') }}]
                  </span>
                </h2>
              </div>
            </div>
            <div
              v-for="b in recentList.slice(0, 6)"
              :key="b.id"
              class="act-item"
              @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
            >
              <div class="act-date">{{ shortDate(b.function_date) }}</div>
              <div style="min-width:0">
                <div class="act-name reveal-line">{{ b.customer_name }}</div>
                <div class="act-fn">{{ b.id }}</div>
              </div>
              <div class="act-amt">{{ fmt(b.rent) }}</div>
            </div>
            <div v-if="recentList.length === 0" style="padding:32px 0;color:var(--ash);text-align:center">No completed bookings yet</div>
          </div>

          <!-- Upcoming -->
          <div class="fade-up delay-6">
            <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:24px;gap:16px">
              <div>
                <div class="t-eyebrow" style="margin-bottom:8px">Upcoming</div>
                <h2 class="t-h2" style="display:inline">
                  Pipeline
                  <span style="margin-left:12px;color:var(--ash);font-size:13px;font-weight:400;font-family:var(--font-mono);letter-spacing:0.06em;vertical-align:middle">
                    [{{ String(upcomingList.length).padStart(2, '0') }}]
                  </span>
                </h2>
              </div>
            </div>
            <div
              v-for="b in upcomingList.slice(0, 6)"
              :key="b.id"
              class="act-item"
              @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
            >
              <div class="act-date">{{ shortDate(b.function_date) }}</div>
              <div style="min-width:0">
                <div class="act-name reveal-line">{{ b.customer_name }}</div>
                <div class="act-fn">
                  <span v-if="paymentStatusFor(b.id) === 'paid'" class="pay-pill pay-paid">✓ Paid</span>
                  <span v-else-if="paymentStatusFor(b.id) === 'partial'" class="pay-pill pay-partial">{{ fmt(paymentPaidAmount(b.id)) }} paid</span>
                  <span v-if="pipelinePill(b.id)" :class="['fc-pill', 'fc-' + pipelinePill(b.id)!.bucket]">
                    {{ fmt(pipelinePill(b.id)!.owed) }} · {{ pipelinePill(b.id)!.due_label }}
                  </span>
                </div>
              </div>
              <div class="act-amt">{{ fmt(b.rent) }}</div>
            </div>
            <div v-if="upcomingList.length === 0" style="padding:32px 0;color:var(--ash);text-align:center">No upcoming bookings</div>
          </div>
        </div>

        <!-- Footer pull-quote -->
        <div class="dash-footer fade-up delay-6">
          <div class="t-eyebrow" style="margin-bottom: 16px">Note from the operator</div>
          <p class="dash-footer-quote">
            <span class="t-display-italic">"Every wedding here is the most important day of someone's life. </span>
            <span>We just keep the books straight."</span>
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tamil-season {
  border-top: 1px solid var(--hair);
  padding: 28px 0;
}
.tamil-season-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.tamil-season-now { min-width: 0; max-width: 460px; }

.season-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.season-chip {
  border: 1px solid var(--hair);
  border-radius: 8px;
  padding: 12px 10px;
  background: var(--paper);
  --tier: var(--ash, #888);
}
.season-chip.tier-peak   { --tier: var(--accent-ink, #b5651d); border-color: var(--accent-ink); background: var(--accent-soft, rgba(181,101,29,0.10)); }
.season-chip.tier-high   { --tier: var(--accent-ink, #b5651d); border-color: var(--ash-2); }
.season-chip.tier-normal { --tier: var(--ash, #888); }
.season-chip.tier-low    { --tier: var(--signal-red, #c0392b); opacity: 0.85; }
.season-chip.is-current  { outline: 2px solid var(--accent, #b5651d); outline-offset: 1px; }

.season-chip-month {
  font: 600 14px/1 var(--font-display, serif);
  color: var(--ink);
}
.season-chip-ta {
  font-size: 12px;
  color: var(--ash);
  margin-top: 4px;
}
.season-chip-tier {
  margin-top: 8px;
  font: 600 9px/1.2 var(--font-mono, monospace);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tier);
}
.tamil-season-note {
  margin: 16px 0 0;
  font: 500 11px/1.5 var(--font-mono, monospace);
  color: var(--ash);
  letter-spacing: 0.02em;
  max-width: 720px;
}

@media (max-width: 768px) {
  .season-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 420px) {
  .season-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
