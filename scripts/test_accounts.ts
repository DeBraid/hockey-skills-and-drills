import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { JSDOM, VirtualConsole } from "jsdom"

const require = createRequire(import.meta.url)
const { ResourceLoader } = require("jsdom") as {
  ResourceLoader: new () => { fetch(url: string, options?: unknown): Promise<Buffer> }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function ensureDatabase(): void {
  if (process.env.DATABASE_URL) return
  const role = execSync(`sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='ubuntu'"`, {
    encoding: "utf8",
  }).trim()
  if (role !== "1") execSync("sudo -u postgres createuser -s ubuntu")
  const db = execSync(`sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='hsd_test'"`, {
    encoding: "utf8",
  }).trim()
  if (db !== "1") execSync("sudo -u postgres createdb -O ubuntu hsd_test")
  process.env.DATABASE_URL = "postgres://ubuntu@/hsd_test?host=/var/run/postgresql"
}

function setAuthEnv(): void {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret"
  process.env.EMAIL_DELIVERY = "console"
  process.env.EMAIL_FROM = "Hockey Skills & Drills <plans@example.com>"
  process.env.AUTH_RESEND_KEY = "re_test"
  process.env.AUTH_GOOGLE_ID = "google-client-id"
  process.env.AUTH_GOOGLE_SECRET = "google-client-secret"
  delete process.env.BASE_PATH
  delete process.env.CANONICAL_HOST
}

class CookieJar {
  private cookies = new Map<string, string>()

  header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ")
  }

  absorb(response: Response): void {
    const lines = response.headers.getSetCookie?.() ?? []
    for (const line of lines) {
      const pair = line.split(";")[0] || ""
      const eq = pair.indexOf("=")
      if (eq === -1) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1)
      if (!value) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  names(): string[] {
    return [...this.cookies.keys()]
  }
}

async function follow(jar: CookieJar, url: string): Promise<Response> {
  let current = url
  for (let hop = 0; hop < 6; hop += 1) {
    const response = await fetch(current, {
      headers: { cookie: jar.header() },
      redirect: "manual",
    })
    jar.absorb(response)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) return response
      current = new URL(location, current).href
      continue
    }
    return response
  }
  throw new Error("too many redirects")
}

async function csrf(origin: string, jar: CookieJar): Promise<string> {
  const response = await fetch(`${origin}/api/auth/csrf`, { headers: { cookie: jar.header() } })
  jar.absorb(response)
  const data = (await response.json()) as { csrfToken?: string }
  assert.equal(response.status, 200)
  assert.ok(data.csrfToken)
  return data.csrfToken
}

