const TZ = "Asia/Manila"

/** "Jul 13" from a calendar date. */
export function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...opts,
  })
}

/** "Jul 16, 1:37 PM" in Philippine time from an ISO instant. */
export function fmtInstant(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  })
}

export function fmtRange(lo: number, hi: number) {
  const f = (n: number) => Math.round(n).toLocaleString("en-US")
  return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`
}
