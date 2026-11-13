// Blocks source and config files if the deployment still publishes the repo root.
// The static site is built into public/ (see vercel.json outputDirectory).
// /practice is the exception: shared plans are query strings, so this injects
// Open Graph tags for the link preview before the static page is served.
// Every other matched path still answers 404.

import { resolvePublicUrl } from "./lib/base-path.js"
import { applyPracticeSocial, practiceSocial } from "./lib/practice-meta.js"

export const config = {
  matcher: [
    "/lib",
    "/lib/:path*",
    "/db",
    "/db/:path*",
    "/scripts",
    "/scripts/:path*",
    "/node_modules/:path*",
    "/(.*)\\.ts",
    "/(.*)\\.mjs",
    "/(.*)\\.py",
    "/(.*)\\.sql",
    "/(.*)\\.md",
    "/package.json",
    "/package-lock.json",
    "/tsconfig.json",
    "/vercel.json",
    "/drills.json",
    "/.env",
    "/.env.local",
    "/.env.example",
    "/.env.production",
    "/.gitignore",
    "/middleware.ts",
    "/README.md",
    "/SETUP-VERCEL.md",
    "/ADDING-A-DRILL.md",
    "/practice",
    "/practice/",
    "/hockey-skills-and-drills/practice",
    "/hockey-skills-and-drills/practice/",
  ],
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  })
}

function passThrough(): Response {
  return new Response(null, {
    headers: { "x-middleware-next": "1" },
  })
}

function isPracticePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/"
  return path === "/practice" || path.endsWith("/practice")
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (isPracticePath(url.pathname)) return renderPractice(request)
  return notFound()
}

async function renderPractice(request: Request): Promise<Response> {
  const pub = resolvePublicUrl(request)
  const meta = practiceSocial(pub.url.search, pub.origin, pub.basePath)
  if (!meta) return passThrough()
  const shellUrl = new URL("/practice/shell.html", request.url)
  let shell: Response
  try {
    shell = await fetch(shellUrl, { redirect: "manual" })
  } catch {
    return passThrough()
  }
  if (!shell.ok) return passThrough()
  const html = applyPracticeSocial(await shell.text(), meta, pub.url.href)
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=120",
      "x-content-type-options": "nosniff",
    },
  })
}
