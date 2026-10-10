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

async function finalUrl(jar: CookieJar, url: string): Promise<string> {
  let current = url
  for (let hop = 0; hop < 8; hop += 1) {
    const response = await fetch(current, {
      headers: { cookie: jar.header() },
      redirect: "manual",
    })
    jar.absorb(response)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) return current
      current = new URL(location, current).href
      continue
    }
    return current
  }
  throw new Error("too many redirects")
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

async function api(
  origin: string,
  jar: CookieJar,
  method: string,
  pathname: string,
  body?: unknown,
  options?: { omitOrigin?: boolean }
): Promise<{ status: number; data: any }> {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: {
      cookie: jar.header(),
      accept: "application/json",
      ...(options?.omitOrigin ? {} : { origin }),
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
  assert.doesNotMatch(home, /index\.html/)
  assert.match(home, /href="\.\/"/)
  assert.match(home, /href="drills\/cone-weave\/"/)
  const planHtml = fs.readFileSync(path.join(root, "plan/index.html"), "utf8")
  assert.match(planHtml, /id="plan-save" hidden/)
  assert.match(planHtml, /Copy share link/)
  assert.doesNotMatch(planHtml, /index\.html/)
  assert.match(planHtml, /"page": "\.\.\/drills\/cone-weave\/"/)
  const accountHtml = fs.readFileSync(path.join(root, "account/index.html"), "utf8")
  assert.doesNotMatch(accountHtml, /index\.html/)
  assert.match(accountHtml, /Privacy/)
  assert.match(accountHtml, /id="account-delete"/)
  for (const banned of ["package.json", "lib/auth.ts", "db/migrations/001_init.sql", ".env", "api/health.ts", "scripts/build_site.py", "drills.json"]) {
    assert.equal(fs.existsSync(path.join(root, "public", banned)), false, banned)
  }
  assert.equal(fs.existsSync(path.join(root, "public/drills/cone-weave.md")), false)
  assert.equal(fs.existsSync(path.join(root, "public/index.html")), true)
  assert.equal(fs.existsSync(path.join(root, "public/media/cone-weave/cone-weave-anim.html")), true)
  assert.equal(fs.existsSync(path.join(root, "public/drills/cone-weave/index.html")), true)

  ensureDatabase()
  setAuthEnv()
  execSync("node scripts/migrate.mjs", { cwd: root, stdio: "inherit", env: process.env })
  execSync("node scripts/migrate.mjs", { cwd: root, stdio: "inherit", env: process.env })

  const { closePool, getPool } = await import("../lib/db.js")
  const { resolvePublicUrl, routedUrl } = await import("../lib/base-path.js")
  const { accountsReady, devMagicLinkEnabled, handleAuth, safeRedirectTarget } = await import("../lib/auth.js")
  const { handleAccount, handleEvent, handleHealth, handleMagicLink, handlePlanItem, handlePlansCollection } = await import("../lib/routes.js")
  const { handleAdmin } = await import("../lib/admin.js")
  const { blockedStaticPath } = await import("../lib/static-guard.js")

  await getPool().query("TRUNCATE users CASCADE")
  await getPool().query("TRUNCATE verification_token")
  await getPool().query("TRUNCATE rate_limits")
  await getPool().query("TRUNCATE events")
  delete process.env.ADMIN_EMAILS

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
    outputDirectory?: string
    redirects: { source: string; destination: string; permanent: boolean }[]
    rewrites: { source: string; destination: string }[]
    headers?: { source: string; headers: { key: string; value: string }[] }[]
  }
  assert.equal(vercelConfig.redirects[0].source, "/index.html")
  assert.equal(vercelConfig.redirects[0].destination, "/")
  assert.equal(vercelConfig.redirects[0].permanent, true)
  assert.equal(vercelConfig.redirects[1].source, "/:path*/index.html")
  assert.equal(vercelConfig.redirects[1].destination, "/:path*/")
  assert.equal(vercelConfig.redirects[1].permanent, true)
  assert.equal(vercelConfig.rewrites[0].source, "/api/auth/:path*/")
  assert.equal(vercelConfig.rewrites[1].destination, "/api/auth/handler?__auth=:path*")
  assert.ok(vercelConfig.rewrites.some((rule) => rule.destination === "/api/plans/item?__plan=:id"))
  assert.ok(vercelConfig.rewrites.some((rule) => rule.source === "/api/plans/:id/"))
  assert.ok(vercelConfig.rewrites.some((rule) => rule.source === "/api/health/"))
  assert.ok(vercelConfig.rewrites.some((rule) => rule.source === "/api/account/" && rule.destination === "/api/account"))
  assert.equal(vercelConfig.outputDirectory, "public")
  const headerGroups = vercelConfig.headers || []
  const allHeaders = headerGroups.flatMap((group) => group.headers)
  const csp = allHeaders.find((header) => header.key === "Content-Security-Policy" && header.value.includes("frame-ancestors 'self'"))
  assert.ok(csp)
  assert.match(csp.value, /googleusercontent\.com/)
  assert.match(csp.value, /font-src 'self'/)
  assert.match(csp.value, /script-src 'self' 'unsafe-inline'/)
  assert.match(csp.value, /frame-ancestors 'self'/)
  assert.match(allHeaders.map((header) => header.key).join(" "), /X-Content-Type-Options/)
  assert.match(allHeaders.map((header) => header.key).join(" "), /Referrer-Policy/)
  assert.match(allHeaders.map((header) => header.key).join(" "), /Permissions-Policy/)
  assert.match(allHeaders.map((header) => header.key).join(" "), /X-Frame-Options/)
  assert.match(allHeaders.map((header) => header.key).join(" "), /Strict-Transport-Security/)
  assert.equal(blockedStaticPath("/lib/auth.ts"), true)
  assert.equal(blockedStaticPath("/package.json"), true)
  assert.equal(blockedStaticPath("/db/migrations/001_init.sql"), true)
  assert.equal(blockedStaticPath("/.env"), true)
  assert.equal(blockedStaticPath("/.env.local"), true)
  assert.equal(blockedStaticPath("/api/health.ts"), true)
  assert.equal(blockedStaticPath("/scripts/test_accounts.ts"), true)
  assert.equal(blockedStaticPath("/drills/cone-weave.md"), true)
  assert.equal(blockedStaticPath("/"), false)
  assert.equal(blockedStaticPath("/api/plans"), false)
  assert.equal(blockedStaticPath("/api/health"), false)
  assert.equal(blockedStaticPath("/media/cone-weave/cone-weave-anim.html"), false)
  assert.equal(blockedStaticPath("/js/site.js"), false)
  const authSource = fs.readFileSync(path.join(root, "lib/auth.ts"), "utf8")
  assert.doesNotMatch(authSource, /allowDangerousEmailAccountLinking/)
  assert.equal(safeRedirectTarget("https://evil.example/phish", "https://hockey.derekbraid.com"), "https://hockey.derekbraid.com")
  assert.equal(safeRedirectTarget("//evil.example", "https://hockey.derekbraid.com"), "https://hockey.derekbraid.com")
  assert.equal(safeRedirectTarget("/account/", "https://hockey.derekbraid.com"), "https://hockey.derekbraid.com/account/")
  assert.equal(
    safeRedirectTarget("https://hockey.derekbraid.com/plan/index.html", "https://hockey.derekbraid.com"),
    "https://hockey.derekbraid.com/plan/"
  )

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
    else if (pathname === "/api/account") response = await handleAccount(request)
    else if (pathname.startsWith("/api/plans/")) response = await handlePlanItem(request)
    else if (pathname.startsWith("/api/auth/")) response = await handleAuth(request)
    else if (pathname === "/api/event") response = await handleEvent(request)
    else if (pathname === "/admin" || pathname === "/admin/") response = await handleAdmin(request)
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

    // Usage events: server-side rows for sign-in and plan writes.
    const serverEvents = await getPool().query(
      "SELECT name, user_id, plan_id, props FROM events WHERE user_id = $1 ORDER BY id",
      [userId]
    )
    const serverNames = serverEvents.rows.map((row) => row.name)
    assert.ok(serverNames.includes("sign_in"))
    assert.ok(serverNames.includes("plan_create"))
    assert.ok(serverNames.includes("plan_save"))
    assert.ok(serverNames.includes("plan_delete"))
    assert.equal(serverEvents.rows.find((row) => row.name === "plan_create")?.plan_id, planId)

    // Browser beacon: validated, write-only, and same-origin only.
    const anonKey = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const beacon = (body: unknown, headers: Record<string, string> = { origin }) =>
      fetch(`${origin}/api/event`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) })
    const viewed = await beacon({ name: "drill_view", anon: anonKey, drill: "cone-weave", email: "leak@example.com", props: { x: 1 } })
    assert.equal(viewed.status, 204)
    assert.equal(await viewed.text(), "")
    const viewRow = await getPool().query("SELECT * FROM events WHERE name = 'drill_view' ORDER BY id DESC LIMIT 1")
    assert.equal(viewRow.rows[0].anon_id, anonKey)
    assert.equal(viewRow.rows[0].drill_slug, "cone-weave")
    assert.equal(viewRow.rows[0].user_id, null)
    assert.doesNotMatch(JSON.stringify(viewRow.rows[0]), /leak@example\.com/)
    assert.equal((await beacon({ name: "page_view", anon: anonKey, page: "home" })).status, 204)
    assert.equal((await beacon({ name: "page_view", anon: anonKey, page: "<script>" })).status, 204)
    const pageRow = await getPool().query("SELECT props FROM events WHERE name = 'page_view' ORDER BY id DESC LIMIT 1")
    assert.deepEqual(pageRow.rows[0].props, { page: "other" })
    assert.equal((await beacon({ name: "sign_in", anon: anonKey })).status, 400)
    assert.equal((await beacon({ name: "plan_create", anon: anonKey })).status, 400)
    assert.equal((await beacon({ name: "drill_view", anon: "short", drill: "cone-weave" })).status, 400)
    assert.equal((await beacon({ name: "drill_view", anon: anonKey, drill: "../etc" })).status, 400)
    assert.equal((await beacon({ name: "drill_view", anon: anonKey })).status, 400)
    assert.equal((await beacon("not json")).status, 400)
    assert.equal((await beacon({ name: "page_view", anon: anonKey, pad: "x".repeat(3000) })).status, 413)
    assert.equal((await beacon({ name: "page_view", anon: anonKey }, {})).status, 403)
    assert.equal((await beacon({ name: "page_view", anon: anonKey }, { origin: "https://evil.example" })).status, 403)
    assert.equal(
      (await beacon({ name: "page_view", anon: anonKey }, { "sec-fetch-site": "same-origin" })).status,
      204
    )
    const readAttempt = await fetch(`${origin}/api/event`)
    assert.equal(readAttempt.status, 405)
    assert.equal(await readAttempt.text(), "")
    const signedBeacon = await beacon(
      { name: "drill_add_to_plan", anon: anonKey, drill: "stops-and-starts" },
      { origin, cookie: coachA.header() }
    )
    assert.equal(signedBeacon.status, 204)
    const addRow = await getPool().query("SELECT user_id FROM events WHERE name = 'drill_add_to_plan' ORDER BY id DESC LIMIT 1")
    assert.equal(addRow.rows[0].user_id, userId)
    const piiColumns = await getPool().query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'events' ORDER BY column_name"
    )
    assert.deepEqual(
      piiColumns.rows.map((row) => row.column_name),
      ["anon_id", "created_at", "drill_slug", "id", "name", "plan_id", "props", "user_id"]
    )

    // Admin dashboard: 404 unless the session email is in ADMIN_EMAILS.
    const adminGet = (jar: CookieJar, pathname = "/admin") =>
      fetch(`${origin}${pathname}`, { headers: { cookie: jar.header() }, redirect: "manual" })
    const noAdminsSet = await adminGet(coachA)
    assert.equal(noAdminsSet.status, 404)
    process.env.ADMIN_EMAILS = " Coach-A@Example.com , other@example.com"
    const signedOutAdmin = await adminGet(new CookieJar())
    assert.equal(signedOutAdmin.status, 404)
    assert.equal(await signedOutAdmin.text(), "Not found")
    const coachBAdmin = await adminGet(coachB)
    assert.equal(coachBAdmin.status, 404)
    assert.doesNotMatch(await coachBAdmin.text(), /coach-a@example\.com/)
    const forged = await fetch(`${origin}/admin`, { headers: { cookie: "__Host-hsd.session-token=forged; hsd.session-token=forged" } })
    assert.equal(forged.status, 404)
    const adminPage = await adminGet(coachA, "/admin/")
    assert.equal(adminPage.status, 200)
    assert.equal(adminPage.headers.get("x-robots-tag"), "noindex, nofollow")
    assert.match(adminPage.headers.get("cache-control") || "", /no-store/)
    const adminHtml = await adminPage.text()
    assert.match(adminHtml, /<meta name="robots" content="noindex, nofollow">/)
    assert.match(adminHtml, /Site stats/)
    assert.match(adminHtml, /Last 7 days/)
    assert.match(adminHtml, /coach-b@example\.com/)
    assert.match(adminHtml, /Include my activity/)
    // The cone-weave view came from a browser later seen signed in as the admin,
    // so it is hidden by default, and the admin is left out of the coach list.
    assert.doesNotMatch(adminHtml, /Cone weave/)
    assert.equal(adminHtml.split("coach-a@example.com").length - 1, 1)

    // Admin session: flagged at insert, and told (only itself) it is an admin.
    const adminSession = await api(origin, coachA, "GET", "/api/auth/session")
    assert.equal(adminSession.data.user.admin, true)
    const coachBSession = await api(origin, coachB, "GET", "/api/auth/session")
    assert.equal(coachBSession.data.user.admin, undefined)
    assert.doesNotMatch(JSON.stringify(coachBSession.data), /coach-a|other@example/)
    const adminAnon = "adminbrowser000000000000"
    assert.equal(
      (await beacon({ name: "drill_view", anon: adminAnon, drill: "full-ice-figure-8-shot" }, { origin, cookie: coachA.header() })).status,
      204
    )
    const flagged = await getPool().query("SELECT props, user_id FROM events WHERE anon_id = $1", [adminAnon])
    assert.equal(flagged.rows[0].props.admin, true)
    // Same browser later signed out: still hidden.
    assert.equal((await beacon({ name: "drill_view", anon: adminAnon, drill: "defend-the-cone" })).status, 204)
    // A real coach's browser and a box test beacon.
    assert.equal((await beacon({ name: "drill_view", anon: "realcoach0000000000000", drill: "puck-protection-race" })).status, 204)
    assert.equal((await beacon({ name: "drill_view", anon: "boxcheck00000000000000", drill: "box-test-drill" })).status, 204)
    const hidden = await (await adminGet(coachA)).text()
    assert.match(hidden, /Puck protection race/)
    assert.doesNotMatch(hidden, /Full ice figure 8 shot|Defend the cone|Box test drill|Cone weave/)
    const included = await (await adminGet(coachA, "/admin/?include_admin=1")).text()
    assert.match(included, /Including your activity/)
    assert.match(included, /Full ice figure 8 shot/)
    assert.match(included, /Defend the cone/)
    assert.match(included, /Cone weave/)
    assert.doesNotMatch(included, /Box test drill/)
    assert.match(included, /coach-a@example\.com <span class="tag">admin<\/span>/)
    assert.match(adminHtml, /vercel\.com\/debraids-projects\/hockey-skills-and-drills\/analytics/)
    assert.doesNotMatch(adminHtml, /<script/i)
    assert.equal((await fetch(`${origin}/admin`, { method: "POST", headers: { cookie: coachA.header() } })).status, 404)
    delete process.env.ADMIN_EMAILS

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
    assert.ok(signedOutCalls.some((url) => url.endsWith("/hockey-skills-and-drills/api/event")))
    assert.equal(absentCalls.some((url) => url.includes("/api/event")), false)
    signedOut.window.close()

    const adminCalls: string[] = []
    const adminView = await page(
      fs.readFileSync(path.join(root, "index.html"), "utf8"),
      `${origin}/index.html`,
      { id: "123e4567-e89b-42d3-a456-426614174000", name: "Derek", email: "derek@example.com", image: "", admin: true },
      adminCalls
    )
    await waitFor(() => adminView.window.localStorage.getItem("hsd-exclude-stats") === "1")
    assert.equal(adminCalls.some((url) => url.includes("/api/event")), false)
    adminView.window.close()
    const markedCalls: string[] = []
    const marked = await page(
      fs.readFileSync(path.join(root, "index.html"), "utf8"),
      `${origin}/index.html`,
      null,
      markedCalls,
      { "hsd-exclude-stats": "1" }
    )
    assert.equal(markedCalls.some((url) => url.includes("/api/event")), false)
    assert.equal(marked.window.document.querySelector('script[src*="_vercel/insights"]'), null)
    marked.window.close()

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

    const poisoned = resolvePublicUrl(
      new Request("https://hockey-skills-and-drills.vercel.app/api/health", {
        headers: { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" },
      })
    )
    assert.equal(poisoned.origin, "https://hockey-skills-and-drills.vercel.app")
    const secureCookies = await handleAuth(
      new Request("https://hockey.derekbraid.com/api/auth/csrf", {
        headers: { host: "hockey.derekbraid.com", "x-forwarded-proto": "https" },
      })
    )
    const secureSet = secureCookies.headers.getSetCookie?.().join("\n") || ""
    assert.match(secureSet, /__Host-hsd\.csrf-token=/)
    assert.match(secureSet, /HttpOnly/i)
    assert.match(secureSet, /Secure/)
    assert.match(secureSet, /SameSite=Lax/i)
    assert.doesNotMatch(secureSet, /Domain=/i)

    const xssUrl =
      `${origin}/plan/?d=cone-weave&m=10&t=` + encodeURIComponent('<img src=x onerror="alert(1)">')
    const xss = await page(planHtml, xssUrl, null, [])
    assert.equal(xss.window.document.querySelectorAll('img[src="x"]').length, 0)
    assert.equal(xss.window.document.querySelector("#plan-list script"), null)
    assert.match((xss.window.document.getElementById("plan-title") as HTMLInputElement).value, /<img/)
    assert.match(xss.window.document.getElementById("plan-print-title")?.textContent || "", /<img/)
    assert.equal(xss.window.document.querySelector("#plan-print-title img"), null)
    xss.window.close()

    const avatarUser = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "Derek",
      email: "derek@example.com",
      image: "javascript:alert(1)",
    }
    const badAvatar = await page(fs.readFileSync(path.join(root, "index.html"), "utf8"), `${origin}/`, avatarUser, [])
    assert.equal(badAvatar.window.document.querySelector("[data-account-slot] img"), null)
    assert.match(badAvatar.window.document.querySelector("[data-account-slot]")?.textContent || "", /Derek/)
    badAvatar.window.close()
    const goodAvatar = await page(fs.readFileSync(path.join(root, "index.html"), "utf8"), `${origin}/`, {
      ...avatarUser,
      image: "https://lh3.googleusercontent.com/a/example",
    }, [])
    const avatar = goodAvatar.window.document.querySelector("[data-account-slot] img") as HTMLImageElement
    assert.ok(avatar)
    assert.match(avatar.src, /^https:\/\/lh3\.googleusercontent\.com\//)
    goodAvatar.window.close()

    const noOrigin = await api(origin, coachA, "POST", "/api/plans", { title: "Nope" }, { omitOrigin: true })
    assert.equal(noOrigin.status, 403)
    const tooBig = await api(origin, coachA, "POST", "/api/plans", { title: "Big", notes: "n".repeat(40_000) })
    assert.equal(tooBig.status, 400)
    assert.match(tooBig.data.error, /too large/i)
    const badId = await api(origin, coachA, "GET", "/api/plans/not-a-uuid")
    assert.equal(badId.status, 404)
    const manyItems = await api(origin, coachA, "POST", "/api/plans", {
      title: "Too many",
      items: Array.from({ length: 61 }, (_item, index) => ({ slug: `drill-${index}`, minutes: 1, note: "" })),
    })
    assert.equal(manyItems.status, 400)

    await getPool().query(
      `INSERT INTO plans (user_id, title) SELECT $1, 'cap ' || g FROM generate_series(1, 100) g`,
      [userId]
    )
    const capped = await api(origin, coachA, "POST", "/api/plans", { title: "One more" })
    assert.equal(capped.status, 400)
    assert.match(capped.data.error, /100/)

    const poisonJar = new CookieJar()
    const poisonResponse = await fetch(`${origin}/api/auth/csrf`, { headers: { cookie: poisonJar.header() } })
    poisonJar.absorb(poisonResponse)
    const poisonCsrf = ((await poisonResponse.json()) as { csrfToken?: string }).csrfToken || ""
    const poisonBody = new URLSearchParams({
      csrfToken: poisonCsrf,
      email: "poisoned@example.com",
      callbackUrl: `${origin}/account/`,
    })
    await fetch(`${origin}/api/auth/signin/resend`, {
      method: "POST",
      headers: {
        cookie: poisonJar.header(),
        "content-type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
        "x-forwarded-host": "evil.example",
      },
      body: poisonBody,
    })
    const poisonLink = (await (await fetch(`${origin}/api/dev/magic-link`)).json()) as { url?: string }
    assert.ok(poisonLink.url)
    assert.equal(new URL(poisonLink.url).host, new URL(origin).host)
    assert.doesNotMatch(poisonLink.url, /evil\.example/)

    const redirectJar = new CookieJar()
    await postAuth(origin, redirectJar, "signin/resend", {
      email: "redirect@example.com",
      callbackUrl: "https://evil.example/phish",
    })
    const redirectLink = (await (await fetch(`${origin}/api/dev/magic-link`)).json()) as { url?: string }
    assert.ok(redirectLink.url)
    const landed = await finalUrl(new CookieJar(), redirectLink.url)
    assert.equal(new URL(landed).origin, origin)
    assert.doesNotMatch(landed, /evil\.example/)

    const coachC = await signIn(origin, "coach-c@example.com")
    const createdC = await api(origin, coachC, "POST", "/api/plans", { title: "Keep me" })
    assert.equal(createdC.status, 201)
    const coachCId = ((await api(origin, coachC, "GET", "/api/auth/session")).data.user.id) as string
    const unconfirmed = await api(origin, coachA, "DELETE", "/api/account", { confirm: "no" })
    assert.equal(unconfirmed.status, 400)
    const deleted = await api(origin, coachA, "DELETE", "/api/account", {
      confirm: "delete my account",
      user_id: coachCId,
    })
    assert.equal(deleted.status, 200)
    const coachAGone = await api(origin, coachA, "GET", "/api/plans")
    assert.equal(coachAGone.status, 401)
    const coachCStill = await api(origin, coachC, "GET", "/api/plans")
    assert.equal(coachCStill.status, 200)
    assert.equal(coachCStill.data.plans[0].title, "Keep me")
    const userRows = await getPool().query("SELECT id FROM users WHERE id = $1", [userId])
    assert.equal(userRows.rowCount, 0)
    const otherRows = await getPool().query("SELECT id FROM users WHERE id = $1", [coachCId])
    assert.equal(otherRows.rowCount, 1)

    process.env.VERCEL_ENV = "production"
    assert.equal(devMagicLinkEnabled(), false)
    const hiddenLink = await fetch(`${origin}/api/dev/magic-link`)
    assert.equal(hiddenLink.status, 404)
    delete process.env.VERCEL_ENV
    assert.equal(devMagicLinkEnabled(), true)

    let limited = 0
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await postAuth(origin, new CookieJar(), "signin/resend", {
        email: "bomb@example.com",
        callbackUrl: `${origin}/account/`,
      })
      if ((result as { error?: string }).error) limited += 1
    }
    const sixth = await fetch(`${origin}/api/auth/signin/resend`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin,
      },
      body: new URLSearchParams({ email: "bomb@example.com", csrfToken: "ignored", callbackUrl: `${origin}/account/` }),
    })
    assert.equal(sixth.status, 429)
    const sixthBody = (await sixth.json()) as { error?: string }
    assert.match(sixthBody.error || "", /too many/i)
    assert.doesNotMatch(JSON.stringify(sixthBody), /bomb@example.com/)
    assert.ok(limited >= 1)
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
