import type { UserRole, BookingStatus, PaymentMethod, DaySlot, EnquiryStatus } from './enums'

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
  start_date: string
  start_slot: DaySlot
  end_date: string
  end_slot: DaySlot
  start_time: string | null
  end_time: string | null
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
  rent: number
  status: BookingStatus
  notes: string | null
  expected_advance_amount: number | null
  advance_due_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface BookingAdvanceForecast {
  id: string
  function_date: string
  start_date: string
  start_slot: DaySlot
  end_date: string
  end_slot: DaySlot
  customer_name: string
  customer_phone: string | null
  rent: number
  status: BookingStatus
  expected_advance_amount: number | null
  advance_due_date: string | null
  collected_advance: number
  advance_owed: number
}

export interface Enquiry {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
  customer_email: string | null
  source: string | null
  status: EnquiryStatus
  notes: string | null
  lost_reason: string | null
  converted_booking_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EnquiryDate {
  id: string
  enquiry_id: string
  function_date: string
  start_date: string
  start_slot: DaySlot
  end_date: string
  end_slot: DaySlot
  is_primary: boolean
  notes: string | null
  created_at: string
}

export interface EnquiryWithDates extends Enquiry {
  dates: EnquiryDate[]
}

export interface EnquiryMatch {
  enquiry_id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  status: EnquiryStatus
  source: string | null
  notes: string | null
  function_date: string
  start_date: string
  start_slot: DaySlot
  end_date: string
  end_slot: DaySlot
  is_primary: boolean
  created_at: string
}

export type PaymentStatus = 'paid' | 'partial' | 'unpaid'

export interface BookingPaymentStatus {
  booking_id: string
  function_date: string
  booking_status: BookingStatus
  rent: number
  bill_items_total: number
  advance_paid: number
  deposit_paid: number
  total_bill: number
  total_paid: number
  pending: number
  payment_status: PaymentStatus
}

export interface BookingSlot {
  booking_id: string
  slot_date: string
  slot: DaySlot
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
  default_amount: number | null
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

export type NotificationSeverity = 'info' | 'warning' | 'urgent'

export interface AppNotification {
  id: string
  type: string
  severity: NotificationSeverity
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  action_route: string | null
  dedupe_key: string
  created_at: string
}

export interface NotificationRead {
  notification_id: string
  user_id: string
  read_at: string
}
