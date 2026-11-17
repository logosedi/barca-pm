import { and, asc, count, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { COLOR_PALETTE, PROJECT_VISIBILITIES, STATUS_CATEGORIES } from "@/lib/constants";
import {
  canCreateProject,
  canEditTasks,
  canManageProject,
  canViewProject,
  type Actor,
} from "@/lib/permissions";
import { DISCIPLINES, TEMPLATES } from "@/lib/templates";
import type { LabelInfo, ProjectDetail, ProjectSummary, StatusInfo } from "@/lib/types";
import { getDb, type Executor } from "../db/client";
import { labels, projectStatuses, projects, tasks, teams } from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid(result.error.issues[0].message);
  return result.data;
}

const projectFields = {
  name: z.string().trim().min(2, "Informe o nome do projeto.").max(80, "O nome é longo demais."),
  description: z.string().trim().max(500, "A descrição é longa demais.").default(""),
  visibility: z.enum(PROJECT_VISIBILITIES),
};

const createSchema = z.object({
  ...projectFields,
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,5}$/, "A sigla deve ter de 2 a 6 letras ou números e começar com letra."),
  teamId: z.uuid("Escolha um time."),
  discipline: z.enum(DISCIPLINES),
});

const updateSchema = z.object({
  ...projectFields,
  slackChannelId: z
    .string()
    .trim()
    .regex(/^[CG][A-Z0-9]{6,}$/, "ID de canal inválido. Ele começa com C ou G, por exemplo C0123ABCD.")
    .nullable(),
});

const statusSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da etapa.").max(40, "O nome é longo demais."),
  category: z.enum(STATUS_CATEGORIES),
});

export type ProjectRow = typeof projects.$inferSelect;

async function projectRows(extraWhere?: ReturnType<typeof eq>) {
  const db = await getDb();
  const done = sql<number>`count(*) filter (where ${projectStatuses.category} = 'done')::int`;
  const open = sql<number>`count(*) filter (where ${projectStatuses.category} <> 'done')::int`;
  const [rows, counts] = await Promise.all([
    db
      .select({ project: projects, team: { id: teams.id, name: teams.name, color: teams.color } })
      .from(projects)
      .innerJoin(teams, eq(projects.teamId, teams.id))
      .where(and(isNull(projects.archivedAt), extraWhere))
      .orderBy(asc(teams.name), asc(projects.name)),
    db
      .select({ projectId: tasks.projectId, done, open })
      .from(tasks)
      .innerJoin(projectStatuses, eq(tasks.statusId, projectStatuses.id))
      .groupBy(tasks.projectId),
  ]);
  return rows.map(({ project, team }): ProjectSummary => {
    const tally = counts.find((c) => c.projectId === project.id);
    return {
      id: project.id,
      key: project.key,
      name: project.name,
      description: project.description,
      discipline: project.discipline,
      visibility: project.visibility,
      slackChannelId: project.slackChannelId,
      team,
      openTasks: tally?.open ?? 0,
      doneTasks: tally?.done ?? 0,
    };
  });
}

const access = (project: ProjectSummary) => ({ teamId: project.team.id, visibility: project.visibility });

/** Every non-archived project the actor is allowed to see. */
export async function listVisibleProjects(actor: Actor): Promise<ProjectSummary[]> {
  return (await projectRows()).filter((project) => canViewProject(actor, access(project)));
}

/** Project with its workflow. Hidden projects answer "not found" so their existence does not leak. */
export async function getProject(actor: Actor, key: string): Promise<ProjectDetail> {
  const [project] = await projectRows(eq(projects.key, key.toUpperCase()));
  if (!project || !canViewProject(actor, access(project))) throw notFound("Projeto não encontrado.");
  const { statuses, labels: projectLabels } = await loadWorkflow(project.id);
  return {
    ...project,
    statuses,
    labels: projectLabels,
    canEdit: canEditTasks(actor, access(project)),
    canManage: canManageProject(actor, access(project)),
  };
}

export async function loadWorkflow(projectId: string): Promise<{ statuses: StatusInfo[]; labels: LabelInfo[] }> {
  const db = await getDb();
  const [statuses, projectLabels] = await Promise.all([
    db
      .select({
        id: projectStatuses.id,
        name: projectStatuses.name,
        category: projectStatuses.category,
        position: projectStatuses.position,
      })
      .from(projectStatuses)
      .where(eq(projectStatuses.projectId, projectId))
      .orderBy(asc(projectStatuses.position)),
    db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .where(eq(labels.projectId, projectId))
      .orderBy(asc(labels.name)),
  ]);
  return { statuses, labels: projectLabels };
}

/** Loads a project row and checks the actor against the required level. */
export async function requireProject(
  actor: Actor,
  projectId: string,
  level: "view" | "edit" | "manage",
  executor?: Executor,
): Promise<ProjectRow> {
  const db = executor ?? (await getDb());
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.archivedAt || !canViewProject(actor, project)) throw notFound("Projeto não encontrado.");
  if (level === "edit" && !canEditTasks(actor, project)) throw forbidden("Você só tem acesso de leitura a este projeto.");
  if (level === "manage" && !canManageProject(actor, project)) throw forbidden();
  return project;
}

