import { describe, it, expect } from 'vitest'
import {
  compareSlots,
  expandSlots,
  isFullDay,
  formatRange,
  slotCount,
  getRangeStatus,
} from '@/lib/utils/slots'

describe('compareSlots', () => {
  it('orders by date first', () => {
    expect(compareSlots({ date: '2026-05-01', slot: 'morning' }, { date: '2026-05-02', slot: 'morning' })).toBeLessThan(0)
  })
  it('orders morning before evening on same day', () => {
    expect(compareSlots({ date: '2026-05-01', slot: 'morning' }, { date: '2026-05-01', slot: 'evening' })).toBeLessThan(0)
  })
  it('orders morning < afternoon < evening', () => {
    expect(compareSlots({ date: '2026-05-01', slot: 'morning' }, { date: '2026-05-01', slot: 'afternoon' })).toBeLessThan(0)
    expect(compareSlots({ date: '2026-05-01', slot: 'afternoon' }, { date: '2026-05-01', slot: 'evening' })).toBeLessThan(0)
  })
  it('returns 0 for identical slot', () => {
    expect(compareSlots({ date: '2026-05-01', slot: 'morning' }, { date: '2026-05-01', slot: 'morning' })).toBe(0)
  })
})

describe('expandSlots', () => {
  it('single-slot range yields one slot', () => {
    expect(expandSlots('2026-05-01', 'morning', '2026-05-01', 'morning')).toEqual([
      { date: '2026-05-01', slot: 'morning' },
    ])
  })
  it('afternoon-only range yields one slot', () => {
    expect(expandSlots('2026-05-01', 'afternoon', '2026-05-01', 'afternoon')).toEqual([
      { date: '2026-05-01', slot: 'afternoon' },
    ])
  })
  it('full single day yields morning + afternoon + evening', () => {
    expect(expandSlots('2026-05-01', 'morning', '2026-05-01', 'evening')).toEqual([
      { date: '2026-05-01', slot: 'morning' },
      { date: '2026-05-01', slot: 'afternoon' },
      { date: '2026-05-01', slot: 'evening' },
    ])
  })
  it('morning→afternoon yields the two leading slots (no evening)', () => {
    expect(expandSlots('2026-05-01', 'morning', '2026-05-01', 'afternoon')).toEqual([
      { date: '2026-05-01', slot: 'morning' },
      { date: '2026-05-01', slot: 'afternoon' },
    ])
  })
  it('cross-day evening→morning skips the afternoon of both days', () => {
    const out = expandSlots('2026-05-01', 'evening', '2026-05-02', 'morning')
    expect(out).toEqual([
      { date: '2026-05-01', slot: 'evening' },
      { date: '2026-05-02', slot: 'morning' },
    ])
  })
  it('returns empty when end is before start', () => {
    expect(expandSlots('2026-05-02', 'morning', '2026-05-01', 'evening')).toEqual([])
  })
  it('returns empty when start = end but slot ordering inverted', () => {
    expect(expandSlots('2026-05-01', 'evening', '2026-05-01', 'morning')).toEqual([])
  })
  it('two-day full block yields 6 slots', () => {
    const out = expandSlots('2026-05-01', 'morning', '2026-05-02', 'evening')
    expect(out).toHaveLength(6)
  })
})

describe('isFullDay', () => {
  it('true for morning→evening same day', () => {
    expect(isFullDay({ start_date: '2026-05-01', start_slot: 'morning', end_date: '2026-05-01', end_slot: 'evening' })).toBe(true)
  })
  it('false for half day', () => {
    expect(isFullDay({ start_date: '2026-05-01', start_slot: 'morning', end_date: '2026-05-01', end_slot: 'morning' })).toBe(false)
  })
  it('false for multi-day', () => {
    expect(isFullDay({ start_date: '2026-05-01', start_slot: 'morning', end_date: '2026-05-02', end_slot: 'evening' })).toBe(false)
  })
})

describe('formatRange', () => {
  it('full day rendering', () => {
    expect(formatRange({ start_date: '2026-05-01', start_slot: 'morning', end_date: '2026-05-01', end_slot: 'evening' })).toMatch(/Full day/)
  })
  it('half-day rendering', () => {
    expect(formatRange({ start_date: '2026-05-01', start_slot: 'morning', end_date: '2026-05-01', end_slot: 'morning' })).toMatch(/Morning/)
  })
  it('cross-day rendering shows both dates', () => {
    const s = formatRange({ start_date: '2026-05-01', start_slot: 'evening', end_date: '2026-05-02', end_slot: 'morning' })
    expect(s).toMatch(/01 May/)
    expect(s).toMatch(/02 May/)
  })
})

describe('slotCount', () => {
  it('full day = 3 slots', () => {
    expect(slotCount({ start_date: '2026-05-01', start_slot: 'morning', end_date: '2026-05-01', end_slot: 'evening' })).toBe(3)
  })
  it('afternoon only = 1 slot', () => {
    expect(slotCount({ start_date: '2026-05-01', start_slot: 'afternoon', end_date: '2026-05-01', end_slot: 'afternoon' })).toBe(1)
  })
  it('three-day morn→eve = 9 slots', () => {
    expect(slotCount({ start_date: '2026-05-01', start_slot: 'morning', end_date: '2026-05-03', end_slot: 'evening' })).toBe(9)
  })
})

describe('getRangeStatus', () => {
  const today = new Date(2026, 4, 15) // 15 May 2026 local
  it('cancelled overrides date logic', () => {
    expect(getRangeStatus({ start_date: '2026-05-20', end_date: '2026-05-21', status: 'cancelled' }, today)).toBe('cancelled')
  })
  it('upcoming when start is in future', () => {
    expect(getRangeStatus({ start_date: '2026-05-20', end_date: '2026-05-21', status: 'upcoming' }, today)).toBe('upcoming')
  })
  it('completed when end is in past', () => {
    expect(getRangeStatus({ start_date: '2026-05-10', end_date: '2026-05-11', status: 'upcoming' }, today)).toBe('completed')
  })
  it('ongoing when today is within range', () => {
    expect(getRangeStatus({ start_date: '2026-05-14', end_date: '2026-05-16', status: 'upcoming' }, today)).toBe('ongoing')
  })
  it('ongoing on the exact start date', () => {
    expect(getRangeStatus({ start_date: '2026-05-15', end_date: '2026-05-15', status: 'upcoming' }, today)).toBe('ongoing')
  })
})
