import type { AccountUser } from "./auth.js"
import type { Game } from "./schedule.js"
import { playerLabel, POSITIONS, type Lineup, type LineupSummary, type Player, type Position, type SharedLineup, type Team } from "./lineups.js"
import { practicePagePath, type PlanSummary } from "./plans.js"
import type { CoachTeam, InvitePreview, TeamInvite, TeamMember, TeamRole } from "./teams.js"

export interface TeamHome {
  teams: CoachTeam[]
  role: TeamRole
  plans: PlanSummary[]
  members: TeamMember[]
  invites: TeamInvite[]
}

// Server-rendered HTML for the private lineup pages. These pages load no
// analytics and no usage beacons, and send no referrer, so share tokens and
// player names never leave the page.

const TIME_ZONE = "America/Toronto"

export const POSITION_NAMES: Record<Position, string> = {
  LW: "LW",
  C: "C",
  RW: "RW",
  LD: "LD",
  RD: "RD",
  OUT: "Out",
}

export function renderMessage(message: string): string {
  return shell("Lineups", `<main id="content" class="wrap lu-page"><p>${esc(message)}</p></main>`, true)
}

export function renderTeams(teams: CoachTeam[], viewer: AccountUser): string {
  const rows = teams
    .map((t) => `<li class="lu-item"><a class="lu-item-link" href="/lineups/team/${esc(t.id)}/"><strong>${esc(t.name)}</strong>
        <span class="muted">${esc(teamMeta(t) || "Lineups, roster, and practices")}${t.role === "assistant" ? " · assistant" : ""}</span></a>
        <a class="btn" href="/lineups/team/${esc(t.id)}/roster/">Roster</a></li>`)
    .join("\n")
  const empty = teams.length === 0
  const body = `  <main id="content" class="wrap-read lu-page">
    <header class="drill-head">
      <p class="kicker">Private · only your coaches</p>
      <h1>${empty ? "Create your first team" : "Lineups"}</h1>
      <p class="lede">${empty ? "Name the team, add players, and build lineups. Only coaches on that team can see it." : "Pick a team, or start another. Signed in as " + esc(viewer.email) + "."}</p>
    </header>
    <ul class="lu-items">
${rows}
    </ul>
    ${createTeamForm(empty)}
  </main>`
  return shell(empty ? "Create your first team" : "Lineups", body, true)
}

export function renderRosters(rows: { team: CoachTeam; count: number }[], viewer: AccountUser): string {
  const items = rows
    .map(({ team: t, count }) => `<li class="lu-item"><a class="lu-item-link" href="/lineups/team/${esc(t.id)}/roster/"><strong>${esc(t.name)}</strong>
        <span class="muted">${count} player${count === 1 ? "" : "s"}</span></a></li>`)
    .join("\n")
  const body = `  <main id="content" class="wrap-read lu-page">
    <header class="drill-head">
      <p class="kicker">Private · only your coaches</p>
      <h1>Rosters</h1>
      <p class="lede">${rows.length ? `Pick a team roster. Signed in as ${esc(viewer.email)}.` : "Create a team first, then add players."}</p>
    </header>
    <ul class="lu-items">
${items || `<li class="empty">No teams yet. <a href="/lineups/">Create your first team</a>.</li>`}
    </ul>
  </main>`
  return shell("Rosters", body, true)
}

