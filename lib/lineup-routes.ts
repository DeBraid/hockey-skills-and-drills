import { isAdmin, notFound } from "./admin.js"
import { isAdminEmail } from "./admins.js"
import { readSession, type AccountUser } from "./auth.js"
import { logEvent } from "./events.js"
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
  isShareToken,
  LineupInputError,
  listLineups,
  listPlayers,
  removePlayer,
  updateLineup,
  setPreferred,
  type Lineup,
  type Team,
} from "./lineups.js"
import { listTeamPlans } from "./plans.js"
import { renderEditor, renderList, renderMessage, renderRoster, renderShared, renderRosters, renderTeams, renderJoin } from "./lineup-pages.js"
import { consumeLimit } from "./rate-limit.js"
import { upcomingGames } from "./schedule.js"
import {
  acceptInvite,
  claimLegacyTeams,
  createInvite,
  createTeam,
  deleteTeam,
  listInvites,
  listMemberTeams,
  listMembers,
  previewInvite,
  removeMember,
  revokeInvite,
  teamRole,
  updateTeam,
  type TeamRole,
} from "./teams.js"
import { originAllowed } from "./routes.js"

// Lineups, rosters, and team APIs are private to that team's coaches.
// Anyone else, signed in or not, gets a plain 404. The read-only share link
// (/lineups/v/<token>) is the only public page. ADMIN_EMAILS is not a bypass.

const MAX_BODY = 16 * 1024
const ID_RE = /^[0-9a-f-]{36}$/i

type Route =
  | "teams"
  | "list"
  | "edit"
  | "rosters"
  | "roster"
  | "view"
  | "join"
  | "api-collection"
  | "api-item"
  | "api-share"
  | "api-roster"
  | "api-player"
  | "api-view"
  | "api-my-teams"
  | "api-team"
  | "api-members"
  | "api-member"
  | "api-invites"
  | "api-invite"
  | "api-join"

