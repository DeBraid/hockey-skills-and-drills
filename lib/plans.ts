import type { Pool } from "pg"
import { getPool } from "./db.js"

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ITEMS = 60
const MAX_TITLE = 80
const MAX_NOTE = 140
const MAX_NOTES = 2000
const MAX_MINUTES = 180

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
  createdAt: string
  updatedAt: string
}

export interface PlanSummary {
  id: string
  title: string
  drillCount: number
  totalMinutes: number
  createdAt: string
  updatedAt: string
}

export class PlanInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlanInputError"
  }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export async function listPlans(userId: string): Promise<PlanSummary[]> {
  const result = await query(
    `SELECT id, title, items, created_at, updated_at
     FROM plans
     WHERE user_id = $1
     ORDER BY updated_at DESC, id DESC`,
    [userId]
  )
  return result.rows.map((row) => {
    const items = parseStoredItems(row.items)
    return {
      id: String(row.id),
      title: String(row.title ?? ""),
      drillCount: items.length,
      totalMinutes: totalMinutes(items),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }
  })
}

export async function getPlan(userId: string, id: string): Promise<PlanRecord | null> {
  if (!isUuid(id)) return null
  const result = await query(
    `SELECT id, title, items, notes, created_at, updated_at
     FROM plans
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  )
  const row = result.rows[0]
  return row ? toRecord(row) : null
}

export async function createPlan(userId: string, input: unknown): Promise<PlanRecord> {
  const plan = validatePlan(input, { partial: false })
  const result = await query(
    `INSERT INTO plans (user_id, title, items, notes)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, title, items, notes, created_at, updated_at`,
    [userId, plan.title, JSON.stringify(plan.items), plan.notes]
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
  }
  if (!next.title.trim() && next.items.length === 0 && !next.notes.trim()) {
    throw new PlanInputError("Add a drill, a title, or a note before saving.")
  }
  const result = await query(
    `UPDATE plans
     SET title = $3, items = $4::jsonb, notes = $5
     WHERE id = $1 AND user_id = $2
     RETURNING id, title, items, notes, created_at, updated_at`,
    [id, userId, next.title, JSON.stringify(next.items), next.notes]
  )
  const row = result.rows[0]
  return row ? toRecord(row) : null
}

export async function deletePlan(userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const result = await query(`DELETE FROM plans WHERE id = $1 AND user_id = $2`, [id, userId])
  return (result.rowCount ?? 0) > 0
}

function validatePlan(input: unknown, options: { partial: boolean }): {
  title?: string
  items?: PlanItem[]
  notes?: string
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlanInputError("Could not read that plan.")
  }
  const body = input as Record<string, unknown>
  const hasTitle = Object.prototype.hasOwnProperty.call(body, "title")
  const hasItems = Object.prototype.hasOwnProperty.call(body, "items")
  const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes")
  if (options.partial && !hasTitle && !hasItems && !hasNotes) {
    throw new PlanInputError("Nothing to update.")
  }
  if (!options.partial && !hasTitle && !hasItems && !hasNotes) {
    throw new PlanInputError("Add a drill, a title, or a note before saving.")
  }

  const plan: { title?: string; items?: PlanItem[]; notes?: string } = {}
  if (hasTitle || !options.partial) plan.title = cleanTitle(body.title)
  if (hasNotes || !options.partial) plan.notes = cleanNotes(body.notes)
  if (hasItems || !options.partial) plan.items = cleanItems(body.items)

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

function toRecord(row: Record<string, unknown>): PlanRecord {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    items: parseStoredItems(row.items),
    notes: String(row.notes ?? ""),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
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
