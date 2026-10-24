export const LEVELS = ["Normal", "Elevated", "High", "Severe"] as const
export type Level = (typeof LEVELS)[number]

export const DEPTHS = ["ankle", "knee", "waist", "chest"] as const
export type Depth = (typeof DEPTHS)[number]

export function levelAtLeast(level: Level, min: Level) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(min)
}

export function depthAtLeast(depth: Depth, min: Depth) {
  return DEPTHS.indexOf(depth) >= DEPTHS.indexOf(min)
}

/** Properties of a feature in `barangays.geojson`. */
export type Barangay = {
  psgc: string
  name: string
  area_km2: number
  pop: number
  hazard_pct: number
  /** 100-yr high flood hazard, % of area; sizes exposure and doses. */
  hazard_high_pct: number
  access30_pct: number | null
  travel_min: number | null
  hospital_dist_m: number | null
  water_dist_m: number | null
  bldg_density: number | null
}

export const FACILITY_KINDS = ["hospital", "health_center", "bhs"] as const
export type FacilityKind = (typeof FACILITY_KINDS)[number]

/** Properties of a feature in `facilities.geojson` (OSM, context only). */
export type Facility = { name: string; kind: FacilityKind }

/** `facilities.geojson`, with the facility nearest each barangay's centroid keyed by psgc. */
export type FacilityCollection = GeoJSON.FeatureCollection<GeoJSON.Point, Facility> & {
  nearest: Record<string, Facility & { dist_m: number }>
}

export type FloodReport = {
  client_id: string
  observed_at: string
  lat?: number | null
  lon?: number | null
  psgc: string
  depth: Depth
  duration_h?: number | null
  waded: boolean
  ip_hash: string
  simulated?: boolean
}

export type ForecastWeek = {
  week_start: string
  expected: number
  lo: number
  hi: number
  baseline: number
  ratio: number
}

/** `forecast.json`, or one bulletin of a replay bundle. */
export type Forecast = {
  issued: string
  data_as_of: string
  variant: string
  level: Level
  ratio: number
  rain_peak_date: string | null
  weeks: ForecastWeek[]
  drivers: string[]
}