const ROUTES = new Set<Route>([
  "teams",
  "list",
  "edit",
  "rosters",
  "roster",
  "view",
  "join",
  "api-collection",
  "api-item",
  "api-share",
  "api-roster",
  "api-player",
  "api-view",
  "api-my-teams",
  "api-team",
  "api-members",
  "api-member",
  "api-invites",
  "api-invite",
  "api-join",
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
    if (!user?.id) {
      if (route === "join") return await joinPage(request, token, null)
      return notFound()
    }
    if (isAdmin(user)) await claimLegacyTeams(user.id)
    const method = request.method
    const write = method !== "GET" && method !== "HEAD"
    if (route === "join" || route === "api-join") return await joinRoute(request, route, token, user, write)
    if (route === "api-my-teams") return await myTeams(request, user, write)
    if (write) {
      const blocked = await writeGuard(request, user.id)
      if (blocked) return blocked
    }
    if (teamParam === null && (route === "list" || route === "edit" || route === "roster")) {
      return await legacyRedirect(route, id, user.id, write)
    }
    if (route === "rosters" || route === "teams") {
      if (write) return notFound()
      const teams = await listMemberTeams(user.id)
      if (route === "rosters") {
        const counts = await Promise.all(teams.map((team) => listPlayers(team.id).then((players) => players.length)))
        return html(renderRosters(teams.map((team, index) => ({ team, count: counts[index] })), user))
      }
      return html(renderTeams(teams, user))
    }
    if (route === "api-item" || route === "api-share") return await lineupItem(request, route, id, teamParam, user, method)
    const teamId = teamParam ?? "stars"
    const access = await requireMember(user.id, teamId)
    if (access instanceof Response) return access
    const { team, role } = access
    switch (route) {
      case "list":
        if (write) return notFound()
        return html(await teamHome(team, role, user))
      case "roster":
        if (write) return notFound()
        return html(renderRoster(team, await listPlayers(team.id), user, await listMemberTeams(user.id)))
      case "edit": {
        if (write) return notFound()
        const players = await listPlayers(team.id, true)
        const teams = await listMemberTeams(user.id)
        if (id === "new") return html(renderEditor(team, null, players, user, await upcomingGames(team.scheduleUrl), teams))
        if (!ID_RE.test(id)) return notFound()
        const lineup = await getLineup(id)
        if (!lineup || lineup.teamId !== team.id) return notFound()
        return html(renderEditor(team, lineup, players, user, [], teams))
      }
      case "api-collection":
        if (method === "GET") return json({ lineups: await listLineups(team.id) })
        if (method === "POST") return json({ lineup: await createLineup(team.id, await readBody(request)) }, 201)
        return json({ error: "Method not allowed." }, 405)
      case "api-roster":
        if (method === "GET") return json({ players: await listPlayers(team.id) })
        if (method === "POST") return json({ player: await addPlayer(team.id, await readBody(request)) }, 201)
        return json({ error: "Method not allowed." }, 405)
      case "api-player":
        if (method === "PATCH") {
          return (await setPreferred(team.id, id, await readBody(request))) ? json({ ok: true }) : json({ error: "Player not found." }, 404)
        }
        if (method === "DELETE") {
          return (await removePlayer(team.id, id)) ? json({ ok: true }) : json({ error: "Player not found." }, 404)
        }
        return json({ error: "Method not allowed." }, 405)
      case "api-team":
        if (method === "PATCH") {
          const updated = await updateTeam(team.id, await readBody(request))
          return updated ? json({ team: { ...updated, role } }) : notFound()
        }
        if (method === "DELETE") {
          if (role !== "owner") return notFound()
          return (await deleteTeam(team.id)) ? json({ ok: true }) : notFound()
        }
        if (method === "GET") return json({ team: { ...team, role } })
        return json({ error: "Method not allowed." }, 405)
      case "api-members":
        if (method !== "GET") return json({ error: "Method not allowed." }, 405)
        return json({ members: await listMembers(team.id) })
      case "api-member":
        if (method !== "DELETE" || role !== "owner") return notFound()
        return (await removeMember(team.id, id)) ? json({ ok: true }) : json({ error: "Coach not found." }, 404)
      case "api-invites":
        if (role !== "owner") return notFound()
        if (method === "GET") return json({ invites: await listInvites(team.id) })
        if (method === "POST") return json({ invite: await createInvite(team.id, user.id, await readBody(request)) }, 201)
        return json({ error: "Method not allowed." }, 405)
      case "api-invite":
        if (role !== "owner" || method !== "DELETE") return notFound()
        return (await revokeInvite(team.id, id)) ? json({ ok: true }) : json({ error: "Invite not found." }, 404)
      default:
        return notFound()
    }
  } catch (error) {
    if (error instanceof LineupInputError) return json({ error: error.message }, 400)
    console.error("lineups failed", error instanceof Error ? error.message : error)
    if (route.startsWith("api-")) return json({ error: "Could not reach the lineups database." }, 500)
    return html(renderMessage("Could not load lineups. Try again in a minute."), 500)
  }
}

async function myTeams(request: Request, user: AccountUser, write: boolean): Promise<Response> {
  if (request.method === "GET" || request.method === "HEAD") {
    const teams = await listMemberTeams(user.id)
    return json({ teams: teams.map((team) => ({ id: team.id, name: team.name, ageGroup: team.ageGroup, season: team.season, role: team.role })) })
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405)
  const blocked = await writeGuard(request, user.id)
  if (blocked) return blocked
  const team = await createTeam(user.id, await readBody(request))
  await logEvent({ name: "team_created", userId: user.id, props: adminProps(user) })
  return json({ team }, 201)
}

async function teamHome(team: Team, role: TeamRole, user: AccountUser): Promise<string> {
  const [lineups, players, teams, plans, members] = await Promise.all([
    listLineups(team.id),
    listPlayers(team.id, true),
    listMemberTeams(user.id),
    listTeamPlans(user.id, team.id),
    listMembers(team.id),
  ])
  const invites = role === "owner" ? await listInvites(team.id) : []
  return renderList(team, lineups, user, players, { teams, role, plans, members, invites })
}

