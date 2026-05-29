import { MhahPanchang } from 'mhah-panchang'

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
