// Contact-number helpers shared by the booking + enquiry forms and the
// detail views. The data model keeps the PRIMARY number in
// `customer_phone` and any extras in `customer_phones` (see migration 014);
// these helpers bridge that split into a single editable/display list.

export const MAX_PHONES = 5

/** A valid mobile number is exactly 10 digits (Indian mobile). */
export function isValidPhone(value: string): boolean {
  return /^\d{10}$/.test(digitsOnly(value))
}

/** Keep only digits — used to normalise pasted input like "+91 98765 43210". */
export function digitsOnly(value: string): string {
  return (value ?? '').replace(/\D/g, '')
}

/**
 * Validate the full ordered list (index 0 = primary). Returns an error
 * message to show the user, or null when everything is acceptable.
 *   - when `requireFirst`, the primary number must be present
 *   - every non-empty entry must be exactly 10 digits
 */
export function validatePhones(list: string[], opts: { requireFirst?: boolean } = {}): string | null {
  const filled = list.map(digitsOnly)
  if (opts.requireFirst && !filled[0]) {
    return 'A primary mobile number is required.'
  }
  for (let i = 0; i < filled.length; i++) {
    const n = filled[i]
    if (n && !isValidPhone(n)) {
      return `${i === 0 ? 'Primary number' : `Number ${i + 1}`} must be exactly 10 digits.`
    }
  }
  return null
}

/**
 * Split an edited list into the storage shape: a single primary string
 * (or null) and an array of extras. Blank entries are dropped and all
 * numbers are stored as bare digits.
 */
export function splitPhones(list: string[]): { primary: string | null; extras: string[] } {
  const filled = list.map(digitsOnly).filter(Boolean)
  return { primary: filled[0] ?? null, extras: filled.slice(1) }
}

/** Merge the stored primary + extras back into one editable list (always ≥1 row). */
export function mergePhones(primary: string | null | undefined, extras: string[] | null | undefined): string[] {
  const list = [primary ?? '', ...(extras ?? [])].filter((v, i) => i === 0 || v)
  return list.length ? list : ['']
}

/** Flat list of every number on a record, primary first, blanks removed. */
export function allPhones(primary: string | null | undefined, extras: string[] | null | undefined): string[] {
  return [primary ?? '', ...(extras ?? [])].map(digitsOnly).filter(Boolean)
}

/** `tel:` URI for a dialable number, or null if there are no digits. */
export function telHref(phone: string | null | undefined): string | null {
  const d = digitsOnly(phone ?? '')
  return d ? `tel:${d}` : null
}

/** WhatsApp deep link — assumes +91 for bare 10-digit Indian mobiles. */
export function waHref(phone: string | null | undefined): string | null {
  let d = digitsOnly(phone ?? '')
  if (d.length === 10) d = '91' + d
  return d ? `https://wa.me/${d}` : null
}
