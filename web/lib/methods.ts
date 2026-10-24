import type { BacktestRow } from "@/lib/data"

export const HORIZONS = [1, 2, 3, 4] as const

/** Deployed variants and their baselines, in table order (TRD §5.1). */
export const MAIN_MODELS: Record<string, string> = {
  seasonal: "Assume a normal week (baseline)",
  "seasonal + recent cases": "Normal week + last 2 weeks' cases",
  with_cases: "LUNOP with recent cases (used in Replay)",
  rain_only: "LUNOP live forecast (rain only)",
  "rain_only, Open-Meteo rain": "LUNOP live forecast, on live rain data",
}

/** Plain names for the variants tried and not deployed. */
const ABLATIONS: Record<string, string> = {
  "seasonal, from 2008": "Normal week, trained from 2008",
  "with_cases, from 2008": "With recent cases, trained from 2008",
  "with_cases, from 2008, no Sendong-era weeks": "With recent cases, from 2008, without the 2011–12 outbreak",
  "rain_only, from 2008": "Live forecast, trained from 2008",
  "with_cases + Iloilo rain slope": "With recent cases + a rain effect just for Iloilo",
}

export type BacktestScope = "iloilo" | "all"
export type BacktestMetric = "deviance" | "mae"

export type BacktestLine = {
  model: string
  label: string
  /** One value per horizon, lower is better. */
  values: (number | null)[]
  /** Change vs seasonal at the same horizon (−0.15 = 15% better); null for seasonal itself. */
  change: (number | null)[]
}

/** Back-test table rows, main models first, the rest as ablations. */
export function backtestTable(rows: BacktestRow[], scope: BacktestScope, metric: BacktestMetric) {
  const key = scope === "iloilo" ? (`${metric}_iloilo` as const) : metric
  const value = (model: string, h: number) => rows.find((r) => r.model === model && r.h === h)?.[key] ?? null

  const line = (model: string): BacktestLine => {
    const values = HORIZONS.map((h) => value(model, h))
    const change = HORIZONS.map((h, i) => {
      const base = value("seasonal", h)
      const v = values[i]
      return model === "seasonal" || v === null || !base ? null : v / base - 1
    })
    return { model, label: MAIN_MODELS[model] ?? ABLATIONS[model] ?? model, values, change }
  }

  const models = [...new Set(rows.map((r) => r.model))]
  return {
    main: Object.keys(MAIN_MODELS).filter((m) => models.includes(m)).map(line),
    ablations: models.filter((m) => !(m in MAIN_MODELS)).map(line),
  }
}

/** "2 wk early", "on time", "1 wk late". */
export function peakTiming(weeks: number | null) {
  if (weeks === null) return null
  if (weeks === 0) return "on time"
  return `${Math.abs(weeks)} wk ${weeks < 0 ? "early" : "late"}`
}
