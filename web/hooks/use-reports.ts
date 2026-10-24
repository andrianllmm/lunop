import * as React from "react"

import { reportFetch } from "@/hooks/use-online"
import { DAY_MS } from "@/lib/time"
import type { ReportFeature } from "@/lib/reports"
import type { FloodReport } from "@/lib/types"

const REFRESH_MS = 60_000

async function fetchReports(days?: number): Promise<FloodReport[]> {
  const since = days === undefined ? null : new Date(Date.now() - days * DAY_MS).toISOString()
  const res = await fetch(`/api/reports${since ? `?since=${encodeURIComponent(since)}` : ""}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const fc: { features: ReportFeature[] } = await res.json()
  return fc.features.map((f) => f.properties)
}

/**
 * Community reports from `GET /api/reports`, refetched every 60 s (TRD §7).
 * `days`: look-back window, default the server's scoring window. The start is computed at
 * fetch time, never during render, so prerendered pages stay static.
 * Offline, the service worker answers with the last fetched copy.
 */
export function useReports(days?: number) {
  const [reports, setReports] = React.useState<FloodReport[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    fetchReports(days).then(
      (rs) => {
        setReports(rs)
        setError(null)
        reportFetch(true)
      },
      (e) => {
        setError(e instanceof Error ? e.message : String(e))
        if (e instanceof TypeError) reportFetch(false)
      },
    )
  }, [days])

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  return { reports, error, refresh }
}
