import { PRACTICE_DRILLS, type PracticeDrill } from "./practice-drills.js"

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface PracticePreview {
  title: string
  description: string
  image: string
  imageAlt: string
  drills: number
  minutes: number
}

function cleanMinutes(value: string): number | null {
  if (!value.trim()) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 180) return null
  return Math.round(n)
}

function cleanTitle(value: string | null): string {
  return (value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80)
}

// Reads the same d / m / t query the plan builder has always produced.
// Unknown slugs are skipped, and minutes stay aligned with the original list.
export function practiceSocial(search: string, origin: string, basePath = ""): PracticePreview | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const raw = params.get("d") || ""
  if (!raw.trim()) return null
  const slugs = raw.split(",")
  const minutesRaw = params.has("m") ? (params.get("m") || "").split(",") : null
  const title = cleanTitle(params.get("t"))
  const seen = new Set<string>()
  let drills = 0
  let minutes = 0
  let first: PracticeDrill | null = null
  for (let index = 0; index < slugs.length; index += 1) {
    const slug = slugs[index]?.trim() || ""
    if (!slug || !SLUG_RE.test(slug) || seen.has(slug)) continue
    const drill = PRACTICE_DRILLS[slug]
    if (!drill) continue
    seen.add(slug)
    drills += 1
    if (!first) first = drill
    if (minutesRaw && index < minutesRaw.length) {
      const value = cleanMinutes(minutesRaw[index] || "")
      if (value !== null) minutes += value
    }
  }
  if (!drills || !first) return null
  const root = basePath.replace(/\/$/, "")
  const drillLabel = drills === 1 ? "1 drill" : `${drills} drills`
  return {
    title: `${title || "Practice plan"} · Hockey Skills & Drills`,
    description: `${drillLabel} · ${minutes} min`,
    image: `${origin}${root}${first.png}`,
    imageAlt: first.alt,
    drills,
    minutes,
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function metaTag(attr: "name" | "property", key: string, value: string): string {
  return `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(value)}">`
}

export function socialMarkup(meta: PracticePreview, pageUrl: string): string {
  return [
    metaTag("name", "description", meta.description),
    metaTag("property", "og:type", "website"),
    metaTag("property", "og:title", meta.title),
    metaTag("property", "og:description", meta.description),
    metaTag("property", "og:url", pageUrl),
    metaTag("property", "og:image", meta.image),
    metaTag("property", "og:image:alt", meta.imageAlt),
    metaTag("name", "twitter:card", "summary_large_image"),
    metaTag("name", "twitter:title", meta.title),
    metaTag("name", "twitter:description", meta.description),
    metaTag("name", "twitter:image", meta.image),
    `<link rel="canonical" href="${escapeHtml(pageUrl)}">`,
  ].join("\n")
}

export function applyPracticeSocial(html: string, meta: PracticePreview, pageUrl: string): string {
  const start = "<!--practice-social-->"
  const end = "<!--/practice-social-->"
  const block = `${start}\n${socialMarkup(meta, pageUrl)}\n${end}`
  const i = html.indexOf(start)
  const j = html.indexOf(end)
  let next = html
  if (i !== -1 && j > i) next = html.slice(0, i) + block + html.slice(j + end.length)
  return next.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
}
