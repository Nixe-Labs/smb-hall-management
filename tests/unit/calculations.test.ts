import { describe, it, expect } from 'vitest'
import { calculateBookingSummary } from '@/lib/utils/calculations'
import type { AdvancePayment, BillItem, Expense, Deposit } from '@/types/database'

// Lightweight helpers — the test only cares about `amount`; the rest is
// padding to satisfy the type. The function never inspects them.
const adv = (n: number): AdvancePayment => ({
  id: 'adv', booking_id: 'b', advance_number: 1, amount: n,
  payment_date: null, payment_method: null, deposit_date: null,
  deposit_account_id: null, notes: null,
  created_at: '', updated_at: '',
})
const bill = (n: number): BillItem => ({
  id: 'bi', booking_id: 'b', category_id: 'c', amount: n,
  notes: null, created_at: '', updated_at: '',
})
const exp = (n: number): Expense => ({
  id: 'e', booking_id: 'b', category_id: 'c', amount: n,
  description: null, created_at: '', updated_at: '',
})
const dep = (n: number): Deposit => ({
  id: 'd', booking_id: 'b', bank_account_id: 'a', amount: n,
  deposit_date: null, notes: null, created_at: '', updated_at: '',
})

describe('calculateBookingSummary', () => {
  it('happy path', () => {
    const s = calculateBookingSummary(50000, [adv(20000), adv(10000)], [bill(4000)], [exp(2000)], [dep(5000)])
    expect(s.rent).toBe(50000)
    expect(s.bill_items_total).toBe(4000)
    expect(s.total_bill).toBe(54000)
    expect(s.total_advance).toBe(30000)
    expect(s.total_deposits).toBe(5000)
    expect(s.total_paid).toBe(35000)
    expect(s.total_expenses).toBe(2000)
    expect(s.pending_balance).toBe(54000 - 35000)
    expect(s.net_profit).toBe(54000 - 2000)
    expect(s.excess_shortage).toBe(35000 - 54000) // negative — owed
  })

  it('treats overpayment as zero pending and positive excess', () => {
    const s = calculateBookingSummary(10000, [adv(15000)], [], [], [])
    expect(s.total_bill).toBe(10000)
    expect(s.total_paid).toBe(15000)
    expect(s.pending_balance).toBe(0)         // clamped to 0
    expect(s.excess_shortage).toBe(5000)      // overpaid
  })

  it('supports negative bill items (discount lines)', () => {
    const s = calculateBookingSummary(50000, [], [bill(4000), bill(-2000)], [], [])
    expect(s.bill_items_total).toBe(2000)
    expect(s.total_bill).toBe(52000)
  })

  it('zero everything is well-defined', () => {
    const s = calculateBookingSummary(0, [], [], [], [])
    expect(s.total_bill).toBe(0)
    expect(s.total_paid).toBe(0)
    expect(s.pending_balance).toBe(0)
    expect(s.net_profit).toBe(0)
    expect(s.excess_shortage).toBe(0)
  })

  it('coerces string-typed amounts (Supabase numeric returns strings sometimes)', () => {
    // Simulating Postgres NUMERIC arriving as a string from supabase-js
    const a = { ...adv(0), amount: ('25000' as unknown) as number }
    const s = calculateBookingSummary(0, [a], [], [], [])
    expect(s.total_advance).toBe(25000)
  })

  it('rent ignores string vs number — uses Number(rent)', () => {
    const s = calculateBookingSummary(('50000' as unknown) as number, [], [], [], [])
    expect(s.rent).toBe(50000)
    expect(s.total_bill).toBe(50000)
  })
})
