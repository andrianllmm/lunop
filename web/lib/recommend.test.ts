import { describe, expect, it } from "vitest"

import { config } from "@/lib/config"
import type { Countdown } from "@/lib/countdown"
import { rankBarangays } from "@/lib/priority"
import { recommend, type RecommendationId } from "@/lib/recommend"
import { seedSpots } from "@/lib/spots"
import { barangay, forecast } from "@/lib/test-utils"
import type { Level } from "@/lib/types"

const now = new Date("2026-10-24T12:00:00+08:00")
const barangays = [
  ...Array.from({ length: 12 }, (_, i) =>
    barangay(`H${String(i).padStart(2, "0")}`, { pop: 1000 + i * 100, hazard_pct: 10, hazard_high_pct: 10, access30_pct: i === 10 ? 20 : 100 }),
  ),
  barangay("Z", { hazard_pct: 0 }),
]
const ranked = rankBarangays(barangays, [], [], now)
const countdown: Countdown = {
  psgc: "Z",
  start: "2026-10-24T02:00:00.000Z",
  deadline: "2026-10-27T02:00:00.000Z",
  reason: "corroborated",
}

/** Seed every barangay with hazard, so the fixture's 10% counts. */
const seedCfg = { ...config, spots: { ...config.spots, seed_min_hazard_pct: 1 } }

/** Rain peak date `d` days before now. */
const peak = (d: number) => new Date(Date.parse("2026-10-24T00:00:00Z") - d * 86_400_000).toISOString().slice(0, 10)

function run(level: Level, d: number | null, opts: { countdown?: boolean; spots?: boolean } = {}) {
  return recommend({
    forecast: forecast(level, d === null ? null : peak(d)),
    ranked,
    countdowns: new Map(opts.countdown ? [["Z", countdown]] : []),
    spots: opts.spots ? seedSpots(barangays, seedCfg) : [],
    now,
  })
}

describe("recommend triggers", () => {
  const cases: { level: Level; d: number | null; countdown?: boolean; spots?: boolean; ids: RecommendationId[] }[] = [
    { level: "Normal", d: 1, ids: [] },
    { level: "Normal", d: 1, countdown: true, ids: ["prophylaxis", "advisory"] },
    { level: "Elevated", d: 0, ids: ["prophylaxis", "advisory", "hospital_readiness"] },
    { level: "Elevated", d: 3, ids: ["prophylaxis", "advisory", "hospital_readiness"] },
    { level: "Elevated", d: 4, ids: ["hospital_readiness"] },
    { level: "High", d: 4, ids: ["case_finding", "hospital_readiness"] },
    { level: "High", d: 10, ids: ["case_finding", "hospital_readiness"] },
    { level: "High", d: 11, ids: ["hospital_readiness"] },
    { level: "Elevated", d: -2, ids: ["pre_position", "hospital_readiness"] },
    { level: "Normal", d: -2, ids: [] },
    { level: "Normal", d: 11, spots: true, ids: ["drain_clearing"] },
    { level: "Normal", d: 10, spots: true, ids: [] },
    { level: "Severe", d: null, ids: ["hospital_readiness"] },
  ]

  it.each(cases)("$level, day $d, countdown $countdown, spots $spots → $ids", ({ level, d, ids, ...opts }) => {
    expect(run(level, d, opts).map((r) => r.id)).toEqual(ids)
  })
})

describe("prophylaxis", () => {
  it("targets the top N with hazard, sized by level", () => {
    for (const [level, n] of [["Elevated", 5], ["High", 10], ["Severe", 12]] as const) {
      expect(run(level, 1)[0].target).toHaveLength(n)
    }
    expect(run("Elevated", 1)[0].target.map((t) => t.psgc)).toEqual(["H11", "H10", "H09", "H08", "H07"])
  })

  it("adds counted-down barangays, with their own deadlines", () => {
    const [p] = run("Elevated", 1, { countdown: true })
    expect(p.target).toHaveLength(6)
    expect(p.target.at(-1)).toEqual({ psgc: "Z", name: "Z", deadline: countdown.deadline })
    // Peak was Oct 23 (PHT), so the level deadline is Oct 26 00:00 PHT
    expect(p.deadline).toBe("2026-10-25T16:00:00.000Z")
    expect(p.rationale).toBe("Elevated alert, 1 day after the rain peak; corroborated flood reports in 1 barangay")
  })

  it("sums dose ranges over targets", () => {
    // H07..H11: pop 1700..2100, hazard 10% → 10% of pop exposed; f_contact 0.1–0.3
    const [p] = run("Elevated", 1)
    expect(p.quantity).toEqual({ lo: 95, hi: 285, unit: "doses" })
  })

  it("comes with an EN/FIL advisory", () => {
    const advisory = run("Elevated", 1)[1]
    expect(advisory.message?.en).toMatch(/wading/)
    expect(advisory.message?.fil).toMatch(/baha/)
  })
})

describe("case finding", () => {
  it("puts access-flagged barangays first and spans days 3–10", () => {
    const [cf] = run("Severe", 5)
    expect(cf.target.slice(0, 2).map((t) => t.psgc)).toEqual(["H10", "H11"])
    expect(cf.window).toEqual(["2026-10-21T16:00:00.000Z", "2026-10-29T16:00:00.000Z"])
  })
})

describe("hospital readiness", () => {
  it("uses the week with the most expected cases", () => {
    const h = run("High", 4).find((r) => r.id === "hospital_readiness")!
    expect(h.quantity).toEqual({ lo: 2, hi: 16, unit: "expected cases" })
    expect(h.deadline).toBe("2026-11-01T16:00:00.000Z")
    expect(h.rationale).toBe("9 cases expected in the week of Nov 2 (80% interval 2–16), 2.25× the usual")
  })
})

describe("every recommendation", () => {
  it("has an action, rationale and source", () => {
    const all = [...run("Severe", 1, { countdown: true }), ...run("Severe", 5), ...run("Elevated", -1), ...run("Normal", 20, { spots: true })]
    for (const r of all) {
      expect(r.action).not.toBe("")
      expect(r.rationale).not.toBe("")
      expect(r.source).not.toBe("")
    }
  })
})
