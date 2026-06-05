import type { Booking, AdvancePayment, BillItem, Expense, Deposit } from './database'
import type { DaySlot } from './enums'
import type { BookingSummary } from './finance'

export interface BookingWithDetails extends Booking {
  advances: AdvancePayment[]
  bill_items: (BillItem & { category_name: string })[]
  expenses: (Expense & { category_name: string })[]
  deposits: (Deposit & { account_name: string })[]
  summary: BookingSummary
}

export interface BookingFormData {
  function_date: string
  start_date: string
  start_slot: DaySlot
  end_date: string
  end_slot: DaySlot
  start_time: string | null
  end_time: string | null
  customer_name: string
  customer_phone: string
  customer_phones: string[]
  customer_address: string
  rent: number
  status: Booking['status']
  notes: string
  expected_advance_amount: number | null
  advance_due_date: string | null
}

export interface AdvancePaymentFormData {
  advance_number: number
  amount: number
  payment_date: string
  payment_method: AdvancePayment['payment_method']
  deposit_date: string
  deposit_account_id: string
}
