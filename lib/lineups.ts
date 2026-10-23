import { randomBytes } from "node:crypto"
import { getPool } from "./db.js"
import { isUuid } from "./plans.js"

// Private team lineups. Only ADMIN_EMAILS users reach these functions for
// listing and writing (see lib/lineup-routes.ts). The one public read is
// getSharedLineup(token), which returns a single lineup and only the players
// placed in it, as number + first name + last initial.

export const POSITIONS = ["LW", "C", "RW", "LD", "RD", "OUT"] as const
export type Position = (typeof POSITIONS)[number]
export type Slots = Record<Position, string[]>

const MAX_TITLE = 80
const MAX_PER_SLOT = 30
const MAX_LINEUPS = 300
const MAX_PLAYERS = 60
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/
const NAME_RE = /^[\p{L}][\p{L} .'-]{0,23}$/u
const INITIAL_RE = /^[A-Za-z]{0,3}$/

export interface Player {
  id: string
  number: number
  firstName: string
  lastInitial: string
  goalie: boolean
  active: boolean
}

export interface Lineup {
  id: string
  title: string
  slots: Slots
  shareToken: string | null
  createdAt: string
  updatedAt: string
}

export interface LineupSummary {
  id: string
  title: string
  placed: number
  out: number
  shared: boolean
  updatedAt: string
}

export class LineupInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LineupInputError"
  }
}

export function isShareToken(value: string): boolean {
  return TOKEN_RE.test(value)
}

export function playerLabel(player: Pick<Player, "number" | "firstName" | "lastInitial">): string {
  return [String(player.number), player.firstName, player.lastInitial].filter(Boolean).join(" ")
}

export function emptySlots(): Slots {
  return { LW: [], C: [], RW: [], LD: [], RD: [], OUT: [] }
}

// ---------- players ----------

export async function listPlayers(includeInactive = false): Promise<Player[]> {
  const result = await getPool().query(
    `SELECT id, number, first_name, last_initial, goalie, active
     FROM players
     ${includeInactive ? "" : "WHERE active"}
     ORDER BY goalie, number, first_name`
  )
  return result.rows.map(toPlayer)
}

export async function addPlayer(input: unknown): Promise<Player> {
  const body = asObject(input, "Could not read that player.")
  const number = cleanNumber(body.number)
  const firstName = cleanName(body.firstName)
  const lastInitial = cleanInitial(body.lastInitial)
  const goalie = body.goalie === true
  const pool = getPool()
  const count = await pool.query(`SELECT count(*)::int AS n FROM players WHERE active`)
  if (Number(count.rows[0]?.n || 0) >= MAX_PLAYERS) throw new LineupInputError("The roster is full.")
  const taken = await pool.query(`SELECT 1 FROM players WHERE active AND number = $1`, [number])
  if (taken.rowCount) throw new LineupInputError(`Number ${number} is already on the roster.`)
  const result = await pool.query(
    `INSERT INTO players (number, first_name, last_initial, goalie)
     VALUES ($1, $2, $3, $4)
     RETURNING id, number, first_name, last_initial, goalie, active`,
    [number, firstName, lastInitial, goalie]
  )
  return toPlayer(result.rows[0])
}

// Removing a player keeps the row (inactive) so saved lineups still show them.
export async function removePlayer(id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const result = await getPool().query(`UPDATE players SET active = false WHERE id = $1 AND active`, [id])
  return (result.rowCount ?? 0) > 0
}

// ---------- lineups ----------

export async function listLineups(): Promise<LineupSummary[]> {
  const result = await getPool().query(
    `SELECT id, title, slots, share_token, updated_at FROM lineups ORDER BY updated_at DESC, id DESC`
  )
  return result.rows.map((row) => {
    const slots = parseSlots(row.slots)
    const placed = POSITIONS.filter((p) => p !== "OUT").reduce((sum, p) => sum + slots[p].length, 0)
    return {
      id: String(row.id),
      title: String(row.title ?? ""),
      placed,
      out: slots.OUT.length,
      shared: Boolean(row.share_token),
      updatedAt: toIso(row.updated_at),
    }
  })
}

