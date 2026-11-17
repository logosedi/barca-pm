import { requireActor } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getTaskDetail } from "@/server/services/tasks";

/** Task detail for the side panel, which loads on demand without a page navigation. */
export async function GET(_request: Request, context: RouteContext<"/api/tasks/[ref]">) {
  try {
    const actor = await requireActor();
    const { ref } = await context.params;
    return Response.json(await getTaskDetail(actor, ref), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
