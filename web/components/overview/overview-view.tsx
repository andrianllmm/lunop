"use client"

import { CloudRainIcon, WifiOffIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { BarangayMap, type BarangayCollection } from "@/components/barangay-map"
import { DecisionCard, LevelBadge } from "@/components/decision-card"
import { ForecastChart } from "@/components/forecast-chart"
import { PriorityLegend, priorityColor } from "@/components/priority-legend"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { config } from "@/lib/config"
import { getJSON } from "@/lib/data"
import { fmtDate, fmtRange } from "@/lib/format"
import { engineState } from "@/lib/state"
import { daysBetween } from "@/lib/time"
import type { Forecast } from "@/lib/types"

/** A forecast older than this many days gets a "data from" warning. */
const STALE_DAYS = 2

const TOP_LIST = 5

export function OverviewView() {
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [geo, setGeo] = useState<BarangayCollection | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [offline, setOffline] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getJSON<Forecast>("/data/forecast.json"),
      getJSON<BarangayCollection>("/data/barangays.geojson"),
    ])
      .then(([f, g]) => {
        setForecast(f)
        setGeo(g)
        setNow(new Date())
        setOffline(!navigator.onLine)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const barangays = useMemo(() => geo?.features.map((f) => f.properties) ?? [], [geo])
  // No live reports yet; the engine runs on the forecast alone
  const state = useMemo(
    () => (forecast && now ? engineState(forecast, barangays, [], now) : null),
    [forecast, barangays, now],
  )
  const rank = useMemo(() => new Map(state?.ranked.map((r) => [r.psgc, r])), [state])
  const fill = useCallback((b: { psgc: string }) => priorityColor(rank.get(b.psgc)), [rank])
  const outlined = useMemo(() => new Set(state?.countdowns.keys()), [state])

  if (error) return <p className="text-sm text-destructive">Could not load forecast data ({error}).</p>
  if (!forecast || !geo || !state || !now) return <Skeleton className="h-[40rem] w-full" />

  const peak = forecast.weeks.reduce((a, b) => (b.expected > a.expected ? b : a))
  const age = daysBetween(forecast.issued, now, config.utc_offset_h)
  const hovered = hover ? rank.get(hover) : undefined
  const top = state.ranked.filter((r) => r.weight > 0).slice(0, TOP_LIST)

  return (
    <div className="flex flex-col gap-6">
      {(offline || age > STALE_DAYS) && (
        <Alert variant="destructive">
          <WifiOffIcon />
          <AlertTitle>
            {offline ? "You are offline." : "Not updated recently."} Showing data from{" "}
            {fmtDate(forecast.issued, { year: "numeric" })}.
          </AlertTitle>
        </Alert>
      )}

      <Alert>
        <CloudRainIcon />
        <AlertTitle className="flex flex-wrap items-center gap-2">
          Risk level <LevelBadge level={forecast.level} />
          <span className="font-normal text-muted-foreground">Updated {fmtDate(forecast.issued)}</span>
        </AlertTitle>
        <AlertDescription>
          About {Math.round(peak.expected)} cases a week expected by {fmtDate(peak.week_start)}, up from the usual{" "}
          {Math.round(peak.baseline)}.
          {forecast.variant === "rain_only" && " Based on recent heavy rain, not on reported cases."}
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Expected cases</CardTitle>
            <CardDescription>Cases per week in Iloilo City. The shaded area is the likely range.</CardDescription>
          </CardHeader>
          <CardContent>
            <ForecastChart bulletin={forecast} />
          </CardContent>
        </Card>

        <DecisionCard state={state} />

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Where to act first</CardTitle>
            <CardDescription>
              Estimated from flood-prone areas, population and flood reports. Not confirmed cases.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <BarangayMap
              features={geo.features}
              fill={fill}
              outlined={outlined}
              onHover={setHover}
              className="h-[24rem]"
            />
            <PriorityLegend countdowns={outlined.size > 0} />
            <p className="min-h-5 text-sm">
              {hovered ? (
                <>
                  <span className="font-medium">{hovered.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · #{hovered.rank} · {hovered.pop.toLocaleString("en-US")} people · {Math.round(hovered.hazard)}%
                    flood-prone · {fmtRange(...hovered.doses)} doses
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Tap a barangay for details.</span>
              )}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Barangay</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead className="text-right">Flood-prone</TableHead>
                  <TableHead className="text-right">Doses to stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {top.map((r) => (
                  <TableRow key={r.psgc}>
                    <TableCell>{r.rank}</TableCell>
                    <TableCell className="font-medium">
                      {r.name}
                      {r.access_flag && (
                        <Badge variant="outline" className="ml-2">
                          Far from hospital
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r.pop.toLocaleString("en-US")}</TableCell>
                    <TableCell className="text-right">{Math.round(r.hazard)}%</TableCell>
                    <TableCell className="text-right">{fmtRange(...r.doses)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Link href="/priority" className="text-sm underline underline-offset-4">
              See all barangays
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
