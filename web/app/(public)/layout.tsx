import Link from "next/link"

import { LangProvider, LangToggle } from "@/app/(public)/lang"
import { Logo } from "@/components/logo"
import { ModeToggle } from "@/components/mode-toggle"
import { OfflineBanner } from "@/components/offline-banner"

/** Pages for residents: no sidebar, no officer data. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <LangProvider>
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="size-7" />
            <span className="font-semibold">LUNOP</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <ModeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4">
        <OfflineBanner />
        {children}
      </main>
    </LangProvider>
  )
}
