<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { Deposit, BankAccount } from '@/types/database'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'

const props = defineProps<{
  bookingId: string
  deposits: Deposit[]
  bankAccounts: BankAccount[]
  canEdit: boolean
}>()

const emit = defineEmits<{
  updated: []
}>()

const toast = useToast()
interface DepositForm {
  id?: string
  bank_account_id?: string
  amount?: number
  deposit_date?: Date | null
  notes?: string | null
}

const showDialog = ref(false)
const editingItem = ref<DepositForm>({})
const saving = ref(false)

function getAccountName(accountId: string): string {
  return props.bankAccounts.find(a => a.id === accountId)?.name ?? 'Unknown'
}

function openAdd() {
  editingItem.value = { amount: 0, bank_account_id: '' }
  showDialog.value = true
}

function openEdit(item: Deposit) {
  editingItem.value = {
    id: item.id,
    bank_account_id: item.bank_account_id,
    amount: item.amount,
    deposit_date: item.deposit_date ? new Date(item.deposit_date) : null,
    notes: item.notes,
  }
  showDialog.value = true
}

async function save() {
  if (!editingItem.value.bank_account_id || !editingItem.value.amount) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Account and amount are required', life: 3000 })
    return
  }

  saving.value = true
  try {
    const toDateStr = (d: Date | null | undefined) => d ? d.toISOString().split('T')[0] : null
    const payload = {
      booking_id: props.bookingId,
      bank_account_id: editingItem.value.bank_account_id,
      amount: editingItem.value.amount,
      deposit_date: toDateStr(editingItem.value.deposit_date),
      notes: editingItem.value.notes || null,
    }

    if (editingItem.value.id) {
      const { error } = await supabase.from('deposits').update(payload).eq('id', editingItem.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('deposits').insert(payload)
      if (error) throw error
    }

    showDialog.value = false
    emit('updated')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    saving.value = false
  }
}

async function remove(item: Deposit) {
  const { error } = await supabase.from('deposits').delete().eq('id', item.id)
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
      <h4 class="font-medium text-gray-700">Deposits</h4>
      <Button v-if="canEdit" label="Add Deposit" icon="pi pi-plus" size="small" @click="openAdd" />
    </div>

    <DataTable :value="deposits" striped-rows class="p-datatable-sm">
      <Column header="Account">
        <template #body="{ data }">{{ getAccountName(data.bank_account_id) }}</template>
      </Column>
      <Column header="Date">
        <template #body="{ data }">{{ formatDate(data.deposit_date) }}</template>
      </Column>
      <Column header="Amount" class="text-right">
        <template #body="{ data }">{{ formatCurrency(data.amount) }}</template>
      </Column>
      <Column v-if="canEdit" header="Actions" class="w-24">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button icon="pi pi-pencil" text rounded size="small" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="remove(data)" />
          </div>
        </template>
      </Column>
      <template #empty>
        <div class="text-center py-4 text-gray-400">No deposits recorded</div>
      </template>
      <template #footer>
        <div class="text-right font-bold">
          Total: {{ formatCurrency(deposits.reduce((s, i) => s + i.amount, 0)) }}
        </div>
      </template>
    </DataTable>

    <Dialog v-model:visible="showDialog" header="Deposit" modal class="w-full max-w-sm">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Bank Account *</label>
          <Select v-model="editingItem.bank_account_id" :options="bankAccounts" option-label="name" option-value="id" placeholder="Select account" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Amount *</label>
          <InputNumber v-model="editingItem.amount" mode="currency" currency="INR" locale="en-IN" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Deposit Date</label>
          <DatePicker v-model="editingItem.deposit_date" date-format="dd/mm/yy" show-icon class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showDialog = false" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
