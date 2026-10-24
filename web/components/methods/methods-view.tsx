"use client"

import { useEffect, useMemo, useState } from "react"
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getJSON, type Correlation, type Performance } from "@/lib/data"
import { fmtDate } from "@/lib/format"
import { backtestTable, HORIZONS, peakTiming, type BacktestLine, type BacktestMetric, type BacktestScope } from "@/lib/methods"

const pct = (x: number) => `${Math.round(x * 100)}%`
const signedPct = (x: number) => `${x < 0 ? "−" : "+"}${Math.abs(Math.round(x * 100))}%`
const times = (x: number) => `${x.toFixed(1)}×`
/** Two decimals without a "−0.00". */
const fixed2 = (x: number) => (Math.abs(x) < 0.005 ? 0 : x).toFixed(2)
const ILOILO = "Iloilo City"

export function MethodsView() {
  const [perf, setPerf] = useState<Performance | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getJSON<Performance>("/data/performance.json")
      .then(setPerf)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load the validation results</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!perf) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-80 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm text-muted-foreground">
        Every number here comes from the back-test in <code>performance.json</code>, built by{" "}
        <code>pipeline/lunop/modeling/evaluate.py</code>. Case data runs to {fmtDate(perf.data_end, { year: "numeric" })}.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <EventStudy perf={perf} />
        <LagCurve perf={perf} />
      </div>
      <RainCheck perf={perf} />
      <LeaveOneEventOut perf={perf} />
      <Backtest perf={perf} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Zamboanga perf={perf} />
        <Dropped perf={perf} />
      </div>
      <Limitations perf={perf} />
    </div>
  )
}

const eventConfig = {
  iloilo: { label: "Iloilo City", color: "var(--chart-2)" },
  all: { label: "All 12 cities", color: "var(--muted-foreground)" },
} satisfies ChartConfig

function EventStudy({ perf }: { perf: Performance }) {
  const all = perf.event_study.all
  const iloilo = perf.event_study[ILOILO]
  const data = Object.keys(all.ratio)
    .map(Number)
    .sort((a, b) => a - b)
    .map((week) => ({ week, all: all.ratio[week], iloilo: iloilo?.ratio[week] }))
  const peak = data.reduce((a, b) => (b.all > a.all ? b : a))
  const top = Math.ceil(Math.max(...data.flatMap((d) => [d.all, d.iloilo ?? 0])))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event study</CardTitle>
        <CardDescription>
          Cases compared with the usual for that week, around each city&apos;s heaviest 2% of rain weeks ({all.events} events;{" "}
          {iloilo?.events ?? 0} in Iloilo).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ChartContainer config={eventConfig} className="aspect-auto h-56 w-full">
          <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickFormatter={(w: number) => (w === 0 ? "Rain" : w > 0 ? `+${w}` : String(w))}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, top]}
              ticks={Array.from({ length: top + 1 }, (_, i) => i)}
              tickFormatter={(v: number) => `${v}×`}
            />
            <ReferenceLine y={1} stroke="var(--foreground)" strokeDasharray="3 3" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => {
                    const w = Number(p?.[0]?.payload?.week)
                    return w === 0 ? "Heavy-rain week" : `${Math.abs(w)} wk ${w > 0 ? "after" : "before"}`
                  }}
                  formatter={(v, name) => `${eventConfig[name as keyof typeof eventConfig].label}: ${times(Number(v))}`}
                />
              }
            />
            <Line dataKey="all" stroke="var(--color-all)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line dataKey="iloilo" stroke="var(--color-iloilo)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
        <p className="text-sm">
          Cases reach <strong>{times(peak.all)}</strong> the usual level {peak.week} weeks after heavy rain. The dashed line at
          1× is a normal week.
        </p>
      </CardContent>
    </Card>
  )
}

const lagConfig = {
  rr: { label: "Rate ratio", color: "var(--chart-2)" },
  band: { label: "95% CI", color: "var(--chart-2)" },
} satisfies ChartConfig

