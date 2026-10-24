import { describe, expect, it } from "vitest"

import { cityExcess, doseRange, rankBarangays, reportScores } from "@/lib/priority"
import { barangay, forecast, report } from "@/lib/test-utils"

const now = new Date("2026-10-24T12:00:00+08:00")

describe("reportScores", () => {
  it("weights depth and wading, then saturates at 1", () => {
    const scores = reportScores(
      [
        report("A", "2026-10-24T08:00:00+08:00", "waist", { waded: true }), // 1.5
        report("A", "2026-10-23T08:00:00+08:00", "knee"), // 0.5
        report("B", "2026-10-24T08:00:00+08:00", "chest", { waded: true }), // 2.25 each
        ...Array.from({ length: 4 }, () => report("B", "2026-10-24T09:00:00+08:00", "chest", { waded: true })),
      ],
      now,
    )
    expect(scores.get("A")).toEqual({ score: 0.2, count: 2 })
    expect(scores.get("B")).toEqual({ score: 1, count: 5 })
  })

  it("counts only reports observed in the last 7 days and not after now", () => {
    const scores = reportScores(
      [
        report("A", "2026-10-17T12:00:00+08:00", "waist"), // exactly 7 days: excluded
        report("A", "2026-10-17T13:00:00+08:00", "waist"),
        report("A", "2026-10-24T13:00:00+08:00", "waist"), // future
      ],
      now,
    )
    expect(scores.get("A")).toEqual({ score: 0.1, count: 1 })
  })
})

describe("cityExcess", () => {
  it("sums expected minus baseline and floors at 0", () => {
    expect(cityExcess(forecast("High", null).weeks)).toBe(7)
    expect(cityExcess([{ week_start: "x", expected: 1, lo: 0, hi: 2, baseline: 3, ratio: 0.3 }])).toBe(0)
  })
})

describe("doseRange", () => {
  it("is pop × H/100 × f_contact × courses", () => {
    // 3000 × 14.3% = 429 in hazard; × 0.1 and × 0.3
    expect(doseRange(3000, 14.3)).toEqual({ exposed: [43, 129], doses: [43, 129] })
  })
})

describe("rankBarangays", () => {
  const barangays = [
    barangay("A", { pop: 3000, hazard_pct: 10 }), // W = 0.1 × 3000 = 300
    barangay("B", { pop: 2000, hazard_pct: 0 }), // W = 0.5 × 0.2 × 2000 = 200
    barangay("C", { pop: 4000, hazard_pct: 5, access30_pct: 40 }), // W = 0.05 × 4000 = 200, more pop
    barangay("D", { pop: 9000, hazard_pct: 0 }), // W = 0
    barangay("E", { pop: 1000, hazard_pct: 0, access30_pct: 10 }), // W = 0
  ]
  const reports = [
    report("B", "2026-10-24T08:00:00+08:00", "waist", { waded: true }),
    report("B", "2026-10-23T08:00:00+08:00", "knee"),
  ]
  const ranked = rankBarangays(barangays, reports, forecast("High", null).weeks, now)

  it("ranks by W_b, breaking ties by population", () => {
    expect(ranked.map((r) => [r.psgc, r.weight, r.rank])).toEqual([
      ["A", 300, 1],
      ["C", 200, 2],
      ["B", 200, 3],
      ["D", 0, 4],
      ["E", 0, 5],
    ])
  })

  it("gives percentiles, with ties sharing one", () => {
    expect(ranked.map((r) => r.priority)).toEqual([100, 50, 50, 0, 0])
  })

  it("splits city excess by W_b share", () => {
    expect(ranked.map((r) => r.excess)).toEqual([3, 2, 2, 0, 0])
  })

  it("flags poor access only in the top quarter", () => {
    const flagged = rankBarangays(
      barangays.map((b) => (b.psgc === "A" ? { ...b, access30_pct: 20 } : b)),
      reports,
      [],
      now,
    ).filter((r) => r.access_flag)
    expect(flagged.map((r) => r.psgc)).toEqual(["A"])
  })
})
