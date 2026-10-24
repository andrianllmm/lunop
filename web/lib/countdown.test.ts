import { describe, expect, it } from "vitest"

import { countdowns } from "@/lib/countdown"
import { report } from "@/lib/test-utils"
import type { Depth, Level } from "@/lib/types"

const now = new Date("2026-10-24T12:00:00+08:00")
const at = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

describe("countdowns", () => {
  const cases: { name: string; level: Level; reports: [number, Depth, string?][]; start: number | null }[] = [
    { name: "2 knee reports, Normal → none", level: "Normal", reports: [[10, "knee"], [9, "knee"]], start: null },
    { name: "3 knee reports in 24 h → countdown", level: "Normal", reports: [[10, "knee"], [9, "waist"], [8, "chest"]], start: 10 },
    { name: "1 knee report, Elevated → countdown", level: "Elevated", reports: [[10, "knee"]], start: 10 },
    { name: "1 knee report, Normal → none", level: "Normal", reports: [[10, "knee"]], start: null },
    { name: "3 ankle reports → none", level: "Normal", reports: [[10, "ankle"], [9, "ankle"], [8, "ankle"]], start: null },
    { name: "3 reports from 2 devices → none", level: "Normal", reports: [[10, "knee", "x"], [9, "knee", "x"], [8, "knee", "y"]], start: null },
    { name: "3 reports spread over 25 h → none", level: "Normal", reports: [[30, "knee"], [20, "knee"], [5, "knee"]], start: null },
    { name: "starts at the first report of the window", level: "Normal", reports: [[40, "knee"], [20, "knee"], [10, "knee"], [5, "knee"]], start: 20 },
    { name: "expired after 72 h → none", level: "Elevated", reports: [[73, "knee"]], start: null },
    { name: "expired one, then a new one", level: "Elevated", reports: [[80, "knee"], [2, "knee"]], start: 2 },
    { name: "reports after now are ignored", level: "Elevated", reports: [[-1, "knee"]], start: null },
  ]

  it.each(cases)("$name", ({ level, reports, start }) => {
    const rs = reports.map(([h, depth, ip]) => report("A", at(h), depth, ip ? { ip_hash: ip } : {}))
    const c = countdowns(rs, level, now).get("A")
    if (start === null) {
      expect(c).toBeUndefined()
    } else {
      expect(c?.start).toBe(at(start))
      expect(c?.deadline).toBe(new Date(Date.parse(at(start)) + 72 * 3_600_000).toISOString())
    }
  })

  it("keeps barangays separate", () => {
    const rs = [report("A", at(3), "knee"), report("B", at(2), "knee"), report("B", at(1), "knee")]
    expect(countdowns(rs, "Normal", now).size).toBe(0)
  })
})
