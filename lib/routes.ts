import { accountsReady, emailReady, googleReady, handleAuth, peekMagicLink, readSession } from "./auth.js"
import { json } from "./http.js"
import { createPlan, deletePlan, getPlan, listPlans, PlanInputError, updatePlan } from "./plans.js"

export function handleHealth(): Response {
  return json({
    ok: true,
    accounts: accountsReady(),
    google: googleReady(),
    email: emailReady(),
  })
}

export function handleMagicLink(): Response {
  if (process.env.EMAIL_DELIVERY !== "console") {
    return new Response("Not found", { status: 404 })
  }
  const link = peekMagicLink()
  if (!link) return json({ email: null, url: null })
  return json(link)
}

export async function handlePlansCollection(request: Request): Promise<Response> {
  const user = await readSession(request)
  if (!user) return json({ error: "Sign in required." }, 401)
  try {
    if (request.method === "GET") return json({ plans: await listPlans(user.id) })
    if (request.method === "POST") return json({ plan: await createPlan(user.id, await readBody(request)) }, 201)
    return json({ error: "Method not allowed." }, 405)
  } catch (error) {
    return planError(error)
  }
}

export async function handlePlanItem(request: Request): Promise<Response> {
  const user = await readSession(request)
  if (!user) return json({ error: "Sign in required." }, 401)
  const id = planId(request)
  if (!id) return json({ error: "Plan not found." }, 404)
  try {
    if (request.method === "GET") {
      const plan = await getPlan(user.id, id)
      if (!plan) return json({ error: "Plan not found." }, 404)
      return json({ plan })
    }
    if (request.method === "PATCH") {
      const plan = await updatePlan(user.id, id, await readBody(request))
      if (!plan) return json({ error: "Plan not found." }, 404)
      return json({ plan })
    }
    if (request.method === "DELETE") {
      const removed = await deletePlan(user.id, id)
      if (!removed) return json({ error: "Plan not found." }, 404)
      return json({ ok: true })
    }
    return json({ error: "Method not allowed." }, 405)
  } catch (error) {
    return planError(error)
  }
}

export { handleAuth }

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new PlanInputError("Could not read that plan.")
  }
}

function planId(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean)
  const index = parts.lastIndexOf("plans")
  if (index === -1 || index + 1 >= parts.length) return ""
  return decodeURIComponent(parts[index + 1] || "")
}

function planError(error: unknown): Response {
  if (error instanceof PlanInputError) return json({ error: error.message }, 400)
  console.error(error)
  return json({ error: "Could not reach the plans database." }, 500)
}
