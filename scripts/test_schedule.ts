import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"
import type { Player } from "../lib/lineups.js"
import { renderEditor } from "../lib/lineup-pages.js"
import {
  clearScheduleCache,
  parseGames,
  resolveTeamScheduleUrl,
  scheduleUrl,
  TEAM_SCHEDULE_FEEDS,
  upcomingGames,
} from "../lib/schedule.js"
import {
  AS_OF_NOV_9,
  CANCEL_WORD_ICS,
  SELECT_CANCELLED_ICS,
  SELECT_FEED,
  SELECT_ICS,
  SELECT_PAST_ICS,
  STARS_FEED,
  STARS_ICS,
} from "./schedule_fixtures.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const viewer = { id: "123e4567-e89b-42d3-a456-426614174000", name: "Coach", email: "coach@example.com", image: "" }
const skater: Player = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 12,
  firstName: "Skater",
  lastInitial: "A",
  goalie: false,
  active: true,
  preferred: "",
  practiceNumber: null,
  position: "",
}

function ensureDatabase(): void {
  if (process.env.DATABASE_URL) return
  const role = execSync(`sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='ubuntu'"`, { encoding: "utf8" }).trim()
  if (role !== "1") execSync("sudo -u postgres createuser -s ubuntu")
  const db = execSync(`sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='hsd_test'"`, { encoding: "utf8" }).trim()
  if (db !== "1") execSync("sudo -u postgres createdb -O ubuntu hsd_test")
  process.env.DATABASE_URL = "postgres://ubuntu@/hsd_test?host=/var/run/postgresql"
}

function labels(ics: string, now = AS_OF_NOV_9): string[] {
  const cutoff = now - 60 * 60 * 1000
  return parseGames(ics)
    .filter((game) => Date.parse(game.start) >= cutoff)
    .slice(0, 6)
    .map((game) => game.label)
}

async function withFeeds(run: (calls: string[]) => Promise<void>): Promise<void> {
  const calls: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    if (url.includes("IDs=2897")) return new Response(SELECT_ICS, { status: 200 })
    if (url.includes("IDs=2945")) return new Response(STARS_ICS, { status: 200 })
    if (url.endsWith("/down.ics")) return new Response("no", { status: 503 })
    if (url.endsWith("/past.ics")) return new Response(SELECT_PAST_ICS, { status: 200 })
    return realFetch(input, init)
  }) as typeof fetch
  clearScheduleCache()
  try {
    await run(calls)
  } finally {
    globalThis.fetch = realFetch
    clearScheduleCache()
  }
}

function openEditor(html: string): { dom: JSDOM; posts: { url: string; title: string }[] } {
  const posts: { url: string; title: string }[] = []
  const stripped = html.replace(/<script\b[^>]*><\/script>/g, "")
  const dom = new JSDOM(stripped, { url: "https://hockey.derekbraid.com/lineups/team/select/new/", runScripts: "outside-only" })
  dom.window.fetch = (async (url: string, init?: { body?: string }) => {
    posts.push({ url: String(url), title: JSON.parse(init?.body || "{}").title })
    return {
      ok: true,
      status: 201,
      json: async () => ({ lineup: { id: "22222222-2222-4222-8222-222222222222", shareToken: null } }),
    }
  }) as typeof fetch
  dom.window.eval(fs.readFileSync(path.join(root, "js/lineups.js"), "utf8"))
  return { dom, posts }
}

