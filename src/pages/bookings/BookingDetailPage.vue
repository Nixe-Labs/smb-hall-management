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
import AdvancePaymentList from '@/components/finance/AdvancePaymentList.vue'
import BillItemsTable from '@/components/finance/BillItemsTable.vue'
import ExpensesTable from '@/components/finance/ExpensesTable.vue'
import DepositsTable from '@/components/finance/DepositsTable.vue'
import FinancialSummary from '@/components/finance/FinancialSummary.vue'
import DeleteConfirmDialog from '@/components/common/DeleteConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { canEdit, canDelete } = usePermissions()

const bookingId = computed(() => route.params.id as string)
const showDeleteDialog = ref(false)
const showCancelDialog = ref(false)
const deleting = ref(false)
const cancelling = ref(false)
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

// Auto-calculate status based on function date
const computedStatus = computed(() => {
  if (!booking.value) return null
  if (booking.value.status === 'cancelled') return 'cancelled'

  const eventDate = new Date(booking.value.function_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (eventDate.getTime() < today.getTime()) return 'completed'
  if (eventDate.getTime() === today.getTime()) return 'ongoing'
  return 'upcoming'
})

const statusLabel = computed(() => {
  switch (computedStatus.value) {
    case 'ongoing': return 'Today'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    case 'upcoming': return 'Upcoming'
    default: return ''
  }
})

function getStatusSeverity(status: string | null): "success" | "info" | "danger" | "secondary" | "warn" | undefined {
  switch (status) {
    case 'completed': return 'secondary'
    case 'ongoing': return 'success'
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

async function cancelBooking() {
  cancelling.value = true
  try {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId.value)

    if (error) throw error

    if (booking.value) booking.value.status = 'cancelled'
    toast.add({ severity: 'success', summary: 'Cancelled', detail: 'Booking cancelled successfully', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  } finally {
    cancelling.value = false
    showCancelDialog.value = false
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

async function handleDeleteBooking() {
  deleting.value = true
  try {
    // Delete related records first (cascade)
    await Promise.all([
      supabase.from('advance_payments').delete().eq('booking_id', bookingId.value),
      supabase.from('bill_items').delete().eq('booking_id', bookingId.value),
      supabase.from('expenses').delete().eq('booking_id', bookingId.value),
      supabase.from('deposits').delete().eq('booking_id', bookingId.value),
    ])

    // Delete the booking
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', bookingId.value)

    if (error) throw error

    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Booking deleted successfully', life: 3000 })
    router.push({ name: 'bookings' })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  } finally {
    deleting.value = false
    showDeleteDialog.value = false
  }
}

onMounted(fetchAll)
</script>

<template>
  <div class="text-[#1F2937]">
    <div class="flex items-center gap-3 mb-6">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="text-2xl md:text-3xl font-bold text-[#1F2937]">Booking Details</h1>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-96">
      <div class="relative">
        <div class="w-16 h-16 border-4 border-[#E5E7EB] border-t-[#10B981] rounded-full animate-spin"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-[#10B981]">SMB</div>
      </div>
    </div>

    <div v-else-if="booking">
      <!-- Booking Info Card -->
      <div class="card-static p-4 md:p-6 mb-6">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold text-[#1F2937] mb-2">{{ booking.customer_name }}</h2>
            <p class="text-[#6B7280]">{{ formatDate(booking.function_date) }}</p>
            <p v-if="booking.customer_phone" class="text-[#6B7280] text-sm mt-1">{{ booking.customer_phone }}</p>
            <p class="text-lg font-semibold text-[#1F2937] mt-3">Rent: {{ formatCurrency(booking.rent) }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 md:gap-3">
            <Tag :value="statusLabel" :severity="getStatusSeverity(computedStatus)" />
            <div class="flex items-center gap-2">
              <Button
                label="Invoice"
                icon="pi pi-file-pdf"
                severity="secondary"
                size="small"
                @click="generateInvoice"
              />
              <Button
                v-if="canEdit && computedStatus !== 'cancelled'"
                label="Cancel"
                icon="pi pi-times"
                severity="warn"
                size="small"
                @click="showCancelDialog = true"
              />
              <Button
                v-if="canDelete"
                label="Delete"
                icon="pi pi-trash"
                severity="danger"
                size="small"
                @click="showDeleteDialog = true"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Financial Summary -->
      <FinancialSummary v-if="summary" :summary="summary" class="mb-6" />

      <!-- Tabs -->
      <div class="card-static overflow-hidden">
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
              :can-delete="canDelete"
              @updated="fetchAll"
            />
          </TabPanel>
          <TabPanel value="expenses" header="Expenses">
            <ExpensesTable
              :booking-id="bookingId"
              :expenses="expenses"
              :categories="expenseCategories"
              :can-edit="canEdit"
              :can-delete="canDelete"
              @updated="fetchAll"
            />
          </TabPanel>
          <TabPanel value="deposits" header="Deposits">
            <DepositsTable
              :booking-id="bookingId"
              :deposits="deposits"
              :bank-accounts="bankAccounts"
              :can-edit="canEdit"
              :can-delete="canDelete"
              @updated="fetchAll"
            />
          </TabPanel>
        </TabView>
      </div>
    </div>

    <div v-else class="text-center py-16 text-[#9CA3AF]">
      Booking not found
    </div>

    <!-- Cancel Confirmation Dialog -->
    <DeleteConfirmDialog
      v-model:visible="showCancelDialog"
      :item-name="booking?.customer_name"
      :loading="cancelling"
      confirm-word="CANCEL"
      title="Cancel Booking"
      message="Are you sure you want to cancel this booking? The date will become available again."
      button-label="Cancel Booking"
      severity="warn"
      @confirm="cancelBooking"
    />

    <!-- Delete Confirmation Dialog -->
    <DeleteConfirmDialog
      v-model:visible="showDeleteDialog"
      :item-name="booking?.customer_name"
      :loading="deleting"
      @confirm="handleDeleteBooking"
    />
  </div>
</template>
