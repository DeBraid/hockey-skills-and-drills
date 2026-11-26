import assert from "node:assert/strict"
import adminHandler from "../api/admin.js"
import {
  handleU11SelectStats,
  handleU11Stats,
  renderU11StatsPage,
  U11_SELECT_CONFIG,
  type LeagueStatsRecord,
} from "../lib/stats-u11.js"

const SAMPLE: LeagueStatsRecord = {
  source: "GameSheet, Sample League 2026-27, U11",
  pulledAt: "2026-11-25T20:27:44.000Z",
  payload: {
    skaters: [
      { rank: 1, number: 91, first_name: "SkaterOne", team: "Stars", GP: 10, G: 18, A: 8, PTS: 26, PIM: 2, PPG: 1, SHG: 1, GWG: 1 },
      { rank: 2, number: 88, first_name: "SkaterTwo", team: "Mustangs", GP: 10, G: 10, A: 12, PTS: 22, PIM: 0, PPG: 0, SHG: 0, GWG: 0 },
      { rank: 3, number: 77, first_name: "SkaterThree", team: "Falcons", GP: 9, G: 0, A: 7, PTS: 7, PIM: 4, PPG: 0, SHG: 0, GWG: 0 },
    ],
    goalies: [
      { number: 30, first_name: "GoalieAlpha", team: "Stars", GP: 5, GA: 12, GAA: 2.4, W: 4, L: 1, T: 0, SO: 0 },
      { number: 31, first_name: "GoalieBeta", team: "Mustangs", GP: 5, GA: 19, GAA: 3.8, W: 3, L: 2, T: 0, SO: 0 },
    ],
    standings: [
      { team: "Stars", GP: 10, W: 8, L: 2, T: 0, PTS: 16, GF: 55, GA: 30 },
      { team: "Mustangs", GP: 10, W: 7, L: 2, T: 1, PTS: 15, GF: 42, GA: 31 },
      { team: "Falcons", GP: 10, W: 2, L: 7, T: 1, PTS: 5, GF: 21, GA: 48 },
    ],
  },
}

const SELECT_SAMPLE: LeagueStatsRecord = {
  source: "GameSheet, OMHA Exhibition Select 2026-27, U11",
  pulledAt: "2026-11-26T00:15:00.000Z",
  payload: {
    focus_team: "West Niagara Flying Aces U11",
    skaters: [
      { rank: 1, number: 16, first_name: "SkaterTop", team: "WSMHA U11 Select", GP: 4, G: 5, A: 2, PTS: 7, PIM: 2, PPG: 0, SHG: 0, GWG: 1 },
      { rank: 4, number: 93, first_name: "SkaterAce", team: "West Niagara Flying Aces U11", GP: 3, G: 4, A: 1, PTS: 5, PIM: 0, PPG: 0, SHG: 1, GWG: 1 },
    ],
    goalies: [],
    standings: [
      { team: "WSMHA U11 Select", GP: 4, W: 3, L: 1, T: 0, PTS: 6, GF: 22, GA: 7 },
      { team: "West Niagara Flying Aces U11", GP: 3, W: 1, L: 2, T: 0, PTS: 2, GF: 10, GA: 18 },
    ],
  },
}

async function main(): Promise<void> {
  process.env.ADMIN_EMAILS = "coach@example.com"
  delete process.env.AUTH_SECRET

  // Logged-out GET /stats/u11 and /stats/u11-select via admin dispatch and direct handlers must return 404.
  for (const view of ["u11", "u11-select"]) {
    const loggedOutViaAdmin = await adminHandler.fetch(new Request(`https://hockey.derekbraid.com/api/admin?__admin=${view}`))
    assert.equal(loggedOutViaAdmin.status, 404)
    assert.equal(loggedOutViaAdmin.headers.get("x-robots-tag"), "noindex, nofollow")
  }

  const loggedOutDirect = await handleU11Stats(new Request("https://hockey.derekbraid.com/stats/u11"))
  assert.equal(loggedOutDirect.status, 404)

  const loggedOutSelectDirect = await handleU11SelectStats(new Request("https://hockey.derekbraid.com/stats/u11-select"))
  assert.equal(loggedOutSelectDirect.status, 404)

  // Non-admin user must receive 404 on both routes.
  const otherUser = {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Other Coach",
    email: "other@example.com",
    image: "",
  }
  assert.equal((await handleU11Stats(new Request("https://hockey.derekbraid.com/stats/u11"), otherUser)).status, 404)
  assert.equal(
    (await handleU11SelectStats(new Request("https://hockey.derekbraid.com/stats/u11-select"), otherUser)).status,
    404
  )

  // POST method must receive 404 even with an admin user.
  const adminUser = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Derek",
    email: "coach@example.com",
    image: "",
  }
  assert.equal(
    (await handleU11Stats(new Request("https://hockey.derekbraid.com/stats/u11", { method: "POST" }), adminUser)).status,
    404
  )
  assert.equal(
    (await handleU11SelectStats(new Request("https://hockey.derekbraid.com/stats/u11-select", { method: "POST" }), adminUser))
      .status,
    404
  )

  // Empty ADMIN_EMAILS denies everyone.
  process.env.ADMIN_EMAILS = ""
  assert.equal((await handleU11Stats(new Request("https://hockey.derekbraid.com/stats/u11"), adminUser)).status, 404)
  assert.equal(
    (await handleU11SelectStats(new Request("https://hockey.derekbraid.com/stats/u11-select"), adminUser)).status,
    404
  )

  // Rendered HTML for House includes key sections, noindex meta, Toronto timestamp, and omits SV%.
  const html = renderU11StatsPage(SAMPLE)
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/)
  assert.match(html, /Standings &amp; Goal Balance/)
  assert.match(html, /Top 40 Skaters/)
  assert.match(html, /Goalies/)
  assert.match(html, /SkaterOne/)
  assert.match(html, /GoalieAlpha/)
  assert.match(html, /2\.40/)
  assert.match(html, /Nov 25, 2026/)
  assert.match(html, /3:27/)
  assert.doesNotMatch(html, /SV%/)
  assert.doesNotMatch(html, /\b\d+pp\b/)
  assert.doesNotMatch(html, /\b\d+sh\b/)
  assert.doesNotMatch(html, /\b\d+gw\b/)
  assert.doesNotMatch(html, /GWG|SHG|PPG/)
  assert.match(html, /Stars/)
  assert.match(html, /Mustangs/)
  assert.match(html, /Falcons/)
  assert.doesNotMatch(html, /\bSTA\b/)
  assert.doesNotMatch(html, /\bMUS\b/)
  assert.doesNotMatch(html, /\bFAL\b/)
  assert.match(html, /@media \(min-width: 700px\)/)
  assert.match(html, /body \{ font-size: 17px; \}/)

  // Rendered HTML for Select includes West Niagara focus, empty goalies fallback, and noindex.
  const selectHtml = renderU11StatsPage(SELECT_SAMPLE, U11_SELECT_CONFIG)
  assert.match(selectHtml, /<meta name="robots" content="noindex, nofollow">/)
  assert.match(selectHtml, /U11 Select · West Niagara Flying Aces/)
  assert.match(selectHtml, /West Niagara Flying Aces U11/)
  assert.match(selectHtml, /SkaterAce/)
  assert.match(selectHtml, /No goalie stats loaded yet/)
  assert.match(selectHtml, /7 team-gp/)

  console.log("stats u11 ok")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
