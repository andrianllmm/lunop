import { spawnSync } from "node:child_process"

import { createSerwistRoute } from "@serwist/turbopack"

// Builds and serves `/serwist/sw.js` from `app/sw.ts` (TRD §10.1).

const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() || crypto.randomUUID()

/** Pages precached as HTML, so every route opens offline. */
const PAGES = ["/", "/dashboard", "/priority", "/replay", "/methods", "/report", "/~offline"]

const serwist = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: PAGES.map((url) => ({ url, revision })),
  globPatterns: [".next/static/**/*.{js,css,woff2,png,svg}", "public/**/*"],
  // Network first in the worker instead.
  globIgnores: ["public/data/forecast.json"],
})

export const generateStaticParams = serwist.generateStaticParams

// Its route segment config is rejected under `cacheComponents`, so cache the
// output instead; that prerenders `sw.js` at build, where `.next/static` exists.
async function build(path: string) {
  "use cache"
  const res = await serwist.GET(new Request("http://localhost"), { params: Promise.resolve({ path }) })
  return { body: await res.text(), type: res.headers.get("content-type") ?? "text/plain" }
}

export async function GET(_: Request, { params }: RouteContext<"/serwist/[path]">) {
  const { body, type } = await build((await params).path)
  return new Response(body, { headers: { "content-type": type, "service-worker-allowed": "/" } })
}
