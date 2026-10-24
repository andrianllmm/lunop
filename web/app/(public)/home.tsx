"use client"

import { ChevronRightIcon, LayoutDashboardIcon, MegaphoneIcon } from "lucide-react"
import Link from "next/link"

import { useLang } from "@/app/(public)/lang"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** Landing page text. The Filipino is a draft; have a fluent speaker review it. */
const copy = {
  en: {
    title: "Leptospirosis early warning for Iloilo City",
    desc: "Report flooding in your area, or see where health teams should go first.",
    report: "Report flooding",
    reportDesc: "For residents and barangay health workers: send a flood report in under 30 seconds.",
    dashboard: "Open dashboard",
    dashboardDesc: "For health officers: expected cases, priority barangays and what to do now.",
  },
  fil: {
    title: "Maagang babala sa leptospirosis para sa Iloilo City",
    desc: "Mag-ulat ng baha sa inyong lugar, o tingnan kung saan dapat unang pumunta ang mga health team.",
    report: "Mag-ulat ng baha",
    reportDesc: "Para sa mga residente at barangay health worker: magpadala ng ulat ng baha sa loob ng 30 segundo.",
    dashboard: "Buksan ang dashboard",
    dashboardDesc: "Para sa mga health officer: inaasahang kaso, mga barangay na uunahin at ang dapat gawin.",
  },
}

export function Home() {
  const { lang } = useLang()
  const t = copy[lang]

  const links = [
    { href: "/report", title: t.report, desc: t.reportDesc, icon: MegaphoneIcon },
    { href: "/dashboard", title: t.dashboard, desc: t.dashboardDesc, icon: LayoutDashboardIcon },
  ]

  return (
    <>
      <div className="space-y-2 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground">{t.desc}</p>
      </div>
      <div className="flex flex-col gap-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Card className="transition-colors group-hover:border-primary">
              <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-x-4">
                <l.icon className="row-span-2 size-6 text-primary" />
                <CardTitle>{l.title}</CardTitle>
                <ChevronRightIcon className="row-span-2 size-5 text-muted-foreground" />
                <CardDescription className="col-start-2">{l.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
