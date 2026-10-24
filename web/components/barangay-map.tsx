"use client"

import { useMemo, useState } from "react"

import { Map, MapControls, MapGeoJSON, MapMarker, MarkerContent, useMap } from "@/components/ui/map"
import type { Barangay } from "@/lib/types"
import { cn } from "@/lib/utils"

export type BarangayFeature = {
  type: "Feature"
  properties: Barangay
  geometry: { type: "Polygon"; coordinates: number[][][] }
}

export type BarangayCollection = { type: "FeatureCollection"; features: BarangayFeature[] }

export type MapPoint = { id: string; lat: number; lon: number; r?: number; className?: string }

/** Red for outlines; MapLibre paint can't read CSS variables. */
const OUTLINE = "#e5484d"

const NO_FEATURES: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] }

function bounds(features: BarangayFeature[]): [[number, number], [number, number]] {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const f of features)
    for (const [x, y] of f.geometry.coordinates.flat()) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  return [
    [minX, minY],
    [maxX, maxY],
  ]
}

/** First label layer of the basemap, so polygons draw under place names. */
function useLabelLayer() {
  const { map, isLoaded } = useMap()
  return isLoaded ? map?.getStyle().layers.find((l) => l.type === "symbol")?.id : undefined
}

function Polygons({
  filled,
  outlines,
  selected,
  onHover,
  onSelect,
}: {
  filled: GeoJSON.FeatureCollection
  outlines: GeoJSON.FeatureCollection
  selected: GeoJSON.FeatureCollection
  onHover?: (psgc: string | null) => void
  onSelect?: (psgc: string) => void
}) {
  const beforeId = useLabelLayer()
  const { resolvedTheme } = useMap()
  return (
    <>
      <MapGeoJSON
        id="barangays"
        data={filled}
        promoteId="psgc"
        fillPaint={{ "fill-color": ["get", "color"], "fill-opacity": 0.75 }}
        fillHoverPaint={{ "fill-opacity": 0.95 }}
        linePaint={{ "line-color": resolvedTheme === "dark" ? "#000000" : "#ffffff", "line-width": 0.5, "line-opacity": 0.6 }}
        interactive={!!(onHover || onSelect)}
        onHover={(e) => onHover?.(e ? String(e.feature.properties?.psgc) : null)}
        onClick={(e) => (onSelect ?? onHover)?.(String(e.feature.properties?.psgc))}
        beforeId={beforeId}
      />
      <MapGeoJSON
        id="outlined"
        data={outlines}
        fillPaint={false}
        linePaint={{ "line-color": OUTLINE, "line-width": 2.5 }}
        beforeId={beforeId}
      />
      <MapGeoJSON
        id="selected"
        data={selected}
        fillPaint={false}
        linePaint={{ "line-color": resolvedTheme === "dark" ? "#ffffff" : "#000000", "line-width": 3 }}
        beforeId={beforeId}
      />
    </>
  )
}

/**
 * Barangay polygons over an OpenFreeMap basemap. Missing tiles leave a blank background;
 * opened offline, it skips the basemap so the polygons still draw.
 */
export function BarangayMap({
  features,
  fill,
  outlined,
  points = [],
  selected,
  onHover,
  onSelect,
  className,
}: {
  features: BarangayFeature[]
  /** Hex or rgb color per barangay; MapLibre can't read CSS variables. */
  fill: (b: Barangay) => string
  outlined?: Set<string>
  points?: MapPoint[]
  /** psgc drawn with a heavy outline. */
  selected?: string | null
  onHover?: (psgc: string | null) => void
  /** Called on click; without it, a click hovers (for touch). */
  onSelect?: (psgc: string) => void
  className?: string
}) {
  const [offline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine)
  const initialBounds = useMemo(() => bounds(features), [features])
  const filled = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: features.map((f) => ({ ...f, properties: { ...f.properties, color: fill(f.properties) } })),
    }),
    [features, fill],
  )
  const outlines = useMemo(
    () => ({ type: "FeatureCollection" as const, features: features.filter((f) => outlined?.has(f.properties.psgc)) }),
    [features, outlined],
  )
  const highlight = useMemo(
    () =>
      selected
        ? { type: "FeatureCollection" as const, features: features.filter((f) => f.properties.psgc === selected) }
        : NO_FEATURES,
    [features, selected],
  )

  return (
    <div className={cn("relative h-96 w-full overflow-hidden rounded-md border", className)}>
      <Map bounds={initialBounds} fitBoundsOptions={{ padding: 16 }} blank={offline} cooperativeGestures>
        <Polygons filled={filled} outlines={outlines} selected={highlight} onHover={onHover} onSelect={onSelect} />
        {points.map((p) => (
          <MapMarker key={p.id} longitude={p.lon} latitude={p.lat}>
            <MarkerContent>
              <span
                className={cn("block rounded-full border border-background bg-foreground", p.className)}
                style={{ width: (p.r ?? 6) * 2, height: (p.r ?? 6) * 2 }}
              />
            </MarkerContent>
          </MapMarker>
        ))}
        <MapControls showZoom />
      </Map>
    </div>
  )
}
