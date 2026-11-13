import { randomBytes } from "node:crypto"
import { getPool } from "./db.js"
import { isUuid } from "./plans.js"
import { scheduleUrl } from "./schedule.js"
import { getTeam, LineupInputError, toTeam, type Team } from "./lineups.js"

// Teams are private to their coaches. team_members is the only access list.
// role "owner" can delete the team and manage invites. "assistant" can edit
// the roster, lineups, and team plans.

export type TeamRole = "owner" | "assistant"

export interface CoachTeam extends Team {
  role: TeamRole
}

export interface TeamMember {
  userId: string
  name: string
  email: string
  role: TeamRole
}

export interface TeamInvite {
  id: string
  path: string
  singleUse: boolean
  expiresAt: string | null
  createdAt: string
}

const TEAM_RE = /^[a-z0-9-]{1,32}$/
const LABEL_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'/+-]{0,39}$/u
const SEASON_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'/+-]{0,19}$/u
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'/&+-]{0,59}$/u
const MAX_INVITES = 20

export async function listMemberTeams(userId: string): Promise<CoachTeam[]> {
  if (!isUuid(userId)) return []
  const result = await getPool().query(
    `SELECT t.id, t.name, t.schedule_url, t.age_group, t.season, m.role
     FROM teams t
     JOIN team_members m ON m.team_id = t.id
     WHERE m.user_id = $1
     ORDER BY t.sort, t.name`,
    [userId]
  )
  return result.rows.map((row) => ({ ...toTeam(row), role: row.role === "owner" ? "owner" : "assistant" }))
}

export async function teamRole(userId: string, teamId: string): Promise<TeamRole | null> {
  if (!isUuid(userId) || !TEAM_RE.test(teamId)) return null
  const result = await getPool().query(`SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2`, [userId, teamId])
  const role = result.rows[0]?.role
  return role === "owner" || role === "assistant" ? role : null
}

// Teams that existed before coaches were added have no members. The signed-in
// admin claims those, so a deploy right after the migration still shows them.
export async function claimLegacyTeams(userId: string): Promise<void> {
  if (!isUuid(userId)) return
  await getPool().query(
    `INSERT INTO team_members (team_id, user_id, role)
     SELECT t.id, $1::uuid, 'owner'
     FROM teams t
     WHERE NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id)
     ON CONFLICT DO NOTHING`,
    [userId]
  )
}

export async function createTeam(userId: string, input: unknown): Promise<CoachTeam> {
  if (!isUuid(userId)) throw new LineupInputError("Sign in to create a team.")
  const body = asObject(input)
  const name = cleanName(body.name)
  const ageGroup = cleanLabel(body.ageGroup, "Add an age group or level, like U11.")
  const season = cleanSeason(body.season)
  const schedule = cleanSchedule(body.scheduleUrl, true)
  const id = await uniqueTeamId(name)
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `INSERT INTO teams (id, name, schedule_url, sort, age_group, season)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort), 0) + 1 FROM teams), $4, $5)`,
      [id, name, schedule, ageGroup, season]
    )
    await client.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, userId])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
  const team = await getTeam(id)
  if (!team) throw new LineupInputError("Could not create that team.")
  return { ...team, role: "owner" }
}

export async function updateTeam(teamId: string, input: unknown): Promise<Team | null> {
  if (!TEAM_RE.test(teamId)) return null
  const current = await getTeam(teamId)
  if (!current) return null
  const body = asObject(input)
  const name = Object.prototype.hasOwnProperty.call(body, "name") ? cleanName(body.name) : current.name
  const ageGroup = Object.prototype.hasOwnProperty.call(body, "ageGroup") ? cleanLabel(body.ageGroup, "Add an age group or level, like U11.", true) : current.ageGroup
  const season = Object.prototype.hasOwnProperty.call(body, "season") ? cleanSeason(body.season, true) : current.season
  const schedule = Object.prototype.hasOwnProperty.call(body, "scheduleUrl") ? cleanSchedule(body.scheduleUrl, true) : undefined
  await getPool().query(
    `UPDATE teams
     SET name = $2, age_group = $3, season = $4, schedule_url = CASE WHEN $6::boolean THEN $5 ELSE schedule_url END
     WHERE id = $1`,
    [teamId, name, ageGroup, season, schedule ?? null, schedule !== undefined]
  )
  return getTeam(teamId)
}

