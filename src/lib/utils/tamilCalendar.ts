import { MhahPanchang } from 'mhah-panchang'
import { addDays, parseISO, format, differenceInCalendarDays } from 'date-fns'

// SMB hall is in Tirunelveli, Tamil Nadu. Panchangam is computed at the
// location's sunrise, so the coordinates matter (only slightly within TN).
const HALL_LAT = 8.7139
const HALL_LNG = 77.7567

export interface TamilMonth {
  ino: number      // sidereal sun-sign index, 0 = Mesha/Aries
  en: string
  ta: string
}

// Indexed by the sun's sidereal raasi (calendar().Raasi.ino).
// Sun in Mesha → Chithirai, Rishaba → Vaikasi, … Meena → Panguni.
export const TAMIL_MONTHS: TamilMonth[] = [
  { ino: 0,  en: 'Chithirai',  ta: 'சித்திரை' },
  { ino: 1,  en: 'Vaikasi',    ta: 'வைகாசி' },
  { ino: 2,  en: 'Aani',       ta: 'ஆனி' },
  { ino: 3,  en: 'Aadi',       ta: 'ஆடி' },
  { ino: 4,  en: 'Aavani',     ta: 'ஆவணி' },
  { ino: 5,  en: 'Purattasi',  ta: 'புரட்டாசி' },
  { ino: 6,  en: 'Aippasi',    ta: 'ஐப்பசி' },
  { ino: 7,  en: 'Karthigai',  ta: 'கார்த்திகை' },
  { ino: 8,  en: 'Margazhi',   ta: 'மார்கழி' },
  { ino: 9,  en: 'Thai',       ta: 'தை' },
  { ino: 10, en: 'Maasi',      ta: 'மாசி' },
  { ino: 11, en: 'Panguni',    ta: 'பங்குனி' },
]

export type Paksha = 'valarpirai' | 'theipirai'

export const PAKSHA_LABEL: Record<Paksha, { en: string; ta: string; short: string }> = {
  valarpirai: { en: 'Valarpirai · waxing moon', ta: 'வளர்பிறை', short: 'Valarpirai' },
  theipirai:  { en: 'Theipirai · waning moon',  ta: 'தேய்பிறை', short: 'Theipirai' },
}

export interface TamilDate {
  month: TamilMonth
  paksha: Paksha
  tithiEn: string
  nakshatraEn: string
}

let _engine: MhahPanchang | null = null
function engine(): MhahPanchang {
  if (!_engine) _engine = new MhahPanchang()
  return _engine
}

// A civil date's Tamil month/paksha never changes, so memoize by date string.
const _cache = new Map<string, TamilDate | null>()

/**
 * Resolve a civil date ('YYYY-MM-DD', interpreted in IST) to its Tamil
 * solar month + paksha. Returns null on invalid input.
 *
 * Accuracy note: the month + paksha match the printed Tamil panchangam on
 * all but the exact sankranti / new-moon boundary day, where this in-app
 * ephemeris can differ by ~1 day from a drik-precise source.
 */
export function getTamilDate(dateStr: string | null | undefined): TamilDate | null {
  if (!dateStr) return null
  if (_cache.has(dateStr)) return _cache.get(dateStr)!

  // Pin to noon IST so the civil day maps to the right panchangam day
  // regardless of the browser's timezone.
  const dt = new Date(`${dateStr}T12:00:00+05:30`)
  if (Number.isNaN(dt.getTime())) return null

  let result: TamilDate | null = null
  try {
    const cal = engine().calendar(dt, HALL_LAT, HALL_LNG)
    const ino: number | undefined = cal?.Raasi?.ino
    if (ino != null && ino >= 0 && ino <= 11) {
      const paksha: Paksha = cal?.Paksha?.name_en_IN === 'Krishna' ? 'theipirai' : 'valarpirai'
      result = {
        month: TAMIL_MONTHS[ino]!,
        paksha,
        tithiEn: cal?.Tithi?.name_en_IN ?? '',
        nakshatraEn: cal?.Nakshatra?.name_en_IN ?? '',
      }
    }
  } catch {
    result = null
  }
  _cache.set(dateStr, result)
  return result
}

/** Short label e.g. "Vaikasi · Valarpirai". */
export function tamilDateLabel(t: TamilDate | null): string {
  if (!t) return ''
  return `${t.month.en} · ${PAKSHA_LABEL[t.paksha].short}`
}

// ──────────────────────────────────────────────────────────────
// Tamil-month spans (for a Tamil-organized calendar view)
// ──────────────────────────────────────────────────────────────

function isoShift(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), 'yyyy-MM-dd')
}

export interface TamilMonthSpan {
  month: TamilMonth
  startISO: string   // Gregorian date of Tamil day 1
  endISO: string     // Gregorian date of the last Tamil day
  length: number     // number of days in the Tamil month
}

/**
 * The Gregorian start/end of the Tamil (solar) month containing `dateStr`.
 * Walks day-by-day until the sun's sidereal sign changes (months are ~29-32
 * days). getTamilDate is memoized, so this stays cheap.
 */
export function getTamilMonthSpan(dateStr: string | null | undefined): TamilMonthSpan | null {
  const base = getTamilDate(dateStr)
  if (!base || !dateStr) return null
  const ino = base.month.ino

  let start = dateStr
  for (let i = 0; i < 40; i++) {
    const prev = isoShift(start, -1)
    if (getTamilDate(prev)?.month.ino !== ino) break
    start = prev
  }
  let end = dateStr
  for (let i = 0; i < 40; i++) {
    const next = isoShift(end, 1)
    if (getTamilDate(next)?.month.ino !== ino) break
    end = next
  }
  return {
    month: base.month,
    startISO: start,
    endISO: end,
    length: differenceInCalendarDays(parseISO(end), parseISO(start)) + 1,
  }
}

/** Tamil day-of-month number (1-based) for a Gregorian date. */
export function tamilDayOfMonth(dateStr: string | null | undefined): number | null {
  const span = getTamilMonthSpan(dateStr)
  if (!span || !dateStr) return null
  return differenceInCalendarDays(parseISO(dateStr), parseISO(span.startISO)) + 1
}

/** A Gregorian date that lands inside the previous/next Tamil month. */
export function shiftTamilMonth(dateStr: string, delta: 1 | -1): string {
  const span = getTamilMonthSpan(dateStr)
  if (!span) return dateStr
  return delta > 0 ? isoShift(span.endISO, 1) : isoShift(span.startISO, -1)
}
