import "fake-indexeddb/auto"

import { beforeEach, describe, expect, it } from "vitest"

import { enqueue, flush, pending, type QueuedReport } from "@/lib/outbox"

let seq = 0
function queued(over: Partial<QueuedReport> = {}): QueuedReport {
  seq += 1
  return {
    client_id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    observed_at: new Date(Date.UTC(2026, 9, 24, 0, seq)).toISOString(),
    lat: null,
    lon: null,
    psgc: "PH063022026",
    depth: "knee",
    duration_h: null,
    waded: true,
    website: "",
    ...over,
  }
}

/** A fake `POST /api/reports` that stores rows by `client_id`, like the real one. */
function server(statuses: (number | "network")[] = []) {
  const rows = new Map<string, QueuedReport>()
  const fetcher = (async (_url: string, init: RequestInit) => {
    const next = statuses.shift() ?? 200
    if (next === "network") throw new TypeError("Failed to fetch")
    const body: QueuedReport = JSON.parse(init.body as string)
    if (next < 300) rows.set(body.client_id, body)
    return new Response("{}", { status: next })
  }) as typeof fetch
  return { rows, fetcher }
}

// Each test starts with an empty queue.
beforeEach(() => flush(server().fetcher))

describe("outbox", () => {
  it("sends a queued report and empties the queue", async () => {
    const s = server()
    await enqueue(queued())
    expect(await pending()).toHaveLength(1)
    expect(await flush(s.fetcher)).toEqual({ sent: 1, dropped: 0, pending: 0 })
    expect(s.rows.size).toBe(1)
    expect(await pending()).toHaveLength(0)
  })

  it("stores one row when the same report is queued and flushed twice", async () => {
    const s = server()
    const r = queued()
    await enqueue(r)
    await enqueue(r)
    await Promise.all([flush(s.fetcher), flush(s.fetcher)])
    await flush(s.fetcher)
    expect(s.rows.size).toBe(1)
  })

  it("keeps the report on 429 and sends it on the next flush", async () => {
    const s = server([429])
    await enqueue(queued())
    expect(await flush(s.fetcher)).toEqual({ sent: 0, dropped: 0, pending: 1 })
    expect(await flush(s.fetcher)).toEqual({ sent: 1, dropped: 0, pending: 0 })
    expect(s.rows.size).toBe(1)
  })

  it("keeps the report on a network error", async () => {
    const s = server(["network"])
    await enqueue(queued())
    expect((await flush(s.fetcher)).pending).toBe(1)
    expect((await flush(s.fetcher)).sent).toBe(1)
  })

  it("drops a report the server rejects with 400", async () => {
    const s = server([400])
    await enqueue(queued())
    expect(await flush(s.fetcher)).toEqual({ sent: 0, dropped: 1, pending: 0 })
    expect(s.rows.size).toBe(0)
    expect(await pending()).toHaveLength(0)
  })
})
