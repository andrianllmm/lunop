import booleanPointInPolygon from "@turf/boolean-point-in-polygon"
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson"

import type { Barangay } from "@/lib/types"

/** `barangays.geojson`. */
export type Barangays = FeatureCollection<Polygon | MultiPolygon, Barangay>

/** psgc of the barangay containing a GPS point, or null outside the city. */
export function locate(barangays: Barangays, lat: number, lon: number): string | null {
  const hit = barangays.features.find((f) => booleanPointInPolygon([lon, lat], f))
  return hit?.properties.psgc ?? null
}
