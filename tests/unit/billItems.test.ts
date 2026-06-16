import { describe, it, expect } from 'vitest'
import {
  diffBillItems,
  billItemsSubtotal,
  resolveBillItem,
  billItemBreakdown,
  unitDef,
  prefillQuantity,
  type FormBillItem,
  type BillItemSnapshot,
} from '@/lib/utils/billItems'

const row = (over: Partial<FormBillItem>): FormBillItem => ({
  category_id: 'cat-1',
  category_name: 'Cleaning',
  amount: '0',
  ...over,
})

// Flat snapshot helper (the common case in the existing suite).
const flat = (amount: number): BillItemSnapshot => ({ amount, unit: null, rate: null, quantity: null })
// A persisted flat value, for insert/update expectations.
const flatVals = (amount: number) => ({ amount, unit: null, rate: null, quantity: null })

describe('diffBillItems', () => {
  it('empty form + empty originals → nothing to do', () => {
    const d = diffBillItems([], new Map(), 'b1')
    expect(d.inserts).toEqual([])
    expect(d.updates).toEqual([])
    expect(d.deletes).toEqual([])
  })

  it('new non-zero rows become inserts', () => {
    const d = diffBillItems(
      [row({ category_id: 'a', amount: '1000' }), row({ category_id: 'b', amount: '2500' })],
      new Map(),
      'b1',
    )
    expect(d.inserts).toEqual([
      { booking_id: 'b1', category_id: 'a', ...flatVals(1000) },
      { booking_id: 'b1', category_id: 'b', ...flatVals(2500) },
    ])
    expect(d.updates).toEqual([])
    expect(d.deletes).toEqual([])
  })

  it('new rows at zero are silently ignored', () => {
    const d = diffBillItems(
      [row({ category_id: 'a', amount: '0' }), row({ category_id: 'b', amount: '' })],
      new Map(),
      'b1',
    )
    expect(d.inserts).toEqual([])
    expect(d.deletes).toEqual([])
  })

  it('new negative rows (discounts) still become inserts', () => {
    const d = diffBillItems(
      [row({ category_id: 'discount', amount: '-2000' })],
      new Map(),
      'b1',
    )
    expect(d.inserts).toEqual([
      { booking_id: 'b1', category_id: 'discount', ...flatVals(-2000) },
    ])
  })

  it('existing rows whose amount did not change → NO update', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '5000' })],
      new Map([['r1', flat(5000)]]),
      'b1',
    )
    expect(d.updates).toEqual([])
    expect(d.deletes).toEqual([])
    expect(d.inserts).toEqual([])
  })

  it('existing rows whose amount changed → update', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '7500' })],
      new Map([['r1', flat(5000)]]),
      'b1',
    )
    expect(d.updates).toEqual([{ id: 'r1', ...flatVals(7500) }])
  })

  it('existing rows zeroed out → delete (not update)', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '0' })],
      new Map([['r1', flat(5000)]]),
      'b1',
    )
    expect(d.deletes).toEqual(['r1'])
    expect(d.updates).toEqual([])
  })

  it('existing row blanked out (empty string) → delete', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '' })],
      new Map([['r1', flat(5000)]]),
      'b1',
    )
    expect(d.deletes).toEqual(['r1'])
  })

  it('existing row entirely removed from the form → delete', () => {
    const d = diffBillItems(
      [],
      new Map([['r1', flat(5000)], ['r2', flat(1200)]]),
      'b1',
    )
    expect(d.deletes.sort()).toEqual(['r1', 'r2'])
  })

  it('mixed scenario: insert new, update one, delete another, keep one', () => {
    const d = diffBillItems(
      [
        row({ _existing_id: 'r1', amount: '5000' }),
        row({ _existing_id: 'r2', amount: '12000' }),
        row({ category_id: 'new', amount: '3000' }),
      ],
      new Map([['r1', flat(5000)], ['r2', flat(10000)], ['r3', flat(800)]]),
      'b1',
    )
    expect(d.inserts).toEqual([{ booking_id: 'b1', category_id: 'new', ...flatVals(3000) }])
    expect(d.updates).toEqual([{ id: 'r2', ...flatVals(12000) }])
    expect(d.deletes).toEqual(['r3'])
  })

  it('existing discount line flipped to positive → update (not delete)', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '2000' })],
      new Map([['r1', flat(-1500)]]),
      'b1',
    )
    expect(d.updates).toEqual([{ id: 'r1', ...flatVals(2000) }])
    expect(d.deletes).toEqual([])
  })

  it('garbage amount string treated as 0 (delete when existing, ignore when new)', () => {
    const d = diffBillItems(
      [
        row({ _existing_id: 'r1', amount: 'abc' }),
        row({ category_id: 'new', amount: 'xyz' }),
      ],
      new Map([['r1', flat(1000)]]),
      'b1',
    )
    expect(d.deletes).toEqual(['r1'])
    expect(d.inserts).toEqual([])
  })

  // ── per-unit rows ──────────────────────────────────────────
  it('new per-unit row inserts amount = rate × quantity with breakdown', () => {
    const d = diffBillItems(
      [row({ category_id: 'ac', unit: 'hour', rate: '3000', quantity: '5' })],
      new Map(),
      'b1',
    )
    expect(d.inserts).toEqual([
      { booking_id: 'b1', category_id: 'ac', amount: 15000, unit: 'hour', rate: 3000, quantity: 5 },
    ])
  })

  it('per-unit row with no quantity resolves to 0 → ignored when new', () => {
    const d = diffBillItems(
      [row({ category_id: 'ac', unit: 'hour', rate: '3000', quantity: '' })],
      new Map(),
      'b1',
    )
    expect(d.inserts).toEqual([])
  })

  it('per-unit quantity change updates the line even when category unchanged', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', unit: 'hour', rate: '3000', quantity: '6' })],
      new Map([['r1', { amount: 15000, unit: 'hour', rate: 3000, quantity: 5 }]]),
      'b1',
    )
    expect(d.updates).toEqual([{ id: 'r1', amount: 18000, unit: 'hour', rate: 3000, quantity: 6 }])
  })

  it('per-unit row unchanged → no update', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', unit: 'hour', rate: '3000', quantity: '5' })],
      new Map([['r1', { amount: 15000, unit: 'hour', rate: 3000, quantity: 5 }]]),
      'b1',
    )
    expect(d.updates).toEqual([])
  })

  it('switching a flat line to per-unit (same total) still updates breakdown', () => {
    // 6000 flat → 2 units × 3000 = 6000. Amount equal, but breakdown differs.
    const d = diffBillItems(
      [row({ _existing_id: 'r1', unit: 'hour', rate: '3000', quantity: '2' })],
      new Map([['r1', flat(6000)]]),
      'b1',
    )
    expect(d.updates).toEqual([{ id: 'r1', amount: 6000, unit: 'hour', rate: 3000, quantity: 2 }])
  })
})

