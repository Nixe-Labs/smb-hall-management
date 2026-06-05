<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { addDays, format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { DaySlot } from '@/types/enums'
import { SLOT_LABEL, DAY_SLOTS, compareSlots, slotCount } from '@/lib/utils/slots'

interface SlotRangeValue {
  function_date: string
  start_date: string
  start_slot: DaySlot
  end_date: string
  end_slot: DaySlot
  start_time?: string | null
  end_time?: string | null
}

const model = defineModel<SlotRangeValue>({ required: true })

const props = withDefaults(defineProps<{
  excludeBookingId?: string | null
  checkAvailability?: boolean
  showTimes?: boolean
}>(), {
  excludeBookingId: null,
  checkAvailability: true,
  showTimes: false,
})

// Hall-use times are tracked by the hour only (no minutes). Options are the 24
// whole hours, stored as "HH:00" and shown in 12-hour AM/PM form.
const hourOptions = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { value: `${String(h).padStart(2, '0')}:00`, label: `${h12}:00 ${period}` }
})

// Normalise any stored time (e.g. legacy "12:30" or "09:00:00") to its whole
// hour so the dropdown can match it.
function hourValue(t: string | null | undefined): string {
  return t ? `${t.slice(0, 2)}:00` : ''
}

type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; slots: number }
  | { state: 'conflict' }
  | { state: 'invalid' }

const availability = ref<Availability>({ state: 'idle' })

function shiftDate(dateStr: string, days: number): string {
  if (!dateStr) return dateStr
  return format(addDays(parseISO(dateStr), days), 'yyyy-MM-dd')
}

type PresetKind =
  | 'morn-only' | 'aftn-only' | 'eve-only' | 'full'   // single day
  | 'eve-morn' | 'morn-morn' | 'eve-eve'              // multi-day (spans into the function date)

function applyPreset(kind: PresetKind) {
  const f = model.value.function_date
  if (!f) return
  const set = (sd: string, ss: DaySlot, ed: string, es: DaySlot) => {
    model.value = { ...model.value, start_date: sd, start_slot: ss, end_date: ed, end_slot: es }
  }
  const prev = shiftDate(f, -1)
  switch (kind) {
    // Single-day functions
    case 'morn-only': return set(f, 'morning', f, 'morning')
    case 'aftn-only': return set(f, 'afternoon', f, 'afternoon')
    case 'eve-only':  return set(f, 'evening', f, 'evening')
    case 'full':      return set(f, 'morning', f, 'evening')
    // Multi-day functions (previous day → function date)
    case 'eve-morn':  return set(prev, 'evening', f, 'morning')
    case 'morn-morn': return set(prev, 'morning', f, 'morning')
    case 'eve-eve':   return set(prev, 'evening', f, 'evening')
  }
}

const orderValid = computed(() => {
  const v = model.value
  if (!v.start_date || !v.end_date) return false
  return compareSlots({ date: v.start_date, slot: v.start_slot }, { date: v.end_date, slot: v.end_slot }) <= 0
})

let checkToken = 0
async function runAvailabilityCheck() {
  const v = model.value
  if (!v.start_date || !v.end_date) {
    availability.value = { state: 'idle' }
    return
  }
  if (!orderValid.value) {
    availability.value = { state: 'invalid' }
    return
  }
  // Skip the RPC if the parent doesn't need conflict-checking (e.g. enquiries).
  if (!props.checkAvailability) {
    availability.value = { state: 'available', slots: slotCount(v) }
    return
  }
  const token = ++checkToken
  availability.value = { state: 'checking' }
  const { data, error } = await supabase.rpc('is_range_available', {
    s_date: v.start_date,
    s_slot: v.start_slot,
    e_date: v.end_date,
    e_slot: v.end_slot,
    exclude_booking: props.excludeBookingId ?? null,
  })
  if (token !== checkToken) return
  if (error) {
    availability.value = { state: 'idle' }
    return
  }
  if (data === true) {
    availability.value = { state: 'available', slots: slotCount(v) }
  } else {
    availability.value = { state: 'conflict' }
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => [model.value.start_date, model.value.start_slot, model.value.end_date, model.value.end_slot],
  () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(runAvailabilityCheck, 250)
  },
  { immediate: true }
)

defineExpose({ availability })
</script>

