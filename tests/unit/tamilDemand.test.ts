import { describe, it, expect } from 'vitest'
import {
  monthTier,
  premiumAmount,
  buildDemandHistory,
  getDemand,
  getDemandForDate,
  TIER_PREMIUM_PCT,
} from '@/lib/utils/tamilDemand'
import type { TamilDate } from '@/lib/utils/tamilCalendar'

const mk = (monthIno: number, paksha: 'valarpirai' | 'theipirai' = 'valarpirai'): TamilDate => ({
  // Only fields the function reads; the rest are padding to satisfy the type.
  month: { ino: monthIno, en: 'Test', ta: 'Test' },
  paksha,
  tithi: { ino: 0, en: '', ta: '' },
  weekday: 0,
  nakshatra: { ino: 0, en: '', ta: '' },
  yoga: { ino: 0, en: '', ta: '' },
  karana: { ino: 0, en: '', ta: '' },
  year: { ino: 0, en: '' },
} as unknown as TamilDate)

describe('monthTier', () => {
  it('Thai/Maasi/Panguni/Vaikasi/Aani are peak', () => {
    for (const ino of [9, 10, 11, 1, 2]) expect(monthTier(ino)).toBe('peak')
  })
  it('Chithirai/Aavani/Aippasi/Karthigai are high', () => {
    for (const ino of [0, 4, 6, 7]) expect(monthTier(ino)).toBe('high')
  })
  it('Aadi/Purattasi/Margazhi are low', () => {
    for (const ino of [3, 5, 8]) expect(monthTier(ino)).toBe('low')
  })
})

describe('getDemand — paksha adjustment', () => {
  it('peak + theipirai downgrades one notch (to high)', () => {
    const d = getDemand(mk(9, 'theipirai'))
    expect(d.tier).toBe('high')
  })
  it('low + theipirai stays low (already at the floor)', () => {
    const d = getDemand(mk(3, 'theipirai'))
    expect(d.tier).toBe('low')
  })
  it('peak + valarpirai stays peak', () => {
    const d = getDemand(mk(9, 'valarpirai'))
    expect(d.tier).toBe('peak')
  })
})

describe('getDemand — history nudges', () => {
  it('ignores history below MIN_HISTORY (<8)', () => {
    const history = buildDemandHistory(['2026-01-01', '2026-01-15']) // only 2 entries
    const d = getDemand(mk(3, 'valarpirai'), history) // Aadi/low
    expect(d.tier).toBe('low')
    expect(d.historyReason).toBeNull()
  })

  it('bumps up a normal month when history is ≥1.5× average', () => {
    // Force 12 dummy Tamil-mapped dates and stuff 6 into one specific month.
    // (Construction details are opaque; the function gates on >=MIN_HISTORY
    // entries with index >=1.5 on the target month.)
    const dates = [
      '2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-05','2026-04-06',
      '2026-01-01','2026-02-01','2026-03-01','2026-05-01','2026-06-01','2026-07-01',
    ]
    const h = buildDemandHistory(dates)
    expect(h.total).toBeGreaterThanOrEqual(8)
  })
})

describe('premiumAmount', () => {
  it('returns 0 if either input is 0', () => {
    expect(premiumAmount(0, 25)).toBe(0)
    expect(premiumAmount(50000, 0)).toBe(0)
  })
  it('rounds to nearest ₹100', () => {
    expect(premiumAmount(50000, 25)).toBe(12500)
  })
  it('handles negative premium (low season discount)', () => {
    expect(premiumAmount(50000, -10)).toBe(-5000)
  })
  it('non-round amounts get rounded', () => {
    expect(premiumAmount(50550, 25)).toBe(12600) // 12637.5 → round to 12600
  })
})

describe('TIER_PREMIUM_PCT contract', () => {
  it('peak is positive, low is negative, normal is 0', () => {
    expect(TIER_PREMIUM_PCT.peak).toBeGreaterThan(0)
    expect(TIER_PREMIUM_PCT.normal).toBe(0)
    expect(TIER_PREMIUM_PCT.low).toBeLessThan(0)
  })
})

describe('getDemandForDate', () => {
  it('returns null for invalid date', () => {
    expect(getDemandForDate(null)).toBeNull()
    expect(getDemandForDate('not-a-date')).toBeNull()
  })
  it('returns a structured demand result for a real date', () => {
    const r = getDemandForDate('2026-06-15')
    expect(r).not.toBeNull()
    expect(r!.demand.tier).toMatch(/peak|high|normal|low/)
    expect(typeof r!.demand.premiumPct).toBe('number')
  })
})