export function renderList(team: Team, lineups: LineupSummary[], viewer: AccountUser, players: Player[] = [], home?: TeamHome): string {
  const names = new Map(players.map((p) => [p.id, playerLabel(p)]))
  const starsLine = (stars: (string | null)[]) => {
    const picks = stars.map((id, i) => (id && names.has(id) ? `<span class="lu-star-sum"><b>${"★".repeat(i + 1)}</b> ${esc(names.get(id) || "")}</span>` : "")).filter(Boolean)
    return picks.length ? `<span class="lu-stars-line">${picks.join(" ")}</span>` : ""
  }
  const base = `/lineups/team/${esc(team.id)}`
  const rows = lineups.length
    ? lineups
        .map(
          (l) => `<li class="lu-item">
        <a class="lu-item-link" href="${base}/${esc(l.id)}/"><strong>${esc(l.title || "Untitled lineup")}</strong>
        <span class="muted">${l.placed} placed · ${l.out} out${l.shared ? " · link on" : ""} · ${when(l.updatedAt)}</span>${starsLine(l.stars)}</a>
        <button class="btn" type="button" data-duplicate="${esc(l.id)}">Duplicate</button>
      </li>`
        )
        .join("\n")
    : `<li class="empty">No lineups yet. Start one for the next game.</li>`
  const meta = teamMeta(team)
  const body = `  <main id="content" class="wrap-read lu-page" data-team="${esc(team.id)}">
    <p class="lu-back"><a href="/lineups/">← All teams</a></p>
    ${switcher(home?.teams || [], team.id, "")}
    <header class="drill-head">
      <p class="kicker">Private · only this team's coaches</p>
      <h1>${esc(team.name)}</h1>
      <p class="lede">${meta ? `${esc(meta)}. ` : ""}Lineups, roster, and practices stay on this team.</p>
    </header>
    <div class="lu-actions">
      <a class="btn primary" href="${base}/new/">New lineup</a>
      <a class="btn" href="${base}/roster/">Roster</a>
      <a class="btn" href="/plan/?team=${esc(team.id)}">New practice plan</a>
    </div>
    <p class="lu-status" id="lu-status" role="status"></p>
    <ul class="lu-items">
${rows}
    </ul>
    ${historyBlock(home?.plans || [])}
    ${home ? settingsBlock(team, home) : ""}
    <p class="muted">Signed in as ${esc(viewer.email)}${home?.role === "assistant" ? " · assistant coach" : ""}.</p>
  </main>`
  return shell(`${team.name} · Lineups`, body, true, team)
}

export function renderRoster(team: Team, players: Player[], viewer: AccountUser, teams: CoachTeam[] = []): string {
  const base = `/lineups/team/${esc(team.id)}`
  const rows = players
    .map(
      (p) => `<li class="lu-item"><span><strong>${esc(playerLabel(p))}</strong>${p.position ? ` <span class="lu-tag">${esc(p.position)}</span>` : ""}${p.practiceNumber != null ? ` <span class="lu-practice" title="Practice jersey">· practice ${p.practiceNumber}</span>` : ""}
          <button class="lu-pref" type="button" data-pref-player="${esc(p.id)}" data-pref="${esc(p.preferred)}" aria-label="Preferred positions for ${esc(playerLabel(p))}">${p.preferred ? `Wants ${esc(p.preferred)}` : "+ Pref"}</button></span>
        <button class="btn danger" type="button" data-remove-player="${esc(p.id)}" data-label="${esc(playerLabel(p))}">Remove</button></li>`
    )
    .join("\n")
  const body = `  <main id="content" class="wrap-read lu-page" data-team="${esc(team.id)}">
    <p class="lu-back"><a href="${base}/">← ${esc(team.name)}</a></p>
    ${switcher(teams, team.id, "roster/")}
    <header class="drill-head">
      <p class="kicker">Private · only this team's coaches</p>
      <h1>${esc(team.name)} roster</h1>
      <p class="lede">First name and a one- or two-letter last initial. No full last names. Goalies stay in net and can only move to Out. Removing a player keeps them in lineups you already saved.</p>
    </header>
    <form class="lu-add" id="lu-add" autocomplete="off">
      <label>Game number <input name="number" type="number" min="0" max="99" inputmode="numeric" required></label>
      <label>Practice number <input name="practiceNumber" type="number" min="0" max="99" inputmode="numeric"></label>
      <label>First name <input name="firstName" type="text" maxlength="24" required autocomplete="off"></label>
      <label>Last initial <input name="lastInitial" type="text" maxlength="2" minlength="1" pattern="[A-Za-z]{1,2}" autocapitalize="characters" required autocomplete="off"></label>
      <label>Position <select name="position">
        <option value="F">Forward</option>
        <option value="D">Defense</option>
        <option value="G">Goalie</option>
      </select></label>
      <label>Preferred <input name="preferred" type="text" maxlength="8" placeholder="C/W" autocomplete="off"></label>
      <button class="btn primary" type="submit">Add player</button>
    </form>
    <p class="lu-status" id="lu-status" role="status"></p>
    <ul class="lu-items">
${rows || `<li class="empty">No players yet. Add the first one.</li>`}
    </ul>
    <p class="muted">Signed in as ${esc(viewer.email)}.</p>
  </main>`
  return shell(`Roster · ${team.name}`, body, true, team)
}

