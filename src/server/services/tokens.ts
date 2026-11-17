import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { TOKEN_SCOPES, type TokenScope } from "@/lib/constants";
import type { Actor } from "@/lib/permissions";
import type { ApiTokenInfo } from "@/lib/types";
import { randomToken, sha256 } from "../auth/crypto";
import { getDb } from "../db/client";
import { apiTokens } from "../db/schema";
import { invalid } from "../errors";
import { loadActor } from "./users";

// Personal access tokens for the MCP endpoint. A token acts as its owner: every call
// goes through the same permission checks as the web app, further limited by scope.

const TOKEN_PREFIX = "barca_pat_";

export async function createApiToken(actor: Actor, input: { name: string; scope: string }) {
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Dê um nome ao token, como “Claude no meu notebook”.").max(60, "O nome é longo demais."),
      scope: z.enum(TOKEN_SCOPES),
    })
    .safeParse(input);
  if (!parsed.success) throw invalid(parsed.error.issues[0].message);
  const token = TOKEN_PREFIX + randomToken();
  const db = await getDb();
  await db.insert(apiTokens).values({
    userId: actor.id,
    name: parsed.data.name,
    scope: parsed.data.scope,
    tokenHash: sha256(token),
    prefix: token.slice(0, TOKEN_PREFIX.length + 6),
  });
  // The plain token is returned once and never stored.
  return token;
}

export async function listApiTokens(actor: Actor): Promise<ApiTokenInfo[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, actor.id), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function revokeApiToken(actor: Actor, tokenId: string) {
  const db = await getDb();
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, actor.id)));
}

/** Resolves an `Authorization: Bearer` header to the token owner, or null. */
export async function authenticateApiToken(header: string | null): Promise<{ actor: Actor; scope: TokenScope } | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
  if (!token?.startsWith(TOKEN_PREFIX)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, sha256(token)), isNull(apiTokens.revokedAt)));
  if (!row) return null;
  const actor = await loadActor(row.userId);
  if (!actor) return null;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  return { actor, scope: row.scope };
}
