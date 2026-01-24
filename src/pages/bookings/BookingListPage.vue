<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/composables/usePermissions'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { Booking } from '@/types/database'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'

const router = useRouter()
const { canEdit } = usePermissions()

const bookings = ref<Booking[]>([])
const loading = ref(true)
const searchQuery = ref('')
const statusFilter = ref<string | null>(null)

const statusOptions = [
  { label: 'All', value: null },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

function getStatusSeverity(status: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" | undefined {
  switch (status) {
    case 'completed': return 'success'
    case 'upcoming': return 'info'
    case 'cancelled': return 'danger'
    default: return 'secondary'
  }
}

async function fetchBookings() {
  loading.value = true
  try {
    let query = supabase
      .from('bookings')
      .select('*')
      .order('function_date', { ascending: false })

    if (statusFilter.value) {
      query = query.eq('status', statusFilter.value)
    }
    if (searchQuery.value) {
      query = query.ilike('customer_name', `%${searchQuery.value}%`)
    }

    const { data } = await query
    bookings.value = (data as Booking[]) ?? []
  } finally {
    loading.value = false
  }
}

function viewBooking(booking: Booking) {
  router.push({ name: 'booking-detail', params: { id: booking.id } })
}

onMounted(fetchBookings)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4 md:mb-6">
      <h1 class="text-xl md:text-2xl font-bold text-gray-900">Bookings</h1>
      <Button
        v-if="canEdit"
        label="New Booking"
        icon="pi pi-plus"
        size="small"
        @click="router.push({ name: 'booking-create' })"
      />
    </div>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4">
      <InputText
        v-model="searchQuery"
        placeholder="Search by customer..."
        class="w-full sm:w-64"
        @keyup.enter="fetchBookings"
      />
      <div class="flex gap-2">
        <Select
          v-model="statusFilter"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          placeholder="Status"
          class="w-full sm:w-40"
          @change="fetchBookings"
        />
        <Button icon="pi pi-search" severity="secondary" @click="fetchBookings" class="sm:hidden" />
        <Button label="Search" icon="pi pi-search" severity="secondary" @click="fetchBookings" class="hidden sm:flex" />
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow overflow-x-auto">
      <DataTable
        :value="bookings"
        :loading="loading"
        paginator
        :rows="10"
        :rows-per-page-options="[10, 25, 50]"
        striped-rows
        class="p-datatable-sm"
        @row-click="(e: { data: Booking }) => viewBooking(e.data)"
        :row-class="() => 'cursor-pointer'"
      >
        <Column field="function_date" header="Date" sortable>
          <template #body="{ data }">
            {{ formatDate(data.function_date) }}
          </template>
        </Column>
        <Column field="customer_name" header="Customer" sortable />
        <Column field="rent" header="Rent" sortable>
          <template #body="{ data }">
            {{ formatCurrency(data.rent) }}
          </template>
        </Column>
        <Column field="status" header="Status" sortable>
          <template #body="{ data }">
            <Tag :value="data.status" :severity="getStatusSeverity(data.status)" class="capitalize" />
          </template>
        </Column>
        <Column header="Actions" class="w-24">
          <template #body="{ data }">
            <Button
              icon="pi pi-eye"
              text
              rounded
              severity="info"
              @click.stop="viewBooking(data)"
            />
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-8 text-gray-400">No bookings found</div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
