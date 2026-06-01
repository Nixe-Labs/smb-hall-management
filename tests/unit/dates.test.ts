import { describe, it, expect } from 'vitest'
import { formatDate, formatDateShort, toISODate, formatTime, formatTimeRange } from '@/lib/utils/dates'

describe('formatDate', () => {
  it('formats ISO date in dd MMM yyyy', () => {
    expect(formatDate('2026-05-31')).toBe('31 May 2026')
  })
  it('handles null with em-dash placeholder', () => {
    expect(formatDate(null)).toBe('—')
  })
  it('falls back to raw on garbage', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})

describe('formatDateShort', () => {
  it('formats dd/MM/yy', () => {
    expect(formatDateShort('2026-05-31')).toBe('31/05/26')
  })
  it('handles null with em-dash placeholder', () => {
    expect(formatDateShort(null)).toBe('—')
  })
})

describe('toISODate — IST safety', () => {
  // The whole point of this helper is to avoid `.toISOString().slice(0,10)`
  // which silently slips backwards a day for users east of UTC just before
  // midnight local time. These tests pin the local-date contract.
  it('returns yyyy-MM-dd in local time', () => {
    // Construct a Date at 23:30 local on 2026-05-31 — UTC would be 18:00
    // on the same day for IST+5:30 or earlier date for users east of UTC.
    const d = new Date(2026, 4, 31, 23, 30) // month is 0-indexed
    expect(toISODate(d)).toBe('2026-05-31')
  })
  it('returns yyyy-MM-dd for early morning local', () => {
    const d = new Date(2026, 0, 1, 0, 30) // 1 Jan 00:30 local
    expect(toISODate(d)).toBe('2026-01-01')
  })
  it('round-trips with a Date built from same string', () => {
    const iso = '2026-03-15'
    const [y, m, day] = iso.split('-').map(Number)
    const d = new Date(y, m - 1, day, 12, 0, 0) // noon to avoid DST edge
    expect(toISODate(d)).toBe(iso)
  })
})

describe('formatTime', () => {
  it('formats 24h to 12h with AM/PM', () => {
    expect(formatTime('09:00')).toBe('9:00 AM')
    expect(formatTime('14:30')).toBe('2:30 PM')
    expect(formatTime('00:00')).toBe('12:00 AM')
    expect(formatTime('12:00')).toBe('12:00 PM')
    expect(formatTime('23:59')).toBe('11:59 PM')
  })
  it('strips seconds if present', () => {
    expect(formatTime('14:30:55')).toBe('2:30 PM')
  })
  it('handles null and empty', () => {
    expect(formatTime(null)).toBe('')
    expect(formatTime('')).toBe('')
  })
  it('returns empty on garbage', () => {
    expect(formatTime('abc')).toBe('')
  })
})

describe('formatTimeRange', () => {
  it('renders start → end', () => {
    expect(formatTimeRange('10:00', '23:00')).toBe('10:00 AM → 11:00 PM')
  })
  it('renders "from X" when end missing', () => {
    expect(formatTimeRange('10:00', null)).toBe('from 10:00 AM')
  })
  it('renders "until X" when start missing', () => {
    expect(formatTimeRange(null, '23:00')).toBe('until 11:00 PM')
  })
  it('returns empty string when both missing', () => {
    expect(formatTimeRange(null, null)).toBe('')
  })
})
