import type { Metadata } from "next";
import { Suspense } from "react";
import { MarkAllReadButton, NotificationList } from "@/components/notification-list";
import { PageSkeleton } from "@/components/page-skeleton";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { integrations } from "@/server/config";
import { listNotifications } from "@/server/services/notifications";

export const metadata: Metadata = { title: "Notificações" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const user = await requireUser();
  const notifications = await listNotifications(user);
  const unread = notifications.some((notification) => !notification.read);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeader
        title="Notificações"
        description={
          integrations.slack()
            ? "Avisos de tarefas atribuídas a você, comentários e mudanças de etapa. Os mesmos avisos chegam por mensagem direta no Slack."
            : "Avisos de tarefas atribuídas a você, comentários e mudanças de etapa."
        }
        actions={unread ? <MarkAllReadButton /> : null}
      />
      {notifications.length === 0 ? (
        <EmptyState title="Nada por aqui">Você será avisado quando alguém atribuir, comentar ou mover uma tarefa sua.</EmptyState>
      ) : (
        <>
          <NotificationList notifications={notifications} />
          {notifications.length >= 50 ? <p className="mt-3 text-center text-xs text-slate-400">Mostrando as 50 mais recentes.</p> : null}
        </>
      )}
    </div>
  );
}
