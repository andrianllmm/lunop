import {
  DropletsIcon,
  FlaskConicalIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  MapPinnedIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Replay", href: "/replay", icon: HistoryIcon },
  { title: "Priority areas", href: "/priority", icon: MapPinnedIcon },
  { title: "Flood reports", href: "/reports", icon: DropletsIcon },
  { title: "Methods", href: "/methods", icon: FlaskConicalIcon },
]

export function isActive(pathname: string, href: string) {
  return pathname.startsWith(href)
}
