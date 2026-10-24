import type { Feature, FeatureCollection, Point } from "geojson"

import { locate, type Barangays } from "@/lib/locate"
import { DAY_MS } from "@/lib/time"
import { DEPTHS, type Depth, type FloodReport } from "@/lib/types"

/** Reports older than this are rejected (TRD §7). */
export const MAX_AGE_DAYS = 7
/** Device clocks run a little fast; tolerate this much "future". */
export const CLOCK_SKEW_MS = 5 * 60_000
/** Reports per `ip_hash` per hour before 429. */
export const RATE_LIMIT_PER_HOUR = 5

/** A validated `POST /api/reports` body. */
export type ReportInput = {
  client_id: string
  observed_at: string
  lat: number | null
  lon: number | null
  psgc: string | null
  depth: Depth
  duration_h: number | null
  waded: boolean
}

/** A `flood_reports` row as `pg` returns it. */
export type ReportRow = Omit<FloodReport, "observed_at" | "simulated"> & { id: string; observed_at: Date }

export type ReportFeature = Feature<Point | null, FloodReport & { id: string }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const absent = (v: unknown) => v === undefined || v === null

/** Check a POST body. The honeypot is handled by the caller. */
export function parseReport(
  body: unknown,
  now: Date,
): { ok: true; value: ReportInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be a JSON object" }
  const b = body as Record<string, unknown>

  if (typeof b.client_id !== "string" || !UUID.test(b.client_id)) return { ok: false, error: "client_id must be a UUID" }

  const t = typeof b.observed_at === "string" ? Date.parse(b.observed_at) : NaN
  if (Number.isNaN(t)) return { ok: false, error: "observed_at must be an ISO timestamp" }
  if (t > now.getTime() + CLOCK_SKEW_MS) return { ok: false, error: "observed_at is in the future" }
  if (t < now.getTime() - MAX_AGE_DAYS * DAY_MS) return { ok: false, error: `observed_at is older than ${MAX_AGE_DAYS} days` }

  const hasGps = isNum(b.lat) && isNum(b.lon)
  if (!hasGps && !(absent(b.lat) && absent(b.lon))) return { ok: false, error: "lat and lon must both be numbers or both be absent" }
  if (hasGps && (Math.abs(b.lat as number) > 90 || Math.abs(b.lon as number) > 180)) return { ok: false, error: "lat/lon out of range" }

  if (!absent(b.psgc) && typeof b.psgc !== "string") return { ok: false, error: "psgc must be a string" }
  if (!hasGps && absent(b.psgc)) return { ok: false, error: "give a GPS location or a barangay" }

  if (!DEPTHS.includes(b.depth as Depth)) return { ok: false, error: `depth must be one of ${DEPTHS.join(", ")}` }
  if (!absent(b.duration_h) && !(isNum(b.duration_h) && b.duration_h >= 0)) return { ok: false, error: "duration_h must be a non-negative number" }
  if (typeof b.waded !== "boolean") return { ok: false, error: "waded must be true or false" }

  return {
    ok: true,
    value: {
      client_id: b.client_id.toLowerCase(),
      observed_at: new Date(t).toISOString(),
      lat: hasGps ? (b.lat as number) : null,
      lon: hasGps ? (b.lon as number) : null,
      psgc: (b.psgc as string | undefined) ?? null,
      depth: b.depth as Depth,
      duration_h: (b.duration_h as number | undefined) ?? null,
      waded: b.waded,
    },
  }
}

/**
 * Server-side barangay check: GPS wins when it falls inside the city, else the
 * picked barangay, which must exist. Null means reject.
 */
export function resolvePsgc(input: ReportInput, barangays: Barangays): string | null {
  if (input.lat !== null && input.lon !== null) {
    const hit = locate(barangays, input.lat, input.lon)
    if (hit) return hit
  }
  const known = barangays.features.some((f) => f.properties.psgc === input.psgc)
  return known ? input.psgc : null
}

/**
 * GeoJSON for `GET /api/reports`. Each `ip_hash` becomes an alias ("d1", "d2", …)
 * numbered within this response, so corroboration can still count distinct
 * devices without exposing the hash.
 */
export function toFeatureCollection(rows: ReportRow[]): FeatureCollection<Point | null, FloodReport & { id: string }> {
  const aliases = new Map<string, string>()
  const features = rows.map((r): ReportFeature => {
    if (!aliases.has(r.ip_hash)) aliases.set(r.ip_hash, `d${aliases.size + 1}`)
    return {
      type: "Feature",
      geometry: typeof r.lat === "number" && typeof r.lon === "number" ? { type: "Point", coordinates: [r.lon, r.lat] } : null,
      properties: {
        id: r.id,
        client_id: r.client_id,
        observed_at: r.observed_at.toISOString(),
        lat: r.lat,
        lon: r.lon,
        psgc: r.psgc,
        depth: r.depth,
        duration_h: r.duration_h,
        waded: r.waded,
        ip_hash: aliases.get(r.ip_hash)!,
      },
    }
  })
  return { type: "FeatureCollection", features }
}
