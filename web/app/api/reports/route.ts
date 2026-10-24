import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import type { NextRequest } from "next/server"

import { config } from "@/lib/config"
import { db } from "@/lib/db"
import type { Barangays } from "@/lib/locate"
import { parseReport, RATE_LIMIT_PER_HOUR, resolvePsgc, toFeatureCollection, type ReportRow } from "@/lib/reports"
import { DAY_MS } from "@/lib/time"

let barangays: Promise<Barangays> | undefined
function loadBarangays() {
  barangays ??= readFile(path.join(process.cwd(), "public/data/barangays.geojson"), "utf8").then(JSON.parse)
  return barangays
}

function ipHash(request: NextRequest, salt: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
  return createHash("sha256").update(salt + ip).digest("hex")
}

const error = (status: number, message: string) => Response.json({ error: message }, { status })

/** File a community flood report (TRD §7). */
export async function POST(request: NextRequest) {
  const salt = process.env.IP_SALT
  if (!salt) return error(500, "IP_SALT is not set")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error(400, "body must be JSON")
  }

  // Honeypot: pretend to accept, then drop.
  const website = (body as { website?: unknown } | null)?.website
  if (typeof website === "string" && website !== "") return Response.json({})

  const parsed = parseReport(body, new Date())
  if (!parsed.ok) return error(400, parsed.error)
  const input = parsed.value

  const psgc = resolvePsgc(input, await loadBarangays())
  if (!psgc) return error(400, "location is not in a known barangay")

  const existing = await db.query("select id, psgc from flood_reports where client_id = $1", [input.client_id])
  if (existing.rows[0]) return Response.json(existing.rows[0])

  const hash = ipHash(request, salt)
  const recent = await db.query(
    "select count(*)::int as n from flood_reports where ip_hash = $1 and created_at > now() - interval '1 hour'",
    [hash],
  )
  if (recent.rows[0].n >= RATE_LIMIT_PER_HOUR) return error(429, "too many reports, try again later")

  const inserted = await db.query(
    `insert into flood_reports (client_id, observed_at, lat, lon, psgc, depth, duration_h, waded, ip_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (client_id) do nothing
     returning id, psgc`,
    [input.client_id, input.observed_at, input.lat, input.lon, psgc, input.depth, input.duration_h, input.waded, hash],
  )
  if (inserted.rows[0]) return Response.json(inserted.rows[0])

  // Lost a race with a resend of the same report.
  const again = await db.query("select id, psgc from flood_reports where client_id = $1", [input.client_id])
  return Response.json(again.rows[0])
}

/** Reports observed since `?since=` (default: the scoring window) as GeoJSON. */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("since")
  const since = param ? new Date(param) : new Date(Date.now() - config.priority.report_window_days * DAY_MS)
  if (Number.isNaN(since.getTime())) return error(400, "since must be an ISO timestamp")

  const { rows } = await db.query<ReportRow>(
    `select id, client_id, observed_at, lat, lon, psgc, depth, duration_h, waded, ip_hash
     from flood_reports where observed_at >= $1 order by observed_at`,
    [since.toISOString()],
  )
  return Response.json(toFeatureCollection(rows))
}
