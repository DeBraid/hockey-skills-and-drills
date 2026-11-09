// Upcoming games for the lineup name prefill (admin-only editor).
// Source: each team's public MBSportsWeb / OMHA Digital Network iCal feed.
// The teams table stores the link. LINEUPS_SCHEDULE_ICS_URL is only the legacy
// fallback when a caller does not pass a team URL (it does not retarget Select).
// The feed itself only refreshes hourly, so results are cached for an hour per instance.

const DEFAULT_ICS_URL = "https://westniagaraminorhockey.ca/webcal.ashx?IDs=2945" // U11 Stars, West Niagara Minor Hockey
const TIME_ZONE = "America/Toronto"
const CACHE_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 4000
const MAX_TITLE = 80

// Public feeds used when teams.schedule_url is still empty.
// Select: current-season team page https://westniagaraminorhockey.ca/Teams/2897/
// (2025-26 team 2567 is not the current season and has no upcoming games.)
export const TEAM_SCHEDULE_FEEDS: Readonly<Record<string, string>> = {
  select: "https://westniagaraminorhockey.ca/webcal.ashx?IDs=2897",
}

export interface Game {
  start: string // ISO
  label: string // e.g. "Fri Oct 23 6:15 PM vs Mustangs, Fleming Memorial Arena"
}

const caches = new Map<string, { at: number; events: Game[] }>()

// https calendar link, or null. undefined uses the legacy Stars/env fallback.
// A passed null or "" means "no link" and does not fall back to Stars.
export function scheduleUrl(teamUrl?: string | null): string | null {
  const raw = (teamUrl === undefined ? process.env.LINEUPS_SCHEDULE_ICS_URL || DEFAULT_ICS_URL : teamUrl || "")
    .trim()
    .replace(/^webcal:\/\//i, "https://")
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

export function resolveTeamScheduleUrl(teamId: string, stored: string | null | undefined): string | null {
  const explicit = (stored ?? "").trim()
  if (explicit) return scheduleUrl(explicit)
  const known = TEAM_SCHEDULE_FEEDS[teamId]
  return known ? scheduleUrl(known) : null
}

export function clearScheduleCache(): void {
  caches.clear()
}

// Never throws: any failure returns [] so the name is simply left blank.
export async function upcomingGames(teamUrl?: string | null, limit = 6, now = Date.now()): Promise<Game[]> {
  try {
    const url = scheduleUrl(teamUrl)
    if (!url) return []
    let cache = caches.get(url)
    if (!cache || now - cache.at > CACHE_MS) {
      const response = await fetch(url, {
        headers: { accept: "text/calendar", "user-agent": "hockey.derekbraid.com lineups" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`schedule feed ${response.status}`)
      const text = await response.text()
      cache = { at: now, events: parseGames(text.slice(0, 2_000_000)) }
      caches.set(url, cache)
    }
    const cutoff = now - 60 * 60 * 1000 // keep a game that started in the last hour
    return cache.events.filter((g) => Date.parse(g.start) >= cutoff).slice(0, limit)
  } catch (error) {
    console.error("schedule fetch failed", error instanceof Error ? error.message : error)
    return []
  }
}

export function parseGames(ics: string): Game[] {
  const unfolded = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "")
  const games: Game[] = []
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0] || ""
    const field = (name: string) => {
      const match = body.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, "m"))
      return match ? unescapeText(match[1].trim()) : ""
    }
    const summary = field("SUMMARY")
    if (/cancel|postpon/i.test(summary) || /CANCELLED/i.test(field("STATUS"))) continue
    // "Local - U11 - Stars - Game vs Local - U11 - Mustangs [U11-R9]"
    const game = summary.match(/ - Game (vs|@) (.+?)(?:\s*\[[^\]]*\])?$/)
    if (!game) continue
    const start = parseDate(field("DTSTART"))
    if (!start) continue
    const opponent = cleanOpponent((game[2].split(" - ").pop() || game[2]).replace(/\s+/g, " ").trim())
    if (!opponent) continue
    const location = field("LOCATION")
    const label = `${formatWhen(start)} ${game[1]} ${opponent}${location ? `, ${location}` : ""}`.slice(0, MAX_TITLE)
    games.push({ start: start.toISOString(), label })
  }
  return games.sort((a, b) => a.start.localeCompare(b.start))
}

function parseDate(value: string): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  // Floating local time: treat as Toronto time.
  const guess = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  const offset = torontoOffsetMinutes(guess)
  return new Date(guess.getTime() - offset * 60_000)
}

function torontoOffsetMinutes(date: Date): number {
  const local = new Date(date.toLocaleString("en-US", { timeZone: TIME_ZONE }))
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }))
  return Math.round((local.getTime() - utc.getTime()) / 60_000)
}

function formatWhen(date: Date): string {
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleString("en-US", { timeZone: TIME_ZONE, ...options })
  return `${part({ weekday: "short" })} ${part({ month: "short" })} ${part({ day: "numeric" })} ${part({ hour: "numeric", minute: "2-digit" })}`
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1")
}

// House-league names keep the division code and score ("Mustangs [U11-R9](W 3-6)").
// Select names have no code; drop a trailing result so the lineup reads "vs Waterloo".
function cleanOpponent(opponent: string): string {
  if (opponent.includes("[")) return opponent
  return opponent.replace(/\s*\([WLT][^)]*\)\s*$/i, "").trim()
}
