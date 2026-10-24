"use client"

import * as React from "react"
import { LocateFixedIcon } from "lucide-react"
import { toast } from "sonner"

import { copy, type Lang } from "@/app/(dashboard)/report/copy"
import { DepthSlider } from "@/app/(dashboard)/report/depth-slider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useReports } from "@/hooks/use-reports"
import { locate, type Barangays } from "@/lib/locate"
import type { Depth } from "@/lib/types"

/** The default "on" style is a faint gray; make the picked option obvious. */
const SELECTED = "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"

type GpsState ={ status: "idle" | "locating" | "outside" | "failed" } | { status: "found"; lat: number; lon: number }

export function ReportForm() {
  const [lang, setLang] = React.useState<Lang>("en")
  const t = copy[lang]

  const [barangays, setBarangays] = React.useState<Barangays | null>(null)
  const [gps, setGps] = React.useState<GpsState>({ status: "idle" })
  const [psgc, setPsgc] = React.useState("")
  const [depth, setDepth] = React.useState<Depth | "">("")
  const [duration, setDuration] = React.useState("")
  const [waded, setWaded] = React.useState("")
  const [website, setWebsite] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const { reports, refresh } = useReports()

  React.useEffect(() => {
    fetch("/data/barangays.geojson")
      .then((r) => r.json())
      .then(setBarangays)
  }, [])

  const names = React.useMemo(
    () => new Map(barangays?.features.map((f) => [f.properties.psgc, f.properties.name]) ?? []),
    [barangays],
  )
  const options = React.useMemo(() => [...names].sort((a, b) => a[1].localeCompare(b[1])), [names])

  function locateMe() {
    if (!navigator.geolocation || !barangays) return setGps({ status: "failed" })
    setGps({ status: "locating" })
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const hit = locate(barangays, coords.latitude, coords.longitude)
        if (!hit) return setGps({ status: "outside" })
        setGps({ status: "found", lat: coords.latitude, lon: coords.longitude })
        setPsgc(hit)
      },
      () => setGps({ status: "failed" }),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  function pickBarangay(value: string) {
    setPsgc(value)
    setGps({ status: "idle" })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!psgc) return toast.error(t.missingLocation)
    if (!depth) return toast.error(t.missingDepth)
    if (!waded) return toast.error(t.missingWaded)
    if (!navigator.onLine) return toast.error(t.offline)

    setSending(true)
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          observed_at: new Date().toISOString(),
          lat: gps.status === "found" ? gps.lat : null,
          lon: gps.status === "found" ? gps.lon : null,
          psgc,
          depth,
          duration_h: duration === "" ? null : Number(duration),
          waded: waded === "yes",
          website,
        }),
      })
      if (res.status === 429) return toast.error(t.tooMany)
      if (!res.ok) return toast.error(t.failed)
      toast.success(t.sent)
      setGps({ status: "idle" })
      setPsgc("")
      setDepth("")
      setDuration("")
      setWaded("")
      refresh()
    } catch {
      toast.error(t.failed)
    } finally {
      setSending(false)
    }
  }

  const recent = [...(reports ?? [])].reverse().slice(0, 10)

  return (
    <>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={lang}
        onValueChange={(v) => v && setLang(v as Lang)}
        className="self-end"
      >
        <ToggleGroupItem value="en" className={SELECTED}>
          English
        </ToggleGroupItem>
        <ToggleGroupItem value="fil" className={SELECTED}>
          Filipino
        </ToggleGroupItem>
      </ToggleGroup>

      <Card>
        <CardHeader>
          <CardTitle>{t.form}</CardTitle>
          <CardDescription>{t.formDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <FieldSet>
                <FieldLegend variant="label">{t.location}</FieldLegend>
                <Button type="button" variant="outline" onClick={locateMe} disabled={!barangays || gps.status === "locating"}>
                  {gps.status === "locating" ? <Spinner /> : <LocateFixedIcon />}
                  {gps.status === "locating" ? t.locating : t.useGps}
                </Button>
                {gps.status === "found" && <FieldDescription>{t.gpsFound(names.get(psgc) ?? psgc)}</FieldDescription>}
                {gps.status === "outside" && <FieldDescription>{t.gpsOutside}</FieldDescription>}
                {gps.status === "failed" && <FieldDescription>{t.gpsFailed}</FieldDescription>}
                <Field>
                  <FieldLabel htmlFor="psgc">{t.orPick}</FieldLabel>
                  <Select value={psgc} onValueChange={pickBarangay}>
                    <SelectTrigger id="psgc" className="w-full">
                      <SelectValue placeholder={t.pickPlaceholder} />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {options.map(([code, name]) => (
                        <SelectItem key={code} value={code}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label">{t.depth}</FieldLegend>
                <DepthSlider value={depth} onChange={setDepth} labels={t.depths} marks={t.marks} label={t.depth} />
              </FieldSet>

              <Field>
                <FieldLabel htmlFor="duration">{t.duration}</FieldLabel>
                <Input
                  id="duration"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
                <FieldDescription>{t.durationHint}</FieldDescription>
              </Field>

              <FieldSet>
                <FieldLegend variant="label">{t.waded}</FieldLegend>
                <RadioGroup value={waded} onValueChange={setWaded} className="flex gap-6">
                  <Field orientation="horizontal" className="w-auto">
                    <RadioGroupItem value="yes" id="waded-yes" />
                    <FieldLabel htmlFor="waded-yes">{t.yes}</FieldLabel>
                  </Field>
                  <Field orientation="horizontal" className="w-auto">
                    <RadioGroupItem value="no" id="waded-no" />
                    <FieldLabel htmlFor="waded-no">{t.no}</FieldLabel>
                  </Field>
                </RadioGroup>
              </FieldSet>

              {/* Honeypot: hidden from people, filled by bots. */}
              <div aria-hidden className="absolute -left-[9999px]">
                <Label htmlFor="website">Website</Label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              <Button type="submit" disabled={sending}>
                {sending && <Spinner />}
                {sending ? t.sending : t.submit}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.recent}</CardTitle>
          <CardDescription>{t.recentDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.none}</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map((r) => (
                <li key={r.client_id} className="flex items-baseline justify-between gap-4 py-2">
                  <span>
                    <span className="font-medium">{names.get(r.psgc) ?? r.psgc}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {t.depths[r.depth]}
                      {r.waded && ` · ${t.wadedTag}`}
                    </span>
                  </span>
                  <time dateTime={r.observed_at} className="shrink-0 text-muted-foreground tabular-nums">
                    {new Date(r.observed_at).toLocaleString(lang === "fil" ? "fil-PH" : "en-PH", {
                      timeZone: "Asia/Manila",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
