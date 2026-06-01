/**
 * Pure-logic helpers for the Treasury "Booking trail" view.
 *
 * Lifted out of TreasuryPage.vue so the chain math (where did this
 * advance land, what moves have happened, where is it now?) can be
 * unit-tested without mounting the component.
 *
 * Invariant assumed by the chain logic: every transfer tagged with
 * `source_advance_id` represents the FULL movement of that advance to
 * a new account. Partial moves would break the "last to_account wins"
 * heuristic. The UI enforces this by locking the amount in the Move
 * modal; the DB does NOT enforce it (see BUG_REPORT.md · M-02).
 */

import type { AdvancePayment, AccountTransfer } from '@/types/database'

export interface TrailRow {
  advance: AdvancePayment
  /** Transfers tagged at this advance, ordered chronologically. */
  chain: AccountTransfer[]
  /** Account the money currently sits in — null if no landing account set. */
  currentAccountId: string | null
}

/**
 * Order transfers by (transfer_date asc, created_at asc). Both columns
 * are TEXT/timestamp-string when they come from supabase-js, so
 * localeCompare is the safe lexicographic order — yyyy-MM-dd dates and
 * ISO timestamps both sort correctly.
 */
function sortChain(transfers: AccountTransfer[]): AccountTransfer[] {
  return [...transfers].sort((x, y) =>
    (x.transfer_date || '').localeCompare(y.transfer_date || '')
    || x.created_at.localeCompare(y.created_at),
  )
}

/**
 * Compute the per-advance money trail for a single booking.
 *
 * Skips advances with amount ≤ 0 (cancellation-style stubs shouldn't
 * appear on the trail). For each remaining advance, walks the chain
 * of transfers and reports its current location.
 *
 * `transfers` may contain entries unrelated to this booking — they're
 * filtered by `source_advance_id` against the advances passed in.
 */
export function buildBookingTrail(
  advances: AdvancePayment[],
  transfers: AccountTransfer[],
): TrailRow[] {
  const advIds = new Set(advances.map(a => a.id))
  const relevant = transfers.filter(t => t.source_advance_id != null && advIds.has(t.source_advance_id))

  return advances
    .filter(a => Number(a.amount) > 0)
    .map(a => {
      const chain = sortChain(relevant.filter(t => t.source_advance_id === a.id))
      const last = chain[chain.length - 1]
      const currentAccountId = last ? last.to_account_id : a.deposit_account_id
      return { advance: a, chain, currentAccountId }
    })
}

/** Sum of all advance amounts in the trail. */
export function trailTotalAmount(rows: TrailRow[]): number {
  return rows.reduce((s, r) => s + Number(r.advance.amount), 0)
}

/**
 * Distribute the booking's collected money across the accounts where
 * it currently sits. Useful for the "₹50K in HDFC · ₹30K in Cash"
 * summary chips on the trail panel.
 */
export function distributeByCurrentAccount(rows: TrailRow[]): { id: string; amount: number }[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.currentAccountId) continue
    map.set(r.currentAccountId, (map.get(r.currentAccountId) ?? 0) + Number(r.advance.amount))
  }
  return Array.from(map.entries()).map(([id, amount]) => ({ id, amount }))
}
