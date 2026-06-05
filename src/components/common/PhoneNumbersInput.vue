<script setup lang="ts">
import { computed } from 'vue'
import { MAX_PHONES, digitsOnly, isValidPhone } from '@/lib/utils/phones'

// Edits an ordered list of contact numbers (index 0 = primary). The parent
// owns the array; on save it splits primary vs. extras via splitPhones().
// Always renders at least one row so there's somewhere to type.
const props = withDefaults(defineProps<{
  modelValue: string[]
  requireFirst?: boolean
}>(), {
  requireFirst: false,
})

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const rows = computed(() => (props.modelValue.length ? props.modelValue : ['']))

function update(i: number, raw: string) {
  // Keep only digits and cap at 10 so the field can't hold an invalid number.
  const next = rows.value.slice()
  next[i] = digitsOnly(raw).slice(0, 10)
  emit('update:modelValue', next)
}

function add() {
  if (rows.value.length >= MAX_PHONES) return
  emit('update:modelValue', [...rows.value, ''])
}

function remove(i: number) {
  const next = rows.value.slice()
  next.splice(i, 1)
  emit('update:modelValue', next.length ? next : [''])
}

function invalid(value: string): boolean {
  return value.length > 0 && !isValidPhone(value)
}

const canAdd = computed(() => rows.value.length < MAX_PHONES)
</script>

<template>
  <div>
    <label class="field-label">
      Mobile {{ rows.length > 1 ? 'numbers' : 'number' }}<span v-if="requireFirst"> *</span>
      <span style="color:var(--ash);font-weight:400"> · up to {{ MAX_PHONES }}, 10 digits each</span>
    </label>
    <div class="phone-rows">
      <div v-for="(num, i) in rows" :key="i" class="phone-row">
        <input
          class="input"
          :value="num"
          @input="update(i, ($event.target as HTMLInputElement).value)"
          type="tel"
          inputmode="numeric"
          maxlength="10"
          autocomplete="off"
          :class="{ 'phone-bad': invalid(num) }"
          :placeholder="i === 0 ? '10-digit mobile' : 'Additional number'"
          :required="requireFirst && i === 0"
        />
        <button
          v-if="rows.length > 1"
          type="button"
          class="smb-nav-iconbtn"
          @click="remove(i)"
          :title="`Remove number ${i + 1}`"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
        </button>
      </div>
    </div>
    <button v-if="canAdd" type="button" class="smb-filter-pill phone-add" @click="add">+ Add another number</button>
  </div>
</template>

<style scoped>
.phone-rows { display: flex; flex-direction: column; gap: 8px; }
.phone-row { display: flex; align-items: center; gap: 8px; }
.phone-row .input { flex: 1; min-width: 0; }
.phone-bad { border-color: var(--signal-red, #c0392b) !important; }
.phone-add { margin-top: 8px; align-self: flex-start; }
</style>
