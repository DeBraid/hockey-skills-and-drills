import { readSession, type AccountUser } from "./auth.js"
import { getPool } from "./db.js"

// Private usage dashboard at /admin. Only emails listed in the ADMIN_EMAILS
// environment variable (comma-separated) can open it. Everyone else, signed
// in or not, gets a plain 404 so the page does not reveal that it exists.

const TIME_ZONE = "America/Toronto"
const VERCEL_ANALYTICS_URL = "https://vercel.com/debraids-projects/hockey-skills-and-drills/analytics"

export function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || ""
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.includes("@"))
  )
}

export function isAdmin(user: AccountUser | null): boolean {
  if (!user?.email) return false
  const allowed = adminEmails()
  return allowed.size > 0 && allowed.has(user.email.trim().toLowerCase())
}

export function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  })
}

export async function handleAdmin(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return notFound()
  const user = await readSession(request)
  if (!isAdmin(user)) return notFound()
  let html: string
  try {
    html = renderDashboard(await loadStats(), user as AccountUser)
  } catch (error) {
    console.error("admin dashboard failed", error instanceof Error ? error.message : error)
    html = page("<p>Could not load the stats. Try again in a minute.</p>")
  }
  return new Response(request.method === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  })
}

type Row = Record<string, unknown>

export interface Stats {
  totals: Row[]
  daily: Row[]
  drills: Row[]
  users: Row[]
  meta: Row
}

export async function loadStats(): Promise<Stats> {
  const pool = getPool()
  // Every query is fixed SQL; the only parameter is the time zone constant.
  const totals = await pool.query(
    `SELECT w.days,
       count(DISTINCT e.anon_id) AS visitors,
       count(DISTINCT e.user_id) AS users,
       count(e.id) FILTER (WHERE e.name IN ('page_view', 'drill_view')) AS views,
       count(e.id) FILTER (WHERE e.name = 'drill_view') AS drill_views,
       count(e.id) FILTER (WHERE e.name = 'sign_in') AS sign_ins,
       count(e.id) FILTER (WHERE e.name = 'plan_create') AS plans_created,
       count(e.id) FILTER (WHERE e.name = 'plan_save') AS plans_saved,
       count(e.id) FILTER (WHERE e.name = 'drill_add_to_plan') AS drills_added,
       count(e.id) FILTER (WHERE e.name = 'plan_share') AS shares,
       count(e.id) FILTER (WHERE e.name = 'plan_print') AS prints
     FROM (VALUES (7), (30)) AS w (days)
     LEFT JOIN events e ON e.created_at >= now() - make_interval(days => w.days)
     GROUP BY w.days
     ORDER BY w.days`
  )
  const daily = await pool.query(
    `WITH days AS (
       SELECT generate_series(
         (now() AT TIME ZONE $1::text)::date - 13,
         (now() AT TIME ZONE $1::text)::date,
         interval '1 day'
       )::date AS day
     )
     SELECT to_char(d.day, 'Dy Mon FMDD') AS day,
       count(DISTINCT e.anon_id) AS visitors,
       count(DISTINCT e.user_id) AS users,
       count(e.id) FILTER (WHERE e.name IN ('page_view', 'drill_view')) AS views,
       count(e.id) FILTER (WHERE e.name = 'sign_in') AS sign_ins,
       count(e.id) FILTER (WHERE e.name = 'plan_create') AS plans_created,
       count(e.id) FILTER (WHERE e.name = 'plan_save') AS plans_saved,
       count(e.id) FILTER (WHERE e.name = 'drill_add_to_plan') AS drills_added
     FROM days d
     LEFT JOIN events e
       ON e.created_at >= now() - interval '15 days'
      AND (e.created_at AT TIME ZONE $1::text)::date = d.day
     GROUP BY d.day
     ORDER BY d.day DESC`,
    [TIME_ZONE]
  )
  const drills = await pool.query(
    `SELECT drill_slug,
       count(*) FILTER (WHERE name = 'drill_view') AS views,
       count(DISTINCT anon_id) FILTER (WHERE name = 'drill_view') AS visitors,
       count(*) FILTER (WHERE name = 'drill_add_to_plan') AS added
     FROM events
     WHERE drill_slug IS NOT NULL
       AND name IN ('drill_view', 'drill_add_to_plan')
       AND created_at >= now() - interval '30 days'
     GROUP BY drill_slug
     ORDER BY views DESC, added DESC, drill_slug
     LIMIT 10`
  )
  const users = await pool.query(
    `SELECT u.email, u.name,
       (SELECT count(*) FROM plans p WHERE p.user_id = u.id) AS plans,
       (SELECT count(*) FROM events e WHERE e.user_id = u.id AND e.name = 'sign_in') AS sign_ins,
       (SELECT string_agg(DISTINCT a.provider, ', ') FROM accounts a WHERE a."userId" = u.id) AS providers,
       GREATEST(
         (SELECT max(e.created_at) FROM events e WHERE e.user_id = u.id),
         (SELECT max(p.updated_at) FROM plans p WHERE p.user_id = u.id)
       ) AS last_active
     FROM users u
     ORDER BY last_active DESC NULLS LAST, u.email
     LIMIT 200`
  )
  const meta = await pool.query(`SELECT count(*) AS events, min(created_at) AS first_event FROM events`)
  return { totals: totals.rows, daily: daily.rows, drills: drills.rows, users: users.rows, meta: meta.rows[0] || {} }
}

