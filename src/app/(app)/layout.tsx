import { Suspense, type ReactNode } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { TaskPanelHost } from "@/components/task-panel";
import { Toaster } from "@/components/toast";
import { canManageIntegrations } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { countUnreadNotifications } from "@/server/services/notifications";
import { listVisibleProjects } from "@/server/services/projects";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col md:flex-row">
      <Suspense fallback={<div className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block" />}>
        <Sidebar />
      </Suspense>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      {/* Reads the URL (?task=REF), so it stays out of the prerendered shell. */}
      <Suspense>
        <TaskPanelHost />
      </Suspense>
      <Toaster />
    </div>
  );
}

async function Sidebar() {
  const user = await requireUser();
  const [projects, unread] = await Promise.all([listVisibleProjects(user), countUnreadNotifications(user)]);
  return (
    <SidebarNav
      user={{ id: user.id, name: user.name, role: user.role }}
      projects={projects.map((project) => ({ key: project.key, name: project.name, color: project.team.color }))}
      unread={unread}
      showIntegrations={canManageIntegrations(user)}
    />
  );
}
