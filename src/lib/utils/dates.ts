import { format, parseISO } from 'date-fns'

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd/MM/yy')
  } catch {
    return dateStr
  }
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// Formats a Postgres TIME ("HH:MM" or "HH:MM:SS") into "h:MM AM/PM".
export function formatTime(time: string | null): string {
  if (!time) return ''
  const parts = time.split(':')
  const hRaw = Number(parts[0])
  if (Number.isNaN(hRaw)) return ''
  const minutes = parts[1] ?? '00'
  const ampm = hRaw >= 12 ? 'PM' : 'AM'
  const h12 = hRaw % 12 === 0 ? 12 : hRaw % 12
  return `${h12}:${minutes} ${ampm}`
}

// "10:00 AM → 11:00 PM", "from 10:00 AM", "until 11:00 PM", or "".
export function formatTimeRange(start: string | null, end: string | null): string {
  const s = formatTime(start)
  const e = formatTime(end)
  if (s && e) return `${s} → ${e}`
  if (s) return `from ${s}`
  if (e) return `until ${e}`
  return ''
}
