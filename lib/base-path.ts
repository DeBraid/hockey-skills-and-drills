import { firstHeader } from "./http.js"

export interface PublicUrl {
  origin: string
  host: string
  protocol: string
  basePath: string
  url: URL
}

export function configuredBasePath(): string {
  const raw = (process.env.BASE_PATH || "").trim()
  if (!raw || raw === "/") return ""
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`
  const path = withSlash.replace(/\/+$/, "")
  if (!/^\/[A-Za-z0-9._~/-]+$/.test(path)) return ""
  return path
}

const PRODUCTION_HOSTS = new Set([
  "hockey.derekbraid.com",
  "hockey-skills-and-drills.vercel.app",
])

export function canonicalHost(): string {
  return hostnameOf(process.env.CANONICAL_HOST || "")
}

export function hostnameOf(host: string): string {
  const trimmed = host.trim().toLowerCase()
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]")
    return end === -1 ? "" : trimmed.slice(0, end + 1)
  }
  return trimmed.replace(/:\d+$/, "")
}

function portOf(host: string): string {
  const trimmed = host.trim().toLowerCase()
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]")
    if (end === -1 || trimmed[end + 1] !== ":") return ""
    return trimmed.slice(end + 2)
  }
  const match = trimmed.match(/:(\d+)$/)
  return match?.[1] || ""
}

function isLocalHost(name: string): boolean {
  return name === "localhost" || name === "127.0.0.1" || name === "::1" || name === "[::1]"
}

export function isTrustedHost(host: string): boolean {
  const name = hostnameOf(host)
  if (!name || name.length > 253 || !/^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/.test(name)) return false
  if (isLocalHost(name) || PRODUCTION_HOSTS.has(name)) return true
  const canonical = canonicalHost()
  if (canonical && name === canonical) return true
  const configured = [
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
  ]
  return configured.some((value) => value && hostnameOf(value) === name)
}

function forwardedHostAllowed(host: string): boolean {
  if (!isTrustedHost(host)) return false
  const port = portOf(host)
  if (!port) return true
  if (isLocalHost(hostnameOf(host))) return true
  return port === "80" || port === "443"
}

function protocolFor(host: string, hinted: string, incoming: string): string {
  if (!isLocalHost(hostnameOf(host))) return "https"
  if (hinted === "http" || hinted === "https") return hinted
  if (incoming === "http" || incoming === "https") return incoming
  return "http"
}

const SEGMENT = /^[A-Za-z0-9_-]+$/

function safeSegments(value: string): string {
  let decoded = value
  if (decoded.includes("%")) {
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      return ""
    }
  }
  const parts = decoded.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean)
  if (!parts.length || parts.some((part) => !SEGMENT.test(part))) return ""
  return parts.join("/")
}

export function routedUrl(request: Request): URL {
  const url = new URL(request.url)
  const authHint = url.searchParams.get("__auth")
  if (authHint !== null) {
    const suffix = safeSegments(authHint)
    if (suffix) url.pathname = `/api/auth/${suffix}`
    url.searchParams.delete("__auth")
  }
  const planHint = url.searchParams.get("__plan")
  if (planHint !== null) {
    const id = safeSegments(planHint)
    if (id && !id.includes("/")) url.pathname = `/api/plans/${id}`
    url.searchParams.delete("__plan")
  }
  return url
}

export function resolvePublicUrl(request: Request): PublicUrl {
  const incoming = routedUrl(request)
  const forwardedHost = firstHeader(request, "x-forwarded-host")
  const hostHeader = firstHeader(request, "host")
  let host = incoming.host
  if (forwardedHost && forwardedHostAllowed(forwardedHost)) host = forwardedHost
  else if (hostHeader && forwardedHostAllowed(hostHeader)) host = hostHeader
  const protoHeader = firstHeader(request, "x-forwarded-proto").replace(/:$/, "")
  const protocol = protocolFor(host, protoHeader, incoming.protocol.replace(":", ""))
  const origin = `${protocol}://${host}`
  const basePath = basePathFor(host, incoming.pathname)
  let pathname = incoming.pathname
  if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
    pathname = `${basePath}${pathname.startsWith("/") ? pathname : `/${pathname}`}`
  }
  const url = new URL(`${pathname}${incoming.search}`, origin)
  return { origin, host, protocol, basePath, url }
}

function basePathFor(host: string, pathname: string): string {
  const configured = configuredBasePath()
  if (!configured) return ""
  if (pathname === configured || pathname.startsWith(`${configured}/`)) return configured
  const canonical = canonicalHost()
  if (canonical && hostnameOf(host) === canonical) return configured
  return ""
}
