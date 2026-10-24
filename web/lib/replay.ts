import { config, type Config } from "@/lib/config"
import { engineState, type EngineState } from "@/lib/state"
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

/** Engine state at the end of the local day; everything observed by then counts. */
export type ReplayDay = EngineState & {
  date: string
  rain: Map<string, number>
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
  const rain = new Map(bundle.psgc.map((p, i) => [p, bundle.rain_brgy[index][i]]))
  return { ...engineState(bulletin, barangays, bundle.reports, now, cfg), date, rain }
}
