<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
import DatePicker from 'primevue/datepicker'
import Tag from 'primevue/tag'

const router = useRouter()
const { canEdit } = usePermissions()

const bookings = ref<Booking[]>([])
const loading = ref(true)
const searchQuery = ref('')
const fromDate = ref<Date | null>(null)
const toDate = ref<Date | null>(null)
const showFilters = ref(false)

// Count active filters for badge
const activeFilterCount = computed(() => {
  let count = 0
  if (searchQuery.value) count++
  if (fromDate.value) count++
  if (toDate.value) count++
  return count
})

// Compute status from function date
function getComputedStatus(booking: Booking): 'completed' | 'ongoing' | 'upcoming' | 'cancelled' {
  if (booking.status === 'cancelled') return 'cancelled'

  const eventDate = new Date(booking.function_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (eventDate.getTime() < today.getTime()) return 'completed'
  if (eventDate.getTime() === today.getTime()) return 'ongoing'
  return 'upcoming'
}

function getStatusLabel(booking: Booking): string {
  const status = getComputedStatus(booking)
  switch (status) {
    case 'ongoing': return 'Today'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    case 'upcoming': return 'Upcoming'
    default: return ''
  }
}

function getStatusSeverity(status: string): "success" | "info" | "warn" | "danger" | "secondary" | undefined {
  switch (status) {
    case 'completed': return 'secondary'
    case 'ongoing': return 'success'
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

    // Date range filtering
    if (fromDate.value) {
      const fromStr = fromDate.value.toISOString().split('T')[0]
      query = query.gte('function_date', fromStr)
    }
    if (toDate.value) {
      const toStr = toDate.value.toISOString().split('T')[0]
      query = query.lte('function_date', toStr)
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

function clearFilters() {
  searchQuery.value = ''
  fromDate.value = null
  toDate.value = null
  fetchBookings()
}

function viewBooking(booking: Booking) {
  router.push({ name: 'booking-detail', params: { id: booking.id } })
}

onMounted(fetchBookings)
</script>

<template>
  <div class="text-[#1F2937]">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-3xl font-bold text-[#1F2937]">Bookings</h1>
      <Button
        v-if="canEdit"
        label="New Booking"
        icon="pi pi-plus"
        @click="router.push({ name: 'booking-create' })"
      />
    </div>

    <!-- Mobile Filter Toggle -->
    <div class="flex items-center gap-2 mb-4 sm:hidden">
      <Button
        :label="showFilters ? 'Hide Filters' : 'Filters'"
        :icon="showFilters ? 'pi pi-chevron-up' : 'pi pi-filter'"
        severity="secondary"
        size="small"
        @click="showFilters = !showFilters"
      />
      <span v-if="activeFilterCount > 0" class="px-2 py-0.5 bg-[#10B981] text-white text-xs font-medium rounded-full">
        {{ activeFilterCount }}
      </span>
    </div>

    <!-- Filters (collapsible on mobile, always visible on desktop) -->
    <div v-show="showFilters" class="card-static p-3 mb-4 sm:!block">
      <div class="flex flex-col gap-3">
        <!-- Search row - always inline -->
        <div class="flex gap-2">
          <InputText
            v-model="searchQuery"
            placeholder="Search customer..."
            class="flex-1"
            @keyup.enter="fetchBookings"
          />
          <Button icon="pi pi-search" severity="secondary" @click="fetchBookings" />
        </div>
        <!-- Date filters -->
        <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div class="flex gap-2 flex-1">
            <DatePicker
              v-model="fromDate"
              date-format="dd/mm/yy"
              show-icon
              show-button-bar
              class="flex-1"
              placeholder="From date"
              @date-select="fetchBookings"
              @clear-click="fetchBookings"
            />
            <DatePicker
              v-model="toDate"
              date-format="dd/mm/yy"
              show-icon
              show-button-bar
              class="flex-1"
              placeholder="To date"
              @date-select="fetchBookings"
              @clear-click="fetchBookings"
            />
          </div>
          <Button
            v-if="activeFilterCount > 0"
            label="Clear"
            icon="pi pi-times"
            severity="secondary"
            size="small"
            @click="clearFilters"
          />
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="card-static overflow-hidden">
      <DataTable
        :value="bookings"
        :loading="loading"
        paginator
        :rows="10"
        :rows-per-page-options="[10, 25, 50]"
        striped-rows
        class="p-datatable-sm"
        @row-click="(e: { data: Booking }) => viewBooking(e.data)"
        :row-class="() => 'cursor-pointer hover:bg-[#F9FAFB]'"
      >
        <Column field="function_date" header="Date" sortable>
          <template #body="{ data }">
            {{ formatDate(data.function_date) }}
          </template>
        </Column>
        <Column field="customer_name" header="Customer" sortable />
        <Column field="rent" header="Rent" sortable class="hidden sm:table-cell">
          <template #body="{ data }">
            {{ formatCurrency(data.rent) }}
          </template>
        </Column>
        <Column field="status" header="Status" sortable>
          <template #body="{ data }">
            <Tag :value="getStatusLabel(data)" :severity="getStatusSeverity(getComputedStatus(data))" />
          </template>
        </Column>
        <Column header="Actions" class="w-24 hidden sm:table-cell">
          <template #body="{ data }">
            <Button
              icon="pi pi-eye"
              text
              rounded
              severity="secondary"
              @click.stop="viewBooking(data)"
            />
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-8 text-[#9CA3AF]">No bookings found</div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
