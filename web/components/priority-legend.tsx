import type { BarangayPriority } from "@/lib/priority"

/** Color-blind-safe sequential oranges (ColorBrewer), by priority percentile. */
export const PRIORITY_BINS: [number, string, string][] = [
  [90, "#a63603", "Highest"],
  [75, "#e6550d", "High"],
  [50, "#fd8d3c", "Medium"],
  [0, "#fdbe85", "Low"],
]

/** No exposure (no hazard, no reports) stays see-through so the basemap shows. */
export const NONE = "rgba(148, 163, 184, 0.3)"

export function priorityColor(row: BarangayPriority | undefined) {
  if (!row || row.weight === 0) return NONE
  return PRIORITY_BINS.find(([min]) => row.priority >= min)![1]
}

export function PriorityLegend({ countdowns }: { countdowns: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {PRIORITY_BINS.map(([min, color, label]) => (
        <span key={min} className="flex items-center gap-1">
          <span className="size-3 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="size-3 rounded-sm" style={{ background: NONE }} />
        Not flood-prone
      </span>
      {countdowns && (
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm border-2 border-destructive" />
          Countdown running
        </span>
      )}
    </div>
  )
}
