<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { formatCurrency } from '@/lib/utils/currency'
import { dueLabel } from '@/lib/utils/forecast'
import type { BookingAdvanceForecast } from '@/types/database'

const props = withDefaults(defineProps<{
  rows: BookingAdvanceForecast[]
  title: string
  align?: 'left' | 'right'
  emptyText?: string
}>(), {
  align: 'left',
  emptyText: 'Nothing owing here.',
})

const emit = defineEmits<{ (e: 'select', id: string): void }>()

const open = ref(false)
const pinned = ref(false)
const wrapEl = ref<HTMLElement | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | null = null

function show() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  open.value = true
}
function scheduleHide() {
  if (pinned.value) return
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { open.value = false }, 140)
}
function togglePin() {
  pinned.value = !pinned.value
  open.value = pinned.value
}
function close() {
  open.value = false
  pinned.value = false
}

function onDocPointerDown(e: PointerEvent) {
  if (!wrapEl.value) return
  if (!wrapEl.value.contains(e.target as Node)) close()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
  if (hideTimer) clearTimeout(hideTimer)
})

// Sorted: overdue / soonest due first, no-date last
const sortedRows = computed(() =>
  [...props.rows].sort((a, b) => {
    const ad = a.advance_due_date ?? '9999-12-31'
    const bd = b.advance_due_date ?? '9999-12-31'
    return ad < bd ? -1 : ad > bd ? 1 : 0
  })
)
const totalOwed = computed(() =>
  props.rows.reduce((s, r) => s + Number(r.advance_owed), 0)
)
const interactive = computed(() => props.rows.length > 0)

function telHref(phone: string | null): string | null {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}
function waHref(phone: string | null): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 10) digits = '91' + digits // assume India if no country code
  return digits ? `https://wa.me/${digits}` : null
}
function fmtAmt(n: number) {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (Math.abs(n) >= 1000)   return `₹${Math.round(n / 1000)}K`
  return `₹${Math.round(n)}`
}
</script>

