import { createHash } from "node:crypto"
import { getPool } from "./db.js"

export async function consumeLimit(prefix: string, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const bucket = `${prefix}:${digest(key)}`
  const result = await getPool().query(
    `INSERT INTO rate_limits (bucket, hits, reset_at)
     VALUES ($1, 1, now() + ($2 * interval '1 second'))
     ON CONFLICT (bucket) DO UPDATE SET
       hits = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
       reset_at = CASE
         WHEN rate_limits.reset_at <= now() THEN now() + ($2 * interval '1 second')
         ELSE rate_limits.reset_at
       END
     RETURNING hits`,
    [bucket, windowSeconds]
  )
  await getPool().query(`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 day'`)
  return Number(result.rows[0]?.hits || 0) <= limit
}

function digest(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32)
}
