<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils/currency'
import type { DashboardStats } from '@/types/finance'
import type { Booking } from '@/types/database'
import VueApexCharts from 'vue3-apexcharts'

const router = useRouter()

const stats = ref<DashboardStats>({
  total_revenue: 0,
  total_expenses: 0,
  net_profit: 0,
  total_bookings: 0,
  completed_bookings: 0,
  upcoming_bookings: 0,
})
const loading = ref(true)
const upcomingEvents = ref<Booking[]>([])

// Year selection for revenue chart
const selectedYear = ref(new Date().getFullYear())
const revenueLoading = ref(false)

// Series Data - always show all 12 months
const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const revenueSeries = ref([{ name: 'Revenue', data: allMonths.map(() => 0) }])
const chartCategories = ref<string[]>(allMonths)

// Chart Options
const chartOptions = computed(() => ({
  chart: {
    type: 'bar' as const,
    toolbar: { show: false },
    fontFamily: 'Outfit, sans-serif',
    background: 'transparent'
  },
  theme: { mode: 'light' as const },
  plotOptions: {
    bar: {
      columnWidth: '25%',
      borderRadius: 4,
    }
  },
  stroke: { show: false },
  colors: ['#10B981'],
  fill: { type: 'solid', opacity: 0.85 },
  grid: {
    borderColor: '#E5E7EB',
    strokeDashArray: 0,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } }
  },
  xaxis: {
    categories: chartCategories.value,
    axisBorder: { show: true, color: '#E5E7EB' },
    axisTicks: { show: false },
    labels: { style: { colors: '#6B7280', fontSize: '11px', fontWeight: 500 } }
  },
  yaxis: {
    min: 0,
    forceNiceScale: true,
    tickAmount: 5,
    labels: {
      style: { colors: '#6B7280', fontSize: '12px' },
      formatter: (value: number) => {
        if (value >= 100000) return `₹${Math.round(value / 100000)}L`
        if (value >= 1000) return `₹${Math.round(value / 1000)}k`
        return `₹${Math.round(value)}`
      }
    }
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: 'light',
    style: { fontSize: '12px' },
    y: {
      formatter: (value: number) => formatCurrency(value)
    }
  }
}))

// Get this week's date range
function getThisWeekRange() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - dayOfWeek)
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  endOfWeek.setHours(23, 59, 59, 999)

  return { start: startOfWeek, end: endOfWeek }
}

function formatEventDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.getTime() === today.getTime()) return 'Today'
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'

  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Year navigation functions
async function fetchRevenueData() {
  revenueLoading.value = true
  try {
    const yearStart = `${selectedYear.value}-01-01`
    const yearEnd = `${selectedYear.value}-12-31`

    // Revenue = past bookings that are not cancelled
    const todayStr = new Date().toISOString().split('T')[0]
    const { data: revenueData } = await supabase
      .from('bill_items')
      .select('amount, bookings!inner(function_date, status)')
      .gte('bookings.function_date', yearStart)
      .lte('bookings.function_date', yearEnd)
      .lt('bookings.function_date', todayStr)
      .neq('bookings.status', 'cancelled')

    // Process revenue by month
    const monthlyRevenue: Record<string, number> = {}

    if (revenueData && revenueData.length > 0) {
      revenueData.forEach((item: any) => {
        const date = new Date(item.bookings.function_date)
        const monthName = date.toLocaleString('default', { month: 'short' })
        monthlyRevenue[monthName] = (monthlyRevenue[monthName] || 0) + Number(item.amount)
      })
    }

    // Fill all 12 months with revenue data (0 for months without data)
    revenueSeries.value = [{
      name: 'Revenue',
      data: allMonths.map(m => monthlyRevenue[m] || 0)
    }]
  } finally {
    revenueLoading.value = false
  }
}

function previousYear() {
  selectedYear.value--
  fetchRevenueData()
}

function nextYear() {
  selectedYear.value++
  fetchRevenueData()
}

