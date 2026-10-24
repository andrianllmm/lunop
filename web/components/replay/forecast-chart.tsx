"use client"

import { Bar, ComposedChart, Area, CartesianGrid, Line, ReferenceLine, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { fmtDate } from "@/lib/format"
import type { ReplayBundle } from "@/lib/replay"
import type { Forecast } from "@/lib/types"

const chartConfig = {
  cases: { label: "Actual cases", color: "var(--chart-3)" },
  expected: { label: "Forecast", color: "var(--destructive)" },
  band: { label: "80% interval", color: "var(--destructive)" },
  baseline: { label: "Usual (seasonal)", color: "var(--muted-foreground)" },
} satisfies ChartConfig

/** Actual weekly cases over the event, with the forecast from the bulletin in force. */
export function ForecastChart({ bundle, bulletin }: { bundle: ReplayBundle; bulletin: Forecast }) {
  const rows = new Map<string, { week: string; cases?: number; baseline?: number; expected?: number; band?: [number, number] }>()
  for (const a of bundle.actual) rows.set(a.week_start, { week: a.week_start, cases: a.cases, baseline: a.baseline })
  for (const w of bulletin.weeks) {
    const row = rows.get(w.week_start) ?? { week: w.week_start, baseline: w.baseline }
    rows.set(w.week_start, { ...row, expected: w.expected, band: [w.lo, w.hi] })
  }
  const data = [...rows.values()].sort((a, b) => a.week.localeCompare(b.week))

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <ComposedChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickFormatter={(w: string) => fmtDate(w)} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={(w) => `Week of ${fmtDate(String(w), { year: "numeric" })}`} />}
        />
        <ReferenceLine x={bulletin.issued} stroke="var(--foreground)" strokeDasharray="3 3" label={{ value: "Issued", position: "insideTopLeft", className: "fill-muted-foreground text-xs" }} />
        <Bar dataKey="cases" fill="var(--color-cases)" fillOpacity={0.5} maxBarSize={40} isAnimationActive={false} />
        <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={0.15} isAnimationActive={false} />
        <Line dataKey="baseline" stroke="var(--color-baseline)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        <Line dataKey="expected" stroke="var(--color-expected)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  )
}
