import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { NewTeamButton, TeamCard } from "@/components/team-forms";
import { EmptyState, PageHeader } from "@/components/ui";
import { canCreateTeam, canManageTeam } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { listTeams } from "@/server/services/teams";
import { listMembers } from "@/server/services/users";

export const metadata: Metadata = { title: "Times" };

export default function TeamsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Teams />
    </Suspense>
  );
}

async function Teams() {
  const user = await requireUser();
  const [teams, members] = await Promise.all([listTeams(user), listMembers(user)]);
  const people = members.filter((member) => member.isActive);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Times"
        description="Os times agrupam pessoas por disciplina. Projetos restritos só aparecem para o time dono; líderes gerenciam o time e os projetos dele."
        actions={canCreateTeam(user) ? <NewTeamButton /> : null}
      />
      {teams.length === 0 ? (
        <EmptyState title="Nenhum time ainda">
          {canCreateTeam(user)
            ? "Crie um time para cada área: Tecnologia, Marketing, Editorial, Social Media, YouTube, Criação de Conteúdo…"
            : "Você ainda não faz parte de nenhum time."}
        </EmptyState>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {teams.map((team) => {
            const canManage = canManageTeam(user, team.id);
            const inTeam = new Set(team.members.map((member) => member.id));
            return (
              <TeamCard
                key={team.id}
                team={team}
                canManage={canManage}
                canDelete={canCreateTeam(user)}
                candidates={
                  canManage
                    ? people.filter((person) => !inTeam.has(person.id)).map(({ id, name, role }) => ({ id, name, guest: role === "guest" }))
                    : []
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
