import { config, type Config } from "@/lib/config"
import { DAY_MS } from "@/lib/time"
import type { Barangay, FloodReport, ForecastWeek } from "@/lib/types"

export type Range = [number, number]

export type BarangayPriority = {
  psgc: string
  name: string
  pop: number
  /** H_b: share of area in the NOAH 100-yr flood hazard (any level), 0–100. */
  hazard: number
  /** R_b: recent report score, 0–1. */
  report_score: number
  report_count: number
  /** W_b: estimated exposure weight. */
  weight: number
  /** Percentile of W_b, 0–100. */
  priority: number
  rank: number
  /** This barangay's share of the city's excess cases. */
  excess: number
  exposed: Range
  doses: Range
  access30_pct: number | null
  access_flag: boolean
}

/** R_b and count of reports observed in the window ending at `now`, by psgc (TRD §6.1). */
export function reportScores(reports: FloodReport[], now: Date, cfg: Config = config) {
  const { depth_weight, wade_weight, report_saturation, report_window_days } = cfg.priority
  const end = now.getTime()
  const start = end - report_window_days * DAY_MS
  const sums = new Map<string, { sum: number; count: number }>()
  for (const r of reports) {
    const t = Date.parse(r.observed_at)
    if (t <= start || t > end) continue
    const s = sums.get(r.psgc) ?? { sum: 0, count: 0 }
    s.sum += depth_weight[r.depth] * (r.waded ? wade_weight : 1)
    s.count += 1
    sums.set(r.psgc, s)
  }
  const out = new Map<string, { score: number; count: number }>()
  for (const [psgc, s] of sums) out.set(psgc, { score: Math.min(1, s.sum / report_saturation), count: s.count })
  return out
}

/** Expected cases above baseline over the forecast weeks, never negative. */
export function cityExcess(weeks: ForecastWeek[]) {
  return Math.max(0, weeks.reduce((sum, w) => sum + w.expected - w.baseline, 0))
}

/** Planning range of people exposed and doses needed (TRD §6.2). */
export function doseRange(pop: number, hazard: number, cfg: Config = config) {
  const [lo, hi] = cfg.doses.f_contact
  const exposed: Range = [Math.round((pop * hazard * lo) / 100), Math.round((pop * hazard * hi) / 100)]
  const doses: Range = [exposed[0] * cfg.doses.courses_per_person, exposed[1] * cfg.doses.courses_per_person]
  return { exposed, doses }
}

/** Barangays ranked by W_b, highest first. */
export function rankBarangays(
  barangays: Barangay[],
  reports: FloodReport[],
  weeks: ForecastWeek[],
  now: Date,
  cfg: Config = config,
): BarangayPriority[] {
  const { report_weight, access_top_pct, access_max_pct } = cfg.priority
  const scores = reportScores(reports, now, cfg)
  const rows = barangays.map((b) => {
    const r = scores.get(b.psgc) ?? { score: 0, count: 0 }
    return { b, r, weight: (b.hazard_pct / 100 + report_weight * r.score) * b.pop }
  })
  const total = rows.reduce((sum, row) => sum + row.weight, 0)
  const excess = cityExcess(weeks)
  const weights = rows.map((row) => row.weight)
  const n = rows.length

  return rows
    .map(({ b, r, weight }) => {
      const below = weights.filter((w) => w < weight).length
      const priority = n > 1 ? (100 * below) / (n - 1) : 100
      return {
        psgc: b.psgc,
        name: b.name,
        pop: b.pop,
        hazard: b.hazard_pct,
        report_score: r.score,
        report_count: r.count,
        weight,
        priority,
        rank: 0,
        excess: total > 0 ? (excess * weight) / total : 0,
        ...doseRange(b.pop, b.hazard_pct, cfg),
        access30_pct: b.access30_pct,
        access_flag:
          weight > 0 && priority >= access_top_pct && b.access30_pct !== null && b.access30_pct < access_max_pct,
      }
    })
    .sort((a, b) => b.weight - a.weight || b.pop - a.pop || a.psgc.localeCompare(b.psgc))
    .map((row, i) => ({ ...row, rank: i + 1 }))
}
