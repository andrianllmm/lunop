"use client"

import * as React from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type Lang = "en" | "fil"

const LangContext = React.createContext<{ lang: Lang; setLang: (lang: Lang) => void } | null>(null)

/** Page language for the public pages, picked in the header. */
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = React.useState<Lang>("en")
  return <LangContext value={{ lang, setLang }}>{children}</LangContext>
}

export function useLang() {
  const ctx = React.useContext(LangContext)
  if (!ctx) throw new Error("useLang must be used within LangProvider")
  return ctx
}

/** The default "on" style is a faint gray; make the picked option obvious. */
const SELECTED = "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"

export function LangToggle() {
  const { lang, setLang } = useLang()
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={lang} onValueChange={(v) => v && setLang(v as Lang)}>
      <ToggleGroupItem value="en" className={SELECTED}>
        EN
      </ToggleGroupItem>
      <ToggleGroupItem value="fil" className={SELECTED}>
        FIL
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
