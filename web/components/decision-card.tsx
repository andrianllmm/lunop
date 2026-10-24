import {
  ChevronRightIcon,
  HospitalIcon,
  MegaphoneIcon,
  PackageIcon,
  PillIcon,
  SearchIcon,
  ShovelIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fmtDate, fmtInstant, fmtRange } from "@/lib/format"
import type { Recommendation, RecommendationId } from "@/lib/recommend"
import type { EngineState } from "@/lib/state"
import { HOUR_MS } from "@/lib/time"
import type { Level } from "@/lib/types"

const LEVEL_VARIANT: Record<Level, "outline" | "secondary" | "default" | "destructive"> = {
  Normal: "outline",
  Elevated: "secondary",
  High: "default",
  Severe: "destructive",
}

const ICON: Record<RecommendationId, LucideIcon> = {
  prophylaxis: PillIcon,
  advisory: MegaphoneIcon,
  case_finding: SearchIcon,
  hospital_readiness: HospitalIcon,
  pre_position: PackageIcon,
  drain_clearing: ShovelIcon,
}

/** Deadlines closer than this are shown as urgent. */
const URGENT_H = 24

export function LevelBadge({ level }: { level: Level }) {
  return <Badge variant={LEVEL_VARIANT[level]}>{level}</Badge>
}

/** "18 h left" or "3 d left". */
function timeLeft(deadline: string, now: Date) {
  const h = Math.max(0, Math.round((Date.parse(deadline) - now.getTime()) / HOUR_MS))
  return { h, label: h < 48 ? `${h} h left` : `${Math.round(h / 24)} d left` }
}

/** One line of who and how much, e.g. "12 barangays · 1,200–2,400 doses". */
function summary(r: Recommendation, countdowns: number) {
  const parts: string[] = []
  if (r.target.length === 1) parts.push(r.target[0].name)
  else if (r.target.length > 1) parts.push(`${r.target.length} barangays`)
  if (r.quantity) parts.push(`${fmtRange(r.quantity.lo, r.quantity.hi)} ${r.quantity.unit}`)
  if (r.id === "prophylaxis" && countdowns > 0) parts.push(`${countdowns} on countdown`)
  return parts.join(" · ")
}

function Action({ r, state }: { r: Recommendation; state: EngineState }) {
  const Icon = ICON[r.id]
  const left = r.deadline ? timeLeft(r.deadline, state.now) : null

  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{r.action}</span>
          <span className="text-muted-foreground tabular-nums">{summary(r, state.countdowns.size)}</span>
        </div>
        {left && (
          <Badge variant={left.h < URGENT_H ? "destructive" : "outline"} className="shrink-0 tabular-nums">
            {left.label}
          </Badge>
        )}
        <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t p-3 text-muted-foreground">
        {r.target.length > 0 && (
          <>
            <dt>Where</dt>
            <dd className="text-foreground">{r.target.map((t) => t.name).join(", ")}</dd>
          </>
        )}
        {r.deadline && (
          <>
            <dt>By</dt>
            <dd className="text-foreground">{fmtInstant(r.deadline)}</dd>
          </>
        )}
        {r.window && (
          <>
            <dt>Window</dt>
            <dd className="text-foreground">
              {fmtInstant(r.window[0])} to {fmtInstant(r.window[1])}
            </dd>
          </>
        )}
        {r.message && (
          <>
            <dt>Message</dt>
            <dd className="text-foreground">
              {r.message.en}
              <span className="mt-1 block text-muted-foreground">{r.message.fil}</span>
            </dd>
          </>
        )}
        {r.checklist && (
          <>
            <dt>Stock</dt>
            <dd className="text-foreground">{r.checklist.join(", ")}</dd>
          </>
        )}
        <dt>Why</dt>
        <dd>{r.rationale}</dd>
        <dt>Source</dt>
        <dd>{r.source}</dd>
      </dl>
    </details>
  )
}

export function DecisionCard({
  state,
  offline,
  className,
}: {
  state: EngineState
  /** Computed on the device from saved data; labelled so it isn't read as current. */
  offline?: boolean
  className?: string
}) {
  const { bulletin, recommendations } = state

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Actions <LevelBadge level={bulletin.level} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {offline && <p className="text-muted-foreground">Offline. Based on saved data and reports.</p>}
        {recommendations.length === 0 ? (
          <p className="text-muted-foreground">No action needed today.</p>
        ) : (
          recommendations.map((r) => <Action key={r.id} r={r} state={state} />)
        )}

        <details className="group mt-2 text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
            Why {bulletin.level}?
          </summary>
          <div className="mt-2 flex flex-col gap-2 pl-5">
            <p>
              Bulletin of {fmtDate(bulletin.issued)}, data to {fmtDate(bulletin.data_as_of)}. Peak {bulletin.ratio}× the
              usual.
            </p>
            {bulletin.drivers.length > 0 && (
              <ul className="list-disc space-y-1 pl-4">
                {bulletin.drivers.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
