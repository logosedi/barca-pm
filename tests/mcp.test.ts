import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import type { TokenScope } from "@/lib/constants";
import type { Actor } from "@/lib/permissions";
import { createMcpServer } from "@/server/mcp/server";
import { createProject } from "@/server/services/projects";
import { createTask, getTaskDetail } from "@/server/services/tasks";
import { createTeam } from "@/server/services/teams";
import { authenticateApiToken, createApiToken, revokeApiToken, listApiTokens } from "@/server/services/tokens";
import { createUser, createWorkspace, useTestDb } from "./helpers";

beforeEach(useTestDb);

/** A real MCP client talking to our server over an in-memory transport. */
async function connect(actor: Actor, scope: TokenScope) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(actor, scope).connect(serverSide);
  const client = new Client({ name: "teste", version: "1.0.0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0].text;
    return { isError: result.isError === true, text, data: result.isError ? null : JSON.parse(text) };
  };
  return { client, call };
}

describe("tokens de acesso", () => {
  it("autentica pelo token, guarda só o hash e para de valer ao ser revogado", async () => {
    const { member } = await createWorkspace();
    const token = await createApiToken(member, { name: "Claude no notebook", scope: "read" });
    expect(token).toMatch(/^barca_pat_/);

    const auth = await authenticateApiToken(`Bearer ${token}`);
    expect(auth).toMatchObject({ scope: "read", actor: { id: member.id, role: "member" } });
    expect(await authenticateApiToken("Bearer barca_pat_inventado")).toBeNull();
    expect(await authenticateApiToken(null)).toBeNull();

    const [listed] = await listApiTokens(member);
    expect(token.startsWith(listed.prefix)).toBe(true);
    expect(listed.prefix.length).toBeLessThan(token.length / 2);

    await revokeApiToken(member, listed.id);
    expect(await authenticateApiToken(`Bearer ${token}`)).toBeNull();
  });
});

describe("servidor MCP", () => {
  it("token de leitura não enxerga as ferramentas de escrita", async () => {
    const { member } = await createWorkspace();
    const names = async (scope: TokenScope) =>
      (await (await connect(member, scope)).client.listTools()).tools.map((tool) => tool.name);
    expect(await names("read")).toEqual([
      "whoami",
      "list_projects",
      "list_teams",
      "list_members",
      "search_tasks",
      "get_task",
      "get_workspace_report",
      "get_business_metrics",
    ]);
    expect(await names("write")).toEqual(expect.arrayContaining(["create_task", "update_task", "add_comment"]));
  });

  it("cria, move e comenta tarefas com as mesmas regras do app", async () => {
    const { member } = await createWorkspace();
    const { call } = await connect(member, "write");

    const created = await call("create_task", {
      project_key: "tech",
      title: "Escrever release notes",
      priority: "high",
      assignee_email: "me",
      due_date: "2026-12-01",
    });
    expect(created.data.created).toBe("TECH-1");

    const moved = await call("update_task", { ref: "TECH-1", status_name: "code review" });
    expect(moved.data).toMatchObject({ status: "Code review", status_category: "in_progress", assignee: "Bia Membro" });

    await call("add_comment", { ref: "TECH-1", body: "Rascunho pronto." });
    const detail = await getTaskDetail(member, "TECH-1");
    expect(detail).toMatchObject({ source: "mcp", priority: "high", dueDate: "2026-12-01" });
    expect(detail.comments.map((comment) => comment.body)).toEqual(["Rascunho pronto."]);

    const wrongStatus = await call("update_task", { ref: "TECH-1", status_name: "Publicado" });
    expect(wrongStatus.isError).toBe(true);
    expect(wrongStatus.text).toContain("Etapas: Backlog, A fazer");
  });

  it("busca e relatório só incluem o que o dono do token pode ver", async () => {
    const { admin, member, project } = await createWorkspace();
    const marketing = await createTeam(admin, { name: "Marketing", discipline: "marketing" });
    const secret = await createProject(admin, { name: "Segredo", key: "SEG", teamId: marketing, discipline: "marketing", visibility: "team" });
    await createTask(admin, { projectId: secret.id, title: "Campanha secreta" });
    await createTask(admin, { projectId: project.id, title: "Tarefa aberta", assigneeId: member.id });

    const asMember = await connect(member, "read");
    expect((await asMember.call("search_tasks")).data.tasks.map((task: { ref: string }) => task.ref)).toEqual(["TECH-1"]);
    expect((await asMember.call("get_task", { ref: "SEG-1" })).isError).toBe(true);
    expect((await asMember.call("list_projects")).data.map((p: { key: string }) => p.key)).toEqual(["TECH"]);
    const report = (await asMember.call("get_workspace_report")).data;
    expect(report.totals.open).toBe(1);
    expect(report.by_project.map((p: { key: string }) => p.key)).toEqual(["TECH"]);
    expect((await asMember.call("get_business_metrics")).isError).toBe(true);

    const asAdmin = await connect(admin, "read");
    expect((await asAdmin.call("search_tasks")).data.count).toBe(2);
    expect((await asAdmin.call("get_business_metrics")).isError).toBe(false);
  });

  it("convidado não lista pessoas nem escreve, mesmo com token de escrita", async () => {
    const { teamId } = await createWorkspace();
    const guest = await createUser("Gui Convidado", "guest", [[teamId, "member"]]);
    const { call } = await connect(guest, "write");
    expect((await call("list_members")).isError).toBe(true);
    const created = await call("create_task", { project_key: "TECH", title: "Não pode" });
    expect(created.isError).toBe(true);
    expect(created.text).toContain("leitura");
  });
});
