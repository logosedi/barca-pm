import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { ApiTokens, PasswordForm, ProfileForm } from "@/components/settings-forms";
import { Card, PageHeader } from "@/components/ui";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import { requireUser } from "@/server/auth/session";
import { appUrl, integrations } from "@/server/config";
import { listApiTokens } from "@/server/services/tokens";
import { getProfile } from "@/server/services/users";

export const metadata: Metadata = { title: "Configurações" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const user = await requireUser();
  const [profile, tokens] = await Promise.all([getProfile(user), listApiTokens(user)]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader title="Configurações" description={`Seu papel é ${ROLE_LABELS[user.role]}. ${ROLE_DESCRIPTIONS[user.role]}`} />

      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Perfil</h2>
        <ProfileForm
          profile={{ name: profile.name, email: profile.email, notifySlack: profile.notifySlack }}
          slackConfigured={integrations.slack()}
          slackLinked={profile.slackUserId !== null}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Senha</h2>
        <PasswordForm />
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">Tokens de acesso para IA (MCP)</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500">
          Um token deixa um assistente de IA consultar o BARCA PM em seu nome: buscar tarefas, montar relatórios de
          progresso e, se você permitir, criar e atualizar tarefas. Ele enxerga só o que você enxerga.
        </p>
        <ApiTokens tokens={tokens} endpoint={`${appUrl()}/api/mcp`} />
      </Card>
    </div>
  );
}
