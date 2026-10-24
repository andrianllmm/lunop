import raw from "@/public/data/config.json"

import type { Depth, Level } from "@/lib/types"

/** Every weight and assumption the decision engine uses (TRD §6). */
export type Config = {
  /** Philippine time, for calendar dates. */
  utc_offset_h: number
  priority: {
    depth_weight: Record<Depth, number>
    wade_weight: number
    report_saturation: number
    report_weight: number
    report_window_days: number
    access_top_pct: number
    access_max_pct: number
  }
  doses: {
    f_contact: [number, number]
    courses_per_person: number
    note: string
  }
  corroboration: {
    min_depth: Depth
    min_devices: number
    window_h: number
    single_report_level: Level
    countdown_h: number
  }
  recommend: {
    top_n: Record<Exclude<Level, "Normal">, number>
    prophylaxis_max_day: number
    case_finding_days: [number, number]
    drain_after_day: number
    stock_checklist: string[]
    advisory: { en: string; fil: string }
    advisory_audience: string
    sources: Record<
      "prophylaxis" | "advisory" | "case_finding" | "hospital_readiness" | "pre_position" | "drain_clearing",
      string
    >
  }
  spots: {
    min_depth: Depth
    geohash_precision: number
    min_dates: number
    window_days: number
    seed_min_hazard_pct: number
  }
}

export const config = raw as Config
