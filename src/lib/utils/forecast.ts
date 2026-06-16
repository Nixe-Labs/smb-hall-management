import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns'
import type { BookingAdvanceForecast } from '@/types/database'

export const DEFAULT_ADVANCE_LEAD_DAYS = 30

// ── Advance policy: the booking advance should be 40–60% of rent ──────
// Owner's rule. The app suggests the 50% midpoint and warns (never blocks)
// when the entered advance falls outside the band.
export const ADVANCE_MIN_PCT = 0.4
export const ADVANCE_MAX_PCT = 0.6

export interface AdvancePolicy {
  /** 40% of rent. */
  min: number
  /** 60% of rent. */
  max: number
  /** 50% of rent — the prefilled suggestion. */
  suggested: number
}

/** The 40–60%-of-rent advance band and the 50% suggestion. Rent ≤ 0 → all 0. */
export function advancePolicy(rent: number): AdvancePolicy {
  const r = rent > 0 ? rent : 0
  return {
    min: Math.round(r * ADVANCE_MIN_PCT),
    max: Math.round(r * ADVANCE_MAX_PCT),
    suggested: Math.round(r * 0.5),
  }
}

/**
 * True when a non-zero advance falls outside the 40–60% band for the rent.
 * A blank/zero advance (none collected) or a rent ≤ 0 is never out of policy —
 * the band only applies once an advance is actually being entered.
 */
export function advanceOutOfPolicy(advance: number, rent: number): boolean {
  if (!(advance > 0) || !(rent > 0)) return false
  const { min, max } = advancePolicy(rent)
  return advance < min || advance > max
}

export function defaultDueDate(functionDate: string, leadDays = DEFAULT_ADVANCE_LEAD_DAYS): string {
  return format(subDays(parseISO(functionDate), leadDays), 'yyyy-MM-dd')
}

/**
 * "Balance due within N days of booking" rule: today + leadDays, but never
 * later than the function date — if the event is sooner than N days out, the
 * balance is due by the function date. functionDate may be blank (date not yet
 * picked) in which case it's simply today + leadDays.
 */
export function dueDateWithin(
  functionDate: string | null,
  leadDays = DEFAULT_ADVANCE_LEAD_DAYS,
  now: Date = new Date(),
): string {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const target = addDays(today, leadDays)
  if (functionDate) {
    const fn = parseISO(functionDate)
    if (fn < target) return format(fn, 'yyyy-MM-dd')
  }
  return format(target, 'yyyy-MM-dd')
}

export type ForecastBucket = 'overdue' | 'this_week' | 'this_month' | 'this_year' | 'later' | 'paid'

export type BucketMode = 'calendar' | 'rolling'

export const FORECAST_BUCKET_LABEL: Record<ForecastBucket, string> = {
  overdue: 'Overdue',
  this_week: 'This week',
  this_month: 'This month',
  this_year: 'This year',
  later: 'Later',
  paid: 'Paid',
}

export const BUCKET_MODE_LABEL: Record<BucketMode, string> = {
  calendar: 'Calendar',
  rolling: 'Rolling',
}

export interface BucketInput {
  due_date: string | null
  expected: number | null
  owed: number
}

/**
 * Bucket a booking by when its advance is owed.
 *
 * - paid:       expected set, owed === 0
 * - overdue:    due date already past and balance still owed
 *
 * Rolling mode (default — keeps dashboard behavior):
 * - this_week:  due in next 0..7 days
 * - this_month: due in next 8..30 days
 * - this_year:  due in next 31..365 days
 * - later:      beyond 365 days, or no due date
 *
 * Calendar mode:
 * - this_week:  due falls within the current calendar week (Sun..Sat)
 * - this_month: due falls within the current calendar month
 * - this_year:  due falls within the current calendar year
 * - later:      beyond the current year, or no due date
 */
export function bucketFor(
  input: BucketInput,
  mode: BucketMode = 'rolling',
  now: Date = new Date()
): ForecastBucket | null {
  if (input.expected == null) return null
  if (input.owed <= 0) return 'paid'
  if (!input.due_date) return 'later'

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const due = parseISO(input.due_date)
  const diff = differenceInCalendarDays(due, today)
  if (diff < 0) return 'overdue'

  if (mode === 'rolling') {
    if (diff <= 7) return 'this_week'
    if (diff <= 30) return 'this_month'
    if (diff <= 365) return 'this_year'
    return 'later'
  }

  // Calendar mode — Sunday-aligned week to match the rest of the app
  const wStart = startOfWeek(today, { weekStartsOn: 0 })
  const wEnd = endOfWeek(today, { weekStartsOn: 0 })
  if (due >= wStart && due <= wEnd) return 'this_week'

  const mStart = startOfMonth(today)
  const mEnd = endOfMonth(today)
  if (due >= mStart && due <= mEnd) return 'this_month'

  const yStart = startOfYear(today)
  const yEnd = endOfYear(today)
  if (due >= yStart && due <= yEnd) return 'this_year'

  return 'later'
}

export function bucketForBooking(
  b: BookingAdvanceForecast,
  mode: BucketMode = 'rolling',
  now: Date = new Date()
) {
  return bucketFor(
    { due_date: b.advance_due_date, expected: b.expected_advance_amount, owed: Number(b.advance_owed) },
    mode,
    now
  )
}

export interface ForecastTotals {
  overdue: number
  this_week: number
  this_month: number
  this_year: number
  later: number
  total_owed: number
  bookings_with_target: number
  counts: {
    overdue: number
    this_week: number
    this_month: number
    this_year: number
    later: number
  }
}

export function emptyForecastTotals(): ForecastTotals {
  return {
    overdue: 0,
    this_week: 0,
    this_month: 0,
    this_year: 0,
    later: 0,
    total_owed: 0,
    bookings_with_target: 0,
    counts: { overdue: 0, this_week: 0, this_month: 0, this_year: 0, later: 0 },
  }
}

export function summarize(
  rows: BookingAdvanceForecast[],
  mode: BucketMode = 'rolling',
  now: Date = new Date()
): ForecastTotals {
  const totals = emptyForecastTotals()
  for (const r of rows) {
    if (r.expected_advance_amount == null) continue
    totals.bookings_with_target += 1
    const owed = Number(r.advance_owed)
    if (owed <= 0) continue
    totals.total_owed += owed
    const b = bucketFor(
      { due_date: r.advance_due_date, expected: r.expected_advance_amount, owed },
      mode,
      now
    )
    if (b === 'overdue')         { totals.overdue    += owed; totals.counts.overdue    += 1 }
    else if (b === 'this_week')  { totals.this_week  += owed; totals.counts.this_week  += 1 }
    else if (b === 'this_month') { totals.this_month += owed; totals.counts.this_month += 1 }
    else if (b === 'this_year')  { totals.this_year  += owed; totals.counts.this_year  += 1 }
    else if (b === 'later')      { totals.later      += owed; totals.counts.later      += 1 }
  }
  return totals
}

export function dueInDays(due_date: string | null, now: Date = new Date()): number | null {
  if (!due_date) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return differenceInCalendarDays(parseISO(due_date), today)
}

export function dueLabel(due_date: string | null, now: Date = new Date()): string {
  const d = dueInDays(due_date, now)
  if (d == null) return '—'
  if (d < 0) return `${-d}d overdue`
  if (d === 0) return 'due today'
  if (d === 1) return 'due tomorrow'
  return `due in ${d}d`
}

export { addDays, parseISO }