export function renderDashboard(stats: Stats, viewer: AccountUser): string {
  const byDays = (days: number) => stats.totals.find((row) => Number(row.days) === days) || {}
  const week = byDays(7)
  const month = byDays(30)
  const metrics: [string, string][] = [
    ["Unique visitors (browsers)", "visitors"],
    ["Signed-in coaches active", "users"],
    ["Page views", "views"],
    ["Drill views", "drill_views"],
    ["Sign-ins", "sign_ins"],
    ["Plans created", "plans_created"],
    ["Plans saved (updates)", "plans_saved"],
    ["Drills added to a plan", "drills_added"],
    ["Plan links copied", "shares"],
    ["Plans printed", "prints"],
  ]
  const totalsRows = metrics
    .map(([label, key]) => `<tr><th scope="row">${esc(label)}</th><td>${num(week[key])}</td><td>${num(month[key])}</td></tr>`)
    .join("\n")
  const dailyRows = stats.daily
    .map(
      (row) =>
        `<tr><th scope="row" class="nw">${esc(row.day)}</th><td>${num(row.visitors)}</td><td>${num(row.users)}</td><td>${num(row.views)}</td><td>${num(row.sign_ins)}</td><td>${num(row.plans_created)}</td><td>${num(row.plans_saved)}</td><td>${num(row.drills_added)}</td></tr>`
    )
    .join("\n")
  const drillRows = stats.drills.length
    ? stats.drills
        .map(
          (row) =>
            `<tr><th scope="row"><a href="/drills/${encodeURIComponent(String(row.drill_slug))}/">${esc(title(row.drill_slug))}</a></th><td>${num(row.views)}</td><td>${num(row.visitors)}</td><td>${num(row.added)}</td></tr>`
        )
        .join("\n")
    : `<tr><td colspan="4">No drill views yet.</td></tr>`
  const userRows = stats.users.length
    ? stats.users
        .map(
          (row) =>
            `<tr><th scope="row">${esc(row.email || "(no email)")}${row.name ? `<br><span class="muted">${esc(row.name)}</span>` : ""}</th><td>${num(row.plans)}</td><td>${num(row.sign_ins)}</td><td>${esc(row.providers || "")}</td><td>${when(row.last_active)}</td></tr>`
        )
        .join("\n")
    : `<tr><td colspan="5">No accounts yet.</td></tr>`
  const first = stats.meta.first_event ? `since ${when(stats.meta.first_event)}` : "none yet"
  const body = `
  <p class="muted">Signed in as ${esc(viewer.email)}. Times are Toronto time. Events logged: ${num(stats.meta.events)} (${first}).</p>
  <p><a href="${VERCEL_ANALYTICS_URL}" rel="noopener noreferrer" target="_blank">Open Vercel Web Analytics</a> for page views, referrers, countries, and devices.</p>

  <h2>Totals</h2>
  <div class="scroll"><table>
    <thead><tr><th scope="col">Metric</th><th scope="col">Last 7 days</th><th scope="col">Last 30 days</th></tr></thead>
    <tbody>
${totalsRows}
    </tbody>
  </table></div>

  <h2>Last 14 days</h2>
  <div class="scroll"><table>
    <thead><tr><th scope="col">Day</th><th scope="col">Visitors</th><th scope="col">Coaches</th><th scope="col">Views</th><th scope="col">Sign-ins</th><th scope="col">Plans new</th><th scope="col">Plans saved</th><th scope="col">Drills added</th></tr></thead>
    <tbody>
${dailyRows}
    </tbody>
  </table></div>

  <h2>Top drills (30 days)</h2>
  <div class="scroll"><table>
    <thead><tr><th scope="col">Drill</th><th scope="col">Views</th><th scope="col">Visitors</th><th scope="col">Added to plan</th></tr></thead>
    <tbody>
${drillRows}
    </tbody>
  </table></div>

  <h2>Coaches with accounts</h2>
  <div class="scroll"><table>
    <thead><tr><th scope="col">Account</th><th scope="col">Plans</th><th scope="col">Sign-ins</th><th scope="col">Via</th><th scope="col">Last active</th></tr></thead>
    <tbody>
${userRows}
    </tbody>
  </table></div>
  <p class="muted">Visitors are counted by a random ID stored in each browser, so one coach on a phone and a laptop counts twice. Your own visits are included.</p>`
  return page(body)
}

function page(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>Site stats · Hockey Skills &amp; Drills</title>
  <style>
    body { font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0 auto; max-width: 960px; padding: 16px; }
    h1 { font-size: 1.5rem; margin: 0 0 4px; }
    h2 { font-size: 1.15rem; margin: 28px 0 8px; }
    .muted { color: #6b7785; font-size: 0.9rem; }
    .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
    th, td { border-bottom: 1px solid #8884; padding: 6px 8px; text-align: right; white-space: nowrap; }
    th[scope="row"], thead th:first-child { text-align: left; white-space: normal; }
    thead th { font-size: 0.85rem; color: #6b7785; }
    th.nw { white-space: nowrap; }
    a { color: #2563c9; }
  </style>
</head>
<body>
  <h1>Site stats</h1>
  <p><a href="/">Back to the drill library</a></p>
${body}
</body>
</html>
`
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function num(value: unknown): string {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n.toLocaleString("en-CA") : "0"
}

function when(value: unknown): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return "—"
  return esc(
    date.toLocaleString("en-CA", {
      timeZone: TIME_ZONE,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  )
}

function title(slug: unknown): string {
  const text = String(slug ?? "").replace(/-/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
