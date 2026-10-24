import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Offline" }

/** Shown for a page that wasn't saved on this device. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">You are offline</h1>
      <p className="text-sm text-muted-foreground">
        This page isn&apos;t saved on this device. Open it again when you have signal.
      </p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">
        Go to home page
      </Link>
    </main>
  )
}
