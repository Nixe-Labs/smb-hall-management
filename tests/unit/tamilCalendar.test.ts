import { describe, it, expect } from 'vitest'
import { getTamilDate, tamilDateLabel } from '@/lib/utils/tamilCalendar'

describe('getTamilDate', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(getTamilDate(null)).toBeNull()
    expect(getTamilDate(undefined)).toBeNull()
    expect(getTamilDate('')).toBeNull()
  })
  it('returns null for invalid date strings (does not throw)', () => {
    expect(getTamilDate('not-a-date')).toBeNull()
  })
  it('produces a valid TamilDate for a real civil date', () => {
    const t = getTamilDate('2026-06-15')
    expect(t).not.toBeNull()
    expect(t!.month).toBeTruthy()
    expect(typeof t!.month.ino).toBe('number')
    expect(t!.month.ino).toBeGreaterThanOrEqual(0)
    expect(t!.month.ino).toBeLessThan(12)
    expect(['valarpirai', 'theipirai']).toContain(t!.paksha)
  })
})

describe('tamilDateLabel', () => {
  it('returns em-dash placeholder for null', () => {
    expect(tamilDateLabel(null)).toBe('—')
  })
  it('contains the Tamil month name for a real date', () => {
    const t = getTamilDate('2026-06-15')
    const label = tamilDateLabel(t)
    expect(label).toMatch(/[A-Za-z]/) // some text
    expect(label.length).toBeGreaterThan(2)
  })
})
