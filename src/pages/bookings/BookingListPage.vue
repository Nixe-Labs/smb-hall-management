<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatTimeRange } from '@/lib/utils/dates'
import TamilDemandBadge from '@/components/common/TamilDemandBadge.vue'
import { buildDemandHistory, type DemandHistory } from '@/lib/utils/tamilDemand'
import type { Booking } from '@/types/database'

const router = useRouter()
const bookings = ref<Booking[]>([])
const demandHistory = ref<DemandHistory | null>(null)
const loading = ref(true)
const search = ref('')
const statusFilter = ref('all')

type StatusKey = 'ongoing' | 'upcoming' | 'completed' | 'cancelled'

function getStatus(b: Booking): StatusKey {
  if (b.status === 'cancelled') return 'cancelled'
  const d = new Date(b.function_date + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  if (d.getTime() < t.getTime()) return 'completed'
  if (d.getTime() === t.getTime()) return 'ongoing'
  return 'upcoming'
}

const statusLabels: Record<string, string> = {
  all: 'All', ongoing: 'Today', upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled'
}

const filtered = computed(() => {
  return bookings.value.filter(b => {
    const s = getStatus(b)
    if (statusFilter.value !== 'all' && s !== statusFilter.value) return false
    if (search.value && !b.customer_name.toLowerCase().includes(search.value.toLowerCase())) return false
    return true
  })
})

async function fetchBookings() {
  loading.value = true
  try {
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .order('function_date', { ascending: false })
    bookings.value = (data as Booking[]) ?? []
    demandHistory.value = buildDemandHistory(
      bookings.value.filter(b => b.status !== 'cancelled').map(b => b.function_date)
    )
  } finally {
    loading.value = false
  }
}

onMounted(fetchBookings)
</script>

<template>
  <div class="screen">
    <!-- Header -->
    <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:32px;padding-top:32px;flex-wrap:wrap;gap:16px" class="fade-in">
      <div>
        <div class="t-eyebrow" style="margin-bottom:12px">02 / Bookings · {{ filtered.length }} of {{ bookings.length }}</div>
        <h1 class="t-h1">All bookings</h1>
      </div>
      <button class="btn btn-primary" @click="router.push({ name: 'booking-create' })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
        New booking
      </button>
    </div>

    <!-- Toolbar -->
    <div class="smb-table-toolbar fade-up">
      <div class="smb-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input v-model="search" placeholder="Search customer…" />
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button
          v-for="s in ['all', 'ongoing', 'upcoming', 'completed', 'cancelled']"
          :key="s"
          :class="['smb-filter-pill', statusFilter === s ? 'is-active' : '']"
          @click="statusFilter = s"
        >{{ statusLabels[s] }}</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-center">
      <div class="smb-spinner"></div>
    </div>

    <!-- Table -->
    <div v-else class="smb-table-wrap fade-up delay-2">
      <table class="table table-cards">
        <thead>
          <tr>
            <th style="width:130px">ID</th>
            <th style="width:140px">Date</th>
            <th>Customer</th>
            <th style="text-align:right">Rent</th>
            <th style="width:130px">Status</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filtered.length === 0">
            <td colspan="6" style="text-align:center;color:var(--ash);padding:60px">No bookings match your filters.</td>
          </tr>
          <tr
            v-for="b in filtered"
            :key="b.id"
            @click="router.push({ name: 'booking-detail', params: { id: b.id } })"
          >
            <td data-label="ID" style="font-family:var(--font-mono);font-size:12px;color:var(--ash)">{{ b.id }}</td>
            <td data-label="Date">
              {{ formatDate(b.function_date) }}
              <div v-if="formatTimeRange(b.start_time, b.end_time)" style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:3px;letter-spacing:0.03em">
                {{ formatTimeRange(b.start_time, b.end_time) }}
              </div>
              <div style="margin-top:4px">
                <TamilDemandBadge :date-str="b.function_date" :history="demandHistory" variant="mini" />
              </div>
            </td>
            <td data-label="Customer" style="font-weight:600">{{ b.customer_name }}</td>
            <td data-label="Rent" style="text-align:right;font-family:var(--font-display);font-weight:600;font-variant-numeric:tabular-nums">{{ formatCurrency(b.rent) }}</td>
            <td data-label="Status">
              <span :class="['tag', 'tag-' + getStatus(b)]">{{ statusLabels[getStatus(b)] }}</span>
            </td>
            <td>
              <span class="row-arrow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
