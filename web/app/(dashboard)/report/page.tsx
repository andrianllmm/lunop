import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { PlaceholderCard } from "@/components/placeholder"

export const metadata: Metadata = { title: "Report flooding" }

export default function ReportPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <PageHeader title="Report flooding" description="Tell us where it flooded and how deep." />
      <PlaceholderCard title="Flood report" description="Location, depth, duration" contentClassName="h-96" />
    </div>
  )
}
