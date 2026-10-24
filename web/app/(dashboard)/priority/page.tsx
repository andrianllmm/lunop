import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { PlaceholderCard } from "@/components/placeholder"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata: Metadata = { title: "Priority areas" }

export default function PriorityPage() {
  return (
    <>
      <PageHeader title="Priority areas" description="Barangays to reach first, and why." />
      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="spots">Chronic flood spots</TabsTrigger>
        </TabsList>
        <TabsContent value="ranking" className="grid gap-6 lg:grid-cols-3">
          <PlaceholderCard
            title="Priority ranking"
            description="Priority, population, hazard, reports, dose range, access"
            className="lg:col-span-2"
            contentClassName="h-96"
          />
          <PlaceholderCard title="Details" description="Select a barangay" contentClassName="h-96" />
        </TabsContent>
        <TabsContent value="spots">
          <PlaceholderCard
            title="Chronic flood spots"
            description="Knee-deep or worse on 3+ dates in the past 12 months"
            contentClassName="h-96"
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
