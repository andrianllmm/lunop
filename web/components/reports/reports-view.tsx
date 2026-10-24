"use client"

import { useEffect, useMemo, useState } from "react"

import { BarangayMap, type BarangayCollection, type MapPoint } from "@/components/barangay-map"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useReports } from "@/hooks/use-reports"
import { config } from "@/lib/config"
import { getJSON } from "@/lib/data"
import { DEPTH_LABEL, DEPTH_R } from "@/lib/depth"
import { fmtInstant } from "@/lib/format"
import { reportRoles, within } from "@/lib/report-roles"
import { engineState } from "@/lib/state"
import { DEPTHS, type FloodReport, type Forecast } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Barangays stay see-through so the pins stand out. */
const PLAIN = "rgba(148, 163, 184, 0.3)"
const plain = () => PLAIN

const WINDOWS = [
  { days: 1, label: "24 hours" },
  { days: config.priority.report_window_days, label: `${config.priority.report_window_days} days` },
  { days: config.spots.window_days, label: "1 year" },
]

function pinClass(roles: { countdown: boolean; spot: boolean } | undefined, selected: boolean) {
  return cn(
    roles?.countdown ? "bg-destructive" : "bg-amber-500 dark:bg-amber-400",
    roles?.spot && "ring-2 ring-sky-600",
    selected && "outline-2 outline-offset-2 outline-foreground",
  )
}

function duration(h: number | null | undefined) {
  if (h == null) return "Not given"
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} days`
}

export function ReportsView() {
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [geo, setGeo] = useState<BarangayCollection | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [days, setDays] = useState(config.priority.report_window_days)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A year back, so countdowns and repeat flood spots can be marked whatever the filter
  const { reports, error: reportsError } = useReports(config.spots.window_days)

  useEffect(() => {
    Promise.all([getJSON<Forecast>("/data/forecast.json"), getJSON<BarangayCollection>("/data/barangays.geojson")])
      .then(([f, g]) => {
        setForecast(f)
        setGeo(g)
        setNow(new Date())
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const barangays = useMemo(() => geo?.features.map((f) => f.properties) ?? [], [geo])
  const names = useMemo(() => new Map(barangays.map((b) => [b.psgc, b.name])), [barangays])
  const state = useMemo(
    () => (forecast && now ? engineState(forecast, barangays, reports ?? [], now) : null),
    [forecast, barangays, reports, now],
  )
  const roles = useMemo(() => (state ? reportRoles(state) : new Map()), [state])
  const outlined = useMemo(() => new Set(state?.countdowns.keys()), [state])
  const shown = useMemo(() => (reports && now ? within(reports, now, days) : []), [reports, now, days])

  if (error) return <p className="text-sm text-destructive">Could not load data ({error}).</p>
  if (!geo || !state) return <Skeleton className="h-[40rem] w-full" />

  const points: MapPoint[] = shown.flatMap((r) =>
    r.lat == null || r.lon == null
      ? []
      : [
          {
            id: r.client_id,
            lat: r.lat,
            lon: r.lon,
            r: DEPTH_R[r.depth],
            className: pinClass(roles.get(r.client_id), r.client_id === selected),
            onClick: () => setSelected(r.client_id),
            popup: <Detail report={r} name={names.get(r.psgc)} roles={roles.get(r.client_id)} />,
          },
        ],
  )

  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Map</CardTitle>
            <CardDescription>
              {shown.length} report{shown.length === 1 ? "" : "s"} in the last {WINDOWS.find((w) => w.days === days)?.label}.
              Updates every minute.
            </CardDescription>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(days)}
            onValueChange={(v) => v && setDays(Number(v))}
            aria-label="Time period"
          >
            {WINDOWS.map((w) => (
              <ToggleGroupItem key={w.days} value={String(w.days)}>
                {w.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <BarangayMap features={geo.features} fill={plain} outlined={outlined} points={points} className="h-[28rem]" />
          <Legend />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>Tap a pin on the map to open its report. Tap a row to find its pin.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {reports === null && reportsError ? (
            <p className="text-sm text-muted-foreground">Could not load reports ({reportsError}).</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flood reports in this period.</p>
          ) : (
            <ul className="flex max-h-96 flex-col divide-y overflow-y-auto rounded-md border text-sm">
              {shown.map((r) => (
                <li key={r.client_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.client_id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted",
                      r.client_id === selected && "bg-muted",
                    )}
                  >
                    <span
                      className={cn("shrink-0 rounded-full", pinClass(roles.get(r.client_id), false))}
                      style={{ width: DEPTH_R[r.depth] * 2, height: DEPTH_R[r.depth] * 2 }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="break-words">{names.get(r.psgc) ?? r.psgc}</span>
                      <span className="text-xs text-muted-foreground">
                        {DEPTH_LABEL[r.depth]} · {fmtInstant(r.observed_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Detail({
  report,
  name,
  roles,
}: {
  report: FloodReport
  name: string | undefined
  roles: { countdown: boolean; spot: boolean } | undefined
}) {
  const rows: [string, string][] = [
    ["Water depth", DEPTH_LABEL[report.depth]],
    ["Lasted", duration(report.duration_h)],
    ["Waded through it", report.waded ? "Yes" : "No"],
    ["Seen", fmtInstant(report.observed_at)],
  ]
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="pr-6 font-medium">{name ?? report.psgc}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {(roles?.countdown || roles?.spot || report.simulated) && (
        <div className="flex flex-wrap gap-1.5">
          {roles?.countdown && <Badge variant="destructive">Counts toward a countdown</Badge>}
          {roles?.spot && <Badge variant="outline">Part of a repeat flood spot</Badge>}
          {report.simulated && <Badge variant="outline">Simulated</Badge>}
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        {DEPTHS.map((d) => (
          <span key={d} className="flex items-center gap-1">
            <span
              className="rounded-full bg-amber-500 dark:bg-amber-400"
              style={{ width: DEPTH_R[d] * 2, height: DEPTH_R[d] * 2 }}
            />
            {DEPTH_LABEL[d]}
          </span>
        ))}
      </span>
      <span className="flex items-center gap-1">
        <span className="size-3 rounded-full bg-destructive" />
        Counts toward a countdown
      </span>
      <span className="flex items-center gap-1">
        <span className="size-3 rounded-full ring-2 ring-sky-600" />
        Repeat flood spot
      </span>
      <span className="flex items-center gap-1">
        <span className="size-3 rounded-sm border-2 border-destructive" />
        Countdown running
      </span>
    </div>
  )
}
