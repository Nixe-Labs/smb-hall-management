<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/composables/usePermissions'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { calculateBookingSummary } from '@/lib/utils/calculations'
import type { Booking, AdvancePayment, BillItem, Expense, Deposit, BillCategory, ExpenseCategory, BankAccount } from '@/types/database'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import Select from 'primevue/select'
import AdvancePaymentList from '@/components/finance/AdvancePaymentList.vue'
import BillItemsTable from '@/components/finance/BillItemsTable.vue'
import ExpensesTable from '@/components/finance/ExpensesTable.vue'
import DepositsTable from '@/components/finance/DepositsTable.vue'
import FinancialSummary from '@/components/finance/FinancialSummary.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { canEdit } = usePermissions()

const bookingId = computed(() => route.params.id as string)
const booking = ref<Booking | null>(null)
const advances = ref<AdvancePayment[]>([])
const billItems = ref<BillItem[]>([])
const expenses = ref<Expense[]>([])
const deposits = ref<Deposit[]>([])
const billCategories = ref<BillCategory[]>([])
const expenseCategories = ref<ExpenseCategory[]>([])
const bankAccounts = ref<BankAccount[]>([])
const loading = ref(true)

const summary = computed(() => {
  if (!booking.value) return null
  return calculateBookingSummary(
    booking.value.rent,
    advances.value,
    billItems.value,
    expenses.value,
    deposits.value
  )
})

const statusOptions = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

function getStatusSeverity(status: string): "success" | "info" | "danger" | "secondary" | undefined {
  switch (status) {
    case 'completed': return 'success'
    case 'upcoming': return 'info'
    case 'cancelled': return 'danger'
    default: return 'secondary'
  }
}

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
  } finally {
    loading.value = false
  }
}

async function updateStatus(newStatus: string) {
  const { error } = await supabase
    .from('bookings')
    .update({ status: newStatus })
    .eq('id', bookingId.value)

  if (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  } else {
    if (booking.value) booking.value.status = newStatus as Booking['status']
    toast.add({ severity: 'success', summary: 'Updated', detail: 'Status updated', life: 3000 })
  }
}

async function generateInvoice() {
  const { buildInvoiceDocument } = await import('@/lib/pdf/invoiceTemplate')
  const { downloadInvoice } = await import('@/lib/pdf/pdfGenerator')

  if (!booking.value || !summary.value) return

  const doc = buildInvoiceDocument({
    booking: booking.value,
    advances: advances.value,
    billItems: billItems.value,
    billCategories: billCategories.value,
    summary: summary.value,
  })

  downloadInvoice(doc, `Invoice-${booking.value.customer_name}-${booking.value.function_date}.pdf`)
}

onMounted(fetchAll)
</script>

<template>
  <div>
    <div class="flex items-center gap-2 md:gap-4 mb-4 md:mb-6">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="text-xl md:text-2xl font-bold text-gray-900">Booking Details</h1>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <i class="pi pi-spinner pi-spin text-4xl text-blue-500"></i>
    </div>

    <div v-else-if="booking">
      <!-- Booking Info Card -->
      <div class="bg-white rounded-lg shadow p-4 md:p-6 mb-4 md:mb-6">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 class="text-lg md:text-xl font-semibold text-gray-800">{{ booking.customer_name }}</h2>
            <p class="text-gray-500 mt-1">{{ formatDate(booking.function_date) }}</p>
            <p v-if="booking.customer_phone" class="text-gray-500 text-sm">{{ booking.customer_phone }}</p>
            <p class="text-lg font-semibold text-gray-700 mt-2">Rent: {{ formatCurrency(booking.rent) }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 md:gap-3">
            <Tag :value="booking.status" :severity="getStatusSeverity(booking.status)" class="capitalize text-sm" />
            <Select
              v-if="canEdit"
              :model-value="booking.status"
              :options="statusOptions"
              option-label="label"
              option-value="value"
              placeholder="Change Status"
              class="w-36 md:w-40"
              @change="(e: { value: string }) => updateStatus(e.value)"
            />
            <Button
              label="Invoice"
              icon="pi pi-file-pdf"
              severity="secondary"
              size="small"
              @click="generateInvoice"
            />
          </div>
        </div>
      </div>

      <!-- Financial Summary -->
      <FinancialSummary v-if="summary" :summary="summary" class="mb-6" />

      <!-- Tabs -->
      <div class="bg-white rounded-lg shadow">
        <TabView>
          <TabPanel value="advances" header="Advances">
            <AdvancePaymentList
              :booking-id="bookingId"
              :advances="advances"
              :bank-accounts="bankAccounts"
              :can-edit="canEdit"
              @updated="fetchAll"
            />
          </TabPanel>
          <TabPanel value="bill-items" header="Bill Items">
            <BillItemsTable
              :booking-id="bookingId"
              :bill-items="billItems"
              :categories="billCategories"
              :can-edit="canEdit"
              @updated="fetchAll"
            />
          </TabPanel>
          <TabPanel value="expenses" header="Expenses">
            <ExpensesTable
              :booking-id="bookingId"
              :expenses="expenses"
              :categories="expenseCategories"
              :can-edit="canEdit"
              @updated="fetchAll"
            />
          </TabPanel>
          <TabPanel value="deposits" header="Deposits">
            <DepositsTable
              :booking-id="bookingId"
              :deposits="deposits"
              :bank-accounts="bankAccounts"
              :can-edit="canEdit"
              @updated="fetchAll"
            />
          </TabPanel>
        </TabView>
      </div>
    </div>

    <div v-else class="text-center py-16 text-gray-400">
      Booking not found
    </div>
  </div>
</template>
