import { describe, expect, it } from "vitest"

import { reportRoles, within } from "@/lib/report-roles"
import { engineState } from "@/lib/state"
import { barangay, forecast, report } from "@/lib/test-utils"

const now = new Date("2026-10-24T12:00:00+08:00")
const here = { lat: 10.7203, lon: 122.5621 }
const barangays = [barangay("A"), barangay("B")]

describe("reportRoles", () => {
  it("marks knee-or-deeper reports in a counted-down barangay", () => {
    // Elevated: one knee report starts a countdown
    const rs = [report("A", "2026-10-23T09:00:00+08:00", "knee", here), report("A", "2026-10-23T10:00:00+08:00", "ankle", here)]
    const roles = reportRoles(engineState(forecast("Elevated", null), barangays, rs, now))
    expect(roles.get(rs[0].client_id)).toEqual({ countdown: true, spot: false })
    expect(roles.get(rs[1].client_id)).toEqual({ countdown: false, spot: false })
  })

  it("marks reports in a repeat flood spot cell", () => {
    const rs = ["01", "05", "09"].map((d) => report("B", `2026-10-${d}T09:00:00+08:00`, "knee", here))
    const roles = reportRoles(engineState(forecast("Normal", null), barangays, rs, now))
    expect([...roles.values()]).toEqual(rs.map(() => ({ countdown: false, spot: true })))
  })
})

describe("within", () => {
  it("keeps the window, newest first", () => {
    const rs = ["2026-10-10", "2026-10-20", "2026-10-23", "2026-10-25"].map((d) => report("A", `${d}T09:00:00+08:00`, "knee"))
    expect(within(rs, now, 7).map((r) => r.observed_at.slice(0, 10))).toEqual(["2026-10-23", "2026-10-20"])
  })
})
