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
  getTeam,
  listTeams,
  isShareToken,
  LineupInputError,
  listLineups,
  listPlayers,
  removePlayer,
  updateLineup,
} from "./lineups.js"
import { renderEditor, renderList, renderMessage, renderRoster, renderShared, renderRosters, renderTeams } from "./lineup-pages.js"
import { consumeLimit } from "./rate-limit.js"
import { upcomingGames } from "./schedule.js"
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
  | "teams"
  | "list"
  | "edit"
  | "rosters"
  | "roster"
  | "view"
  | "api-collection"
  | "api-item"
  | "api-share"
  | "api-roster"
  | "api-player"
  | "api-view"

const ROUTES = new Set<Route>([
  "teams",
  "list",
  "edit",
  "rosters",
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
  const teamParam = url.searchParams.get("__team")
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
    // Old single-team addresses (/lineups/<id>/, /lineups/roster/, /lineups/new/) redirect to the Stars team.
    if (teamParam === null && (route === "list" || route === "edit" || route === "roster")) {
      if (write) return notFound()
      if (route === "edit" && id !== "new" && !ID_RE.test(id)) return notFound()
      const suffix = route === "list" ? "" : route === "roster" ? "roster/" : `${id}/`
      if (route === "edit" && id !== "new") {
        const old = await getLineup(id)
        if (!old) return notFound()
        return redirect(`/lineups/team/${old.teamId}/${id}/`)
      }
      return redirect(`/lineups/team/stars/${suffix}`)
    }
    if (route === "rosters") {
      if (write) return notFound()
      const teams = await listTeams()
      const counts = await Promise.all(teams.map((t) => listPlayers(t.id).then((p) => p.length)))
      return html(renderRosters(teams.map((t, i) => ({ team: t, count: counts[i] })), admin))
    }
    if (route === "teams") {
      if (write) return notFound()
      return html(renderTeams(await listTeams(), admin))
    }
    // API calls without a team (older pages) act on the Stars team.
    const team = await getTeam(teamParam ?? "stars")
    if (!team) return notFound()
    switch (route) {
      case "list":
        if (write) return notFound()
        return html(renderList(team, await listLineups(team.id), admin))
      case "roster":
        if (write) return notFound()
        return html(renderRoster(team, await listPlayers(team.id), admin))
      case "edit": {
        if (write) return notFound()
        const players = await listPlayers(team.id, true)
        if (id === "new") return html(renderEditor(team, null, players, admin, await upcomingGames(team.scheduleUrl)))
        if (!ID_RE.test(id)) return notFound()
        const lineup = await getLineup(id)
        if (!lineup || lineup.teamId !== team.id) return notFound()
        return html(renderEditor(team, lineup, players, admin))
      }
      case "api-collection":
        if (method === "GET") return json({ lineups: await listLineups(team.id) })
        if (method === "POST") return json({ lineup: await createLineup(team.id, await readBody(request)) }, 201)
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
        if (method === "GET") return json({ players: await listPlayers(team.id) })
        if (method === "POST") return json({ player: await addPlayer(team.id, await readBody(request)) }, 201)
        return json({ error: "Method not allowed." }, 405)
      case "api-player":
        if (method === "DELETE") {
          return (await removePlayer(team.id, id)) ? json({ ok: true }) : json({ error: "Player not found." }, 404)
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

function redirect(location: string): Response {
  return new Response(null, { status: 308, headers: { location, "cache-control": "private, no-store", "referrer-policy": "no-referrer" } })
}

function html(body: string, status = 200, head = false): Response {
  return new Response(head ? null : body, { status, headers: privateHeaders() })
}
