import * as React from "react"

import { reportFetch } from "@/hooks/use-online"
import type { ReportFeature } from "@/lib/reports"
import type { FloodReport } from "@/lib/types"

const REFRESH_MS = 60_000

async function fetchReports(since?: string): Promise<FloodReport[]> {
  const res = await fetch(`/api/reports${since ? `?since=${encodeURIComponent(since)}` : ""}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const fc: { features: ReportFeature[] } = await res.json()
  return fc.features.map((f) => f.properties)
}

/**
 * Community reports from `GET /api/reports`, refetched every 60 s (TRD §7).
 * Offline, the service worker answers with the last fetched copy.
 */
export function useReports(since?: string) {
  const [reports, setReports] = React.useState<FloodReport[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    fetchReports(since).then(
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
  }, [since])

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  return { reports, error, refresh }
}
