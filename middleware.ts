// Blocks source and config files if the deployment still publishes the repo root.
// The static site is built into public/ (see vercel.json outputDirectory). This
// only runs for paths that are not pages, media, or API routes, and it always
// answers 404 so a normal request never depends on this file.

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
  ],
}

export default function middleware(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  })
}
