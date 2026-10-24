import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { PriorityView } from "@/components/priority/priority-view"

export const metadata: Metadata = { title: "Priority areas" }

export default function PriorityPage() {
  return (
    <>
      <PageHeader title="Priority areas" description="Barangays to reach first, and why." />
      <PriorityView />
    </>
  )
}
