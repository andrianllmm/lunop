import type { Metadata } from "next"

import { MethodsView } from "@/components/methods/methods-view"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Methods" }

export default function MethodsPage() {
  return (
    <>
      <PageHeader title="Methods" description="How the forecast works and where it falls short." />
      <MethodsView />
    </>
  )
}
