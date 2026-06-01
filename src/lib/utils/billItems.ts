/**
 * Pure-logic helpers for the bill-items section on the booking form.
 *
 * Lifted out of BookingCreatePage so the diff (insert / update / delete)
 * is unit-testable without spinning up the form or Supabase. The Vue
 * component owns the I/O — these functions just compute *what* should
 * happen.
 */

export interface FormBillItem {
  category_id: string
  category_name: string
  amount: string
  /** bill_items.id when loaded from an existing booking; absent for new rows. */
  _existing_id?: string
}

export interface BillItemsDiff {
  inserts: { booking_id: string; category_id: string; amount: number }[]
  updates: { id: string; amount: number }[]
  deletes: string[]
}

/**
 * Reconcile the live form against the originals snapshot.
 *
 *   - new row (no _existing_id) with amount ≠ 0           → INSERT
 *   - existing row whose amount changed                    → UPDATE
 *   - existing row now 0 / blank, or removed from the form → DELETE
 *
 * Non-zero amount is the "keep" condition: negatives are legitimate for
 * Discount-style entries (they reduce the total). Zero means "remove
 * this line" so existing rows zeroed out get deleted, and brand-new rows
 * at zero are ignored entirely.
 */
export function diffBillItems(
  formRows: FormBillItem[],
  originals: Map<string, number>,
  bookingId: string,
): BillItemsDiff {
  const inserts: BillItemsDiff['inserts'] = []
  const updates: BillItemsDiff['updates'] = []
  const deletes: string[] = []
  const seen = new Set<string>()

  for (const row of formRows) {
    const amount = Number(row.amount) || 0
    if (row._existing_id) {
      seen.add(row._existing_id)
      if (amount !== 0) {
        const orig = originals.get(row._existing_id)
        if (orig !== amount) updates.push({ id: row._existing_id, amount })
      } else {
        deletes.push(row._existing_id)
      }
    } else if (amount !== 0) {
      inserts.push({ booking_id: bookingId, category_id: row.category_id, amount })
    }
  }
  for (const id of originals.keys()) {
    if (!seen.has(id)) deletes.push(id)
  }

  return { inserts, updates, deletes }
}

/** Live subtotal — used by the form to render the running total. */
export function billItemsSubtotal(formRows: FormBillItem[]): number {
  return formRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
}
