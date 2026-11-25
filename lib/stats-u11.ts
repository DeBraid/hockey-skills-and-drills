import { isAdmin, notFound } from "./admin.js"
import { readSession, type AccountUser } from "./auth.js"
import { getPool } from "./db.js"

const STATS_KEY = "u11_house_2026-27"
const TIME_ZONE = "America/Toronto"
const FOCUS_TEAM = "Stars"

export interface SkaterRow {
  rank: number
  number: number
  first_name: string
  team: string
  GP: number
  G: number
  A: number
  PTS: number
  PIM: number
  PPG: number
  SHG: number
  GWG: number
}

export interface GoalieRow {
  number: number
  first_name: string
  team: string
  GP: number
  GA: number
  GAA: number
  W: number
  L: number
  T: number
  SO: number
}

export interface StandingRow {
  team: string
  GP: number
  W: number
  L: number
  T: number
  PTS: number
  GF: number
  GA: number
}

export interface LeagueStatsPayload {
  skaters: SkaterRow[]
  goalies: GoalieRow[]
  standings: StandingRow[]
  source?: string
  pulled_at?: string
}

export interface LeagueStatsRecord {
  payload: LeagueStatsPayload
  source: string
  pulledAt: string | null
}

export async function handleU11Stats(request: Request, verifiedUser?: AccountUser): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return notFound()
  const user = verifiedUser ?? (await readSession(request))
  if (!isAdmin(user)) return notFound()

  let html: string
  try {
    const record = await loadLeagueStats(STATS_KEY)
    html = record ? renderU11StatsPage(record) : renderMissing()
  } catch (error) {
    console.error("u11 stats failed", error instanceof Error ? error.message : error)
    html = renderMissing("Could not load league stats right now.")
  }

  return new Response(request.method === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  })
}

