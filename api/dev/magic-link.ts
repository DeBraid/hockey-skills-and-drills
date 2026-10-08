import { handleMagicLink } from "../../lib/routes.js"

export default {
  fetch(): Response {
    return handleMagicLink()
  },
}
