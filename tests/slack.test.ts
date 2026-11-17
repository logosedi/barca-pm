import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushBackground } from "@/server/background";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { handleInteraction, handleSlashCommand } from "@/server/integrations/slack/handlers";
import { createTask, getTaskDetail } from "@/server/services/tasks";
import { eq } from "drizzle-orm";
import { createWorkspace, useTestDb } from "./helpers";

// The Slack Web API is replaced by a fake that records every call, so these tests
// cover our side of the conversation: what we send and what we do with the answers.

interface SlackCall {
  method: string;
  args: Record<string, string>;
}

let calls: SlackCall[];
let slackUsers: Record<string, string>;

beforeEach(async () => {
  await useTestDb();
  calls = [];
  slackUsers = {};
  process.env.SLACK_BOT_TOKEN = "xoxb-teste";
  process.env.APP_URL = "https://pm.exemplo.com";
  vi.stubGlobal("fetch", async (url: string, init: { body: URLSearchParams }) => {
    const method = url.replace("https://slack.com/api/", "");
    const args = Object.fromEntries(init.body);
    calls.push({ method, args });
    let result: object = {};
    if (method === "users.info") {
      const email = slackUsers[args.user];
      result = email ? { user: { profile: { email } } } : { ok: false, error: "user_not_found" };
    }
    if (method === "users.lookupByEmail") {
      const id = Object.keys(slackUsers).find((key) => slackUsers[key] === args.email);
      result = id ? { user: { id } } : { ok: false, error: "users_not_found" };
    }
    return Response.json({ ok: true, ...result });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.APP_URL;
});

const command = (userId: string, text: string) =>
  handleSlashCommand(new URLSearchParams({ user_id: userId, text, trigger_id: "trigger-1" }));

describe("/barca", () => {
  it("recusa quem não tem conta com o mesmo e-mail", async () => {
    await createWorkspace();
    slackUsers.U_FORA = "desconhecido@exemplo.com";
    const reply = await command("U_FORA", "TECH Qualquer coisa");
    expect(reply.text).toContain("Não encontrei uma conta");
  });

  it("cria a tarefa direto quando começa com a sigla do projeto e vincula a conta do Slack", async () => {
    const { member } = await createWorkspace();
    slackUsers.U_BIA = member.email;

    const reply = await command("U_BIA", "tech Corrigir login");
    expect(reply.text).toBe("Tarefa criada em Plataforma: <https://pm.exemplo.com/t/TECH-1|TECH-1 Corrigir login>");

    const task = await getTaskDetail(member, "TECH-1");
    expect(task).toMatchObject({ title: "Corrigir login", source: "slack", reporter: { name: "Bia Membro" } });

    // The e-mail lookup happens once; afterwards the Slack id is stored on the user.
    await command("U_BIA", "minhas");
    expect(calls.filter((call) => call.method === "users.info")).toHaveLength(1);
    const db = await getDb();
    const [row] = await db.select().from(users).where(eq(users.id, member.id));
    expect(row.slackUserId).toBe("U_BIA");
  });

  it("sem sigla, abre o formulário com o texto como título", async () => {
    const { member } = await createWorkspace();
    slackUsers.U_BIA = member.email;
    expect(await command("U_BIA", "Revisar a landing page")).toEqual({});

    const open = calls.find((call) => call.method === "views.open")!;
    expect(open.args.trigger_id).toBe("trigger-1");
    const view = JSON.parse(open.args.view);
    expect(view.callback_id).toBe("barca_create_task");
    expect(view.blocks.map((block: { block_id: string }) => block.block_id)).toEqual([
      "project",
      "title",
      "description",
      "priority",
      "assignee",
      "due_date",
    ]);
    expect(view.blocks[1].element.initial_value).toBe("Revisar a landing page");
    expect(view.blocks[0].element.options[0].text.text).toBe("TECH · Plataforma");
  });

  it("lista as tarefas em aberto de quem pediu", async () => {
    const { admin, member, project } = await createWorkspace();
    slackUsers.U_BIA = member.email;
    await createTask(admin, { projectId: project.id, title: "Da Bia", assigneeId: member.id, dueDate: "2026-12-01" });
    await createTask(admin, { projectId: project.id, title: "De ninguém" });
    const reply = await command("U_BIA", "minhas");
    expect(reply.text).toContain("Suas tarefas em aberto (1)");
    expect(reply.text).toContain("TECH-1 Da Bia");
    expect(reply.text).toContain("prazo 01 de dez");
    expect(reply.text).not.toContain("De ninguém");
  });
});

describe("formulário de nova tarefa", () => {
  const submission = (userId: string, values: Record<string, Record<string, unknown>>) =>
    handleInteraction({
      type: "view_submission",
      user: { id: userId },
      view: {
        callback_id: "barca_create_task",
        state: { values: Object.fromEntries(Object.entries(values).map(([block, value]) => [block, { value }])) },
      },
    });

  it("cria a tarefa com responsável e prazo, confirma por DM e notifica o responsável", async () => {
    const { admin, member, project } = await createWorkspace();
    slackUsers.U_ANA = admin.email;
    slackUsers.U_BIA = member.email;

    const reply = await submission("U_ANA", {
      project: { selected_option: { value: project.id } },
      title: { value: "Publicar release" },
      description: { value: "Checklist no doc." },
      priority: { selected_option: { value: "high" } },
      assignee: { selected_user: "U_BIA" },
      due_date: { selected_date: "2026-12-10" },
    });
    expect(reply).toEqual({});
    await flushBackground();

    const task = await getTaskDetail(admin, "TECH-1");
    expect(task).toMatchObject({ title: "Publicar release", priority: "high", dueDate: "2026-12-10", assignee: { name: "Bia Membro" }, source: "slack" });

    const messages = calls.filter((call) => call.method === "chat.postMessage").map((call) => [call.args.channel, call.args.text]);
    expect(messages).toContainEqual(["U_ANA", "Tarefa criada: <https://pm.exemplo.com/t/TECH-1|TECH-1 Publicar release>"]);
    expect(messages).toContainEqual(["U_BIA", "Ana Admin atribuiu a você: <https://pm.exemplo.com/t/TECH-1|TECH-1 Publicar release>"]);
  });

  it("mostra o erro no campo quando o responsável não tem conta", async () => {
    const { admin, project } = await createWorkspace();
    slackUsers.U_ANA = admin.email;
    slackUsers.U_FORA = "fora@exemplo.com";
    const reply = await submission("U_ANA", {
      project: { selected_option: { value: project.id } },
      title: { value: "Tarefa" },
      assignee: { selected_user: "U_FORA" },
    });
    expect(reply).toEqual({ response_action: "errors", errors: { assignee: "Essa pessoa não tem conta no BARCA PM." } });
  });

  it("atalho de mensagem abre o formulário preenchido com o texto da mensagem", async () => {
    const { member } = await createWorkspace();
    slackUsers.U_BIA = member.email;
    await handleInteraction({
      type: "message_action",
      callback_id: "barca_task_from_message",
      trigger_id: "trigger-2",
      user: { id: "U_BIA" },
      message: { text: "O checkout está fora do ar\nClientes relatando erro 500 desde as 14h" },
    });
    const view = JSON.parse(calls.find((call) => call.method === "views.open")!.args.view);
    expect(view.blocks[1].element.initial_value).toBe("O checkout está fora do ar");
    expect(view.blocks[2].element.initial_value).toContain("erro 500");
  });
});

describe("mensagens com caracteres especiais", () => {
  it("escapa <, > e & para não quebrar a formatação do Slack", async () => {
    const { admin, member, project } = await createWorkspace();
    slackUsers.U_BIA = member.email;
    await createTask(admin, { projectId: project.id, title: "Trocar <b> por & no rodapé", assigneeId: member.id });
    await flushBackground();
    const [dm] = calls.filter((call) => call.method === "chat.postMessage");
    expect(dm.args.text).toBe(
      "Ana Admin atribuiu a você: <https://pm.exemplo.com/t/TECH-1|TECH-1 Trocar &lt;b&gt; por &amp; no rodapé>",
    );
  });
});