export function renderEditor(team: Team, lineup: Lineup | null, players: Player[], viewer: AccountUser, games: Game[] = [], teams: CoachTeam[] = []): string {
  const title = lineup ? lineup.title : games[0]?.label || ""
  const gamePicker = !lineup && games.length
    ? `<label class="lu-title-label" for="lu-game">Game from the team schedule
        <select id="lu-game">
          ${games.map((g, i) => `<option value="${esc(g.label)}"${i === 0 ? " selected" : ""}>${esc(g.label)}</option>`).join("")}
          <option value="">Other (type a name)</option>
        </select>
      </label>`
    : !lineup
      ? `<p class="muted lu-schedule-empty" id="lu-schedule-empty">No upcoming games on the team schedule. Type a lineup name.</p>`
      : ""
  const data = {
    lineup: lineup ? { id: lineup.id, title: lineup.title, slots: lineup.slots, shareToken: lineup.shareToken, notes: lineup.notes, stars: lineup.stars } : null,
    players: players.map((p) => ({ id: p.id, label: playerLabel(p), pref: p.preferred, active: p.active, goalie: p.goalie })),
  }
  const zones = POSITIONS.map((pos) => {
    const name = POSITION_NAMES[pos]
    return `<section class="lu-zone lu-zone-${pos.toLowerCase()}" data-pos="${pos}" aria-label="${name}">
        <h2><span>${name}</span> <span class="lu-count" data-count="${pos}">0</span></h2>
        <ul class="lu-list" data-list="${pos}"></ul>
      </section>`
  }).join("\n")
  const body = `  <main id="content" class="wrap lu-page lu-editor" data-team="${esc(team.id)}">
    <p class="lu-back"><a href="/lineups/team/${esc(team.id)}/">← ${esc(team.name)}</a></p>
    ${switcher(teams, team.id, "")}
    <h1 class="lu-print-title" id="lu-print-title">${esc(title || "Lineup")}</h1>
    <div class="lu-tools">
      ${gamePicker}
      <label class="lu-title-label">Lineup name
        <input id="lu-title" type="text" maxlength="80" placeholder="Sat Oct 25 vs Hawks" value="${esc(title)}" autocomplete="off">
      </label>
      <div class="lu-actions">
        <button class="btn" type="button" data-print>Print</button>
        <button class="btn danger" type="button" id="lu-delete"${lineup ? "" : " disabled"}>Delete</button>
        <span class="lu-save-state" id="lu-save-state" aria-live="polite">${lineup ? "Saved" : ""}</span>
      </div>
      <div class="lu-share" id="lu-share">
        <p class="muted">Share link: read-only, no sign-in. Anyone with the link can see this lineup.</p>
        <div class="lu-actions">
          <button class="btn" type="button" id="lu-copy"${lineup ? "" : " disabled"}>Copy share link</button>
          <button class="btn" type="button" id="lu-regen"${lineup ? "" : " disabled"}>Regenerate link</button>
          <button class="btn" type="button" id="lu-unshare"${lineup ? "" : " disabled"}>Turn off link</button>
        </div>
        <input class="lu-link" id="lu-link" type="text" readonly hidden>
      </div>
      <p class="lu-status" id="lu-status" role="status"></p>
      <p class="lu-hint">Drag a player into a column, or tap a player and then tap a column. Drag back to Players to un-place. Goalies can move to Out and back. Changes save automatically.</p>
    </div>
    <section class="lu-goalies lu-zone-goalies" data-pos="GOALIES" aria-label="Goalies">
      <h2>Goalies</h2>
      <ul class="lu-list lu-inline" data-list="GOALIES"></ul>
    </section>
    <section class="lu-pool" data-pos="POOL" aria-label="Players not placed">
      <h2><span>Players</span> <span class="lu-count" data-count="POOL">0</span></h2>
      <ul class="lu-list lu-inline" data-list="POOL"></ul>
    </section>
    <div class="lu-board">
${zones}
    </div>
    <section class="lu-post lu-noprint" aria-labelledby="lu-post-h">
      <h2 id="lu-post-h">After the game <span class="muted">· also shown on the share link</span></h2>
      <fieldset class="lu-stars">
        <legend>Three stars</legend>
        ${[1, 2, 3].map((n) => `<label class="lu-star-row"><span class="lu-star-label"><b aria-hidden="true">${"★".repeat(n)}</b> ${n === 1 ? "1st star · player of the game" : n === 2 ? "2nd star" : "3rd star"}</span>
          <select data-star="${n - 1}"><option value="">— None —</option></select></label>`).join("\n        ")}
      </fieldset>
      <label class="lu-notes-label" for="lu-notes">Coach's notes
        <textarea id="lu-notes" rows="6" maxlength="5000" placeholder="What went well, what to work on, who stood out…">${esc(lineup?.notes || "")}</textarea>
      </label>
    </section>
    <p class="muted lu-noprint">Signed in as ${esc(viewer.email)}.</p>
    <script type="application/json" id="lu-data">${safeJson(data)}</script>
  </main>`
  return shell(`${lineup?.title || "New lineup"} · ${team.name}`, body, true, team)
}