<template>
  <div class="slot-picker">
    <!-- Function date -->
    <div>
      <label class="field-label">Function date *</label>
      <input
        type="date"
        class="input"
        :value="model.function_date"
        @input="model = { ...model, function_date: ($event.target as HTMLInputElement).value }"
        required
      />
      <p style="margin-top:6px;font-size:12px;color:var(--ash)">
        The date the customer thinks of as the event (e.g. wedding day). Used on invoice.
      </p>
    </div>

    <!-- Quick presets -->
    <div v-if="model.function_date" style="margin-top:18px">
      <label class="field-label">Quick presets</label>
      <!-- Single-day functions -->
      <div class="preset-group-label">Single day</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="smb-filter-pill" @click="applyPreset('morn-only')">Morning only</button>
        <button type="button" class="smb-filter-pill" @click="applyPreset('aftn-only')">Afternoon only</button>
        <button type="button" class="smb-filter-pill" @click="applyPreset('eve-only')">Evening only</button>
        <button type="button" class="smb-filter-pill" @click="applyPreset('full')">Full day</button>
      </div>
      <!-- Multi-day functions (spill into the previous day) -->
      <div class="preset-group-label" style="margin-top:10px">Multi-day</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="smb-filter-pill" @click="applyPreset('eve-morn')">Prev Eve → Morn</button>
        <button type="button" class="smb-filter-pill" @click="applyPreset('morn-morn')">Prev Morn → Morn</button>
        <button type="button" class="smb-filter-pill" @click="applyPreset('eve-eve')">Prev Eve → Eve</button>
      </div>
    </div>

    <!-- Start -->
    <div style="margin-top:18px">
      <label class="field-label">Hall use · Start *</label>
      <div class="slot-row">
        <input
          type="date"
          class="input"
          :value="model.start_date"
          @input="model = { ...model, start_date: ($event.target as HTMLInputElement).value }"
        />
        <div class="slot-toggle">
          <button
            v-for="s in DAY_SLOTS"
            :key="s"
            type="button"
            :class="['smb-filter-pill', model.start_slot === s ? 'is-active' : '']"
            @click="model = { ...model, start_slot: s }"
          >{{ SLOT_LABEL[s] }}</button>
        </div>
      </div>
      <div v-if="showTimes" class="slot-time-row">
        <select
          class="input slot-time-input"
          :value="hourValue(model.start_time)"
          @change="model = { ...model, start_time: ($event.target as HTMLSelectElement).value || null }"
        >
          <option value="">— Hour —</option>
          <option v-for="o in hourOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <span class="slot-time-hint">Start time · optional</span>
      </div>
    </div>

    <!-- End -->
    <div style="margin-top:14px">
      <label class="field-label">Hall use · End *</label>
      <div class="slot-row">
        <input
          type="date"
          class="input"
          :value="model.end_date"
          @input="model = { ...model, end_date: ($event.target as HTMLInputElement).value }"
        />
        <div class="slot-toggle">
          <button
            v-for="s in DAY_SLOTS"
            :key="s"
            type="button"
            :class="['smb-filter-pill', model.end_slot === s ? 'is-active' : '']"
            @click="model = { ...model, end_slot: s }"
          >{{ SLOT_LABEL[s] }}</button>
        </div>
      </div>
      <div v-if="showTimes" class="slot-time-row">
        <select
          class="input slot-time-input"
          :value="hourValue(model.end_time)"
          @change="model = { ...model, end_time: ($event.target as HTMLSelectElement).value || null }"
        >
          <option value="">— Hour —</option>
          <option v-for="o in hourOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <span class="slot-time-hint">End time · optional</span>
      </div>
    </div>

    <!-- Status indicator -->
    <div class="slot-avail" style="margin-top:14px">
      <template v-if="availability.state === 'idle'">
        <span class="t-mono" style="color:var(--ash)">
          {{ checkAvailability ? '— Pick a range to check availability' : '— Pick a range' }}
        </span>
      </template>
      <template v-else-if="availability.state === 'checking'">
        <span class="t-mono" style="color:var(--ash)">Checking availability…</span>
      </template>
      <template v-else-if="availability.state === 'invalid'">
        <span class="t-mono" style="color:var(--signal-red)">✗ End must be after start</span>
      </template>
      <template v-else-if="availability.state === 'available'">
        <span class="t-mono" style="color:var(--accent-ink)">
          <template v-if="checkAvailability">✓ Available — </template>
          {{ availability.slots }} slot{{ availability.slots > 1 ? 's' : '' }}
        </span>
      </template>
      <template v-else-if="availability.state === 'conflict'">
        <span class="t-mono" style="color:var(--signal-red)">
          ✗ Conflict — one or more slots in this range are already booked
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.slot-picker { display: block; }

.preset-group-label {
  font: 500 10.5px/1 var(--font-mono, monospace);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ash);
  margin-bottom: 6px;
}

.slot-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}

.slot-toggle {
  display: inline-flex;
  gap: 4px;
}

.slot-time-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.slot-time-input {
  width: auto;
  max-width: 160px;
}
.slot-time-hint {
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.06em;
  color: var(--ash);
  text-transform: uppercase;
}

.slot-avail {
  font: 500 11px/1.4 var(--font-mono);
  letter-spacing: 0.06em;
}

@media (max-width: 480px) {
  .slot-row {
    grid-template-columns: 1fr;
  }
  .slot-toggle { justify-content: stretch; }
  .slot-toggle .smb-filter-pill { flex: 1; text-align: center; }
}
</style>
