import type { Metadata } from "next"

import { ReportForm } from "@/app/(dashboard)/report/report-form"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Report flooding" }

export default function ReportPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <PageHeader title="Report flooding" description="Tell us where it flooded and how deep." />
      <ReportForm />
    </div>
  )
}
