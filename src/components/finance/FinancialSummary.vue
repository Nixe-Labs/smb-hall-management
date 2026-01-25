<script setup lang="ts">
import { formatCurrency } from '@/lib/utils/currency'
import type { BookingSummary } from '@/types/finance'

defineProps<{
  summary: BookingSummary
}>()
</script>

<template>
  <div class="card p-6">
    <h3 class="text-lg font-semibold text-[#1F2937] mb-4">Financial Summary</h3>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="p-4 bg-[#EFF6FF] rounded-lg border border-blue-200">
        <div class="text-xs text-[#6B7280] mb-1">Total Bill</div>
        <div class="text-lg font-bold text-blue-600">{{ formatCurrency(summary.total_bill) }}</div>
      </div>
      <div class="p-4 bg-[#F0FDF4] rounded-lg border border-[#10B981]/20">
        <div class="text-xs text-[#6B7280] mb-1">Advance Received</div>
        <div class="text-lg font-bold text-[#10B981]">{{ formatCurrency(summary.total_advance) }}</div>
      </div>
      <div class="p-4 bg-[#FFFBEB] rounded-lg border border-orange-200">
        <div class="text-xs text-[#6B7280] mb-1">Balance Collected</div>
        <div class="text-lg font-bold text-orange-600">{{ formatCurrency(summary.balance_collected) }}</div>
      </div>
      <div class="p-4 bg-[#FEF2F2] rounded-lg border border-red-200">
        <div class="text-xs text-[#6B7280] mb-1">Total Expenses</div>
        <div class="text-lg font-bold text-red-600">{{ formatCurrency(summary.total_expenses) }}</div>
      </div>
      <div class="p-4 bg-[#F5F3FF] rounded-lg border border-purple-200">
        <div class="text-xs text-[#6B7280] mb-1">Total Deposits</div>
        <div class="text-lg font-bold text-purple-600">{{ formatCurrency(summary.total_deposits) }}</div>
      </div>
      <div class="p-4 bg-[#FFFBEB] rounded-lg border border-yellow-200">
        <div class="text-xs text-[#6B7280] mb-1">Pending Balance</div>
        <div class="text-lg font-bold text-yellow-600">{{ formatCurrency(summary.pending_balance) }}</div>
      </div>
      <div class="p-4 rounded-lg border" :class="summary.excess_shortage >= 0 ? 'bg-[#F0FDF4] border-[#10B981]/20' : 'bg-[#FEF2F2] border-red-200'">
        <div class="text-xs text-[#6B7280] mb-1">Excess / Shortage</div>
        <div class="text-lg font-bold" :class="summary.excess_shortage >= 0 ? 'text-[#10B981]' : 'text-red-600'">
          {{ formatCurrency(summary.excess_shortage) }}
        </div>
      </div>
    </div>
  </div>
</template>
