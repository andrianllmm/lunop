"use client"

import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Bar, BarChart, Cell, ReferenceLine, XAxis } from "recharts"

import { BarangayMap, type BarangayCollection, type MapPoint } from "@/components/barangay-map"
import { DecisionCard } from "@/components/decision-card"
import { ForecastChart } from "@/components/forecast-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { config } from "@/lib/config"
import { getJSON, type Performance } from "@/lib/data"
import { fmtDate } from "@/lib/format"
import { replayDay, type ReplayBundle, type ReplayEvent } from "@/lib/replay"
import { DAY_MS } from "@/lib/time"
import { DEPTH_R } from "@/lib/depth"
import type { Barangay } from "@/lib/types"

const STEP_MS = 700

/** Color-blind-safe sequential blues (ColorBrewer), by daily rain in mm. */
const RAIN_BINS: [number, string][] = [
  [80, "#08306b"],
  [40, "#08519c"],
  [20, "#3182bd"],
  [10, "#6baed6"],
  [5, "#9ecae1"],
  [1, "#c6dbef"],
]

/** Dry barangays stay see-through so the basemap shows. */
const DRY = "rgba(148, 163, 184, 0.3)"

function rainColor(mm: number | undefined) {
  if (mm === undefined) return DRY
  return RAIN_BINS.find(([min]) => mm >= min)?.[1] ?? DRY
}

const OUTCOME: Record<ReplayEvent["outcome"], string> = { hit: "Hit", miss: "Miss", false_alarm: "False alarm" }

const rainConfig = { rain: { label: "City rain (mm)", color: "var(--chart-2)" } } satisfies ChartConfig

