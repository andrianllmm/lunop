"use client"

import { HospitalIcon, HousePlusIcon, PlusIcon, SearchIcon, type LucideIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { BarangayMap, type BarangayCollection, type MapPoint } from "@/components/barangay-map"
import { NONE, PriorityLegend, priorityColor } from "@/components/priority-legend"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useReports } from "@/hooks/use-reports"
import { config } from "@/lib/config"
import { getJSON } from "@/lib/data"
import { fmtDate, fmtInstant, fmtRange } from "@/lib/format"
import type { BarangayPriority } from "@/lib/priority"
import type { ReplayBundle, ReplayEvent } from "@/lib/replay"
import { replaySpots, seedSpots, type Spot } from "@/lib/spots"
import { engineState, type EngineState } from "@/lib/state"
import { FACILITY_KINDS, type Barangay, type FacilityCollection, type FacilityKind, type Forecast } from "@/lib/types"

/** Flood-map barangays on the spots map: ColorBrewer blue, as water. */
const SEED = "#3182bd"

/** Facility pins: cool colors that stand apart from the orange priority fill, plus an icon per kind. */
const FACILITY: Record<FacilityKind, { name: string; legend: string; icon: LucideIcon; className: string }> = {
  hospital: { name: "hospital", legend: "Hospitals", icon: HospitalIcon, className: "bg-blue-700" },
  health_center: { name: "health center", legend: "Health centers", icon: PlusIcon, className: "bg-violet-700" },
  bhs: { name: "BHS", legend: "Barangay health stations (partial)", icon: HousePlusIcon, className: "bg-teal-700" },
}