export function renderShared(lineup: SharedLineup): string {
  const zones = POSITIONS.map((pos) => {
    const prefix = pos === "LW" || pos === "C" || pos === "RW" ? "L" : pos === "LD" || pos === "RD" ? "P" : ""
    const items = lineup.slots[pos]
      .map((label, i) => `<li class="lu-chip">${prefix ? `<span class="lu-line">${prefix}${i + 1}</span> ` : ""}${esc(label)}</li>`)
      .join("")
    return `<section class="lu-zone lu-zone-${pos.toLowerCase()}" aria-label="${POSITION_NAMES[pos]}">
        <h2><span>${POSITION_NAMES[pos]}</span> <span class="lu-count">${lineup.slots[pos].length}</span></h2>
        <ul class="lu-list">${items || `<li class="lu-none">—</li>`}</ul>
      </section>`
  }).join("\n")
  const body = `  <main id="content" class="wrap lu-page lu-view">
    <h1>${esc(lineup.title || "Lineup")}</h1>
    <p class="muted">Updated ${when(lineup.updatedAt)} (Toronto time). <button class="btn lu-noprint" type="button" data-print>Print</button></p>
    ${goaliesBlock(lineup.goalies)}
    <div class="lu-board">
${zones}
    </div>
    ${postGameBlock(lineup)}
  </main>`
  return shell(`${lineup.title || "Lineup"}`, body, false)
}

