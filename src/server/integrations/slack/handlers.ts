import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/constants";
import { canEditTasks, type Actor } from "@/lib/permissions";
import { formatDay } from "@/lib/utils";
import { runInBackground } from "../../background";
import { appUrl, taskUrl } from "../../config";
import { AppError } from "../../errors";
import { listVisibleProjects } from "../../services/projects";
import { createTask, listMyTasks } from "../../services/tasks";
import { loadActor } from "../../services/users";
import { escapeSlack, postSlackMessage, slackCall, userIdForSlackId } from "./api";

// What people can do from Slack:
//   /barca                      opens the "Nova tarefa" form
//   /barca TECH Corrigir login  creates a task in project TECH straight away
//   /barca minhas               lists my open tasks
//   message shortcut            turns a Slack message into a task (form pre-filled)
// Everything runs as the BARCA user that owns the Slack account (matched by e-mail),
// so permissions are exactly the ones that person has in the web app.

const CREATE_TASK_VIEW = "barca_create_task";
const NEW_TASK_SHORTCUT = "barca_new_task";
const TASK_FROM_MESSAGE_SHORTCUT = "barca_task_from_message";

type SlackReply = Record<string, unknown>;

const ephemeral = (text: string): SlackReply => ({ response_type: "ephemeral", text });

const NO_ACCOUNT =
  "Não encontrei uma conta do BARCA PM com o e-mail do seu Slack. Peça um convite a quem administra o BARCA PM.";

const HELP = [
  "*BARCA PM no Slack*",
  "• `/barca`: abre o formulário de nova tarefa",
  "• `/barca SIGLA título`: cria a tarefa direto no projeto (ex.: `/barca TECH Corrigir login`)",
  "• `/barca minhas`: lista as suas tarefas em aberto",
  "• Menu “⋯” de uma mensagem → *Criar tarefa no BARCA*: transforma a mensagem em tarefa",
].join("\n");

async function actorForSlackUser(slackUserId: string): Promise<Actor | null> {
  const userId = await userIdForSlackId(slackUserId);
  return userId ? loadActor(userId) : null;
}

async function editableProjects(actor: Actor) {
  const projects = await listVisibleProjects(actor);
  return projects.filter((project) => canEditTasks(actor, { teamId: project.team.id, visibility: project.visibility }));
}

const taskLink = (task: { ref: string; title: string }) =>
  `<${taskUrl(task.ref)}|${escapeSlack(`${task.ref} ${task.title}`)}>`;

// ---------------------------------------------------------------------------
// Slash command
// ---------------------------------------------------------------------------

export async function handleSlashCommand(form: URLSearchParams): Promise<SlackReply> {
  const actor = await actorForSlackUser(form.get("user_id") ?? "");
  if (!actor) return ephemeral(NO_ACCOUNT);

  const text = (form.get("text") ?? "").trim();
  const [first = "", ...rest] = text.split(/\s+/);
  const command = first.toLowerCase();

  if (command === "ajuda" || command === "help") return ephemeral(HELP);

  if (command === "minhas" || command === "tarefas") {
    const mine = await listMyTasks(actor);
    if (mine.length === 0) return ephemeral("Você não tem tarefas em aberto. :tada:");
    const lines = mine.slice(0, 15).map((task) => {
      const due = task.dueDate ? ` · prazo ${formatDay(task.dueDate)}` : "";
      return `• ${taskLink(task)} · ${escapeSlack(task.statusName)}${due}`;
    });
    const more = mine.length > 15 ? `\n…e mais ${mine.length - 15}. <${appUrl()}/my-tasks|Ver todas>` : "";
    return ephemeral(`*Suas tarefas em aberto (${mine.length})*\n${lines.join("\n")}${more}`);
  }

  const projects = await editableProjects(actor);
  if (projects.length === 0) return ephemeral("Você não tem permissão para criar tarefas em nenhum projeto.");

  // "/barca TECH Corrigir login": the first word is a project key, the rest is the title.
  const project = projects.find((item) => item.key === first.toUpperCase());
  if (project && rest.length > 0) {
    try {
      const task = await createTask(actor, { projectId: project.id, title: rest.join(" ") }, "slack");
      return ephemeral(`Tarefa criada em ${escapeSlack(project.name)}: ${taskLink(task)}`);
    } catch (error) {
      if (error instanceof AppError) return ephemeral(error.message);
      throw error;
    }
  }

  const title = command === "nova" || command === "novo" || command === "criar" ? rest.join(" ") : text;
  await openTaskForm(form.get("trigger_id") ?? "", projects, { title });
  return {};
}

// ---------------------------------------------------------------------------
// Interactivity: shortcuts and the form submission
// ---------------------------------------------------------------------------

interface InteractionPayload {
  type: string;
  callback_id?: string;
  trigger_id?: string;
  user: { id: string };
  message?: { text?: string };
  view?: {
    callback_id: string;
    state: { values: Record<string, Record<string, Record<string, unknown>>> };
  };
}

