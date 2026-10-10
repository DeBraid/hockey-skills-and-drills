import { deleteUserAccount, DELETE_CONFIRM } from "./account.js"
import { accountsReady, devMagicLinkEnabled, emailReady, googleReady, handleAuth, peekMagicLink, readSession } from "./auth.js"
import { resolvePublicUrl, routedUrl } from "./base-path.js"
import { isAdminEmail } from "./admins.js"
import { logEvent, MAX_EVENT_BODY, parseClientEvent, recordEvent } from "./events.js"
import { clientIp, json } from "./http.js"
import { createPlan, deletePlan, getPlan, isUuid, listPlans, PlanInputError, updatePlan } from "./plans.js"
import { consumeLimit } from "./rate-limit.js"

const MAX_BODY = 32 * 1024

export function handleHealth(): Response {
  return json({
    ok: true,
    accounts: accountsReady(),
    google: googleReady(),
    email: emailReady(),
  })
}

export function handleMagicLink(): Response {
  if (!devMagicLinkEnabled()) {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } })
  }
  const link = peekMagicLink()
  if (!link) return json({ email: null, url: null })
  return json(link)
}

export async function handlePlansCollection(request: Request): Promise<Response> {
  const user = await requireUser(request)
  if (!user) return json({ error: "Sign in required." }, 401)
  try {
    if (request.method === "GET") return json({ plans: await listPlans(user.id) })
    if (request.method === "POST") {
      const blocked = await mutationGuard(request, user.id)
      if (blocked) return blocked
      const plan = await createPlan(user.id, await readBody(request))
      await logEvent({ name: "plan_create", userId: user.id, planId: plan.id, props: { drills: plan.items.length, ...adminFlag(user) } })
      return json({ plan }, 201)
    }
    return json({ error: "Method not allowed." }, 405)
  } catch (error) {
    return planError(error)
  }
}

export async function handlePlanItem(request: Request): Promise<Response> {
  const user = await requireUser(request)
  if (!user) return json({ error: "Sign in required." }, 401)
  const id = planId(request)
  if (!id) return json({ error: "Plan not found." }, 404)
  try {
    if (request.method === "GET") {
      const plan = await getPlan(user.id, id)
      if (!plan) return json({ error: "Plan not found." }, 404)
      return json({ plan })
    }
    if (request.method === "PATCH" || request.method === "DELETE") {
      const blocked = await mutationGuard(request, user.id)
      if (blocked) return blocked
    }
    if (request.method === "PATCH") {
      const plan = await updatePlan(user.id, id, await readBody(request))
      if (!plan) return json({ error: "Plan not found." }, 404)
      await logEvent({ name: "plan_save", userId: user.id, planId: plan.id, props: { drills: plan.items.length, ...adminFlag(user) } })
      return json({ plan })
    }
    if (request.method === "DELETE") {
      const removed = await deletePlan(user.id, id)
      if (!removed) return json({ error: "Plan not found." }, 404)
      await logEvent({ name: "plan_delete", userId: user.id, planId: id, props: adminFlag(user) })
      return json({ ok: true })
    }
    return json({ error: "Method not allowed." }, 405)
  } catch (error) {
    return planError(error)
  }
}

export async function handleAccount(request: Request): Promise<Response> {
  if (request.method !== "DELETE") return json({ error: "Method not allowed." }, 405)
  const user = await requireUser(request)
  if (!user) return json({ error: "Sign in required." }, 401)
  if (!originAllowed(request)) return json({ error: "Could not complete that request." }, 403)
  try {
    const allowed = await consumeLimit("account-delete", user.id, 5, 60 * 60)
    if (!allowed) return json({ error: "Too many requests. Try again later." }, 429)
    const body = await readBody(request)
    const confirm = body && typeof body === "object" && !Array.isArray(body) ? (body as { confirm?: unknown }).confirm : ""
    if (confirm !== DELETE_CONFIRM) return json({ error: "Confirm the deletion and try again." }, 400)
    const removed = await deleteUserAccount(user.id)
    if (!removed) return json({ error: "Account not found." }, 404)
    return json({ ok: true })
  } catch (error) {
    return planError(error)
  }
}

// POST /api/event: write-only usage beacon. It never returns stored data.
export async function handleEvent(request: Request): Promise<Response> {
  if (request.method !== "POST") return empty(405, { allow: "POST" })
  if (!sameOriginBeacon(request)) return empty(403)
  const claimed = Number(request.headers.get("content-length") || 0)
  if (Number.isFinite(claimed) && claimed > MAX_EVENT_BODY) return empty(413)
  const text = await request.text()
  if (!text) return empty(400)
  if (text.length > MAX_EVENT_BODY) return empty(413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return empty(400)
  }
  const event = parseClientEvent(body)
  if (!event) return empty(400)
  try {
    const allowed = await consumeLimit("event", clientIp(request), 600, 60 * 60)
    if (!allowed) return empty(429)
    if (hasSessionCookie(request)) {
      const user = await requireUser(request)
      if (user) {
        event.userId = user.id
        if (isAdminEmail(user.email)) event.props = { ...event.props, admin: true }
      }
    }
    await recordEvent(event)
    return empty(204)
  } catch (error) {
    console.error("event endpoint failed", error instanceof Error ? error.message : error)
    return empty(503)
  }
}

export { handleAuth }

// Marks admin activity when it is logged, so it stays excluded even if the
// admin's account or email changes later.
function adminFlag(user: { email?: string }): { admin?: true } {
  return isAdminEmail(user.email) ? { admin: true } : {}
}

function empty(status: number, extra?: Record<string, string>): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store", ...extra } })
}

function sameOriginBeacon(request: Request): boolean {
  if (request.headers.get("origin")) return originAllowed(request)
  return request.headers.get("sec-fetch-site") === "same-origin"
}

function hasSessionCookie(request: Request): boolean {
  return /(?:^|;\s*)(?:__Host-)?hsd\.session-token=/.test(request.headers.get("cookie") || "")
}

async function requireUser(request: Request) {
  const user = await readSession(request)
  if (!user?.id || !isUuid(user.id)) return null
  return user
}

async function mutationGuard(request: Request, userId: string): Promise<Response | null> {
  if (!originAllowed(request)) return json({ error: "Could not complete that request." }, 403)
  try {
    const allowed = await consumeLimit("plan-write", userId, 60, 15 * 60)
    if (!allowed) return json({ error: "Too many plan updates. Try again later." }, 429)
    return null
  } catch (error) {
    console.error(error)
    return json({ error: "Could not reach the plans database." }, 500)
  }
}

function originAllowed(request: Request): boolean {
  const header = request.headers.get("origin")
  if (!header) return false
  try {
    return new URL(header).origin === resolvePublicUrl(request).origin
  } catch {
    return false
  }
}

async function readBody(request: Request): Promise<unknown> {
  const claimed = Number(request.headers.get("content-length") || 0)
  if (Number.isFinite(claimed) && claimed > MAX_BODY) throw new PlanInputError("That plan is too large.")
  const text = await request.text()
  if (text.length > MAX_BODY) throw new PlanInputError("That plan is too large.")
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new PlanInputError("Could not read that plan.")
  }
}

function planId(request: Request): string {
  const parts = routedUrl(request).pathname.split("/").filter(Boolean)
  const index = parts.lastIndexOf("plans")
  if (index === -1 || index + 1 >= parts.length) return ""
  return decodeURIComponent(parts[index + 1] || "")
}

function planError(error: unknown): Response {
  if (error instanceof PlanInputError) return json({ error: error.message }, 400)
  console.error(error)
  return json({ error: "Could not reach the plans database." }, 500)
}
