<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { AdvancePayment, BankAccount } from '@/types/database'
import type { PaymentMethod } from '@/types/enums'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'

const props = defineProps<{
  bookingId: string
  advances: AdvancePayment[]
  bankAccounts: BankAccount[]
  canEdit: boolean
}>()

const emit = defineEmits<{
  updated: []
}>()

interface AdvanceForm {
  id?: string
  advance_number?: number
  amount?: number
  payment_date?: Date | null
  payment_method?: PaymentMethod | null
  deposit_date?: Date | null
  deposit_account_id?: string | null
}

const toast = useToast()
const showDialog = ref(false)
const editingAdvance = ref<AdvanceForm>({})
const saving = ref(false)

const paymentMethods = [
  { label: 'Cash', value: 'cash' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'Online', value: 'online' },
]

function openAdd() {
  const nextNumber = (props.advances.length || 0) + 1
  if (nextNumber > 3) {
    toast.add({ severity: 'warn', summary: 'Limit', detail: 'Maximum 3 advance payments allowed', life: 3000 })
    return
  }
  editingAdvance.value = {
    advance_number: nextNumber,
    amount: 0,
    payment_method: 'cash' as PaymentMethod,
  }
  showDialog.value = true
}

function openEdit(adv: AdvancePayment) {
  editingAdvance.value = {
    id: adv.id,
    advance_number: adv.advance_number,
    amount: adv.amount,
    payment_method: adv.payment_method,
    payment_date: adv.payment_date ? new Date(adv.payment_date) : null,
    deposit_date: adv.deposit_date ? new Date(adv.deposit_date) : null,
    deposit_account_id: adv.deposit_account_id,
  }
  showDialog.value = true
}

async function save() {
  if (!editingAdvance.value.amount) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Amount is required', life: 3000 })
    return
  }

  saving.value = true
  try {
    const toDateStr = (d: Date | null | undefined) => d ? d.toISOString().split('T')[0] : null
    const payload = {
      booking_id: props.bookingId,
      advance_number: editingAdvance.value.advance_number,
      amount: editingAdvance.value.amount,
      payment_date: toDateStr(editingAdvance.value.payment_date),
      payment_method: editingAdvance.value.payment_method || null,
      deposit_date: toDateStr(editingAdvance.value.deposit_date),
      deposit_account_id: editingAdvance.value.deposit_account_id || null,
    }

    if (editingAdvance.value.id) {
      const { error } = await supabase
        .from('advance_payments')
        .update(payload)
        .eq('id', editingAdvance.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('advance_payments').insert(payload)
      if (error) throw error
    }

    toast.add({ severity: 'success', summary: 'Saved', detail: 'Advance payment saved', life: 3000 })
    showDialog.value = false
    emit('updated')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    saving.value = false
  }
}

async function remove(adv: AdvancePayment) {
  const { error } = await supabase.from('advance_payments').delete().eq('id', adv.id)
  if (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  } else {
    emit('updated')
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h4 class="font-medium text-[#6B7280]">Advance Payments</h4>
      <Button v-if="canEdit && advances.length < 3" label="Add Advance" icon="pi pi-plus" size="small" @click="openAdd" />
    </div>

    <div v-if="advances.length === 0" class="text-center py-8 text-[#9CA3AF]">
      No advance payments recorded
    </div>

    <div v-else class="flex flex-col gap-3">
      <div v-for="adv in advances" :key="adv.id" class="flex items-center justify-between p-4 bg-white rounded-xl border border-[#E5E7EB] shadow-sm hover:shadow-md hover:border-[#D1D5DB] transition-all">
        <div>
          <div class="font-medium text-[#1F2937]">Advance #{{ adv.advance_number }}</div>
          <div class="text-sm text-[#6B7280]">
            {{ formatCurrency(adv.amount) }}
            <span v-if="adv.payment_method" class="capitalize"> • {{ adv.payment_method }}</span>
          </div>
          <div v-if="adv.payment_date" class="text-xs text-[#9CA3AF] mt-1">Paid: {{ formatDate(adv.payment_date) }}</div>
        </div>
        <div v-if="canEdit" class="flex gap-2">
          <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" @click="openEdit(adv)" />
          <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="remove(adv)" />
        </div>
      </div>
    </div>

    <!-- Add/Edit Dialog -->
    <Dialog v-model:visible="showDialog" header="Advance Payment" modal class="w-full max-w-md">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#6B7280]">Amount *</label>
          <InputNumber v-model="editingAdvance.amount" mode="currency" currency="INR" locale="en-IN" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#6B7280]">Payment Method</label>
          <Select v-model="editingAdvance.payment_method" :options="paymentMethods" option-label="label" option-value="value" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#6B7280]">Payment Date</label>
          <DatePicker v-model="editingAdvance.payment_date" date-format="dd/mm/yy" show-icon class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#6B7280]">Deposit Account</label>
          <Select v-model="editingAdvance.deposit_account_id" :options="bankAccounts" option-label="name" option-value="id" placeholder="Select account" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#6B7280]">Deposit Date</label>
          <DatePicker v-model="editingAdvance.deposit_date" date-format="dd/mm/yy" show-icon class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showDialog = false" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
