export type UserRole = 'admin' | 'staff' | 'viewer'

export type BookingStatus = 'upcoming' | 'completed' | 'cancelled'

// 'online' is legacy — kept for old records; new entries use upi / bank_transfer.
export type PaymentMethod = 'cash' | 'cheque' | 'upi' | 'bank_transfer' | 'online'

// Order matters — morning < afternoon < evening (mirrors the day_slot enum).
export type DaySlot = 'morning' | 'afternoon' | 'evening'

export type EnquiryStatus = 'new' | 'converted' | 'lost'