<template>
  <div
    ref="wrapEl"
    class="fc-pop-wrap"
    @mouseenter="interactive && show()"
    @mouseleave="scheduleHide"
  >
    <div
      class="fc-pop-trigger"
      :class="{ 'is-interactive': interactive }"
      :tabindex="interactive ? 0 : -1"
      :aria-expanded="open"
      @click="interactive && togglePin()"
      @focus="interactive && show()"
      @blur="scheduleHide"
    >
      <slot />
    </div>

    <transition name="fc-pop-fade">
      <div
        v-if="open && interactive"
        class="fc-pop"
        :class="align === 'right' ? 'fc-pop-right' : 'fc-pop-left'"
        role="dialog"
      >
        <div class="fc-pop-head">
          <span class="fc-pop-title">{{ title }}</span>
          <span class="fc-pop-sum">{{ formatCurrency(totalOwed) }} · {{ rows.length }}</span>
        </div>

        <div class="fc-pop-list">
          <div
            v-for="r in sortedRows"
            :key="r.id"
            class="fc-pop-row"
            @click="emit('select', r.id)"
          >
            <div class="fc-pop-row-top">
              <span class="fc-pop-name">{{ r.customer_name }}</span>
              <span class="fc-pop-amt">{{ fmtAmt(Number(r.advance_owed)) }}</span>
            </div>
            <div class="fc-pop-row-bot">
              <span class="fc-pop-contact">
                <template v-if="r.customer_phone">
                  <a
                    v-if="telHref(r.customer_phone)"
                    :href="telHref(r.customer_phone)!"
                    class="fc-pop-link"
                    @click.stop
                  >{{ r.customer_phone }}</a>
                  <span v-else>{{ r.customer_phone }}</span>
                  <a
                    v-if="waHref(r.customer_phone)"
                    :href="waHref(r.customer_phone)!"
                    target="_blank"
                    rel="noopener"
                    class="fc-pop-wa"
                    @click.stop
                    title="Open WhatsApp"
                  >wa</a>
                </template>
                <span v-else class="fc-pop-nophone">no phone</span>
              </span>
              <span
                class="fc-pop-due"
                :class="{ 'is-overdue': (r.advance_due_date && new Date(r.advance_due_date) < new Date(new Date().toDateString())) }"
              >{{ dueLabel(r.advance_due_date) }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.fc-pop-wrap { position: relative; }
.fc-pop-trigger { outline: none; border-radius: 6px; }
.fc-pop-trigger.is-interactive { cursor: pointer; }
.fc-pop-trigger.is-interactive:hover { /* leave visual to the cell itself */ }
.fc-pop-trigger:focus-visible { box-shadow: 0 0 0 2px var(--accent, #b5651d); }

.fc-pop {
  position: absolute;
  top: calc(100% + 10px);
  z-index: 50;
  width: 300px;
  max-width: min(86vw, 340px);
  background: var(--paper, #fff);
  border: 1px solid var(--ash-2, #c8c2b8);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  padding: 12px 0 4px;
}
.fc-pop-left  { left: 0; }
.fc-pop-right { right: 0; }

/* Little pointer */
.fc-pop::before {
  content: "";
  position: absolute;
  top: -6px;
  width: 10px;
  height: 10px;
  background: var(--paper, #fff);
  border-left: 1px solid var(--ash-2, #c8c2b8);
  border-top: 1px solid var(--ash-2, #c8c2b8);
  transform: rotate(45deg);
}
.fc-pop-left::before  { left: 22px; }
.fc-pop-right::before { right: 22px; }

.fc-pop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px 10px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--hair, #eee);
}
.fc-pop-title {
  font: 500 10px/1 var(--font-mono, monospace);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ash, #888);
}
.fc-pop-sum {
  font: 600 12px/1 var(--font-display, sans-serif);
  font-variant-numeric: tabular-nums;
  color: var(--accent-ink, #b5651d);
}

.fc-pop-list {
  max-height: 280px;
  overflow-y: auto;
}
.fc-pop-row {
  padding: 9px 14px;
  border-bottom: 1px solid var(--hair, #f0f0f0);
  cursor: pointer;
  transition: background-color 110ms ease;
}
.fc-pop-row:last-child { border-bottom: none; }
.fc-pop-row:hover { background: var(--paper-2, rgba(0,0,0,0.03)); }
.fc-pop-row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.fc-pop-name {
  font-weight: 600;
  font-size: 13.5px;
  color: var(--ink, #1a1a1a);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fc-pop-amt {
  font: 600 13px/1 var(--font-display, sans-serif);
  font-variant-numeric: tabular-nums;
  color: var(--ink, #1a1a1a);
  flex-shrink: 0;
}
.fc-pop-row-bot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
.fc-pop-contact {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.fc-pop-link {
  font: 500 12px/1 var(--font-mono, monospace);
  color: var(--accent-ink, #b5651d);
  text-decoration: none;
  white-space: nowrap;
}
.fc-pop-link:hover { text-decoration: underline; }
.fc-pop-wa {
  font: 600 9px/1 var(--font-mono, monospace);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #1a8a4a;
  border: 1px solid #1a8a4a;
  border-radius: 999px;
  padding: 2px 6px;
  text-decoration: none;
  flex-shrink: 0;
}
.fc-pop-wa:hover { background: rgba(26,138,74,0.1); }
.fc-pop-nophone {
  font: 500 11px/1 var(--font-mono, monospace);
  color: var(--ash, #aaa);
  font-style: italic;
}
.fc-pop-due {
  font: 500 10px/1 var(--font-mono, monospace);
  letter-spacing: 0.04em;
  color: var(--ash, #888);
  white-space: nowrap;
  flex-shrink: 0;
}
.fc-pop-due.is-overdue { color: var(--signal-red, #c0392b); }

.fc-pop-fade-enter-active, .fc-pop-fade-leave-active {
  transition: opacity 130ms ease, transform 130ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.fc-pop-fade-enter-from, .fc-pop-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 640px) {
  /* Bottom-sheet on phones so it can never overflow the viewport */
  .fc-pop {
    position: fixed;
    left: 12px;
    right: 12px;
    top: auto;
    bottom: 12px;
    width: auto;
    max-width: none;
    max-height: 70vh;
    overflow-y: auto;
  }
  .fc-pop::before { display: none; }
}
</style>
