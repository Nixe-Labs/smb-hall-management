import { addDays, parseISO, format } from 'date-fns'
import type { DaySlot } from '@/types/enums'
import type { Booking } from '@/types/database'

export interface SlotKey {
  date: string
  slot: DaySlot
}

export const SLOT_LABEL: Record<DaySlot, string> = {
  morning: 'Morning',
  evening: 'Evening',
}

export const SLOT_SHORT: Record<DaySlot, string> = {
  morning: 'Morn',
  evening: 'Eve',
}

const SLOT_ORDER: Record<DaySlot, number> = { morning: 0, evening: 1 }

export function compareSlots(a: SlotKey, b: SlotKey): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]
}

export function expandSlots(
  startDate: string,
  startSlot: DaySlot,
  endDate: string,
  endSlot: DaySlot
): SlotKey[] {
  if (compareSlots({ date: startDate, slot: startSlot }, { date: endDate, slot: endSlot }) > 0) {
    return []
  }
  const out: SlotKey[] = []
  let cursor = parseISO(startDate)
  const end = parseISO(endDate)
  while (cursor <= end) {
    const dateStr = format(cursor, 'yyyy-MM-dd')
    for (const slot of ['morning', 'evening'] as DaySlot[]) {
      const k: SlotKey = { date: dateStr, slot }
      const beforeStart = compareSlots(k, { date: startDate, slot: startSlot }) < 0
      const afterEnd = compareSlots(k, { date: endDate, slot: endSlot }) > 0
      if (!beforeStart && !afterEnd) out.push(k)
    }
    cursor = addDays(cursor, 1)
  }
  return out
}

export function isFullDay(b: Pick<Booking, 'start_date' | 'start_slot' | 'end_date' | 'end_slot'>): boolean {
  return b.start_date === b.end_date && b.start_slot === 'morning' && b.end_slot === 'evening'
}

function fmtDay(dateStr: string) {
  return format(parseISO(dateStr), 'dd MMM')
}

export function formatRange(b: Pick<Booking, 'start_date' | 'start_slot' | 'end_date' | 'end_slot'>): string {
  if (isFullDay(b)) return `${fmtDay(b.start_date)} · Full day`
  if (b.start_date === b.end_date) {
    return `${fmtDay(b.start_date)} · ${SLOT_LABEL[b.start_slot]} → ${SLOT_LABEL[b.end_slot]}`
  }
  return `${fmtDay(b.start_date)} ${SLOT_SHORT[b.start_slot]} → ${fmtDay(b.end_date)} ${SLOT_SHORT[b.end_slot]}`
}

export function slotCount(b: Pick<Booking, 'start_date' | 'start_slot' | 'end_date' | 'end_slot'>): number {
  return expandSlots(b.start_date, b.start_slot, b.end_date, b.end_slot).length
}

export type RangeStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled'

export function getRangeStatus(
  b: Pick<Booking, 'start_date' | 'end_date' | 'status'>,
  now: Date = new Date()
): RangeStatus {
  if (b.status === 'cancelled') return 'cancelled'
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = parseISO(b.start_date)
  const end = parseISO(b.end_date)
  if (today.getTime() < start.getTime()) return 'upcoming'
  if (today.getTime() > end.getTime()) return 'completed'
  return 'ongoing'
}

export const RANGE_STATUS_LABEL: Record<RangeStatus, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Today',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
