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

type Alerts = Performance["loeo"]["summary"]["alerts_with_cases"]
const caught = (a: Alerts) => Math.round(a.hit_rate_high * a.surges)

/** Method name as a small label, the question it answers, one line of context. */
function SectionHeader({ method, title, children }: { method: string; title: string; children: React.ReactNode }) {
  return (
    <CardHeader>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{method}</span>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{children}</CardDescription>
    </CardHeader>
  )
}

/** A big number with a short label under it. */
function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="sr-only">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-sm text-muted-foreground" aria-hidden>
        {label}
      </dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
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
      <AtAGlance perf={perf} />
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

function AtAGlance({ perf }: { perf: Performance }) {
  const ratio = perf.event_study.all.ratio
  const peakWeek = Object.keys(ratio).reduce((a, b) => (ratio[b] > ratio[a] ? b : a))
  const withCases = perf.loeo.summary.alerts_with_cases

  return (
    <Card>
      <CardHeader>
        <CardTitle>At a glance</CardTitle>
        <CardDescription>
          Tested on past years where the outcome is known. Case data ends {fmtDate(perf.data_end, { year: "numeric" })}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <Stat value={times(ratio[peakWeek])} label={`normal cases, ${peakWeek} weeks after heavy rain`} />
          <Stat value={`${caught(withCases)} of ${withCases.surges}`} label="past surges warned of, with recent cases" />
          <Stat value={pct(perf.alerts_weekly.rain_only.hit_rate_high)} label="of surge weeks warned of by the live forecast" />
          <Stat value={fixed2(perf.zamboanga.score.rho)} label="ranking vs real cases (0 = no link, 1 = perfect)" />
        </dl>
      </CardContent>
    </Card>
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
  const top = Math.ceil(Math.max(...data.flatMap((d) => [d.all, d.iloilo ?? 0])))

  return (
    <Card>
      <SectionHeader method="Event study" title="What happens after heavy rain?">
        Cases vs a normal week, around each city&apos;s heaviest 2% of rain weeks ({all.events} events).
      </SectionHeader>
      <CardContent>
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
        Effect of each past week&apos;s rain on cases. Above 1× means more rain, more cases.
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
          Peaks at <strong>{peak.lag} weeks</strong>: {signedPct(peak.rr - 1)} cases when that week is ~2.7× wetter.
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

  return (
    <Card>
      <SectionHeader method="Rain source check" title="Can we trust the live rain data?">
        Training rain (CCHAIN) vs live rain (Open-Meteo), {rc.n_weeks} weeks in Iloilo. Perfect agreement is the dashed line.
      </SectionHeader>
      <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <ChartContainer config={rainConfig} className="aspect-square max-h-72 w-full">
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
        <div className="flex flex-col gap-5">
          <dl className="flex flex-col gap-4">
            <Stat value={rc.r.toFixed(2)} label="agreement (1 = perfect)" note="target was 0.9 or more" />
            <Stat value={`× ${rc.scale.toFixed(2)}`} label="adjustment applied to live rain" />
          </dl>
          <p className="text-sm text-muted-foreground">Moderate agreement, so the live forecast is less reliable.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function LeaveOneEventOut({ perf }: { perf: Performance }) {
  const { summary, by_event } = perf.loeo
  const replay = new Set(perf.replay_events)

  return (
    <Card className="[contain:inline-size]">
      <SectionHeader method="Leave-one-event-out test" title="Could it have predicted past floods?">
        Each of Iloilo&apos;s {summary.events} heaviest rain events was hidden from the model, then forecast.
      </SectionHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Stat value={`±${summary.peak_error_abs_mean.toFixed(1)} wk`} label="peak timing error" />
          <Stat
            value={`${caught(summary.alerts_with_cases)} of ${summary.alerts_with_cases.surges}`}
            label="surges warned of, with recent cases"
            note={`${pct(summary.alerts_with_cases.false_alarm_high)} false alarms`}
          />
          <Stat
            value={`${caught(summary.alerts_rain_only)} of ${summary.alerts_rain_only.surges}`}
            label="surges warned of, live forecast"
            note={`${pct(summary.alerts_rain_only.false_alarm_high)} false alarms`}
          />
        </dl>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead className="text-right">Rain</TableHead>
              <TableHead className="text-right">Cases after</TableHead>
              <TableHead className="whitespace-normal">Level, with recent cases</TableHead>
              <TableHead className="whitespace-normal">Level, live</TableHead>
              <TableHead className="whitespace-normal">Peak predicted</TableHead>
              <TableHead className="text-right whitespace-normal">Miss vs normal-week guess</TableHead>
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
                <TableCell className="text-right">{times(e.rain / e.rain_clim)} normal</TableCell>
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
        <p className="text-xs text-muted-foreground">
          Surge: cases ≥ 1.5× normal over the next 4 weeks. Warning: level High or Severe. Miss: average cases per week off,
          over the 6 weeks after.
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
        Tested on 2018–2022, unseen in training. Lower is better; % is vs assuming a normal week.
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

        {table.ablations.length > 0 && (
          <details className="rounded-lg border px-4 py-2 text-sm">
            <summary className="cursor-pointer py-1 font-medium">Other versions tested, not used ({table.ablations.length})</summary>
            <BacktestTable lines={table.ablations} />
          </details>
        )}

        <div className="flex flex-col gap-2 text-sm">
          <h3 className="font-medium">Weekly warnings, Iloilo 2018–2022</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forecast</TableHead>
                <TableHead className="text-right">Surge weeks warned of</TableHead>
                <TableHead className="text-right">False alarms</TableHead>
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
          <p className="text-xs text-muted-foreground">{weekly.with_cases.surges} surge weeks in total.</p>
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

const ZAMBOANGA: [Exclude<keyof Performance["zamboanga"], "barangays" | "cases">, string][] = [
  ["score", "Our priority score"],
  ["hazard_pct", "Share of barangay that floods"],
  ["hazard_pct_net_pop", "Same, after accounting for population"],
  ["pop", "Population alone"],
  ["hazard_25yr_net_pop", "Old flood map, after accounting for population"],
]
const RHO_MIN = -0.4
const RHO_MAX = 0.8
const rhoX = (v: number) => `${((v - RHO_MIN) / (RHO_MAX - RHO_MIN)) * 100}%`

function Zamboanga({ perf }: { perf: Performance }) {
  const z = perf.zamboanga
  return (
    <Card>
      <SectionHeader method="Zamboanga ranking check" title="Does the barangay ranking work?">
        Tested in Zamboanga, the only city with case counts by barangay ({z.barangays} barangays).
      </SectionHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {ZAMBOANGA.map(([key, label]) => (
            <RhoRow key={key} label={label} c={z[key]} />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          0 = no link, 1 = perfect. Dot = result, bar = likely range; a bar fully right of 0 is a real link. Flood share still matters once population is accounted for; the old map did not.
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

/** A short title with a one-line reason under it. */
function Points({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {items.map(([name, text]) => (
        <div key={name} className="flex flex-col gap-0.5">
          <dt className="font-medium">{name}</dt>
          <dd className="text-muted-foreground">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

function Dropped({ perf }: { perf: Performance }) {
  const t = backtestTable(perf.backtest, "iloilo", "deviance")
  const base = t.main.find((l) => l.model === "with_cases")?.values[2]
  const withSlope = t.ablations.find((l) => l.model === "with_cases + Iloilo rain slope")?.values[2]
  const slope = base != null && withSlope != null ? ` (${withSlope.toFixed(2)} vs ${base.toFixed(2)})` : ""

  return (
    <Card>
      <SectionHeader method="Dropped features" title="What we left out, and why">
        Tried or considered, then dropped.
      </SectionHeader>
      <CardContent>
        <Points
          items={[
            ["River flow data (GloFAS)", "Only about 1% better than rain alone."],
            ["Complex rain-delay model (DLNM)", "Same rain timing, more complexity."],
            ["Machine learning (gradient boosting)", "No better than last week's count in our earlier dengue work."],
            ["Rain effect just for Iloilo", `Slightly worse 3 weeks ahead${slope}.`],
            ["Training data from 2008–2012", "Old outbreaks skewed the baseline. Still used for testing."],
            ["Poverty in the priority score", "Its link to cases flips between cities."],
          ]}
        />
      </CardContent>
    </Card>
  )
}

function Limitations({ perf }: { perf: Performance }) {
  const median = perf.loeo.summary.mae_weeks_1_6_median

  return (
    <Card>
      <SectionHeader method="Limitations" title="What this can't tell you">
        Read the forecast with these in mind.
      </SectionHeader>
      <CardContent>
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          <Points
            items={[
              [
                "Live warnings are weak",
                `Rain only, no current cases: caught ${pct(perf.alerts_weekly.rain_only.hit_rate_high)} of surge weeks. Read it as rain risk.`,
              ],
              ["It can overshoot at the peak", "2011 outbreak: forecast 241 cases, actual 113."],
              [
                "Gains come from big events",
                `On a typical event, a normal-week guess was slightly better (miss ${median.seasonal["1"].toFixed(1)} vs ${median.with_cases["1"].toFixed(1)}).`,
              ],
              ["Ranking tested in one city", `Zamboanga only, with a moderate link (${fixed2(perf.zamboanga.hazard_pct_net_pop.rho)} after accounting for population).`],
            ]}
          />
          <Points
            items={[
              ["Live rain differs", `Agreement with the training rain is ${perf.rain_check.r.toFixed(2)} (1 = perfect).`],
              ["Cases fell after 2012", "Cause unconfirmed, possibly flood control works. Trained on 2013 onward."],
              ["Case dates are unclear", "PIDSR doesn't say if a case is dated by symptom onset or report."],
              ["Data ends in 2022", `Last case data: ${fmtDate(perf.data_end, { year: "numeric" })}.`],
            ]}
          />
        </div>
      </CardContent>
    </Card>
  )
}
