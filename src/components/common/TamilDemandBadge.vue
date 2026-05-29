<script setup lang="ts">
import { computed } from 'vue'
import { PAKSHA_LABEL } from '@/lib/utils/tamilCalendar'
import { getDemandForDate, premiumAmount, type DemandHistory, type DemandTier } from '@/lib/utils/tamilDemand'
import { formatCurrency } from '@/lib/utils/currency'

const props = withDefaults(defineProps<{
  dateStr: string | null | undefined
  history?: DemandHistory | null
  rent?: number | null
  variant?: 'card' | 'inline' | 'mini'
}>(), {
  history: null,
  rent: null,
  variant: 'card',
})

const info = computed(() => getDemandForDate(props.dateStr, props.history))

const tierClass = (tier: DemandTier) => `tier-${tier}`

const TIER_SHORT: Record<DemandTier, string> = { peak: 'Peak', high: 'High', normal: 'Normal', low: 'Off-season' }
const tierShort = computed(() => info.value ? TIER_SHORT[info.value.demand.tier] : '')

const premiumText = computed(() => {
  if (!info.value) return ''
  const pct = info.value.demand.premiumPct
  if (pct > 0) return `+${pct}%`
  if (pct < 0) return `${pct}%`
  return 'no premium'
})

const premiumDetail = computed(() => {
  if (!info.value || !props.rent || !info.value.demand.premiumPct) return ''
  const amt = premiumAmount(props.rent, info.value.demand.premiumPct)
  if (!amt) return ''
  const sign = amt > 0 ? '+' : '−'
  const suggested = props.rent + amt
  return `${sign}${formatCurrency(Math.abs(amt))} → ${formatCurrency(suggested)}`
})

const inlineTitle = computed(() => {
  if (!info.value) return ''
  const { demand } = info.value
  return [demand.ruleReason, demand.historyReason].filter(Boolean).join(' ')
})
</script>

<template>
  <template v-if="info">
    <!-- Mini: dot + month + tier, for dense table rows -->
    <span v-if="variant === 'mini'" class="tdb-mini" :title="inlineTitle">
      <span class="tdb-dot" :class="tierClass(info.demand.tier)"></span>
      {{ info.tamil.month.en }} · {{ tierShort }}
    </span>

    <!-- Inline: compact one-liner -->
    <span v-else-if="variant === 'inline'" class="tdb-inline" :title="inlineTitle">
      <span class="tdb-dot" :class="tierClass(info.demand.tier)"></span>
      {{ info.tamil.month.en }} · {{ PAKSHA_LABEL[info.tamil.paksha].short }}
      <span class="tdb-inline-tier" :class="tierClass(info.demand.tier)">{{ info.demand.label }}</span>
      <span v-if="info.demand.premiumPct !== 0" class="tdb-inline-prem">{{ premiumText }}</span>
    </span>

    <!-- Card: full advisory panel -->
    <div v-else class="tdb-card">
      <div class="tdb-head">
        <div>
          <div class="t-eyebrow" style="margin-bottom:6px">Tamil calendar</div>
          <div class="tdb-month">
            {{ info.tamil.month.en }}
            <span class="tdb-month-ta">{{ info.tamil.month.ta }}</span>
          </div>
          <div class="tdb-paksha">{{ PAKSHA_LABEL[info.tamil.paksha].en }} · {{ PAKSHA_LABEL[info.tamil.paksha].ta }}</div>
        </div>
        <span class="tdb-tier" :class="tierClass(info.demand.tier)">{{ info.demand.label }}</span>
      </div>

      <div class="tdb-premium">
        <span class="t-eyebrow">Suggested premium</span>
        <span class="tdb-premium-val" :class="tierClass(info.demand.tier)">{{ premiumText }}</span>
        <span v-if="premiumDetail" class="tdb-premium-detail">{{ premiumDetail }}</span>
      </div>

      <p class="tdb-reason">{{ info.demand.ruleReason }}</p>
      <p v-if="info.demand.historyReason" class="tdb-reason tdb-reason-history">{{ info.demand.historyReason }}</p>

      <p class="tdb-advisory">Advisory only — the rent you enter is never changed automatically.</p>
    </div>
  </template>
</template>

<style scoped>
/* ── tier colours ─────────────────────────────────────────── */
.tier-peak   { --tier: var(--accent-ink, #b5651d); }
.tier-high   { --tier: var(--accent-ink, #b5651d); }
.tier-normal { --tier: var(--ash, #888); }
.tier-low    { --tier: var(--signal-red, #c0392b); }

/* ── card ─────────────────────────────────────────────────── */
.tdb-card {
  border: 1px solid var(--hair);
  border-left: 3px solid var(--accent, #b5651d);
  border-radius: 8px;
  padding: 16px 18px;
  background: var(--paper-2, rgba(0,0,0,0.015));
}
.tdb-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.tdb-month {
  font: 600 1.25rem/1 var(--font-display, serif);
  letter-spacing: -0.01em;
  color: var(--ink);
}
.tdb-month-ta {
  font-size: 0.95rem;
  color: var(--ash);
  margin-left: 8px;
  font-weight: 400;
}
.tdb-paksha {
  margin-top: 6px;
  font: 500 12px/1.3 var(--font-mono, monospace);
  color: var(--ash);
  letter-spacing: 0.03em;
}
.tdb-tier {
  flex-shrink: 0;
  font: 600 10px/1 var(--font-mono, monospace);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--tier);
  color: var(--tier);
  white-space: nowrap;
}
.tdb-tier.tier-peak { background: var(--accent-soft, rgba(181,101,29,0.12)); }

.tdb-premium {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--hair);
}
.tdb-premium-val {
  font: 600 1.4rem/1 var(--font-display, serif);
  font-variant-numeric: tabular-nums;
  color: var(--tier);
}
.tdb-premium-detail {
  font: 500 12px/1 var(--font-mono, monospace);
  color: var(--ash);
}
.tdb-reason {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink);
}
.tdb-reason-history { color: var(--ash); }
.tdb-advisory {
  margin: 12px 0 0;
  font: 500 11px/1.4 var(--font-mono, monospace);
  color: var(--ash);
  letter-spacing: 0.02em;
}

/* ── mini (table rows) ────────────────────────────────────── */
.tdb-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: 500 11px/1.2 var(--font-mono, monospace);
  letter-spacing: 0.02em;
  color: var(--ash, #888);
  white-space: nowrap;
}

/* ── inline ───────────────────────────────────────────────── */
.tdb-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font: 500 12px/1.3 var(--font-mono, monospace);
  letter-spacing: 0.03em;
  color: var(--ash);
  flex-wrap: wrap;
}
.tdb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tier);
  flex-shrink: 0;
}
.tdb-inline-tier {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--tier);
}
.tdb-inline-prem {
  color: var(--tier);
  font-weight: 600;
}
</style>
