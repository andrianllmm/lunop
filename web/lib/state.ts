import { config, type Config } from "@/lib/config"
import { countdowns, type Countdown } from "@/lib/countdown"
import { rankBarangays, type BarangayPriority } from "@/lib/priority"
import { recommend, type Recommendation } from "@/lib/recommend"
import { chronicSpots, type Spot } from "@/lib/spots"
import type { Barangay, FloodReport, Forecast } from "@/lib/types"

/** Decision engine output at one instant. */
export type EngineState = {
  now: Date
  bulletin: Forecast
  reports: FloodReport[]
  ranked: BarangayPriority[]
  countdowns: Map<string, Countdown>
  spots: Spot[]
  recommendations: Recommendation[]
}

/** Run the decision engine on a forecast and the reports observed by `now`. */
export function engineState(
  bulletin: Forecast,
  barangays: Barangay[],
  allReports: FloodReport[],
  now: Date,
  cfg: Config = config,
): EngineState {
  const reports = allReports.filter((r) => Date.parse(r.observed_at) <= now.getTime())
  const ranked = rankBarangays(barangays, reports, bulletin.weeks, now, cfg)
  const active = countdowns(reports, bulletin.level, now, cfg)
  const spots = chronicSpots(reports, barangays, now, cfg)
  const recommendations = recommend({ forecast: bulletin, ranked, countdowns: active, spots, now }, cfg)
  return { now, bulletin, reports, ranked, countdowns: active, spots, recommendations }
}
