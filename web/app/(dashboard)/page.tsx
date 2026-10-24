import { OverviewView } from "@/components/overview/overview-view"
import { PageHeader } from "@/components/page-header"

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Expected leptospirosis cases and what to do now." />
      <OverviewView />
    </>
  )
}