describe('resolveBillItem', () => {
  it('flat row carries null breakdown', () => {
    expect(resolveBillItem(row({ amount: '2000' }))).toEqual({ amount: 2000, unit: null, rate: null, quantity: null })
  })
  it('per-unit row multiplies rate × quantity', () => {
    expect(resolveBillItem(row({ unit: 'plate', rate: '450', quantity: '120' }))).toEqual({
      amount: 54000, unit: 'plate', rate: 450, quantity: 120,
    })
  })
  it('rounds fractional products to 2dp', () => {
    expect(resolveBillItem(row({ unit: 'hour', rate: '99.99', quantity: '3' })).amount).toBe(299.97)
  })
})

describe('billItemsSubtotal', () => {
  it('sums numeric flat amounts', () => {
    expect(
      billItemsSubtotal([
        { category_id: 'a', category_name: '', amount: '1000' },
        { category_id: 'b', category_name: '', amount: '2500' },
      ]),
    ).toBe(3500)
  })
  it('includes per-unit lines at rate × quantity', () => {
    expect(
      billItemsSubtotal([
        { category_id: 'a', category_name: '', amount: '1000' },
        { category_id: 'ac', category_name: '', unit: 'hour', rate: '3000', quantity: '4' },
      ]),
    ).toBe(13000)
  })
  it('treats blank / garbage as 0', () => {
    expect(
      billItemsSubtotal([
        { category_id: 'a', category_name: '', amount: '1000' },
        { category_id: 'b', category_name: '', amount: '' },
        { category_id: 'c', category_name: '', amount: 'abc' },
      ]),
    ).toBe(1000)
  })
  it('honors negatives (discounts subtract from total)', () => {
    expect(
      billItemsSubtotal([
        { category_id: 'a', category_name: '', amount: '5000' },
        { category_id: 'b', category_name: '', amount: '-1500' },
      ]),
    ).toBe(3500)
  })
  it('empty form is 0', () => {
    expect(billItemsSubtotal([])).toBe(0)
  })
})

describe('billItemBreakdown / unitDef', () => {
  it('formats a per-unit breakdown', () => {
    expect(billItemBreakdown('hour', 3000, 5)).toBe('5 hours × ₹3,000')
  })
  it('singularises the unit noun at quantity 1', () => {
    expect(billItemBreakdown('piece', 2500, 1)).toBe('1 unit × ₹2,500')
    expect(billItemBreakdown('hour', 3000, 1)).toBe('1 hour × ₹3,000')
  })
  it('is empty for a flat line', () => {
    expect(billItemBreakdown(null, null, null)).toBe('')
  })
  it('falls back gracefully for an unknown unit', () => {
    expect(unitDef('weekend')).toEqual({ value: 'weekend', label: 'Per weekend', short: '/weekend', qty: 'weekend' })
  })
})

describe('prefillQuantity', () => {
  it('returns a configured fixed quantity (the standard charge)', () => {
    expect(prefillQuantity(1)).toBe(1)
    expect(prefillQuantity(3)).toBe(3)
  })
  it('treats 0 / null / undefined as metered → no prefill', () => {
    expect(prefillQuantity(0)).toBeNull()
    expect(prefillQuantity(null)).toBeNull()
    expect(prefillQuantity(undefined)).toBeNull()
  })
})
