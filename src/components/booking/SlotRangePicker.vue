<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { addDays, format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { DaySlot } from '@/types/enums'
import { SLOT_LABEL, compareSlots, slotCount } from '@/lib/utils/slots'

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

// <input type="time"> wants "HH:MM"; Postgres TIME may come back as "HH:MM:SS"
function timeInputValue(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
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

function applyPreset(kind: 'full' | 'eve-morn' | 'morn-morn' | 'eve-eve') {
  const f = model.value.function_date
  if (!f) return
  if (kind === 'full') {
    model.value = { ...model.value, start_date: f, start_slot: 'morning', end_date: f, end_slot: 'evening' }
  } else if (kind === 'eve-morn') {
    model.value = { ...model.value, start_date: shiftDate(f, -1), start_slot: 'evening', end_date: f, end_slot: 'morning' }
  } else if (kind === 'morn-morn') {
    model.value = { ...model.value, start_date: shiftDate(f, -1), start_slot: 'morning', end_date: f, end_slot: 'morning' }
  } else if (kind === 'eve-eve') {
    model.value = { ...model.value, start_date: shiftDate(f, -1), start_slot: 'evening', end_date: f, end_slot: 'evening' }
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
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="smb-filter-pill" @click="applyPreset('full')">Full day</button>
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
            type="button"
            :class="['smb-filter-pill', model.start_slot === 'morning' ? 'is-active' : '']"
            @click="model = { ...model, start_slot: 'morning' }"
          >{{ SLOT_LABEL.morning }}</button>
          <button
            type="button"
            :class="['smb-filter-pill', model.start_slot === 'evening' ? 'is-active' : '']"
            @click="model = { ...model, start_slot: 'evening' }"
          >{{ SLOT_LABEL.evening }}</button>
        </div>
      </div>
      <div v-if="showTimes" class="slot-time-row">
        <input
          type="time"
          class="input slot-time-input"
          :value="timeInputValue(model.start_time)"
          @input="model = { ...model, start_time: ($event.target as HTMLInputElement).value || null }"
        />
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
            type="button"
            :class="['smb-filter-pill', model.end_slot === 'morning' ? 'is-active' : '']"
            @click="model = { ...model, end_slot: 'morning' }"
          >{{ SLOT_LABEL.morning }}</button>
          <button
            type="button"
            :class="['smb-filter-pill', model.end_slot === 'evening' ? 'is-active' : '']"
            @click="model = { ...model, end_slot: 'evening' }"
          >{{ SLOT_LABEL.evening }}</button>
        </div>
      </div>
      <div v-if="showTimes" class="slot-time-row">
        <input
          type="time"
          class="input slot-time-input"
          :value="timeInputValue(model.end_time)"
          @input="model = { ...model, end_time: ($event.target as HTMLInputElement).value || null }"
        />
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