export async function handleInteraction(payload: InteractionPayload): Promise<SlackReply> {
  const isShortcut =
    (payload.type === "shortcut" && payload.callback_id === NEW_TASK_SHORTCUT) ||
    (payload.type === "message_action" && payload.callback_id === TASK_FROM_MESSAGE_SHORTCUT);

  if (isShortcut) {
    const actor = await actorForSlackUser(payload.user.id);
    const projects = actor ? await editableProjects(actor) : [];
    if (!actor || projects.length === 0) {
      runInBackground("aviso de conta não encontrada no Slack", () =>
        postSlackMessage(payload.user.id, actor ? "Você não tem permissão para criar tarefas em nenhum projeto." : NO_ACCOUNT),
      );
      return {};
    }
    const message = payload.message?.text?.trim() ?? "";
    await openTaskForm(payload.trigger_id ?? "", projects, {
      title: message.split("\n")[0].slice(0, 200),
      description: message,
    });
    return {};
  }

  if (payload.type === "view_submission" && payload.view?.callback_id === CREATE_TASK_VIEW) {
    return submitTaskForm(payload);
  }
  return {};
}

type ProjectOption = { id: string; key: string; name: string };

function option(text: string, value: string) {
  return { text: { type: "plain_text", text: text.slice(0, 75) }, value };
}

/** The "Nova tarefa" modal. Block ids double as field names when it is submitted. */
export function buildTaskForm(projects: ProjectOption[], initial: { title?: string; description?: string }) {
  const plain = (text: string) => ({ type: "plain_text", text });
  return {
    type: "modal",
    callback_id: CREATE_TASK_VIEW,
    title: plain("Nova tarefa"),
    submit: plain("Criar"),
    close: plain("Cancelar"),
    blocks: [
      {
        type: "input",
        block_id: "project",
        label: plain("Projeto"),
        element: {
          type: "static_select",
          action_id: "value",
          placeholder: plain("Escolha o projeto"),
          // Slack accepts at most 100 options in a select.
          options: projects.slice(0, 100).map((project) => option(`${project.key} · ${project.name}`, project.id)),
          ...(projects.length === 1 ? { initial_option: option(`${projects[0].key} · ${projects[0].name}`, projects[0].id) } : {}),
        },
      },
      {
        type: "input",
        block_id: "title",
        label: plain("Título"),
        element: {
          type: "plain_text_input",
          action_id: "value",
          max_length: 200,
          ...(initial.title ? { initial_value: initial.title } : {}),
        },
      },
      {
        type: "input",
        block_id: "description",
        optional: true,
        label: plain("Descrição"),
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true,
          max_length: 3000,
          ...(initial.description ? { initial_value: initial.description.slice(0, 3000) } : {}),
        },
      },
      {
        type: "input",
        block_id: "priority",
        optional: true,
        label: plain("Prioridade"),
        element: {
          type: "static_select",
          action_id: "value",
          options: PRIORITIES.filter((priority) => priority !== "none").map((priority) => option(PRIORITY_LABELS[priority], priority)),
        },
      },
      {
        type: "input",
        block_id: "assignee",
        optional: true,
        label: plain("Responsável"),
        element: { type: "users_select", action_id: "value", placeholder: plain("Escolha uma pessoa") },
      },
      {
        type: "input",
        block_id: "due_date",
        optional: true,
        label: plain("Prazo"),
        element: { type: "datepicker", action_id: "value" },
      },
    ],
  };
}

async function openTaskForm(triggerId: string, projects: ProjectOption[], initial: { title?: string; description?: string }) {
  // trigger_id expires three seconds after the user's action, so this is awaited inline.
  await slackCall("views.open", { trigger_id: triggerId, view: buildTaskForm(projects, initial) });
}

async function submitTaskForm(payload: InteractionPayload): Promise<SlackReply> {
  const values = payload.view!.state.values;
  const field = (block: string) => values[block]?.value ?? {};
  const fieldError = (block: string, message: string): SlackReply => ({ response_action: "errors", errors: { [block]: message } });

  const actor = await actorForSlackUser(payload.user.id);
  if (!actor) return fieldError("project", NO_ACCOUNT);

  const projectId = (field("project").selected_option as { value?: string } | null)?.value;
  const priority = (field("priority").selected_option as { value?: string } | null)?.value as Priority | undefined;
  const slackAssignee = field("assignee").selected_user as string | null | undefined;
  if (!projectId) return fieldError("project", "Escolha o projeto.");

  let assigneeId: string | null = null;
  if (slackAssignee) {
    assigneeId = await userIdForSlackId(slackAssignee);
    if (!assigneeId) return fieldError("assignee", "Essa pessoa não tem conta no BARCA PM.");
  }

  try {
    const task = await createTask(
      actor,
      {
        projectId,
        title: String(field("title").value ?? ""),
        description: String(field("description").value ?? ""),
        priority: priority ?? "none",
        assigneeId,
        dueDate: (field("due_date").selected_date as string | null | undefined) ?? null,
      },
      "slack",
    );
    runInBackground("confirmação de tarefa criada pelo Slack", () =>
      postSlackMessage(payload.user.id, `Tarefa criada: ${taskLink(task)}`),
    );
    return {};
  } catch (error) {
    if (error instanceof AppError) return fieldError(error.code === "invalid" ? "title" : "project", error.message);
    throw error;
  }
}
