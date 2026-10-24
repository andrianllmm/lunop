import { Pool } from "pg"

/** Server-only connection pool for `flood_reports` (TRD §8). */
export const db = new Pool({ connectionString: process.env.DATABASE_URL })