async function postAuth(origin: string, jar: CookieJar, action: string, fields: Record<string, string>): Promise<{ url?: string }> {
  const token = await csrf(origin, jar)
  const body = new URLSearchParams({ csrfToken: token, ...fields })
  const response = await fetch(`${origin}/api/auth/${action}`, {
    method: "POST",
    headers: {
      cookie: jar.header(),
      "content-type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body,
  })
  jar.absorb(response)
  return (await response.json()) as { url?: string }
}

async function signIn(origin: string, email: string): Promise<CookieJar> {
  const jar = new CookieJar()
  const started = await postAuth(origin, jar, "signin/resend", {
    email,
    callbackUrl: `${origin}/account/`,
  })
  assert.ok(started.url, "email sign-in should return a url")
  const linkResponse = await fetch(`${origin}/api/dev/magic-link`)
  const link = (await linkResponse.json()) as { email?: string; url?: string }
  assert.equal(link.email, email)
  assert.ok(link.url)
  console.log(`Magic link for ${email}: ${link.url}`)
  const fresh = new CookieJar()
  await follow(fresh, link.url)
  assert.ok(
    fresh.names().some((name) => name.includes("hsd.session-token")),
    `expected a session cookie, got ${fresh.names().join(", ")}`
  )
  return fresh
}

async function api(origin: string, jar: CookieJar, method: string, pathname: string, body?: unknown): Promise<{ status: number; data: any }> {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: {
      cookie: jar.header(),
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("no port")
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

async function page(
  html: string,
  url: string,
  session: unknown,
  calls: string[],
  storage?: Record<string, string>
): Promise<JSDOM> {
  const virtualConsole = new VirtualConsole()
  const errors: string[] = []
  virtualConsole.on("jsdomError", (error: Error) => {
    if (!/Could not load link|Not implemented|loading the stylesheet|Could not parse CSS/i.test(String(error))) {
      errors.push(String(error))
    }
  })
  const dom = new JSDOM(html, {
    url,
    runScripts: "dangerously",
    resources: new LocalFiles() as never,
    virtualConsole,
    beforeParse(window) {
      window.addEventListener("error", (event) => {
        errors.push(String(event.error || event.message))
      })
      if (storage) {
        for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value)
      }
      try {
        Object.defineProperty(window.navigator, "clipboard", {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error("blocked")) },
        })
      } catch {
        // Share falls back to the text field when clipboard is missing.
      }
      window.fetch = (async (input: RequestInfo | URL) => {
        const target = String(input)
        calls.push(target)
        if (target.endsWith("/api/health")) {
          if (session === "down") return jsonResponse({ ok: false }, 404)
          return jsonResponse({ ok: true, accounts: true, google: true, email: true })
        }
        if (target.endsWith("/api/auth/session")) {
          return jsonResponse(session && session !== "down" ? { user: session } : null)
        }
        if (target.endsWith("/api/plans") && session && session !== "down") {
          return jsonResponse({
            plan: {
              id: "123e4567-e89b-42d3-a456-426614174000",
              title: "Tuesday",
              notes: "hips low",
              items: [{ slug: "cone-weave", minutes: 10, note: "edges" }],
            },
          }, 201)
        }
        return jsonResponse({ error: "not found" }, 404)
      }) as typeof window.fetch
    },
  })
  await new Promise<void>((resolve) => {
    if (dom.window.document.readyState === "complete") resolve()
    else dom.window.addEventListener("load", () => resolve())
  })
  await waitFor(() => calls.some((call) => call.includes("/api/health")))
  await new Promise((resolve) => setTimeout(resolve, 50))
  if (errors.length) throw new Error(errors.join("\n"))
  return dom
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

class LocalFiles extends ResourceLoader {
  fetch(url: string, _options: Record<string, unknown>): Promise<Buffer> {
    let pathname = decodeURIComponent(new URL(url).pathname)
    const base = "/hockey-skills-and-drills"
    if (pathname === base || pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length) || "/"
    const relative = pathname.replace(/^\/+/, "")
    if (relative.endsWith(".js") || relative.endsWith(".css")) {
      const file = path.join(root, relative)
      if (fs.existsSync(file)) return Promise.resolve(fs.readFileSync(file))
    }
    return Promise.resolve(Buffer.from(""))
  }
}

async function waitFor(check: () => boolean): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > 4000) throw new Error("timed out waiting for the page")
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}

