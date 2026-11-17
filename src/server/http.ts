import { unstable_rethrow } from "next/navigation";
import { refresh } from "next/cache";
import type { Actor } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { requireActor } from "./auth/session";
import { AppError, HTTP_STATUS } from "./errors";

const GENERIC_ERROR = "Algo deu errado do nosso lado. Tente novamente.";

/** Maps a thrown error to a JSON response, without leaking unexpected error details. */
export function errorResponse(error: unknown) {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: HTTP_STATUS[error.code] });
  console.error("[api] erro inesperado:", error);
  return Response.json({ error: GENERIC_ERROR }, { status: 500 });
}

/**
 * Cookie-authenticated Route Handlers that change data must reject cross-site
 * requests. (Server Actions get the same Origin check from Next itself.)
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Wrapper for Server Actions that are called from client code: authenticates, runs
 * the work, refreshes the page data and reports expected failures as a value the UI
 * can show instead of an exception.
 */
export async function runAction<T>(work: (actor: Actor) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const actor = await requireActor();
    const data = await work(actor);
    refresh();
    return { ok: true, data };
  } catch (error) {
    // redirect() and notFound() are implemented as exceptions: let Next handle them.
    unstable_rethrow(error);
    if (error instanceof AppError) return { ok: false, error: error.message };
    console.error("[action] erro inesperado:", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
