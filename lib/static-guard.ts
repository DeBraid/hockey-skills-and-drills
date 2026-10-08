const SENSITIVE_PREFIXES = ["/lib/", "/db/", "/scripts/", "/node_modules/", "/.git/", "/.github/"]

const SENSITIVE_FILES = new Set([
  "/package.json",
  "/package-lock.json",
  "/tsconfig.json",
  "/vercel.json",
  "/drills.json",
  "/.gitignore",
  "/.env",
  "/.env.example",
  "/.env.local",
  "/.env.production",
  "/middleware.ts",
  "/readme.md",
  "/setup-vercel.md",
  "/adding-a-drill.md",
])

const SENSITIVE_EXT = /\.(ts|tsx|mjs|cjs|py|sql|md|map)$/i

export function blockedStaticPath(pathname: string): boolean {
  const raw = pathname.split("?")[0]?.split("#")[0] || "/"
  let path = raw
  if (path.includes("%")) {
    try {
      path = decodeURIComponent(path)
    } catch {
      return true
    }
  }
  if (path.includes("\0") || path.includes("\\") || path.includes("..")) return true
  if (!path.startsWith("/")) path = `/${path}`
  path = path.replace(/\/{2,}/g, "/")
  const lower = path.toLowerCase()
  if (lower === "/.env" || lower.startsWith("/.env.")) return true
  if (SENSITIVE_FILES.has(lower)) return true
  for (const prefix of SENSITIVE_PREFIXES) {
    const bare = prefix.slice(0, -1)
    if (lower === bare || lower.startsWith(prefix)) return true
  }
  return SENSITIVE_EXT.test(lower)
}
