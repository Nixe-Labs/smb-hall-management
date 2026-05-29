<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { parseISO, format, addDays, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { formatTimeRange } from '@/lib/utils/dates'
import TamilDemandBadge from '@/components/common/TamilDemandBadge.vue'
import { getDemandForDate, type DemandTier } from '@/lib/utils/tamilDemand'
import {
  getTamilDate, getTamilMonthSpan, tamilDayOfMonth, shiftTamilMonth,
  PAKSHA_LABEL, type Paksha,
} from '@/lib/utils/tamilCalendar'
import type { Booking } from '@/types/database'

const router = useRouter()

const today = new Date()
today.setHours(0, 0, 0, 0)
const todayStr = today.toISOString().slice(0, 10)

type ViewMode = 'gregorian' | 'tamil'
const viewMode = ref<ViewMode>('gregorian')

const currentMonth = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const tamilAnchor = ref(todayStr) // a Gregorian date inside the viewed Tamil month
const selected = ref(todayStr)
const bookings = ref<Booking[]>([])
const creatorById = ref<Record<string, string>>({})
const loading = ref(true)

function creatorName(b: Booking): string {
  return b.created_by ? (creatorById.value[b.created_by] ?? 'Unknown') : '—'
}

const dateMap = computed(() => {
  const m: Record<string, Booking[]> = {}
  bookings.value.forEach(b => {
    if (b.status === 'cancelled') return
    if (!m[b.function_date]) m[b.function_date] = []
    m[b.function_date]!.push(b)
  })
  return m
})

function dayIso(d: Date) {
  return d.toISOString().slice(0, 10)
}

// ── Gregorian grid ──────────────────────────────────────────
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

// ── Tamil grid ──────────────────────────────────────────────
interface TamilCell {
  iso: string
  gregLabel: string
  tamilDay: number | null
  paksha: Paksha | null
  inMonth: boolean
}
const tamilSpan = computed(() => getTamilMonthSpan(tamilAnchor.value))
const tamilCells = computed<TamilCell[]>(() => {
  const span = tamilSpan.value
  if (!span) return []
  const start = parseISO(span.startISO)
  const end = parseISO(span.endISO)
  const gridStart = addDays(start, -start.getDay())   // back to Sunday
  const gridEnd = addDays(end, 6 - end.getDay())       // forward to Saturday
  const cells: TamilCell[] = []
  let cur = gridStart
  while (cur.getTime() <= gridEnd.getTime()) {
    const iso = format(cur, 'yyyy-MM-dd')
    const inMonth = cur.getTime() >= start.getTime() && cur.getTime() <= end.getTime()
    cells.push({
      iso,
      gregLabel: cur.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      tamilDay: inMonth ? differenceInCalendarDays(cur, start) + 1 : null,
      paksha: inMonth ? (getTamilDate(iso)?.paksha ?? null) : null,
      inMonth,
    })
    cur = addDays(cur, 1)
  }
  return cells
})
const tamilRangeLabel = computed(() => {
  const s = tamilSpan.value
  if (!s) return ''
  const f = (iso: string) => parseISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `${f(s.startISO)} – ${f(s.endISO)} ${parseISO(s.endISO).getFullYear()}`
})

// ── Demand markers for whichever grid is active ─────────────
const demandByDay = computed(() => {
  const m: Record<string, DemandTier> = {}
  const isos = viewMode.value === 'tamil'
    ? tamilCells.value.filter(c => c.inMonth).map(c => c.iso)
    : calDays.value.map(dayIso)
  for (const iso of isos) {
    const info = getDemandForDate(iso)
    if (info && (info.demand.tier === 'peak' || info.demand.tier === 'high')) m[iso] = info.demand.tier
  }
  return m
})

// ── Selected day ────────────────────────────────────────────
const selectedBookings = computed(() => dateMap.value[selected.value] ?? [])
const selectedDateLabel = computed(() => {
  const d = new Date(selected.value + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
})
const selectedPanchangam = computed(() => {
  const t = getTamilDate(selected.value)
  if (!t) return null
  return {
    month: t.month,
    paksha: t.paksha,
    tithi: t.tithiEn,
    nakshatra: t.nakshatraEn,
    tamilDay: tamilDayOfMonth(selected.value),
  }
})

// ── Navigation ──────────────────────────────────────────────
function prev() {
  if (viewMode.value === 'tamil') tamilAnchor.value = shiftTamilMonth(tamilAnchor.value, -1)
  else currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1, 1)
}
function next() {
  if (viewMode.value === 'tamil') tamilAnchor.value = shiftTamilMonth(tamilAnchor.value, 1)
  else currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 1)
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
    const [{ data }, { data: profs }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, function_date, customer_name, status, start_time, end_time, created_by')
        .order('function_date'),
      supabase.from('profiles').select('id, full_name'),
    ])
    bookings.value = (data as Booking[]) ?? []
    const map: Record<string, string> = {}
    ;((profs as { id: string; full_name: string | null }[]) ?? []).forEach(p => {
      if (p.full_name) map[p.id] = p.full_name
    })
    creatorById.value = map
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
          <div style="min-width:0">
            <div class="t-eyebrow" style="margin-bottom:8px">{{ viewMode === 'tamil' ? 'Tamil month' : 'Month' }}</div>
            <h2 class="t-h2">{{ viewMode === 'tamil' ? (tamilSpan?.month.en ?? '—') : monthName }}</h2>
            <div v-if="viewMode === 'tamil' && tamilSpan" class="cal-tamil-sub">
              {{ tamilSpan.month.ta }} · {{ tamilRangeLabel }}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div class="cal-viewtoggle">
              <button :class="['cal-vt-btn', viewMode === 'gregorian' ? 'is-active' : '']" @click="viewMode = 'gregorian'">Gregorian</button>
              <button :class="['cal-vt-btn', viewMode === 'tamil' ? 'is-active' : '']" @click="viewMode = 'tamil'">Tamil</button>
            </div>
            <div style="display:flex;gap:8px">
              <button class="smb-nav-iconbtn" @click="prev">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
              </button>
              <button class="smb-nav-iconbtn" @click="next">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="cal-weekdays">
          <div v-for="d in ['SUN','MON','TUE','WED','THU','FRI','SAT']" :key="d">{{ d }}</div>
        </div>

        <!-- Gregorian grid -->
        <div v-if="viewMode === 'gregorian'" class="cal-days">
          <div
            v-for="(d, i) in calDays"
            :key="i"
            :class="[
              'cal-day',
              d.getMonth() !== currentMonth.getMonth() ? 'is-other' : '',
              dayIso(d) === todayStr ? 'is-today' : '',
              dayIso(d) === selected ? 'is-selected' : '',
              demandByDay[dayIso(d)] ? 'dm-' + demandByDay[dayIso(d)] : '',
            ]"
            :title="demandByDay[dayIso(d)] === 'peak' ? 'Peak Tamil-season demand' : demandByDay[dayIso(d)] === 'high' ? 'High Tamil-season demand' : ''"
            @click="selected = dayIso(d)"
          >
            <div class="cal-day-num">{{ d.getDate() }}</div>
            <div v-if="dateMap[dayIso(d)]" class="cal-dot"></div>
          </div>
        </div>

        <!-- Tamil grid -->
        <div v-else class="cal-days">
          <div
            v-for="(c, i) in tamilCells"
            :key="i"
            :class="[
              'cal-day',
              !c.inMonth ? 'is-other' : '',
              c.inMonth && c.paksha ? 'pk-' + c.paksha : '',
              c.iso === todayStr ? 'is-today' : '',
              c.iso === selected ? 'is-selected' : '',
              c.inMonth && demandByDay[c.iso] ? 'dm-' + demandByDay[c.iso] : '',
            ]"
            :title="demandByDay[c.iso] === 'peak' ? 'Peak Tamil-season demand' : demandByDay[c.iso] === 'high' ? 'High Tamil-season demand' : ''"
            @click="c.inMonth && (selected = c.iso)"
          >
            <div class="cal-tcell">
              <div class="cal-tday">{{ c.tamilDay ?? '' }}</div>
              <div class="cal-tgreg">{{ c.inMonth ? c.gregLabel : '' }}</div>
            </div>
            <div v-if="c.inMonth && dateMap[c.iso]" class="cal-dot"></div>
          </div>
        </div>

        <!-- Legend -->
        <div class="cal-legend">
          <span class="cal-leg"><span class="cal-leg-sw dm-peak"></span> Peak demand</span>
          <span class="cal-leg"><span class="cal-leg-sw dm-high"></span> High demand</span>
          <span class="cal-leg"><span class="cal-leg-dot"></span> Has booking</span>
          <template v-if="viewMode === 'tamil'">
            <span class="cal-leg"><span class="cal-leg-bar pk-valarpirai"></span> Valarpirai</span>
            <span class="cal-leg"><span class="cal-leg-bar pk-theipirai"></span> Theipirai</span>
          </template>
        </div>
      </div>

      <!-- Day sidebar -->
      <div class="cal-side">
        <div class="t-eyebrow" style="margin-bottom:8px">{{ selectedDateLabel }}</div>
        <div style="margin-bottom:14px"><TamilDemandBadge :date-str="selected" variant="inline" /></div>

        <!-- Panchangam detail -->
        <div v-if="selectedPanchangam" class="cal-panchang">
          <div class="cal-panchang-row">
            <span>Tamil date</span>
            <span>{{ selectedPanchangam.month.en }}<span v-if="selectedPanchangam.tamilDay"> {{ selectedPanchangam.tamilDay }}</span> · {{ selectedPanchangam.month.ta }}</span>
          </div>
          <div class="cal-panchang-row">
            <span>Paksha</span>
            <span>{{ PAKSHA_LABEL[selectedPanchangam.paksha].short }} · {{ PAKSHA_LABEL[selectedPanchangam.paksha].ta }}</span>
          </div>
          <div v-if="selectedPanchangam.tithi" class="cal-panchang-row">
            <span>Tithi</span><span>{{ selectedPanchangam.tithi }}</span>
          </div>
          <div v-if="selectedPanchangam.nakshatra" class="cal-panchang-row">
            <span>Nakshatra</span><span>{{ selectedPanchangam.nakshatra }}</span>
          </div>
        </div>

        <h3 class="t-h3" style="margin:24px 0">
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
            <div v-if="formatTimeRange(b.start_time, b.end_time)" style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:3px;letter-spacing:0.03em">
              {{ formatTimeRange(b.start_time, b.end_time) }}
            </div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--ash);margin-top:3px;letter-spacing:0.03em">
              Booked by {{ creatorName(b) }}
            </div>
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

