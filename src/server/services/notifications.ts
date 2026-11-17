import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "@/lib/permissions";
import type { NotificationInfo } from "@/lib/types";
import { taskRef } from "@/lib/utils";
import { runInBackground } from "../background";
import { taskUrl } from "../config";
import { getDb } from "../db/client";
import { notifications, projects, tasks, users } from "../db/schema";
import { escapeSlack, postSlackMessage, slackEnabled, slackIdForUser } from "../integrations/slack/api";

export type NotificationType = "assigned" | "commented" | "status_changed";

interface NotifyInput {
  /** User ids. The actor and duplicates are removed here. */
  recipients: (string | null | undefined)[];
  actorId: string | null;
  type: NotificationType;
  task: { id: string; ref: string; title: string };
  /** Sentence without the task reference, e.g. "Ana atribuiu a você". */
  message: string;
}

/**
 * Records an in-app notification for each recipient and, when Slack is connected,
 * sends the same text as a direct message. The Slack part never blocks the caller.
 */
export async function notify(input: NotifyInput) {
  const recipients = [...new Set(input.recipients)].filter(
    (id): id is string => typeof id === "string" && id !== input.actorId,
  );
  if (recipients.length === 0) return;
  const db = await getDb();
  const text = `${input.message}: ${input.task.ref} ${input.task.title}`;
  await db.insert(notifications).values(
    recipients.map((userId) => ({
      userId,
      actorId: input.actorId,
      taskId: input.task.id,
      type: input.type,
      message: text,
    })),
  );

  if (!slackEnabled()) return;
  runInBackground("notificações no Slack", async () => {
    const wanted = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, recipients), eq(users.notifySlack, true), eq(users.isActive, true)));
    const slackText = `${escapeSlack(input.message)}: <${taskUrl(input.task.ref)}|${escapeSlack(`${input.task.ref} ${input.task.title}`)}>`;
    await Promise.all(
      wanted.map(async ({ id }) => {
        const slackId = await slackIdForUser(id);
        if (slackId) await postSlackMessage(slackId, slackText);
      }),
    );
  });
}

/** Posts to the Slack channel linked to a project, if there is one. */
export function announceInProjectChannel(channelId: string | null, message: string, task: { ref: string; title: string }) {
  if (!channelId || !slackEnabled()) return;
  runInBackground("aviso no canal do projeto", () =>
    postSlackMessage(
      channelId,
      `${escapeSlack(message)}: <${taskUrl(task.ref)}|${escapeSlack(`${task.ref} ${task.title}`)}>`,
    ),
  );
}

export async function listNotifications(actor: Actor, limit = 50): Promise<NotificationInfo[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      message: notifications.message,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      taskNumber: tasks.number,
      projectKey: projects.key,
    })
    .from(notifications)
    .leftJoin(tasks, eq(notifications.taskId, tasks.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(notifications.userId, actor.id))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    message: row.message,
    taskRef: row.projectKey && row.taskNumber ? taskRef(row.projectKey, row.taskNumber) : null,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countUnreadNotifications(actor: Actor) {
  const db = await getDb();
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return row.value;
}

export async function markNotificationsRead(actor: Actor, notificationId?: string) {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, actor.id),
        isNull(notifications.readAt),
        notificationId ? eq(notifications.id, notificationId) : undefined,
      ),
    );
}
