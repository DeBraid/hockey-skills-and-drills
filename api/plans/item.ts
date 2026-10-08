import { handlePlanItem } from "../../lib/routes.js"

export default {
  fetch(request: Request): Promise<Response> {
    return handlePlanItem(request)
  },
}
