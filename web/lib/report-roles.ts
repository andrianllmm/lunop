import { config, type Config } from "@/lib/config"
import { geohash } from "@/lib/geohash"
import type { EngineState } from "@/lib/state"
import { DAY_MS } from "@/lib/time"
import { depthAtLeast, type FloodReport } from "@/lib/types"

export type ReportRoles = { countdown: boolean; spot: boolean }

/**
 * Which engine outputs each report feeds, by client_id: an active countdown in its barangay
 * (knee-or-deeper, observed since that countdown started) or a repeat flood spot (its cell).
 */
export function reportRoles(state: EngineState, cfg: Config = config): Map<string, ReportRoles> {
  const cells = new Set(state.spots.filter((s) => s.source === "reports").map((s) => s.id))
  const out = new Map<string, ReportRoles>()
  for (const r of state.reports) {
    const c = state.countdowns.get(r.psgc)
    const countdown =
      !!c && depthAtLeast(r.depth, cfg.corroboration.min_depth) && Date.parse(r.observed_at) >= Date.parse(c.start)
    const spot =
      r.lat != null &&
      r.lon != null &&
      depthAtLeast(r.depth, cfg.spots.min_depth) &&
      cells.has(geohash(r.lat, r.lon, cfg.spots.geohash_precision))
    out.set(r.client_id, { countdown, spot })
  }
  return out
}

/** Reports observed in the `days` before `now`, newest first. */
export function within(reports: FloodReport[], now: Date, days: number) {
  const start = now.getTime() - days * DAY_MS
  return reports
    .filter((r) => {
      const t = Date.parse(r.observed_at)
      return t > start && t <= now.getTime()
    })
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))
}
