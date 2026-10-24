import { describe, expect, it } from "vitest"

import { geohash } from "@/lib/geohash"
import { chronicSpots, replaySpots, seedSpots } from "@/lib/spots"
import { barangay, report } from "@/lib/test-utils"
import type { Depth } from "@/lib/types"

const now = new Date("2026-10-24T12:00:00+08:00")
const here = { lat: 10.7203, lon: 122.5621 }
const barangays = [barangay("A", { name: "Alpha", hazard_pct: 14.3, water_dist_m: 0 }), barangay("B", { hazard_pct: 0.5 })]
const at = (observed_at: string, depth: Depth = "knee", over = {}) => report("A", observed_at, depth, { ...here, ...over })

describe("geohash", () => {
  it("matches known hashes", () => {
    expect(geohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj")
    expect(geohash(10.7203, 122.5621, 7)).toHaveLength(7)
  })
})

describe("chronicSpots", () => {
  it("needs knee-or-deeper reports on 3 distinct local dates", () => {
    const two = [at("2026-10-01T09:00:00+08:00"), at("2026-10-01T20:00:00+08:00"), at("2026-10-05T09:00:00+08:00")]
    expect(chronicSpots(two, barangays, now)).toEqual([])

    const three = [...two, at("2026-10-09T09:00:00+08:00")]
    const [spot] = chronicSpots(three, barangays, now)
    expect(spot).toMatchObject({
      id: geohash(here.lat, here.lon, 7),
      source: "reports",
      psgc: "A",
      name: "Alpha",
      dates: ["2026-10-01", "2026-10-05", "2026-10-09"],
      report_count: 4,
      simulated: false,
      context: { water_dist_m: 0, hazard_pct: 14.3 },
    })
  })

  it("uses Philippine dates, not UTC", () => {
    // 23:30 PHT and 00:30 PHT the next day are the same UTC date
    const rs = [at("2026-10-01T23:30:00+08:00"), at("2026-10-02T00:30:00+08:00"), at("2026-10-03T09:00:00+08:00")]
    expect(chronicSpots(rs, barangays, now)[0].dates).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"])
  })

  it("ignores ankle reports, reports without GPS, older than a year or after now", () => {
    const rs = [
      at("2026-10-01T09:00:00+08:00"),
      at("2026-10-02T09:00:00+08:00", "ankle"),
      at("2026-10-03T09:00:00+08:00", "knee", { lat: null, lon: null }),
      at("2025-10-20T09:00:00+08:00"),
      at("2026-10-25T09:00:00+08:00"),
    ]
    expect(chronicSpots(rs, barangays, now)).toEqual([])
  })

  it("keeps cells ~150 m apart separate", () => {
    const far = { lat: here.lat + 0.003 }
    const rs = [
      at("2026-10-01T09:00:00+08:00"),
      at("2026-10-02T09:00:00+08:00"),
      at("2026-10-03T09:00:00+08:00", "knee", far),
    ]
    expect(chronicSpots(rs, barangays, now)).toEqual([])
  })

  it("labels spots built only from simulated reports", () => {
    const rs = ["01", "02", "03"].map((d) => at(`2026-10-${d}T09:00:00+08:00`, "waist", { simulated: true }))
    expect(chronicSpots(rs, barangays, now)[0].simulated).toBe(true)
  })
})

describe("seedSpots", () => {
  it("lists NOAH hazard barangays above the threshold", () => {
    expect(seedSpots(barangays).map((s) => [s.id, s.source])).toEqual([["A", "noah"]])
  })
})

describe("replaySpots", () => {
  it("dates each replay from its own last report and keeps the richer copy of a cell", () => {
    // Years before `now`, so chronicSpots with today's date would drop them
    const older = ["01", "02", "03"].map((d) => at(`2011-08-${d}T09:00:00+08:00`, "knee", { simulated: true }))
    const newer = ["01", "02", "03", "04"].map((d) => at(`2012-06-${d}T09:00:00+08:00`, "knee", { simulated: true }))
    expect(chronicSpots([...older, ...newer], barangays, now)).toEqual([])

    const spots = replaySpots([older, newer, []], barangays)
    expect(spots).toHaveLength(1)
    expect(spots[0]).toMatchObject({ source: "reports", simulated: true, dates: ["2012-06-01", "2012-06-02", "2012-06-03", "2012-06-04"] })
  })
})
