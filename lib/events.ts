import { getPool } from "./db.js"

// Product usage log. Rows never hold emails, IP addresses, or user agents.
// Browsers may only send the CLIENT_EVENTS names below. Server-side actions
// (sign-in, plan writes) are logged by the server so they cannot be faked.

export const CLIENT_EVENTS = ["page_view", "drill_view", "drill_add_to_plan", "plan_share", "plan_print"] as const
export const SERVER_EVENTS = ["sign_in", "plan_create", "plan_save", "plan_delete"] as const

export type ClientEventName = (typeof CLIENT_EVENTS)[number]
export type EventName = ClientEventName | (typeof SERVER_EVENTS)[number]

export const MAX_EVENT_BODY = 2048
const PAGES = new Set(["home", "drill", "plan", "account", "privacy", "terms", "other"])
const ANON_RE = /^[A-Za-z0-9_-]{16,64}$/
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface EventRecord {
  name: EventName
  userId?: string | null
  anonId?: string | null
  drillSlug?: string | null
  planId?: string | null
  props?: Record<string, string | number | boolean>
}

// Validates a browser event. Unknown keys are dropped; props are rebuilt from
// checked values only, so nothing free-form reaches the database.
export function parseClientEvent(input: unknown): EventRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const body = input as Record<string, unknown>
  const name = body.name
  if (typeof name !== "string" || !(CLIENT_EVENTS as readonly string[]).includes(name)) return null
  const anon = body.anon
  if (typeof anon !== "string" || !ANON_RE.test(anon)) return null
  const event: EventRecord = { name: name as ClientEventName, anonId: anon, props: {} }
  if (name === "drill_view" || name === "drill_add_to_plan") {
    const drill = body.drill
    if (typeof drill !== "string" || drill.length > 80 || !SLUG_RE.test(drill)) return null
    event.drillSlug = drill
  }
  if (name === "page_view") {
    const page = typeof body.page === "string" && PAGES.has(body.page) ? body.page : "other"
    event.props = { page }
  }
  if (name === "plan_share" || name === "plan_print") {
    const drills = Number(body.drills)
    if (Number.isInteger(drills) && drills >= 0 && drills <= 60) event.props = { drills }
  }
  return event
}

export async function recordEvent(event: EventRecord): Promise<void> {
  const userId = event.userId && UUID_RE.test(event.userId) ? event.userId : null
  const planId = event.planId && UUID_RE.test(event.planId) ? event.planId : null
  const anonId = event.anonId && ANON_RE.test(event.anonId) ? event.anonId : null
  const drillSlug = event.drillSlug && SLUG_RE.test(event.drillSlug) && event.drillSlug.length <= 80 ? event.drillSlug : null
  await getPool().query(
    `INSERT INTO events (name, user_id, anon_id, drill_slug, plan_id, props)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [event.name, userId, anonId, drillSlug, planId, JSON.stringify(event.props || {})]
  )
}

// Server-side logging must never break the action it describes.
export async function logEvent(event: EventRecord): Promise<void> {
  try {
    await recordEvent(event)
  } catch (error) {
    console.error("event log failed", error instanceof Error ? error.message : error)
  }
}
