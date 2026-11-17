import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReportTaskList, WeeklyChart } from "@/components/dashboard-charts";
import { PageSkeleton } from "@/components/page-skeleton";
import { TaskRows } from "@/components/task-rows";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { STATUS_CATEGORIES, STATUS_CATEGORY_COLORS, STATUS_CATEGORY_LABELS } from "@/lib/constants";
import { SOURCE_LABELS, TOPICS } from "@/lib/integration-topics";
import { canManageIntegrations, canViewBusinessMetrics } from "@/lib/permissions";
import { cn, formatDay, formatMoney, todayISO } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getBusinessMetrics, type BusinessMetrics } from "@/server/services/automations";
import { getWorkspaceReport } from "@/server/services/reports";
import { listMyTasks } from "@/server/services/tasks";
import { listTeams } from "@/server/services/teams";

export const metadata: Metadata = { title: "Painel" };

const OVERDUE_SHOWN = 8;

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const user = await requireUser();
  const { team } = await searchParams;
  const teams = await listTeams(user);
  const selected = typeof team === "string" ? teams.find((item) => item.id === team) : undefined;

  const [report, myTasks] = await Promise.all([getWorkspaceReport(user, { teamId: selected?.id }), listMyTasks(user)]);
  const business = canViewBusinessMetrics(user) && !selected ? await getBusinessMetrics(user, report.from, report.to) : null;
  const { totals } = report;
  const today = todayISO();
  const delta = totals.completed - totals.completedPrevious;
  const openByCategory = STATUS_CATEGORIES.filter((category) => category !== "done");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}`}
        description={`Progresso ${selected ? `do time ${selected.name}` : "dos projetos que você enxerga"}. Período: ${formatDay(report.from)} a ${formatDay(report.to, true)} (30 dias).`}
      />

      {teams.length > 1 ? (
        <nav aria-label="Filtrar por time" className="mb-5 flex flex-wrap gap-1.5">
          <TeamFilter href="/" active={!selected} label="Todos os times" />
          {teams.map((item) => (
            <TeamFilter key={item.id} href={`/?team=${item.id}`} active={selected?.id === item.id} label={item.name} color={item.color} />
          ))}
        </nav>
      ) : null}

      {report.projects.length === 0 ? (
        <EmptyState title="Ainda não há projetos para acompanhar">
          Quando houver projetos visíveis para você, o progresso deles aparece aqui.{" "}
          <Link href="/projects" className="font-medium text-brand-700 underline">
            Ver projetos
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Tarefas abertas" value={totals.open} detail={`${totals.inProgress} em andamento`} />
            <Kpi
              label="Atrasadas"
              value={totals.overdue}
              tone={totals.overdue > 0 ? "bad" : "good"}
              detail={totals.overdue > 0 ? "abertas com prazo vencido" : "nenhum prazo vencido"}
            />
            <Kpi
              label="Concluídas no período"
              value={totals.completed}
              detail={
                delta === 0
                  ? "igual aos 30 dias anteriores"
                  : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} em relação aos 30 dias anteriores`
              }
            />
            <Kpi
              label="Tempo médio de entrega"
              value={totals.averageCycleDays === null ? "–" : `${String(totals.averageCycleDays).replace(".", ",")} d`}
              detail={totals.averageCycleDays === null ? "nada concluído no período" : "da criação à conclusão"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="font-semibold text-slate-900">Criadas e concluídas por semana</h2>
              <p className="mb-3 text-sm text-slate-500">Últimas 8 semanas. Quando as criadas superam as concluídas, a fila cresce.</p>
              <WeeklyChart data={report.weekly} />
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold text-slate-900">Tarefas abertas por situação</h2>
              <p className="mb-4 text-sm text-slate-500">Cada time nomeia as etapas do seu jeito; aqui elas são somadas por categoria.</p>
              {totals.open === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma tarefa aberta.</p>
              ) : (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                    {openByCategory.map((category) => (
                      <div
                        key={category}
                        style={{ width: `${(report.byCategory[category] / totals.open) * 100}%`, backgroundColor: STATUS_CATEGORY_COLORS[category] }}
                      />
                    ))}
                  </div>
                  <dl className="mt-4 space-y-2 text-sm">
                    {openByCategory.map((category) => (
                      <div key={category} className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: STATUS_CATEGORY_COLORS[category] }} />
                        <dt className="flex-1 text-slate-600">{STATUS_CATEGORY_LABELS[category]}</dt>
                        <dd className="font-semibold text-slate-900 tabular-nums">{report.byCategory[category]}</dd>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: STATUS_CATEGORY_COLORS.done }} />
                      <dt className="flex-1 text-slate-600">Concluídas (desde o início)</dt>
                      <dd className="font-semibold text-slate-900 tabular-nums">{report.byCategory.done}</dd>
                    </div>
                  </dl>
                </>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <h2 className="px-5 pt-5 pb-3 font-semibold text-slate-900">Progresso por projeto</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-y border-slate-100 text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 pl-5 font-medium">Projeto</th>
                      <th className="px-3 py-2 text-right font-medium">Abertas</th>
                      <th className="px-3 py-2 text-right font-medium">Atrasadas</th>
                      <th className="py-2 pr-5 pl-3 font-medium">Concluído</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.projects.map((project) => {
                      const total = project.open + project.done;
                      const percent = total === 0 ? 0 : Math.round((project.done / total) * 100);
                      return (
                        <tr key={project.key}>
                          <td className="py-2 pr-3 pl-5">
                            <Link href={`/projects/${project.key}`} className="flex items-center gap-2 font-medium text-slate-800 hover:text-brand-700">
                              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.teamColor }} />
                              <span className="truncate">{project.name}</span>
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{project.open}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", project.overdue > 0 && "font-semibold text-red-600")}>{project.overdue}</td>
                          <td className="py-2 pr-5 pl-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                              </div>
                              <span className="w-9 text-xs text-slate-500 tabular-nums">{percent}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <h2 className="px-5 pt-5 pb-3 font-semibold text-slate-900">Carga por pessoa</h2>
              {report.people.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-slate-500">Nenhuma tarefa aberta ou concluída no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-y border-slate-100 text-xs text-slate-500">
                      <tr>
                        <th className="py-2 pr-3 pl-5 font-medium">Responsável</th>
                        <th className="px-3 py-2 text-right font-medium">Abertas</th>
                        <th className="px-3 py-2 text-right font-medium">Atrasadas</th>
                        <th className="py-2 pr-5 pl-3 text-right font-medium">Concluídas (30 d)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.people.slice(0, 10).map((person, index) => (
                        <tr key={`${index}-${person.name}`}>
                          <td className="py-2 pr-3 pl-5 text-slate-800">{person.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{person.open}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", person.overdue > 0 && "font-semibold text-red-600")}>{person.overdue}</td>
                          <td className="py-2 pr-5 pl-3 text-right tabular-nums">{person.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden pb-2">
              <h2 className="px-5 pt-5 pb-3 font-semibold text-slate-900">
                Atrasadas {totals.overdue > 0 ? <span className="font-normal text-slate-400">{totals.overdue}</span> : null}
              </h2>
              {report.overdueTasks.length === 0 ? (
                <p className="px-5 pb-3 text-sm text-slate-500">Nenhuma tarefa com prazo vencido.</p>
              ) : (
                <>
                  <ReportTaskList tasks={report.overdueTasks.slice(0, OVERDUE_SHOWN)} late />
                  {report.overdueTasks.length > OVERDUE_SHOWN ? (
                    <p className="px-5 pt-2 pb-1 text-xs text-slate-500">
                      Mostrando as {OVERDUE_SHOWN} mais antigas de {report.overdueTasks.length}.
                    </p>
                  ) : null}
                </>
              )}
            </Card>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Minhas próximas tarefas</h2>
                <Link href="/my-tasks" className="text-sm font-medium text-brand-700 hover:underline">
                  Ver todas{myTasks.length > 5 ? ` (${myTasks.length})` : ""}
                </Link>
              </div>
              {myTasks.length === 0 ? (
                <EmptyState title="Tudo em dia">Nenhuma tarefa aberta está atribuída a você.</EmptyState>
              ) : (
                <TaskRows tasks={myTasks.slice(0, 5)} today={today} />
              )}
            </section>
          </div>

          {business ? <BusinessBlock metrics={business} canConfigure={canManageIntegrations(user)} /> : null}
        </div>
      )}
    </div>
  );
}

function TeamFilter({ href, active, label, color }: { href: string; active: boolean; label: string; color?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium",
        active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      {color ? <span className="size-2 rounded-full" style={{ backgroundColor: active ? "#fff" : color }} /> : null}
      {label}
    </Link>
  );
}

function Kpi({ label, value, detail, tone }: { label: string; value: number | string; detail: string; tone?: "good" | "bad" }) {
  return (
    <Card className="p-4">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className={cn("mt-1 text-3xl font-semibold tracking-tight tabular-nums", tone === "bad" ? "text-red-600" : "text-slate-900")}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Card>
  );
}

/** Subscription and sales events received from Shopify and Guru in the period. */
function BusinessBlock({ metrics, canConfigure }: { metrics: BusinessMetrics; canConfigure: boolean }) {
  const tiles = (["guru", "shopify"] as const).flatMap((source) =>
    TOPICS[source]
      .filter((topic) => topic.kpi)
      .map((topic) => ({
        source,
        ...topic,
        total: metrics.totals.find((item) => item.source === source && item.topic === topic.topic),
      }))
      .filter((tile) => tile.total && tile.total.count > 0),
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Negócio: assinaturas e vendas</h2>
        {canConfigure ? (
          <Link href="/integrations" className="text-sm font-medium text-brand-700 hover:underline">
            Integrações e regras
          </Link>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Eventos recebidos da Guru e da Shopify no período. É uma contagem de webhooks, não um relatório financeiro: use os
        painéis das plataformas para valores oficiais.
      </p>
      {tiles.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhum evento recebido nos últimos 30 dias.{" "}
          {canConfigure ? "Veja em Integrações como apontar os webhooks da Guru e da Shopify para o BARCA PM." : ""}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((tile) => (
            <div key={`${tile.source}:${tile.topic}`} className="rounded-lg border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">
                {SOURCE_LABELS[tile.source]} · {tile.label}
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{tile.total!.count}</dd>
              {tile.money && tile.total!.amount > 0 ? <dd className="text-xs text-slate-500">{formatMoney(tile.total!.amount)}</dd> : null}
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
