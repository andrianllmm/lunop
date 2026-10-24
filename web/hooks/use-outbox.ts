import * as React from "react"

import { flush, onOutboxChange, pending } from "@/lib/outbox"

const RETRY_MS = 30_000
const MAX_RETRY_MS = 10 * 60_000

/**
 * Pending report count, flushing on app open, on `online` and after `send()`.
 * While reports stay queued and the device is online, retries with backoff.
 */
export function useOutbox() {
  const [count, setCount] = React.useState(0)
  const retry = React.useRef<{ timer?: ReturnType<typeof setTimeout>; attempt: number }>({ attempt: 0 })

  const send = React.useCallback(async function attempt() {
    clearTimeout(retry.current.timer)
    const result = await flush().catch(() => null)
    setCount((await pending()).length)
    if (!result?.pending) {
      retry.current.attempt = 0
    } else if (navigator.onLine) {
      const delay = Math.min(RETRY_MS * 2 ** retry.current.attempt++, MAX_RETRY_MS)
      retry.current.timer = setTimeout(attempt, delay)
    }
    return result
  }, [])

  React.useEffect(() => {
    const r = retry.current
    send()
    const refresh = () => pending().then((q) => setCount(q.length))
    const stop = onOutboxChange(refresh)
    window.addEventListener("online", send)
    return () => {
      stop()
      window.removeEventListener("online", send)
      clearTimeout(r.timer)
    }
  }, [send])

  return { pending: count, send }
}
