<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { Booking } from '@/types/database'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'

const dateRange = ref<Date[] | null>(null)
const bookings = ref<Booking[]>([])
const loading = ref(false)

interface BookingWithTotals extends Booking {
  total_bill: number
  total_expenses: number
  total_advance: number
}

const bookingsWithTotals = ref<BookingWithTotals[]>([])

const totals = computed(() => ({
  revenue: bookingsWithTotals.value.reduce((s, b) => s + b.total_bill, 0),
  expenses: bookingsWithTotals.value.reduce((s, b) => s + b.total_expenses, 0),
  advances: bookingsWithTotals.value.reduce((s, b) => s + b.total_advance, 0),
}))

async function fetchReport() {
  loading.value = true
  try {
    let query = supabase
      .from('bookings')
      .select('*')
      .order('function_date', { ascending: false })

    if (dateRange.value && dateRange.value.length === 2 && dateRange.value[0] && dateRange.value[1]) {
      const start = dateRange.value[0].toISOString().split('T')[0]
      const end = dateRange.value[1].toISOString().split('T')[0]
      query = query.gte('function_date', start).lte('function_date', end)
    }

    const { data } = await query
    bookings.value = (data as Booking[]) ?? []

    // Fetch financial data for each booking
    const results: BookingWithTotals[] = []
    for (const booking of bookings.value) {
      const [billRes, expRes, advRes] = await Promise.all([
        supabase.from('bill_items').select('amount').eq('booking_id', booking.id),
        supabase.from('expenses').select('amount').eq('booking_id', booking.id),
        supabase.from('advance_payments').select('amount').eq('booking_id', booking.id),
      ])

      results.push({
        ...booking,
        total_bill: billRes.data?.reduce((s, i) => s + Number(i.amount), 0) ?? booking.rent,
        total_expenses: expRes.data?.reduce((s, i) => s + Number(i.amount), 0) ?? 0,
        total_advance: advRes.data?.reduce((s, i) => s + Number(i.amount), 0) ?? 0,
      })
    }
    bookingsWithTotals.value = results
  } finally {
    loading.value = false
  }
}

// Compute status from function date
function getComputedStatus(booking: Booking): 'completed' | 'ongoing' | 'upcoming' | 'cancelled' {
  if (booking.status === 'cancelled') return 'cancelled'

  const eventDate = new Date(booking.function_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (eventDate.getTime() < today.getTime()) return 'completed'
  if (eventDate.getTime() === today.getTime()) return 'ongoing'
  return 'upcoming'
}

function getStatusLabel(booking: Booking): string {
  const status = getComputedStatus(booking)
  switch (status) {
    case 'ongoing': return 'Today'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    case 'upcoming': return 'Upcoming'
    default: return ''
  }
}

function getStatusSeverity(status: string): "success" | "info" | "danger" | "secondary" | undefined {
  switch (status) {
    case 'completed': return 'secondary'
    case 'ongoing': return 'success'
    case 'upcoming': return 'info'
    case 'cancelled': return 'danger'
    default: return 'secondary'
  }
}

function exportCSV() {
  const headers = ['Date', 'Customer', 'Rent', 'Total Bill', 'Advance', 'Expenses', 'Status']
  const rows = bookingsWithTotals.value.map(b => [
    b.function_date,
    b.customer_name,
    b.rent,
    b.total_bill,
    b.total_advance,
    b.total_expenses,
    getStatusLabel(b),
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `smb-report-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(fetchReport)
</script>

<template>
  <div class="text-[#1F2937]">
    <h1 class="text-3xl font-bold text-[#1F2937] mb-6">Reports</h1>

    <!-- Filters -->
    <div class="card-static p-4 mb-6">
      <div class="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div class="flex flex-col gap-2 flex-1">
          <label class="text-sm font-medium text-[#1F2937]">Date Range</label>
          <DatePicker
            v-model="dateRange"
            selection-mode="range"
            date-format="dd/mm/yy"
            show-icon
            placeholder="Select date range"
            class="w-full sm:w-72"
          />
        </div>
        <div class="flex gap-2">
          <Button label="Generate" icon="pi pi-search" @click="fetchReport" :loading="loading" />
          <Button label="Export CSV" icon="pi pi-download" severity="secondary" @click="exportCSV" :disabled="bookingsWithTotals.length === 0" />
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div class="card p-6">
        <div class="text-[#6B7280] text-sm font-medium mb-1">Total Revenue</div>
        <div class="text-2xl font-bold text-[#10B981]">{{ formatCurrency(totals.revenue) }}</div>
      </div>
      <div class="card p-6">
        <div class="text-[#6B7280] text-sm font-medium mb-1">Total Expenses</div>
        <div class="text-2xl font-bold text-red-500">{{ formatCurrency(totals.expenses) }}</div>
      </div>
      <div class="card p-6">
        <div class="text-[#6B7280] text-sm font-medium mb-1">Net Profit</div>
        <div class="text-2xl font-bold" :class="totals.revenue - totals.expenses >= 0 ? 'text-[#10B981]' : 'text-red-500'">
          {{ formatCurrency(totals.revenue - totals.expenses) }}
        </div>
      </div>
    </div>

    <!-- Report Table -->
    <div class="card-static overflow-hidden">
      <DataTable :value="bookingsWithTotals" :loading="loading" striped-rows paginator :rows="20" class="p-datatable-sm">
        <Column header="Date" sortable field="function_date">
          <template #body="{ data }">{{ formatDate(data.function_date) }}</template>
        </Column>
        <Column field="customer_name" header="Customer" sortable />
        <Column header="Total Bill" sortable field="total_bill">
          <template #body="{ data }">{{ formatCurrency(data.total_bill) }}</template>
        </Column>
        <Column header="Advance" sortable field="total_advance">
          <template #body="{ data }">{{ formatCurrency(data.total_advance) }}</template>
        </Column>
        <Column header="Expenses" sortable field="total_expenses">
          <template #body="{ data }">{{ formatCurrency(data.total_expenses) }}</template>
        </Column>
        <Column header="Profit">
          <template #body="{ data }">
            <span :class="data.total_bill - data.total_expenses >= 0 ? 'text-[#10B981]' : 'text-red-500'">
              {{ formatCurrency(data.total_bill - data.total_expenses) }}
            </span>
          </template>
        </Column>
        <Column header="Status" field="status">
          <template #body="{ data }">
            <Tag :value="getStatusLabel(data)" :severity="getStatusSeverity(getComputedStatus(data))" />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
