import { createStore, del, set, values, type UseStore } from "idb-keyval"

import type { Depth } from "@/lib/types"

/** A `POST /api/reports` body, saved on the device before any network call (TRD §10.1). */
export type QueuedReport = {
  client_id: string
  observed_at: string
  lat: number | null
  lon: number | null
  psgc: string
  depth: Depth
  duration_h: number | null
  waded: boolean
  website: string
}

export type FlushResult = { sent: number; dropped: number; pending: number }

/** Background Sync tag; the service worker flushes on it (Chromium only). */
export const SYNC_TAG = "outbox"
const CHANNEL = "outbox"

// Created lazily: the module is also imported during SSR, where IndexedDB doesn't exist.
let store: UseStore | undefined
const db = () => (store ??= createStore("lunop-outbox", "reports"))

function notify() {
  if (typeof BroadcastChannel === "undefined") return
  const ch = new BroadcastChannel(CHANNEL)
  ch.postMessage("changed")
  ch.close()
}

/** Calls `fn` whenever the outbox changes in any tab or the service worker. */
export function onOutboxChange(fn: () => void) {
  if (typeof BroadcastChannel === "undefined") return () => {}
  const ch = new BroadcastChannel(CHANNEL)
  ch.onmessage = fn
  return () => ch.close()
}

export async function pending(): Promise<QueuedReport[]> {
  const all = await values<QueuedReport>(db())
  return all.sort((a, b) => a.observed_at.localeCompare(b.observed_at))
}

export async function enqueue(report: QueuedReport) {
  await set(report.client_id, report, db())
  notify()
  // Lets Chromium send it even after the tab closes. iOS Safari has no Background Sync.
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((r) => (r as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register(SYNC_TAG))
      .catch(() => {})
  }
}

let inflight: Promise<FlushResult> | undefined

/**
 * Sends queued reports oldest first. 2xx and 4xx other than 429 remove the entry
 * (`client_id` makes resends safe); 429, 5xx and network errors keep it and stop.
 */
export function flush(fetcher: typeof fetch = fetch): Promise<FlushResult> {
  inflight ??= (async () => {
    let sent = 0
    let dropped = 0
    const queue = await pending()
    for (const report of queue) {
      let status: number
      try {
        const res = await fetcher("/api/reports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(report),
        })
        status = res.status
      } catch {
        break
      }
      if (status === 429 || status >= 500) break
      await del(report.client_id, db())
      if (status < 300) sent++
      else dropped++
    }
    if (sent || dropped) notify()
    return { sent, dropped, pending: queue.length - sent - dropped }
  })().finally(() => (inflight = undefined))
  return inflight
}