export async function createProject(
  actor: Actor,
  input: { name: string; key: string; teamId: string; discipline: string; visibility: string; description?: string },
) {
  const data = parse(createSchema, input);
  if (!canCreateProject(actor, data.teamId)) throw forbidden("Só gestores e líderes do time podem criar projetos nele.");
  const db = await getDb();
  const [[team], [taken]] = await Promise.all([
    db.select({ id: teams.id }).from(teams).where(eq(teams.id, data.teamId)),
    db.select({ id: projects.id }).from(projects).where(eq(projects.key, data.key)),
  ]);
  if (!team) throw notFound("Time não encontrado.");
  if (taken) throw conflict(`A sigla ${data.key} já está em uso por outro projeto.`);

  const template = TEMPLATES[data.discipline];
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ ...data, createdBy: actor.id })
      .returning({ id: projects.id, key: projects.key });
    await tx.insert(projectStatuses).values(
      template.statuses.map((status, position) => ({ projectId: project.id, ...status, position })),
    );
    if (template.labels.length > 0) {
      await tx.insert(labels).values(template.labels.map((label) => ({ projectId: project.id, ...label })));
    }
    return project;
  });
}

export async function updateProject(
  actor: Actor,
  projectId: string,
  input: { name: string; description?: string; visibility: string; slackChannelId: string | null },
) {
  await requireProject(actor, projectId, "manage");
  const data = parse(updateSchema, { ...input, slackChannelId: input.slackChannelId?.trim() || null });
  const db = await getDb();
  await db.update(projects).set(data).where(eq(projects.id, projectId));
}

export async function archiveProject(actor: Actor, projectId: string) {
  await requireProject(actor, projectId, "manage");
  const db = await getDb();
  await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function addStatus(actor: Actor, projectId: string, input: { name: string; category: string }) {
  await requireProject(actor, projectId, "manage");
  const data = parse(statusSchema, input);
  const db = await getDb();
  const [last] = await db
    .select({ value: max(projectStatuses.position) })
    .from(projectStatuses)
    .where(eq(projectStatuses.projectId, projectId));
  await db.insert(projectStatuses).values({ projectId, ...data, position: (last.value ?? -1) + 1 });
}

async function requireStatus(actor: Actor, statusId: string) {
  const db = await getDb();
  const [status] = await db.select().from(projectStatuses).where(eq(projectStatuses.id, statusId));
  if (!status) throw notFound("Etapa não encontrada.");
  await requireProject(actor, status.projectId, "manage");
  return status;
}

export async function updateStatus(actor: Actor, statusId: string, input: { name: string; category: string }) {
  const status = await requireStatus(actor, statusId);
  const data = parse(statusSchema, input);
  const db = await getDb();
  await db.update(projectStatuses).set(data).where(eq(projectStatuses.id, statusId));
  if (data.category !== status.category) {
    // Keep completion timestamps consistent with the new meaning of the column.
    await db
      .update(tasks)
      .set({ completedAt: data.category === "done" ? sql`coalesce(${tasks.completedAt}, now())` : null })
      .where(eq(tasks.statusId, statusId));
  }
}

export async function deleteStatus(actor: Actor, statusId: string) {
  const status = await requireStatus(actor, statusId);
  const db = await getDb();
  const [[used], [total]] = await Promise.all([
    db.select({ value: count() }).from(tasks).where(eq(tasks.statusId, statusId)),
    db.select({ value: count() }).from(projectStatuses).where(eq(projectStatuses.projectId, status.projectId)),
  ]);
  if (used.value > 0) throw conflict("Ainda há tarefas nesta etapa. Mova-as para outra etapa antes de excluir.");
  if (total.value <= 1) throw conflict("O projeto precisa de pelo menos uma etapa.");
  await db.delete(projectStatuses).where(eq(projectStatuses.id, statusId));
}

/** Moves a status one step left or right in the board. */
export async function shiftStatus(actor: Actor, statusId: string, direction: "left" | "right") {
  const status = await requireStatus(actor, statusId);
  const db = await getDb();
  const ordered = await db
    .select({ id: projectStatuses.id })
    .from(projectStatuses)
    .where(eq(projectStatuses.projectId, status.projectId))
    .orderBy(asc(projectStatuses.position));
  const index = ordered.findIndex((s) => s.id === statusId);
  const target = direction === "left" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  await db.transaction(async (tx) => {
    for (const [position, item] of ordered.entries()) {
      await tx.update(projectStatuses).set({ position }).where(eq(projectStatuses.id, item.id));
    }
  });
}

export async function addLabel(actor: Actor, projectId: string, input: { name: string; color?: string }) {
  await requireProject(actor, projectId, "manage");
  const data = parse(
    z.object({
      name: z.string().trim().min(1, "Informe o nome da etiqueta.").max(30, "O nome é longo demais."),
      color: z.enum(COLOR_PALETTE).default(COLOR_PALETTE[0]),
    }),
    input,
  );
  const db = await getDb();
  const [existing] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.projectId, projectId), eq(labels.name, data.name)));
  if (existing) throw conflict("Já existe uma etiqueta com esse nome neste projeto.");
  await db.insert(labels).values({ projectId, ...data });
}

export async function deleteLabel(actor: Actor, labelId: string) {
  const db = await getDb();
  const [label] = await db.select().from(labels).where(eq(labels.id, labelId));
  if (!label) throw notFound("Etiqueta não encontrada.");
  await requireProject(actor, label.projectId, "manage");
  await db.delete(labels).where(eq(labels.id, labelId));
}
