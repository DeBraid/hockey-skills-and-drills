import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("Set DATABASE_URL to the Neon connection string, then run npm run migrate again.")
  process.exit(1)
}

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations", "001_init.sql")
const sql = fs.readFileSync(file, "utf8")
const pool = new pg.Pool({
  connectionString,
  max: 1,
  ssl: sslFor(connectionString),
})

try {
  await pool.query(sql)
  console.log("Migration applied: db/migrations/001_init.sql")
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}

function sslFor(value) {
  try {
    const host = new URL(value).hostname
    if (host.includes("neon.tech")) return { rejectUnauthorized: false }
  } catch {
    return undefined
  }
  return undefined
}
