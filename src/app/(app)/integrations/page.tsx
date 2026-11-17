import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { CopyField } from "@/components/copy-field";
import { RuleList } from "@/components/integration-forms";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SOURCE_LABELS, topicLabel } from "@/lib/integration-topics";
import { canManageIntegrations } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { appUrl, integrations } from "@/server/config";
import { listKnownTopics, listRecentEvents, listRules } from "@/server/services/automations";
import { listVisibleProjects } from "@/server/services/projects";
import { listAssignableUsers } from "@/server/services/users";

export const metadata: Metadata = { title: "Integrações" };

const EVENT_STATUS: Record<string, { label: string; color?: string }> = {
  processed: { label: "Gerou tarefa", color: "#22a06b" },
  ignored: { label: "Só contabilizado" },
  failed: { label: "Falhou", color: "#dc2626" },
  received: { label: "Recebido" },
};

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Integrations />
    </Suspense>
  );
}

async function Integrations() {
  const user = await requireUser();
  if (!canManageIntegrations(user)) notFound();
  const [rules, events, topics, projects, people] = await Promise.all([
    listRules(user),
    listRecentEvents(user),
    listKnownTopics(),
    listVisibleProjects(user),
    listAssignableUsers(),
  ]);
  const base = appUrl();
  const local = /\/\/(localhost|127\.0\.0\.1)/.test(base);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Integrações"
        description="Conexões com Slack, Shopify e Guru, e o acesso de assistentes de IA via MCP. As credenciais ficam em variáveis de ambiente do servidor, nunca no banco."
      />

      {local ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          O endereço público configurado é <strong>{base}</strong>. Slack, Shopify e Guru só conseguem chamar o BARCA PM por
          um endereço acessível na internet: defina <code>APP_URL</code> com o domínio de produção (ou um túnel, em testes)
          antes de cadastrar as URLs abaixo.
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IntegrationCard
          name="Slack"
          connected={integrations.slack()}
          summary="Criar tarefas com /barca ou pelos atalhos, e receber avisos por mensagem direta e no canal do projeto."
          env="SLACK_BOT_TOKEN e SLACK_SIGNING_SECRET"
          doc="docs/integrations/slack.md"
        >
          <CopyField label="Slash command /barca (Request URL)" value={`${base}/api/slack/commands`} />
          <CopyField label="Interactivity & Shortcuts (Request URL)" value={`${base}/api/slack/interactions`} />
          <p className="text-xs text-slate-500">
            As contas são casadas pelo e-mail: cada pessoa precisa usar no BARCA PM o mesmo e-mail do Slack.
          </p>
        </IntegrationCard>

        <IntegrationCard
          name="Assistentes de IA (MCP)"
          connected
          connectedLabel="Disponível"
          summary="Claude, Cursor e outros clientes MCP consultam tarefas, geram relatórios e, com permissão, criam e atualizam tarefas."
          doc="docs/integrations/mcp.md"
        >
          <CopyField label="Endpoint MCP (Streamable HTTP)" value={`${base}/api/mcp`} />
          <p className="text-xs text-slate-500">
            Cada pessoa cria o próprio token em{" "}
            <Link href="/settings" className="font-medium text-brand-700 underline">
              Configurações
            </Link>
            . O assistente enxerga exatamente o que o dono do token enxerga.
          </p>
        </IntegrationCard>

        <IntegrationCard
          name="Guru (Digital Manager Guru)"
          connected={integrations.guru()}
          summary="Recebe assinaturas e transações: alimenta os indicadores do painel e dispara regras de automação."
          env="GURU_API_TOKEN"
          doc="docs/integrations/guru.md"
        >
          <CopyField label="URL do webhook" value={`${base}/api/webhooks/guru`} />
        </IntegrationCard>

        <IntegrationCard
          name="Shopify"
          connected={integrations.shopify()}
          summary="Recebe pedidos, reembolsos e eventos de assinatura: alimenta os indicadores do painel e dispara regras de automação."
          env="SHOPIFY_WEBHOOK_SECRET"
          doc="docs/integrations/shopify.md"
        >
          <CopyField label="URL do webhook" value={`${base}/api/webhooks/shopify`} />
        </IntegrationCard>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">Regras de automação</h2>
        <p className="mt-1 mb-3 text-sm text-slate-500">
          Transformam um evento da Guru ou da Shopify em tarefa. Todo evento recebido entra nos indicadores do painel,
          com ou sem regra.
        </p>
        <RuleList
          rules={rules}
          options={{ topics, projects: projects.map(({ id, name }) => ({ id, name })), people }}
        />
      </Card>

      <Card className="overflow-hidden">
        <h2 className="px-5 pt-5 font-semibold text-slate-900">Eventos recentes</h2>
        <p className="px-5 pt-1 pb-3 text-sm text-slate-500">Os últimos 30 webhooks aceitos. Use para conferir se as plataformas estão entregando.</p>
        {events.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">Nenhum evento recebido ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-y border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 pl-5 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Evento</th>
                  <th className="px-3 py-2 font-medium">Resumo</th>
                  <th className="py-2 pr-5 pl-3 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((event) => {
                  const status = EVENT_STATUS[event.status] ?? { label: event.status };
                  return (
                    <tr key={event.id} className="align-top">
                      <td className="py-2 pr-3 pl-5 whitespace-nowrap text-slate-500">{formatDateTime(event.createdAt)}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-800">{SOURCE_LABELS[event.source]}</span>
                        <span className="block text-xs text-slate-500">{topicLabel(event.source, event.topic)}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{event.summary}</td>
                      <td className="py-2 pr-5 pl-3">
                        <Badge color={status.color}>{status.label}</Badge>
                        {event.detail ? <span className="mt-1 block text-xs text-slate-500">{event.detail}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function IntegrationCard({
  name,
  connected,
  connectedLabel = "Configurado",
  summary,
  env,
  doc,
  children,
}: {
  name: string;
  connected: boolean;
  connectedLabel?: string;
  summary: string;
  env?: string;
  doc: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{name}</h2>
        {connected ? <Badge color="#22a06b">{connectedLabel}</Badge> : <Badge>Não configurado</Badge>}
      </div>
      <p className="mt-1 text-sm text-slate-500">{summary}</p>
      <div className="mt-4 space-y-3">{children}</div>
      <p className="mt-4 text-xs text-slate-500">
        {env ? (
          <>
            {connected ? "Configurado pelas variáveis de ambiente" : "Para conectar, defina no servidor (e reinicie)"}{" "}
            <code className="text-slate-700">{env}</code>.{" "}
          </>
        ) : null}
        Passo a passo em <code className="text-slate-700">{doc}</code>.
      </p>
    </Card>
  );
}