export async function getLineup(id: string): Promise<Lineup | null> {
  if (!isUuid(id)) return null
  const result = await getPool().query(
    `SELECT id, title, slots, share_token, created_at, updated_at FROM lineups WHERE id = $1`,
    [id]
  )
  return result.rows[0] ? toLineup(result.rows[0]) : null
}

export async function createLineup(input: unknown): Promise<Lineup> {
  const body = asObject(input, "Could not read that lineup.")
  const pool = getPool()
  const count = await pool.query(`SELECT count(*)::int AS n FROM lineups`)
  if (Number(count.rows[0]?.n || 0) >= MAX_LINEUPS) {
    throw new LineupInputError(`You can keep up to ${MAX_LINEUPS} lineups. Delete an old one first.`)
  }
  let title = cleanTitle(body.title)
  let slots = emptySlots()
  if (typeof body.copyFrom === "string" && body.copyFrom) {
    const source = await getLineup(body.copyFrom)
    if (!source) throw new LineupInputError("The lineup to copy was not found.")
    slots = source.slots
    if (!title) title = `${source.title || "Lineup"} (copy)`.slice(0, MAX_TITLE)
  } else if (body.slots !== undefined) {
    slots = await cleanSlots(body.slots)
  }
  const result = await pool.query(
    `INSERT INTO lineups (title, slots) VALUES ($1, $2::jsonb)
     RETURNING id, title, slots, share_token, created_at, updated_at`,
    [title, JSON.stringify(slots)]
  )
  return toLineup(result.rows[0])
}

export async function updateLineup(id: string, input: unknown): Promise<Lineup | null> {
  if (!isUuid(id)) return null
  const body = asObject(input, "Could not read that lineup.")
  const current = await getLineup(id)
  if (!current) return null
  const title = Object.prototype.hasOwnProperty.call(body, "title") ? cleanTitle(body.title) : current.title
  const slots = Object.prototype.hasOwnProperty.call(body, "slots") ? await cleanSlots(body.slots) : current.slots
  const result = await getPool().query(
    `UPDATE lineups SET title = $2, slots = $3::jsonb WHERE id = $1
     RETURNING id, title, slots, share_token, created_at, updated_at`,
    [id, title, JSON.stringify(slots)]
  )
  return result.rows[0] ? toLineup(result.rows[0]) : null
}

export async function deleteLineup(id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const result = await getPool().query(`DELETE FROM lineups WHERE id = $1`, [id])
  return (result.rowCount ?? 0) > 0
}

// Creates a link token, or replaces it when regenerate is true (the old link stops working).
export async function ensureShareToken(id: string, regenerate: boolean): Promise<string | null> {
  if (!isUuid(id)) return null
  const token = randomBytes(24).toString("base64url") // 32 chars, 192 bits
  const result = await getPool().query(
    regenerate
      ? `UPDATE lineups SET share_token = $2 WHERE id = $1 RETURNING share_token`
      : `UPDATE lineups SET share_token = COALESCE(share_token, $2) WHERE id = $1 RETURNING share_token`,
    [id, token]
  )
  return result.rows[0]?.share_token ? String(result.rows[0].share_token) : null
}

export async function clearShareToken(id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const result = await getPool().query(`UPDATE lineups SET share_token = NULL WHERE id = $1`, [id])
  return (result.rowCount ?? 0) > 0
}

export interface SharedLineup {
  title: string
  updatedAt: string
  goalies: string[]
  slots: Record<Position, string[]>
}

