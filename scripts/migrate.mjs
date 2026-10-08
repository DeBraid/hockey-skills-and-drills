import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("Set DATABASE_URL to the Neon connection string, then run npm run migrate again.")
  process.exit(1)
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations")
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()
const pool = new pg.Pool({
  connectionString,
  max: 1,
  ssl: sslFor(connectionString),
})

try {
  for (const name of files) {
    const sql = fs.readFileSync(path.join(dir, name), "utf8")
    await pool.query(sql)
    console.log(`Migration applied: db/migrations/${name}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}

function sslFor(value) {
  try {
    const host = new URL(value).hostname
    if (host.includes("neon.tech")) return { rejectUnauthorized: true }
  } catch {
    return undefined
  }
  return undefined
}
