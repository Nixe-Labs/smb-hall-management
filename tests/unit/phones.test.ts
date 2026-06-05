import { describe, it, expect } from 'vitest'
import {
  isValidPhone,
  digitsOnly,
  validatePhones,
  splitPhones,
  mergePhones,
  allPhones,
  telHref,
  waHref,
} from '@/lib/utils/phones'

describe('isValidPhone', () => {
  it('accepts exactly 10 digits', () => {
    expect(isValidPhone('9876543210')).toBe(true)
  })
  it('accepts a number with spaces/punctuation that reduces to 10 digits', () => {
    expect(isValidPhone('98765 43210')).toBe(true)
  })
  it('rejects fewer or more than 10 digits', () => {
    expect(isValidPhone('98765')).toBe(false)
    expect(isValidPhone('919876543210')).toBe(false)
  })
})

describe('digitsOnly', () => {
  it('strips everything but digits', () => {
    expect(digitsOnly('+91 98765-43210')).toBe('919876543210')
  })
  it('is safe on null/undefined', () => {
    expect(digitsOnly(null as unknown as string)).toBe('')
  })
})

describe('validatePhones', () => {
  it('requires the primary when requireFirst is set', () => {
    expect(validatePhones([''], { requireFirst: true })).toMatch(/required/i)
  })
  it('allows an empty primary when not required', () => {
    expect(validatePhones([''])).toBeNull()
  })
  it('flags a primary that is not 10 digits', () => {
    expect(validatePhones(['12345'], { requireFirst: true })).toMatch(/Primary/)
  })
  it('flags an invalid extra by position', () => {
    expect(validatePhones(['9876543210', '12'], { requireFirst: true })).toMatch(/Number 2/)
  })
  it('passes a valid set', () => {
    expect(validatePhones(['9876543210', '9123456780'], { requireFirst: true })).toBeNull()
  })
})

describe('splitPhones', () => {
  it('drops blanks and separates primary from extras as bare digits', () => {
    expect(splitPhones(['98765 43210', '', '9123456780'])).toEqual({
      primary: '9876543210',
      extras: ['9123456780'],
    })
  })
  it('yields a null primary for an all-blank list', () => {
    expect(splitPhones(['', ''])).toEqual({ primary: null, extras: [] })
  })
})

describe('mergePhones', () => {
  it('combines primary + extras, dropping empty extras', () => {
    expect(mergePhones('9876543210', ['9123456780', ''])).toEqual(['9876543210', '9123456780'])
  })
  it('always returns at least one row', () => {
    expect(mergePhones(null, null)).toEqual([''])
  })
  it('keeps a blank primary slot when extras are absent', () => {
    expect(mergePhones('', [])).toEqual([''])
  })
})

describe('allPhones', () => {
  it('returns every number, primary first, blanks removed', () => {
    expect(allPhones('9876543210', ['9123456780'])).toEqual(['9876543210', '9123456780'])
  })
  it('returns empty when there are no numbers', () => {
    expect(allPhones(null, null)).toEqual([])
  })
})

describe('telHref / waHref', () => {
  it('builds a tel: link from digits', () => {
    expect(telHref('98765 43210')).toBe('tel:9876543210')
  })
  it('returns null when there are no digits', () => {
    expect(telHref('')).toBeNull()
    expect(waHref(null)).toBeNull()
  })
  it('prefixes 91 for bare 10-digit mobiles in wa.me links', () => {
    expect(waHref('9876543210')).toBe('https://wa.me/919876543210')
  })
  it('leaves an already-prefixed number alone', () => {
    expect(waHref('919876543210')).toBe('https://wa.me/919876543210')
  })
})
