<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import type { BillItem, BillCategory } from '@/types/database'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'
import DeleteConfirmDialog from '@/components/common/DeleteConfirmDialog.vue'

const props = defineProps<{
  bookingId: string
  billItems: BillItem[]
  categories: BillCategory[]
  canEdit: boolean
  canDelete?: boolean
}>()

const emit = defineEmits<{
  updated: []
}>()

const toast = useToast()
const showDialog = ref(false)
const editingItem = ref<Partial<BillItem>>({})
const saving = ref(false)
const showDeleteDialog = ref(false)
const itemToDelete = ref<BillItem | null>(null)
const deleting = ref(false)

function getCategoryName(categoryId: string): string {
  return props.categories.find(c => c.id === categoryId)?.name ?? 'Unknown'
}

function openAdd() {
  editingItem.value = { amount: 0, category_id: '' }
  showDialog.value = true
}

function openEdit(item: BillItem) {
  editingItem.value = { ...item }
  showDialog.value = true
}

async function save() {
  if (!editingItem.value.category_id || !editingItem.value.amount) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Category and amount are required', life: 3000 })
    return
  }

  saving.value = true
  try {
    const payload = {
      booking_id: props.bookingId,
      category_id: editingItem.value.category_id,
      amount: editingItem.value.amount,
      notes: editingItem.value.notes || null,
    }

    if (editingItem.value.id) {
      const { error } = await supabase.from('bill_items').update(payload).eq('id', editingItem.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('bill_items').insert(payload)
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

function openDeleteDialog(item: BillItem) {
  itemToDelete.value = item
  showDeleteDialog.value = true
}

async function confirmDelete() {
  if (!itemToDelete.value) return

  deleting.value = true
  try {
    const { error } = await supabase.from('bill_items').delete().eq('id', itemToDelete.value.id)
    if (error) throw error
    emit('updated')
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  } finally {
    deleting.value = false
    showDeleteDialog.value = false
    itemToDelete.value = null
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h4 class="font-medium text-[#6B7280]">Bill Items</h4>
      <Button v-if="canEdit" label="Add Item" icon="pi pi-plus" size="small" @click="openAdd" />
    </div>

    <DataTable :value="billItems" striped-rows class="p-datatable-sm">
      <Column header="Category">
        <template #body="{ data }">{{ getCategoryName(data.category_id) }}</template>
      </Column>
      <Column header="Amount" class="text-right">
        <template #body="{ data }">{{ formatCurrency(data.amount) }}</template>
      </Column>
      <Column v-if="canEdit || canDelete" header="Actions" class="w-24">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button v-if="canEdit" icon="pi pi-pencil" text rounded size="small" @click="openEdit(data)" />
            <Button v-if="canDelete" icon="pi pi-trash" text rounded size="small" severity="danger" @click="openDeleteDialog(data)" />
          </div>
        </template>
      </Column>
      <template #empty>
        <div class="text-center py-4 text-[#9CA3AF]">No bill items</div>
      </template>
      <template #footer>
        <div class="text-right font-bold">
          Total: {{ formatCurrency(billItems.reduce((s, i) => s + i.amount, 0)) }}
        </div>
      </template>
    </DataTable>

    <Dialog v-model:visible="showDialog" header="Bill Item" modal class="w-full max-w-sm">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#6B7280]">Category *</label>
          <Select v-model="editingItem.category_id" :options="categories" option-label="name" option-value="id" placeholder="Select category" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#6B7280]">Amount *</label>
          <InputNumber v-model="editingItem.amount" mode="currency" currency="INR" locale="en-IN" class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showDialog = false" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <DeleteConfirmDialog
      v-model:visible="showDeleteDialog"
      :item-name="itemToDelete ? getCategoryName(itemToDelete.category_id) : ''"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
