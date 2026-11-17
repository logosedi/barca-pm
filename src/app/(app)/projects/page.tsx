import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { NewProjectButton } from "@/components/project-forms";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { canCreateProject } from "@/lib/permissions";
import { TEMPLATES } from "@/lib/templates";
import { requireUser } from "@/server/auth/session";
import { listVisibleProjects } from "@/server/services/projects";
import { listTeams } from "@/server/services/teams";

export const metadata: Metadata = { title: "Projetos" };

export default function ProjectsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Projects />
    </Suspense>
  );
}

async function Projects() {
  const user = await requireUser();
  const [projects, teams] = await Promise.all([listVisibleProjects(user), listTeams(user)]);
  const ownTeams = teams.filter((team) => canCreateProject(user, team.id));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Projetos"
        description="Cada projeto pertence a um time e tem o seu próprio fluxo de etapas."
        actions={
          ownTeams.length > 0 ? (
            <NewProjectButton teams={ownTeams.map((team) => ({ id: team.id, name: team.name, discipline: team.discipline }))} />
          ) : null
        }
      />
      {projects.length === 0 ? (
        <EmptyState title="Nenhum projeto visível para você">
          {ownTeams.length > 0
            ? "Crie o primeiro projeto para começar a organizar as tarefas."
            : teams.length === 0 && user.role !== "guest"
              ? "Ainda não há times. Um gestor ou administrador precisa criar um time antes do primeiro projeto."
              : "Gestores e líderes de time criam projetos. Peça acesso a quem administra o BARCA PM."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const total = project.openTasks + project.doneTasks;
            const percent = total === 0 ? 0 : Math.round((project.doneTasks / total) * 100);
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.key}`}
                  className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold text-slate-900">{project.name}</h2>
                    <Badge>{project.key}</Badge>
                    {project.visibility === "team" ? (
                      <Lock className="size-3.5 shrink-0 text-slate-400" aria-label="Restrito ao time" />
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-500">
                    {project.description || TEMPLATES[project.discipline].description}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <Badge color={project.team.color}>{project.team.name}</Badge>
                    <span>
                      {project.openTasks} {project.openTasks === 1 ? "aberta" : "abertas"} · {project.doneTasks}{" "}
                      {project.doneTasks === 1 ? "concluída" : "concluídas"}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${percent}% concluído`}
                  >
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
