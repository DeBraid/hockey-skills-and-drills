import { handleHealth } from "../lib/routes.js"

export default {
  fetch(): Response {
    return handleHealth()
  },
}
