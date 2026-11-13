import type { Pool } from "pg"
import { getPool } from "./db.js"

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ITEMS = 60
const MAX_TITLE = 80
const MAX_NOTE = 140
const MAX_NOTES = 2000
const MAX_MINUTES = 180
const MAX_PLANS = 100

export interface PlanItem {
  slug: string
  minutes: number | null
  note: string
}

export interface PlanRecord {
  id: string
  title: string
  items: PlanItem[]
  notes: string
  teamId: string | null
  practiceDate: string | null
  createdAt: string
  updatedAt: string
}

export interface PlanSummary {
  id: string
  title: string
  drillCount: number
  totalMinutes: number
  drills: string[]
  items: PlanItem[]
  notes: string
  teamId: string | null
  practiceDate: string | null
  createdAt: string
  updatedAt: string
}

export class PlanAccessError extends Error {
  constructor() {
    super("Plan not found.")
    this.name = "PlanAccessError"
  }
}

const TEAM_RE = /^[a-z0-9-]{1,32}$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export class PlanInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlanInputError"
  }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

const PLAN_COLUMNS = `p.id, p.title, p.items, p.notes, p.team_id, p.practice_date::text AS practice_date, p.created_at, p.updated_at`

function visiblePlans(userParam: string): string {
  return `(
    (p.team_id IS NULL AND p.user_id = ${userParam})
    OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = p.team_id AND m.user_id = ${userParam})
  )`
}

export async function listPlans(userId: string): Promise<PlanSummary[]> {
  const result = await query(
    `SELECT ${PLAN_COLUMNS}
     FROM plans p
     WHERE ${visiblePlans("$1")}
     ORDER BY p.updated_at DESC, p.id DESC`,
    [userId]
  )
  return result.rows.map(toSummary)
}

export async function listTeamPlans(userId: string, teamId: string): Promise<PlanSummary[]> {
  if (!TEAM_RE.test(teamId)) return []
  const result = await query(
    `SELECT ${PLAN_COLUMNS}
     FROM plans p
     WHERE p.team_id = $2 AND ${visiblePlans("$1")}
     ORDER BY p.practice_date DESC NULLS LAST, p.updated_at DESC, p.id DESC`,
    [userId, teamId]
  )
  return result.rows.map(toSummary)
}

export async function getPlan(userId: string, id: string): Promise<PlanRecord | null> {
  if (!isUuid(id)) return null
  const result = await query(
    `SELECT ${PLAN_COLUMNS}
     FROM plans p
     WHERE p.id = $1 AND ${visiblePlans("$2")}`,
    [id, userId]
  )
  const row = result.rows[0]
  return row ? toRecord(row) : null
}

export async function createPlan(userId: string, input: unknown): Promise<PlanRecord> {
  const body = await withCopy(userId, input)
  const plan = validatePlan(body, { partial: false })
  const teamId = await resolveTeam(userId, plan.teamId, { allowNull: true })
  const existing = await query(`SELECT count(*)::int AS n FROM plans WHERE user_id = $1`, [userId])
  if (Number(existing.rows[0]?.n || 0) >= MAX_PLANS) {
    throw new PlanInputError(`You can save up to ${MAX_PLANS} plans. Delete one before adding another.`)
  }
  const result = await query(
    `INSERT INTO plans (user_id, title, items, notes, team_id, practice_date)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id, title, items, notes, team_id, practice_date::text AS practice_date, created_at, updated_at`,
    [userId, plan.title, JSON.stringify(plan.items), plan.notes, teamId, plan.practiceDate]
  )
  return toRecord(result.rows[0])
}

export async function updatePlan(userId: string, id: string, input: unknown): Promise<PlanRecord | null> {
  if (!isUuid(id)) return null
  const current = await getPlan(userId, id)
  if (!current) return null
  const patch = validatePlan(input, { partial: true })
  const next = {
    title: patch.title ?? current.title,
    items: patch.items ?? current.items,
    notes: patch.notes ?? current.notes,
    practiceDate: patch.practiceDate === undefined ? current.practiceDate : patch.practiceDate,
    teamId: current.teamId,
  }
  if (patch.teamId !== undefined) {
    if (patch.teamId === null && current.teamId) {
      const owner = await query(`SELECT user_id FROM plans WHERE id = $1`, [id])
      if (String(owner.rows[0]?.user_id || "") !== userId) {
        throw new PlanInputError("Only the coach who saved this plan can make it personal.")
      }
      next.teamId = null
    } else {
      next.teamId = await resolveTeam(userId, patch.teamId, { allowNull: true })
    }
  }
  if (!next.title.trim() && next.items.length === 0 && !next.notes.trim()) {
    throw new PlanInputError("Add a drill, a title, or a note before saving.")
  }
  const result = await query(
    `UPDATE plans p
     SET title = $3, items = $4::jsonb, notes = $5, team_id = $6, practice_date = $7
     WHERE p.id = $1 AND ${visiblePlans("$2")}
     RETURNING p.id, p.title, p.items, p.notes, p.team_id, p.practice_date::text AS practice_date, p.created_at, p.updated_at`,
    [id, userId, next.title, JSON.stringify(next.items), next.notes, next.teamId, next.practiceDate]
  )
  const row = result.rows[0]
  return row ? toRecord(row) : null
}

