import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PRIORITIES, STATUS_CATEGORIES, type TokenScope } from "@/lib/constants";
import { SOURCE_LABELS, topicLabel } from "@/lib/integration-topics";
import type { Actor } from "@/lib/permissions";
import type { TaskSummary } from "@/lib/types";
import { addDaysISO, todayISO } from "@/lib/utils";
import { taskUrl } from "../config";
import { AppError, forbidden, invalid } from "../errors";
import { getBusinessMetrics } from "../services/automations";
import { getProject, listVisibleProjects } from "../services/projects";
import { getWorkspaceReport } from "../services/reports";
import { addComment, createTask, getTaskDetail, searchTasks, updateTask } from "../services/tasks";
import { listTeams } from "../services/teams";
import { findActiveUserByEmail, listMembers } from "../services/users";

// MCP server exposed at /api/mcp. It is a thin adapter: every tool calls the same
// service functions as the web app, acting as the owner of the access token, so an
// AI assistant can never see or change more than that person could in the browser.

const MAX_LISTED_TASKS = 100;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");

function compactTask(task: TaskSummary) {
  return {
    ref: task.ref,
    title: task.title,
    project: task.projectName,
    status: task.statusName,
    status_category: task.statusCategory,
    priority: task.priority,
    assignee: task.assignee?.name ?? null,
    due_date: task.dueDate,
    is_subtask: task.parentId !== null,
    subtasks: task.subtaskCount > 0 ? `${task.subtaskDone}/${task.subtaskCount} concluídas` : null,
    created_at: task.createdAt,
    completed_at: task.completedAt,
    url: taskUrl(task.ref),
  };
}

/** Runs a tool body and turns the result (or an expected failure) into an MCP response. */
async function respond(work: () => Promise<unknown>) {
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(await work(), null, 2) }] };
  } catch (error) {
    if (!(error instanceof AppError)) console.error("[mcp] erro inesperado:", error);
    const message = error instanceof AppError ? error.message : "Erro interno do BARCA PM. Tente novamente.";
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  }
}

