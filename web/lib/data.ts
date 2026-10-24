import type { Level } from "@/lib/types"

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

/** Keyed by forecast horizon in weeks ("1"–"4"). */
type ByHorizon = Record<string, number>

type AlertRates = { surges: number; hit_rate_high: number; false_alarm_high: number }

export type BacktestRow = { h: number; model: string; deviance: number; mae: number; deviance_iloilo: number; mae_iloilo: number }

export type LoeoEvent = {
  event_id: string
  date: string
  rain: number
  rain_clim: number
  surge: boolean | null
  surge_ratio: number | null
  level: { with_cases: Level | null; rain_only: Level | null }
  /** Forecast peak week minus observed peak week; negative is early. */
  peak_error_weeks: number | null
  mae_weeks_1_6: Record<"with_cases" | "rain_only" | "cases" | "seasonal", ByHorizon>
}

export type Correlation = { rho: number; lo: number; hi: number }

/** The parts of `performance.json` the UI reads. */
export type Performance = {
  data_end: string
  backtest: BacktestRow[]
  alerts_weekly: Record<"with_cases" | "rain_only", AlertRates>
  loeo: {
    summary: {
      events: number
      peak_error_abs_mean: number
      mae_weeks_1_6: Record<"with_cases" | "seasonal" | "cases", ByHorizon>
      mae_weeks_1_6_median: Record<"with_cases" | "seasonal" | "cases", ByHorizon>
      alerts_with_cases: AlertRates
      alerts_rain_only: AlertRates
    }
    by_event: LoeoEvent[]
  }
  replay_events: string[]
  event_study: Record<string, { events: number; ratio: Record<string, number> }>
  lag_curve: Record<"with_cases" | "rain_only", { lag: number; rr: number; lo: number; hi: number }[]>
  rain_check: { r: number; ratio: number; scale: number; n_weeks: number; weeks: [string, number, number][] }
  zamboanga: { barangays: number; cases: number } & Record<
    "hazard_pct" | "hazard_25yr" | "pop" | "score" | "hazard_pct_net_pop" | "hazard_25yr_net_pop",
    Correlation
  >
}