export async function deleteTeam(teamId: string): Promise<boolean> {
  if (!TEAM_RE.test(teamId)) return false
  const result = await getPool().query(`DELETE FROM teams WHERE id = $1`, [teamId])
  return (result.rowCount ?? 0) > 0
}

export async function listMembers(teamId: string): Promise<TeamMember[]> {
  if (!TEAM_RE.test(teamId)) return []
  const result = await getPool().query(
    `SELECT u.id, u.name, u.email, m.role
     FROM team_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1
     ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.email`,
    [teamId]
  )
  return result.rows.map((row) => ({
    userId: String(row.id),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    role: row.role === "owner" ? "owner" : "assistant",
  }))
}

export async function removeMember(teamId: string, memberId: string): Promise<boolean> {
  if (!TEAM_RE.test(teamId) || !isUuid(memberId)) return false
  const result = await getPool().query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 AND role = 'assistant'`,
    [teamId, memberId]
  )
  return (result.rowCount ?? 0) > 0
}

export async function createInvite(teamId: string, userId: string, input: unknown): Promise<TeamInvite> {
  const body = asObject(input)
  const singleUse = body.singleUse !== false
  const expiresAt = cleanExpiry(body.expiresInHours, body.expiresAt)
  if (!singleUse && !expiresAt) throw new LineupInputError("Make the link single-use or give it an expiry.")
  const open = await getPool().query(
    `SELECT count(*)::int AS n FROM team_invites
     WHERE team_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
       AND (NOT single_use OR accepted_at IS NULL)`,
    [teamId]
  )
  if (Number(open.rows[0]?.n || 0) >= MAX_INVITES) throw new LineupInputError("Too many open invite links. Revoke one first.")
  const token = randomBytes(24).toString("base64url")
  const result = await getPool().query(
    `INSERT INTO team_invites (team_id, token, created_by, single_use, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, token, single_use, expires_at, created_at`,
    [teamId, token, userId, singleUse, expiresAt]
  )
  return toInvite(result.rows[0])
}

export async function listInvites(teamId: string): Promise<TeamInvite[]> {
  if (!TEAM_RE.test(teamId)) return []
  const result = await getPool().query(
    `SELECT id, token, single_use, expires_at, created_at
     FROM team_invites
     WHERE team_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
       AND (NOT single_use OR accepted_at IS NULL)
     ORDER BY created_at DESC`,
    [teamId]
  )
  return result.rows.map(toInvite)
}

export async function revokeInvite(teamId: string, inviteId: string): Promise<boolean> {
  if (!TEAM_RE.test(teamId) || !isUuid(inviteId)) return false
  const result = await getPool().query(
    `UPDATE team_invites SET revoked_at = now() WHERE id = $1 AND team_id = $2 AND revoked_at IS NULL`,
    [inviteId, teamId]
  )
  return (result.rowCount ?? 0) > 0
}

export interface InvitePreview {
  teamId: string
  teamName: string
}

// Valid invite, or null when it is missing, revoked, expired, or already used.
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const row = await loadInvite(token)
  return row ? { teamId: String(row.team_id), teamName: String(row.team_name) } : null
}

// Joins as an assistant. Already-on-the-team coaches get the team id and the
// link stays usable for the next person when it is not single-use.
export async function acceptInvite(userId: string, token: string): Promise<{ teamId: string; joined: boolean } | null> {
  if (!isUuid(userId)) return null
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const found = await client.query(
      `SELECT i.id, i.team_id, i.single_use, i.expires_at, i.revoked_at, i.accepted_at
       FROM team_invites i
       WHERE i.token = $1
       FOR UPDATE`,
      [token]
    )
    const row = found.rows[0]
    if (!row || !inviteOpen(row)) {
      await client.query("ROLLBACK")
      return null
    }
    const teamId = String(row.team_id)
    const existing = await client.query(`SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId])
    if (existing.rowCount) {
      await client.query("COMMIT")
      return { teamId, joined: false }
    }
    await client.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'assistant')`, [teamId, userId])
    if (row.single_use) {
      await client.query(`UPDATE team_invites SET accepted_at = now(), accepted_by = $2 WHERE id = $1`, [row.id, userId])
    }
    await client.query("COMMIT")
    return { teamId, joined: true }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function loadInvite(token: string): Promise<Record<string, unknown> | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null
  const result = await getPool().query(
    `SELECT i.team_id, i.single_use, i.expires_at, i.revoked_at, i.accepted_at, t.name AS team_name
     FROM team_invites i
     JOIN teams t ON t.id = i.team_id
     WHERE i.token = $1`,
    [token]
  )
  const row = result.rows[0]
  if (!row || !inviteOpen(row)) return null
  return row
}

function inviteOpen(row: Record<string, unknown>): boolean {
  if (row.revoked_at) return false
  if (row.expires_at && new Date(String(row.expires_at)).getTime() <= Date.now()) return false
  if (row.single_use && row.accepted_at) return false
  return true
}

function toInvite(row: Record<string, unknown>): TeamInvite {
  const token = String(row.token)
  return {
    id: String(row.id),
    path: `/lineups/join/${token}`,
    singleUse: Boolean(row.single_use),
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    createdAt: toIso(row.created_at),
  }
}

async function uniqueTeamId(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "team"
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const id = `${base}-${randomBytes(3).toString("hex")}`.slice(0, 32).replace(/-+$/g, "")
    if (!TEAM_RE.test(id)) continue
    const taken = await getPool().query(`SELECT 1 FROM teams WHERE id = $1`, [id])
    if (!taken.rowCount) return id
  }
  throw new LineupInputError("Could not create that team. Try again.")
}

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
  if (!NAME_RE.test(name)) throw new LineupInputError("Give the team a name (up to 60 characters).")
  return name
}

function cleanLabel(value: unknown, message: string, allowEmpty = false): string {
  const label = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
  if (!label && allowEmpty) return ""
  if (!LABEL_RE.test(label)) throw new LineupInputError(message)
  return label
}

function cleanSeason(value: unknown, allowEmpty = false): string {
  const season = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
  if (!season && allowEmpty) return ""
  if (!SEASON_RE.test(season)) throw new LineupInputError("Add a season, like 2026-27.")
  return season
}

function cleanSchedule(value: unknown, allowEmpty: boolean): string | null {
  if (value === undefined || value === null || value === "") return allowEmpty ? null : null
  if (typeof value !== "string") throw new LineupInputError("The schedule link needs to be an https address.")
  const url = scheduleUrl(value.trim())
  if (!url || url.length > 500) throw new LineupInputError("Paste an https schedule link (webcal links are fine too).")
  return url
}

function cleanExpiry(hoursValue: unknown, atValue: unknown): string | null {
  if (atValue !== undefined && atValue !== null && atValue !== "") {
    if (typeof atValue !== "string") throw new LineupInputError("That expiry date could not be read.")
    const time = Date.parse(atValue)
    if (!Number.isFinite(time)) throw new LineupInputError("That expiry date could not be read.")
    const max = Date.now() + 366 * 24 * 60 * 60 * 1000
    if (time <= Date.now() || time > max) throw new LineupInputError("Expiry needs to be within the next year.")
    return new Date(time).toISOString()
  }
  if (hoursValue === undefined || hoursValue === null || hoursValue === "") return null
  const hours = typeof hoursValue === "number" ? hoursValue : Number(hoursValue)
  if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 90) {
    throw new LineupInputError("Expiry needs to be between 1 hour and 90 days.")
  }
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LineupInputError("Could not read that request.")
  return value as Record<string, unknown>
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}
