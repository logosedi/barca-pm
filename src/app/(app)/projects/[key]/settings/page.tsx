import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { ProjectSettings } from "@/components/project-settings";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { integrations } from "@/server/config";
import { orNotFound } from "@/server/page";
import { getProject } from "@/server/services/projects";

export const metadata: Metadata = { title: "Configurar projeto" };

export default function ProjectSettingsPage({ params }: PageProps<"/projects/[key]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: Pick<PageProps<"/projects/[key]/settings">, "params">) {
  const user = await requireUser();
  const { key } = await params;
  const project = await orNotFound(getProject(user, key));
  if (!project.canManage) notFound();

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href={`/projects/${project.key}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Voltar para {project.name}
      </Link>
      <PageHeader title={`Configurar ${project.name}`} description={`Projeto ${project.key} · time ${project.team.name}`} />
      <ProjectSettings project={project} slackConnected={integrations.slack()} />
    </div>
  );
}
