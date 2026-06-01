import { describe, it, expect } from 'vitest'
import { formatCurrency, parseCurrency } from '@/lib/utils/currency'

describe('formatCurrency', () => {
  it('formats integer rupees with the rupee symbol', () => {
    expect(formatCurrency(50000)).toMatch(/₹/)
    expect(formatCurrency(50000)).toMatch(/50,000/)
  })
  it('groups Indian-style (lakhs)', () => {
    expect(formatCurrency(240000)).toMatch(/2,40,000/)
  })
  it('handles zero', () => {
    expect(formatCurrency(0)).toMatch(/0/)
  })
  it('handles negative values (e.g. discounts)', () => {
    const out = formatCurrency(-1500)
    expect(out).toMatch(/1,500/)
    expect(out).toMatch(/[-−]/)
  })
  it('keeps up to 2 decimal places when present', () => {
    expect(formatCurrency(99.5)).toMatch(/99\.5/)
  })
})

describe('parseCurrency', () => {
  it('parses an Indian-formatted string back to a number', () => {
    expect(parseCurrency('₹50,000')).toBe(50000)
    expect(parseCurrency('₹2,40,000')).toBe(240000)
  })
  it('parses decimals', () => {
    expect(parseCurrency('₹99.50')).toBe(99.5)
  })
  it('returns 0 for empty or non-numeric input', () => {
    expect(parseCurrency('')).toBe(0)
    expect(parseCurrency('—')).toBe(0)
  })
  it('handles negative values', () => {
    expect(parseCurrency('-1500')).toBe(-1500)
  })
})
