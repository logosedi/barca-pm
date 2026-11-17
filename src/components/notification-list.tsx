"use client";

import { markNotificationsReadAction } from "@/app/actions/app";
import type { NotificationInfo } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { openTask } from "./task-link";
import { Button, useAction } from "./ui";

export function MarkAllReadButton() {
  const { pending, run } = useAction();
  return (
    <Button disabled={pending} onClick={() => run(() => markNotificationsReadAction())}>
      Marcar todas como lidas
    </Button>
  );
}

export function NotificationList({ notifications }: { notifications: NotificationInfo[] }) {
  const { run } = useAction();

  function open(notification: NotificationInfo) {
    if (notification.taskRef) openTask(notification.taskRef);
    if (!notification.read) run(() => markNotificationsReadAction(notification.id));
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {notifications.map((notification) => (
        <li key={notification.id}>
          <button
            type="button"
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
            onClick={() => open(notification)}
          >
            <span
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", notification.read ? "bg-transparent" : "bg-brand-600")}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm", notification.read ? "text-slate-600" : "font-medium text-slate-900")}>
                {notification.message}
                {notification.read ? null : <span className="sr-only"> (não lida)</span>}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                {formatDateTime(notification.createdAt)}
                {notification.taskRef ? "" : " · a tarefa foi excluída"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
