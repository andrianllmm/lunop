import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { PlaceholderCard } from "@/components/placeholder"

export const metadata: Metadata = { title: "Replay" }

export default function ReplayPage() {
  return (
    <>
      <PageHeader title="Replay" description="Step through past flood events day by day." />
      <div className="grid gap-6 lg:grid-cols-3">
        <PlaceholderCard title="Rain" description="Daily rain on the map" className="lg:col-span-2" contentClassName="h-80" />
        <PlaceholderCard title="Recommendation" description="Decision card by day" contentClassName="h-80" />
        <PlaceholderCard
          title="Forecast vs actual"
          description="Simulated reports are labelled"
          className="lg:col-span-3"
          contentClassName="h-64"
        />
      </div>
    </>
  )
}