async function lineupItem(
  request: Request,
  route: "api-item" | "api-share",
  id: string,
  teamParam: string | null,
  user: AccountUser,
  method: string
): Promise<Response> {
  if (!ID_RE.test(id)) return notFound()
  const lineup = await getLineup(id)
  if (!lineup) return notFound()
  if (teamParam && teamParam !== lineup.teamId) return notFound()
  const role = await teamRole(user.id, lineup.teamId)
  if (!role) return notFound()
  if (route === "api-share") return shareItem(request, lineup, method)
  if (method === "GET") return json({ lineup })
  if (method === "PATCH") {
    const updated = await updateLineup(id, await readBody(request))
    return updated ? json({ lineup: updated }) : notFound()
  }
  if (method === "DELETE") return (await deleteLineup(id)) ? json({ ok: true }) : notFound()
  return json({ error: "Method not allowed." }, 405)
}

async function shareItem(request: Request, lineup: Lineup, method: string): Promise<Response> {
  if (method === "POST") {
    const body = (await readBody(request)) as { regenerate?: unknown }
    const shareToken = await ensureShareToken(lineup.id, body?.regenerate === true)
    return shareToken ? json({ shareToken }) : notFound()
  }
  if (method === "DELETE") return (await clearShareToken(lineup.id)) ? json({ ok: true }) : notFound()
  return json({ error: "Method not allowed." }, 405)
}

async function legacyRedirect(route: "list" | "edit" | "roster", id: string, userId: string, write: boolean): Promise<Response> {
  if (write) return notFound()
  if (route === "edit" && id !== "new") {
    if (!ID_RE.test(id)) return notFound()
    const lineup = await getLineup(id)
    if (!lineup) return notFound()
    if (!(await teamRole(userId, lineup.teamId))) return notFound()
    return redirect(`/lineups/team/${lineup.teamId}/${id}/`)
  }
  const teams = await listMemberTeams(userId)
  const target = teams.find((team) => team.id === "stars") || teams[0]
  if (!target) return redirect("/lineups/")
  if (route === "edit") return redirect(`/lineups/team/${target.id}/new/`)
  if (route === "roster") return redirect(`/lineups/team/${target.id}/roster/`)
  return redirect(`/lineups/team/${target.id}/`)
}

async function joinPage(request: Request, token: string, user: AccountUser | null): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return notFound()
  const invite = await previewInvite(token)
  if (!invite) return notFound()
  return html(renderJoin(invite, user, token), 200, request.method === "HEAD")
}

async function joinRoute(request: Request, route: "join" | "api-join", token: string, user: AccountUser, write: boolean): Promise<Response> {
  if (!write) return joinPage(request, token, user)
  const blocked = await writeGuard(request, user.id)
  if (blocked) return blocked
  const joined = await acceptInvite(user.id, token)
  if (!joined) return notFound()
  if (joined.joined) await logEvent({ name: "invite_accepted", userId: user.id, props: adminProps(user) })
  if (route === "api-join") return json({ teamId: joined.teamId, joined: joined.joined })
  return redirect(`/lineups/team/${joined.teamId}/`, 303)
}

async function requireMember(userId: string, teamId: string): Promise<{ team: Team; role: TeamRole } | Response> {
  const team = await getTeam(teamId)
  if (!team) return notFound()
  const role = await teamRole(userId, team.id)
  if (!role) return notFound()
  return { team, role }
}

function adminProps(user: AccountUser): { admin?: true } {
  return isAdminEmail(user.email) ? { admin: true } : {}
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
    for (const [key, value] of Object.entries(privateHeaders())) if (key !== "content-type") response.headers.set(key, value)
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

function redirect(location: string, status = 308): Response {
  return new Response(null, { status, headers: { location, "cache-control": "private, no-store", "referrer-policy": "no-referrer" } })
}

function html(body: string, status = 200, head = false): Response {
  return new Response(head ? null : body, { status, headers: privateHeaders() })
}
