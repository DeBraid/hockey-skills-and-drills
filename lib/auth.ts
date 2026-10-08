import { Auth, type AuthConfig } from "@auth/core"
import Google from "@auth/core/providers/google"
import Resend from "@auth/core/providers/resend"
import NeonAdapter from "@auth/neon-adapter"
import { resolvePublicUrl, type PublicUrl } from "./base-path.js"
import { getPool } from "./db.js"
import { logEvent } from "./events.js"
import { clientIp, json } from "./http.js"
import { consumeLimit } from "./rate-limit.js"

export interface AccountUser {
  id: string
  name: string
  email: string
  image: string
}

interface MagicLink {
  email: string
  url: string
}

let lastMagicLink: MagicLink | null = null

export function accountsReady(): boolean {
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) return false
  return googleReady() || emailReady()
}

export function googleReady(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
}

export function devMagicLinkEnabled(): boolean {
  return process.env.EMAIL_DELIVERY === "console" && !process.env.VERCEL_ENV
}

export function emailReady(): boolean {
  if (devMagicLinkEnabled()) return true
  return Boolean(process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM)
}

export function peekMagicLink(): MagicLink | null {
  return lastMagicLink
}

export async function handleAuth(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405)
  }
  try {
    const publicUrl = resolvePublicUrl(request)
    const raw = request.method === "POST" ? await request.arrayBuffer() : undefined
    if (request.method === "POST" && /\/signin\/resend\/?$/.test(publicUrl.url.pathname)) {
      const gate = await emailSignInGate(emailFromSignIn(raw, request.headers.get("content-type") || ""), clientIp(request))
      if (gate === "limited") return json({ error: "Too many sign-in emails. Try again later." }, 429)
      if (gate === "unavailable") return json({ error: "Sign-in is unavailable right now." }, 503)
    }
    const headers = new Headers(request.headers)
    headers.set("x-forwarded-host", publicUrl.host)
    headers.set("x-forwarded-proto", publicUrl.protocol)
    headers.set("host", publicUrl.host)
    headers.delete("content-length")
    const authRequest = new Request(publicUrl.url, {
      method: request.method,
      headers,
      body: raw,
    })
    return await Auth(authRequest, authConfigFor(publicUrl))
  } catch (error) {
    console.error(error)
    return json({ error: "Sign-in is unavailable right now." }, 500)
  }
}

export async function readSession(request: Request): Promise<AccountUser | null> {
  if (!accountsReady()) return null
  try {
    const publicUrl = resolvePublicUrl(request)
    const sessionUrl = new URL(`${publicUrl.basePath}/api/auth/session`, publicUrl.origin)
    const headers = new Headers()
    const cookie = request.headers.get("cookie")
    if (cookie) headers.set("cookie", cookie)
    headers.set("x-forwarded-host", publicUrl.host)
    headers.set("x-forwarded-proto", publicUrl.protocol)
    headers.set("host", publicUrl.host)
    const response = await Auth(new Request(sessionUrl, { headers }), authConfigFor(publicUrl))
    if (!response.ok) return null
    const data = await response.json().catch(() => null)
    const user = data?.user
    if (!user?.id) return null
    return {
      id: String(user.id),
      name: user.name ? String(user.name) : "",
      email: user.email ? String(user.email) : "",
      image: user.image ? String(user.image) : "",
    }
  } catch (error) {
    console.error(error)
    return null
  }
}

function authConfigFor(publicUrl: PublicUrl): AuthConfig {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set")
  const secure = publicUrl.protocol === "https"
  const basePath = `${publicUrl.basePath}/api/auth`
  return {
    trustHost: true,
    secret,
    basePath,
    adapter: NeonAdapter(getPool() as never),
    useSecureCookies: secure,
    session: {
      strategy: "database",
      maxAge: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    pages: {
      signIn: `${publicUrl.basePath}/account/`,
      error: `${publicUrl.basePath}/account/`,
      verifyRequest: `${publicUrl.basePath}/account/`,
    },
    providers: providers(),
    // Cookie path stays "/" (the Auth.js default) and no Domain is set, so the
    // browser stores the cookie for the host that set it (hockey.derekbraid.com
    // or the vercel.app host). Names are prefixed with hsd so they do not
    // collide with another app on a shared parent domain.
    cookies: authCookies(secure),
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "google") return true
        const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified
        return verified !== false
      },
      session({ session, user }) {
        const source = user ?? session.user
        const expires = session.expires as Date | string | undefined
        return {
          user: {
            id: source?.id ? String(source.id) : "",
            name: source?.name ?? null,
            email: source?.email ?? null,
            image: source?.image ?? null,
          },
          expires: expires instanceof Date ? expires.toISOString() : String(expires ?? ""),
        }
      },
      redirect({ url, baseUrl }) {
        return safeRedirectTarget(url, baseUrl)
      },
    },
    events: {
      async signIn({ user, account, isNewUser }) {
        await logEvent({
          name: "sign_in",
          userId: user?.id ? String(user.id) : null,
          props: { provider: account?.provider === "google" ? "google" : "email", new: Boolean(isNewUser) },
        })
      },
    },
    logger: {
      error(error) {
        console.error(error)
      },
      warn() {},
      debug() {},
    },
  }
}

