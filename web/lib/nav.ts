import {
  FlaskConicalIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  MapPinnedIcon,
  MegaphoneIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { title: "Overview", href: "/", icon: LayoutDashboardIcon },
  { title: "Replay", href: "/replay", icon: HistoryIcon },
  { title: "Barangays", href: "/barangays", icon: MapPinnedIcon },
  { title: "Report flooding", href: "/report", icon: MegaphoneIcon },
  { title: "Methods", href: "/methods", icon: FlaskConicalIcon },
]

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
