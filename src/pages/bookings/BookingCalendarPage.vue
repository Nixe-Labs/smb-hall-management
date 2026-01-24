<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/composables/usePermissions'
import type { Booking } from '@/types/database'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'

const router = useRouter()
const { canEdit } = usePermissions()

const selectedDate = ref<Date | null>(null)
const bookedDates = ref<Date[]>([])
const bookingsOnDate = ref<Booking[]>([])
const loading = ref(true)

async function fetchBookedDates() {
  loading.value = true
  try {
    const { data } = await supabase
      .from('bookings')
      .select('function_date, customer_name, status')
      .neq('status', 'cancelled')

    if (data) {
      bookedDates.value = data.map(b => {
        const [y, m, d] = b.function_date.split('-').map(Number)
        return new Date(y, m - 1, d)
      })
    }
  } finally {
    loading.value = false
  }
}

async function onDateSelect(date: Date) {
  selectedDate.value = date
  const dateStr = date.toISOString().split('T')[0]
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq('function_date', dateStr)
    .neq('status', 'cancelled')

  bookingsOnDate.value = (data as Booking[]) ?? []
}

function isDateBooked(date: { day: number; month: number; year: number }): boolean {
  return bookedDates.value.some(d =>
    d.getDate() === date.day &&
    d.getMonth() === date.month &&
    d.getFullYear() === date.year
  )
}

onMounted(fetchBookedDates)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Calendar</h1>
      <Button
        v-if="canEdit"
        label="New Booking"
        icon="pi pi-plus"
        @click="router.push({ name: 'booking-create' })"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 bg-white rounded-lg shadow p-6">
        <DatePicker
          v-model="selectedDate"
          inline
          class="w-full"
          @date-select="onDateSelect"
        >
          <template #date="{ date }">
            <div class="flex flex-col items-center">
              <span>{{ date.day }}</span>
              <span
                v-if="isDateBooked(date)"
                class="w-1.5 h-1.5 rounded-full bg-blue-500 mt-0.5"
              ></span>
            </div>
          </template>
        </DatePicker>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">
          {{ selectedDate ? selectedDate.toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'Select a date' }}
        </h3>
        <div v-if="bookingsOnDate.length > 0" class="flex flex-col gap-3">
          <div
            v-for="b in bookingsOnDate"
            :key="b.id"
            class="p-3 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100"
            @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
          >
            <div class="font-medium text-gray-800">{{ b.customer_name }}</div>
            <div class="text-sm text-gray-500 capitalize">{{ b.status }}</div>
          </div>
        </div>
        <div v-else-if="selectedDate" class="text-gray-400">
          No bookings on this date
          <Button
            v-if="canEdit"
            label="Book this date"
            icon="pi pi-plus"
            size="small"
            class="mt-3"
            @click="router.push({ name: 'booking-create' })"
          />
        </div>
      </div>
    </div>
  </div>
</template>
