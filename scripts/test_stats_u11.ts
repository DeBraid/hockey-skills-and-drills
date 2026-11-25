import assert from "node:assert/strict"
import adminHandler from "../api/admin.js"
import { handleU11Stats, renderU11StatsPage, type LeagueStatsRecord } from "../lib/stats-u11.js"

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

async function main(): Promise<void> {
  process.env.ADMIN_EMAILS = "coach@example.com"
  delete process.env.AUTH_SECRET

  // Logged-out GET /stats/u11 via admin dispatch and direct handler must return 404.
  const loggedOutViaAdmin = await adminHandler.fetch(new Request("https://hockey.derekbraid.com/api/admin?__admin=u11"))
  assert.equal(loggedOutViaAdmin.status, 404)
  assert.equal(loggedOutViaAdmin.headers.get("x-robots-tag"), "noindex, nofollow")

  const loggedOutDirect = await handleU11Stats(new Request("https://hockey.derekbraid.com/stats/u11"))
  assert.equal(loggedOutDirect.status, 404)

  // Non-admin user must receive 404.
  const nonAdmin = await handleU11Stats(new Request("https://hockey.derekbraid.com/stats/u11"), {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Other Coach",
    email: "other@example.com",
    image: "",
  })
  assert.equal(nonAdmin.status, 404)

  // POST method must receive 404 even with an admin user.
  const postAttempt = await handleU11Stats(
    new Request("https://hockey.derekbraid.com/stats/u11", { method: "POST" }),
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Derek",
      email: "coach@example.com",
      image: "",
    }
  )
  assert.equal(postAttempt.status, 404)

  // Empty ADMIN_EMAILS denies everyone.
  process.env.ADMIN_EMAILS = ""
  const noAdmins = await handleU11Stats(new Request("https://hockey.derekbraid.com/stats/u11"), {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Derek",
    email: "coach@example.com",
    image: "",
  })
  assert.equal(noAdmins.status, 404)

  // Rendered HTML includes key sections, noindex meta, Toronto timestamp, and omits SV%.
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

  console.log("stats u11 ok")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
