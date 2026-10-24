import type { Metadata } from "next"

import { ReportForm } from "@/app/(public)/report/report-form"

export const metadata: Metadata = { title: "Report flooding" }

export default function ReportPage() {
  return <ReportForm />
}
