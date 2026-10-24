import { config, type Config } from "@/lib/config"
import type { Countdown } from "@/lib/countdown"
import type { BarangayPriority } from "@/lib/priority"
import type { Spot } from "@/lib/spots"
import { daysBetween, localMidnight } from "@/lib/time"
import { levelAtLeast, type Forecast } from "@/lib/types"

export type RecommendationId =
  | "prophylaxis"
  | "advisory"
  | "case_finding"
  | "hospital_readiness"
  | "pre_position"
  | "drain_clearing"

export type Target = { psgc: string; name: string; deadline?: string }

export type Recommendation = {
  id: RecommendationId
  action: string
  target: Target[]
  quantity: { lo: number; hi: number; unit: string } | null
  /** ISO datetime, or null when there is no deadline. */
  deadline: string | null
  rationale: string
  source: string
  /** Case finding dates, as ISO datetimes. */
  window?: [string, string]
  message?: { en: string; fil: string }
  checklist?: string[]
}

export type RecommendInput = {
  forecast: Forecast
  /** From `rankBarangays`, highest first. */
  ranked: BarangayPriority[]
  countdowns: Map<string, Countdown>
  spots: Spot[]
  now: Date
}

const fmtDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

function sumDoses(rows: BarangayPriority[]) {
  return rows.reduce(
    (q, r) => ({ ...q, lo: q.lo + r.doses[0], hi: q.hi + r.doses[1] }),
    { lo: 0, hi: 0, unit: "doses" },
  )
}

/** Recommendations for the current phase, most urgent first (TRD §6.4). */
export function recommend(
  { forecast, ranked, countdowns, spots, now }: RecommendInput,
  cfg: Config = config,
): Recommendation[] {
  const { top_n, prophylaxis_max_day, case_finding_days, drain_after_day, sources } = cfg.recommend
  const off = cfg.utc_offset_h
  const level = forecast.level
  const peak = forecast.rain_peak_date
  const d = peak === null ? null : daysBetween(peak, now, off)
  const elevated = levelAtLeast(level, "Elevated")
  const n = level === "Normal" ? 0 : top_n[level]
  const top = ranked.filter((r) => r.weight > 0).slice(0, n)
  const byPsgc = new Map(ranked.map((r) => [r.psgc, r]))
  const out: Recommendation[] = []

  // 0–72 h: prophylaxis and advisory
  const byLevel = elevated && d !== null && d >= 0 && d <= prophylaxis_max_day
  if (byLevel || countdowns.size > 0) {
    const levelDeadline = byLevel ? localMidnight(peak!, off, prophylaxis_max_day).toISOString() : undefined
    const targets = new Map<string, Target & { row?: BarangayPriority }>()
    if (byLevel) for (const r of top) targets.set(r.psgc, { psgc: r.psgc, name: r.name, deadline: levelDeadline, row: r })
    for (const c of countdowns.values()) {
      const row = byPsgc.get(c.psgc)
      const prev = targets.get(c.psgc)?.deadline
      const deadline = prev && prev < c.deadline ? prev : c.deadline
      targets.set(c.psgc, { psgc: c.psgc, name: row?.name ?? c.psgc, deadline, row })
    }
    const list = [...targets.values()]
    const target = list.map(({ psgc, name, deadline }) => ({ psgc, name, deadline }))
    const deadline = list.map((t) => t.deadline!).sort()[0]
    const reasons = [
      byLevel && `${level} alert, ${d} day${d === 1 ? "" : "s"} after the rain peak`,
      countdowns.size > 0 && `corroborated flood reports in ${countdowns.size} barangay${countdowns.size === 1 ? "" : "s"}`,
    ].filter(Boolean)
    const rationale = reasons.join("; ").replace(/^./, (c) => c.toUpperCase())

    out.push({
      id: "prophylaxis",
      action: "Give doxycycline",
      target,
      quantity: sumDoses(list.flatMap((t) => (t.row ? [t.row] : []))),
      deadline,
      rationale,
      source: sources.prophylaxis,
    })
    out.push({
      id: "advisory",
      action: "Send avoid-wading advisory",
      target,
      quantity: null,
      deadline,
      rationale: `${rationale}. Audience: ${cfg.recommend.advisory_audience.toLowerCase()}.`,
      source: sources.advisory,
      message: cfg.recommend.advisory,
    })
  }

  // Days 3–10: active case finding, poor-access barangays first
  const [cfFrom, cfTo] = case_finding_days
  if (levelAtLeast(level, "High") && d !== null && d > cfFrom && d <= cfTo) {
    const rows = [...top].sort((a, b) => Number(b.access_flag) - Number(a.access_flag))
    out.push({
      id: "case_finding",
      action: "Find cases door to door",
      target: rows.map((r) => ({ psgc: r.psgc, name: r.name })),
      quantity: null,
      deadline: localMidnight(peak!, off, cfTo + 1).toISOString(),
      window: [localMidnight(peak!, off, cfFrom).toISOString(), localMidnight(peak!, off, cfTo + 1).toISOString()],
      rationale: `${level} alert, ${d} days after the rain peak, when cases start to show`,
      source: sources.case_finding,
    })
  }

  // Storm forecast but not yet here: pre-position stock
  if (elevated && d !== null && d < 0) {
    out.push({
      id: "pre_position",
      action: "Pre-position doxycycline",
      target: top.map((r) => ({ psgc: r.psgc, name: r.name })),
      quantity: sumDoses(top),
      deadline: localMidnight(peak!, off).toISOString(),
      rationale: `${level} alert with heavy rain forecast for ${fmtDate(peak!)}`,
      source: sources.pre_position,
    })
  }

  // Hospital readiness for the peak week
  if (elevated && forecast.weeks.length > 0) {
    const week = forecast.weeks.reduce((a, b) => (b.expected > a.expected ? b : a))
    out.push({
      id: "hospital_readiness",
      action: "Ready hospitals for the peak week",
      target: [],
      quantity: { lo: week.lo, hi: week.hi, unit: "expected cases" },
      deadline: localMidnight(week.week_start, off).toISOString(),
      rationale: `${week.expected} cases expected in the week of ${fmtDate(week.week_start)} (80% interval ${week.lo}–${week.hi}), ${week.ratio}× the usual`,
      source: sources.hospital_readiness,
      checklist: cfg.recommend.stock_checklist,
    })
  }

  // After the flood: drains at chronic spots
  if (d !== null && d > drain_after_day && spots.length > 0) {
    const target = [...new Map(spots.map((s) => [s.psgc, { psgc: s.psgc, name: s.name }])).values()]
    out.push({
      id: "drain_clearing",
      action: "Clear drains at chronic flood spots",
      target,
      quantity: { lo: spots.length, hi: spots.length, unit: "spots" },
      deadline: null,
      rationale: `${d} days after the rain peak; these spots flood repeatedly`,
      source: sources.drain_clearing,
    })
  }

  return out
}
