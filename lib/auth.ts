import { Auth, type AuthConfig } from "@auth/core"
import Google from "@auth/core/providers/google"
import Resend from "@auth/core/providers/resend"
import NeonAdapter from "@auth/neon-adapter"
import { resolvePublicUrl, type PublicUrl } from "./base-path.js"
import { getPool } from "./db.js"
import { json } from "./http.js"

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

export function emailReady(): boolean {
  if (process.env.EMAIL_DELIVERY === "console") return true
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
    const headers = new Headers(request.headers)
    headers.set("x-forwarded-host", publicUrl.host)
    headers.set("x-forwarded-proto", publicUrl.protocol)
    headers.set("host", publicUrl.host)
    headers.delete("content-length")
    const authRequest = new Request(publicUrl.url, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
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
  const prefix = secure ? "__Secure-" : ""
  const basePath = `${publicUrl.basePath}/api/auth`
  return {
    trustHost: true,
    secret,
    basePath,
    adapter: NeonAdapter(getPool() as never),
    session: { strategy: "database" },
    pages: {
      signIn: `${publicUrl.basePath}/account/`,
      error: `${publicUrl.basePath}/account/`,
      verifyRequest: `${publicUrl.basePath}/account/`,
    },
    providers: providers(),
    // Cookie path stays "/" (the Auth.js default) and no Domain is set.
    // Through the derekbraid.com rewrite the browser stores the cookie for
    // derekbraid.com, and Path=/ sends it back on /hockey-skills-and-drills.
    // Names are prefixed with hsd so they do not collide with another app on that host.
    cookies: {
      sessionToken: { name: `${prefix}hsd.session-token` },
      callbackUrl: { name: `${prefix}hsd.callback-url` },
      csrfToken: { name: `${secure ? "__Host-" : ""}hsd.csrf-token` },
      pkceCodeVerifier: { name: `${prefix}hsd.pkce.code_verifier` },
      state: { name: `${prefix}hsd.state` },
      nonce: { name: `${prefix}hsd.nonce` },
    },
    callbacks: {
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
        if (url.startsWith("/")) return `${baseUrl}${url}`
        try {
          if (new URL(url).origin === baseUrl) return url
        } catch {
          return baseUrl
        }
        return baseUrl
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

function providers() {
  const list: AuthConfig["providers"] = []
  if (googleReady()) {
    list.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
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
  if (process.env.EMAIL_DELIVERY === "console") {
    lastMagicLink = { email: to, url }
    console.log(`Magic link for ${to}: ${url}`)
    return
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