// Read-only notes and three stars on the share view; nothing renders when unset.
function postGameBlock(lineup: SharedLineup): string {
  const picks = lineup.stars
    .map((label, i) => (label ? `<li class="lu-star-row"><b aria-label="${["1st", "2nd", "3rd"][i]} star">${"★".repeat(i + 1)}</b> ${esc(label)}${i === 0 ? ` <span class="muted">· player of the game</span>` : ""}</li>` : ""))
    .filter(Boolean)
  const notes = lineup.notes.trim()
  if (!picks.length && !notes) return ""
  return `<section class="lu-post lu-post-view" aria-labelledby="lu-post-h">
      <h2 id="lu-post-h">After the game</h2>
      ${picks.length ? `<h3>Three stars</h3><ol class="lu-star-list">${picks.join("")}</ol>` : ""}
      ${notes ? `<h3>Coach's notes</h3><div class="lu-notes-view">${esc(notes)}</div>` : ""}
    </section>`
}

export function renderJoin(invite: InvitePreview, viewer: AccountUser | null, token: string): string {
  const next = `/lineups/join/${encodeURIComponent(token)}/`
  const body = viewer
    ? `  <main id="content" class="wrap-read lu-page">
    <header class="drill-head">
      <p class="kicker">Assistant coach</p>
      <h1>Join ${esc(invite.teamName)}</h1>
      <p class="lede">You'll be able to edit lineups, the roster, and practice plans. The team owner still manages coaches.</p>
    </header>
    <form id="lu-join" data-token="${esc(token)}" action="${esc(next)}" method="post">
      <button class="btn primary" type="submit">Join as assistant</button>
    </form>
    <p class="lu-status" id="lu-status" role="status"></p>
    <p class="muted">Signed in as ${esc(viewer.email)}.</p>
  </main>`
    : `  <main id="content" class="wrap-read lu-page">
    <header class="drill-head">
      <p class="kicker">Assistant coach</p>
      <h1>You're invited</h1>
      <p class="lede">Sign in to join ${esc(invite.teamName)} as an assistant coach.</p>
    </header>
    <p><a class="btn primary" href="/account/?next=${encodeURIComponent(next)}">Sign in to join</a></p>
  </main>`
  return shell(viewer ? `Join ${invite.teamName}` : "Join a team", body, Boolean(viewer))
}

function createTeamForm(open: boolean): string {
  return `<form class="lu-create" id="lu-create" autocomplete="off"${open ? "" : " hidden"}>
      <h2>${open ? "Team setup" : "New team"}</h2>
      <label>Team name <input name="name" type="text" maxlength="60" required placeholder="River Otters"></label>
      <label>Age group / level <input name="ageGroup" type="text" maxlength="40" required placeholder="U11"></label>
      <label>Season <input name="season" type="text" maxlength="20" required placeholder="2026-27"></label>
      <label>Schedule link <input name="scheduleUrl" type="url" inputmode="url" maxlength="500" placeholder="https://… iCal or webcal link"></label>
      <button class="btn primary" type="submit">${open ? "Create team" : "Create team"}</button>
    </form>${open ? "" : `<p class="lu-actions"><button class="btn" type="button" id="lu-show-create">New team</button></p>`}`
}

function switcher(teams: CoachTeam[], currentId: string, tail: string): string {
  if (teams.length < 2) return ""
  const options = teams
    .map((team) => `<option value="${esc(team.id)}"${team.id === currentId ? " selected" : ""}>${esc(team.name)}</option>`)
    .join("")
  return `<label class="lu-switch">Team <select data-team-switch data-tail="${esc(tail)}">${options}</select></label>`
}

function historyBlock(plans: PlanSummary[]): string {
  const rows = plans.length
    ? plans
        .map((plan) => {
          const drills = plan.drills.slice(0, 4).map(drillLabel)
          const extra = plan.drills.length > 4 ? ` +${plan.drills.length - 4}` : ""
          const whenLabel = plan.practiceDate ? practiceWhen(plan.practiceDate) : "No date"
          const open = `/plan/?saved=${encodeURIComponent(plan.id)}`
          return `<li class="lu-item lu-history-item">
        <div><strong>${esc(plan.title.trim() || "Untitled practice")}</strong>
          <span class="muted">${esc(whenLabel)} · ${plan.totalMinutes} min · ${plan.drillCount} drill${plan.drillCount === 1 ? "" : "s"}</span>
          ${drills.length ? `<span class="muted">${esc(drills.join(", "))}${extra}</span>` : ""}</div>
        <div class="lu-actions">
          <a class="btn" href="${open}">Open</a>
          <a class="btn" href="${open}">Edit</a>
          <button class="btn" type="button" data-run-again="${esc(plan.id)}">Run it again</button>
          <a class="btn" href="${esc(practicePagePath(plan))}">Practice page</a>
        </div>
      </li>`
        })
        .join("\n")
    : `<li class="empty">No practices saved yet. Build one, pick this team, and it shows up here.</li>`
  return `<section class="lu-history" aria-labelledby="lu-history-h">
      <h2 id="lu-history-h">Practice history</h2>
      <ul class="lu-items">${rows}</ul>
    </section>`
}

function settingsBlock(team: Team, home: TeamHome): string {
  const members = home.members
    .map((member) => {
      const label = member.name || member.email || "Coach"
      const extra = member.email && member.email !== label ? ` · ${esc(member.email)}` : ""
      const remove =
        home.role === "owner" && member.role === "assistant"
          ? `<button class="btn danger" type="button" data-remove-member="${esc(member.userId)}">Remove</button>`
          : ""
      return `<li class="lu-item"><span><strong>${esc(label)}</strong> <span class="muted">${esc(member.role)}${extra}</span></span>${remove}</li>`
    })
    .join("\n")
  const invites =
    home.role === "owner"
      ? `<form class="lu-invite" id="lu-invite">
      <label class="lu-check"><input name="singleUse" type="checkbox" checked> Single-use</label>
      <label>Expires <select name="expiresInHours">
        <option value="24">1 day</option>
        <option value="168" selected>7 days</option>
        <option value="720">30 days</option>
        <option value="">No expiry</option>
      </select></label>
      <button class="btn primary" type="submit">Create invite link</button>
    </form>
    <p class="lu-invite-link" id="lu-invite-link" hidden></p>
    <ul class="lu-items" id="lu-invites">${home.invites
      .map(
        (invite) =>
          `<li class="lu-item"><span><a href="${esc(invite.path)}">${invite.singleUse ? "Single-use" : "Multi-use"} link</a> <span class="muted">${invite.expiresAt ? `expires ${esc(when(invite.expiresAt))}` : "no expiry"}</span></span><button class="btn danger" type="button" data-revoke-invite="${esc(invite.id)}">Revoke</button></li>`
      )
      .join("\n")}</ul>`
      : `<p class="muted">You're an assistant. The team owner manages coaches.</p>`
  const deleteButton = home.role === "owner" ? `<button class="btn danger" type="button" id="lu-delete-team">Delete team</button>` : ""
  return `<section class="lu-settings" aria-labelledby="lu-setup-h">
      <h2 id="lu-setup-h">Team setup</h2>
      <form class="lu-settings-form" id="lu-settings" autocomplete="off">
        <label>Team name <input name="name" type="text" maxlength="60" required value="${esc(team.name)}"></label>
        <label>Age group / level <input name="ageGroup" type="text" maxlength="40" value="${esc(team.ageGroup)}"></label>
        <label>Season <input name="season" type="text" maxlength="20" value="${esc(team.season)}"></label>
        <label>Schedule link <input name="scheduleUrl" type="url" inputmode="url" maxlength="500" value="${esc(team.scheduleUrl || "")}" placeholder="https://… iCal or webcal link"></label>
        <div class="lu-actions"><button class="btn primary" type="submit">Save team</button>${deleteButton}</div>
      </form>
      <h2>Coaches</h2>
      <ul class="lu-items">${members}</ul>
      ${invites}
    </section>`
}