function LagCurve({ perf }: { perf: Performance }) {
  const [variant, setVariant] = useState<"rain_only" | "with_cases">("rain_only")
  const curve = perf.lag_curve[variant]
  const data = curve.map((p) => ({ lag: p.lag, rr: p.rr, band: [p.lo, p.hi] }))
  const peak = curve.reduce((a, b) => (b.rr > a.rr ? b : a))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rain lag curve</CardTitle>
        <CardDescription>How much rain k weeks earlier raises expected cases, per step of log rain.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Tabs value={variant} onValueChange={(v) => setVariant(v as typeof variant)}>
          <TabsList>
            <TabsTrigger value="rain_only">Rain only (live)</TabsTrigger>
            <TabsTrigger value="with_cases">Rain + recent cases</TabsTrigger>
          </TabsList>
        </Tabs>
        <ChartContainer config={lagConfig} className="aspect-auto h-44 w-full">
          <ComposedChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="lag" tickLine={false} axisLine={false} tickFormatter={(k: number) => `${k} wk`} />
            <YAxis tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
            <ReferenceLine y={1} stroke="var(--foreground)" strokeDasharray="3 3" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => `Rain ${p?.[0]?.payload?.lag} weeks earlier`}
                  formatter={(v, name) =>
                    name === "band"
                      ? `95% CI: ${(v as number[]).map((x) => x.toFixed(2)).join("–")}`
                      : `Rate ratio: ${Number(v).toFixed(2)}`
                  }
                />
              }
            />
            <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={0.15} isAnimationActive={false} />
            <Line dataKey="rr" stroke="var(--color-rr)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ChartContainer>
        <p className="text-sm">
          Rain matters most <strong>{peak.lag} weeks</strong> before: rate ratio {peak.rr.toFixed(2)} (95% CI {peak.lo.toFixed(2)}–
          {peak.hi.toFixed(2)}). Above 1 means more rain, more cases.
        </p>
      </CardContent>
    </Card>
  )
}

const rainConfig = { om: { label: "Week", color: "var(--chart-2)" } } satisfies ChartConfig

