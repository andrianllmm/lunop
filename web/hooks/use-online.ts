import * as React from "react"

// `navigator.onLine` misses "connected to Wi-Fi with no internet", so failed
// fetches also mark the app offline until the next success (TRD §10.1).
let failed = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Call after a data fetch: `false` on a network error, `true` on success. */
export function reportFetch(ok: boolean) {
  if (failed === !ok) return
  failed = !ok
  emit()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  window.addEventListener("online", fn)
  window.addEventListener("offline", fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener("online", fn)
    window.removeEventListener("offline", fn)
  }
}

/** False when the device is offline or the last data fetch failed. */
export function useOnline() {
  return React.useSyncExternalStore(
    subscribe,
    () => navigator.onLine && !failed,
    () => true,
  )
}
