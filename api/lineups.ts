import { handleLineups } from "../lib/lineup-routes.js"

export default {
  fetch(request: Request): Promise<Response> {
    return handleLineups(request)
  },
}