export async function deletePlan(userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const result = await query(
    `DELETE FROM plans p
     WHERE p.id = $1
       AND ${visiblePlans("$2")}
       AND (
         p.user_id = $2
         OR EXISTS (
           SELECT 1 FROM team_members m
           WHERE m.team_id = p.team_id AND m.user_id = $2 AND m.role = 'owner'
         )
       )`,
    [id, userId]
  )
  return (result.rowCount ?? 0) > 0
}

async function withCopy(userId: string, input: unknown): Promise<unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input
  const raw = input as Record<string, unknown>
  if (typeof raw.copyFrom !== "string" || !raw.copyFrom) return input
  if (!isUuid(raw.copyFrom)) throw new PlanAccessError()
  const source = await getPlan(userId, raw.copyFrom)
  if (!source) throw new PlanAccessError()
  return {
    title: Object.prototype.hasOwnProperty.call(raw, "title") ? raw.title : source.title,
    notes: Object.prototype.hasOwnProperty.call(raw, "notes") ? raw.notes : source.notes,
    items: Object.prototype.hasOwnProperty.call(raw, "items") ? raw.items : source.items,
    teamId: Object.prototype.hasOwnProperty.call(raw, "teamId") ? raw.teamId : source.teamId,
    practiceDate: Object.prototype.hasOwnProperty.call(raw, "practiceDate") ? raw.practiceDate : source.practiceDate,
  }
}

async function resolveTeam(userId: string, teamId: string | null | undefined, options: { allowNull: boolean }): Promise<string | null> {
  if (teamId === undefined || teamId === null || teamId === "") return options.allowNull ? null : null
  if (typeof teamId !== "string" || !TEAM_RE.test(teamId)) throw new PlanAccessError()
  const member = await query(`SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2`, [userId, teamId])
  if (!member.rowCount) throw new PlanAccessError()
  return teamId
}

function validatePlan(input: unknown, options: { partial: boolean }): {
  title?: string
  items?: PlanItem[]
  notes?: string
  teamId?: string | null
  practiceDate?: string | null
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlanInputError("Could not read that plan.")
  }
  const body = input as Record<string, unknown>
  const hasTitle = Object.prototype.hasOwnProperty.call(body, "title")
  const hasItems = Object.prototype.hasOwnProperty.call(body, "items")
  const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes")
  const hasTeam = Object.prototype.hasOwnProperty.call(body, "teamId")
  const hasDate = Object.prototype.hasOwnProperty.call(body, "practiceDate")
  if (options.partial && !hasTitle && !hasItems && !hasNotes && !hasTeam && !hasDate) {
    throw new PlanInputError("Nothing to update.")
  }
  if (!options.partial && !hasTitle && !hasItems && !hasNotes) {
    throw new PlanInputError("Add a drill, a title, or a note before saving.")
  }

  const plan: {
    title?: string
    items?: PlanItem[]
    notes?: string
    teamId?: string | null
    practiceDate?: string | null
  } = {}
  if (hasTitle || !options.partial) plan.title = cleanTitle(body.title)
  if (hasNotes || !options.partial) plan.notes = cleanNotes(body.notes)
  if (hasItems || !options.partial) plan.items = cleanItems(body.items)
  if (hasTeam) plan.teamId = cleanTeamId(body.teamId)
  if (hasDate || !options.partial) plan.practiceDate = cleanPracticeDate(hasDate ? body.practiceDate : null)

  if (!options.partial) {
    const title = plan.title || ""
    const notes = plan.notes || ""
    const items = plan.items || []
    if (!title.trim() && items.length === 0 && !notes.trim()) {
      throw new PlanInputError("Add a drill, a title, or a note before saving.")
    }
  }
  return plan
}

function cleanTeamId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string" || !TEAM_RE.test(value)) throw new PlanAccessError()
  return value
}

function cleanPracticeDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") throw new PlanInputError("The practice date needs to be YYYY-MM-DD.")
  const match = DATE_RE.exec(value)
  if (!match) throw new PlanInputError("The practice date needs to be YYYY-MM-DD.")
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 2000 || year > 2100) throw new PlanInputError("The practice date needs to be YYYY-MM-DD.")
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new PlanInputError("The practice date needs to be YYYY-MM-DD.")
  }
  return value
}

function cleanTitle(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value !== "string") throw new PlanInputError("The title needs to be text.")
  const title = value.slice(0, MAX_TITLE + 1)
  if (title.length > MAX_TITLE) throw new PlanInputError("The title is too long.")
  return title
}

function cleanNotes(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value !== "string") throw new PlanInputError("The notes need to be text.")
  if (value.length > MAX_NOTES) throw new PlanInputError("The practice notes are too long.")
  return value
}

function cleanItems(value: unknown): PlanItem[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new PlanInputError("The drill list could not be read.")
  if (value.length > MAX_ITEMS) throw new PlanInputError(`A plan can hold up to ${MAX_ITEMS} drills.`)
  const seen = new Set<string>()
  const items: PlanItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") throw new PlanInputError("One of the drills could not be read.")
    const item = entry as Record<string, unknown>
    if (typeof item.slug !== "string" || !SLUG_RE.test(item.slug) || item.slug.length > 80) {
      throw new PlanInputError("One of the drills is not in the library.")
    }
    if (seen.has(item.slug)) throw new PlanInputError("A drill is listed twice.")
    seen.add(item.slug)
    let note = ""
    if (item.note !== undefined && item.note !== null) {
      if (typeof item.note !== "string") throw new PlanInputError("A drill note needs to be text.")
      if (item.note.length > MAX_NOTE) throw new PlanInputError("A drill note is too long.")
      note = item.note
    }
    items.push({ slug: item.slug, minutes: cleanMinutes(item.minutes), note })
  }
  return items
}

function cleanMinutes(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number) || number < 0 || number > MAX_MINUTES) {
    throw new PlanInputError(`Minutes need to be from 0 to ${MAX_MINUTES}.`)
  }
  return Math.round(number)
}

function parseStoredItems(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const item = entry as Record<string, unknown>
    if (typeof item.slug !== "string") return []
    const minutes = typeof item.minutes === "number" ? item.minutes : null
    const note = typeof item.note === "string" ? item.note : ""
    return [{ slug: item.slug, minutes, note }]
  })
}

function totalMinutes(items: PlanItem[]): number {
  return items.reduce((sum, item) => sum + (item.minutes ?? 0), 0)
}

function toSummary(row: Record<string, unknown>): PlanSummary {
  const items = parseStoredItems(row.items)
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    drillCount: items.length,
    totalMinutes: totalMinutes(items),
    drills: items.map((item) => item.slug),
    items,
    notes: String(row.notes ?? ""),
    teamId: row.team_id ? String(row.team_id) : null,
    practiceDate: practiceDay(row.practice_date),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toRecord(row: Record<string, unknown>): PlanRecord {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    items: parseStoredItems(row.items),
    notes: String(row.notes ?? ""),
    teamId: row.team_id ? String(row.team_id) : null,
    practiceDate: practiceDay(row.practice_date),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function practiceDay(value: unknown): string | null {
  if (!value) return null
  const text = String(value).slice(0, 10)
  return DATE_RE.test(text) ? text : null
}

// Same query the practice page already understands: d, m, t, pn, date, n.
export function practicePagePath(plan: Pick<PlanRecord, "title" | "notes" | "items" | "practiceDate">): string {
  const params = new URLSearchParams()
  params.set("d", plan.items.map((item) => item.slug).join(","))
  const minutes = plan.items.map((item) => (item.minutes == null ? "" : String(item.minutes)))
  while (minutes.length && minutes[minutes.length - 1] === "") minutes.pop()
  if (minutes.some((value) => value !== "")) params.set("m", minutes.join(","))
  const title = plan.title.trim().slice(0, 80)
  if (title) params.set("t", title)
  const notes = plan.notes.trim()
  if (notes) params.set("pn", notes.slice(0, 2000))
  if (plan.practiceDate) params.set("date", plan.practiceDate)
  let query = params.toString()
  const drillNotes = plan.items.map((item) => item.note.slice(0, 140).replace(/\u001f/g, ""))
  while (drillNotes.length && !drillNotes[drillNotes.length - 1]) drillNotes.pop()
  if (drillNotes.some((note) => note.trim())) {
    query += `${query ? "&" : ""}n=${drillNotes.map((note) => encodeURIComponent(note)).join("%1F")}`
  }
  return `/practice/?${query}`
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

async function query(text: string, params: unknown[]) {
  return getPool().query(text, params)
}

export function pool(): Pool {
  return getPool()
}
