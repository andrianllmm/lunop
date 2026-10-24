import { config, type Config } from "@/lib/config"
import { countdowns, type Countdown } from "@/lib/countdown"
import { rankBarangays, type BarangayPriority } from "@/lib/priority"
import { recommend, type Recommendation } from "@/lib/recommend"
import { chronicSpots, type Spot } from "@/lib/spots"
import { localMidnight } from "@/lib/time"
import type { Barangay, FloodReport, Forecast } from "@/lib/types"

/** One entry of `replay/index.json`. */
export type ReplayEvent = {
  event_id: string
  date: string
  title: string
  outcome: "hit" | "miss" | "false_alarm"
  rain_week_mm: number
}

/** `replay/{event_id}.json`. */
export type ReplayBundle = ReplayEvent & {
  rain_clim_mm: number
  actual: { week_start: string; cases: number; baseline: number }[]
  /** Weekly bulletins, issued on each Monday of the window. */
  bulletins: Forecast[]
  /** City mean rain per day. */
  days: { date: string; rain: number }[]
  /** Barangay order of `rain_brgy` rows. */
  psgc: string[]
  /** Rain per day per barangay, mm. */
  rain_brgy: number[][]
  reports: FloodReport[]
}

export type ReplayDay = {
  date: string
  /** End of the local day; everything observed by then counts. */
  now: Date
  bulletin: Forecast
  rain: Map<string, number>
  reports: FloodReport[]
  ranked: BarangayPriority[]
  countdowns: Map<string, Countdown>
  spots: Spot[]
  recommendations: Recommendation[]
}

/** The latest bulletin issued on or before `date`. */
export function bulletinOn(bulletins: Forecast[], date: string) {
  return bulletins.reduce((cur, b) => (b.issued <= date && b.issued >= cur.issued ? b : cur), bulletins[0])
}

/** Decision engine state at the end of day `index` of a replay. */
export function replayDay(bundle: ReplayBundle, barangays: Barangay[], index: number, cfg: Config = config): ReplayDay {
  const { date } = bundle.days[index]
  const now = new Date(localMidnight(date, cfg.utc_offset_h, 1).getTime() - 1)
  const bulletin = bulletinOn(bundle.bulletins, date)
  const reports = bundle.reports.filter((r) => Date.parse(r.observed_at) <= now.getTime())
  const rain = new Map(bundle.psgc.map((p, i) => [p, bundle.rain_brgy[index][i]]))
  const ranked = rankBarangays(barangays, reports, bulletin.weeks, now, cfg)
  const active = countdowns(reports, bulletin.level, now, cfg)
  const spots = chronicSpots(reports, barangays, now, cfg)
  const recommendations = recommend({ forecast: bulletin, ranked, countdowns: active, spots, now }, cfg)
  return { date, now, bulletin, rain, reports, ranked, countdowns: active, spots, recommendations }
}
