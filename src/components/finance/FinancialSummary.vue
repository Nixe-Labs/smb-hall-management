<script setup lang="ts">
import { formatCurrency } from '@/lib/utils/currency'
import type { BookingSummary } from '@/types/finance'

defineProps<{
  summary: BookingSummary
}>()
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6">
    <h3 class="text-lg font-semibold text-gray-800 mb-4">Financial Summary</h3>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="p-3 bg-blue-50 rounded-lg">
        <div class="text-xs text-gray-500">Total Bill</div>
        <div class="text-lg font-bold text-blue-700">{{ formatCurrency(summary.total_bill) }}</div>
      </div>
      <div class="p-3 bg-green-50 rounded-lg">
        <div class="text-xs text-gray-500">Advance Received</div>
        <div class="text-lg font-bold text-green-700">{{ formatCurrency(summary.total_advance) }}</div>
      </div>
      <div class="p-3 bg-orange-50 rounded-lg">
        <div class="text-xs text-gray-500">Balance Collected</div>
        <div class="text-lg font-bold text-orange-700">{{ formatCurrency(summary.balance_collected) }}</div>
      </div>
      <div class="p-3 bg-red-50 rounded-lg">
        <div class="text-xs text-gray-500">Total Expenses</div>
        <div class="text-lg font-bold text-red-700">{{ formatCurrency(summary.total_expenses) }}</div>
      </div>
      <div class="p-3 bg-purple-50 rounded-lg">
        <div class="text-xs text-gray-500">Total Deposits</div>
        <div class="text-lg font-bold text-purple-700">{{ formatCurrency(summary.total_deposits) }}</div>
      </div>
      <div class="p-3 bg-yellow-50 rounded-lg">
        <div class="text-xs text-gray-500">Pending Balance</div>
        <div class="text-lg font-bold text-yellow-700">{{ formatCurrency(summary.pending_balance) }}</div>
      </div>
      <div class="p-3 rounded-lg" :class="summary.excess_shortage >= 0 ? 'bg-green-50' : 'bg-red-50'">
        <div class="text-xs text-gray-500">Excess / Shortage</div>
        <div class="text-lg font-bold" :class="summary.excess_shortage >= 0 ? 'text-green-700' : 'text-red-700'">
          {{ formatCurrency(summary.excess_shortage) }}
        </div>
      </div>
    </div>
  </div>
</template>
