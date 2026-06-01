import { describe, it, expect } from 'vitest'
import { diffBillItems, billItemsSubtotal, type FormBillItem } from '@/lib/utils/billItems'

const row = (over: Partial<FormBillItem>): FormBillItem => ({
  category_id: 'cat-1',
  category_name: 'Cleaning',
  amount: '0',
  ...over,
})

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
      { booking_id: 'b1', category_id: 'a', amount: 1000 },
      { booking_id: 'b1', category_id: 'b', amount: 2500 },
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
      { booking_id: 'b1', category_id: 'discount', amount: -2000 },
    ])
  })

  it('existing rows whose amount did not change → NO update', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '5000' })],
      new Map([['r1', 5000]]),
      'b1',
    )
    expect(d.updates).toEqual([])
    expect(d.deletes).toEqual([])
    expect(d.inserts).toEqual([])
  })

  it('existing rows whose amount changed → update', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '7500' })],
      new Map([['r1', 5000]]),
      'b1',
    )
    expect(d.updates).toEqual([{ id: 'r1', amount: 7500 }])
  })

  it('existing rows zeroed out → delete (not update)', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '0' })],
      new Map([['r1', 5000]]),
      'b1',
    )
    expect(d.deletes).toEqual(['r1'])
    expect(d.updates).toEqual([])
  })

  it('existing row blanked out (empty string) → delete', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '' })],
      new Map([['r1', 5000]]),
      'b1',
    )
    expect(d.deletes).toEqual(['r1'])
  })

  it('existing row entirely removed from the form → delete', () => {
    const d = diffBillItems(
      [], // user removed every row
      new Map([['r1', 5000], ['r2', 1200]]),
      'b1',
    )
    expect(d.deletes.sort()).toEqual(['r1', 'r2'])
  })

  it('mixed scenario: insert new, update one, delete another, keep one', () => {
    const d = diffBillItems(
      [
        row({ _existing_id: 'r1', amount: '5000' }),         // unchanged → no-op
        row({ _existing_id: 'r2', amount: '12000' }),        // changed from 10000 → update
        row({ category_id: 'new', amount: '3000' }),         // new → insert
        // r3 (was 800) is missing → delete
      ],
      new Map([['r1', 5000], ['r2', 10000], ['r3', 800]]),
      'b1',
    )
    expect(d.inserts).toEqual([{ booking_id: 'b1', category_id: 'new', amount: 3000 }])
    expect(d.updates).toEqual([{ id: 'r2', amount: 12000 }])
    expect(d.deletes).toEqual(['r3'])
  })

  it('existing discount line flipped to positive → update (not delete)', () => {
    const d = diffBillItems(
      [row({ _existing_id: 'r1', amount: '2000' })],
      new Map([['r1', -1500]]),
      'b1',
    )
    expect(d.updates).toEqual([{ id: 'r1', amount: 2000 }])
    expect(d.deletes).toEqual([])
  })

  it('garbage amount string treated as 0 (delete when existing, ignore when new)', () => {
    const d = diffBillItems(
      [
        row({ _existing_id: 'r1', amount: 'abc' }),  // → 0 → delete
        row({ category_id: 'new', amount: 'xyz' }),  // → 0 → ignore
      ],
      new Map([['r1', 1000]]),
      'b1',
    )
    expect(d.deletes).toEqual(['r1'])
    expect(d.inserts).toEqual([])
  })
})

describe('billItemsSubtotal', () => {
  it('sums numeric amounts', () => {
    expect(
      billItemsSubtotal([
        { category_id: 'a', category_name: '', amount: '1000' },
        { category_id: 'b', category_name: '', amount: '2500' },
      ]),
    ).toBe(3500)
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
