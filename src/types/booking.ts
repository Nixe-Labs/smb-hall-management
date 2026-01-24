import type { Booking, AdvancePayment, BillItem, Expense, Deposit } from './database'
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
  customer_name: string
  customer_phone: string
  customer_address: string
  rent: number
  status: Booking['status']
  notes: string
}

export interface AdvancePaymentFormData {
  advance_number: number
  amount: number
  payment_date: string
  payment_method: AdvancePayment['payment_method']
  deposit_date: string
  deposit_account_id: string
}
