import { Lock, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProjectView } from "@/components/project-view";
import { Badge } from "@/components/ui";
import { TEMPLATES } from "@/lib/templates";
import { todayISO } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { orNotFound } from "@/server/page";
import { getProject } from "@/server/services/projects";
import { listAssigneeOptions, listProjectTasks } from "@/server/services/tasks";

export const metadata: Metadata = { title: "Projeto" };

export default function ProjectPage({ params }: PageProps<"/projects/[key]">) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <Project params={params} />
    </Suspense>
  );
}

async function Project({ params }: Pick<PageProps<"/projects/[key]">, "params">) {
  const user = await requireUser();
  const { key } = await params;
  const project = await orNotFound(getProject(user, key));
  const tasks = await listProjectTasks(user, project.id);
  const assignees = await listAssigneeOptions(
    user,
    { teamId: project.team.id, visibility: project.visibility },
    tasks.map((task) => task.assignee?.id),
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
            <Badge>{project.key}</Badge>
            <Badge color={project.team.color}>{project.team.name}</Badge>
            {project.visibility === "team" ? (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500" title="Só o time e a gestão enxergam este projeto">
                <Lock className="size-3.5" />
                Restrito ao time
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">{project.description || TEMPLATES[project.discipline].description}</p>
        </div>
        {project.canManage ? (
          <Link
            href={`/projects/${project.key}/settings`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings className="size-4" />
            Configurar
          </Link>
        ) : null}
      </header>
      <div className="min-h-0 flex-1">
        <ProjectView project={project} tasks={tasks} assignees={assignees} currentUserId={user.id} today={todayISO()} />
      </div>
    </div>
  );
}

function ProjectSkeleton() {
  return (
    <div className="p-6" aria-busy="true">
      <div className="h-7 w-64 animate-pulse rounded bg-slate-200" />
      <div className="mt-8 flex gap-3">
        {[0, 1, 2, 3].map((column) => (
          <div key={column} className="h-80 w-72 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    </div>
  );
}
