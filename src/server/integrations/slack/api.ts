import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { safeEqual } from "../../auth/crypto";
import { getDb } from "../../db/client";
import { users } from "../../db/schema";

// Thin client over the Slack Web API using fetch. The app needs four methods, so the
// official SDK (and its dependency tree) is not worth carrying. See ADR 0007 in
// docs/DECISIONS.md.

type SlackResponse<T> = T & { ok: boolean; error?: string };

export function slackEnabled() {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}

export async function slackApi<T = object>(method: string, args: Record<string, unknown>): Promise<SlackResponse<T>> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body,
  });
  if (!response.ok) throw new Error(`Slack ${method}: HTTP ${response.status}`);
  return (await response.json()) as SlackResponse<T>;
}

/** Same as slackApi, but a `{ ok: false }` answer becomes an exception. */
export async function slackCall<T = object>(method: string, args: Record<string, unknown>) {
  const result = await slackApi<T>(method, args);
  if (!result.ok) throw new Error(`Slack ${method}: ${result.error}`);
  return result;
}

const MAX_CLOCK_SKEW_SECONDS = 60 * 5;

/**
 * Validates the `X-Slack-Signature` header (HMAC-SHA256 of `v0:timestamp:body`).
 * Requests older than five minutes are refused to block replays.
 */
export function verifySlackSignature(input: {
  signingSecret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number;
}) {
  const { signingSecret, timestamp, signature, rawBody } = input;
  if (!signingSecret || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  const now = input.now ?? Date.now() / 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return safeEqual(expected, signature);
}

/** Slack's mrkdwn needs these three characters escaped in user-provided text. */
export function escapeSlack(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Slack id of a BARCA user. Accounts are matched by e-mail the first time and the
 * result is stored, so the lookup happens once per person.
 */
export async function slackIdForUser(userId: string): Promise<string | null> {
  const db = await getDb();
  const [user] = await db
    .select({ email: users.email, slackUserId: users.slackUserId })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;
  if (user.slackUserId) return user.slackUserId;
  const found = await slackApi<{ user?: { id: string } }>("users.lookupByEmail", { email: user.email });
  if (!found.ok || !found.user) return null;
  await db.update(users).set({ slackUserId: found.user.id }).where(eq(users.id, userId));
  return found.user.id;
}

/** BARCA user behind a Slack id, matched by e-mail on first contact. */
export async function userIdForSlackId(slackUserId: string): Promise<string | null> {
  const db = await getDb();
  const [linked] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.slackUserId, slackUserId));
  if (linked) return linked.id;
  const info = await slackApi<{ user?: { profile?: { email?: string } } }>("users.info", { user: slackUserId });
  const email = info.ok ? info.user?.profile?.email?.toLowerCase() : undefined;
  if (!email) return null;
  const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!byEmail) return null;
  await db.update(users).set({ slackUserId }).where(eq(users.id, byEmail.id));
  return byEmail.id;
}

/** `channel` may be a channel id or a user id (which opens the app's DM with that person). */
export async function postSlackMessage(channel: string, text: string) {
  await slackCall("chat.postMessage", { channel, text, unfurl_links: false });
}
