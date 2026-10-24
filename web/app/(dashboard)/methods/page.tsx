import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { PlaceholderCard } from "@/components/placeholder"

export const metadata: Metadata = { title: "Methods" }

export default function MethodsPage() {
  return (
    <>
      <PageHeader title="Methods" description="How the forecast works and where it falls short." />
      <div className="grid gap-6 md:grid-cols-2">
        <PlaceholderCard title="Event study" />
        <PlaceholderCard title="Leave-one-event-out" />
        <PlaceholderCard title="Back-test vs baselines" />
        <PlaceholderCard title="Rain check" />
        <PlaceholderCard title="Zamboanga ranking check" />
        <PlaceholderCard title="Limitations" />
      </div>
    </>
  )
}