// Get event display status based on date (auto-calculated)
function getEventStatus(event: Booking): 'completed' | 'ongoing' | 'upcoming' | 'cancelled' {
  if (event.status === 'cancelled') return 'cancelled'

  const eventDate = new Date(event.function_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (eventDate.getTime() < today.getTime()) return 'completed'
  if (eventDate.getTime() === today.getTime()) return 'ongoing'
  return 'upcoming'
}

// Get styling classes based on event status
type EventStyles = { card: string; icon: string; name: string; badge: string }
type EventStatus = 'completed' | 'ongoing' | 'upcoming' | 'cancelled'

function getEventStyles(event: Booking): EventStyles {
  const status = getEventStatus(event)

  const styles: Record<EventStatus, EventStyles> = {
    completed: {
      card: 'bg-gray-50 border-gray-200 hover:bg-gray-100',
      icon: 'bg-gray-200 text-gray-500',
      name: 'text-gray-500',
      badge: 'bg-gray-100 text-gray-500'
    },
    ongoing: {
      card: 'bg-[#F0FDF4] border-[#10B981]/30 hover:bg-[#DCFCE7]',
      icon: 'bg-[#10B981]/20 text-[#10B981]',
      name: 'text-[#10B981]',
      badge: 'bg-[#10B981] text-white'
    },
    upcoming: {
      card: 'bg-[#EFF6FF] border-blue-200 hover:bg-blue-100',
      icon: 'bg-blue-100 text-blue-500',
      name: 'text-blue-600',
      badge: 'bg-blue-100 text-blue-600'
    },
    cancelled: {
      card: 'bg-red-50 border-red-200 hover:bg-red-100',
      icon: 'bg-red-100 text-red-500',
      name: 'text-red-500',
      badge: 'bg-red-100 text-red-600'
    }
  }

  return styles[status]
}

// Get badge label
function getEventBadge(event: Booking): string {
  const status = getEventStatus(event)
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'completed') return 'Done'
  if (status === 'ongoing') return 'Today'
  return 'Upcoming'
}

