import type { PaymentMethod } from '@/types/enums'

// Display labels for every method, including the legacy 'online' value kept for
// records created before UPI / Bank Transfer existed.
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  online: 'Online',
}

// The methods offered when recording a NEW payment. 'online' is intentionally
// excluded — it survives only so old records still display correctly.
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'cheque', 'upi', 'bank_transfer']

export function paymentMethodLabel(m: PaymentMethod | null | undefined): string {
  return m ? (PAYMENT_METHOD_LABEL[m] ?? m) : '—'
}

/**
 * The options to show in an edit dropdown: the standard set, plus the record's
 * current method if it's a legacy value (e.g. 'online') so editing never
 * silently drops it.
 */
export function paymentMethodOptions(current: PaymentMethod | null | undefined): PaymentMethod[] {
  if (current && !PAYMENT_METHODS.includes(current)) return [...PAYMENT_METHODS, current]
  return PAYMENT_METHODS
}
