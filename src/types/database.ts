import type { UserRole, BookingStatus, PaymentMethod } from './enums'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  function_date: string
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
  rent: number
  status: BookingStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AdvancePayment {
  id: string
  booking_id: string
  advance_number: number
  amount: number
  payment_date: string | null
  payment_method: PaymentMethod | null
  deposit_date: string | null
  deposit_account_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface BillItem {
  id: string
  booking_id: string
  category_id: string
  amount: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  booking_id: string
  category_id: string
  amount: number
  description: string | null
  created_at: string
  updated_at: string
}

export interface Deposit {
  id: string
  booking_id: string
  bank_account_id: string
  amount: number
  deposit_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface BillCategory {
  id: string
  name: string
  is_default: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ExpenseCategory {
  id: string
  name: string
  is_default: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BankAccount {
  id: string
  name: string
  account_number: string | null
  bank_name: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
