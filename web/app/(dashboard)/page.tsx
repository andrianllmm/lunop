import { InfoIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { PlaceholderCard } from "@/components/placeholder"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Expected leptospirosis cases and what to do now." />
      <Alert>
        <InfoIcon />
        <AlertTitle>Alert level</AlertTitle>
        <AlertDescription>Forecast data not loaded yet.</AlertDescription>
      </Alert>
      <div className="grid gap-6 lg:grid-cols-3">
        <PlaceholderCard
          title="Surge forecast"
          description="Expected cases, 80% band and baseline"
          className="lg:col-span-2"
          contentClassName="h-64"
        />
        <PlaceholderCard title="Recommendation" description="Current phase" contentClassName="h-64" />
        <PlaceholderCard
          title="Priority map"
          description="Barangays ranked by priority"
          className="lg:col-span-2"
          contentClassName="h-80"
        />
        <PlaceholderCard title="Past performance" description="Back-test vs baselines" contentClassName="h-80" />
      </div>
    </>
  )
}
