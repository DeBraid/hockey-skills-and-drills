import { handleAdmin } from "../lib/admin.js"

export default {
  fetch(request: Request): Promise<Response> {
    return handleAdmin(request)
  },
}
