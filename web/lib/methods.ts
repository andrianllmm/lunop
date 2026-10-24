import type { BacktestRow } from "@/lib/data"

export const HORIZONS = [1, 2, 3, 4] as const

/** Deployed variants and their baselines, in table order (TRD §5.1). */
export const MAIN_MODELS: Record<string, string> = {
  seasonal: "Usual for the week (seasonal)",
  "seasonal + recent cases": "Seasonal + recent cases",
  with_cases: "Rain + recent cases (replay)",
  rain_only: "Rain only (live)",
  "rain_only, Open-Meteo rain": "Rain only, on live rain source",
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
    return { model, label: MAIN_MODELS[model] ?? model, values, change }
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
