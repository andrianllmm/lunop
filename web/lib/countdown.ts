import { config, type Config } from "@/lib/config"
import { HOUR_MS } from "@/lib/time"
import { depthAtLeast, levelAtLeast, type FloodReport, type Level } from "@/lib/types"

export type Countdown = {
  psgc: string
  /** observed_at of the first qualifying report. */
  start: string
  deadline: string
  reason: "corroborated" | "single_report"
}

/** Start times of every qualifying window, earliest first (TRD §6.3). */
function starts(reports: FloodReport[], level: Level, cfg: Config) {
  const { min_devices, window_h, single_report_level } = cfg.corroboration
  if (levelAtLeast(level, single_report_level)) {
    return reports.map((r) => ({ t: Date.parse(r.observed_at), reason: "single_report" as const }))
  }
  const out: { t: number; reason: "corroborated" }[] = []
  for (const r of reports) {
    const t = Date.parse(r.observed_at)
    const devices = new Set(
      reports
        .filter((o) => {
          const dt = Date.parse(o.observed_at) - t
          return dt >= 0 && dt <= window_h * HOUR_MS
        })
        .map((o) => o.ip_hash),
    )
    if (devices.size >= min_devices) out.push({ t, reason: "corroborated" })
  }
  return out
}

/**
 * Active 72-hour prophylaxis countdowns by barangay. Reports observed after `now`
 * are ignored, so the same function steps through a replay.
 */
export function countdowns(
  reports: FloodReport[],
  level: Level,
  now: Date,
  cfg: Config = config,
): Map<string, Countdown> {
  const { min_depth, countdown_h } = cfg.corroboration
  const end = now.getTime()
  const byPsgc = new Map<string, FloodReport[]>()
  for (const r of reports) {
    if (!depthAtLeast(r.depth, min_depth) || Date.parse(r.observed_at) > end) continue
    byPsgc.set(r.psgc, [...(byPsgc.get(r.psgc) ?? []), r])
  }

  const out = new Map<string, Countdown>()
  for (const [psgc, rs] of byPsgc) {
    rs.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
    const active = starts(rs, level, cfg).find(({ t }) => t + countdown_h * HOUR_MS > end)
    if (!active) continue
    out.set(psgc, {
      psgc,
      start: new Date(active.t).toISOString(),
      deadline: new Date(active.t + countdown_h * HOUR_MS).toISOString(),
      reason: active.reason,
    })
  }
  return out
}
