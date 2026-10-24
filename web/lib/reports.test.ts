import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import type { Barangays } from "@/lib/locate"
import { parseReport, resolvePsgc, toFeatureCollection, type ReportInput, type ReportRow } from "@/lib/reports"

const barangays: Barangays = JSON.parse(readFileSync("public/data/barangays.geojson", "utf8"))

const now = new Date("2026-10-24T12:00:00+08:00")
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
const valid = {
  client_id: "05899549-bdd3-4446-a935-e26687e834fc",
  observed_at: hoursAgo(1),
  psgc: "PH063022026",
  depth: "knee",
  duration_h: 2,
  waded: true,
}

describe("parseReport", () => {
  it("accepts a dropdown report", () => {
    const r = parseReport(valid, now)
    expect(r).toEqual({ ok: true, value: { ...valid, lat: null, lon: null } })
  })

  it("accepts a GPS report without psgc", () => {
    const r = parseReport({ ...valid, psgc: undefined, lat: 10.77, lon: 122.58 }, now)
    expect(r.ok && r.value).toMatchObject({ lat: 10.77, lon: 122.58, psgc: null })
  })

  const bad: [string, Record<string, unknown>][] = [
    ["non-UUID client_id", { client_id: "abc" }],
    ["unparseable observed_at", { observed_at: "yesterday" }],
    ["observed_at in the future", { observed_at: hoursAgo(-1) }],
    ["observed_at older than 7 days", { observed_at: hoursAgo(7 * 24 + 1) }],
    ["only lat", { lat: 10.7 }],
    ["lat out of range", { lat: 91, lon: 122 }],
    ["no location at all", { psgc: undefined }],
    ["unknown depth", { depth: "neck" }],
    ["negative duration", { duration_h: -1 }],
    ["waded as string", { waded: "yes" }],
  ]
  it.each(bad)("rejects %s", (_, over) => {
    expect(parseReport({ ...valid, ...over }, now).ok).toBe(false)
  })

  it("tolerates a few minutes of device clock skew", () => {
    expect(parseReport({ ...valid, observed_at: hoursAgo(-0.05) }, now).ok).toBe(true)
  })

  it("rejects non-objects", () => {
    expect(parseReport(null, now).ok).toBe(false)
    expect(parseReport("x", now).ok).toBe(false)
  })
})

describe("resolvePsgc", () => {
  const input = (over: Partial<ReportInput>): ReportInput => ({
    client_id: valid.client_id,
    observed_at: valid.observed_at,
    lat: null,
    lon: null,
    psgc: null,
    depth: "knee",
    duration_h: null,
    waded: false,
    ...over,
  })

  it("prefers the barangay the GPS point falls in", () => {
    expect(resolvePsgc(input({ lat: 10.77045, lon: 122.57962, psgc: "PH063022001" }), barangays)).toBe("PH063022026")
  })

  it("falls back to the picked barangay when GPS is outside the city", () => {
    expect(resolvePsgc(input({ lat: 14.6, lon: 121, psgc: "PH063022001" }), barangays)).toBe("PH063022001")
  })

  it("rejects an unknown psgc", () => {
    expect(resolvePsgc(input({ psgc: "PH000000000" }), barangays)).toBeNull()
  })
})

describe("toFeatureCollection", () => {
  const row = (ip_hash: string, over: Partial<ReportRow> = {}): ReportRow => ({
    id: "r",
    client_id: valid.client_id,
    observed_at: new Date(valid.observed_at),
    lat: null,
    lon: null,
    psgc: "PH063022026",
    depth: "knee",
    duration_h: null,
    waded: false,
    ip_hash,
    ...over,
  })

  it("aliases ip_hash per response, keeping devices distinct", () => {
    const fc = toFeatureCollection([row("secret-a"), row("secret-b"), row("secret-a")])
    expect(fc.features.map((f) => f.properties.ip_hash)).toEqual(["d1", "d2", "d1"])
    expect(JSON.stringify(fc)).not.toContain("secret")
  })

  it("uses a Point when GPS is known, else null geometry", () => {
    const fc = toFeatureCollection([row("a", { lat: 10.7, lon: 122.5 }), row("b")])
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [122.5, 10.7] })
    expect(fc.features[1].geometry).toBeNull()
  })
})
