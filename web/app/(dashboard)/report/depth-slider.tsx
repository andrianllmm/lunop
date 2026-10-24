"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { DEPTHS, type Depth } from "@/lib/types"

/** Water height (cm) at each section's lower and upper edge, for a ~160 cm adult. Display only. */
const CM: Record<Depth, [number, number]> = { ankle: [0, 20], knee: [20, 60], waist: [60, 110], chest: [110, 150] }
const WATER = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"]
const GROUND_Y = 190
/** Where each body landmark sits on the figure (y in cm units). */
const MARK_Y: Record<Depth, number> = { ankle: 182, knee: 145, waist: 95, chest: 70 }

const sectionOf = (p: number) => Math.min(3, Math.max(0, Math.floor(p * 4)))
const centerOf = (i: number) => (i + 0.5) / 4

function cmAt(p: number) {
  const i = sectionOf(p)
  const [lo, hi] = CM[DEPTHS[i]]
  return lo + (hi - lo) * Math.min(1, Math.max(0, p * 4 - i))
}

/** Drag the water up a figure to pick a depth. Snaps to a section on release. */
export function DepthSlider({
  value,
  onChange,
  labels,
  marks,
  label,
}: {
  value: Depth | ""
  onChange: (depth: Depth) => void
  labels: Record<Depth, string>
  /** Short body-part names drawn beside the figure. */
  marks: Record<Depth, string>
  label: string
}) {
  const track = React.useRef<HTMLDivElement>(null)
  const thumb = React.useRef<HTMLDivElement>(null)
  const [dragPos, setDragPos] = React.useState<number | null>(null)

  const selected = value ? DEPTHS.indexOf(value) : -1
  const pos = dragPos ?? (selected >= 0 ? centerOf(selected) : null)
  const active = pos === null ? -1 : sectionOf(pos)

  function posFrom(e: React.PointerEvent) {
    const r = track.current!.getBoundingClientRect()
    return Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width))
  }

  function onPointerDown(e: React.PointerEvent) {
    track.current!.setPointerCapture(e.pointerId)
    setDragPos(posFrom(e))
    thumb.current?.focus({ preventScroll: true })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragPos !== null) setDragPos(posFrom(e))
  }

  function onPointerUp() {
    if (dragPos === null) return
    onChange(DEPTHS[sectionOf(dragPos)])
    setDragPos(null)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const i = selected
    const next = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, Home: 0, End: 3 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    onChange(DEPTHS[Math.min(3, Math.max(0, next))])
  }

  const dragging = dragPos !== null
  const ease = dragging ? "" : "transition-all duration-300 ease-out motion-reduce:transition-none"

  return (
    <div className="flex flex-col gap-3 select-none">
      <svg viewBox="0 0 180 200" className="mx-auto block h-auto w-full max-w-64 overflow-hidden rounded-md" aria-hidden>
        {/* 1 unit = 1 cm; ground at y=190, head top at y=30. */}
        <g className="fill-muted-foreground/35">
          <circle cx="70" cy="42" r="11" />
          <rect x="66" y="52" width="8" height="6" />
          <rect x="54" y="57" width="32" height="50" rx="7" />
          <rect x="44" y="59" width="9" height="50" rx="4.5" />
          <rect x="87" y="59" width="9" height="50" rx="4.5" />
          <rect x="56" y="100" width="13" height="88" rx="5" />
          <rect x="71" y="100" width="13" height="88" rx="5" />
        </g>
        {DEPTHS.map((d, i) => (
          <g key={d}>
            <line x1="100" x2="116" y1={MARK_Y[d]} y2={MARK_Y[d]} className="stroke-muted-foreground/60" strokeWidth="0.6" strokeDasharray="2 2" />
            <text
              x="118"
              y={MARK_Y[d] + 2.5}
              className={cn("text-[7px]", i === active ? "fill-foreground font-bold" : "fill-muted-foreground font-medium")}
            >
              {marks[d]}
            </text>
          </g>
        ))}
        <g style={{ transform: `translateY(${GROUND_Y - (pos === null ? -15 : cmAt(pos))}px)` }} className={ease}>
          <path
            d="M-120 0 q15 -3 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V220 H-120 Z"
            style={{ fill: WATER[Math.max(0, active)] }}
            className="opacity-55 motion-safe:animate-wave"
          />
        </g>
        <line x1="0" x2="180" y1="190.5" y2="190.5" className="stroke-border" />
      </svg>

      <div
        ref={track}
        className="relative h-11 cursor-pointer touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="absolute inset-x-0 inset-y-3 grid grid-cols-4 gap-0.75">
          {WATER.map((color, i) => (
            <div
              key={i}
              className={cn("rounded-sm transition-opacity", i === active ? "opacity-100" : "opacity-35")}
              style={{ background: color }}
            />
          ))}
        </div>
        <div
          ref={thumb}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={selected >= 0 ? selected : undefined}
          aria-valuetext={value ? labels[value] : undefined}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute top-1/2 -mt-3.5 -ml-3.5 size-7 rounded-full border-3 border-primary bg-card shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            dragging ? "cursor-grabbing" : "cursor-grab",
            ease,
            pos === null && "opacity-0 focus-visible:opacity-100",
          )}
          style={{ left: `${(pos ?? centerOf(0)) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-0.75">
        {DEPTHS.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={cn(
              "rounded-md px-0.5 py-1 text-center text-[13px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
              i === active ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {labels[d]}
          </button>
        ))}
      </div>
    </div>
  )
}
