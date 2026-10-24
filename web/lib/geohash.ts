const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

/** Standard geohash of a point; precision 7 is a ~150 m cell. */
export function geohash(lat: number, lon: number, precision: number) {
  const latRange = [-90, 90]
  const lonRange = [-180, 180]
  let hash = ""
  let bits = 0
  let ch = 0
  let even = true
  while (hash.length < precision) {
    const r = even ? lonRange : latRange
    const v = even ? lon : lat
    const mid = (r[0] + r[1]) / 2
    ch <<= 1
    if (v >= mid) {
      ch |= 1
      r[0] = mid
    } else {
      r[1] = mid
    }
    even = !even
    if (++bits === 5) {
      hash += BASE32[ch]
      bits = 0
      ch = 0
    }
  }
  return hash
}
