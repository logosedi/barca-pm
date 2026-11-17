import { beforeEach, describe, expect, it } from "vitest";
import { addDaysISO, todayISO } from "@/lib/utils";
import { AppError } from "@/server/errors";
import { listNotifications } from "@/server/services/notifications";
import { archiveProject, createProject, getProject, listVisibleProjects } from "@/server/services/projects";
import { getWorkspaceReport } from "@/server/services/reports";
import {
  addComment,
  createTask,
  deleteTask,
  getTaskDetail,
  listAssigneeOptions,
  listMyTasks,
  listProjectTasks,
  moveTask,
  searchTasks,
  updateTask,
} from "@/server/services/tasks";
import { createTeam, listTeams, setTeamMember } from "@/server/services/teams";
import {
  acceptInvite,
  authenticate,
  createSession,
  findActorBySessionToken,
  inviteMember,
  listMembers,
  loadActor,
  setMemberActive,
  setupWorkspace,
  updateMemberRole,
} from "@/server/services/users";
import { createUser, createWorkspace, useTestDb } from "./helpers";

beforeEach(useTestDb);

const code = async (work: Promise<unknown>) => {
  try {
    await work;
    return "ok";
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
};

describe("contas", () => {
  it("a configuração inicial cria o administrador uma única vez", async () => {
    await setupWorkspace({ name: "Gabriel", email: "Gabriel@Empresa.com", password: "senha-bem-longa" });
    expect(await authenticate("gabriel@empresa.com", "senha-bem-longa")).toBeTruthy();
    expect(await authenticate("gabriel@empresa.com", "senha-errada")).toBeNull();
    expect(await code(setupWorkspace({ name: "Outro", email: "outro@empresa.com", password: "senha-bem-longa" }))).toBe("conflict");
  });

  it("convite: a pessoa define a senha, entra, e o link deixa de valer", async () => {
    const { admin } = await createWorkspace();
    const { token } = await inviteMember(admin, { name: "Caio", email: "caio@empresa.com", role: "member" });
    expect(await authenticate("caio@empresa.com", "qualquer-senha")).toBeNull();
    await acceptInvite(token, "senha-do-caio-123");
    expect(await authenticate("caio@empresa.com", "senha-do-caio-123")).toBeTruthy();
    expect(await code(acceptInvite(token, "outra-senha-123"))).toBe("not_found");
  });

  it("desativar uma conta encerra as sessões dela", async () => {
    const { admin, member } = await createWorkspace();
    const { token } = await createSession(member.id);
    expect(await findActorBySessionToken(token)).not.toBeNull();
    await setMemberActive(admin, member.id, false);
    expect(await findActorBySessionToken(token)).toBeNull();
  });

  it("não deixa o workspace sem administrador", async () => {
    const { admin, member } = await createWorkspace();
    expect(await code(updateMemberRole(admin, admin.id, "member"))).toBe("invalid");
    expect(await code(setMemberActive(admin, admin.id, false))).toBe("invalid");
    expect(await code(updateMemberRole(member, admin.id, "member"))).toBe("forbidden");
  });
});

describe("projetos", () => {
  it("nasce com as etapas e etiquetas do modelo da disciplina", async () => {
    const { admin } = await createWorkspace();
    const project = await getProject(admin, "tech");
    expect(project.statuses.map((status) => status.name)).toEqual([
      "Backlog",
      "A fazer",
      "Em desenvolvimento",
      "Code review",
      "QA",
      "Concluído",
    ]);
    expect(project.labels.map((label) => label.name)).toContain("Bug");
  });

  it("projeto restrito some para quem não é do time", async () => {
    const { admin, member, teamId } = await createWorkspace();
    const marketing = await createTeam(admin, { name: "Marketing", discipline: "marketing" });
    await createProject(admin, { name: "Segredo", key: "SEG", teamId: marketing, discipline: "marketing", visibility: "team" });
    const guest = await createUser("Gui Convidado", "guest", [[teamId, "member"]]);

    expect((await listVisibleProjects(admin)).map((p) => p.key)).toEqual(["SEG", "TECH"]);
    expect((await listVisibleProjects(member)).map((p) => p.key)).toEqual(["TECH"]);
    expect((await listVisibleProjects(guest)).map((p) => p.key)).toEqual(["TECH"]);
    // "Not found" rather than "forbidden": the existence of the project must not leak.
    expect(await code(getProject(member, "SEG"))).toBe("not_found");
  });

  it("convidado só enxerga os times em que está e as pessoas desses times", async () => {
    const { admin, member, teamId } = await createWorkspace();
    const marketing = await createTeam(admin, { name: "Marketing", discipline: "marketing" });
    const outsider = await createUser("Caio Marketing", "member", [[marketing, "member"]]);
    const guest = await createUser("Gui Convidado", "guest", [[teamId, "member"]]);

    expect((await listTeams(guest)).map((team) => team.name)).toEqual(["Tecnologia"]);
    expect((await listTeams(member)).map((team) => team.name)).toEqual(["Marketing", "Tecnologia"]);

    const seenByGuest = (await listMembers(guest)).map((person) => person.id);
    expect(seenByGuest.sort()).toEqual([member.id, guest.id].sort());
    expect((await listMembers(member)).map((person) => person.id)).toContain(outsider.id);
  });

  it("convidado não recebe, na lista de responsáveis, gente de fora dos seus times", async () => {
    const { admin, member, teamId, project } = await createWorkspace();
    const marketing = await createTeam(admin, { name: "Marketing", discipline: "marketing" });
    const outsider = await createUser("Caio Marketing", "member", [[marketing, "member"]]);
    const guest = await createUser("Gui Convidado", "guest", [[teamId, "member"]]);
    const names = (people: { name: string }[]) => people.map((person) => person.name).sort();
    const access = { teamId, visibility: "workspace" as const };

    // The project is open to the company, so everyone below may be assigned to its tasks.
    expect(names(await listAssigneeOptions(member, access))).toEqual(["Ana Admin", "Bia Membro", "Caio Marketing", "Gui Convidado"]);
    expect(names(await listAssigneeOptions(guest, access))).toEqual(["Bia Membro", "Gui Convidado"]);

    // Someone already named on a task the guest can open stays visible on that task.
    const task = await createTask(admin, { projectId: project.id, title: "Campanha conjunta", assigneeId: outsider.id });
    expect(names((await getTaskDetail(guest, task.ref)).assignableUsers)).toEqual(["Bia Membro", "Caio Marketing", "Gui Convidado"]);
  });

  it("arquivar um projeto tira o projeto e as tarefas dele de circulação", async () => {
    const { admin, member, project } = await createWorkspace();
    const task = await createTask(member, { projectId: project.id, title: "Fica para trás" });
    await archiveProject(admin, project.id);

    expect(await listVisibleProjects(admin)).toEqual([]);
    expect(await code(getProject(admin, "TECH"))).toBe("not_found");
    expect(await code(getTaskDetail(admin, task.ref))).toBe("not_found");
    expect(await code(updateTask(member, task.id, { title: "Não muda" }))).toBe("not_found");
    expect(await searchTasks(admin)).toEqual([]);
  });

  it("só gestores e líderes do time criam projetos", async () => {
    const { admin, member, teamId } = await createWorkspace();
    const input = { name: "Novo", key: "NOVO", teamId, discipline: "general", visibility: "workspace" };
    expect(await code(createProject(member, input))).toBe("forbidden");
    await setTeamMember(admin, teamId, member.id, "lead");
    const lead = (await loadActor(member.id))!;
    expect(await code(createProject(lead, input))).toBe("ok");
    expect(await code(createProject(lead, { ...input, name: "Repetido" }))).toBe("conflict");
  });
});

describe("tarefas", () => {
  it("recebem numeração sequencial por projeto e entram na primeira etapa", async () => {
    const { member, project } = await createWorkspace();
    const first = await createTask(member, { projectId: project.id, title: "Primeira" });
    const second = await createTask(member, { projectId: project.id, title: "Segunda" });
    expect([first.ref, second.ref]).toEqual(["TECH-1", "TECH-2"]);
    const detail = await getTaskDetail(member, "tech-1");
    expect(detail.statusName).toBe("Backlog");
    expect(detail.reporter?.name).toBe("Bia Membro");
  });

  it("subtarefas têm um nível só e contam no progresso da tarefa principal", async () => {
    const { member, project } = await createWorkspace();
    const parent = await createTask(member, { projectId: project.id, title: "Principal" });
    const child = await createTask(member, { projectId: project.id, title: "Filha", parentId: parent.id });
    await createTask(member, { projectId: project.id, title: "Outra filha", parentId: parent.id });
    expect(await code(createTask(member, { projectId: project.id, title: "Neta", parentId: child.id }))).toBe("invalid");

    const done = (await getProject(member, "TECH")).statuses.at(-1)!;
    await updateTask(member, child.id, { statusId: done.id });
    const detail = await getTaskDetail(member, parent.ref);
    expect([detail.subtaskDone, detail.subtaskCount]).toEqual([1, 2]);
    expect(detail.subtasks.map((task) => task.title)).toEqual(["Filha", "Outra filha"]);
  });

  it("mover no quadro reordena sem tocar nas outras tarefas e registra a conclusão", async () => {
    const { member, project } = await createWorkspace();
    const { statuses } = await getProject(member, "TECH");
    const [backlog, , , , , done] = statuses;
    const a = await createTask(member, { projectId: project.id, title: "A" });
    const b = await createTask(member, { projectId: project.id, title: "B" });
    const c = await createTask(member, { projectId: project.id, title: "C" });

    const order = async (statusId: string) =>
      (await listProjectTasks(member, project.id)).filter((task) => task.statusId === statusId).map((task) => task.title);
    expect(await order(backlog.id)).toEqual(["A", "B", "C"]);

    // Drop C between A and B.
    await moveTask(member, c.id, { statusId: backlog.id, beforeId: a.id, afterId: b.id });
    expect(await order(backlog.id)).toEqual(["A", "C", "B"]);

    // Drop A into the empty "Concluído" column.
    await moveTask(member, a.id, { statusId: done.id, beforeId: null, afterId: null });
    expect(await order(done.id)).toEqual(["A"]);
    const finished = await getTaskDetail(member, a.ref);
    expect(finished.completedAt).not.toBeNull();
    expect(finished.activity.map((entry) => entry.type)).toEqual(["created", "status_changed"]);

    // Reopening clears the completion date.
    await moveTask(member, a.id, { statusId: backlog.id, beforeId: null, afterId: c.id });
    expect((await getTaskDetail(member, a.ref)).completedAt).toBeNull();
    expect(await order(backlog.id)).toEqual(["A", "C", "B"]);
  });

  it("convidado lê e comenta, mas não cria nem altera", async () => {
    const { member, project, teamId } = await createWorkspace();
    const guest = await createUser("Gui Convidado", "guest", [[teamId, "member"]]);
    const task = await createTask(member, { projectId: project.id, title: "Tarefa" });
    expect((await getTaskDetail(guest, task.ref)).canEdit).toBe(false);
    expect(await code(createTask(guest, { projectId: project.id, title: "Não pode" }))).toBe("forbidden");
    expect(await code(updateTask(guest, task.id, { title: "Não pode" }))).toBe("forbidden");
    expect(await code(addComment(guest, task.id, "Posso comentar"))).toBe("ok");
  });

  it("não atribui tarefa a quem não enxerga o projeto", async () => {
    const { admin, member } = await createWorkspace();
    const marketing = await createTeam(admin, { name: "Marketing", discipline: "marketing" });
    const secret = await createProject(admin, { name: "Segredo", key: "SEG", teamId: marketing, discipline: "marketing", visibility: "team" });
    expect(await code(createTask(admin, { projectId: secret.id, title: "X", assigneeId: member.id }))).toBe("invalid");
  });

  it("só quem criou ou quem gerencia o projeto exclui a tarefa", async () => {
    const { admin, member, project, teamId } = await createWorkspace();
    const other = await createUser("Caio Membro", "member", [[teamId, "member"]]);
    const task = await createTask(member, { projectId: project.id, title: "Tarefa" });
    expect(await code(deleteTask(other, task.id))).toBe("forbidden");
    expect(await code(deleteTask(admin, task.id))).toBe("ok");
    expect(await code(getTaskDetail(member, task.ref))).toBe("not_found");
  });

  it("busca respeita filtros e visibilidade", async () => {
    const { admin, member, project } = await createWorkspace();
    const marketing = await createTeam(admin, { name: "Marketing", discipline: "marketing" });
    const secret = await createProject(admin, { name: "Segredo", key: "SEG", teamId: marketing, discipline: "marketing", visibility: "team" });
    await createTask(admin, { projectId: secret.id, title: "Campanha secreta" });
    await createTask(member, { projectId: project.id, title: "Atrasada", dueDate: addDaysISO(todayISO(), -3), assigneeId: member.id });
    await createTask(member, { projectId: project.id, title: "No prazo", dueDate: addDaysISO(todayISO(), 3) });

    expect((await searchTasks(member)).map((task) => task.title).sort()).toEqual(["Atrasada", "No prazo"]);
    expect((await searchTasks(admin)).length).toBe(3);
    expect((await searchTasks(member, { overdue: true })).map((task) => task.title)).toEqual(["Atrasada"]);
    expect((await searchTasks(member, { query: "prazo" })).map((task) => task.title)).toEqual(["No prazo"]);
    expect((await listMyTasks(member)).map((task) => task.title)).toEqual(["Atrasada"]);
  });
});

describe("notificações", () => {
  it("avisa o responsável na atribuição e os envolvidos em comentários, nunca o próprio autor", async () => {
    const { admin, member, project } = await createWorkspace();
    const task = await createTask(admin, { projectId: project.id, title: "Revisar contrato", assigneeId: member.id });

    expect((await listNotifications(member)).map((n) => n.message)).toEqual([
      "Ana Admin atribuiu a você: TECH-1 Revisar contrato",
    ]);
    expect(await listNotifications(admin)).toEqual([]);

    await addComment(member, task.id, "Feito, pode olhar?");
    const forAdmin = await listNotifications(admin);
    expect(forAdmin.map((n) => n.message)).toEqual(["Bia Membro comentou: TECH-1 Revisar contrato"]);
    expect(forAdmin[0].taskRef).toBe("TECH-1");
    expect((await listNotifications(member)).length).toBe(1);
  });
});

describe("relatório", () => {
  it("consolida abertas, atrasadas e concluídas a partir da categoria das etapas", async () => {
    const { admin, member, project } = await createWorkspace();
    const { statuses } = await getProject(admin, "TECH");
    const inProgress = statuses.find((status) => status.category === "in_progress")!;
    const done = statuses.find((status) => status.category === "done")!;

    await createTask(admin, { projectId: project.id, title: "Atrasada", dueDate: addDaysISO(todayISO(), -2), assigneeId: member.id });
    const doing = await createTask(admin, { projectId: project.id, title: "Fazendo", assigneeId: member.id });
    const finished = await createTask(admin, { projectId: project.id, title: "Feita", assigneeId: member.id });
    await updateTask(admin, doing.id, { statusId: inProgress.id });
    await updateTask(admin, finished.id, { statusId: done.id });

    const report = await getWorkspaceReport(admin);
    expect(report.totals).toMatchObject({ open: 2, inProgress: 1, overdue: 1, created: 3, completed: 1 });
    expect(report.byCategory).toEqual({ todo: 1, in_progress: 1, done: 1 });
    expect(report.projects).toEqual([
      expect.objectContaining({ key: "TECH", open: 2, done: 1, overdue: 1, completed: 1 }),
    ]);
    expect(report.people).toEqual([{ name: "Bia Membro", open: 2, overdue: 1, completed: 1 }]);
    expect(report.overdueTasks.map((task) => task.ref)).toEqual(["TECH-1"]);
    expect(report.weekly.at(-1)).toMatchObject({ created: 3, completed: 1 });

    // Someone with no visible project gets an empty report, not an error.
    const outsider = await createUser("Gui Convidado", "guest");
    expect((await getWorkspaceReport(outsider)).totals.open).toBe(0);
  });
});
