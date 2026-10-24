import { describe, expect, it } from "vitest"

import { bulletinOn, replayDay, type ReplayBundle } from "@/lib/replay"
import { barangay, forecast, report } from "@/lib/test-utils"

const bundle: ReplayBundle = {
  event_id: "e",
  date: "2026-10-05",
  title: "Week of Oct 5",
  outcome: "hit",
  rain_week_mm: 100,
  rain_clim_mm: 50,
  actual: [],
  bulletins: [
    forecast("Normal", "2026-10-06", { issued: "2026-09-28" }),
    forecast("High", "2026-10-06", { issued: "2026-10-05" }),
  ],
  days: [
    { date: "2026-09-28", rain: 1 },
    { date: "2026-10-05", rain: 30 },
    { date: "2026-10-06", rain: 80 },
  ],
  psgc: ["A", "B"],
  rain_brgy: [
    [1, 2],
    [30, 31],
    [80, 81],
  ],
  reports: [
    report("A", "2026-10-06T09:00:00+08:00", "knee"),
    report("A", "2026-10-06T23:30:00+08:00", "waist"),
    report("B", "2026-10-07T01:00:00+08:00", "knee"),
  ],
}
const barangays = [barangay("A", { hazard_pct: 50 }), barangay("B", { hazard_pct: 20 })]

describe("bulletinOn", () => {
  it("picks the latest bulletin issued by the date", () => {
    expect(bulletinOn(bundle.bulletins, "2026-10-04").issued).toBe("2026-09-28")
    expect(bulletinOn(bundle.bulletins, "2026-10-05").issued).toBe("2026-10-05")
    expect(bulletinOn(bundle.bulletins, "2026-10-20").issued).toBe("2026-10-05")
  })
})

describe("replayDay", () => {
  it("counts reports observed by the end of the local day", () => {
    const day = replayDay(bundle, barangays, 2)
    expect(day.reports.map((r) => r.psgc)).toEqual(["A", "A"])
    expect(day.now.toISOString()).toBe("2026-10-06T15:59:59.999Z")
  })

  it("reads that day's rain by barangay", () => {
    expect(replayDay(bundle, barangays, 1).rain.get("B")).toBe(31)
  })

  it("starts a countdown once the alert is Elevated", () => {
    expect(replayDay(bundle, barangays, 0).countdowns.size).toBe(0)
    const day = replayDay(bundle, barangays, 2)
    expect(day.bulletin.level).toBe("High")
    expect(day.countdowns.get("A")?.start).toBe("2026-10-06T01:00:00.000Z")
    expect(day.recommendations.map((r) => r.id)).toContain("prophylaxis")
  })
})
