import { getTamilDate, type TamilDate } from './tamilCalendar'

// ──────────────────────────────────────────────────────────────
// Demand tiers
// ──────────────────────────────────────────────────────────────

export type DemandTier = 'peak' | 'high' | 'normal' | 'low'

const TIER_ORDER: DemandTier[] = ['low', 'normal', 'high', 'peak']

export const TIER_LABEL: Record<DemandTier, string> = {
  peak: 'Peak demand',
  high: 'High demand',
  normal: 'Normal demand',
  low: 'Off-season',
}

// Advisory premium on top of the base rent (negative = suggest a discount).
export const TIER_PREMIUM_PCT: Record<DemandTier, number> = {
  peak: 25,
  high: 12,
  normal: 0,
  low: -10,
}

function upgrade(t: DemandTier): DemandTier {
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(t) + 1, TIER_ORDER.length - 1)]!
}
function downgrade(t: DemandTier): DemandTier {
  return TIER_ORDER[Math.max(TIER_ORDER.indexOf(t) - 1, 0)]!
}

// ──────────────────────────────────────────────────────────────
// Rule-based demand from the Tamil calendar
// ──────────────────────────────────────────────────────────────

// month ino: 0 Chithirai, 1 Vaikasi, 2 Aani, 3 Aadi, 4 Aavani, 5 Purattasi,
//            6 Aippasi, 7 Karthigai, 8 Margazhi, 9 Thai, 10 Maasi, 11 Panguni
const PEAK_MONTHS = new Set([9, 10, 11, 1, 2]) // Thai, Maasi, Panguni, Vaikasi, Aani
const HIGH_MONTHS = new Set([0, 4, 6, 7])      // Chithirai, Aavani, Aippasi, Karthigai
const LOW_MONTHS  = new Set([3, 5, 8])         // Aadi, Purattasi, Margazhi

function ruleTier(monthIno: number): DemandTier {
  if (PEAK_MONTHS.has(monthIno)) return 'peak'
  if (HIGH_MONTHS.has(monthIno)) return 'high'
  if (LOW_MONTHS.has(monthIno)) return 'low'
  return 'normal'
}

/** Month-level demand tier (paksha-agnostic) — for season outlooks. */
export function monthTier(monthIno: number): DemandTier {
  return ruleTier(monthIno)
}

function ruleReason(t: TamilDate): string {
  let base: string
  if (PEAK_MONTHS.has(t.month.ino)) base = `${t.month.en} is peak wedding season.`
  else if (HIGH_MONTHS.has(t.month.ino)) base = `${t.month.en} is a favourable month for functions.`
  else if (LOW_MONTHS.has(t.month.ino)) base = `${t.month.en} is traditionally avoided for weddings.`
  else base = `${t.month.en} sees ordinary demand.`

  const paksha = t.paksha === 'valarpirai'
    ? ' Valarpirai (waxing moon) is auspicious — most muhurtams fall here.'
    : ' Theipirai (waning moon) is usually avoided, so demand softens.'
  return base + paksha
}

// ──────────────────────────────────────────────────────────────
// Booking-history signal
// ──────────────────────────────────────────────────────────────

export interface DemandHistory {
  countByMonth: Record<number, number> // Tamil month ino → booking count
  total: number
}

/** Build a per-Tamil-month booking-count index from past function dates. */
export function buildDemandHistory(functionDates: (string | null | undefined)[]): DemandHistory {
  const countByMonth: Record<number, number> = {}
  let total = 0
  for (const d of functionDates) {
    const t = getTamilDate(d)
    if (!t) continue
    countByMonth[t.month.ino] = (countByMonth[t.month.ino] ?? 0) + 1
    total++
  }
  return { countByMonth, total }
}

// Need a reasonable sample before the history signal is trusted.
const MIN_HISTORY = 8

// ──────────────────────────────────────────────────────────────
// Combined demand
// ──────────────────────────────────────────────────────────────

export interface DemandResult {
  tier: DemandTier
  label: string
  premiumPct: number
  ruleReason: string
  historyReason: string | null
}

/**
 * Combine the cultural rules with the operator's own booking history.
 * Rules set the base tier (adjusted for paksha); history can nudge it one
 * notch up (a month that books unusually well) or down (a "good" month that
 * historically underperforms for this hall).
 */
export function getDemand(t: TamilDate, history?: DemandHistory | null): DemandResult {
  let tier = ruleTier(t.month.ino)
  if (t.paksha === 'theipirai') tier = downgrade(tier)

  let historyReason: string | null = null
  if (history && history.total >= MIN_HISTORY) {
    const avg = history.total / 12
    const count = history.countByMonth[t.month.ino] ?? 0
    const index = avg > 0 ? count / avg : 0
    if (index >= 1.5) {
      tier = upgrade(tier)
      historyReason = `Your records: ${count} booking${count === 1 ? '' : 's'} in ${t.month.en} — well above your monthly average, so demand is bumped up.`
    } else if (index <= 0.5 && (tier === 'peak' || tier === 'high')) {
      tier = downgrade(tier)
      historyReason = `Your records: only ${count} booking${count === 1 ? '' : 's'} in ${t.month.en} historically — eased down a notch.`
    } else {
      historyReason = `Your records: ${count} booking${count === 1 ? '' : 's'} in ${t.month.en} so far.`
    }
  }

  return {
    tier,
    label: TIER_LABEL[tier],
    premiumPct: TIER_PREMIUM_PCT[tier],
    ruleReason: ruleReason(t),
    historyReason,
  }
}

/** Convenience: demand straight from a civil date string. */
export function getDemandForDate(dateStr: string | null | undefined, history?: DemandHistory | null): { tamil: TamilDate; demand: DemandResult } | null {
  const tamil = getTamilDate(dateStr)
  if (!tamil) return null
  return { tamil, demand: getDemand(tamil, history) }
}

/** Suggested premium amount on a base rent (rounded to ₹100). */
export function premiumAmount(rent: number, premiumPct: number): number {
  if (!rent || !premiumPct) return 0
  return Math.round((rent * premiumPct) / 100 / 100) * 100
}
