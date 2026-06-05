/**
 * Pure-logic helpers for the bill-items section on the booking form.
 *
 * Lifted out of BookingCreatePage so the diff (insert / update / delete)
 * is unit-testable without spinning up the form or Supabase. The Vue
 * component owns the I/O — these functions just compute *what* should
 * happen.
 *
 * Per-unit items (migration 015): a row may be priced rate × quantity
 * (e.g. AC ₹3,000/hour × 5). `amount` is always the resolved line total,
 * so every downstream aggregation keeps summing a single `amount` field.
 */

/** Selectable units for per-unit categories. `value` is what we persist. */
export interface UnitDef {
  value: string
  /** Settings dropdown / category label, e.g. "Per hour". */
  label: string
  /** Compact rate suffix, e.g. "/hr". */
  short: string
  /** Quantity-field label, e.g. "hours". */
  qty: string
}

export const BILL_UNITS: UnitDef[] = [
  { value: 'hour', label: 'Per hour', short: '/hr', qty: 'hours' },
  { value: 'day', label: 'Per day', short: '/day', qty: 'days' },
  { value: 'piece', label: 'Per piece / unit', short: '/unit', qty: 'units' },
  { value: 'plate', label: 'Per plate / person', short: '/plate', qty: 'plates' },
]

export function unitDef(unit: string | null | undefined): UnitDef | null {
  if (!unit) return null
  return BILL_UNITS.find(u => u.value === unit) ?? { value: unit, label: `Per ${unit}`, short: `/${unit}`, qty: unit }
}

export interface FormBillItem {
  category_id: string
  category_name: string
  /** Line total. For per-unit rows it's derived from rate × quantity. */
  amount: string
  /** Set ⇒ per-unit row; rate + quantity drive the amount. Null/absent ⇒ flat. */
  unit?: string | null
  rate?: string
  quantity?: string
  /** bill_items.id when loaded from an existing booking; absent for new rows. */
  _existing_id?: string
}

/** The persisted numeric shape of a bill item (sans id / booking_id). */
export interface BillItemValues {
  amount: number
  unit: string | null
  rate: number | null
  quantity: number | null
}

export interface BillItemSnapshot extends BillItemValues {}

export interface BillItemsDiff {
  inserts: ({ booking_id: string; category_id: string } & BillItemValues)[]
  updates: ({ id: string } & BillItemValues)[]
  deletes: string[]
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Resolve a form row to its persisted values. Per-unit rows compute
 * amount = rate × quantity (the source of truth); flat rows use the typed
 * amount and carry null breakdown columns.
 */
export function resolveBillItem(row: FormBillItem): BillItemValues {
  if (row.unit) {
    const rate = Number(row.rate) || 0
    const quantity = Number(row.quantity) || 0
    return { amount: round2(rate * quantity), unit: row.unit, rate, quantity }
  }
  return { amount: Number(row.amount) || 0, unit: null, rate: null, quantity: null }
}

function sameValues(a: BillItemSnapshot, b: BillItemValues): boolean {
  return a.amount === b.amount
    && (a.unit ?? null) === (b.unit ?? null)
    && (a.rate ?? null) === (b.rate ?? null)
    && (a.quantity ?? null) === (b.quantity ?? null)
}

/**
 * Reconcile the live form against the originals snapshot.
 *
 *   - new row (no _existing_id) with amount ≠ 0           → INSERT
 *   - existing row whose values changed                    → UPDATE
 *   - existing row now 0 / blank, or removed from the form → DELETE
 *
 * Non-zero amount is the "keep" condition: negatives are legitimate for
 * Discount-style entries (they reduce the total). Zero means "remove
 * this line" — so existing rows zeroed out get deleted, and brand-new
 * rows at zero are ignored entirely (e.g. AC added but no hours entered).
 */
export function diffBillItems(
  formRows: FormBillItem[],
  originals: Map<string, BillItemSnapshot>,
  bookingId: string,
): BillItemsDiff {
  const inserts: BillItemsDiff['inserts'] = []
  const updates: BillItemsDiff['updates'] = []
  const deletes: string[] = []
  const seen = new Set<string>()

  for (const row of formRows) {
    const v = resolveBillItem(row)
    if (row._existing_id) {
      seen.add(row._existing_id)
      if (v.amount !== 0) {
        const orig = originals.get(row._existing_id)
        if (!orig || !sameValues(orig, v)) updates.push({ id: row._existing_id, ...v })
      } else {
        deletes.push(row._existing_id)
      }
    } else if (v.amount !== 0) {
      inserts.push({ booking_id: bookingId, category_id: row.category_id, ...v })
    }
  }
  for (const id of originals.keys()) {
    if (!seen.has(id)) deletes.push(id)
  }

  return { inserts, updates, deletes }
}

/** Live subtotal — used by the form to render the running total. */
export function billItemsSubtotal(formRows: FormBillItem[]): number {
  return formRows.reduce((s, r) => s + resolveBillItem(r).amount, 0)
}

/** Human breakdown for a per-unit line, e.g. "5 hrs × ₹3,000". Empty for flat. */
export function billItemBreakdown(
  unit: string | null | undefined,
  rate: number | null | undefined,
  quantity: number | null | undefined,
): string {
  const def = unitDef(unit)
  if (!def || rate == null) return ''
  const qty = quantity ?? 0
  return `${qty} ${def.qty} × ₹${Number(rate).toLocaleString('en-IN')}`
}
