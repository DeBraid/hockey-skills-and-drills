import { isAdmin, notFound } from "./admin.js"
import { readSession, type AccountUser } from "./auth.js"
import { clientIp, json } from "./http.js"
import {
  addPlayer,
  clearShareToken,
  createLineup,
  deleteLineup,
  ensureShareToken,
  getLineup,
  getSharedLineup,
  isShareToken,
  LineupInputError,
  listLineups,
  listPlayers,
  removePlayer,
  updateLineup,
} from "./lineups.js"
import { renderEditor, renderList, renderMessage, renderRoster, renderShared } from "./lineup-pages.js"
import { consumeLimit } from "./rate-limit.js"
import { originAllowed } from "./routes.js"

// Single serverless function for every lineup page and API (vercel.json rewrites
// pass the route in __lu). Everything requires an ADMIN_EMAILS session and
// answers a plain 404 otherwise, except the read-only share link
// (/lineups/v/<token>), which shows one lineup to anyone holding the token.
//
// To add view-only coaches later, add a VIEWER_EMAILS allowlist and let
// canView() accept it for the GET routes. Writes stay on isAdmin().

const MAX_BODY = 16 * 1024
const ID_RE = /^[0-9a-f-]{36}$/i

type Route =
  | "list"
  | "edit"
  | "roster"
  | "view"
  | "api-collection"
  | "api-item"
  | "api-share"
  | "api-roster"
  | "api-player"
  | "api-view"

const ROUTES = new Set<Route>([
  "list",
  "edit",
  "roster",
  "view",
  "api-collection",
  "api-item",
  "api-share",
  "api-roster",
  "api-player",
  "api-view",
])

export async function handleLineups(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const raw = url.searchParams.get("__lu") || "api-collection"
  if (!ROUTES.has(raw as Route)) return notFound()
  const route = raw as Route
  const id = url.searchParams.get("__id") || ""
  const token = url.searchParams.get("__t") || ""
  try {
    if (route === "view" || route === "api-view") return await sharedView(request, route, token)
    const user = await readSession(request)
    if (!canView(user)) return notFound()
    const admin = user as AccountUser
    const method = request.method
    const write = method !== "GET" && method !== "HEAD"
    if (write) {
      if (!isAdmin(user)) return notFound()
      const blocked = await writeGuard(request, admin.id)
      if (blocked) return blocked
    }
    switch (route) {
      case "list":
        if (write) return notFound()
        return html(renderList(await listLineups(), admin))
      case "roster":
        if (write) return notFound()
        return html(renderRoster(await listPlayers(), admin))
      case "edit": {
        if (write) return notFound()
        const players = await listPlayers(true)
        if (id === "new") return html(renderEditor(null, players, admin))
        if (!ID_RE.test(id)) return notFound()
        const lineup = await getLineup(id)
        if (!lineup) return notFound()
        return html(renderEditor(lineup, players, admin))
      }
      case "api-collection":
        if (method === "GET") return json({ lineups: await listLineups() })
        if (method === "POST") return json({ lineup: await createLineup(await readBody(request)) }, 201)
        return json({ error: "Method not allowed." }, 405)
      case "api-item": {
        if (method === "GET") {
          const lineup = await getLineup(id)
          return lineup ? json({ lineup }) : json({ error: "Lineup not found." }, 404)
        }
        if (method === "PATCH") {
          const lineup = await updateLineup(id, await readBody(request))
          return lineup ? json({ lineup }) : json({ error: "Lineup not found." }, 404)
        }
        if (method === "DELETE") {
          return (await deleteLineup(id)) ? json({ ok: true }) : json({ error: "Lineup not found." }, 404)
        }
        return json({ error: "Method not allowed." }, 405)
      }
      case "api-share": {
        if (method === "POST") {
          const body = (await readBody(request)) as { regenerate?: unknown }
          const shareToken = await ensureShareToken(id, body?.regenerate === true)
          return shareToken ? json({ shareToken }) : json({ error: "Lineup not found." }, 404)
        }
        if (method === "DELETE") {
          return (await clearShareToken(id)) ? json({ ok: true }) : json({ error: "Lineup not found." }, 404)
        }
        return json({ error: "Method not allowed." }, 405)
      }
      case "api-roster":
        if (method === "GET") return json({ players: await listPlayers() })
        if (method === "POST") return json({ player: await addPlayer(await readBody(request)) }, 201)
        return json({ error: "Method not allowed." }, 405)
      case "api-player":
        if (method === "DELETE") {
          return (await removePlayer(id)) ? json({ ok: true }) : json({ error: "Player not found." }, 404)
        }
        return json({ error: "Method not allowed." }, 405)
    }
    return notFound()
  } catch (error) {
    if (error instanceof LineupInputError) return json({ error: error.message }, 400)
    console.error("lineups failed", error instanceof Error ? error.message : error)
    if (route.startsWith("api-")) return json({ error: "Could not reach the lineups database." }, 500)
    return html(renderMessage("Could not load lineups. Try again in a minute."), 500)
  }
}

function canView(user: AccountUser | null): boolean {
  return isAdmin(user)
}

async function sharedView(request: Request, route: Route, token: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return notFound()
  if (!isShareToken(token)) return notFound()
  const allowed = await consumeLimit("lineup-view", clientIp(request), 300, 60 * 60)
  if (!allowed) return new Response("Too many requests", { status: 429, headers: privateHeaders("text/plain; charset=utf-8") })
  const lineup = await getSharedLineup(token)
  if (!lineup) return notFound()
  if (route === "api-view") {
    const response = json({ lineup })
    for (const [k, v] of Object.entries(privateHeaders())) if (k !== "content-type") response.headers.set(k, v)
    return response
  }
  return html(renderShared(lineup), 200, request.method === "HEAD")
}

async function writeGuard(request: Request, userId: string): Promise<Response | null> {
  if (!originAllowed(request)) return json({ error: "Could not complete that request." }, 403)
  const allowed = await consumeLimit("lineup-write", userId, 200, 15 * 60)
  if (!allowed) return json({ error: "Too many updates. Try again later." }, 429)
  return null
}

async function readBody(request: Request): Promise<unknown> {
  const claimed = Number(request.headers.get("content-length") || 0)
  if (Number.isFinite(claimed) && claimed > MAX_BODY) throw new LineupInputError("That request is too large.")
  const text = await request.text()
  if (text.length > MAX_BODY) throw new LineupInputError("That request is too large.")
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new LineupInputError("Could not read that request.")
  }
}

function privateHeaders(type = "text/html; charset=utf-8"): Record<string, string> {
  return {
    "content-type": type,
    "cache-control": "private, no-store",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
  }
}

function html(body: string, status = 200, head = false): Response {
  return new Response(head ? null : body, { status, headers: privateHeaders() })
}
