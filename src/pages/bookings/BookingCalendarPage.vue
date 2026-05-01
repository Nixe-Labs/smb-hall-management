<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import type { Booking } from '@/types/database'

const router = useRouter()

const today = new Date()
today.setHours(0, 0, 0, 0)
const todayStr = today.toISOString().slice(0, 10)

const currentMonth = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selected = ref(todayStr)
const bookings = ref<Booking[]>([])
const loading = ref(true)

const dateMap = computed(() => {
  const m: Record<string, Booking[]> = {}
  bookings.value.forEach(b => {
    if (b.status === 'cancelled') return
    if (!m[b.function_date]) m[b.function_date] = []
    m[b.function_date]!.push(b)
  })
  return m
})

const calDays = computed(() => {
  const first = new Date(currentMonth.value)
  first.setDate(1)
  const start = new Date(first)
  start.setDate(start.getDate() - first.getDay())
  const arr: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    arr.push(d)
  }
  return arr
})

const monthName = computed(() =>
  currentMonth.value.toLocaleDateString('en', { month: 'long', year: 'numeric' })
)

const selectedBookings = computed(() => dateMap.value[selected.value] ?? [])

const selectedDateLabel = computed(() => {
  const d = new Date(selected.value + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
})

function prevMonth() {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1, 1)
}

function nextMonth() {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 1)
}

function dayIso(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getStatus(b: Booking): string {
  if (b.status === 'cancelled') return 'cancelled'
  const d = new Date(b.function_date + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  if (d.getTime() < t.getTime()) return 'completed'
  if (d.getTime() === t.getTime()) return 'ongoing'
  return 'upcoming'
}

const statusLabels: Record<string, string> = {
  ongoing: 'Today', upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled'
}

async function fetchBookings() {
  loading.value = true
  try {
    const { data } = await supabase
      .from('bookings')
      .select('id, function_date, customer_name, status')
      .order('function_date')
    bookings.value = (data as Booking[]) ?? []
  } finally {
    loading.value = false
  }
}

onMounted(fetchBookings)
</script>

<template>
  <div class="screen">
    <!-- Header -->
    <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:24px;padding-top:32px;flex-wrap:wrap;gap:16px" class="fade-in">
      <div>
        <div class="t-eyebrow" style="margin-bottom:12px">03 / Calendar</div>
        <h1 class="t-h1">Schedule.</h1>
      </div>
      <button class="btn btn-primary" @click="router.push({ name: 'booking-create' })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
        New booking
      </button>
    </div>

    <div v-if="loading" class="loading-center">
      <div class="smb-spinner"></div>
    </div>

    <div v-else class="cal-grid fade-up">
      <!-- Calendar main -->
      <div class="cal-main">
        <div class="cal-month-header">
          <div>
            <div class="t-eyebrow" style="margin-bottom:8px">Month</div>
            <h2 class="t-h2">{{ monthName }}</h2>
          </div>
          <div style="display:flex;gap:8px">
            <button class="smb-nav-iconbtn" @click="prevMonth">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
            </button>
            <button class="smb-nav-iconbtn" @click="nextMonth">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
          </div>
        </div>

        <div class="cal-weekdays">
          <div v-for="d in ['SUN','MON','TUE','WED','THU','FRI','SAT']" :key="d">{{ d }}</div>
        </div>

        <div class="cal-days">
          <div
            v-for="(d, i) in calDays"
            :key="i"
            :class="[
              'cal-day',
              d.getMonth() !== currentMonth.getMonth() ? 'is-other' : '',
              dayIso(d) === todayStr ? 'is-today' : '',
              dayIso(d) === selected ? 'is-selected' : '',
            ]"
            @click="selected = dayIso(d)"
          >
            <div class="cal-day-num">{{ d.getDate() }}</div>
            <div v-if="dateMap[dayIso(d)]" class="cal-dot"></div>
          </div>
        </div>
      </div>

      <!-- Day sidebar -->
      <div class="cal-side">
        <div class="t-eyebrow" style="margin-bottom:8px">{{ selectedDateLabel }}</div>
        <h3 class="t-h3" style="margin-bottom:24px">
          {{ selectedBookings.length === 0 ? 'No bookings' : `${selectedBookings.length} booking${selectedBookings.length > 1 ? 's' : ''}` }}
        </h3>

        <div
          v-for="b in selectedBookings"
          :key="b.id"
          class="act-item"
          @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
        >
          <div class="act-date">{{ b.id.slice(0, 8).toUpperCase() }}</div>
          <div style="flex:1;min-width:0">
            <div class="act-name reveal-line">{{ b.customer_name }}</div>
          </div>
          <span :class="['tag', 'tag-' + getStatus(b)]">{{ statusLabels[getStatus(b)] }}</span>
        </div>

        <div v-if="selectedBookings.length === 0" style="margin-top:16px">
          <button class="btn btn-primary" @click="router.push({ name: 'booking-create' })">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
            Book this date
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
