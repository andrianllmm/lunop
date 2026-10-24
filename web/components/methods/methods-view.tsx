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

/** Method name as a small label, then the question the section answers. */
function SectionHeader({ method, title, children }: { method: string; title: string; children: React.ReactNode }) {
  return (
    <CardHeader>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{method}</span>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{children}</CardDescription>
    </CardHeader>
  )
}

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
        <AlertTitle>Couldn&apos;t load the test results</AlertTitle>
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
        We tested the forecast on past years where we already know what happened. Every number below comes from those tests.
        Case data ends {fmtDate(perf.data_end, { year: "numeric" })}.
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
      <SectionHeader method="Event study" title="What happens after heavy rain?">
        Cases compared with a normal week for that time of year, before and after each city&apos;s heaviest rain weeks (top 2%).{" "}
        {all.events} heavy-rain weeks across 12 cities, {iloilo?.events ?? 0} of them in Iloilo.
      </SectionHeader>
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
                    return w === 0 ? "Week of the heavy rain" : `${Math.abs(w)} wk ${w > 0 ? "after" : "before"} the rain`
                  }}
                  formatter={(v, name) => `${eventConfig[name as keyof typeof eventConfig].label}: ${times(Number(v))} normal`}
                />
              }
            />
            <Line dataKey="all" stroke="var(--color-all)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line dataKey="iloilo" stroke="var(--color-iloilo)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
        <p className="text-sm">
          Cases climb to <strong>{times(peak.all)} normal</strong> about {peak.week} weeks after heavy rain, then ease off. That
          delay is what gives health teams time to act. The dashed line is a normal week.
        </p>
      </CardContent>
    </Card>
  )
}

const lagConfig = {
  rr: { label: "Effect on cases", color: "var(--chart-2)" },
  band: { label: "Likely range", color: "var(--chart-2)" },
} satisfies ChartConfig

