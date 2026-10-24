"use client"

import { useMemo } from "react"

import type { Barangay } from "@/lib/types"
import { cn } from "@/lib/utils"

export type BarangayFeature = {
  properties: Barangay
  geometry: { type: "Polygon"; coordinates: number[][][] }
}

export type BarangayCollection = { features: BarangayFeature[] }

export type MapPoint = { id: string; lat: number; lon: number; r?: number; className?: string }

const WIDTH = 1000

/** Equirectangular projection fitted to the features' bounds. */
function project(features: BarangayFeature[]) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const f of features)
    for (const [x, y] of f.geometry.coordinates.flat()) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  const kx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
  const scale = WIDTH / ((maxX - minX) * kx)
  const xy = (lon: number, lat: number): [number, number] => [(lon - minX) * kx * scale, (maxY - lat) * scale]
  return { xy, height: (maxY - minY) * scale }
}

/** Barangay polygons as SVG, filled per barangay. Works without a basemap or network. */
export function BarangayMap({
  features,
  fill,
  outlined,
  points = [],
  selected,
  onHover,
  className,
  label,
}: {
  features: BarangayFeature[]
  fill: (b: Barangay) => string
  outlined?: Set<string>
  points?: MapPoint[]
  selected?: string | null
  onHover?: (psgc: string | null) => void
  className?: string
  label: string
}) {
  const { xy, height, paths } = useMemo(() => {
    const { xy, height } = project(features)
    const paths = features.map((f) => ({
      b: f.properties,
      d: f.geometry.coordinates
        .map((ring) => `M${ring.map(([x, y]) => xy(x, y).map((v) => v.toFixed(1)).join(",")).join("L")}Z`)
        .join(""),
    }))
    return { xy, height, paths }
  }, [features])

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height.toFixed(0)}`}
      role="img"
      aria-label={label}
      className={cn("h-auto w-full", className)}
      onMouseLeave={() => onHover?.(null)}
    >
      {paths.map(({ b, d }) => (
        <path
          key={b.psgc}
          d={d}
          fill={fill(b)}
          className={cn(
            "stroke-background transition-[fill] duration-300",
            onHover && "cursor-pointer hover:opacity-80",
            selected === b.psgc && "stroke-foreground",
          )}
          strokeWidth={selected === b.psgc ? 3 : 1}
          onMouseEnter={() => onHover?.(b.psgc)}
          onClick={() => onHover?.(b.psgc)}
        >
          <title>{b.name}</title>
        </path>
      ))}
      {outlined &&
        paths
          .filter(({ b }) => outlined.has(b.psgc))
          .map(({ b, d }) => (
            <path key={b.psgc} d={d} fill="none" className="pointer-events-none stroke-destructive" strokeWidth={4} />
          ))}
      {points.map((p) => {
        const [cx, cy] = xy(p.lon, p.lat)
        return (
          <circle
            key={p.id}
            cx={cx}
            cy={cy}
            r={p.r ?? 6}
            className={cn("pointer-events-none fill-foreground stroke-background", p.className)}
            strokeWidth={1.5}
          />
        )
      })}
    </svg>
  )
}
