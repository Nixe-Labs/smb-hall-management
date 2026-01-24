<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { Profile } from '@/types/database'
import type { UserRole } from '@/types/enums'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'

const router = useRouter()
const toast = useToast()

const users = ref<Profile[]>([])
const loading = ref(true)

const roleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Staff', value: 'staff' },
  { label: 'Viewer', value: 'viewer' },
]

function getRoleSeverity(role: string): "success" | "info" | "warn" | "secondary" | undefined {
  switch (role) {
    case 'admin': return 'success'
    case 'staff': return 'info'
    case 'viewer': return 'secondary'
    default: return 'secondary'
  }
}

async function fetchUsers() {
  loading.value = true
  const { data } = await supabase.from('profiles').select('*').order('created_at')
  users.value = (data as Profile[]) ?? []
  loading.value = false
}

async function updateRole(userId: string, newRole: UserRole) {
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)

  if (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  } else {
    toast.add({ severity: 'success', summary: 'Updated', detail: 'User role updated', life: 3000 })
    await fetchUsers()
  }
}

onMounted(fetchUsers)
</script>

<template>
  <div>
    <div class="flex items-center gap-2 md:gap-4 mb-4 md:mb-6">
      <Button icon="pi pi-arrow-left" text rounded @click="router.push({ name: 'settings' })" />
      <h1 class="text-lg md:text-2xl font-bold text-gray-900">User Management</h1>
    </div>

    <div class="bg-white rounded-lg shadow overflow-x-auto">
      <DataTable :value="users" :loading="loading" striped-rows class="p-datatable-sm">
        <Column field="email" header="Email" sortable />
        <Column field="full_name" header="Name" />
        <Column header="Role">
          <template #body="{ data }">
            <Tag :value="data.role" :severity="getRoleSeverity(data.role)" class="capitalize" />
          </template>
        </Column>
        <Column header="Change Role" class="w-40">
          <template #body="{ data }">
            <Select
              :model-value="data.role"
              :options="roleOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              @change="(e: { value: UserRole }) => updateRole(data.id, e.value)"
            />
          </template>
        </Column>
        <Column header="Active" class="w-20">
          <template #body="{ data }">
            <i :class="data.is_active ? 'pi pi-check text-green-500' : 'pi pi-times text-red-500'"></i>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
