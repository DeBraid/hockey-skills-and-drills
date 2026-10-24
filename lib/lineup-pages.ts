import type { AccountUser } from "./auth.js"
import type { Game } from "./schedule.js"
import { playerLabel, POSITIONS, type Lineup, type LineupSummary, type Player, type Position, type SharedLineup, type Team } from "./lineups.js"

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

export function renderTeams(teams: Team[], viewer: AccountUser): string {
  const rows = teams
    .map((t) => `<li class="lu-item"><a class="lu-item-link" href="/lineups/team/${esc(t.id)}/"><strong>${esc(t.name)}</strong>
        <span class="muted">Lineups and roster</span></a>
        <a class="btn" href="/lineups/team/${esc(t.id)}/roster/">Roster</a></li>`)
    .join("\n")
  const body = `  <main id="content" class="wrap-read lu-page">
    <header class="drill-head">
      <p class="kicker">Private · only you can see this</p>
      <h1>Lineups</h1>
      <p class="lede">Pick a team. Signed in as ${esc(viewer.email)}.</p>
    </header>
    <ul class="lu-items">
${rows || `<li class="empty">No teams yet.</li>`}
    </ul>
  </main>`
  return shell("Lineups", body, true)
}

export function renderList(team: Team, lineups: LineupSummary[], viewer: AccountUser): string {
  const base = `/lineups/team/${esc(team.id)}`
  const rows = lineups.length
    ? lineups
        .map(
          (l) => `<li class="lu-item">
        <a class="lu-item-link" href="${base}/${esc(l.id)}/"><strong>${esc(l.title || "Untitled lineup")}</strong>
        <span class="muted">${l.placed} placed · ${l.out} out${l.shared ? " · link on" : ""} · ${when(l.updatedAt)}</span></a>
        <button class="btn" type="button" data-duplicate="${esc(l.id)}">Duplicate</button>
      </li>`
        )
        .join("\n")
    : `<li class="empty">No lineups yet. Start one with New lineup.</li>`
  const body = `  <main id="content" class="wrap-read lu-page" data-team="${esc(team.id)}">
    <p class="lu-back"><a href="/lineups/">← All teams</a></p>
    <header class="drill-head">
      <p class="kicker">Private · only you can see this</p>
      <h1>${esc(team.name)} lineups</h1>
      <p class="lede">Build a lineup for each game. Signed in as ${esc(viewer.email)}.</p>
    </header>
    <div class="lu-actions">
      <a class="btn primary" href="${base}/new/">New lineup</a>
      <a class="btn" href="${base}/roster/">Roster</a>
    </div>
    <p class="lu-status" id="lu-status" role="status"></p>
    <ul class="lu-items">
${rows}
    </ul>
  </main>`
  return shell(`${team.name} · Lineups`, body, true, team)
}

export function renderRoster(team: Team, players: Player[], viewer: AccountUser): string {
  const base = `/lineups/team/${esc(team.id)}`
  const rows = players
    .map(
      (p) => `<li class="lu-item"><span><strong>${esc(playerLabel(p))}</strong>${p.goalie ? ` <span class="lu-tag">G</span>` : ""}</span>
        <button class="btn danger" type="button" data-remove-player="${esc(p.id)}" data-label="${esc(playerLabel(p))}">Remove</button></li>`
    )
    .join("\n")
  const body = `  <main id="content" class="wrap-read lu-page" data-team="${esc(team.id)}">
    <p class="lu-back"><a href="${base}/">← ${esc(team.name)} lineups</a></p>
    <header class="drill-head">
      <p class="kicker">Private · only you can see this</p>
      <h1>${esc(team.name)} roster</h1>
      <p class="lede">Number, first name, and last initial only. Never enter full last names. Tick Goalie for goalies; they stay in net and can only move to Out. Removing a player keeps them in lineups you already saved.</p>
    </header>
    <form class="lu-add" id="lu-add" autocomplete="off">
      <label>Number <input name="number" type="number" min="0" max="99" inputmode="numeric" required></label>
      <label>First name <input name="firstName" type="text" maxlength="24" required></label>
      <label>Last initial <input name="lastInitial" type="text" maxlength="1" pattern="[A-Za-z]?"></label>
      <label class="lu-check"><input name="goalie" type="checkbox"> Goalie</label>
      <button class="btn primary" type="submit">Add player</button>
    </form>
    <p class="lu-status" id="lu-status" role="status"></p>
    <ul class="lu-items">
${rows || `<li class="empty">No players yet.</li>`}
    </ul>
    <p class="muted">Signed in as ${esc(viewer.email)}.</p>
  </main>`
  return shell(`Roster · ${team.name}`, body, true, team)
}

export function renderEditor(team: Team, lineup: Lineup | null, players: Player[], viewer: AccountUser, games: Game[] = []): string {
  const title = lineup ? lineup.title : games[0]?.label || ""
  const gamePicker = !lineup && games.length
    ? `<label class="lu-title-label" for="lu-game">Game from the team schedule
        <select id="lu-game">
          ${games.map((g, i) => `<option value="${esc(g.label)}"${i === 0 ? " selected" : ""}>${esc(g.label)}</option>`).join("")}
          <option value="">Other (type a name)</option>
        </select>
      </label>`
    : ""
  const data = {
    lineup: lineup ? { id: lineup.id, title: lineup.title, slots: lineup.slots, shareToken: lineup.shareToken } : null,
    players: players.map((p) => ({ id: p.id, label: playerLabel(p), active: p.active, goalie: p.goalie })),
  }
  const zones = POSITIONS.map((pos) => {
    const name = POSITION_NAMES[pos]
    return `<section class="lu-zone lu-zone-${pos.toLowerCase()}" data-pos="${pos}" aria-label="${name}">
        <h2><span>${name}</span> <span class="lu-count" data-count="${pos}">0</span></h2>
        <ul class="lu-list" data-list="${pos}"></ul>
      </section>`
  }).join("\n")
  const body = `  <main id="content" class="wrap lu-page lu-editor" data-team="${esc(team.id)}">
    <p class="lu-back"><a href="/lineups/team/${esc(team.id)}/">← ${esc(team.name)} lineups</a></p>
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
  </main>`
  return shell(`${lineup.title || "Lineup"}`, body, false)
}

function goaliesBlock(labels: string[]): string {
  const chips = labels.map((l) => `<li class="lu-chip lu-goalie">${esc(l)}</li>`).join("")
  return `<section class="lu-goalies" aria-label="Goalies"><h2>Goalies</h2><ul class="lu-list lu-inline">${chips || `<li class="lu-none">—</li>`}</ul></section>`
}

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
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/lineups.css">
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
  <script src="/js/lineups.js"></script>
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