async function main(): Promise<void> {
  assert.equal(scheduleUrl(undefined), STARS_FEED)
  assert.equal(scheduleUrl(null), null)
  assert.equal(scheduleUrl(""), null)
  assert.equal(scheduleUrl("http://westniagaraminorhockey.ca/webcal.ashx?IDs=2897"), null)
  assert.equal(scheduleUrl("webcal://westniagaraminorhockey.ca/webcal.ashx?IDs=2897"), SELECT_FEED)
  assert.equal(resolveTeamScheduleUrl("select", null), SELECT_FEED)
  assert.equal(resolveTeamScheduleUrl("select", ""), SELECT_FEED)
  assert.equal(resolveTeamScheduleUrl("select", "https://example.com/custom.ics"), "https://example.com/custom.ics")
  assert.equal(resolveTeamScheduleUrl("select", "http://example.com/custom.ics"), null)
  assert.equal(resolveTeamScheduleUrl("stars", null), null)
  assert.equal(resolveTeamScheduleUrl("stars", STARS_FEED), STARS_FEED)
  assert.equal(TEAM_SCHEDULE_FEEDS.select, SELECT_FEED)
  assert.equal(Object.hasOwn(TEAM_SCHEDULE_FEEDS, "stars"), false)

  const selectAll = parseGames(SELECT_ICS)
  assert.deepEqual(
    selectAll.slice(0, 4).map((game) => game.label),
    [
      "Sat Oct 24 3:00 PM @ Waterloo, Moses Springer Arena",
      "Sun Nov 8 1:45 PM vs WATERLOO WOLVES, Grimsby Peach King Center East Pad",
      "Sat Nov 14 7:15 PM vs Mount Hamilton, Fleming Memorial Arena",
      "Sun Nov 15 5:30 PM vs Jordan Lions, Grimsby Peach King Center East Pad",
    ]
  )
  assert.equal(selectAll.some((game) => /Practice|cancel|Jordan {2}/i.test(game.label)), false)
  assert.deepEqual(labels(SELECT_ICS), [
    "Sat Nov 14 7:15 PM vs Mount Hamilton, Fleming Memorial Arena",
    "Sun Nov 15 5:30 PM vs Jordan Lions, Grimsby Peach King Center East Pad",
    "Sun Nov 29 3:00 PM @ Mount Hamilton, Dave Anderchuck Arena",
    "Wed Dec 2 7:00 PM @ CYO, Merritton Centennial Arena",
    "Sun Dec 20 4:15 PM vs CYO, Grimsby Peach King Center East Pad",
    "Sat Jan 2 7:30 PM vs Jordan Lions, Jordan Arena",
  ])
  assert.equal(labels(SELECT_ICS).some((label) => label.includes("Burlington")), false)
  assert.deepEqual(parseGames(SELECT_CANCELLED_ICS), [])
  assert.deepEqual(parseGames(CANCEL_WORD_ICS), [])

  const starsAll = parseGames(STARS_ICS)
  assert.equal(starsAll[0].label, "Fri Oct 23 6:15 PM vs Mustangs [U11-R9](W 3-6), Fleming Memorial Arena")
  assert.deepEqual(labels(STARS_ICS), [
    "Mon Nov 9 6:00 PM @ Hurricanes, Grimsby Peach King Center East Pad",
    "Fri Nov 13 6:00 PM vs Falcons, Fleming Memorial Arena",
    "Thu Dec 3 6:00 PM vs Lightning, Fleming Memorial Arena",
    "Mon Dec 21 6:00 PM vs Spitfires, West Lincoln Arena",
  ])
  const during = Date.parse("2026-11-09T23:30:00.000Z")
  const after = Date.parse("2026-11-10T01:00:00.000Z")
  assert.equal(labels(STARS_ICS, during)[0], "Mon Nov 9 6:00 PM @ Hurricanes, Grimsby Peach King Center East Pad")
  assert.equal(labels(STARS_ICS, after).includes("Mon Nov 9 6:00 PM @ Hurricanes, Grimsby Peach King Center East Pad"), false)
  assert.equal(labels(STARS_ICS, Date.parse("2028-01-01T00:00:00.000Z")).length, 0)

  await withFeeds(async (calls) => {
    const selectGames = await upcomingGames(SELECT_FEED, 6, AS_OF_NOV_9)
    const starsGames = await upcomingGames(STARS_FEED, 6, AS_OF_NOV_9)
    assert.deepEqual(selectGames.map((game) => game.label), labels(SELECT_ICS))
    assert.deepEqual(starsGames.map((game) => game.label), labels(STARS_ICS))
    assert.equal(selectGames.some((game) => game.label.includes("Hurricanes")), false)
    assert.equal(starsGames.some((game) => game.label.includes("Mount Hamilton")), false)
    assert.deepEqual(await upcomingGames(null), [])
    assert.equal(calls.some((url) => url.includes("IDs=2945") && url.includes("IDs=2897")), false)
    const again = await upcomingGames(SELECT_FEED, 6, AS_OF_NOV_9)
    assert.equal(again[0].label, selectGames[0].label)
    assert.equal(calls.filter((url) => url.includes("IDs=2897")).length, 1)
    assert.deepEqual(await upcomingGames("https://feeds.test/down.ics", 6, AS_OF_NOV_9), [])
    assert.deepEqual(await upcomingGames("https://feeds.test/past.ics", 6, AS_OF_NOV_9), [])
  })

  const selectGames = parseGames(SELECT_ICS).filter((game) => Date.parse(game.start) >= AS_OF_NOV_9 - 60 * 60 * 1000).slice(0, 6)
  const starsGames = parseGames(STARS_ICS).filter((game) => Date.parse(game.start) >= AS_OF_NOV_9 - 60 * 60 * 1000).slice(0, 6)
  const selectTeam = { id: "select", name: "U11 Select", scheduleUrl: SELECT_FEED, ageGroup: "U11", season: "2026-27" }
  const starsTeam = { id: "stars", name: "U11 Stars", scheduleUrl: STARS_FEED, ageGroup: "U11", season: "2026-27" }
  const selectHtml = renderEditor(selectTeam, null, [skater], viewer, selectGames)
  const starsHtml = renderEditor(starsTeam, null, [skater], viewer, starsGames)
  assert.match(selectHtml, /data-team="select"/)
  assert.match(starsHtml, /data-team="stars"/)
  assert.match(selectHtml, /id="lu-game"/)
  assert.match(starsHtml, /id="lu-game"/)
  assert.match(selectHtml, /Sat Nov 14 7:15 PM vs Mount Hamilton, Fleming Memorial Arena/)
  assert.doesNotMatch(selectHtml, /Hurricanes/)
  assert.match(starsHtml, /Mon Nov 9 6:00 PM @ Hurricanes, Grimsby Peach King Center East Pad/)
  assert.doesNotMatch(starsHtml, /Mount Hamilton/)
  assert.match(selectHtml, /value="Sat Nov 14 7:15 PM vs Mount Hamilton, Fleming Memorial Arena"/)
  assert.match(selectHtml, /Skater A/)
  assert.doesNotMatch(selectHtml, /lastName|parent/i)
  const emptyHtml = renderEditor(selectTeam, null, [skater], viewer, [])
  assert.match(emptyHtml, /id="lu-schedule-empty"/)
  assert.match(emptyHtml, /No upcoming games on the team schedule/)
  assert.doesNotMatch(emptyHtml, /id="lu-game"/)
  assert.match(emptyHtml, /id="lu-title"[^>]*value=""/)
  const saved = renderEditor(
    selectTeam,
    {
      id: "33333333-3333-4333-8333-333333333333",
      teamId: "select",
      title: "Typed name",
      slots: { LW: [], C: [], RW: [], LD: [], RD: [], OUT: [] },
      shareToken: null,
      notes: "",
      stars: [null, null, null],
      createdAt: "2026-11-09T18:00:00.000Z",
      updatedAt: "2026-11-09T18:00:00.000Z",
    },
    [skater],
    viewer,
    selectGames
  )
  assert.doesNotMatch(saved, /id="lu-game"|lu-schedule-empty/)
  assert.match(saved, /value="Typed name"/)

  const css = fs.readFileSync(path.join(root, "css/lineups.css"), "utf8")
  assert.match(css, /#lu-game \{ color-scheme: light;/)
  assert.match(css, /#lu-game \{ color-scheme: dark;/)

  const selectUi = openEditor(selectHtml)
  const selectDoc = selectUi.dom.window.document
  const selectTitle = selectDoc.getElementById("lu-title") as HTMLInputElement
  const selectGame = selectDoc.getElementById("lu-game") as HTMLSelectElement
  const selectPrint = selectDoc.getElementById("lu-print-title")
  assert.equal(selectTitle.readOnly, false)
  assert.equal(selectTitle.disabled, false)
  assert.equal(selectTitle.value, selectGames[0].label)
  assert.equal(selectGame.value, selectGames[0].label)
  selectTitle.value = "Saturday practice group"
  selectTitle.dispatchEvent(new selectUi.dom.window.Event("input", { bubbles: true }))
  assert.equal(selectTitle.value, "Saturday practice group")
  assert.equal(selectPrint?.textContent, "Saturday practice group")
  selectGame.value = selectGames[1].label
  selectGame.dispatchEvent(new selectUi.dom.window.Event("change", { bubbles: true }))
  assert.equal(selectTitle.value, "Sun Nov 15 5:30 PM vs Jordan Lions, Grimsby Peach King Center East Pad")
  assert.equal(selectPrint?.textContent, selectTitle.value)
  selectGame.value = ""
  selectGame.dispatchEvent(new selectUi.dom.window.Event("change", { bubbles: true }))
  assert.equal(selectTitle.value, "")
  selectTitle.value = "Custom Select name"
  selectTitle.dispatchEvent(new selectUi.dom.window.Event("input", { bubbles: true }))
  assert.equal(selectTitle.value, "Custom Select name")
  await new Promise((resolve) => setTimeout(resolve, 900))
  assert.equal(selectUi.posts.at(-1)?.url, "/api/lineups/team/select")
  assert.equal(selectUi.posts.at(-1)?.title, "Custom Select name")
  assert.equal(selectUi.posts.some((post) => post.url.includes("/stars")), false)
  selectUi.dom.window.close()

  const starsUi = openEditor(starsHtml)
  const starsGame = starsUi.dom.window.document.getElementById("lu-game") as HTMLSelectElement
  const starsTitle = starsUi.dom.window.document.getElementById("lu-title") as HTMLInputElement
  assert.equal(starsTitle.value, "Mon Nov 9 6:00 PM @ Hurricanes, Grimsby Peach King Center East Pad")
  starsGame.selectedIndex = 1
  starsGame.dispatchEvent(new starsUi.dom.window.Event("change", { bubbles: true }))
  assert.equal(starsTitle.value, "Fri Nov 13 6:00 PM vs Falcons, Fleming Memorial Arena")
  await new Promise((resolve) => setTimeout(resolve, 900))
  assert.equal(starsUi.posts.at(-1)?.url, "/api/lineups/team/stars")
  assert.equal(starsUi.posts.some((post) => post.url.includes("/select")), false)
  starsUi.dom.window.close()

  const emptyUi = openEditor(emptyHtml)
  const emptyTitle = emptyUi.dom.window.document.getElementById("lu-title") as HTMLInputElement
  assert.equal(emptyUi.dom.window.document.getElementById("lu-game"), null)
  assert.match(emptyUi.dom.window.document.getElementById("lu-schedule-empty")?.textContent || "", /No upcoming games/)
  emptyTitle.value = "Still editable"
  emptyTitle.dispatchEvent(new emptyUi.dom.window.Event("input", { bubbles: true }))
  assert.equal(emptyTitle.value, "Still editable")
  await new Promise((resolve) => setTimeout(resolve, 900))
  assert.equal(emptyUi.posts.at(-1)?.url, "/api/lineups/team/select")
  assert.equal(emptyUi.posts.at(-1)?.title, "Still editable")
  emptyUi.dom.window.close()

  delete process.env.AUTH_SECRET
  const { handleLineups } = await import("../lib/lineup-routes.js")
  for (const team of ["select", "stars"]) {
    for (const route of [
      `__lu=edit&__team=${team}&__id=new`,
      `__lu=list&__team=${team}`,
      `__lu=roster&__team=${team}`,
      `__lu=api-collection&__team=${team}`,
      `__lu=api-roster&__team=${team}`,
    ]) {
      const response = await handleLineups(new Request(`https://hockey.derekbraid.com/api/lineups?${route}`))
      assert.equal(response.status, 404, route)
      assert.equal(await response.text(), "Not found")
    }
  }
  const shared = await handleLineups(new Request("https://hockey.derekbraid.com/api/lineups?__lu=view&__t=not-a-real-token"))
  assert.equal(shared.status, 404)

  ensureDatabase()
  execSync("node scripts/migrate.mjs", { cwd: root, stdio: "inherit", env: process.env })
  const { getPool, closePool } = await import("../lib/db.js")
  const { getTeam } = await import("../lib/lineups.js")
  try {
    const rows = await getPool().query(`SELECT id, schedule_url FROM teams ORDER BY id`)
    const byId = new Map(rows.rows.map((row) => [String(row.id), row.schedule_url ? String(row.schedule_url) : null]))
    assert.equal(byId.get("select"), SELECT_FEED)
    assert.equal(byId.get("stars"), STARS_FEED)
    await getPool().query(`UPDATE teams SET schedule_url = NULL WHERE id = 'select'`)
    assert.equal((await getTeam("select"))?.scheduleUrl, SELECT_FEED)
    assert.equal((await getTeam("stars"))?.scheduleUrl, STARS_FEED)
    await getPool().query(`UPDATE teams SET schedule_url = $1 WHERE id = 'select'`, ["https://example.com/custom.ics"])
    assert.equal((await getTeam("select"))?.scheduleUrl, "https://example.com/custom.ics")
    await getPool().query(`UPDATE teams SET schedule_url = NULL WHERE id = 'stars'`)
    assert.equal((await getTeam("stars"))?.scheduleUrl, null)
  } finally {
    await getPool().query(`UPDATE teams SET schedule_url = $1 WHERE id = 'stars'`, [STARS_FEED])
    await getPool().query(`UPDATE teams SET schedule_url = $1 WHERE id = 'select'`, [SELECT_FEED])
    await closePool()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
