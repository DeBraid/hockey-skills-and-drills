import { Pool, type PoolConfig } from "pg"

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is not set")
  pool = new Pool(poolConfig(connectionString))
  return pool
}

export async function closePool(): Promise<void> {
  if (!pool) return
  const current = pool
  pool = null
  await current.end()
}

function poolConfig(connectionString: string): PoolConfig {
  const config: PoolConfig = {
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
  }
  if (isNeon(connectionString)) config.ssl = { rejectUnauthorized: false }
  return config
}

function isNeon(connectionString: string): boolean {
  try {
    return new URL(connectionString).hostname.includes("neon.tech")
  } catch {
    return connectionString.includes("neon.tech")
  }
}
