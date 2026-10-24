import { SerwistProvider } from "@serwist/turbopack/react"
import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "LUNOP",
    template: "%s · LUNOP",
  },
  description: "Leptospirosis Upsurge Nowcasting & Outbreak Prevention",
  appleWebApp: { capable: true, title: "LUNOP", statusBarStyle: "default" },
}

export const viewport: Viewport = { themeColor: "#3b82f6" }

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* No reload on reconnect: it would wipe a half-filled report form. */}
          <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
            <TooltipProvider>{children}</TooltipProvider>
          </SerwistProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
