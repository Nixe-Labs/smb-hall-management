import { describe, it, expect } from 'vitest'
import {
  bucketFor,
  defaultDueDate,
  dueInDays,
  dueLabel,
  summarize,
  emptyForecastTotals,
} from '@/lib/utils/forecast'
import type { BookingAdvanceForecast } from '@/types/database'

const today = new Date(2026, 4, 15) // 15 May 2026 local — fixed clock for all tests

describe('defaultDueDate', () => {
  it('defaults to 30 days before function', () => {
    expect(defaultDueDate('2026-06-15')).toBe('2026-05-16')
  })
  it('respects custom lead days', () => {
    expect(defaultDueDate('2026-06-15', 60)).toBe('2026-04-16')
  })
})

describe('bucketFor — rolling mode', () => {
  it('returns null when expected is null', () => {
    expect(bucketFor({ due_date: '2026-05-20', expected: null, owed: 5000 }, 'rolling', today)).toBeNull()
  })
  it('returns paid when nothing owed', () => {
    expect(bucketFor({ due_date: '2026-05-20', expected: 10000, owed: 0 }, 'rolling', today)).toBe('paid')
  })
  it('returns later when due_date is null', () => {
    expect(bucketFor({ due_date: null, expected: 10000, owed: 5000 }, 'rolling', today)).toBe('later')
  })
  it('overdue when due is in the past', () => {
    expect(bucketFor({ due_date: '2026-05-10', expected: 10000, owed: 5000 }, 'rolling', today)).toBe('overdue')
  })
  it('this_week boundary — exactly 7 days', () => {
    expect(bucketFor({ due_date: '2026-05-22', expected: 10000, owed: 5000 }, 'rolling', today)).toBe('this_week')
  })
  it('this_month boundary — 8 days', () => {
    expect(bucketFor({ due_date: '2026-05-23', expected: 10000, owed: 5000 }, 'rolling', today)).toBe('this_month')
  })
  it('this_year boundary — 31 days', () => {
    expect(bucketFor({ due_date: '2026-06-15', expected: 10000, owed: 5000 }, 'rolling', today)).toBe('this_year')
  })
  it('later — beyond 365 days', () => {
    expect(bucketFor({ due_date: '2027-06-15', expected: 10000, owed: 5000 }, 'rolling', today)).toBe('later')
  })
  it('today (0 days) counts as this_week', () => {
    expect(bucketFor({ due_date: '2026-05-15', expected: 10000, owed: 5000 }, 'rolling', today)).toBe('this_week')
  })
})

describe('bucketFor — calendar mode', () => {
  it('groups by current calendar week (future end of week)', () => {
    // Sun-aligned week of 15 May 2026 (Fri) = 10..16 May
    // Past dates within the same week are classified as 'overdue', not
    // 'this_week' — the overdue check fires before the calendar branch.
    // See BUG_REPORT.md for the UX question this raises.
    expect(bucketFor({ due_date: '2026-05-16', expected: 10000, owed: 5000 }, 'calendar', today)).toBe('this_week')
  })
  it('overdue takes precedence over calendar-week grouping', () => {
    expect(bucketFor({ due_date: '2026-05-12', expected: 10000, owed: 5000 }, 'calendar', today)).toBe('overdue')
  })
  it('groups by current calendar month', () => {
    expect(bucketFor({ due_date: '2026-05-30', expected: 10000, owed: 5000 }, 'calendar', today)).toBe('this_month')
  })
  it('groups by current calendar year', () => {
    expect(bucketFor({ due_date: '2026-11-30', expected: 10000, owed: 5000 }, 'calendar', today)).toBe('this_year')
  })
  it('later when beyond current year', () => {
    expect(bucketFor({ due_date: '2027-01-15', expected: 10000, owed: 5000 }, 'calendar', today)).toBe('later')
  })
})

describe('dueInDays / dueLabel', () => {
  it('returns null for missing due date', () => {
    expect(dueInDays(null, today)).toBeNull()
    expect(dueLabel(null, today)).toBe('—')
  })
  it('handles negative (overdue)', () => {
    expect(dueInDays('2026-05-10', today)).toBe(-5)
    expect(dueLabel('2026-05-10', today)).toBe('5d overdue')
  })
  it('renders "due today"', () => {
    expect(dueLabel('2026-05-15', today)).toBe('due today')
  })
  it('renders "due tomorrow"', () => {
    expect(dueLabel('2026-05-16', today)).toBe('due tomorrow')
  })
  it('renders "due in N d"', () => {
    expect(dueLabel('2026-05-20', today)).toBe('due in 5d')
  })
})

describe('summarize', () => {
  const mk = (
    expected: number | null,
    owed: number,
    due_date: string | null,
  ): BookingAdvanceForecast => ({
    id: 'b', function_date: '2026-06-30',
    start_date: '2026-06-30', start_slot: 'morning',
    end_date: '2026-06-30', end_slot: 'evening',
    customer_name: '', customer_phone: null, rent: 0,
    status: 'upcoming',
    expected_advance_amount: expected,
    advance_due_date: due_date,
    collected_advance: 0,
    advance_owed: owed,
  })

  it('skips rows without expected target', () => {
    const t = summarize([mk(null, 5000, '2026-05-12')], 'rolling', today)
    expect(t.bookings_with_target).toBe(0)
    expect(t.total_owed).toBe(0)
  })
  it('counts bookings with target but excludes from buckets when paid', () => {
    const t = summarize([mk(10000, 0, '2026-05-12')], 'rolling', today)
    expect(t.bookings_with_target).toBe(1)
    expect(t.total_owed).toBe(0)
    expect(t.counts.overdue).toBe(0)
  })
  it('aggregates owed correctly across buckets', () => {
    const rows = [
      mk(10000, 5000, '2026-05-10'), // overdue
      mk(10000, 5000, '2026-05-18'), // this_week (3d)
      mk(10000, 5000, '2026-05-30'), // this_month (15d)
      mk(10000, 5000, '2026-08-30'), // this_year
      mk(10000, 5000, null),         // later
    ]
    const t = summarize(rows, 'rolling', today)
    expect(t.bookings_with_target).toBe(5)
    expect(t.total_owed).toBe(25000)
    expect(t.overdue).toBe(5000)
    expect(t.this_week).toBe(5000)
    expect(t.this_month).toBe(5000)
    expect(t.this_year).toBe(5000)
    expect(t.later).toBe(5000)
  })
})

describe('emptyForecastTotals', () => {
  it('produces a clean zero baseline', () => {
    const t = emptyForecastTotals()
    expect(t.overdue).toBe(0)
    expect(t.total_owed).toBe(0)
    expect(t.counts.this_week).toBe(0)
  })
})