export function ReplayView() {
  const [events, setEvents] = useState<ReplayEvent[] | null>(null)
  const [geo, setGeo] = useState<BarangayCollection | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [bundle, setBundle] = useState<ReplayBundle | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getJSON<ReplayEvent[]>("/data/replay/index.json"),
      getJSON<BarangayCollection>("/data/barangays.geojson"),
      getJSON<Performance>("/data/performance.json"),
    ])
      .then(([e, g, p]) => {
        setEvents(e)
        setGeo(g)
        setPerf(p)
        setEventId(e[0]?.event_id ?? null)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!eventId) return
    let live = true
    getJSON<ReplayBundle>(`/data/replay/${eventId}.json`)
      .then((b) => {
        if (!live) return
        setBundle(b)
        setPlaying(false)
        // Start a week before the event so the build-up shows
        const start = b.days.findIndex((d) => d.date >= b.date)
        setIndex(Math.max(0, start - 7))
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      live = false
    }
  }, [eventId])

  const last = bundle ? bundle.days.length - 1 : 0

  useEffect(() => {
    if (!playing) return
    const id = setTimeout(() => (index >= last ? setPlaying(false) : setIndex(index + 1)), STEP_MS)
    return () => clearTimeout(id)
  }, [playing, index, last])

  const barangays = useMemo(() => geo?.features.map((f) => f.properties) ?? [], [geo])
  const ready = bundle !== null && bundle.event_id === eventId && geo !== null
  const day = useMemo(
    () => (ready ? replayDay(bundle, barangays, Math.min(index, bundle.days.length - 1)) : null),
    [ready, bundle, barangays, index],
  )
  const fill = useCallback((b: Barangay) => rainColor(day?.rain.get(b.psgc)), [day])
  const outlined = useMemo(() => new Set(day?.countdowns.keys()), [day])

  if (error) return <p className="text-sm text-destructive">Could not load replay data ({error}).</p>
  if (!events || !geo || !day || !bundle) return <Skeleton className="h-[40rem] w-full" />

  const event = events.find((e) => e.event_id === eventId)!
  const alerts = perf?.loeo.summary.alerts_with_cases
  const windowStart = day.now.getTime() - config.priority.report_window_days * DAY_MS
  const recent = day.reports.filter((r) => Date.parse(r.observed_at) > windowStart)
  const points: MapPoint[] = recent.flatMap((r) =>
    r.lat == null || r.lon == null
      ? []
      : [{ id: r.client_id, lat: r.lat, lon: r.lon, r: DEPTH_R[r.depth], className: "bg-amber-500 dark:bg-amber-400" }],
  )
  const rank = new Map(day.ranked.map((r) => [r.psgc, r]))
  const hovered = hover ? rank.get(hover) : undefined
  const cityRain = bundle.days[index].rain

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Select value={eventId ?? undefined} onValueChange={setEventId}>
                <SelectTrigger className="w-56" aria-label="Event">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.event_id} value={e.event_id}>
                      {e.title} · {OUTCOME[e.outcome]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant={event.outcome === "hit" ? "secondary" : "destructive"}>{OUTCOME[event.outcome]}</Badge>
            </div>
            {alerts && (
              <p className="text-sm text-muted-foreground">
                Across {perf.loeo.summary.events} past heavy-rain events: High or Severe on{" "}
                {Math.round(alerts.hit_rate_high * 100)}% of surges, {Math.round(alerts.false_alarm_high * 100)}% of
                alerts false.
              </p>
            )}
          </div>

          <p className="text-sm">
            {bundle.rain_week_mm} mm fell in the event week, against {bundle.rain_clim_mm} mm usual.{" "}
            {event.outcome === "miss"
              ? "The forecast stayed Normal while cases rose. It caught up only weeks later."
              : event.outcome === "false_alarm"
                ? "The forecast raised an alert that the cases did not bear out."
                : "The forecast raised the alert before cases peaked."}
          </p>

          <ChartContainer config={rainConfig} className="aspect-auto h-16 w-full">
            <BarChart
              data={bundle.days}
              margin={{ top: 4, bottom: 0, left: 0, right: 0 }}
              onClick={(s) => {
                if (typeof s?.activeTooltipIndex === "number") setIndex(s.activeTooltipIndex)
              }}
            >
              <XAxis dataKey="date" hide />
              <ReferenceLine x={bundle.date} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
              <ReferenceLine x={day.date} stroke="var(--destructive)" strokeWidth={2} />
              <Bar dataKey="rain" isAnimationActive={false} className="cursor-pointer">
                {bundle.days.map((d, i) => (
                  <Cell key={d.date} fill={i === index ? "var(--destructive)" : "var(--color-rain)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              <ChevronLeftIcon />
            </Button>
            <Button
              size="icon"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => {
                if (!playing && index >= last) setIndex(0)
                setPlaying((p) => !p)
              }}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setIndex((i) => Math.min(last, i + 1))} disabled={index === last}>
              <ChevronRightIcon />
            </Button>
            <Slider
              className="order-last w-full py-2 sm:order-none sm:mx-2 sm:w-auto sm:flex-1"
              min={0}
              max={last}
              step={1}
              value={[index]}
              onValueChange={([v]) => {
                setPlaying(false)
                setIndex(v)
              }}
              aria-label="Day"
            />
            <p className="ml-auto text-right text-sm font-medium tabular-nums sm:ml-0 sm:w-36">
              {fmtDate(day.date, { weekday: "short", year: "numeric" })}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Rain</CardTitle>
            <CardDescription>
              Daily rain by barangay on {fmtDate(day.date)}. City mean {cityRain} mm.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <BarangayMap
              features={geo.features}
              fill={fill}
              outlined={outlined}
              points={points}
              onHover={setHover}
              className="h-[28rem]"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                {[...RAIN_BINS].reverse().map(([min, color]) => (
                  <span key={min} className="flex items-center gap-1">
                    <span className="size-3 rounded-sm" style={{ background: color }} />
                    {min}+
                  </span>
                ))}
                <span className="ml-1">mm</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="size-3 rounded-full bg-amber-500 dark:bg-amber-400" />
                Flood report, last {config.priority.report_window_days} days ({recent.length})
              </span>
              <span className="flex items-center gap-1">
                <span className="size-3 rounded-sm border-2 border-destructive" />
                Countdown running
              </span>
              <Badge variant="outline">Reports are simulated</Badge>
            </div>
            <p className="min-h-5 text-sm">
              {hovered ? (
                <>
                  <span className="font-medium">{hovered.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {day.rain.get(hovered.psgc) ?? 0} mm · priority #{hovered.rank} · {hovered.report_count}{" "}
                    report{hovered.report_count === 1 ? "" : "s"} · {Math.round(hovered.hazard)}% flood hazard
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Hover or tap a barangay for details.</span>
              )}
            </p>
          </CardContent>
        </Card>

        <DecisionCard state={day} />

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Forecast vs actual</CardTitle>
            <CardDescription>
              Weekly cases, with the 4-week forecast in force on {fmtDate(day.date)} ({day.bulletin.variant} model).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForecastChart bulletin={day.bulletin} actual={bundle.actual} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
