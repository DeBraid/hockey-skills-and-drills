import { handleEvent } from "../lib/routes.js"

export default {
  fetch(request: Request): Promise<Response> {
    return handleEvent(request)
  },
}
