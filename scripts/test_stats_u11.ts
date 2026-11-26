import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import adminHandler from "../api/admin.js"
import {
  handleU11SelectStats,
  handleU11Stats,
  renderU11StatsPage,
  U11_SELECT_CONFIG,
  type LeagueStatsRecord,
} from "../lib/stats-u11.js"

function openStats(html: string): JSDOM {
  return new JSDOM(html, {
    url: "https://hockey.derekbraid.com/stats/u11",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  })
}

function focusedTeams(dom: JSDOM, selector: string): string[] {
  return [...dom.window.document.querySelectorAll(`${selector}.is-focus`)].map(
    (el) => el.getAttribute("data-team") || ""
  )
}

function standingsRow(dom: JSDOM, team: string): HTMLElement {
  const row = dom.window.document.querySelector(`.st-row[data-team="${team}"]`)
  assert.ok(row, `missing standings row for ${team}`)
  return row as HTMLElement
}

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
  assert.doesNotMatch(selectHtml, /otp/i)

  // Goalie numeric coercion, omitted jersey numbers, and optional team roster.
  const selectFilled: LeagueStatsRecord = {
    source: "GameSheet, OMHA Exhibition Select 2026-27, U11",
    pulledAt: "2026-11-26T00:27:00.000Z",
    payload: {
      focus_team: "West Niagara Flying Aces U11",
      skaters: [
        { rank: 1, number: 16, first_name: "SkaterTop", team: "WSMHA U11 Select", GP: 4, G: 5, A: 2, PTS: 7, PIM: 2, PPG: 0, SHG: 0, GWG: 1 },
        { rank: 24, number: null, first_name: "SkaterBlank", team: "Quinte West", GP: 1, G: 2, A: 1, PTS: 3, PIM: 0, PPG: 0, SHG: 0, GWG: 1 },
      ],
      team_skaters: [
        { rank: 4, number: 93, first_name: "SkaterAce", team: "West Niagara Flying Aces U11", GP: 3, G: 4, A: 1, PTS: 5, PIM: 0, PPG: 0, SHG: 1, GWG: 1 },
      ],
      goalies: [
        {
          number: 5,
          first_name: "GoalieAce",
          team: "West Niagara Flying Aces U11",
          GP: "1" as unknown as number,
          GA: "1" as unknown as number,
          GAA: "2.19" as unknown as number,
          W: "0" as unknown as number,
          L: "0" as unknown as number,
          T: "0" as unknown as number,
          SO: "0" as unknown as number,
        },
      ],
      standings: [
        { team: "WSMHA U11 Select", GP: 4, W: 3, L: 1, T: 0, PTS: 6, GF: 22, GA: 7 },
        { team: "West Niagara Flying Aces U11", GP: 3, W: 1, L: 2, T: 0, PTS: 2, GF: 10, GA: 18 },
      ],
    },
  }
  const filledHtml = renderU11StatsPage(selectFilled, U11_SELECT_CONFIG)
  assert.match(filledHtml, /GoalieAce/)
  assert.match(filledHtml, /2\.19/)
  assert.match(filledHtml, /SkaterBlank/)
  assert.doesNotMatch(filledHtml, /#null/)
  assert.match(filledHtml, /id="h-roster"/)
  assert.match(filledHtml, /SkaterAce/)
  assert.doesNotMatch(filledHtml, /SV%/)
  assert.doesNotMatch(filledHtml, /otp/i)

  // Standings rows are buttons; default highlight is the focus team (Stars / West Niagara).
  assert.match(html, /cursor: pointer/)
  assert.match(html, /id="st-list"/)
  const houseDom = openStats(html)
  const starsRow = standingsRow(houseDom, "Stars")
  const mustangsRow = standingsRow(houseDom, "Mustangs")
  assert.equal(starsRow.getAttribute("role"), "button")
  assert.equal(starsRow.getAttribute("tabindex"), "0")
  assert.equal(starsRow.getAttribute("aria-pressed"), "true")
  assert.equal(mustangsRow.getAttribute("role"), "button")
  assert.equal(mustangsRow.getAttribute("tabindex"), "0")
  assert.equal(mustangsRow.getAttribute("aria-pressed"), "false")
  assert.deepEqual(focusedTeams(houseDom, ".st-row"), ["Stars"])
  assert.deepEqual(focusedTeams(houseDom, "#sk-list .sk-row"), ["Stars"])
  assert.deepEqual(focusedTeams(houseDom, ".gl-row"), ["Stars"])
  assert.deepEqual(focusedTeams(houseDom, ".sm-card"), ["Stars"])

  mustangsRow.click()
  assert.deepEqual(focusedTeams(houseDom, ".st-row"), ["Mustangs"])
  assert.deepEqual(focusedTeams(houseDom, "#sk-list .sk-row"), ["Mustangs"])
  assert.deepEqual(focusedTeams(houseDom, ".gl-row"), ["Mustangs"])
  assert.deepEqual(focusedTeams(houseDom, ".sm-card"), ["Mustangs"])
  assert.equal(starsRow.getAttribute("aria-pressed"), "false")
  assert.equal(mustangsRow.getAttribute("aria-pressed"), "true")

  // Filter and sort stay independent of the standings highlight.
  const mustangFilter = houseDom.window.document.querySelector('#team-filters button[data-filter="Mustangs"]') as HTMLButtonElement
  const allFilter = houseDom.window.document.querySelector('#team-filters button[data-filter="all"]') as HTMLButtonElement
  const goalsSort = houseDom.window.document.querySelector('#skater-sorts button[data-sort="g"]') as HTMLButtonElement
  const pointsSort = houseDom.window.document.querySelector('#skater-sorts button[data-sort="rank"]') as HTMLButtonElement
  assert.ok(mustangFilter && allFilter && goalsSort && pointsSort)
  mustangFilter.click()
  const visibleAfterFilter = [...houseDom.window.document.querySelectorAll("#sk-list .sk-row")].filter((el) => !(el as HTMLElement).hidden)
  assert.deepEqual(visibleAfterFilter.map((el) => el.getAttribute("data-team")), ["Mustangs"])
  assert.deepEqual(focusedTeams(houseDom, "#sk-list .sk-row"), ["Mustangs"])
  allFilter.click()
  goalsSort.click()
  assert.deepEqual(focusedTeams(houseDom, ".st-row"), ["Mustangs"])
  assert.deepEqual(focusedTeams(houseDom, "#sk-list .sk-row"), ["Mustangs"])
  pointsSort.click()

  // Clicking the highlighted row again resets to Stars.
  mustangsRow.click()
  assert.deepEqual(focusedTeams(houseDom, ".st-row"), ["Stars"])
  assert.deepEqual(focusedTeams(houseDom, "#sk-list .sk-row"), ["Stars"])
  assert.deepEqual(focusedTeams(houseDom, ".gl-row"), ["Stars"])
  assert.equal(starsRow.getAttribute("aria-pressed"), "true")
  assert.equal(mustangsRow.getAttribute("aria-pressed"), "false")

  // Enter and Space also switch the highlight.
  const falconsRow = standingsRow(houseDom, "Falcons")
  falconsRow.dispatchEvent(new houseDom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  assert.deepEqual(focusedTeams(houseDom, ".st-row"), ["Falcons"])
  assert.deepEqual(focusedTeams(houseDom, "#sk-list .sk-row"), ["Falcons"])
  falconsRow.dispatchEvent(new houseDom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }))
  assert.deepEqual(focusedTeams(houseDom, ".st-row"), ["Stars"])
  houseDom.window.close()

  const selectDom = openStats(selectHtml)
  const acesRow = standingsRow(selectDom, "West Niagara Flying Aces U11")
  const wsmhaRow = standingsRow(selectDom, "WSMHA U11 Select")
  assert.equal(acesRow.getAttribute("aria-pressed"), "true")
  assert.deepEqual(focusedTeams(selectDom, ".st-row"), ["West Niagara Flying Aces U11"])
  assert.deepEqual(focusedTeams(selectDom, "#sk-list .sk-row"), ["West Niagara Flying Aces U11"])
  wsmhaRow.click()
  assert.deepEqual(focusedTeams(selectDom, ".st-row"), ["WSMHA U11 Select"])
  assert.deepEqual(focusedTeams(selectDom, "#sk-list .sk-row"), ["WSMHA U11 Select"])
  wsmhaRow.click()
  assert.deepEqual(focusedTeams(selectDom, ".st-row"), ["West Niagara Flying Aces U11"])
  selectDom.window.close()

  console.log("stats u11 ok")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
