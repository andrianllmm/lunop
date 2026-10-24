import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { ReplayView } from "@/components/replay/replay-view"

export const metadata: Metadata = { title: "Replay" }

export default function ReplayPage() {
  return (
    <>
      <PageHeader title="Replay" description="Step through past flood events day by day." />
      <ReplayView />
    </>
  )
}