function authCookies(secure: boolean): AuthConfig["cookies"] {
  const name = (suffix: string) => `${secure ? "__Host-" : ""}hsd.${suffix}`
  const options = (maxAge?: number) => ({
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    ...(maxAge ? { maxAge } : {}),
  })
  return {
    sessionToken: { name: name("session-token"), options: options() },
    callbackUrl: { name: name("callback-url"), options: options() },
    csrfToken: { name: name("csrf-token"), options: options() },
    pkceCodeVerifier: { name: name("pkce.code_verifier"), options: options(60 * 15) },
    state: { name: name("state"), options: options(60 * 15) },
    nonce: { name: name("nonce"), options: options() },
  }
}

export function safeRedirectTarget(url: string, baseUrl: string): string {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return baseUrl
  }
  const fallback = base.origin
  if (!url || /[\s\\]/.test(url)) return fallback
  try {
    const relative = url.startsWith("/") && !url.startsWith("//")
    const parsed = relative ? new URL(url, base.origin) : new URL(url)
    if (parsed.origin !== base.origin) return fallback
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fallback
    parsed.pathname = parsed.pathname.replace(/\/index\.html$/, "/")
    return parsed.href
  } catch {
    return fallback
  }
}

async function emailSignInGate(email: string, ip: string): Promise<"ok" | "limited" | "unavailable"> {
  try {
    const addressOk = await consumeLimit("magic-email", email || "missing", 5, 60 * 60)
    const ipOk = await consumeLimit("magic-ip", ip || "local", 30, 60 * 60)
    return addressOk && ipOk ? "ok" : "limited"
  } catch (error) {
    console.error(error)
    return "unavailable"
  }
}

function emailFromSignIn(body: ArrayBuffer | undefined, contentType: string): string {
  if (!body) return ""
  const text = new TextDecoder().decode(body).slice(0, 4000)
  if (contentType.includes("application/json")) {
    try {
      const data = JSON.parse(text) as { email?: unknown }
      return typeof data.email === "string" ? data.email.trim().toLowerCase() : ""
    } catch {
      return ""
    }
  }
  return (new URLSearchParams(text).get("email") || "").trim().toLowerCase()
}

function providers() {
  const list: AuthConfig["providers"] = []
  if (googleReady()) {
    list.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      })
    )
  }
  if (emailReady()) {
    list.push(
      Resend({
        apiKey: process.env.AUTH_RESEND_KEY || "console",
        from: process.env.EMAIL_FROM || "Hockey Skills & Drills <plans@localhost>",
        sendVerificationRequest: sendMagicLink,
      })
    )
  }
  return list
}

async function sendMagicLink(params: {
  identifier: string
  url: string
  provider: { apiKey?: string; from?: string }
}): Promise<void> {
  const { identifier: to, url, provider } = params
  if (devMagicLinkEnabled()) {
    lastMagicLink = { email: to, url }
    console.log(`Magic link for ${to}: ${url}`)
    return
  }
  if (process.env.EMAIL_DELIVERY === "console") {
    throw new Error("Email sign-in is not configured")
  }
  const apiKey = provider.apiKey || process.env.AUTH_RESEND_KEY
  const from = provider.from || process.env.EMAIL_FROM
  if (!apiKey || !from) throw new Error("Email sign-in is not configured")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Sign in to Hockey Skills & Drills",
      text: `Use this link to sign in. It expires in 24 hours.\n\n${url}\n`,
      html: `<p>Use this link to sign in to Hockey Skills &amp; Drills. It expires in 24 hours.</p><p><a href="${escapeHtml(url)}">Sign in</a></p>`,
    }),
  })
  if (!response.ok) {
    console.error("Resend error", await response.text())
    throw new Error("Could not send the sign-in email")
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
