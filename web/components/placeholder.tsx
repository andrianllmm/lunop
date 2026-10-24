import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function PlaceholderCard({
  title,
  description,
  className,
  contentClassName,
}: {
  title: string
  description?: string
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Skeleton className={cn("h-48 w-full", contentClassName)} />
      </CardContent>
    </Card>
  )
}