function LagCurve({ perf }: { perf: Performance }) {
  const [variant, setVariant] = useState<"rain_only" | "with_cases">("rain_only")
  const curve = perf.lag_curve[variant]
  const data = curve.map((p) => ({ lag: p.lag, rr: p.rr, band: [p.lo, p.hi] }))
  const peak = curve.reduce((a, b) => (b.rr > a.rr ? b : a))

  return (
    <Card>
      <SectionHeader method="Rain lag curve" title="When does rain matter most?">
        How strongly each past week&apos;s rain moves the case forecast. Above the dashed line means more rain leads to more
        cases; the shaded band is the likely range (95%).
      </SectionHeader>
      <CardContent className="flex flex-col gap-3">
        <Tabs value={variant} onValueChange={(v) => setVariant(v as typeof variant)}>
          <TabsList>
            <TabsTrigger value="rain_only">Live forecast</TabsTrigger>
            <TabsTrigger value="with_cases">With recent cases</TabsTrigger>
          </TabsList>
        </Tabs>
        <ChartContainer config={lagConfig} className="aspect-auto h-44 w-full">
          <ComposedChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="lag" tickLine={false} axisLine={false} tickFormatter={(k: number) => `${k} wk`} />
            <YAxis tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v.toFixed(2)}×`} />
            <ReferenceLine y={1} stroke="var(--foreground)" strokeDasharray="3 3" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => `Rain ${p?.[0]?.payload?.lag} weeks earlier`}
                  formatter={(v, name) =>
                    name === "band"
                      ? `Likely range: ${(v as number[]).map((x) => `${x.toFixed(2)}×`).join(" to ")}`
                      : `Effect on cases: ${Number(v).toFixed(2)}×`
                  }
                />
              }
            />
            <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={0.15} isAnimationActive={false} />
            <Line dataKey="rr" stroke="var(--color-rr)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ChartContainer>
        <p className="text-sm">
          Rain from <strong>{peak.lag} weeks earlier</strong> has the biggest effect. When that week is about 2.7 times wetter,
          expected cases rise by {pct(peak.rr - 1)} (likely {pct(peak.lo - 1)}–{pct(peak.hi - 1)}).
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
      <SectionHeader method="Rain source check" title="Can we trust the live rain data?">
        The forecast learned from one rain dataset (CCHAIN) but runs today on another (Open-Meteo). Each dot is one week of
        Iloilo rain measured by both, {rc.n_weeks} weeks in all. If they agreed perfectly, every dot would sit on the dashed
        line.
      </SectionHeader>
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
              label={{ value: "CCHAIN, mm per week", position: "insideBottom", offset: -4, className: "fill-muted-foreground text-xs" }}
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
            <dt className="text-muted-foreground">Agreement (1 = perfect)</dt>
            <dd className="text-right font-medium">{rc.r.toFixed(2)}</dd>
            <dt className="text-muted-foreground">CCHAIN vs Open-Meteo, on average</dt>
            <dd className="text-right font-medium">{signedPct(rc.ratio - 1)}</dd>
            <dt className="text-muted-foreground">Live rain multiplied by</dt>
            <dd className="text-right font-medium">{rc.scale.toFixed(3)}</dd>
          </dl>
          <p>
            {passes
              ? "The two sources agree closely, so live rain is used as is."
              : `They agree only moderately (${rc.r.toFixed(2)}; we wanted 0.9 or more). Open-Meteo also reads drier on average, so live rain is multiplied by ${rc.scale.toFixed(3)}.`}
          </p>
          <p className="text-muted-foreground">
            The adjustment fixes the average, not the week-to-week disagreement. The accuracy test below shows what that costs
            the live forecast.
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
    <Card className="[contain:inline-size]">
      <SectionHeader method="Leave-one-event-out test" title="Could it have predicted past floods?">
        For each of Iloilo&apos;s {summary.events} heaviest rain events, we hid that event from the model, retrained it, and asked
        it to forecast what came next. A surge means cases at least 1.5 times normal over the following 4 weeks.
      </SectionHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Timing of the peak</dt>
            <dd className="text-lg font-semibold tabular-nums">Off by {summary.peak_error_abs_mean.toFixed(1)} weeks</dd>
            <dd className="text-muted-foreground">on average, early or late</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">With recent cases (Replay)</dt>
            <dd className="text-lg font-semibold tabular-nums">
              Warned of {caught(summary.alerts_with_cases)} of {summary.alerts_with_cases.surges} surges
            </dd>
            <dd className="text-muted-foreground">{pct(summary.alerts_with_cases.false_alarm_high)} of warnings were false alarms</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Live forecast (rain only)</dt>
            <dd className="text-lg font-semibold tabular-nums">
              Warned of {caught(summary.alerts_rain_only)} of {summary.alerts_rain_only.surges} surges
            </dd>
            <dd className="text-muted-foreground">{pct(summary.alerts_rain_only.false_alarm_high)} of warnings were false alarms</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">A warning means the alert level reached High or Severe in the week of the rain.</p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead className="text-right">Rain that week</TableHead>
              <TableHead className="text-right">Cases after</TableHead>
              <TableHead className="whitespace-normal">Level: with recent cases</TableHead>
              <TableHead className="whitespace-normal">Level: live forecast</TableHead>
              <TableHead className="whitespace-normal">Peak predicted</TableHead>
              <TableHead className="text-right whitespace-normal">Miss, cases/week</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {by_event.map((e) => (
              <TableRow key={e.event_id}>
                <TableCell className="font-medium">
                  {fmtDate(e.date, { year: "numeric" })}
                  {replay.has(e.event_id) && (
                    <Badge variant="outline" className="ml-2">
                      In Replay
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {e.rain} mm <span className="text-muted-foreground">({times(e.rain / e.rain_clim)} normal)</span>
                </TableCell>
                <TableCell className="text-right">
                  {e.surge_ratio === null ? "—" : `${times(e.surge_ratio)} normal`}
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
          <strong>Miss</strong> is how far the next-week forecast was from the real count, on average over the 6 weeks after the
          rain, next to the miss from simply assuming a normal week. Across all events the model misses by{" "}
          {mean.with_cases["1"].toFixed(1)} cases a week vs {mean.seasonal["1"].toFixed(1)}, but the huge 2011 outbreak drives
          that. On a typical event it misses by {median.with_cases["1"].toFixed(1)} vs {median.seasonal["1"].toFixed(1)}, slightly
          worse than assuming a normal week.
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
    <Card className="[contain:inline-size]">
      <SectionHeader method="Back-test vs baselines" title="How accurate is it week to week?">
        Trained on 2013–2017, then tested on every week of 2018–2022, which it had never seen, at 1 to 4 weeks ahead. Lower
        numbers are better. The colored percentage shows how much better (blue) or worse (red) each forecast is than simply
        assuming a normal week.
      </SectionHeader>
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
              <TabsTrigger value="deviance">Overall error</TabsTrigger>
              <TabsTrigger value="mae">Cases off per week</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <BacktestTable lines={table.main} />
        <p className="text-sm text-muted-foreground">
          {metric === "deviance"
            ? "Overall error (Poisson deviance) is suited to case counts and weighs big misses more."
            : "Cases off per week (mean absolute error) is the average gap between forecast and real cases."}
        </p>

        {table.ablations.length > 0 && (
          <details className="rounded-lg border px-4 py-2 text-sm">
            <summary className="cursor-pointer py-1 font-medium">Other versions we tested ({table.ablations.length})</summary>
            <p className="py-2 text-muted-foreground">These were tried and not used. They are shown so you can see the choice.</p>
            <BacktestTable lines={table.ablations} />
          </details>
        )}

        <div className="flex flex-col gap-2 text-sm">
          <h3 className="font-medium">Warnings, every week of 2018–2022 in Iloilo</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forecast</TableHead>
                <TableHead className="text-right">Surge weeks it warned of</TableHead>
                <TableHead className="text-right">Warnings that were false alarms</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              <TableRow>
                <TableCell>LUNOP with recent cases (used in Replay)</TableCell>
                <TableCell className="text-right">{pct(weekly.with_cases.hit_rate_high)}</TableCell>
                <TableCell className="text-right">{pct(weekly.with_cases.false_alarm_high)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>LUNOP live forecast (rain only)</TableCell>
                <TableCell className="text-right">{pct(weekly.rain_only.hit_rate_high)}</TableCell>
                <TableCell className="text-right">{pct(weekly.rain_only.false_alarm_high)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-muted-foreground">
            Out of {weekly.with_cases.surges} surge weeks. A warning means the level reached High or Severe.
          </p>
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
          <TableHead>Forecast</TableHead>
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
  ["score", "Our priority score (flood hazard × population)"],
  ["hazard_pct", "Share of the barangay that floods"],
  ["hazard_25yr_med", "Medium flood-hazard areas"],
  ["hazard_25yr_high", "High flood-hazard areas"],
]
const RHO_MIN = -0.4
const RHO_MAX = 0.6
const rhoX = (v: number) => `${((v - RHO_MIN) / (RHO_MAX - RHO_MIN)) * 100}%`

function Zamboanga({ perf }: { perf: Performance }) {
  const z = perf.zamboanga
  return (
    <Card>
      <SectionHeader method="Zamboanga ranking check" title="Does the barangay ranking work?">
        Iloilo has no case counts by barangay, so we tested the ranking in Zamboanga, the only city that has them ({z.barangays}{" "}
        barangays, {z.cases} cases). Each row shows how well a measure lines up with where cases happened: 0 means no link, 1 a
        perfect match.
      </SectionHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {ZAMBOANGA.map(([key, label]) => (
            <RhoRow key={key} label={label} c={z[key]} />
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          The dot is the result; the bar is its likely range (95%). When the whole bar sits right of the line at 0, the link is
          real. Our score passes, but the link is weak and comes mostly from medium-hazard areas. Zamboanga&apos;s counts also
          reflect where cases were found, not only where they happened.
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
        <span className="shrink-0 tabular-nums">
          <strong>{fixed2(c.rho)}</strong>{" "}
          <span className="text-muted-foreground">
            ({fixed2(c.lo)} to {fixed2(c.hi)})
          </span>
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
  const t = backtestTable(perf.backtest, "iloilo", "deviance")
  const base = t.main.find((l) => l.model === "with_cases")?.values[2]
  const withSlope = t.ablations.find((l) => l.model === "with_cases + Iloilo rain slope")?.values[2]
  const slopeNote = base != null && withSlope != null ? ` (error ${withSlope.toFixed(2)} vs ${base.toFixed(2)} at 3 weeks ahead)` : ""

  const items: [string, string][] = [
    ["River flow data (GloFAS)", "Improved the forecast by only about 1% beyond rain."],
    ["A more complex rain-delay model (DLNM)", "Adds complexity without changing the rain timing the simple model already finds."],
    [
      "Machine-learning models (gradient boosting)",
      "In our earlier dengue work they did no better than repeating last week's count. Kept only as an optional comparison.",
    ],
    ["A separate rain effect just for Iloilo", `Didn't help, and was slightly worse 3–4 weeks ahead${slopeNote}.`],
    [
      "Case data from 2008–2012",
      "The 2011–12 outbreaks made Iloilo look about twice as outbreak-prone as it is now, which made the live forecast worse than assuming a normal week. Those years are still used to test the model.",
    ],
    ["Poverty in the priority score", "Poorer barangays had more cases in some cities and fewer in others, so it can't guide the ranking."],
  ]

  return (
    <Card>
      <SectionHeader method="Dropped features" title="What we left out, and why">
        Things we tried or considered that didn&apos;t earn a place in the model.
      </SectionHeader>
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
      "Live warnings are weak",
      `Today's forecast has no current case counts, only rain. In testing it warned of just ${pct(perf.alerts_weekly.rain_only.hit_rate_high)} of surge weeks. Treat its level as rain risk, not proof of an outbreak.`,
    ],
    ["It can overshoot at the peak", "During the 2011 outbreak it forecast 241 cases for a week that had 113."],
    [
      "The gains come from big events",
      `On a typical event, simply assuming a normal week was slightly more accurate (a miss of ${median.seasonal["1"].toFixed(1)} vs ${median.with_cases["1"].toFixed(1)} cases a week).`,
    ],
    [
      "The barangay check is from one city",
      `The ranking was tested only in Zamboanga, with a weak link (${fixed2(z.rho)}, likely ${fixed2(z.lo)} to ${fixed2(z.hi)}), mostly from medium-hazard areas.`,
    ],
    [
      "The live rain data differs",
      `The live rain source agrees only moderately with the data the model learned from (${perf.rain_check.r.toFixed(2)}, where 1 is perfect).`,
    ],
    [
      "Cases fell after 2012",
      "Possibly because of Iloilo's flood control works, not yet confirmed. The model is trained on 2013 onward to match current levels.",
    ],
    [
      "Unclear what a case's date means",
      "The national surveillance system (PIDSR) doesn't say whether a case is dated by when symptoms started or when it was reported. That shifts how the rain delay should be read.",
    ],
    ["The data stops in 2022", `Case data ends ${fmtDate(perf.data_end, { year: "numeric" })}. The live forecast has no newer cases to learn from.`],
  ]

  return (
    <Card>
      <SectionHeader method="Limitations" title="What this can't tell you">
        Read the forecast with these in mind.
      </SectionHeader>
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
