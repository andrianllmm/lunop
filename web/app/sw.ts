import { defaultCache } from "@serwist/turbopack/worker"
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate, type PrecacheEntry, type SerwistGlobalConfig } from "serwist"

import { flush, SYNC_TAG } from "@/lib/outbox"

// Service worker (TRD §10.1). Built by `app/serwist/[path]/route.ts`.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const OFM = "https://tiles.openfreemap.org"
const STYLE_CACHE = "basemap-style"
const TILES_CACHE = "basemap-tiles"
/** Tile count cap; other areas cache as viewed until this many. */
const MAX_TILES = 2000
/** Iloilo City, from `barangays.geojson`, pre-warmed at these zooms. */
const ILOILO = { west: 122.49, south: 10.67, east: 122.61, north: 10.79 }
const WARM_ZOOMS = [11, 12, 13, 14, 15]

const serwist = new Serwist({
  // App shell, pages, `~offline`, and every data file except `forecast.json`.
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname === "/data/forecast.json",
      handler: new NetworkFirst({ cacheName: "forecast", networkTimeoutSeconds: 5 }),
    },
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname === "/api/reports",
      method: "GET",
      handler: new NetworkFirst({ cacheName: "reports", networkTimeoutSeconds: 5 }),
    },
    {
      // Style and TileJSON name the current tile build, so refresh them in the background.
      matcher: ({ url }) => url.origin === OFM && (url.pathname.startsWith("/styles/") || url.pathname === "/planet"),
      handler: new StaleWhileRevalidate({ cacheName: STYLE_CACHE }),
    },
    {
      matcher: ({ url }) => url.origin === OFM,
      handler: new CacheFirst({
        cacheName: TILES_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: MAX_TILES })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
})

/** Slippy-map tile x/y covering a point. */
function tileXY(lon: number, lat: number, z: number) {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
  }
}

/**
 * Caches the basemap styles and Iloilo's tiles. Added directly, so the tile cap
 * never evicts them; tiles already cached are skipped.
 */
async function warmBasemap() {
  const styles = await caches.open(STYLE_CACHE)
  await styles.addAll([`${OFM}/styles/positron`, `${OFM}/styles/dark`, `${OFM}/planet`])
  const tilejson: { tiles: string[] } = await (await styles.match(`${OFM}/planet`))!.json()
  const tiles = await caches.open(TILES_CACHE)
  const urls: string[] = []
  for (const z of WARM_ZOOMS) {
    const min = tileXY(ILOILO.west, ILOILO.north, z)
    const max = tileXY(ILOILO.east, ILOILO.south, z)
    for (let x = min.x; x <= max.x; x++)
      for (let y = min.y; y <= max.y; y++)
        urls.push(tilejson.tiles[0].replace("{z}", `${z}`).replace("{x}", `${x}`).replace("{y}", `${y}`))
  }
  await Promise.allSettled(urls.map(async (url) => (await tiles.match(url)) ?? tiles.add(url)))
}

self.addEventListener("activate", (event) => event.waitUntil(warmBasemap().catch(() => {})))

// Background Sync (Chromium): send queued reports; throwing makes the browser retry later.
self.addEventListener("sync", (event) => {
  const e = event as ExtendableEvent & { tag: string }
  if (e.tag !== SYNC_TAG) return
  e.waitUntil(
    flush().then((r) => {
      if (r.pending) throw new Error(`${r.pending} reports still queued`)
    }),
  )
})

serwist.addEventListeners()