export async function loadLeagueStats(key = STATS_KEY): Promise<LeagueStatsRecord | null> {
  const pool = getPool()
  const result = await pool.query<{ payload: LeagueStatsPayload; source: string; pulled_at: Date | string | null }>(
    `SELECT payload, source, pulled_at
     FROM league_stats
     WHERE key = $1
     LIMIT 1`,
    [key]
  )
  const row = result.rows[0]
  if (!row?.payload) return null
  const payload = row.payload
  return {
    payload,
    source: row.source || payload.source || "",
    pulledAt: row.pulled_at ? new Date(row.pulled_at).toISOString() : payload.pulled_at || null,
  }
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function pct(value: number, max: number, span = 100): string {
  if (max <= 0 || value <= 0) return "0%"
  const clamped = Math.min(value, max)
  return `${((clamped / max) * span).toFixed(2)}%`
}

export function renderU11StatsPage(record: LeagueStatsRecord): string {
  const { payload, source, pulledAt } = record
  const skaters = Array.isArray(payload.skaters) ? [...payload.skaters] : []
  const goalies = Array.isArray(payload.goalies) ? [...payload.goalies] : []
  const standings = Array.isArray(payload.standings) ? [...payload.standings] : []

  skaters.sort((a, b) => a.rank - b.rank || b.PTS - a.PTS || b.G - a.G)
  goalies.sort((a, b) => a.GAA - b.GAA || a.GA - b.GA)

  const totalGoals = standings.reduce((sum, s) => sum + Number(s.GF || 0), 0)
  const totalTeamGames = standings.reduce((sum, s) => sum + Number(s.GP || 0), 0)
  const leagueGames = totalTeamGames / 2
  const goalsPerGame = leagueGames > 0 ? (totalGoals / leagueGames).toFixed(1) : "0.0"

  const leader = skaters[0]
  const starsIndex = standings.findIndex((s) => s.team === FOCUS_TEAM)
  const starsRow = starsIndex >= 0 ? standings[starsIndex] : null
  const starsDiff = starsRow ? starsRow.GF - starsRow.GA : 0

  const maxStandingsGoals = Math.max(80, ...standings.map((s) => Math.max(s.GF, s.GA)))
  const standingsScaleMax = Math.ceil(maxStandingsGoals / 10) * 10

  const maxPts = Math.max(10, ...skaters.map((s) => s.PTS))
  const skaterScaleMax = Math.ceil(maxPts / 5) * 5
  const skaterMedianPts = median(skaters.map((s) => s.PTS))
  const TRACK_SPAN = 68 // leave 26% on right for direct point + G·A labels

  const maxGaa = Math.max(6, ...goalies.map((g) => g.GAA))
  const goalieScaleMax = Math.ceil(maxGaa)
  const totalGoalieGA = goalies.reduce((sum, g) => sum + Number(g.GA || 0), 0)
  const totalGoalieGaaWeighted =
    goalies.reduce((sum, g) => sum + Number(g.GP || 0), 0) > 0
      ? goalies.reduce((sum, g) => sum + Number(g.GAA || 0) * Number(g.GP || 0), 0) /
        goalies.reduce((sum, g) => sum + Number(g.GP || 0), 0)
      : 0

  const skaterTeamCounts = new Map<string, number>()
  for (const s of skaters) {
    skaterTeamCounts.set(s.team, (skaterTeamCounts.get(s.team) || 0) + 1)
  }
  const orderedTeams = standings.map((s) => s.team).filter((t) => skaterTeamCounts.has(t))
  for (const t of skaterTeamCounts.keys()) {
    if (!orderedTeams.includes(t)) orderedTeams.push(t)
  }

  const macroHtml = `
    <section class="macro" aria-label="Season summary">
      <div class="macro-item">
        <span class="macro-val">${totalGoals}</span>
        <span class="macro-lbl">league goals</span>
        <span class="macro-sub">${leagueGames % 1 === 0 ? leagueGames : leagueGames.toFixed(1)} games · ${goalsPerGame}/gm</span>
      </div>
      <div class="macro-item">
        <span class="macro-val">${leader ? `${leader.PTS} pts` : "—"}</span>
        <span class="macro-lbl">scoring lead</span>
        <span class="macro-sub">${leader ? `#${leader.number} ${esc(leader.first_name)} (${esc(leader.team)})<br>${leader.G}G · ${leader.A}A` : "—"}</span>
      </div>
      <div class="macro-item">
        <span class="macro-val">${starsRow ? ordinal(starsIndex + 1) : "—"}</span>
        <span class="macro-lbl">${esc(FOCUS_TEAM)} standing</span>
        <span class="macro-sub">${starsRow ? `${starsRow.W}–${starsRow.L}–${starsRow.T} · ${starsDiff >= 0 ? `+${starsDiff}` : starsDiff} diff` : "—"}</span>
      </div>
    </section>`

  // Standings ticks: 0, 30, 60, 90 (or multiples of 30 up to scale max)
  const standingsTicks: number[] = []
  for (let v = 0; v <= standingsScaleMax; v += 30) standingsTicks.push(v)
  const standingsAxisTicksHtml = standingsTicks
    .map((v) => `<span class="axis-tick" style="left:${pct(v, standingsScaleMax, 64)}">${v}</span>`)
    .join("")

  const standingsRowsHtml = standings
    .map((row, idx) => {
      const diff = row.GF - row.GA
      const diffLabel = diff > 0 ? `+${diff}` : String(diff)
      const isFocus = row.team === FOCUS_TEAM
      const leftVal = Math.min(row.GF, row.GA)
      const rightVal = Math.max(row.GF, row.GA)
      const stemLeft = pct(leftVal, standingsScaleMax, 64)
      const stemWidth = pct(rightVal - leftVal, standingsScaleMax, 64)
      const gaLeft = pct(row.GA, standingsScaleMax, 64)
      const gfLeft = pct(row.GF, standingsScaleMax, 64)
      const labelLeft = `calc(${pct(rightVal, standingsScaleMax, 64)} + 8px)`
      return `
      <div class="st-row${isFocus ? " is-focus" : ""}">
        <div class="st-meta">
          <span class="rank">${idx + 1}</span>
          <span class="st-team-wrap">
            <span class="st-team">${esc(row.team)}</span>
            <span class="st-rec">${row.W}–${row.L}–${row.T} <span class="muted">(${row.GP}gp)</span></span>
          </span>
          <span class="st-pts">${row.PTS}</span>
        </div>
        <div class="st-plot" aria-label="${esc(row.team)} ${row.GF} goals for, ${row.GA} goals against, diff ${diffLabel}">
          ${standingsTicks.map((v) => `<span class="grid-v" style="left:${pct(v, standingsScaleMax, 64)}"></span>`).join("")}
          <span class="st-stem ${diff >= 0 ? "pos" : "neg"}" style="left:${stemLeft};width:${stemWidth}"></span>
          <span class="dot dot-ga" style="left:${gaLeft}" title="GA ${row.GA}"></span>
          <span class="dot dot-gf" style="left:${gfLeft}" title="GF ${row.GF}"></span>
          <span class="direct-lbl" style="left:${labelLeft}">
            <strong>${diffLabel}</strong> <span class="muted">${row.GF}–${row.GA}</span>
          </span>
        </div>
      </div>`
    })
    .join("\n")

  // Skater reference ticks: 0, 10, 20, 30
  const skaterTicks: number[] = []
  for (let v = 0; v <= skaterScaleMax; v += 10) skaterTicks.push(v)
  const skaterMedianLeft = pct(skaterMedianPts, skaterScaleMax, TRACK_SPAN)

  const skaterFilterButtons = [
    `<button type="button" class="tab is-active" data-filter="all">All (${skaters.length})</button>`,
    ...orderedTeams.map(
      (t) =>
        `<button type="button" class="tab" data-filter="${esc(t)}">${esc(t)} (${skaterTeamCounts.get(t) || 0})</button>`
    ),
  ].join("")

  const skaterRowsHtml = skaters
    .map((s) => {
      const isFocus = s.team === FOCUS_TEAM
      const gWidth = pct(s.G, skaterScaleMax, TRACK_SPAN)
      const aLeft = pct(s.G, skaterScaleMax, TRACK_SPAN)
      const aWidth = pct(s.A, skaterScaleMax, TRACK_SPAN)
      const ptsLeft = pct(s.PTS, skaterScaleMax, TRACK_SPAN)
      const directLeft = `calc(${ptsLeft} + 7px)`
      const ppg = s.GP > 0 ? (s.PTS / s.GP).toFixed(2) : "0.00"
      return `
      <div class="sk-row${isFocus ? " is-focus" : ""}" data-team="${esc(s.team)}" data-rank="${s.rank}" data-pts="${s.PTS}" data-g="${s.G}" data-a="${s.A}" data-ppg="${ppg}">
        <div class="sk-label">
          <span class="rank">${s.rank}</span>
          <span class="sk-who">
            <span class="sk-name-line">
              <span class="sk-name">${esc(s.first_name)}</span>
              <span class="sk-num">#${s.number}</span>
            </span>
            <span class="sk-team">${esc(s.team)}</span>
          </span>
        </div>
        <div class="sk-track" aria-label="${esc(s.first_name)} #${s.number} (${esc(s.team)}): ${s.PTS} points (${s.G} goals, ${s.A} assists) in ${s.GP} games">
          ${skaterTicks.map((v) => `<span class="grid-v" style="left:${pct(v, skaterScaleMax, TRACK_SPAN)}"></span>`).join("")}
          <span class="grid-med" style="left:${skaterMedianLeft}"></span>
          ${s.G > 0 ? `<span class="bar-g" style="left:0;width:${gWidth}"></span>` : ""}
          ${s.A > 0 ? `<span class="bar-a${s.G > 0 ? " has-gap" : ""}" style="left:${aLeft};width:${aWidth}"></span>` : ""}
          <span class="dot dot-pts" style="left:${ptsLeft}"></span>
          <span class="direct-lbl" style="left:${directLeft}">
            <strong class="v-main">${s.PTS}</strong> <span class="v-sub muted">${s.G}·${s.A}</span>
          </span>
        </div>
      </div>`
    })
    .join("\n")

  // Small multiples: per-team scoring distribution across top-40 skaters
  const smallMultiplesHtml = standings
    .map((st) => {
      const teamSkaters = skaters.filter((s) => s.team === st.team)
      const top40Goals = teamSkaters.reduce((sum, s) => sum + s.G, 0)
      const isFocus = st.team === FOCUS_TEAM
      const dotsHtml = teamSkaters
        .map((s) => {
          const left = pct(s.PTS, skaterScaleMax, 92)
          return `<span class="sm-dot" style="left:${left}" title="#${s.number} ${esc(s.first_name)}: ${s.PTS} pts (${s.G}G ${s.A}A)"></span>`
        })
        .join("")
      return `
      <div class="sm-card${isFocus ? " is-focus" : ""}">
        <div class="sm-head">
          <span class="sm-team">${esc(st.team)}</span>
          <span class="sm-meta muted">${teamSkaters.length} in top 40 · ${top40Goals}/${st.GF} GF</span>
        </div>
        <div class="sm-axis" aria-label="${esc(st.team)} top-40 scorer distribution">
          ${skaterTicks.map((v) => `<span class="sm-tick" style="left:${pct(v, skaterScaleMax, 92)}"></span>`).join("")}
          <span class="sm-base"></span>
          ${dotsHtml}
        </div>
        <div class="sm-scale muted">
          <span>0</span>
          <span>${teamSkaters[0] ? `top ${teamSkaters[0].PTS}` : "—"}</span>
        </div>
      </div>`
    })
    .join("\n")

  // Goalies GAA dot-stem plot
  const goalieTicks: number[] = []
  for (let v = 0; v <= goalieScaleMax; v += 2) goalieTicks.push(v)
  const GOALIE_SPAN = 78
  const avgGaaLeft = pct(totalGoalieGaaWeighted, goalieScaleMax, GOALIE_SPAN)

  const goalieRowsHtml = goalies
    .map((g, idx) => {
      const isFocus = g.team === FOCUS_TEAM
      const gaaLeft = pct(g.GAA, goalieScaleMax, GOALIE_SPAN)
      const directLeft = `calc(${gaaLeft} + 7px)`
      return `
      <div class="gl-row${isFocus ? " is-focus" : ""}">
        <div class="gl-label">
          <span class="rank">${idx + 1}</span>
          <span class="gl-who">
            <span class="gl-name">${esc(g.first_name)} <span class="sk-num">#${g.number}</span></span>
            <span class="gl-meta muted">
              <span class="gl-team">${esc(g.team)}</span>
              <span class="gl-sub">${g.GP}gp · ${g.W}–${g.L}–${g.T} · ${g.GA} GA</span>
            </span>
          </span>
        </div>
        <div class="gl-track" aria-label="${esc(g.first_name)} #${g.number} (${esc(g.team)}): ${g.GAA.toFixed(2)} GAA">
          ${goalieTicks.map((v) => `<span class="grid-v" style="left:${pct(v, goalieScaleMax, GOALIE_SPAN)}"></span>`).join("")}
          <span class="grid-med" style="left:${avgGaaLeft}" title="Weighted average ${totalGoalieGaaWeighted.toFixed(2)}"></span>
          <span class="gl-stem" style="left:0;width:${gaaLeft}"></span>
          <span class="dot dot-gl" style="left:${gaaLeft}"></span>
          <span class="direct-lbl" style="left:${directLeft}"><strong>${g.GAA.toFixed(2)}</strong></span>
        </div>
      </div>`
    })
    .join("\n")

  const pulledLabel = formatTorontoTime(pulledAt)
  const sourceLabel = source || "GameSheet, WNMH House League 2026-27, U11"

  const body = `
  <main class="sheet">
    <nav class="crumb muted" aria-label="Private navigation">
      <a href="/">← Drill library</a>
      <span aria-hidden="true">·</span>
      <a href="/admin/">Site stats</a>
    </nav>

    <header class="mast">
      <h1>WNMH U11 House League</h1>
      <p class="subtitle">2026–27 Season · Top 40 skaters, goalies &amp; standings</p>
    </header>

    ${macroHtml}

    <section class="block" aria-labelledby="h-standings">
      <div class="block-head">
        <h2 id="h-standings">Standings &amp; Goal Balance</h2>
        <p class="legend">
          <span class="leg-item"><span class="leg-dot ga"></span>goals against</span>
          <span class="leg-item"><span class="leg-dot gf"></span>goals for</span>
          <span class="leg-item"><span class="leg-line"></span>solid = +diff, dashed = −diff</span>
        </p>
      </div>
      <div class="st-axis-head">
        <div class="st-meta-head muted"><span>Team</span><span>PTS</span></div>
        <div class="st-plot-head muted">${standingsAxisTicksHtml}</div>
      </div>
      <div class="st-list">
        ${standingsRowsHtml}
      </div>
    </section>

    <section class="block" aria-labelledby="h-skaters">
      <div class="block-head">
        <h2 id="h-skaters">Top 40 Skaters · Goals vs. Assists</h2>
        <p class="legend">
          <span class="leg-item"><span class="leg-bar g"></span>goals</span>
          <span class="leg-item"><span class="leg-bar a"></span>assists</span>
          <span class="leg-item"><span class="leg-dot pts"></span>total pts</span>
          <span class="leg-item muted">dashed rule = median (${skaterMedianPts})</span>
        </p>
      </div>

      <div class="controls" aria-label="Filter and sort skaters">
        <div class="control-row" id="team-filters" role="group" aria-label="Team filter">
          ${skaterFilterButtons}
        </div>
        <div class="control-row sort-row" id="skater-sorts" role="group" aria-label="Sort by">
          <span class="sort-lbl muted">Sort:</span>
          <button type="button" class="tab is-active" data-sort="rank">Points</button>
          <button type="button" class="tab" data-sort="g">Goals</button>
          <button type="button" class="tab" data-sort="a">Assists</button>
          <button type="button" class="tab" data-sort="ppg">Pts/GP</button>
        </div>
      </div>

      <div class="sk-axis-head">
        <div class="sk-label-head muted">Skater</div>
        <div class="sk-track-head muted">
          ${skaterTicks.map((v) => `<span class="axis-tick" style="left:${pct(v, skaterScaleMax, TRACK_SPAN)}">${v}</span>`).join("")}
        </div>
      </div>

      <div class="sk-list" id="sk-list">
        ${skaterRowsHtml}
      </div>
    </section>

    <section class="block" aria-labelledby="h-teams">
      <div class="block-head">
        <h2 id="h-teams">Scoring Concentration by Team</h2>
        <p class="legend muted">Each dot is one top-40 skater on a shared 0–${skaterScaleMax} point axis.</p>
      </div>
      <div class="sm-grid">
        ${smallMultiplesHtml}
      </div>
    </section>

    <section class="block" aria-labelledby="h-goalies">
      <div class="block-head">
        <h2 id="h-goalies">Goalies · Goals Against Average</h2>
        <p class="legend muted">
          Ranked by GAA · dashed rule = weighted mean (${totalGoalieGaaWeighted.toFixed(2)}) · ${totalGoalieGA} total GA · 0 shutouts
        </p>
      </div>
      <div class="gl-axis-head">
        <div class="gl-label-head muted">Goalie</div>
        <div class="gl-track-head muted">
          ${goalieTicks.map((v) => `<span class="axis-tick" style="left:${pct(v, goalieScaleMax, GOALIE_SPAN)}">${v}</span>`).join("")}
        </div>
      </div>
      <div class="gl-list">
        ${goalieRowsHtml}
      </div>
    </section>

    <footer class="colophon muted">
      <p>Source: ${esc(sourceLabel)} · Pulled ${esc(pulledLabel)}. Save percentage is omitted because shots on goal are not tracked. Stars game log trails the WNMH site by about one game.</p>
    </footer>
  </main>

  <script>
  (function () {
    var list = document.getElementById("sk-list");
    var filters = document.getElementById("team-filters");
    var sorts = document.getElementById("skater-sorts");
    if (!list || !filters || !sorts) return;
    var rows = Array.prototype.slice.call(list.children);
    var activeTeam = "all";
    var activeSort = "rank";

    function apply() {
      var sorted = rows.slice().sort(function (a, b) {
        if (activeSort === "rank") return Number(a.dataset.rank) - Number(b.dataset.rank);
        var key = activeSort;
        var diff = Number(b.dataset[key]) - Number(a.dataset[key]);
        if (diff !== 0) return diff;
        return Number(a.dataset.rank) - Number(b.dataset.rank);
      });
      sorted.forEach(function (row) {
        var match = activeTeam === "all" || row.dataset.team === activeTeam;
        row.hidden = !match;
        var mainEl = row.querySelector(".v-main");
        var subEl = row.querySelector(".v-sub");
        if (mainEl && subEl) {
          if (activeSort === "ppg") {
            mainEl.textContent = row.dataset.ppg;
            subEl.textContent = row.dataset.pts + "pts";
          } else {
            mainEl.textContent = row.dataset.pts;
            subEl.textContent = row.dataset.g + "·" + row.dataset.a;
          }
        }
        list.appendChild(row);
      });
    }

    filters.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      activeTeam = btn.dataset.filter || "all";
      Array.prototype.forEach.call(filters.querySelectorAll("button"), function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      apply();
    });

    sorts.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-sort]");
      if (!btn) return;
      activeSort = btn.dataset.sort || "rank";
      Array.prototype.forEach.call(sorts.querySelectorAll("button"), function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      apply();
    });
  })();
  </script>`

  return pageShell(body)
}

function renderMissing(message = "No U11 stats snapshot is loaded yet."): string {
  return pageShell(`
  <main class="sheet">
    <nav class="crumb muted"><a href="/">← Drill library</a> · <a href="/admin/">Site stats</a></nav>
    <header class="mast">
      <h1>WNMH U11 House League</h1>
      <p class="subtitle">${esc(message)}</p>
    </header>
  </main>`)
}

function pageShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>WNMH U11 Stats · Hockey Skills &amp; Drills</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #faf8f3;
      --ink: #191c20;
      --muted: #68707a;
      --line: #dedad0;
      --grid: #ebe7dd;
      --g-ink: #b8332a;
      --a-ink: #3a6b88;
      --focus-tint: rgba(184, 51, 42, 0.045);
      --focus-rule: #b8332a;
      --link: #29527a;
      --serif: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #101419;
        --ink: #e8e6df;
        --muted: #8b94a0;
        --line: #27303b;
        --grid: #1c242d;
        --g-ink: #e37266;
        --a-ink: #79aed0;
        --focus-tint: rgba(227, 114, 102, 0.075);
        --focus-rule: #e37266;
        --link: #8bb8de;
      }
    }

    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }

    html { -webkit-text-size-adjust: 100%; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.4;
      font-variant-numeric: tabular-nums;
    }

    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .muted { color: var(--muted); }

    .sheet {
      max-width: 780px;
      margin: 0 auto;
      padding: 14px 14px 40px;
    }

    .crumb {
      display: flex;
      gap: 8px;
      font-size: 12px;
      margin-bottom: 12px;
    }

    .mast h1 {
      font-family: var(--serif);
      font-weight: 400;
      font-size: 1.55rem;
      line-height: 1.18;
      letter-spacing: -0.01em;
      margin: 0;
    }

    .subtitle {
      margin: 3px 0 0;
      font-size: 13px;
      color: var(--muted);
    }

    /* Macro strip */
    .macro {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 16px 0 22px;
      padding: 10px 0;
      border-top: 1px solid var(--ink);
      border-bottom: 1px solid var(--line);
    }

    .macro-item {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .macro-val {
      font-family: var(--serif);
      font-size: 1.25rem;
      line-height: 1.15;
    }

    .macro-lbl {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-top: 2px;
    }

    .macro-sub {
      font-size: 11px;
      line-height: 1.3;
      color: var(--muted);
      margin-top: 2px;
    }

    /* Section headers */
    .block { margin-top: 26px; }

    .block-head { margin-bottom: 8px; }

    .block-head h2 {
      font-family: var(--serif);
      font-weight: 400;
      font-size: 1.12rem;
      margin: 0 0 3px;
    }

    .legend {
      margin: 0;
      font-size: 11.5px;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      align-items: center;
    }

    .leg-item { display: inline-flex; align-items: center; gap: 5px; }
    .leg-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
    .leg-dot.ga { border: 1.5px solid var(--muted); background: var(--bg); }
    .leg-dot.gf { background: var(--g-ink); }
    .leg-dot.pts { background: var(--ink); }
    .leg-bar { display: inline-block; width: 12px; height: 4px; border-radius: 1px; }
    .leg-bar.g { background: var(--g-ink); }
    .leg-bar.a { background: var(--a-ink); }
    .leg-line { display: inline-block; width: 14px; height: 0; border-top: 1.5px solid var(--ink); }

    /* Shared axis helpers */
    .axis-tick {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      font-size: 10.5px;
      line-height: 1;
    }

    .grid-v {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--grid);
      pointer-events: none;
    }

    .grid-med {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 0;
      border-left: 1px dashed var(--muted);
      opacity: 0.55;
      pointer-events: none;
    }

    .rank {
      font-size: 11px;
      color: var(--muted);
      text-align: right;
      width: 16px;
      flex-shrink: 0;
    }

    .dot {
      position: absolute;
      top: 50%;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
    }

    .direct-lbl {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      font-size: 11.5px;
      line-height: 1;
      white-space: nowrap;
    }

    .is-focus {
      background: var(--focus-tint);
      box-shadow: inset 2px 0 0 var(--focus-rule);
    }

    /* Standings */
    .st-axis-head, .st-row {
      display: grid;
      grid-template-columns: 156px 1fr;
      gap: 12px;
      align-items: center;
    }

    .st-axis-head {
      padding: 4px 0;
      border-bottom: 1px solid var(--line);
      font-size: 10.5px;
    }

    .st-meta-head {
      display: flex;
      justify-content: space-between;
      padding-left: 22px;
      padding-right: 4px;
    }

    .st-plot-head, .sk-track-head, .gl-track-head {
      position: relative;
      height: 13px;
    }

    .st-row {
      padding: 5px 0;
      border-bottom: 1px solid var(--line);
    }

    .st-meta {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding-left: 2px;
      padding-right: 4px;
    }

    .st-team-wrap {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .st-team { font-weight: 500; font-size: 13px; line-height: 1.15; }
    .st-rec { font-size: 11px; color: var(--muted); }
    .st-pts { font-weight: 600; font-size: 13px; min-width: 20px; text-align: right; }

    .st-plot {
      position: relative;
      height: 24px;
    }

    .st-stem {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      height: 0;
    }
    .st-stem.pos { border-top: 2px solid var(--ink); }
    .st-stem.neg { border-top: 1.5px dashed var(--muted); }

    .dot-ga {
      width: 7px;
      height: 7px;
      border: 1.5px solid var(--muted);
      background: var(--bg);
      z-index: 1;
    }

    .dot-gf {
      width: 7px;
      height: 7px;
      background: var(--g-ink);
      z-index: 2;
    }

    /* Controls */
    .controls {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 10px 0 8px;
    }

    .control-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      align-items: baseline;
    }

    .sort-lbl { font-size: 11.5px; }

    .tab {
      appearance: none;
      background: none;
      border: 0;
      border-bottom: 1.5px solid transparent;
      padding: 2px 0;
      margin: 0;
      font: inherit;
      font-size: 12px;
      color: var(--muted);
      cursor: pointer;
    }

    .tab:hover { color: var(--ink); }
    .tab.is-active {
      color: var(--ink);
      font-weight: 600;
      border-bottom-color: var(--g-ink);
    }

    /* Skaters */
    .sk-axis-head, .sk-row {
      display: grid;
      grid-template-columns: 148px 1fr;
      gap: 8px;
      align-items: center;
    }

    .sk-axis-head {
      padding: 4px 0;
      border-bottom: 1px solid var(--line);
      font-size: 10.5px;
    }

    .sk-label-head { padding-left: 22px; }

    .sk-row {
      padding: 4.5px 0;
      border-bottom: 1px solid var(--grid);
    }

    .sk-label {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      padding-left: 2px;
    }

    .sk-who {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
      min-width: 0;
      flex: 1;
      overflow: hidden;
      line-height: 1.2;
    }

    .sk-name-line {
      display: inline-flex;
      align-items: baseline;
      gap: 3px;
      min-width: 0;
      max-width: 100%;
    }

    .sk-name {
      font-size: 12.5px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sk-num { font-size: 10.5px; color: var(--muted); flex-shrink: 0; }
    .sk-team {
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .sk-track {
      position: relative;
      height: 18px;
    }

    .bar-g {
      position: absolute;
      top: 50%;
      height: 4px;
      transform: translateY(-50%);
      background: var(--g-ink);
      border-radius: 2px 0 0 2px;
    }

    .bar-a {
      position: absolute;
      top: 50%;
      height: 4px;
      transform: translateY(-50%);
      background: var(--a-ink);
    }

    .bar-a.has-gap {
      box-shadow: inset 1.5px 0 0 var(--bg);
    }

    .dot-pts {
      width: 6.5px;
      height: 6.5px;
      background: var(--ink);
      z-index: 2;
    }

    /* Small multiples */
    .sm-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 14px;
      margin-top: 8px;
    }

    .sm-card {
      border-top: 1px solid var(--line);
      padding: 6px 4px 2px;
    }

    .sm-head {
      display: flex;
      flex-direction: column;
      margin-bottom: 6px;
    }

    .sm-team { font-size: 12.5px; font-weight: 500; }
    .sm-meta { font-size: 10.5px; }

    .sm-axis {
      position: relative;
      height: 14px;
    }

    .sm-base {
      position: absolute;
      left: 0;
      right: 8%;
      top: 50%;
      height: 1px;
      background: var(--line);
    }

    .sm-tick {
      position: absolute;
      top: 3px;
      bottom: 3px;
      width: 1px;
      background: var(--grid);
    }

    .sm-dot {
      position: absolute;
      top: 50%;
      width: 5.5px;
      height: 5.5px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background: var(--g-ink);
      opacity: 0.85;
    }

    .sm-scale {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      padding-right: 8%;
    }

    /* Goalies */
    .gl-axis-head, .gl-row {
      display: grid;
      grid-template-columns: 165px 1fr;
      gap: 8px;
      align-items: center;
    }

    .gl-axis-head {
      padding: 4px 0;
      border-bottom: 1px solid var(--line);
      font-size: 10.5px;
    }

    .gl-label-head { padding-left: 22px; }

    .gl-row {
      padding: 5px 0;
      border-bottom: 1px solid var(--grid);
    }

    .gl-label {
      display: flex;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
      padding-left: 2px;
    }

    .gl-who { display: flex; flex-direction: column; min-width: 0; }
    .gl-name { font-size: 12.5px; font-weight: 500; }
    .gl-meta { display: flex; flex-direction: column; line-height: 1.25; }
    .gl-team { font-size: 10px; }
    .gl-sub { font-size: 10.5px; white-space: nowrap; }

    .gl-track {
      position: relative;
      height: 22px;
    }

    .gl-stem {
      position: absolute;
      top: 50%;
      height: 1.5px;
      transform: translateY(-50%);
      background: var(--a-ink);
    }

    .dot-gl {
      width: 7px;
      height: 7px;
      background: var(--ink);
    }

    .colophon {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      font-size: 11.5px;
      line-height: 1.45;
    }

    .colophon p { margin: 0; }

    @media (min-width: 600px) {
      .sheet { padding: 24px 24px 56px; }
      .st-axis-head, .st-row { grid-template-columns: 220px 1fr; gap: 16px; }
      .st-team-wrap { flex-direction: row; align-items: baseline; gap: 8px; }
      .sk-axis-head, .sk-row { grid-template-columns: 205px 1fr; gap: 16px; }
      .gl-axis-head, .gl-row { grid-template-columns: 225px 1fr; gap: 16px; }
      .sm-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }

    /* Desktop: bump type a few ticks. Phone typography is unchanged. */
    @media (min-width: 700px) {
      body { font-size: 17px; }
      .sheet { max-width: 960px; padding: 32px 36px 80px; }
      .crumb { font-size: 15px; margin-bottom: 16px; }
      .mast h1 { font-size: 2rem; }
      .subtitle { font-size: 16px; }
      .macro { gap: 16px; margin: 22px 0 28px; padding: 14px 0; }
      .macro-val { font-size: 1.65rem; }
      .macro-lbl, .macro-sub { font-size: 13px; }
      .block { margin-top: 36px; }
      .block-head h2 { font-size: 1.4rem; }
      .legend { font-size: 14px; }
      .axis-tick { font-size: 13px; }
      .rank { font-size: 13px; width: 20px; }
      .direct-lbl { font-size: 14px; }
      .st-axis-head, .sk-axis-head, .gl-axis-head { font-size: 13px; }
      .st-axis-head, .st-row { grid-template-columns: 280px 1fr; gap: 20px; }
      .st-team { font-size: 16px; }
      .st-rec { font-size: 13px; }
      .st-pts { font-size: 16px; min-width: 26px; }
      .st-plot { height: 28px; }
      .sort-lbl { font-size: 14px; }
      .tab { font-size: 15px; }
      .sk-axis-head, .sk-row { grid-template-columns: 280px 1fr; gap: 20px; }
      .sk-who { flex-direction: row; align-items: baseline; gap: 8px; }
      .sk-name { font-size: 15px; }
      .sk-num { font-size: 13px; }
      .sk-team { font-size: 13px; flex-shrink: 0; }
      .sk-row { padding: 6px 0; }
      .sk-track { height: 22px; }
      .sm-team { font-size: 15px; }
      .sm-meta { font-size: 13px; }
      .sm-scale { font-size: 12px; }
      .gl-axis-head, .gl-row { grid-template-columns: 280px 1fr; gap: 20px; }
      .gl-name { font-size: 15px; }
      .gl-meta { flex-direction: row; flex-wrap: wrap; }
      .gl-team { font-size: 13px; }
      .gl-team::after { content: " · "; }
      .gl-sub { font-size: 13px; }
      .gl-track { height: 26px; }
      .colophon { font-size: 14px; margin-top: 36px; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>
`
}

function formatTorontoTime(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-CA", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
