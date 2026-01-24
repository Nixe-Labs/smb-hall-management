<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { BillCategory } from '@/types/database'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Dialog from 'primevue/dialog'
import ToggleSwitch from 'primevue/toggleswitch'

const router = useRouter()
const toast = useToast()

const categories = ref<BillCategory[]>([])
const loading = ref(true)
const showDialog = ref(false)
const editingItem = ref<Partial<BillCategory>>({})
const saving = ref(false)

async function fetchCategories() {
  loading.value = true
  const { data } = await supabase
    .from('bill_categories')
    .select('*')
    .order('sort_order')
  categories.value = (data as BillCategory[]) ?? []
  loading.value = false
}

function openAdd() {
  editingItem.value = { name: '', is_active: true, sort_order: categories.value.length + 1 }
  showDialog.value = true
}

function openEdit(item: BillCategory) {
  editingItem.value = { ...item }
  showDialog.value = true
}

async function save() {
  if (!editingItem.value.name) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Name is required', life: 3000 })
    return
  }

  saving.value = true
  try {
    const payload = {
      name: editingItem.value.name,
      is_active: editingItem.value.is_active ?? true,
      sort_order: editingItem.value.sort_order ?? 0,
    }

    if (editingItem.value.id) {
      const { error } = await supabase.from('bill_categories').update(payload).eq('id', editingItem.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('bill_categories').insert(payload)
      if (error) throw error
    }

    showDialog.value = false
    await fetchCategories()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    saving.value = false
  }
}

async function toggleActive(item: BillCategory) {
  await supabase.from('bill_categories').update({ is_active: !item.is_active }).eq('id', item.id)
  await fetchCategories()
}

onMounted(fetchCategories)
</script>

<template>
  <div>
    <div class="flex items-center gap-2 md:gap-4 mb-4 md:mb-6">
      <Button icon="pi pi-arrow-left" text rounded @click="router.push({ name: 'settings' })" />
      <h1 class="text-lg md:text-2xl font-bold text-gray-900">Bill Categories</h1>
      <Button icon="pi pi-plus" size="small" class="ml-auto sm:hidden" @click="openAdd" />
      <Button label="Add Category" icon="pi pi-plus" size="small" class="ml-auto hidden sm:flex" @click="openAdd" />
    </div>

    <div class="bg-white rounded-lg shadow overflow-x-auto">
      <DataTable :value="categories" :loading="loading" striped-rows class="p-datatable-sm">
        <Column field="name" header="Name" sortable />
        <Column field="sort_order" header="Order" sortable class="w-20" />
        <Column header="Active" class="w-24">
          <template #body="{ data }">
            <ToggleSwitch :model-value="data.is_active" @change="toggleActive(data)" />
          </template>
        </Column>
        <Column header="Default" class="w-24">
          <template #body="{ data }">
            <span v-if="data.is_default" class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Default</span>
          </template>
        </Column>
        <Column header="Actions" class="w-20">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" text rounded size="small" @click="openEdit(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="showDialog" header="Bill Category" modal class="w-full max-w-sm">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Name *</label>
          <InputText v-model="editingItem.name" placeholder="Category name" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Sort Order</label>
          <InputNumber v-model="editingItem.sort_order" class="w-full" />
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="editingItem.is_active" />
          <label class="text-sm text-gray-700">Active</label>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showDialog = false" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
