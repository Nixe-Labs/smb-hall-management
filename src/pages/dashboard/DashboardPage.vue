<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils/currency'
import type { DashboardStats } from '@/types/finance'

const stats = ref<DashboardStats>({
  total_revenue: 0,
  total_expenses: 0,
  net_profit: 0,
  total_bookings: 0,
  completed_bookings: 0,
  upcoming_bookings: 0,
})
const loading = ref(true)

onMounted(async () => {
  loading.value = true
  try {
    // Fetch booking counts
    const { count: totalCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
    const { count: completedCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
    const { count: upcomingCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'upcoming')

    // Fetch revenue from bill items of completed bookings
    const { data: revenueData } = await supabase
      .from('bill_items')
      .select('amount, bookings!inner(status)')
      .eq('bookings.status', 'completed')

    const totalRevenue = revenueData?.reduce((sum, item) => sum + Number(item.amount), 0) ?? 0

    // Fetch total expenses
    const { data: expenseData } = await supabase
      .from('expenses')
      .select('amount')

    const totalExpenses = expenseData?.reduce((sum, item) => sum + Number(item.amount), 0) ?? 0

    stats.value = {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: totalRevenue - totalExpenses,
      total_bookings: totalCount ?? 0,
      completed_bookings: completedCount ?? 0,
      upcoming_bookings: upcomingCount ?? 0,
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h1 class="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Dashboard</h1>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <i class="pi pi-spinner pi-spin text-4xl text-blue-500"></i>
    </div>

    <div v-else>
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <div class="bg-white rounded-lg shadow p-4 md:p-6">
          <div class="text-xs md:text-sm text-gray-500">Total Revenue</div>
          <div class="text-lg md:text-2xl font-bold text-green-600 mt-1">{{ formatCurrency(stats.total_revenue) }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 md:p-6">
          <div class="text-xs md:text-sm text-gray-500">Total Expenses</div>
          <div class="text-lg md:text-2xl font-bold text-red-600 mt-1">{{ formatCurrency(stats.total_expenses) }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 md:p-6">
          <div class="text-xs md:text-sm text-gray-500">Net Profit</div>
          <div class="text-lg md:text-2xl font-bold mt-1" :class="stats.net_profit >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ formatCurrency(stats.net_profit) }}
          </div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 md:p-6">
          <div class="text-xs md:text-sm text-gray-500">Total Bookings</div>
          <div class="text-lg md:text-2xl font-bold text-blue-600 mt-1">{{ stats.total_bookings }}</div>
          <div class="text-xs text-gray-400 mt-1">
            {{ stats.upcoming_bookings }} upcoming / {{ stats.completed_bookings }} completed
          </div>
        </div>
      </div>

      <!-- Placeholder for charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div class="bg-white rounded-lg shadow p-4 md:p-6">
          <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-4">Monthly Revenue</h3>
          <div class="h-48 md:h-64 flex items-center justify-center text-gray-400">
            Chart will be rendered here
          </div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 md:p-6">
          <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-4">Expense Breakdown</h3>
          <div class="h-48 md:h-64 flex items-center justify-center text-gray-400">
            Chart will be rendered here
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
