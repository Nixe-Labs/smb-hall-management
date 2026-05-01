<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils/currency'
import type { Booking } from '@/types/database'

const router = useRouter()
const loading = ref(true)

const totalRevenue = ref(0)
const totalExpenses = ref(0)
const totalBookings = ref(0)
const completedBookings = ref(0)
const upcomingBookings = ref(0)
const weekBookings = ref<Booking[]>([])
const upcomingList = ref<Booking[]>([])
const recentList = ref<Booking[]>([])
const todayBooking = ref<Booking | null>(null)

const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthlyRevenue = ref<number[]>(allMonths.map(() => 0))
const currentMonth = ref(new Date().getMonth())

const today = new Date()
const todayStr = today.toISOString().slice(0, 10)
const todayFormatted = today.toLocaleDateString('en-IN', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
}).toUpperCase()
const currentYear = today.getFullYear()

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
      { data: billData },
      { data: expData },
      { data: weekData },
      { data: upcomingData },
      { data: recentData },
      { data: todayData },
      { data: monthBills },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }).neq('status', 'cancelled'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).lt('function_date', todayStr).neq('status', 'cancelled'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('function_date', todayStr).neq('status', 'cancelled'),
      supabase.from('bill_items').select('amount, bookings!inner(function_date, status)').lt('bookings.function_date', todayStr).neq('bookings.status', 'cancelled'),
      supabase.from('expenses').select('amount'),
      supabase.from('bookings').select('*').gte('function_date', weekStart).lte('function_date', weekEnd).neq('status', 'cancelled').order('function_date'),
      supabase.from('bookings').select('*').gte('function_date', todayStr).neq('status', 'cancelled').order('function_date').limit(8),
      supabase.from('bookings').select('*').lt('function_date', todayStr).neq('status', 'cancelled').order('function_date', { ascending: false }).limit(8),
      supabase.from('bookings').select('*').eq('function_date', todayStr).neq('status', 'cancelled').limit(1),
      supabase.from('bill_items').select('amount, bookings!inner(function_date, status)').gte('bookings.function_date', yearStart).lte('bookings.function_date', yearEnd).neq('bookings.status', 'cancelled'),
    ])

    totalRevenue.value = (billData as any[])?.reduce((s: number, i: any) => s + Number(i.amount), 0) ?? 0
    totalExpenses.value = (expData as any[])?.reduce((s: number, i: any) => s + Number(i.amount), 0) ?? 0
    totalBookings.value = total ?? 0
    completedBookings.value = completed ?? 0
    upcomingBookings.value = upcoming ?? 0
    weekBookings.value = (weekData as Booking[]) ?? []
    upcomingList.value = (upcomingData as Booking[]) ?? []
    recentList.value = (recentData as Booking[]) ?? []
    todayBooking.value = (todayData as Booking[])?.[0] ?? null

    // Monthly revenue for the current year
    const byMonth: number[] = allMonths.map(() => 0)
    ;(monthBills as any[])?.forEach((item: any) => {
      const m = new Date(item.bookings?.function_date).getMonth()
      if (m >= 0 && m < 12) byMonth[m]! += Number(item.amount)
    })
    monthlyRevenue.value = byMonth
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
            <div class="t-mono" style="color: var(--ash)">SMB · TIRUNELVELI</div>
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
              and <strong>{{ fmt(netProfit) }} profit</strong> earned through
              {{ new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long' }) }}.
            </div>
            <div class="cover-metrics">
              <div class="cover-metric">
                <div class="t-eyebrow">Net profit</div>
                <div class="cover-metric-num">{{ fmt(netProfit) }}</div>
                <div class="cover-metric-delta">{{ marginPct }}% margin</div>
              </div>
              <div class="cover-metric">
                <div class="t-eyebrow">Expenses</div>
                <div class="cover-metric-num">{{ fmt(totalExpenses) }}</div>
                <div class="cover-metric-delta">operational</div>
              </div>
              <div class="cover-metric">
                <div class="t-eyebrow">Pipeline</div>
                <div class="cover-metric-num">{{ upcomingBookings }}</div>
                <div class="cover-metric-delta">upcoming</div>
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

        <!-- Section break II -->
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
              <span class="kpi-delta">from bill items</span>
              <span class="t-mono" style="font-size:10px;color:var(--ash-2)">collected</span>
            </div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-cell-label">
              <span class="t-eyebrow">Expenses</span>
              <span class="t-mono" style="color:var(--ash-2)">All time</span>
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
            </div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-cell-label">
              <span class="t-eyebrow">Bookings</span>
              <span class="t-mono" style="color:var(--ash-2)">Active</span>
            </div>
            <div class="kpi-cell-num">{{ totalBookings }}</div>
            <div class="kpi-cell-foot">
              <span class="kpi-delta">{{ upcomingBookings }} upcoming</span>
              <span class="t-mono" style="font-size:10px;color:var(--ash-2)">{{ completedBookings }} completed</span>
            </div>
          </div>
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

        <!-- Section break III -->
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
                <div class="act-fn">{{ b.id }}</div>
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
          <div class="t-mono" style="color: var(--ash); margin-top: 16px">— SMB MARRIAGE HALL · TIRUNELVELI</div>
        </div>
      </template>
    </div>
  </div>
</template>