export function createMcpServer(actor: Actor, scope: TokenScope) {
  const server = new McpServer(
    { name: "barca-pm", version: "0.1.0" },
    {
      instructions:
        "BARCA PM é a ferramenta de gestão de projetos da empresa. Tarefas são identificadas por referências como TECH-12 " +
        "(sigla do projeto + número). Cada projeto tem etapas próprias, mas toda etapa pertence a uma categoria " +
        "(todo, in_progress, done): use a categoria para comparar projetos. Para relatórios, comece por " +
        "get_workspace_report e detalhe com search_tasks. Datas usam o formato AAAA-MM-DD.",
    },
  );
  const readOnly = { readOnlyHint: true };
  const requireMember = () => {
    if (actor.role === "guest") throw forbidden("Convidados não têm acesso à lista de pessoas e times.");
  };

  server.registerTool(
    "whoami",
    { title: "Quem sou eu", description: "Mostra o usuário dono do token, seu papel e o que o token pode fazer.", annotations: readOnly },
    () => respond(async () => ({ name: actor.name, email: actor.email, role: actor.role, token_scope: scope, today: todayISO() })),
  );

  server.registerTool(
    "list_projects",
    {
      title: "Listar projetos",
      description: "Lista os projetos visíveis para o usuário, com time, etapas e contagem de tarefas abertas e concluídas.",
      annotations: readOnly,
    },
    () =>
      respond(async () => {
        const projects = await listVisibleProjects(actor);
        return Promise.all(
          projects.map(async (project) => {
            const detail = await getProject(actor, project.key);
            return {
              key: project.key,
              name: project.name,
              description: project.description,
              team: project.team.name,
              open_tasks: project.openTasks,
              done_tasks: project.doneTasks,
              statuses: detail.statuses.map((status) => ({ name: status.name, category: status.category })),
              labels: detail.labels.map((label) => label.name),
            };
          }),
        );
      }),
  );

  server.registerTool(
    "list_teams",
    { title: "Listar times", description: "Lista os times, sua disciplina e seus integrantes.", annotations: readOnly },
    () =>
      respond(async () => {
        requireMember();
        const teams = await listTeams(actor);
        return teams.map((team) => ({
          name: team.name,
          discipline: team.discipline,
          projects: team.projectCount,
          members: team.members.map((member) => ({ name: member.name, email: member.email, team_role: member.role })),
        }));
      }),
  );

  server.registerTool(
    "list_members",
    { title: "Listar pessoas", description: "Lista as pessoas ativas, com e-mail, papel e times.", annotations: readOnly },
    () =>
      respond(async () => {
        requireMember();
        const members = await listMembers(actor);
        return members
          .filter((member) => member.isActive)
          .map((member) => ({ name: member.name, email: member.email, role: member.role, teams: member.teams.map((team) => team.name) }));
      }),
  );

  server.registerTool(
    "search_tasks",
    {
      title: "Buscar tarefas",
      description:
        "Busca tarefas nos projetos visíveis. Todos os filtros são opcionais e se combinam. " +
        `Retorna no máximo ${MAX_LISTED_TASKS} tarefas, das atualizadas mais recentemente para as mais antigas.`,
      inputSchema: {
        project_key: z.string().optional().describe("Sigla do projeto, ex.: TECH"),
        status_category: z.enum(STATUS_CATEGORIES).optional().describe("todo, in_progress ou done"),
        open_only: z.boolean().optional().describe("true para trazer só tarefas não concluídas"),
        assignee_email: z.string().optional().describe("E-mail do responsável. Use 'me' para o dono do token"),
        unassigned: z.boolean().optional().describe("true para trazer só tarefas sem responsável"),
        priority: z.enum(PRIORITIES).optional(),
        overdue: z.boolean().optional().describe("true para trazer só tarefas atrasadas (prazo vencido e não concluídas)"),
        due_from: day.optional(),
        due_to: day.optional(),
        completed_from: day.optional().describe("Concluídas a partir deste dia"),
        completed_to: day.optional().describe("Concluídas até este dia (inclusive)"),
        updated_since: day.optional(),
        query: z.string().optional().describe("Texto procurado no título e na descrição"),
        limit: z.number().int().min(1).max(MAX_LISTED_TASKS).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      respond(async () => {
        let assigneeId: string | undefined;
        if (args.assignee_email === "me") assigneeId = actor.id;
        else if (args.assignee_email) {
          const person = await findActiveUserByEmail(args.assignee_email);
          if (!person) throw invalid(`Não há pessoa ativa com o e-mail ${args.assignee_email}.`);
          assigneeId = person.id;
        }
        const tasks = await searchTasks(actor, {
          projectKey: args.project_key,
          statusCategory: args.status_category,
          open: args.open_only,
          assigneeId,
          unassigned: args.unassigned,
          priority: args.priority,
          overdue: args.overdue,
          dueFrom: args.due_from,
          dueTo: args.due_to,
          completedFrom: args.completed_from,
          completedTo: args.completed_to,
          updatedSince: args.updated_since,
          query: args.query,
          limit: Math.min(args.limit ?? 50, MAX_LISTED_TASKS),
        });
        return { count: tasks.length, tasks: tasks.map(compactTask) };
      }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Ver tarefa",
      description: "Detalhes de uma tarefa: descrição em Markdown, subtarefas, comentários e histórico.",
      inputSchema: { ref: z.string().describe("Referência da tarefa, ex.: TECH-12") },
      annotations: readOnly,
    },
    ({ ref }) =>
      respond(async () => {
        const task = await getTaskDetail(actor, ref);
        return {
          ...compactTask(task),
          description: task.description,
          reporter: task.reporter?.name ?? null,
          parent: task.parent?.ref ?? null,
          labels: task.labels.filter((label) => task.labelIds.includes(label.id)).map((label) => label.name),
          origin: task.externalRef ? `${task.externalRef.system}: ${task.externalRef.label}` : task.source,
          subtasks: task.subtasks.map((subtask) => ({ ref: subtask.ref, title: subtask.title, status: subtask.statusName, assignee: subtask.assignee?.name ?? null })),
          comments: task.comments.map((comment) => ({ author: comment.author?.name ?? null, body: comment.body, created_at: comment.createdAt })),
          history: task.activity.map((entry) => ({ who: entry.actor?.name ?? "sistema", what: entry.type, ...entry.data, at: entry.createdAt })),
        };
      }),
  );

  server.registerTool(
    "get_workspace_report",
    {
      title: "Relatório de progresso",
      description:
        "Indicadores de progresso para um período (padrão: últimos 30 dias): tarefas abertas, em andamento e atrasadas agora; " +
        "criadas e concluídas no período; comparação com o período anterior; tempo médio de conclusão; evolução semanal; " +
        "e a divisão por projeto, time e pessoa. Inclui a lista de tarefas atrasadas e das concluídas no período.",
      inputSchema: {
        from: day.optional().describe("Início do período (inclusive)"),
        to: day.optional().describe("Fim do período (inclusive)"),
        team_name: z.string().optional().describe("Restringe a um time"),
        project_key: z.string().optional().describe("Restringe a um projeto"),
      },
      annotations: readOnly,
    },
    (args) =>
      respond(async () => {
        let teamId: string | undefined;
        if (args.team_name) {
          const team = (await listTeams(actor)).find((item) => item.name.toLowerCase() === args.team_name!.toLowerCase());
          if (!team) throw invalid(`Não há time chamado ${args.team_name}.`);
          teamId = team.id;
        }
        const report = await getWorkspaceReport(actor, { from: args.from, to: args.to, teamId, projectKey: args.project_key });
        return {
          period: { from: report.from, to: report.to },
          totals: report.totals,
          tasks_by_status_category: report.byCategory,
          weekly_trend: report.weekly,
          by_project: report.projects,
          by_team: report.teams,
          by_person: report.people,
          overdue_tasks: report.overdueTasks.slice(0, MAX_LISTED_TASKS),
          completed_tasks: report.completedTasks.slice(0, MAX_LISTED_TASKS),
          truncated: report.overdueTasks.length > MAX_LISTED_TASKS || report.completedTasks.length > MAX_LISTED_TASKS,
        };
      }),
  );

  server.registerTool(
    "get_business_metrics",
    {
      title: "Indicadores do negócio",
      description:
        "Eventos recebidos da Shopify e da Guru no período (padrão: últimos 30 dias): assinaturas iniciadas e canceladas, " +
        "vendas, reembolsos, chargebacks, com contagem e valor por dia. Útil para cruzar entregas dos times com resultados. " +
        "Restrito a gestores e administradores.",
      inputSchema: { from: day.optional(), to: day.optional() },
      annotations: readOnly,
    },
    (args) =>
      respond(async () => {
        const to = args.to ?? todayISO();
        const metrics = await getBusinessMetrics(actor, args.from ?? addDaysISO(to, -29), to);
        const describe = <T extends { source: "shopify" | "guru"; topic: string }>(row: T) => ({
          ...row,
          source: SOURCE_LABELS[row.source],
          event: topicLabel(row.source, row.topic),
        });
        return {
          period: { from: metrics.from, to: metrics.to },
          note: "Contagens de webhooks recebidos. O valor (amount) só é preenchido em eventos que trazem um valor monetário.",
          totals: metrics.totals.map(describe),
          daily: metrics.daily.map(describe),
        };
      }),
  );

  server.registerPrompt(
    "relatorio_semanal",
    {
      title: "Relatório semanal",
      description: "Gera um relatório de status da semana para um time ou para a empresa toda.",
      argsSchema: { time: z.string().optional().describe("Nome do time. Vazio = empresa toda") },
    },
    ({ time }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Escreva o relatório semanal de status${time ? ` do time ${time}` : " da empresa"} usando o BARCA PM. ` +
              "Use get_workspace_report para os últimos 7 dias" +
              (time ? ` com team_name="${time}"` : "") +
              ". Estruture em: resumo em três frases; o que foi concluído (agrupado por projeto); o que está em andamento; " +
              "riscos e tarefas atrasadas, com responsável e prazo; e a comparação com a semana anterior. " +
              "Cite as tarefas pela referência (ex.: TECH-12). Não invente dados: se faltar informação, diga que falta.",
          },
        },
      ],
    }),
  );

  if (scope !== "write") return server;

  const resolveAssignee = async (email: string | null | undefined) => {
    if (email === undefined) return undefined;
    if (email === null || email === "") return null;
    if (email === "me") return actor.id;
    const person = await findActiveUserByEmail(email);
    if (!person) throw invalid(`Não há pessoa ativa com o e-mail ${email}.`);
    return person.id;
  };
  const resolveStatus = (statuses: { id: string; name: string }[], name: string) => {
    const status = statuses.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
    if (!status) throw invalid(`Etapa "${name}" não existe neste projeto. Etapas: ${statuses.map((item) => item.name).join(", ")}.`);
    return status.id;
  };

  server.registerTool(
    "create_task",
    {
      title: "Criar tarefa",
      description: "Cria uma tarefa (ou subtarefa, se parent_ref for informado) em um projeto.",
      inputSchema: {
        project_key: z.string().describe("Sigla do projeto, ex.: TECH"),
        title: z.string(),
        description: z.string().optional().describe("Markdown"),
        status_name: z.string().optional().describe("Nome da etapa. Padrão: a primeira etapa do projeto"),
        priority: z.enum(PRIORITIES).optional(),
        assignee_email: z.string().optional().describe("E-mail do responsável, ou 'me'"),
        due_date: day.optional(),
        parent_ref: z.string().optional().describe("Referência da tarefa principal, para criar uma subtarefa"),
      },
    },
    (args) =>
      respond(async () => {
        const project = await getProject(actor, args.project_key);
        const parent = args.parent_ref ? await getTaskDetail(actor, args.parent_ref) : null;
        const task = await createTask(
          actor,
          {
            projectId: project.id,
            title: args.title,
            description: args.description,
            statusId: args.status_name ? resolveStatus(project.statuses, args.status_name) : undefined,
            priority: args.priority,
            assigneeId: (await resolveAssignee(args.assignee_email)) ?? null,
            dueDate: args.due_date ?? null,
            parentId: parent?.id ?? null,
          },
          "mcp",
        );
        return { created: task.ref, url: taskUrl(task.ref) };
      }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Atualizar tarefa",
      description: "Altera campos de uma tarefa. Informe só o que deve mudar. Para mover de etapa, use status_name.",
      inputSchema: {
        ref: z.string().describe("Referência da tarefa, ex.: TECH-12"),
        title: z.string().optional(),
        description: z.string().optional().describe("Markdown. Substitui a descrição inteira"),
        status_name: z.string().optional(),
        priority: z.enum(PRIORITIES).optional(),
        assignee_email: z.string().nullable().optional().describe("E-mail do responsável, 'me', ou null para deixar sem responsável"),
        due_date: day.nullable().optional().describe("null para remover o prazo"),
      },
    },
    (args) =>
      respond(async () => {
        const task = await getTaskDetail(actor, args.ref);
        await updateTask(actor, task.id, {
          title: args.title,
          description: args.description,
          statusId: args.status_name ? resolveStatus(task.statuses, args.status_name) : undefined,
          priority: args.priority,
          assigneeId: await resolveAssignee(args.assignee_email),
          dueDate: args.due_date,
        });
        return compactTask(await getTaskDetail(actor, args.ref));
      }),
  );

  server.registerTool(
    "add_comment",
    {
      title: "Comentar",
      description: "Adiciona um comentário (Markdown) a uma tarefa. As pessoas envolvidas são notificadas.",
      inputSchema: { ref: z.string().describe("Referência da tarefa, ex.: TECH-12"), body: z.string() },
    },
    ({ ref, body }) =>
      respond(async () => {
        const task = await getTaskDetail(actor, ref);
        await addComment(actor, task.id, body);
        return { commented_on: task.ref, url: taskUrl(task.ref) };
      }),
  );

  return server;
}
