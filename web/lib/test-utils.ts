import type { Barangay, Depth, FloodReport, Forecast, Level } from "@/lib/types"

export function barangay(psgc: string, over: Partial<Barangay> = {}): Barangay {
  return {
    psgc,
    name: psgc,
    area_km2: 1,
    pop: 1000,
    hazard_pct: 0,
    hazard_high_pct: 0,
    access30_pct: 100,
    travel_min: 5,
    hospital_dist_m: 500,
    water_dist_m: 100,
    bldg_density: 1000,
    ...over,
  }
}

let seq = 0

export function report(psgc: string, observed_at: string, depth: Depth, over: Partial<FloodReport> = {}): FloodReport {
  seq += 1
  return { client_id: `c${seq}`, observed_at, psgc, depth, waded: false, ip_hash: `ip${seq}`, ...over }
}

export function forecast(level: Level, rain_peak_date: string | null, over: Partial<Forecast> = {}): Forecast {
  return {
    issued: "2026-10-24",
    data_as_of: "2026-10-23",
    variant: "rain_only",
    level,
    ratio: 2,
    rain_peak_date,
    weeks: [
      { week_start: "2026-10-26", expected: 6, lo: 1, hi: 12, baseline: 4, ratio: 1.5 },
      { week_start: "2026-11-02", expected: 9, lo: 2, hi: 16, baseline: 4, ratio: 2.25 },
    ],
    drivers: [],
    ...over,
  }
}