onMounted(async () => {
  loading.value = true
  try {
    const { start, end } = getThisWeekRange()
    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    const [
      { count: totalCount },
      { count: completedCount },
      { count: upcomingCount },
      { data: revenueData },
      { data: expenseData },
      { data: weekEvents }
    ] = await Promise.all([
      // Total bookings (not cancelled)
      supabase.from('bookings').select('*', { count: 'exact', head: true }).neq('status', 'cancelled'),
      // Completed = past dates, not cancelled
      supabase.from('bookings').select('*', { count: 'exact', head: true }).lt('function_date', todayStr).neq('status', 'cancelled'),
      // Upcoming = today or future, not cancelled
      supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('function_date', todayStr).neq('status', 'cancelled'),
      // Revenue = bill items from past bookings (not cancelled)
      supabase.from('bill_items').select('amount, bookings!inner(function_date, status)').lt('bookings.function_date', todayStr).neq('bookings.status', 'cancelled'),
      supabase.from('expenses').select('amount'),
      supabase.from('bookings')
        .select('*')
        .gte('function_date', startStr)
        .lte('function_date', endStr)
        .neq('status', 'cancelled')
        .order('function_date', { ascending: true })
    ])

    // Store upcoming events
    upcomingEvents.value = (weekEvents as Booking[]) ?? []

    // --- Process KPI Stats ---
    const totalRevenue = revenueData?.reduce((sum, item) => sum + Number(item.amount), 0) ?? 0
    const totalExpenses = expenseData?.reduce((sum, item) => sum + Number(item.amount), 0) ?? 0

    stats.value = {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: totalRevenue - totalExpenses,
      total_bookings: totalCount ?? 0,
      completed_bookings: completedCount ?? 0,
      upcoming_bookings: upcomingCount ?? 0,
    }

    // Fetch revenue chart data for selected year
    await fetchRevenueData()

  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="text-[#1F2937]">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-[#1F2937] mb-2">Dashboard</h1>
      <p class="text-[#6B7280] text-sm">Overview of your hall management performance</p>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-96">
      <div class="relative">
        <div class="w-16 h-16 border-4 border-[#E5E7EB] border-t-[#10B981] rounded-full animate-spin"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-[#10B981]">SMB</div>
      </div>
    </div>

    <div v-else class="space-y-6">
      <!-- KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Revenue Card -->
        <div class="card p-6 animate-fade-up">
          <div class="flex items-start justify-between mb-4">
            <div>
              <div class="text-[#6B7280] text-sm font-medium mb-1">Total Revenue</div>
              <div class="text-2xl font-bold text-[#1F2937]">{{ formatCurrency(stats.total_revenue) }}</div>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-[#F0FDF4] flex items-center justify-center shadow-inner">
              <i class="pi pi-wallet text-[#10B981] text-xl"></i>
            </div>
          </div>
          <div class="flex items-center text-xs text-[#6B7280] bg-[#F0FDF4] w-fit px-2 py-1 rounded-full">
            <i class="pi pi-wallet mr-1 text-[#10B981]"></i>
            <span>All time</span>
          </div>
        </div>

        <!-- Expenses Card -->
        <div class="card p-6 animate-fade-up delay-100">
          <div class="flex items-start justify-between mb-4">
            <div>
              <div class="text-[#6B7280] text-sm font-medium mb-1">Total Expenses</div>
              <div class="text-2xl font-bold text-[#1F2937]">{{ formatCurrency(stats.total_expenses) }}</div>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-[#FEF2F2] flex items-center justify-center shadow-inner">
              <i class="pi pi-shopping-bag text-red-500 text-xl"></i>
            </div>
          </div>
          <div class="flex items-center text-xs text-[#6B7280] bg-gray-50 w-fit px-2 py-1 rounded-full">
            <i class="pi pi-shopping-bag mr-1"></i>
            <span>All time</span>
          </div>
        </div>

        <!-- Net Profit Card -->
        <div class="card p-6 animate-fade-up delay-200">
          <div class="flex items-start justify-between mb-4">
            <div>
              <div class="text-[#6B7280] text-sm font-medium mb-1">Net Profit</div>
              <div class="text-2xl font-bold mb-2" :class="stats.net_profit >= 0 ? 'text-[#10B981]' : 'text-red-500'">
                {{ formatCurrency(stats.net_profit) }}
              </div>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-[#F0FDF4] flex items-center justify-center shadow-inner">
              <i class="pi pi-chart-line text-[#10B981] text-xl"></i>
            </div>
          </div>
          <div class="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-1000 ease-out rounded-full"
              :class="stats.net_profit >= 0 ? 'bg-[#10B981]' : 'bg-red-500'"
              :style="`width: ${Math.min(Math.abs(stats.net_profit) / Math.max(stats.total_revenue, 1) * 100, 100)}%`"
            ></div>
          </div>
        </div>

        <!-- Bookings Card -->
        <div class="card p-6 animate-fade-up delay-300">
          <div class="flex items-start justify-between mb-4">
            <div>
              <div class="text-[#6B7280] text-sm font-medium mb-1">Total Bookings</div>
              <div class="text-2xl font-bold text-[#1F2937] mb-2">{{ stats.total_bookings }}</div>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-[#EFF6FF] flex items-center justify-center shadow-inner">
              <i class="pi pi-users text-blue-500 text-xl"></i>
            </div>
          </div>
          <div class="flex gap-2">
            <span class="px-2.5 py-1 rounded-full bg-[#EFF6FF] text-blue-600 text-xs font-medium border border-blue-100">
              {{ stats.upcoming_bookings }} Upcoming
            </span>
            <span class="px-2.5 py-1 rounded-full bg-[#F0FDF4] text-[#10B981] text-xs font-medium border border-green-100">
              {{ stats.completed_bookings }} Done
            </span>
          </div>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up delay-300">
        <div class="card p-6 lg:col-span-2">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-bold text-[#1F2937]">Revenue Analytics</h3>
            <div class="flex items-center gap-1">
              <button
                class="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors"
                @click="previousYear"
                :disabled="revenueLoading"
              >
                <i class="pi pi-chevron-left text-[#6B7280] text-sm"></i>
              </button>
              <span class="px-3 py-1 text-sm font-semibold text-[#1F2937] min-w-[60px] text-center">
                {{ selectedYear }}
              </span>
              <button
                class="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors"
                @click="nextYear"
                :disabled="revenueLoading || selectedYear >= new Date().getFullYear()"
              >
                <i class="pi pi-chevron-right text-[#6B7280] text-sm"></i>
              </button>
            </div>
          </div>
          <div class="h-80 w-full relative">
            <div v-if="revenueLoading" class="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
              <div class="w-8 h-8 border-2 border-[#E5E7EB] border-t-[#10B981] rounded-full animate-spin"></div>
            </div>
            <VueApexCharts
              width="100%"
              height="100%"
              type="bar"
              :options="chartOptions"
              :series="revenueSeries"
            />
          </div>
        </div>

        <!-- Upcoming Events This Week -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-bold text-[#1F2937]">This Week</h3>
            <button
              class="text-xs text-[#10B981] hover:text-[#059669] font-medium transition-colors"
              @click="router.push({ name: 'calendar' })"
            >
              View Calendar
            </button>
          </div>
          <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
            <template v-if="upcomingEvents.length > 0">
              <div
                v-for="event in upcomingEvents"
                :key="event.id"
                class="p-3 rounded-xl border cursor-pointer transition-all"
                :class="getEventStyles(event).card"
                @click="router.push({ name: 'booking-detail', params: { id: event.id } })"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    :class="getEventStyles(event).icon"
                  >
                    <i class="pi pi-calendar text-sm"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div
                      class="font-semibold text-sm truncate"
                      :class="getEventStyles(event).name"
                    >
                      {{ event.customer_name }}
                    </div>
                    <div class="text-xs text-[#6B7280]">
                      {{ formatEventDate(event.function_date) }}
                    </div>
                  </div>
                  <div class="shrink-0">
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      :class="getEventStyles(event).badge"
                    >
                      {{ getEventBadge(event) }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="flex flex-col items-center justify-center py-12 text-[#9CA3AF] gap-3">
              <div class="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center">
                <i class="pi pi-calendar-times text-2xl opacity-50"></i>
              </div>
              <span class="text-sm font-medium">No events this week</span>
              <button
                class="text-xs text-[#10B981] hover:text-[#059669] font-medium"
                @click="router.push({ name: 'booking-create' })"
              >
                Create a booking
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
