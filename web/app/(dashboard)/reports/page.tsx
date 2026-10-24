import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { ReportsView } from "@/components/reports/reports-view"

export const metadata: Metadata = { title: "Flood reports" }

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Flood reports" description="Where residents have reported flooding, and how deep." />
      <ReportsView />
    </>
  )
}