<style scoped>
/* View toggle */
.cal-viewtoggle {
  display: inline-flex;
  border: 1px solid var(--hair);
  border-radius: 999px;
  padding: 2px;
}
.cal-vt-btn {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 7px 13px;
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ash);
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.cal-vt-btn.is-active { background: var(--ink); color: var(--paper); }
.cal-tamil-sub {
  margin-top: 6px;
  font: 500 12px/1.3 var(--font-mono);
  color: var(--ash);
  letter-spacing: 0.03em;
}

/* Tamil cell content */
.cal-tcell { display: flex; flex-direction: column; gap: 2px; }
.cal-tday { font: 600 16px/1 var(--font-display); color: var(--ink); }
.cal-tgreg { font: 500 10px/1 var(--font-mono); color: var(--ash); letter-spacing: 0.03em; }
.cal-day.is-selected .cal-tday,
.cal-day.is-selected .cal-tgreg { color: var(--paper); }
/* Paksha tint: waxing = warm accent edge, waning = muted edge */
.cal-day.pk-valarpirai { box-shadow: inset 3px 0 0 var(--accent, #b5651d); }
.cal-day.pk-theipirai  { box-shadow: inset 3px 0 0 var(--ash-2, #c8c2b8); }
.cal-day.is-selected.pk-valarpirai,
.cal-day.is-selected.pk-theipirai { box-shadow: none; }

/* Panchangam detail block */
.cal-panchang {
  border: 1px solid var(--hair);
  border-radius: 8px;
  padding: 4px 14px;
}
.cal-panchang-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--hair);
  font-size: 13px;
}
.cal-panchang-row:last-child { border-bottom: none; }
.cal-panchang-row > span:first-child {
  font: 500 10px/1 var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ash);
}
.cal-panchang-row > span:last-child { font-weight: 500; color: var(--ink); text-align: right; }

/* Tamil-season demand → whole-cell tint (stronger = Peak, lighter = High) */
.cal-day.dm-peak { background: rgba(181, 101, 29, 0.13); }
.cal-day.dm-high { background: rgba(181, 101, 29, 0.06); }
/* Today / selected states must win over the demand tint (placed after) */
.cal-day.is-today { background: var(--paper-2); }
.cal-day.is-selected { background: var(--ink); }

/* Legend */
.cal-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding: 16px 4px 0;
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.04em;
  color: var(--ash);
}
.cal-leg { display: inline-flex; align-items: center; gap: 7px; }
.cal-leg-sw {
  width: 14px; height: 14px;
  border-radius: 3px;
  border: 1px solid var(--hair);
}
.cal-leg-sw.dm-peak { background: rgba(181, 101, 29, 0.13); }
.cal-leg-sw.dm-high { background: rgba(181, 101, 29, 0.06); }
.cal-leg-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #b5651d); }
.cal-leg-bar { width: 14px; height: 3px; border-radius: 2px; }
.cal-leg-bar.pk-valarpirai { background: var(--accent, #b5651d); }
.cal-leg-bar.pk-theipirai { background: var(--ash-2, #c8c2b8); }
</style>
