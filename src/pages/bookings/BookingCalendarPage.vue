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

// Initialize with today's date
const today = new Date()
today.setHours(0, 0, 0, 0)
const selectedDate = ref<Date>(today)
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

function getCardStyles(booking: Booking): string {
  const status = getComputedStatus(booking)
  switch (status) {
    case 'completed': return 'bg-gray-50 border-gray-200 hover:bg-gray-100'
    case 'ongoing': return 'bg-[#F0FDF4] border-[#10B981]/20 hover:bg-[#D1FAE5]'
    case 'upcoming': return 'bg-[#EFF6FF] border-blue-200 hover:bg-blue-100'
    case 'cancelled': return 'bg-red-50 border-red-200 hover:bg-red-100'
    default: return 'bg-[#F0FDF4] border-[#10B981]/20 hover:bg-[#D1FAE5]'
  }
}

onMounted(async () => {
  await fetchBookedDates()
  // Load today's bookings by default
  await onDateSelect(selectedDate.value)
})
</script>

<template>
  <div class="text-[#1F2937]">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-3xl font-bold text-[#1F2937]">Calendar</h1>
      <Button
        v-if="canEdit"
        label="New Booking"
        icon="pi pi-plus"
        @click="router.push({ name: 'booking-create' })"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 card p-6">
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
                class="w-1.5 h-1.5 rounded-full bg-[#10B981] mt-0.5"
              ></span>
            </div>
          </template>
        </DatePicker>
      </div>

      <div class="card p-6">
        <h3 class="text-lg font-semibold text-[#1F2937] mb-4">
          {{ selectedDate ? selectedDate.toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'Select a date' }}
        </h3>
        <div v-if="bookingsOnDate.length > 0" class="flex flex-col gap-3">
          <div
            v-for="b in bookingsOnDate"
            :key="b.id"
            class="p-3 rounded-lg cursor-pointer border transition-colors"
            :class="getCardStyles(b)"
            @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
          >
            <div class="font-medium text-[#1F2937]">{{ b.customer_name }}</div>
            <div class="text-sm text-[#6B7280]">{{ getStatusLabel(b) }}</div>
          </div>
        </div>
        <div v-else-if="selectedDate" class="text-[#9CA3AF]">
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
