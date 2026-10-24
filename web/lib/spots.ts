import { config, type Config } from "@/lib/config"
import { geohash } from "@/lib/geohash"
import { DAY_MS, localDate } from "@/lib/time"
import { depthAtLeast, type Barangay, type FloodReport } from "@/lib/types"

export type Spot = {
  /** Geohash cell for report spots, psgc for NOAH seeds. */
  id: string
  source: "reports" | "noah"
  psgc: string
  name: string
  lat: number | null
  lon: number | null
  dates: string[]
  report_count: number
  /** True when every report behind the spot is simulated. */
  simulated: boolean
  /** Why it may flood. Shown, not scored. */
  context: Pick<Barangay, "water_dist_m" | "bldg_density" | "hazard_pct">
}

function context(b: Barangay | undefined): Spot["context"] {
  return { water_dist_m: b?.water_dist_m ?? null, bldg_density: b?.bldg_density ?? null, hazard_pct: b?.hazard_pct ?? 0 }
}

function mode(values: string[]) {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

/** Cells with knee-or-deeper reports on enough distinct days in the past year (TRD §6.5). */
export function chronicSpots(
  reports: FloodReport[],
  barangays: Barangay[],
  now: Date,
  cfg: Config = config,
): Spot[] {
  const { min_depth, geohash_precision, min_dates, window_days } = cfg.spots
  const end = now.getTime()
  const start = end - window_days * DAY_MS
  const byPsgc = new Map(barangays.map((b) => [b.psgc, b]))

  const cells = new Map<string, FloodReport[]>()
  for (const r of reports) {
    const t = Date.parse(r.observed_at)
    if (r.lat == null || r.lon == null || !depthAtLeast(r.depth, min_depth) || t <= start || t > end) continue
    const cell = geohash(r.lat, r.lon, geohash_precision)
    cells.set(cell, [...(cells.get(cell) ?? []), r])
  }

  const spots: Spot[] = []
  for (const [cell, rs] of cells) {
    const dates = [...new Set(rs.map((r) => localDate(r.observed_at, cfg.utc_offset_h)))].sort()
    if (dates.length < min_dates) continue
    const psgc = mode(rs.map((r) => r.psgc))
    const b = byPsgc.get(psgc)
    spots.push({
      id: cell,
      source: "reports",
      psgc,
      name: b?.name ?? psgc,
      lat: rs.reduce((s, r) => s + r.lat!, 0) / rs.length,
      lon: rs.reduce((s, r) => s + r.lon!, 0) / rs.length,
      dates,
      report_count: rs.length,
      simulated: rs.every((r) => r.simulated),
      context: context(b),
    })
  }
  return spots.sort((a, b) => b.dates.length - a.dates.length || b.report_count - a.report_count)
}

/** Placeholder spots from NOAH hazard, shown until real reports accumulate. */
export function seedSpots(barangays: Barangay[], cfg: Config = config): Spot[] {
  return barangays
    .filter((b) => b.hazard_pct >= cfg.spots.seed_min_hazard_pct)
    .sort((a, b) => b.hazard_pct - a.hazard_pct)
    .map((b) => ({
      id: b.psgc,
      source: "noah",
      psgc: b.psgc,
      name: b.name,
      lat: null,
      lon: null,
      dates: [],
      report_count: 0,
      simulated: false,
      context: context(b),
    }))
}
