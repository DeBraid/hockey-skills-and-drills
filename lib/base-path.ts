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

export function canonicalHost(): string {
  return (process.env.CANONICAL_HOST || "").trim().toLowerCase().split(":")[0] || ""
}

function hostnameOf(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "")
}

export function resolvePublicUrl(request: Request): PublicUrl {
  const incoming = new URL(request.url)
  const forwardedHost = firstHeader(request, "x-forwarded-host")
  const hostHeader = firstHeader(request, "host")
  const host = forwardedHost || hostHeader || incoming.host
  const protoHeader = firstHeader(request, "x-forwarded-proto").replace(/:$/, "")
  const protocol = protoHeader || incoming.protocol.replace(":", "") || "https"
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
