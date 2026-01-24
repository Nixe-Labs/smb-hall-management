import { format, parseISO } from 'date-fns'

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return format(parseISO(dateStr), 'dd/MM/yy')
  } catch {
    return dateStr
  }
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}