function meters(m: number | null) {
  if (m === null) return "—"
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export function PriorityView() {
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [geo, setGeo] = useState<BarangayCollection | null>(null)
  const [replays, setReplays] = useState<ReplayBundle[] | null>(null)
  const [facilities, setFacilities] = useState<FacilityCollection | null>(null)
  const [waterways, setWaterways] = useState<GeoJSON.FeatureCollection | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [tab, setTab] = useState("ranking")
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Chronic spots look back a year, longer than the 7-day priority window
  const { reports } = useReports(config.spots.window_days)

  useEffect(() => {
    Promise.all([
      getJSON<Forecast>("/data/forecast.json"),
      getJSON<BarangayCollection>("/data/barangays.geojson"),
      getJSON<ReplayEvent[]>("/data/replay/index.json").then((es) =>
        Promise.all(es.map((e) => getJSON<ReplayBundle>(`/data/replay/${e.event_id}.json`))),
      ),
      getJSON<FacilityCollection>("/data/facilities.geojson"),
      getJSON<GeoJSON.FeatureCollection>("/data/waterways.geojson"),
    ])
      .then(([f, g, r, fac, w]) => {
        setForecast(f)
        setGeo(g)
        setReplays(r)
        setFacilities(fac)
        setWaterways(w)
        setNow(new Date())
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const barangays = useMemo(() => geo?.features.map((f) => f.properties) ?? [], [geo])
  // Live reports, refetched every minute; until they load (or offline with none cached), the forecast alone
  const state = useMemo(
    () => (forecast && now ? engineState(forecast, barangays, reports ?? [], now) : null),
    [forecast, barangays, reports, now],
  )
  // Live spots first; until they exist, simulated replay spots and flood-map seeds, both labelled
  const spots = useMemo(() => {
    if (!state || !replays) return []
    if (state.spots.length > 0) return state.spots
    return [
      ...replaySpots(
        replays.map((r) => r.reports),
        barangays,
      ),
      ...seedSpots(barangays),
    ]
  }, [state, replays, barangays])

  const show = useCallback((psgc: string) => {
    setSelected(psgc)
    setTab("ranking")
  }, [])

  if (error) return <p className="text-sm text-destructive">Could not load data ({error}).</p>
  if (!forecast || !geo || !state || !replays || !facilities || !waterways)
    return <Skeleton className="h-[40rem] w-full" />

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="ranking">Ranking</TabsTrigger>
        <TabsTrigger value="spots">Repeat flood spots</TabsTrigger>
      </TabsList>
      <TabsContent value="ranking">
        <Ranking
          geo={geo}
          state={state}
          barangays={barangays}
          facilities={facilities}
          selected={selected ?? state.ranked[0].psgc}
          onSelect={setSelected}
        />
      </TabsContent>
      <TabsContent value="spots">
        <Spots geo={geo} spots={spots} waterways={waterways} onShow={show} />
      </TabsContent>
    </Tabs>
  )
}

function Ranking({
  geo,
  state,
  barangays,
  facilities,
  selected,
  onSelect,
}: {
  geo: BarangayCollection
  state: EngineState
  barangays: Barangay[]
  facilities: FacilityCollection
  selected: string
  onSelect: (psgc: string) => void
}) {
  const [query, setQuery] = useState("")
  const [shown, setShown] = useState<Set<FacilityKind>>(new Set())
  const points: MapPoint[] = facilities.features
    .filter((f) => shown.has(f.properties.kind))
    .map((f, i) => {
      const { icon: Icon, className } = FACILITY[f.properties.kind]
      const [lon, lat] = f.geometry.coordinates
      return { id: `${i}`, lat, lon, r: 10, className, icon: <Icon className="size-3 text-white" />, label: f.properties.name }
    })
  const toggle = (kind: FacilityKind, on: boolean) =>
    setShown((s) => {
      const next = new Set(s)
      if (on) next.add(kind)
      else next.delete(kind)
      return next
    })
  const rank = useMemo(() => new Map(state.ranked.map((r) => [r.psgc, r])), [state])
  const fill = useCallback((b: { psgc: string }) => priorityColor(rank.get(b.psgc)), [rank])
  const outlined = useMemo(() => new Set(state.countdowns.keys()), [state])
  const byPsgc = useMemo(() => new Map(barangays.map((b) => [b.psgc, b])), [barangays])

  const q = query.trim().toLowerCase()
  // Searching finds any barangay; otherwise list only those at risk
  const rows = q
    ? state.ranked.filter((r) => r.name.toLowerCase().includes(q))
    : state.ranked.filter((r) => r.weight > 0)
  const hidden = state.ranked.length - state.ranked.filter((r) => r.weight > 0).length

  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-3">
          <BarangayMap
            features={geo.features}
            fill={fill}
            outlined={outlined}
            points={points}
            selected={selected}
            onSelect={onSelect}
            className="h-[28rem]"
          />
          <PriorityLegend countdowns={outlined.size > 0} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>Show (OpenStreetMap):</span>
            {FACILITY_KINDS.map((kind) => {
              const { legend, icon: Icon, className } = FACILITY[kind]
              return (
                <label key={kind} className="flex cursor-pointer items-center gap-1.5">
                  <Checkbox checked={shown.has(kind)} onCheckedChange={(on) => toggle(kind, on === true)} />
                  <span className={`flex size-4 items-center justify-center rounded-full ${className}`}>
                    <Icon className="size-2.5 text-white" />
                  </span>
                  {legend}
                </label>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Details
          row={rank.get(selected)!}
          barangay={byPsgc.get(selected)!}
          nearest={facilities.nearest[selected]}
          state={state}
        />
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a barangay"
                aria-label="Find a barangay"
                className="pl-8"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Barangay</TableHead>
                    <TableHead className="text-right">Doses</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {rows.map((r) => (
                    <TableRow
                      key={r.psgc}
                      data-state={r.psgc === selected ? "selected" : undefined}
                      onClick={() => onSelect(r.psgc)}
                      className="cursor-pointer"
                    >
                      <TableCell>{r.rank}</TableCell>
                      <TableCell className="font-medium whitespace-normal">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: priorityColor(r) }} />
                          {r.name}
                          {state.countdowns.has(r.psgc) && <Badge variant="destructive">Act now</Badge>}
                          {r.access_flag && <Badge variant="outline">Far from hospital</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{r.weight > 0 ? fmtRange(...r.doses) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No barangay named “{query}”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {!q && hidden > 0 && (
              <p className="text-sm text-muted-foreground">{hidden} other barangays are not flood-prone.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Details({
  row,
  barangay,
  nearest,
  state,
  className,
}: {
  row: BarangayPriority
  barangay: Barangay
  nearest: FacilityCollection["nearest"][string] | undefined
  state: EngineState
  className?: string
}) {
  const actions = state.recommendations.filter((r) => r.target.some((t) => t.psgc === row.psgc))
  const countdown = state.countdowns.get(row.psgc)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {row.name}
          <Badge variant="secondary" className="tabular-nums">
            #{row.rank}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {countdown && (
          <p className="font-medium text-destructive">Give doxycycline by {fmtInstant(countdown.deadline)}</p>
        )}

        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 tabular-nums">
          <dt className="text-muted-foreground">Doses to stock</dt>
          <dd className="text-right font-medium">{row.weight > 0 ? fmtRange(...row.doses) : "—"}</dd>
          <dt className="text-muted-foreground">People</dt>
          <dd className="text-right">{row.pop.toLocaleString("en-US")}</dd>
          <dt className="text-muted-foreground">Flood-prone</dt>
          <dd className="text-right">{Math.round(row.hazard)}% of area</dd>
          <dt className="text-muted-foreground">Flood reports this week</dt>
          <dd className="text-right">{row.report_count}</dd>
          <dt className="text-muted-foreground">To a hospital</dt>
          <dd className="text-right">
            {barangay.travel_min === null ? "Over 30 min" : `${barangay.travel_min} min`}
            {row.access_flag && (
              <Badge variant="outline" className="ml-2">
                Far
              </Badge>
            )}
          </dd>
          {nearest && (
            <>
              <dt className="text-muted-foreground">Nearest health facility</dt>
              <dd className="max-w-44 text-right">
                {nearest.name}
                <span className="block text-xs text-muted-foreground">
                  {FACILITY[nearest.kind].name}, {meters(nearest.dist_m)} straight line
                </span>
              </dd>
            </>
          )}
        </dl>

        {actions.length > 0 && (
          <ul className="flex flex-col gap-1 border-t pt-3">
            {actions.map((a) => (
              <li key={a.id}>{a.action}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Spots({
  geo,
  spots,
  waterways,
  onShow,
}: {
  geo: BarangayCollection
  spots: Spot[]
  waterways: GeoJSON.FeatureCollection
  onShow: (psgc: string) => void
}) {
  const seeds = useMemo(() => new Set(spots.filter((s) => s.source === "noah").map((s) => s.psgc)), [spots])
  const fill = useCallback((b: { psgc: string }) => (seeds.has(b.psgc) ? SEED : NONE), [seeds])
  const points: MapPoint[] = spots.flatMap((s) =>
    s.lat == null || s.lon == null
      ? []
      : [
          {
            id: s.id,
            lat: s.lat,
            lon: s.lon,
            r: 6,
            className: "bg-amber-500 dark:bg-amber-400",
          },
        ],
  )
  const simulated = spots.some((s) => s.simulated)

  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-3">
          <BarangayMap features={geo.features} fill={fill} points={points} lines={waterways} className="h-[28rem]" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-4 bg-[#08306b] dark:bg-[#9ecae1]" />
              River, creek, canal or drain (OSM)
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 rounded-full bg-amber-500 dark:bg-amber-400" />
              Reported flooded 3+ times
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 rounded-sm" style={{ background: SEED }} />
              Flood-prone on flood maps
            </span>
            {simulated && <Badge variant="outline">Sample reports</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clear drains here first</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {spots.length === 0 && <p className="text-muted-foreground">No repeat flood spots yet.</p>}
          {spots.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onShow(s.psgc)}
              className="flex flex-col gap-1 rounded-md border p-3 text-left hover:bg-muted"
            >
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {s.name}
                {s.simulated && <Badge variant="outline">Sample</Badge>}
              </span>
              <span className="text-muted-foreground">
                {s.dates.length > 0
                  ? `Flooded ${s.dates.length} times, last ${fmtDate(s.dates.at(-1)!, { year: "numeric" })}`
                  : "On flood maps, no reports yet"}
                {" · "}
                {meters(s.context.water_dist_m)} from a river or canal
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