function RainCheck({ perf }: { perf: Performance }) {
  const rc = perf.rain_check
  const data = useMemo(() => rc.weeks.map(([week, cchain, om]) => ({ week, cchain, om })), [rc.weeks])
  const max = Math.ceil(Math.max(...data.map((d) => Math.max(d.cchain, d.om))) / 50) * 50
  const passes = rc.r >= 0.9 && rc.ratio >= 0.9 && rc.ratio <= 1.1

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rain source check</CardTitle>
        <CardDescription>
          The model learned from CCHAIN rain but runs live on Open-Meteo. Weekly Iloilo rain from both, {rc.n_weeks} weeks.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <ChartContainer config={rainConfig} className="aspect-square max-h-80 w-full">
          <ScatterChart margin={{ left: -8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid />
            <XAxis
              type="number"
              dataKey="cchain"
              name="CCHAIN"
              domain={[0, max]}
              tickLine={false}
              axisLine={false}
              label={{ value: "CCHAIN (mm/week)", position: "insideBottom", offset: -4, className: "fill-muted-foreground text-xs" }}
            />
            <YAxis
              type="number"
              dataKey="om"
              name="Open-Meteo"
              domain={[0, max]}
              tickLine={false}
              axisLine={false}
              label={{ value: "Open-Meteo", angle: -90, position: "insideLeft", offset: 16, className: "fill-muted-foreground text-xs" }}
            />
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: max, y: max },
              ]}
              stroke="var(--foreground)"
              strokeDasharray="3 3"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_, p) => `Week of ${fmtDate(String(p?.[0]?.payload?.week), { year: "numeric" })}`}
                  formatter={(_, __, item) => `CCHAIN ${item.payload.cchain} mm · Open-Meteo ${item.payload.om} mm`}
                />
              }
            />
            <Scatter data={data} fill="var(--color-om)" fillOpacity={0.35} shape="circle" isAnimationActive={false} />
          </ScatterChart>
        </ChartContainer>
        <div className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 tabular-nums">
            <dt className="text-muted-foreground">Correlation r</dt>
            <dd className="text-right font-medium">{rc.r.toFixed(2)}</dd>
            <dt className="text-muted-foreground">Ratio of means</dt>
            <dd className="text-right font-medium">{rc.ratio.toFixed(2)}</dd>
            <dt className="text-muted-foreground">Live rain scaled by</dt>
            <dd className="text-right font-medium">{rc.scale.toFixed(3)}</dd>
          </dl>
          <p>
            {passes
              ? "Both tests pass (r ≥ 0.9, ratio 0.9–1.1), so live rain is used as is."
              : `The plan was to use Open-Meteo as is if r ≥ 0.9 and the ratio is 0.9–1.1. r is ${rc.r.toFixed(2)}, so live rain is scaled by ${rc.scale.toFixed(3)}.`}
          </p>
          <p className="text-muted-foreground">
            A scale factor can&apos;t fix a weak correlation. The back-test below also runs the live model on Open-Meteo rain to
            show the cost.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function LeaveOneEventOut({ perf }: { perf: Performance }) {
  const { summary, by_event } = perf.loeo
  const replay = new Set(perf.replay_events)
  const caught = (a: Performance["loeo"]["summary"]["alerts_with_cases"]) => Math.round(a.hit_rate_high * a.surges)
  const mean = summary.mae_weeks_1_6
  const median = summary.mae_weeks_1_6_median

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave-one-event-out</CardTitle>
        <CardDescription>
          The model is refitted without each of Iloilo&apos;s {summary.events} heavy-rain events, then asked to forecast it. A surge
          is cases at 1.5× the usual or more over the next 4 weeks.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Peak timing error</dt>
            <dd className="text-lg font-semibold tabular-nums">{summary.peak_error_abs_mean.toFixed(1)} weeks</dd>
            <dd className="text-muted-foreground">mean, either direction</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Rain + recent cases, High+ alert</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {caught(summary.alerts_with_cases)} of {summary.alerts_with_cases.surges} surges
            </dd>
            <dd className="text-muted-foreground">{pct(summary.alerts_with_cases.false_alarm_high)} of alerts were false</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Rain only, High+ alert</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {caught(summary.alerts_rain_only)} of {summary.alerts_rain_only.surges} surges
            </dd>
            <dd className="text-muted-foreground">{pct(summary.alerts_rain_only.false_alarm_high)} of alerts were false</dd>
          </div>
        </dl>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead className="text-right">Rain vs usual</TableHead>
              <TableHead className="text-right">Cases vs usual</TableHead>
              <TableHead>Alert: rain + cases</TableHead>
              <TableHead>Alert: rain only</TableHead>
              <TableHead>Peak forecast</TableHead>
              <TableHead className="text-right">Error, wk +1–6</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {by_event.map((e) => (
              <TableRow key={e.event_id}>
                <TableCell className="font-medium">
                  {fmtDate(e.date, { year: "numeric" })}
                  {replay.has(e.event_id) && (
                    <Badge variant="outline" className="ml-2">
                      In replay
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {e.rain} mm <span className="text-muted-foreground">({times(e.rain / e.rain_clim)})</span>
                </TableCell>
                <TableCell className="text-right">
                  {e.surge_ratio === null ? "—" : times(e.surge_ratio)}
                  {e.surge && (
                    <Badge variant="secondary" className="ml-2">
                      Surge
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{e.level.with_cases ?? "—"}</TableCell>
                <TableCell>{e.level.rain_only ?? "—"}</TableCell>
                <TableCell>{peakTiming(e.peak_error_weeks) ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {e.mae_weeks_1_6.with_cases["1"].toFixed(1)}{" "}
                  <span className="text-muted-foreground">vs {e.mae_weeks_1_6.seasonal["1"].toFixed(1)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <p className="text-sm">
          Error is mean absolute error in cases per week, 1-week-ahead, against the usual-for-the-week forecast. Averaged over
          events, rain + recent cases scores {mean.with_cases["1"].toFixed(1)} vs {mean.seasonal["1"].toFixed(1)}. By median it
          scores {median.with_cases["1"].toFixed(1)} vs {median.seasonal["1"].toFixed(1)}: the gain comes from the big 2011
          outbreak, and on a typical event the usual-for-the-week forecast does slightly better.
        </p>
      </CardContent>
    </Card>
  )
}

function Backtest({ perf }: { perf: Performance }) {
  const [scope, setScope] = useState<BacktestScope>("iloilo")
  const [metric, setMetric] = useState<BacktestMetric>("deviance")
  const table = backtestTable(perf.backtest, scope, metric)
  const weekly = perf.alerts_weekly

  return (
    <Card>
      <CardHeader>
        <CardTitle>Back-test vs baselines</CardTitle>
        <CardDescription>
          Trained on 2013–2017, tested on every week of 2018–2022, at 1 to 4 weeks ahead. Lower is better; the percentage is
          against the usual-for-the-week forecast.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Tabs value={scope} onValueChange={(v) => setScope(v as BacktestScope)}>
            <TabsList>
              <TabsTrigger value="iloilo">Iloilo City</TabsTrigger>
              <TabsTrigger value="all">All 12 cities</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as BacktestMetric)}>
            <TabsList>
              <TabsTrigger value="deviance">Poisson deviance</TabsTrigger>
              <TabsTrigger value="mae">Mean abs. error</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <BacktestTable lines={table.main} />

        {table.ablations.length > 0 && (
          <details className="group rounded-lg border px-4 py-2 text-sm">
            <summary className="cursor-pointer py-1 font-medium">Ablations ({table.ablations.length})</summary>
            <p className="py-2 text-muted-foreground">
              Variants tried and not deployed: training from 2008, dropping the 2011–12 Sendong-era weeks, and an Iloilo-only
              rain slope.
            </p>
            <BacktestTable lines={table.ablations} />
          </details>
        )}

        <div className="flex flex-col gap-2 text-sm">
          <h3 className="font-medium">Weekly alerts, Iloilo 2018–2022</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Surge weeks caught (High+)</TableHead>
                <TableHead className="text-right">High+ alerts that were false</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              <TableRow>
                <TableCell>Rain + recent cases (replay)</TableCell>
                <TableCell className="text-right">{pct(weekly.with_cases.hit_rate_high)}</TableCell>
                <TableCell className="text-right">{pct(weekly.with_cases.false_alarm_high)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Rain only (live)</TableCell>
                <TableCell className="text-right">{pct(weekly.rain_only.hit_rate_high)}</TableCell>
                <TableCell className="text-right">{pct(weekly.rain_only.false_alarm_high)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-muted-foreground">Out of {weekly.with_cases.surges} surge weeks.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function BacktestTable({ lines }: { lines: BacktestLine[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Model</TableHead>
          {HORIZONS.map((h) => (
            <TableHead key={h} className="text-right">
              {h} wk ahead
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {lines.map((l) => (
          <TableRow key={l.model}>
            <TableCell className="font-medium">{l.label}</TableCell>
            {l.values.map((v, i) => {
              const c = l.change[i]
              return (
                <TableCell key={i} className="text-right">
                  {v === null ? "—" : v.toFixed(2)}
                  {c !== null && (
                    <span className={c < 0 ? "ml-1.5 text-chart-3" : "ml-1.5 text-destructive"}>{signedPct(c)}</span>
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const ZAMBOANGA: [keyof Pick<Performance["zamboanga"], "hazard_pct" | "hazard_25yr_med" | "hazard_25yr_high" | "score">, string][] = [
  ["score", "Hazard × population (our score)"],
  ["hazard_pct", "Flood-prone share"],
  ["hazard_25yr_med", "25-year flood, medium hazard"],
  ["hazard_25yr_high", "25-year flood, high hazard"],
]
const RHO_MIN = -0.4
const RHO_MAX = 0.6
const rhoX = (v: number) => `${((v - RHO_MIN) / (RHO_MAX - RHO_MIN)) * 100}%`

function Zamboanga({ perf }: { perf: Performance }) {
  const z = perf.zamboanga
  return (
    <Card>
      <CardHeader>
        <CardTitle>Zamboanga ranking check</CardTitle>
        <CardDescription>
          Iloilo has no barangay case data, so the ranking is checked in Zamboanga: Spearman ρ against cases per 100k per year,
          {` ${z.barangays}`} barangays, {z.cases} cases, bootstrap 95% CI.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {ZAMBOANGA.map(([key, label]) => (
            <RhoRow key={key} label={label} c={z[key]} />
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          A CI that stays right of 0 means barangays ranked higher did have more cases. The signal is weak and comes from the
          medium-hazard layer. Zamboanga&apos;s data also reflects where cases were detected, not only where they happened.
        </p>
      </CardContent>
    </Card>
  )
}

function RhoRow({ label, c }: { label: string; c: Correlation }) {
  return (
    <li className="flex flex-col gap-1 text-sm">
      <div className="flex justify-between gap-4">
        <span>{label}</span>
        <span className="tabular-nums">
          ρ <strong>{fixed2(c.rho)}</strong> <span className="text-muted-foreground">({fixed2(c.lo)} to {fixed2(c.hi)})</span>
        </span>
      </div>
      <div className="relative h-3" aria-hidden>
        <div className="absolute inset-y-1/2 h-px w-full bg-border" />
        <div className="absolute inset-y-0 w-px bg-muted-foreground" style={{ left: rhoX(0) }} />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-chart-2/40"
          style={{ left: rhoX(c.lo), width: `calc(${rhoX(c.hi)} - ${rhoX(c.lo)})` }}
        />
        <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-2" style={{ left: rhoX(c.rho) }} />
      </div>
    </li>
  )
}

function Dropped({ perf }: { perf: Performance }) {
  const slope = backtestTable(perf.backtest, "iloilo", "deviance")
  const base = slope.main.find((l) => l.model === "with_cases")
  const withSlope = slope.ablations.find((l) => l.model === "with_cases + Iloilo rain slope")
  const slopeNote =
    base && withSlope && base.values[2] !== null && withSlope.values[2] !== null
      ? ` (Iloilo deviance at 3 weeks ahead ${withSlope.values[2].toFixed(2)} vs ${base.values[2].toFixed(2)})`
      : ""

  const items: [string, string][] = [
    ["River discharge (GloFAS)", "Added about 1% on top of rain."],
    ["Distributed lag non-linear model", "Extra complexity for a lag curve the linear version already captures."],
    ["Gradient boosting", "Kept as an optional benchmark only. In earlier dengue work, tree models did no better than repeating last week."],
    ["Iloilo-only rain slope", `No gain; slightly worse at 3–4 weeks ahead${slopeNote}.`],
    ["Training years 2008–2012", "The 2011–12 outbreaks doubled Iloilo's baseline and made the rain-only model worse than seasonal. Those events are still forecast in the leave-one-event-out test."],
    ["Poverty in the priority score", "Its link with cases flips direction between cities."],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dropped, and why</CardTitle>
        <CardDescription>Inputs and options we tried or considered and left out.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3 text-sm">
          {items.map(([name, why]) => (
            <div key={name} className="flex flex-col gap-0.5">
              <dt className="font-medium">{name}</dt>
              <dd className="text-muted-foreground">{why}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function Limitations({ perf }: { perf: Performance }) {
  const median = perf.loeo.summary.mae_weeks_1_6_median
  const z = perf.zamboanga.hazard_pct

  const items: [string, string][] = [
    [
      "Live alerts are weak",
      `Without current case counts, the live model rarely flags surges: ${pct(perf.alerts_weekly.rain_only.hit_rate_high)} of surge weeks at High or above. Read the live level as rain risk, not as an outbreak detector.`,
    ],
    [
      "Overshoot at outbreak peaks",
      "Recent cases push the 1-week forecast up faster than outbreaks grow. During the 2011 outbreak it forecast 241 cases for a week that had 113.",
    ],
    [
      "Typical events",
      `By median error over the leave-one-event-out events, the usual-for-the-week forecast (${median.seasonal["1"].toFixed(1)}) beats rain + recent cases (${median.with_cases["1"].toFixed(1)}). The gains come from big events.`,
    ],
    [
      "Barangay check is one city",
      `Zamboanga ρ = ${z.rho.toFixed(2)} (95% CI ${z.lo.toFixed(2)}–${z.hi.toFixed(2)}), carried by the medium-hazard layer; the high-hazard layer alone shows nothing.`,
    ],
    [
      "Rain source mismatch",
      `CCHAIN and Open-Meteo weekly rain correlate at r = ${perf.rain_check.r.toFixed(2)}.`,
    ],
    [
      "Cases fell after 2012",
      "Possibly from Iloilo's flood control works, not yet verified. Training from 2013 handles it for now.",
    ],
    ["PIDSR week meaning", "Whether a case's week is symptom onset or report date is unknown, which changes how the lag is read."],
    [
      "Data ends in 2022",
      `Case data runs to ${fmtDate(perf.data_end, { year: "numeric" })}. Live mode has no current cases.`,
    ],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Limitations</CardTitle>
        <CardDescription>What this model can&apos;t tell you.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
          {items.map(([name, text]) => (
            <div key={name} className="flex flex-col gap-0.5">
              <dt className="font-medium">{name}</dt>
              <dd className="text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
