import { describe, expect, it } from "vitest"

import type { BacktestRow } from "@/lib/data"
import { backtestTable, peakTiming } from "@/lib/methods"

const row = (model: string, h: number, deviance_iloilo: number, deviance = 1): BacktestRow => ({
  h,
  model,
  deviance,
  mae: 1,
  deviance_iloilo,
  mae_iloilo: 1,
})

const rows = [1, 2, 3, 4].flatMap((h) => [
  row("seasonal", h, 4),
  row("with_cases", h, 3),
  row("with_cases, from 2008", h, 5),
])

describe("backtestTable", () => {
  it("splits main models from ablations, keeping main order", () => {
    const t = backtestTable(rows, "iloilo", "deviance")
    expect(t.main.map((l) => l.model)).toEqual(["seasonal", "with_cases"])
    expect(t.ablations.map((l) => l.model)).toEqual(["with_cases, from 2008"])
  })

  it("computes change vs seasonal at the same horizon", () => {
    const t = backtestTable(rows, "iloilo", "deviance")
    expect(t.main[1].values).toEqual([3, 3, 3, 3])
    expect(t.main[1].change).toEqual([-0.25, -0.25, -0.25, -0.25])
    expect(t.main[0].change).toEqual([null, null, null, null])
    expect(t.ablations[0].change[0]).toBeCloseTo(0.25)
  })

  it("reads the all-cities columns", () => {
    expect(backtestTable(rows, "all", "deviance").main[0].values).toEqual([1, 1, 1, 1])
  })

  it("leaves missing horizons empty", () => {
    const t = backtestTable([row("seasonal", 1, 4), row("with_cases", 1, 2)], "iloilo", "deviance")
    expect(t.main[1].values).toEqual([2, null, null, null])
    expect(t.main[1].change).toEqual([-0.5, null, null, null])
  })
})

describe("peakTiming", () => {
  it.each([
    [-2, "2 wk early"],
    [0, "on time"],
    [1, "1 wk late"],
    [null, null],
  ])("%s → %s", (weeks, label) => {
    expect(peakTiming(weeks)).toBe(label)
  })
})