// Public read by link token. Returns labels only (no ids, no roster beyond this lineup).
export async function getSharedLineup(token: string): Promise<SharedLineup | null> {
  if (!isShareToken(token)) return null
  const pool = getPool()
  const result = await pool.query(`SELECT title, slots, updated_at FROM lineups WHERE share_token = $1`, [token])
  const row = result.rows[0]
  if (!row) return null
  const slots = parseSlots(row.slots)
  const ids = POSITIONS.flatMap((p) => slots[p])
  const players = await pool.query(
    `SELECT id, number, first_name, last_initial, goalie, active FROM players
     WHERE id = ANY($1::uuid[]) OR (goalie AND active)`,
    [ids]
  )
  const byId = new Map(players.rows.map((r) => [String(r.id), toPlayer(r)]))
  const labels = {} as Record<Position, string[]>
  for (const p of POSITIONS) {
    labels[p] = slots[p].flatMap((pid) => {
      const player = byId.get(pid)
      return player ? [playerLabel(player)] : []
    })
  }
  const out = new Set(slots.OUT)
  const goalies = [...byId.values()]
    .filter((p) => p.goalie && p.active && !out.has(p.id))
    .sort((a, b) => a.number - b.number)
    .map(playerLabel)
  return { title: String(row.title ?? ""), updatedAt: toIso(row.updated_at), goalies, slots: labels }
}

// ---------- validation ----------

async function cleanSlots(value: unknown): Promise<Slots> {
  const body = asObject(value, "Could not read the lineup columns.")
  const slots = emptySlots()
  const seen = new Set<string>()
  for (const position of POSITIONS) {
    const list = body[position]
    if (list === undefined || list === null) continue
    if (!Array.isArray(list) || list.length > MAX_PER_SLOT) throw new LineupInputError("Could not read the lineup columns.")
    for (const id of list) {
      if (typeof id !== "string" || !isUuid(id)) throw new LineupInputError("A player in the lineup was not found.")
      if (seen.has(id)) throw new LineupInputError("A player is in the lineup twice.")
      seen.add(id)
      slots[position].push(id)
    }
  }
  if (seen.size) {
    const found = await getPool().query(`SELECT id, goalie FROM players WHERE id = ANY($1::uuid[])`, [[...seen]])
    if (found.rowCount !== seen.size) throw new LineupInputError("A player in the lineup was not found.")
    // Goalies stay in net unless marked Out; they never go in a skater column.
    const goalies = new Set(found.rows.filter((r) => r.goalie).map((r) => String(r.id)))
    for (const position of POSITIONS) {
      if (position === "OUT") continue
      if (slots[position].some((id) => goalies.has(id))) throw new LineupInputError("Goalies can only be moved to Out.")
    }
  }
  return slots
}

function cleanTitle(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value !== "string") throw new LineupInputError("The lineup name needs to be text.")
  const title = value.trim()
  if (title.length > MAX_TITLE) throw new LineupInputError("The lineup name is too long.")
  return title
}

function cleanNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(String(value ?? "").trim())
  if (!Number.isInteger(number) || number < 0 || number > 99) throw new LineupInputError("Use a jersey number from 0 to 99.")
  return number
}

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
  if (!NAME_RE.test(name)) throw new LineupInputError("Enter a first name (letters only, up to 24).")
  return name
}

function cleanInitial(value: unknown): string {
  const initial = typeof value === "string" ? value.trim().replace(/\./g, "").toUpperCase() : ""
  if (!INITIAL_RE.test(initial)) throw new LineupInputError("Last initial: up to 3 letters, no full last names.")
  return initial
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LineupInputError(message)
  return value as Record<string, unknown>
}

function parseSlots(value: unknown): Slots {
  const slots = emptySlots()
  if (!value || typeof value !== "object" || Array.isArray(value)) return slots
  const body = value as Record<string, unknown>
  for (const position of POSITIONS) {
    const list = body[position]
    if (Array.isArray(list)) slots[position] = list.filter((id): id is string => typeof id === "string" && isUuid(id))
  }
  return slots
}

function toPlayer(row: Record<string, unknown>): Player {
  return {
    id: String(row.id),
    number: Number(row.number),
    firstName: String(row.first_name ?? ""),
    lastInitial: String(row.last_initial ?? ""),
    goalie: Boolean(row.goalie),
    active: Boolean(row.active),
  }
}

function toLineup(row: Record<string, unknown>): Lineup {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    slots: parseSlots(row.slots),
    shareToken: row.share_token ? String(row.share_token) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}
