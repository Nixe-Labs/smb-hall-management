import { describe, it, expect } from 'vitest'
import {
  buildBookingTrail,
  trailTotalAmount,
  distributeByCurrentAccount,
} from '@/lib/utils/treasury'
import type { AdvancePayment, AccountTransfer } from '@/types/database'

// ── helpers — only the fields the function reads matter; the rest is
// padding so TS is happy. The chain logic uses:
//   advance: id, amount, deposit_account_id
//   transfer: source_advance_id, to_account_id, transfer_date, created_at
const adv = (over: Partial<AdvancePayment>): AdvancePayment => ({
  id: 'adv-1', booking_id: 'b1', advance_number: 1, amount: 50000,
  payment_date: '2026-05-01', payment_method: 'cash',
  deposit_date: null, deposit_account_id: 'acct-cash',
  notes: null,
  created_at: '2026-05-01T10:00:00Z',
  updated_at: '2026-05-01T10:00:00Z',
  ...over,
})

const xfer = (over: Partial<AccountTransfer>): AccountTransfer => ({
  id: `t-${Math.random()}`,
  from_account_id: 'acct-cash',
  to_account_id: 'acct-hdfc',
  amount: 0,
  transfer_date: '2026-05-02',
  source_advance_id: 'adv-1',
  notes: null,
  created_by: null,
  created_at: '2026-05-02T10:00:00Z',
  updated_at: '2026-05-02T10:00:00Z',
  ...over,
})

describe('buildBookingTrail', () => {
  it('empty inputs → empty trail', () => {
    expect(buildBookingTrail([], [])).toEqual([])
  })

  it('advance with no transfers → currentAccountId = deposit_account_id', () => {
    const rows = buildBookingTrail([adv({ id: 'a1', deposit_account_id: 'cash' })], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].currentAccountId).toBe('cash')
    expect(rows[0].chain).toEqual([])
  })

  it('advance with NULL landing and no transfers → currentAccountId stays null', () => {
    const rows = buildBookingTrail([adv({ id: 'a1', deposit_account_id: null })], [])
    expect(rows[0].currentAccountId).toBeNull()
  })

  it('single-hop chain → currentAccountId is the to-account', () => {
    const rows = buildBookingTrail(
      [adv({ id: 'a1', deposit_account_id: 'cash' })],
      [xfer({ source_advance_id: 'a1', from_account_id: 'cash', to_account_id: 'hdfc' })],
    )
    expect(rows[0].chain).toHaveLength(1)
    expect(rows[0].currentAccountId).toBe('hdfc')
  })

  it('multi-hop chain follows transfer dates chronologically', () => {
    const rows = buildBookingTrail(
      [adv({ id: 'a1', deposit_account_id: 'cash' })],
      [
        xfer({ source_advance_id: 'a1', from_account_id: 'hdfc', to_account_id: 'sbi', transfer_date: '2026-05-10' }),
        xfer({ source_advance_id: 'a1', from_account_id: 'cash', to_account_id: 'hdfc', transfer_date: '2026-05-03' }),
      ],
    )
    expect(rows[0].chain.map(t => t.to_account_id)).toEqual(['hdfc', 'sbi'])
    expect(rows[0].currentAccountId).toBe('sbi')
  })

  it('chain order falls back to created_at when transfer_date matches', () => {
    const rows = buildBookingTrail(
      [adv({ id: 'a1' })],
      [
        xfer({ id: 't2', source_advance_id: 'a1', to_account_id: 'sbi', transfer_date: '2026-05-10', created_at: '2026-05-10T11:00:00Z' }),
        xfer({ id: 't1', source_advance_id: 'a1', to_account_id: 'hdfc', transfer_date: '2026-05-10', created_at: '2026-05-10T10:00:00Z' }),
      ],
    )
    expect(rows[0].chain.map(t => t.id)).toEqual(['t1', 't2'])
    expect(rows[0].currentAccountId).toBe('sbi')
  })

  it('unrelated transfers (different source_advance_id) are ignored', () => {
    const rows = buildBookingTrail(
      [adv({ id: 'a1', deposit_account_id: 'cash' })],
      [
        xfer({ source_advance_id: 'OTHER', to_account_id: 'hdfc' }),
        xfer({ source_advance_id: null, to_account_id: 'hdfc' }),
      ],
    )
    expect(rows[0].chain).toEqual([])
    expect(rows[0].currentAccountId).toBe('cash')
  })

  it('skips advances with amount = 0', () => {
    const rows = buildBookingTrail([adv({ id: 'zero', amount: 0 }), adv({ id: 'one', amount: 1000 })], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].advance.id).toBe('one')
  })

  it('skips advances with negative amount (unusual; sanity check)', () => {
    const rows = buildBookingTrail([adv({ id: 'neg', amount: -500 })], [])
    expect(rows).toHaveLength(0)
  })

  it('one booking, multiple advances, each with its own chain', () => {
    const rows = buildBookingTrail(
      [
        adv({ id: 'a1', amount: 50000, deposit_account_id: 'cash' }),
        adv({ id: 'a2', amount: 30000, deposit_account_id: 'hdfc' }),
      ],
      [
        xfer({ source_advance_id: 'a1', from_account_id: 'cash', to_account_id: 'hdfc' }),
        // a2 has no transfers
      ],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].currentAccountId).toBe('hdfc')  // a1 moved
    expect(rows[1].currentAccountId).toBe('hdfc')  // a2 landed there
  })
})

describe('trailTotalAmount', () => {
  it('sums advance amounts only — chains don\'t double-count', () => {
    const rows = buildBookingTrail(
      [
        adv({ id: 'a1', amount: 50000 }),
        adv({ id: 'a2', amount: 30000 }),
      ],
      [
        xfer({ source_advance_id: 'a1', to_account_id: 'hdfc' }),
        xfer({ source_advance_id: 'a1', to_account_id: 'sbi' }),
      ],
    )
    expect(trailTotalAmount(rows)).toBe(80000)
  })
  it('empty trail is 0', () => {
    expect(trailTotalAmount([])).toBe(0)
  })
})

describe('distributeByCurrentAccount', () => {
  it('aggregates by current account', () => {
    const rows = buildBookingTrail(
      [
        adv({ id: 'a1', amount: 50000, deposit_account_id: 'cash' }),
        adv({ id: 'a2', amount: 30000, deposit_account_id: 'cash' }),
        adv({ id: 'a3', amount: 10000, deposit_account_id: 'hdfc' }),
      ],
      [
        xfer({ source_advance_id: 'a1', to_account_id: 'hdfc' }),
      ],
    )
    const dist = distributeByCurrentAccount(rows)
    const byId = Object.fromEntries(dist.map(d => [d.id, d.amount]))
    expect(byId.cash).toBe(30000) // a2 still in cash
    expect(byId.hdfc).toBe(60000) // a1 (moved) + a3
  })

  it('skips rows whose currentAccountId is null', () => {
    const rows = buildBookingTrail([adv({ id: 'a1', amount: 5000, deposit_account_id: null })], [])
    expect(distributeByCurrentAccount(rows)).toEqual([])
  })

  it('empty trail is empty distribution', () => {
    expect(distributeByCurrentAccount([])).toEqual([])
  })
})
