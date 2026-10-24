"use client"

import { WifiOffIcon } from "lucide-react"
import * as React from "react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { useOnline } from "@/hooks/use-online"
import { useOutbox } from "@/hooks/use-outbox"
import { getJSON } from "@/lib/data"
import { fmtDate } from "@/lib/format"
import type { Forecast } from "@/lib/types"

/** "Offline. Data from {date}." on every page, plus queued reports (PRD F7). */
export function OfflineBanner() {
  const online = useOnline()
  const { pending } = useOutbox()
  const [issued, setIssued] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Offline, the service worker answers from its cache.
    if (!online) getJSON<Forecast>("/data/forecast.json").then((f) => setIssued(f.issued), () => {})
  }, [online])

  if (online && pending === 0) return null

  return (
    <Alert variant={online ? "default" : "destructive"}>
      <WifiOffIcon />
      <AlertTitle>
        {!online && `Offline. Data from ${issued ? fmtDate(issued, { year: "numeric" }) : "your last visit"}.`}
        {pending > 0 && ` ${pending} ${pending === 1 ? "report" : "reports"} waiting to send.`}
      </AlertTitle>
    </Alert>
  )
}
