import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { locate, type Barangays } from "@/lib/locate"

const barangays: Barangays = JSON.parse(readFileSync("public/data/barangays.geojson", "utf8"))

describe("locate", () => {
  it("finds the barangay containing a point", () => {
    // A simulated report from the 2012 replay bundle.
    expect(locate(barangays, 10.77045, 122.57962)).toBe("PH063022026")
  })

  it("returns null outside the city", () => {
    expect(locate(barangays, 14.5995, 120.9842)).toBeNull()
  })
})