async function main(): Promise<void> {
  execSync("python3 scripts/build_site.py", { cwd: root, stdio: "inherit" })
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8")
  assert.match(home, /data-account-slot hidden/)
  assert.doesNotMatch(home, /Sign in/)
  assert.doesNotMatch(home, /My plans/)
  assert.doesNotMatch(home, /Fork or star/)
  assert.doesNotMatch(home, /Add a drill/)
  const planHtml = fs.readFileSync(path.join(root, "plan/index.html"), "utf8")
  assert.match(planHtml, /id="plan-save" hidden/)
  assert.match(planHtml, /Copy share link/)

  ensureDatabase()
  setAuthEnv()
  execSync("node scripts/migrate.mjs", { cwd: root, stdio: "inherit", env: process.env })
  execSync("node scripts/migrate.mjs", { cwd: root, stdio: "inherit", env: process.env })

  const { closePool, getPool } = await import("../lib/db.js")
  const { resolvePublicUrl, routedUrl } = await import("../lib/base-path.js")
  const { accountsReady } = await import("../lib/auth.js")
  const { handleAuth } = await import("../lib/auth.js")
  const { handleHealth, handleMagicLink, handlePlanItem, handlePlansCollection } = await import("../lib/routes.js")

  await getPool().query("TRUNCATE users CASCADE")
  await getPool().query("TRUNCATE verification_token")

  const previousSecret = process.env.AUTH_SECRET
  delete process.env.AUTH_SECRET
  assert.equal(accountsReady(), false)
  process.env.AUTH_SECRET = previousSecret

  process.env.BASE_PATH = "/hockey-skills-and-drills"
  process.env.CANONICAL_HOST = "derekbraid.com"
  const rewritten = resolvePublicUrl(
    new Request("https://proj.vercel.app/api/auth/session", {
      headers: { "x-forwarded-host": "derekbraid.com", "x-forwarded-proto": "https" },
    })
  )
  assert.equal(rewritten.origin, "https://derekbraid.com")
  assert.equal(rewritten.basePath, "/hockey-skills-and-drills")
  assert.equal(rewritten.url.pathname, "/hockey-skills-and-drills/api/auth/session")
  const direct = resolvePublicUrl(new Request("https://proj.vercel.app/api/health"))
  assert.equal(direct.basePath, "")
  assert.equal(direct.url.pathname, "/api/health")
  delete process.env.BASE_PATH
  delete process.env.CANONICAL_HOST

  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")) as {
    rewrites: { source: string; destination: string }[]
  }
  assert.equal(vercelConfig.rewrites[0].source, "/api/auth/:path*/")
  assert.equal(vercelConfig.rewrites[1].destination, "/api/auth/handler?__auth=:path*")
  assert.ok(vercelConfig.rewrites.some((rule) => rule.destination === "/api/plans/item?__plan=:id"))
  assert.ok(vercelConfig.rewrites.some((rule) => rule.source === "/api/plans/:id/"))
  assert.ok(vercelConfig.rewrites.some((rule) => rule.source === "/api/health/"))

  const hintedAuth = routedUrl(
    new Request("https://hockey-skills-and-drills.vercel.app/api/auth/handler?__auth=signin%2Fgoogle&callbackUrl=%2Faccount%2F")
  )
  assert.equal(hintedAuth.pathname, "/api/auth/signin/google")
  assert.equal(hintedAuth.searchParams.get("__auth"), null)
  assert.equal(hintedAuth.searchParams.get("callbackUrl"), "/account/")
  const hintedCallback = routedUrl(
    new Request("https://hockey-skills-and-drills.vercel.app/api/auth/handler?__auth=callback/google/&code=abc&state=xyz")
  )
  assert.equal(hintedCallback.pathname, "/api/auth/callback/google")
  assert.equal(hintedCallback.searchParams.get("code"), "abc")
  assert.equal(hintedCallback.searchParams.get("state"), "xyz")
  const hintedPlan = routedUrl(
    new Request("https://hockey.derekbraid.com/api/plans/item?__plan=123e4567-e89b-42d3-a456-426614174000")
  )
  assert.equal(hintedPlan.pathname, "/api/plans/123e4567-e89b-42d3-a456-426614174000")
  assert.equal(hintedPlan.searchParams.get("__plan"), null)
  const untouched = routedUrl(new Request("https://hockey.derekbraid.com/api/auth/csrf"))
  assert.equal(untouched.pathname, "/api/auth/csrf")
  const rejected = routedUrl(new Request("https://hockey.derekbraid.com/api/auth/handler?__auth=../health"))
  assert.equal(rejected.pathname, "/api/auth/handler")

  process.env.CANONICAL_HOST = "hockey.derekbraid.com"
  const customDomain = resolvePublicUrl(
    new Request("https://hockey-skills-and-drills.vercel.app/api/auth/handler?__auth=callback/google", {
      headers: { "x-forwarded-host": "hockey.derekbraid.com", "x-forwarded-proto": "https" },
    })
  )
  assert.equal(customDomain.basePath, "")
  assert.equal(customDomain.url.href, "https://hockey.derekbraid.com/api/auth/callback/google")
  delete process.env.CANONICAL_HOST

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || "127.0.0.1"
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      if (key === "host" || key === "connection" || key === "content-length" || key === "transfer-encoding") continue
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item))
      else headers.set(key, value)
    }
    const request = new Request(`http://${host}${req.url}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : new Uint8Array(await readBody(req)),
    })
    const url = new URL(request.url)
    let response: Response
    const pathname = url.pathname
    if (pathname === "/api/health") response = handleHealth()
    else if (pathname === "/api/dev/magic-link") response = handleMagicLink()
    else if (pathname === "/api/plans") response = await handlePlansCollection(request)
    else if (pathname.startsWith("/api/plans/")) response = await handlePlanItem(request)
    else if (pathname.startsWith("/api/auth/")) response = await handleAuth(request)
    else response = new Response("Not found", { status: 404 })
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key === "set-cookie") return
      res.setHeader(key, value)
    })
    const cookies = response.headers.getSetCookie?.() ?? []
    if (cookies.length) res.setHeader("set-cookie", cookies)
    const buffer = Buffer.from(await response.arrayBuffer())
    res.end(buffer)
  })
  const origin = await listen(server)

  try {
    const health = await fetch(`${origin}/api/health`)
    const healthBody = await health.json()
    assert.deepEqual(healthBody, { ok: true, accounts: true, google: true, email: true })

    const anon = await api(origin, new CookieJar(), "GET", "/api/plans")
    assert.equal(anon.status, 401)

    process.env.BASE_PATH = "/hockey-skills-and-drills"
    process.env.CANONICAL_HOST = "127.0.0.1"
    const googleJar = new CookieJar()
    const google = await postAuth(origin, googleJar, "signin/google", { callbackUrl: `${origin}/account/` })
    assert.ok(google.url)
    const googleUrl = new URL(google.url)
    assert.equal(googleUrl.origin, "https://accounts.google.com")
    const redirectUri = googleUrl.searchParams.get("redirect_uri") || ""
    assert.equal(redirectUri, `${origin}/hockey-skills-and-drills/api/auth/callback/google`)
    const viaRewrite = await postAuth(origin, googleJar, "handler?__auth=signin/google", {
      callbackUrl: `${origin}/account/`,
    })
    assert.ok(viaRewrite.url)
    assert.equal(new URL(viaRewrite.url).searchParams.get("redirect_uri"), redirectUri)
    const csrfResponse = await fetch(`${origin}/api/auth/csrf`)
    const setCookie = csrfResponse.headers.getSetCookie?.().join("\n") || ""
    assert.match(setCookie, /hsd\.csrf-token=/)
    assert.match(setCookie, /Path=\//)
    assert.doesNotMatch(setCookie, /Domain=/i)
    delete process.env.BASE_PATH
    delete process.env.CANONICAL_HOST

    const coachA = await signIn(origin, "coach-a@example.com")
    const sessionA = await api(origin, coachA, "GET", "/api/auth/session")
    assert.equal(sessionA.status, 200)
    assert.equal(sessionA.data.user.email, "coach-a@example.com")
    const userId = sessionA.data.user.id as string

    const created = await api(origin, coachA, "POST", "/api/plans", {
      user_id: "00000000-0000-4000-8000-000000000000",
      title: "Tuesday practice",
      notes: "Keep the goalies in.",
      items: [
        { slug: "cone-weave", minutes: 10, note: "edges" },
        { slug: "stops-and-starts", minutes: 5, note: "" },
      ],
    })
    assert.equal(created.status, 201)
    const planId = created.data.plan.id as string
    assert.equal(created.data.plan.title, "Tuesday practice")
    assert.equal(created.data.plan.items[0].minutes, 10)
    assert.equal(created.data.plan.user_id, undefined)
    const owner = await getPool().query("SELECT user_id FROM plans WHERE id = $1", [planId])
    assert.equal(owner.rows[0].user_id, userId)

    const listed = await api(origin, coachA, "GET", "/api/plans")
    assert.equal(listed.data.plans.length, 1)
    assert.equal(listed.data.plans[0].drillCount, 2)
    assert.equal(listed.data.plans[0].totalMinutes, 15)

    const viaItem = await api(origin, coachA, "GET", `/api/plans/item?__plan=${planId}`)
    assert.equal(viaItem.status, 200)
    assert.equal(viaItem.data.plan.title, "Tuesday practice")

    const renamed = await api(origin, coachA, "PATCH", `/api/plans/${planId}`, { title: "Thursday practice" })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.data.plan.title, "Thursday practice")
    assert.equal(renamed.data.plan.items.length, 2)

    const bad = await api(origin, coachA, "POST", "/api/plans", {
      title: "x".repeat(81),
      items: [],
    })
    assert.equal(bad.status, 400)
    const empty = await api(origin, coachA, "POST", "/api/plans", { title: "", notes: "", items: [] })
    assert.equal(empty.status, 400)
    const minutes = await api(origin, coachA, "POST", "/api/plans", {
      title: "Long",
      items: [{ slug: "cone-weave", minutes: 181, note: "" }],
    })
    assert.equal(minutes.status, 400)
    const injected = await api(origin, coachA, "POST", "/api/plans", {
      title: "'; DROP TABLE plans; --",
      items: [{ slug: "cone-weave", minutes: null, note: "still here" }],
    })
    assert.equal(injected.status, 201)
    const stillThere = await api(origin, coachA, "GET", "/api/plans")
    assert.ok(stillThere.data.plans.length >= 2)

    const coachB = await signIn(origin, "coach-b@example.com")
    const foreignList = await api(origin, coachB, "GET", "/api/plans")
    assert.deepEqual(foreignList.data.plans, [])
    const foreignGet = await api(origin, coachB, "GET", `/api/plans/${planId}`)
    assert.equal(foreignGet.status, 404)
    const foreignPatch = await api(origin, coachB, "PATCH", `/api/plans/${planId}`, { title: "Stolen" })
    assert.equal(foreignPatch.status, 404)
    const foreignDelete = await api(origin, coachB, "DELETE", `/api/plans/${planId}`)
    assert.equal(foreignDelete.status, 404)
    const stillMine = await api(origin, coachA, "GET", `/api/plans/${planId}`)
    assert.equal(stillMine.status, 200)
    assert.equal(stillMine.data.plan.title, "Thursday practice")

    const removed = await api(origin, coachA, "DELETE", `/api/plans/${planId}`)
    assert.equal(removed.status, 200)
    const gone = await api(origin, coachA, "GET", `/api/plans/${planId}`)
    assert.equal(gone.status, 404)

    const staticServer = http.createServer((req, res) => {
      const url = new URL(req.url || "/", origin)
      if (url.pathname.startsWith("/api")) {
        res.statusCode = 404
        res.end("Not found")
        return
      }
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.endsWith("/")) pathname += "index.html"
      if (pathname === "/") pathname = "/index.html"
      const file = path.join(root, pathname)
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404
        res.end("Not found")
        return
      }
      res.end(fs.readFileSync(file))
    })
    const staticOrigin = await listen(staticServer)
    try {
      const missing = await fetch(`${staticOrigin}/api/health`)
      assert.equal(missing.status, 404)
      const pageText = await (await fetch(`${staticOrigin}/`)).text()
      assert.match(pageText, /data-account-slot hidden/)
      const planText = await (await fetch(`${staticOrigin}/plan/`)).text()
      assert.match(planText, /Copy share link/)
      assert.match(planText, /id="plan-save" hidden/)
    } finally {
      await close(staticServer)
    }

    const browserPlan = JSON.stringify({
      title: "Tuesday",
      notes: "hips low",
      items: [{ slug: "cone-weave", minutes: 10, note: "edges" }],
    })
    const absentCalls: string[] = []
    const absent = await page(planHtml, `${origin}/plan/index.html`, "down", absentCalls, {
      "hsd-practice-plan": browserPlan,
    })
    assert.equal(absent.window.document.querySelector("[data-account-slot]")?.hasAttribute("hidden"), true)
    assert.equal(absent.window.document.getElementById("plan-save")?.hidden, true)
    absent.window.document.getElementById("plan-share")?.dispatchEvent(new absent.window.Event("click"))
    await waitFor(() => !absent.window.document.getElementById("plan-share-fallback")?.hasAttribute("hidden"))
    const shareValue = (absent.window.document.getElementById("plan-share-fallback") as HTMLInputElement).value
    assert.match(shareValue, /plan\/\?d=cone-weave/)
    assert.match(shareValue, /m=10/)
    assert.match(shareValue, /t=Tuesday/)
    assert.doesNotMatch(shareValue, /edges/)
    assert.doesNotMatch(shareValue, /hips/)
    absent.window.close()

    const signedOutCalls: string[] = []
    const signedOut = await page(
      fs.readFileSync(path.join(root, "index.html"), "utf8"),
      `${origin}/hockey-skills-and-drills/index.html`,
      null,
      signedOutCalls
    )
    await waitFor(() => signedOut.window.document.querySelector("[data-account-slot]")?.textContent?.includes("Sign in") === true)
    const signInLink = signedOut.window.document.querySelector("[data-account-slot] a") as HTMLAnchorElement
    assert.match(signInLink.href, /\/hockey-skills-and-drills\/account\/$/)
    assert.ok(signedOutCalls.some((url) => url.endsWith("/hockey-skills-and-drills/api/health")))
    signedOut.window.close()

    const user = { id: "123e4567-e89b-42d3-a456-426614174000", name: "Derek", email: "derek@example.com", image: "" }
    const signedInCalls: string[] = []
    const signedIn = await page(planHtml, `${origin}/plan/index.html`, user, signedInCalls, {
      "hsd-practice-plan": browserPlan,
    })
    await waitFor(() => signedIn.window.document.body.textContent?.includes("Derek") === true)
    assert.match(signedIn.window.document.body.textContent || "", /My plans/)
    assert.equal(signedIn.window.document.getElementById("plan-import")?.hidden, false)
    assert.equal(signedIn.window.document.getElementById("plan-save")?.hidden, false)
    signedIn.window.document.getElementById("plan-save-btn")?.dispatchEvent(new signedIn.window.Event("click"))
    await waitFor(() => signedIn.window.document.getElementById("plan-status")?.textContent === "Saved to your account.")
    signedIn.window.close()

    const signedOutPlan = await page(planHtml, `${origin}/plan/index.html`, null, [])
    assert.equal(signedOutPlan.window.document.getElementById("plan-save")?.hidden, false)
    signedOutPlan.window.document.getElementById("plan-save-btn")?.dispatchEvent(new signedOutPlan.window.Event("click"))
    assert.equal(signedOutPlan.window.document.getElementById("plan-signin")?.hidden, false)
    signedOutPlan.window.close()

    const accountDown = await page(
      fs.readFileSync(path.join(root, "account/index.html"), "utf8"),
      `${origin}/account/index.html`,
      "down",
      []
    )
    assert.equal(accountDown.window.document.getElementById("account-unavailable")?.hidden, false)
    assert.equal(accountDown.window.document.getElementById("account-out")?.hidden, true)
    assert.equal(accountDown.window.document.querySelector("[data-account-slot]")?.hasAttribute("hidden"), true)
    accountDown.window.close()
  } finally {
    await close(server)
    await closePool()
  }
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
