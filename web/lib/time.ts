export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS

/** Calendar date (YYYY-MM-DD) of an instant in a fixed UTC offset. */
export function localDate(instant: Date | string, utcOffsetH: number) {
  const t = new Date(instant).getTime() + utcOffsetH * HOUR_MS
  return new Date(t).toISOString().slice(0, 10)
}

/** Whole days from date `from` to the local date of `now` (negative if `from` is later). */
export function daysBetween(from: string, now: Date, utcOffsetH: number) {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${localDate(now, utcOffsetH)}T00:00:00Z`)
  return Math.round((b - a) / DAY_MS)
}

/** Instant of local midnight starting `date`, shifted by `days`. */
export function localMidnight(date: string, utcOffsetH: number, days = 0) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - utcOffsetH * HOUR_MS + days * DAY_MS)
}
