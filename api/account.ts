import { handleAccount } from "../lib/routes.js"

export default {
  fetch(request: Request): Promise<Response> {
    return handleAccount(request)
  },
}
