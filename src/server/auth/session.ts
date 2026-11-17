import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Actor } from "@/lib/permissions";
import { AppError } from "../errors";
import { createSession, deleteSession, findActorBySessionToken } from "../services/users";

// Sessions are opaque random tokens in an httpOnly cookie, stored hashed in the
// database. Revoking one (logout, deactivated account) takes effect immediately,
// which stateless JWTs cannot do without an extra denylist.

const SESSION_COOKIE = "barca_session";

/** Current user for this request, or null. Deduplicated per request by React. */
export const getCurrentUser = cache(async (): Promise<Actor | null> => {
  // Everything behind a session is per-request data. Reading the cookie alone still
  // lets Next try to prerender what follows (for prefetching), and the database must
  // never be touched during a prerender; `connection()` rules that out explicitly.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? findActorBySessionToken(token) : null;
});

/** For pages: sends anonymous visitors to the login screen. */
export async function requireUser(): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For Server Actions and Route Handlers: fails instead of redirecting. */
export async function requireActor(): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("unauthorized", "Sua sessão expirou. Entre novamente.");
  return user;
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
}
