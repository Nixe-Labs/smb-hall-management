<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { Booking } from '@/types/database'

const router = useRouter()

interface BookingRow extends Booking {
  total_bill: number
  total_expenses: number
  total_advance: number
  profit: number
}

type RangeKey = 'last30' | 'q1' | 'q2' | 'ytd' | 'all'

const rangeOptions: { k: RangeKey; l: string }[] = [
  { k: 'last30', l: 'Last 30 days' },
  { k: 'q1', l: 'Q1' },
  { k: 'q2', l: 'Q2' },
  { k: 'ytd', l: 'Year to date' },
  { k: 'all', l: 'All time' },
]

const range = ref<RangeKey>('ytd')
const rows = ref<BookingRow[]>([])
const loading = ref(false)

const totals = computed(() => ({
  revenue: rows.value.reduce((s, r) => s + r.total_bill, 0),
  expenses: rows.value.reduce((s, r) => s + r.total_expenses, 0),
  advance: rows.value.reduce((s, r) => s + r.total_advance, 0),
}))

const expensePct = computed(() =>
  totals.value.revenue > 0 ? Math.round(totals.value.expenses / totals.value.revenue * 100) : 0
)
const marginPct = computed(() =>
  totals.value.revenue > 0 ? Math.round((totals.value.revenue - totals.value.expenses) / totals.value.revenue * 100) : 0
)

function getDateRange(): { start: string; end: string } | null {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const year = today.getFullYear()

  if (range.value === 'last30') {
    const back = new Date(today)
    back.setDate(back.getDate() - 30)
    return { start: back.toISOString().slice(0, 10), end: todayStr }
  }
  if (range.value === 'q1') return { start: `${year}-01-01`, end: `${year}-03-31` }
  if (range.value === 'q2') return { start: `${year}-04-01`, end: `${year}-06-30` }
  if (range.value === 'ytd') return { start: `${year}-01-01`, end: todayStr }
  return null
}

function getStatus(b: Booking): string {
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

async function fetchReport() {
  loading.value = true
  try {
    let query = supabase
      .from('bookings')
      .select('*')
      .neq('status', 'cancelled')
      .order('function_date', { ascending: false })

    const dr = getDateRange()
    if (dr) query = query.gte('function_date', dr.start).lte('function_date', dr.end)

    const { data } = await query
    const bookings = (data as Booking[]) ?? []

    const results: BookingRow[] = await Promise.all(bookings.map(async b => {
      const [billRes, expRes, advRes] = await Promise.all([
        supabase.from('bill_items').select('amount').eq('booking_id', b.id),
        supabase.from('expenses').select('amount').eq('booking_id', b.id),
        supabase.from('advance_payments').select('amount').eq('booking_id', b.id),
      ])
      const total_bill = billRes.data?.reduce((s, i) => s + Number(i.amount), 0) ?? b.rent
      const total_expenses = expRes.data?.reduce((s, i) => s + Number(i.amount), 0) ?? 0
      const total_advance = advRes.data?.reduce((s, i) => s + Number(i.amount), 0) ?? 0
      return { ...b, total_bill, total_expenses, total_advance, profit: total_bill - total_expenses }
    }))

    rows.value = results
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  const headers = ['Date', 'Customer', 'Total Bill', 'Advance', 'Expenses', 'Profit', 'Status']
  const csvRows = rows.value.map(r => [
    r.function_date, r.customer_name, r.total_bill, r.total_advance, r.total_expenses, r.profit, statusLabels[getStatus(r)] ?? ''
  ])
  const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `smb-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(fetchReport)
</script>

<template>
  <div class="screen">
    <!-- Header -->
    <div class="fade-in" style="padding-top:32px;margin-bottom:24px">
      <div class="t-eyebrow" style="margin-bottom:12px">04 / Reports</div>
      <h1 class="t-h1">Financial reports.</h1>
    </div>

    <!-- Toolbar -->
    <div class="smb-table-toolbar fade-up">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button
          v-for="r in rangeOptions"
          :key="r.k"
          :class="['smb-filter-pill', range === r.k ? 'is-active' : '']"
          @click="range = r.k; fetchReport()"
        >{{ r.l }}</button>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" @click="exportCSV" :disabled="rows.length === 0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Export CSV
        </button>
      </div>
    </div>

    <!-- Summary strip -->
    <div v-if="!loading" class="rep-summary fade-up delay-2">
      <div>
        <div class="t-eyebrow" style="margin-bottom:12px">Revenue</div>
        <div class="t-num" style="font-size:clamp(2rem,4vw,3rem)">{{ formatCurrency(totals.revenue) }}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:8px">{{ rows.length }} bookings</div>
      </div>
      <div>
        <div class="t-eyebrow" style="margin-bottom:12px">Expenses</div>
        <div class="t-num" style="font-size:clamp(2rem,4vw,3rem);color:var(--signal-red)">{{ formatCurrency(totals.expenses) }}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:8px">{{ expensePct }}% of revenue</div>
      </div>
      <div>
        <div class="t-eyebrow" style="margin-bottom:12px">Net Profit</div>
        <div class="t-num" style="font-size:clamp(2rem,4vw,3rem);color:var(--accent-ink)">{{ formatCurrency(totals.revenue - totals.expenses) }}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:8px">{{ marginPct }}% margin</div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-center">
      <div class="smb-spinner"></div>
    </div>

    <!-- Table -->
    <div v-else class="smb-table-wrap fade-up delay-3" style="margin-top:24px">
      <table class="table">
        <thead>
          <tr>
            <th style="width:130px">Date</th>
            <th>Customer</th>
            <th style="text-align:right">Bill</th>
            <th style="text-align:right">Advance</th>
            <th style="text-align:right">Expenses</th>
            <th style="text-align:right">Profit</th>
            <th style="width:120px">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td colspan="7" style="text-align:center;color:var(--ash);padding:60px">No data for this period.</td>
          </tr>
          <tr
            v-for="r in rows"
            :key="r.id"
            @click="router.push({ name: 'booking-detail', params: { id: r.id } })"
          >
            <td>{{ formatDate(r.function_date) }}</td>
            <td style="font-weight:600">{{ r.customer_name }}</td>
            <td style="text-align:right;font-family:var(--font-display);font-weight:600;font-variant-numeric:tabular-nums">{{ formatCurrency(r.total_bill) }}</td>
            <td style="text-align:right;color:var(--ash);font-variant-numeric:tabular-nums">{{ formatCurrency(r.total_advance) }}</td>
            <td style="text-align:right;color:var(--signal-red);font-variant-numeric:tabular-nums">−{{ formatCurrency(r.total_expenses) }}</td>
            <td
              style="text-align:right;font-family:var(--font-display);font-weight:600;font-variant-numeric:tabular-nums"
              :style="{ color: r.profit >= 0 ? 'var(--accent-ink)' : 'var(--signal-red)' }"
            >{{ formatCurrency(r.profit) }}</td>
            <td>
              <span :class="['tag', 'tag-' + getStatus(r)]">{{ statusLabels[getStatus(r)] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
