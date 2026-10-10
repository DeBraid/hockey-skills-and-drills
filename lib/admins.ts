// Admin allowlist from the ADMIN_EMAILS environment variable (comma-separated).
// Server-only. The list itself is never sent to browsers.

export function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || ""
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.includes("@"))
  )
}

export function isAdminEmail(email: unknown): boolean {
  if (typeof email !== "string" || !email) return false
  const allowed = adminEmails()
  return allowed.size > 0 && allowed.has(email.trim().toLowerCase())
}
