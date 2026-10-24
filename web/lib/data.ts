export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

/** The parts of `performance.json` the UI reads. */
export type Performance = {
  loeo: { summary: { events: number; alerts_with_cases: { surges: number; hit_rate_high: number; false_alarm_high: number } } }
}
