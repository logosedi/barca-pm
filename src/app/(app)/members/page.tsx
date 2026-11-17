import type { Metadata } from "next";
import { Suspense } from "react";
import { InviteButton, MemberRow } from "@/components/member-forms";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, PageHeader } from "@/components/ui";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/constants";
import { canManageMembers } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { listMembers } from "@/server/services/users";

export const metadata: Metadata = { title: "Pessoas" };

export default function MembersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Members />
    </Suspense>
  );
}

async function Members() {
  const user = await requireUser();
  const canManage = canManageMembers(user);
  const all = await listMembers(user);
  // Deactivated accounts only matter to whoever can reactivate them.
  const members = canManage ? all : all.filter((member) => member.isActive);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Pessoas"
        description={
          user.role === "guest"
            ? "Como convidado, você vê apenas quem divide um time com você."
            : "Quem tem conta no BARCA PM e o que cada papel pode fazer."
        }
        actions={canManage ? <InviteButton /> : null}
      />

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left">
          <thead className="border-b border-slate-200 text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="py-2.5 pr-3 pl-4 font-medium">Pessoa</th>
              <th className="px-3 py-2.5 font-medium">Papel</th>
              <th className="px-3 py-2.5 font-medium">Times</th>
              <th className="px-3 py-2.5 font-medium">Conta</th>
              {canManage ? <th className="py-2.5 pr-4 pl-3" aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((member) => (
              <MemberRow key={member.id} member={member} canManage={canManage} isSelf={member.id === user.id} />
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 font-semibold text-slate-900">O que cada papel pode fazer</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {ROLES.map((role) => (
            <div key={role}>
              <dt className="text-sm font-medium text-slate-800">{ROLE_LABELS[role]}</dt>
              <dd className="text-sm text-slate-500">{ROLE_DESCRIPTIONS[role]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-slate-500">
          Além do papel, quem é <strong className="font-medium text-slate-700">líder</strong> de um time gerencia os
          integrantes e os projetos desse time. A tabela completa está em docs/PERMISSIONS.md.
        </p>
      </Card>
    </div>
  );
}
