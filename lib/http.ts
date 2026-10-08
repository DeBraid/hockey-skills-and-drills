export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const next = new Headers(headers)
  next.set("content-type", "application/json; charset=utf-8")
  next.set("cache-control", "no-store")
  return new Response(JSON.stringify(data), { status, headers: next })
}

export function firstHeader(request: Request, name: string): string {
  const value = request.headers.get(name)
  if (!value) return ""
  return value.split(",")[0]?.trim() || ""
}

export function clientIp(request: Request): string {
  const real = firstHeader(request, "x-real-ip")
  if (real) return real.slice(0, 80)
  const forwarded = firstHeader(request, "x-forwarded-for")
  if (forwarded) return forwarded.slice(0, 80)
  return "local"
}
