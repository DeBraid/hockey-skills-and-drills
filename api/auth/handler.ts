import { handleAuth } from "../../lib/auth.js"

export default {
  fetch(request: Request): Promise<Response> {
    return handleAuth(request)
  },
}