function teamMeta(team: Pick<Team, "ageGroup" | "season">): string {
  return [team.ageGroup, team.season].filter(Boolean).join(" · ")
}

function drillLabel(slug: string): string {
  const text = slug.replace(/-/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function practiceWhen(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return day
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" })
}

function goaliesBlock(labels: string[]): string {
  const chips = labels.map((l) => `<li class="lu-chip lu-goalie">${esc(l)}</li>`).join("")
  return `<section class="lu-goalies" aria-label="Goalies"><h2>Goalies</h2><ul class="lu-list lu-inline">${chips || `<li class="lu-none">—</li>`}</ul></section>`
}

// Bust phone caches per deploy (Vercel sets the commit SHA at build/runtime).
const ASSET_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 10)

function shell(title: string, body: string, admin: boolean, team?: Team): string {
  const nav = admin
    ? `<nav class="header-actions" aria-label="Lineups"><a class="plan-nav" href="/lineups/">Teams</a>${
        team ? `<a class="plan-nav" href="/lineups/team/${esc(team.id)}/roster/">Roster</a>` : ""
      }</nav>`
    : ""
  const brand = admin ? `<a class="brand" href="/">` : `<span class="brand">`
  const brandEnd = admin ? `</a>` : `</span>`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>${esc(title)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/styles.css?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="/css/lineups.css?v=${ASSET_VERSION}">
</head>
<body data-page="lineups">
  <a class="skip" href="#content">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      ${brand}
        <span class="mark" aria-hidden="true"><span></span></span>
        <span class="brand-text">
          <span class="brand-kicker">Team lineup</span>
          <span class="brand-name">Hockey Skills &amp; Drills</span>
        </span>
      ${brandEnd}
      ${nav}
    </div>
  </header>
${body}
  <script src="/js/lineups.js?v=${ASSET_VERSION}"></script>${
    admin ? `\n  <script src="/js/site.js?v=${ASSET_VERSION}"></script>` : ""
  }
</body>
</html>
`
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function when(value: unknown): string {
  if (!value) return "—"
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return "—"
  return esc(
    date.toLocaleString("en-CA", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  )
}
