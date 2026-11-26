import { handleAdmin } from "../lib/admin.js"
import { handleU11SelectStats, handleU11Stats } from "../lib/stats-u11.js"

export default {
  fetch(request: Request): Promise<Response> {
    const view = new URL(request.url).searchParams.get("__admin")
    if (view === "u11") return handleU11Stats(request)
    if (view === "u11-select") return handleU11SelectStats(request)
    return handleAdmin(request)
  },
}
