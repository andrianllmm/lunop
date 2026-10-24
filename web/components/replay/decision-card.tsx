import { TimerIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { fmtDate, fmtInstant, fmtRange } from "@/lib/format"
import type { ReplayDay } from "@/lib/replay"
import { HOUR_MS } from "@/lib/time"
import type { Level } from "@/lib/types"

const LEVEL_VARIANT: Record<Level, "outline" | "secondary" | "default" | "destructive"> = {
  Normal: "outline",
  Elevated: "secondary",
  High: "default",
  Severe: "destructive",
}

const MAX_TARGETS = 5

export function LevelBadge({ level }: { level: Level }) {
  return <Badge variant={LEVEL_VARIANT[level]}>{level}</Badge>
}

export function DecisionCard({ day, className }: { day: ReplayDay; className?: string }) {
  const { bulletin, recommendations, countdowns, ranked, now } = day
  const names = new Map(ranked.map((r) => [r.psgc, r.name]))

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Recommendation <LevelBadge level={bulletin.level} />
        </CardTitle>
        <CardDescription>
          Bulletin of {fmtDate(bulletin.issued)}, data to {fmtDate(bulletin.data_as_of)}. Peak ratio {bulletin.ratio}×
          the usual.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {bulletin.drivers.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {bulletin.drivers.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}

        {countdowns.size > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 font-medium">
              <TimerIcon className="size-4 text-destructive" />
              Prophylaxis countdowns
            </p>
            <ul className="space-y-1">
              {[...countdowns.values()].map((c) => {
                const left = Math.max(0, Math.round((Date.parse(c.deadline) - now.getTime()) / HOUR_MS))
                return (
                  <li key={c.psgc} className="flex justify-between gap-2">
                    <span>{names.get(c.psgc) ?? c.psgc}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {left} h left · {c.reason === "corroborated" ? "3+ devices" : "1 report, alert up"}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {recommendations.length === 0 ? (
          <p className="text-muted-foreground">No action needed today. Keep watching the forecast and reports.</p>
        ) : (
          recommendations.map((r, i) => (
            <div key={r.id} className="flex flex-col gap-1.5">
              {i > 0 && <Separator className="mb-2" />}
              <p className="font-medium">{r.action}</p>
              {r.target.length > 0 && (
                <p>
                  {r.target
                    .slice(0, MAX_TARGETS)
                    .map((t) => t.name)
                    .join(", ")}
                  {r.target.length > MAX_TARGETS && (
                    <span className="text-muted-foreground"> and {r.target.length - MAX_TARGETS} more</span>
                  )}
                </p>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                {r.quantity && (
                  <>
                    <dt>Quantity</dt>
                    <dd className="text-foreground tabular-nums">
                      {fmtRange(r.quantity.lo, r.quantity.hi)} {r.quantity.unit}
                    </dd>
                  </>
                )}
                {r.deadline && (
                  <>
                    <dt>By</dt>
                    <dd className="text-foreground">{fmtInstant(r.deadline)}</dd>
                  </>
                )}
                <dt>Why</dt>
                <dd>{r.rationale}</dd>
                <dt>Source</dt>
                <dd>{r.source}</dd>
              </dl>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
