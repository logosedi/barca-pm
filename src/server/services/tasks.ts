import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, max, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { PRIORITIES, type Priority, type StatusCategory, type TaskSource } from "@/lib/constants";
import { canComment, canEditTasks, canManageProject, canViewProject, type Actor } from "@/lib/permissions";
import type { ActivityInfo, CommentInfo, TaskDetail, TaskSummary, UserRef } from "@/lib/types";
import { isValidISODate, parseTaskRef, taskRef, todayISO } from "@/lib/utils";
import { getDb, type Executor } from "../db/client";
import {
  activity,
  comments,
  labels,
  projectStatuses,
  projects,
  taskLabels,
  tasks,
  teamMembers,
  users,
  type ActivityData,
  type ExternalRef,
} from "../db/schema";
import { forbidden, invalid, notFound } from "../errors";
import { announceInProjectChannel, notify } from "./notifications";
import { loadWorkflow, requireProject, type ProjectRow } from "./projects";
import { listMembers } from "./users";

const POSITION_GAP = 1000;

const titleSchema = z.string().trim().min(1, "Informe o título da tarefa.").max(200, "O título é longo demais.");
const descriptionSchema = z.string().max(50_000, "A descrição é longa demais.");
const dueDateSchema = z.string().refine(isValidISODate, "Data inválida. Use o formato AAAA-MM-DD.").nullable();

const createSchema = z.object({
  projectId: z.uuid(),
  title: titleSchema,
  description: descriptionSchema.default(""),
  statusId: z.uuid().optional(),
  priority: z.enum(PRIORITIES).default("none"),
  assigneeId: z.uuid().nullable().default(null),
  dueDate: dueDateSchema.default(null),
  parentId: z.uuid().nullable().default(null),
  labelIds: z.array(z.uuid()).max(20).default([]),
});
export type CreateTaskInput = z.input<typeof createSchema>;

const updateSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  statusId: z.uuid().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.uuid().nullable().optional(),
  dueDate: dueDateSchema.optional(),
  labelIds: z.array(z.uuid()).max(20).optional(),
});
export type UpdateTaskInput = z.input<typeof updateSchema>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid(result.error.issues[0].message);
  return result.data;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const assignee = alias(users, "assignee");

const summaryColumns = {
  id: tasks.id,
  number: tasks.number,
  projectId: tasks.projectId,
  projectKey: projects.key,
  projectName: projects.name,
  title: tasks.title,
  statusId: tasks.statusId,
  statusName: projectStatuses.name,
  statusCategory: projectStatuses.category,
  priority: tasks.priority,
  assigneeId: tasks.assigneeId,
  assigneeName: assignee.name,
  dueDate: tasks.dueDate,
  parentId: tasks.parentId,
  position: tasks.position,
  source: tasks.source,
  createdAt: tasks.createdAt,
  completedAt: tasks.completedAt,
};

async function selectSummaries(where: SQL | undefined, order: SQL[], limit?: number): Promise<TaskSummary[]> {
  const db = await getDb();
  const query = db
    .select(summaryColumns)
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(projectStatuses, eq(tasks.statusId, projectStatuses.id))
    .leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
    .where(where)
    .orderBy(...order);
  const rows = await (limit ? query.limit(limit) : query);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [labelRows, commentRows, subtaskRows] = await Promise.all([
    db.select().from(taskLabels).where(inArray(taskLabels.taskId, ids)),
    db
      .select({ taskId: comments.taskId, value: count() })
      .from(comments)
      .where(inArray(comments.taskId, ids))
      .groupBy(comments.taskId),
    db
      .select({
        parentId: tasks.parentId,
        total: count(),
        done: sql<number>`count(*) filter (where ${projectStatuses.category} = 'done')::int`,
      })
      .from(tasks)
      .innerJoin(projectStatuses, eq(tasks.statusId, projectStatuses.id))
      .where(inArray(tasks.parentId, ids))
      .groupBy(tasks.parentId),
  ]);
  const labelsByTask = Map.groupBy(labelRows, (row) => row.taskId);
  const commentsByTask = new Map(commentRows.map((row) => [row.taskId, row.value]));
  const subtasksByTask = new Map(subtaskRows.map((row) => [row.parentId, row]));

  return rows.map((row) => ({
    id: row.id,
    ref: taskRef(row.projectKey, row.number),
    number: row.number,
    projectId: row.projectId,
    projectKey: row.projectKey,
    projectName: row.projectName,
    title: row.title,
    statusId: row.statusId,
    statusName: row.statusName,
    statusCategory: row.statusCategory,
    priority: row.priority,
    assignee: row.assigneeId && row.assigneeName ? { id: row.assigneeId, name: row.assigneeName } : null,
    dueDate: row.dueDate,
    parentId: row.parentId,
    position: row.position,
    labelIds: (labelsByTask.get(row.id) ?? []).map((label) => label.labelId),
    subtaskCount: subtasksByTask.get(row.id)?.total ?? 0,
    subtaskDone: subtasksByTask.get(row.id)?.done ?? 0,
    commentCount: commentsByTask.get(row.id) ?? 0,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }));
}

/** Ids of the non-archived projects the actor may see. Scopes every cross-project query. */
export async function visibleProjectIds(actor: Actor): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: projects.id, teamId: projects.teamId, visibility: projects.visibility })
    .from(projects)
    .where(isNull(projects.archivedAt));
  return rows.filter((project) => canViewProject(actor, project)).map((project) => project.id);
}

/** Every task of a project, subtasks included, in board order. */
export async function listProjectTasks(actor: Actor, projectId: string): Promise<TaskSummary[]> {
  await requireProject(actor, projectId, "view");
  return selectSummaries(eq(tasks.projectId, projectId), [asc(tasks.position), asc(tasks.number)]);
}

export interface TaskFilters {
  projectKey?: string;
  statusCategory?: StatusCategory;
  /** When true, only tasks that are not done. */
  open?: boolean;
  assigneeId?: string;
  unassigned?: boolean;
  priority?: Priority;
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
  completedFrom?: string;
  completedTo?: string;
  updatedSince?: string;
  query?: string;
  limit?: number;
}

/** Cross-project search, always restricted to what the actor can see. */
export async function searchTasks(actor: Actor, filters: TaskFilters = {}): Promise<TaskSummary[]> {
  const projectIds = await visibleProjectIds(actor);
  if (projectIds.length === 0) return [];
  const conditions: (SQL | undefined)[] = [inArray(tasks.projectId, projectIds)];
  if (filters.projectKey) conditions.push(eq(projects.key, filters.projectKey.toUpperCase()));
  if (filters.statusCategory) conditions.push(eq(projectStatuses.category, filters.statusCategory));
  if (filters.open) conditions.push(ne(projectStatuses.category, "done"));
  if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));
  if (filters.unassigned) conditions.push(isNull(tasks.assigneeId));
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
  if (filters.overdue) {
    conditions.push(isNotNull(tasks.dueDate), lt(tasks.dueDate, todayISO()), ne(projectStatuses.category, "done"));
  }
  if (filters.dueFrom) conditions.push(gte(tasks.dueDate, filters.dueFrom));
  if (filters.dueTo) conditions.push(lte(tasks.dueDate, filters.dueTo));
  if (filters.completedFrom) conditions.push(gte(tasks.completedAt, startOfDay(filters.completedFrom)));
  if (filters.completedTo) conditions.push(lt(tasks.completedAt, startOfDay(filters.completedTo, 1)));
  if (filters.updatedSince) conditions.push(gte(tasks.updatedAt, startOfDay(filters.updatedSince)));
  if (filters.query?.trim()) {
    const pattern = `%${filters.query.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)));
  }
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  return selectSummaries(and(...conditions), [desc(tasks.updatedAt)], limit);
}

/** Midnight in the workspace timezone (UTC-3, no DST) for a YYYY-MM-DD day. */
function startOfDay(day: string, offsetDays = 0) {
  if (!isValidISODate(day)) throw invalid("Data inválida. Use o formato AAAA-MM-DD.");
  const date = new Date(`${day}T00:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

/** Open tasks assigned to the actor, most urgent deadline first. */
export async function listMyTasks(actor: Actor): Promise<TaskSummary[]> {
  const projectIds = await visibleProjectIds(actor);
  if (projectIds.length === 0) return [];
  return selectSummaries(
    and(inArray(tasks.projectId, projectIds), eq(tasks.assigneeId, actor.id), ne(projectStatuses.category, "done")),
    [sql`${tasks.dueDate} asc nulls last`, desc(tasks.createdAt)],
    200,
  );
}

/** Active people who can see the project, i.e. who a task in it can be assigned to. */
export async function listProjectAssignees(project: Pick<ProjectRow, "teamId" | "visibility">): Promise<UserRef[]> {
  const db = await getDb();
  const [people, memberships] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(eq(users.isActive, true), isNotNull(users.passwordHash)))
      .orderBy(asc(users.name)),
    db.select().from(teamMembers),
  ]);
  return people
    .filter((person) => {
      const mine = memberships.filter((m) => m.userId === person.id);
      return canViewProject(
        {
          ...person,
          teamIds: mine.map((m) => m.teamId),
          leadTeamIds: mine.filter((m) => m.role === "lead").map((m) => m.teamId),
        },
        project,
      );
    })
    .map(({ id, name }) => ({ id, name }));
}

/**
 * The assignee choices sent to `actor`'s browser. Guests cannot assign anything, so for
 * them the list only feeds filters and labels: it is cut down to the people they are
 * allowed to know about (who shares a team with them) plus whoever is already named on
 * the tasks they are looking at.
 */
export async function listAssigneeOptions(
  actor: Actor,
  project: Pick<ProjectRow, "teamId" | "visibility">,
  alreadyVisible: (string | null | undefined)[] = [],
): Promise<UserRef[]> {
  const people = await listProjectAssignees(project);
  if (actor.role !== "guest") return people;
  const known = new Set(alreadyVisible);
  for (const member of await listMembers(actor)) known.add(member.id);
  return people.filter((person) => known.has(person.id));
}

async function findTaskByRef(ref: string) {
  const parsed = parseTaskRef(ref);
  if (!parsed) throw notFound("Tarefa não encontrada.");
  const db = await getDb();
  const [row] = await db
    .select({ task: tasks, project: projects })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(projects.key, parsed.key), eq(tasks.number, parsed.number)));
  return row ?? null;
}

export async function getTaskDetail(actor: Actor, ref: string): Promise<TaskDetail> {
  const found = await findTaskByRef(ref);
  if (!found || found.project.archivedAt || !canViewProject(actor, found.project)) throw notFound("Tarefa não encontrada.");
  const { task, project } = found;
  const db = await getDb();
  const author = alias(users, "author");
  const actorUser = alias(users, "actor_user");

  const [[summary], subtasks, commentRows, activityRows, workflow, [reporter], [parent]] =
    await Promise.all([
      selectSummaries(eq(tasks.id, task.id), [asc(tasks.number)]),
      selectSummaries(eq(tasks.parentId, task.id), [asc(tasks.number)]),
      db
        .select({ comment: comments, authorName: author.name })
        .from(comments)
        .leftJoin(author, eq(comments.authorId, author.id))
        .where(eq(comments.taskId, task.id))
        .orderBy(asc(comments.createdAt)),
      db
        .select({ entry: activity, actorName: actorUser.name })
        .from(activity)
        .leftJoin(actorUser, eq(activity.actorId, actorUser.id))
        .where(eq(activity.taskId, task.id))
        .orderBy(asc(activity.createdAt)),
      loadWorkflow(project.id),
      task.reporterId
        ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, task.reporterId))
        : Promise.resolve([]),
      task.parentId
        ? db.select({ number: tasks.number, title: tasks.title }).from(tasks).where(eq(tasks.id, task.parentId))
        : Promise.resolve([]),
    ]);

  const assignableUsers = await listAssigneeOptions(actor, project, [
    summary.assignee?.id,
    ...subtasks.map((subtask) => subtask.assignee?.id),
  ]);
  const manages = canManageProject(actor, project);
  const edits = canEditTasks(actor, project);
  return {
    ...summary,
    description: task.description,
    reporter: reporter ?? null,
    parent: parent ? { ref: taskRef(project.key, parent.number), title: parent.title } : null,
    externalRef: task.externalRef ?? null,
    updatedAt: task.updatedAt.toISOString(),
    subtasks,
    comments: commentRows.map(
      ({ comment, authorName }): CommentInfo => ({
        id: comment.id,
        author: comment.authorId && authorName ? { id: comment.authorId, name: authorName } : null,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        canDelete: manages || comment.authorId === actor.id,
      }),
    ),
    activity: activityRows.map(
      ({ entry, actorName }): ActivityInfo => ({
        id: entry.id,
        actor: entry.actorId && actorName ? { id: entry.actorId, name: actorName } : null,
        type: entry.type,
        data: entry.data,
        createdAt: entry.createdAt.toISOString(),
      }),
    ),
    statuses: workflow.statuses,
    labels: workflow.labels,
    assignableUsers,
    canEdit: edits,
    canComment: canComment(actor, project),
    canDelete: manages || (edits && task.reporterId === actor.id),
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function nextPosition(db: Executor, statusId: string) {
  const [row] = await db
    .select({ value: max(tasks.position) })
    .from(tasks)
    .where(eq(tasks.statusId, statusId));
  return (row.value ?? 0) + POSITION_GAP;
}

async function assertAssignable(project: ProjectRow, assigneeId: string) {
  const allowed = await listProjectAssignees(project);
  if (!allowed.some((person) => person.id === assigneeId)) {
    throw invalid("Essa pessoa não tem acesso a este projeto. Inclua-a no time antes de atribuir a tarefa.");
  }
}

async function assertLabels(db: Executor, projectId: string, labelIds: string[]) {
  if (labelIds.length === 0) return;
  const found = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.projectId, projectId), inArray(labels.id, labelIds)));
  if (found.length !== new Set(labelIds).size) throw invalid("Etiqueta inválida para este projeto.");
}

interface NewTask {
  title: string;
  description: string;
  statusId?: string;
  priority: Priority;
  assigneeId: string | null;
  dueDate: string | null;
  parentId: string | null;
  labelIds: string[];
  source: TaskSource;
  externalRef?: ExternalRef;
}

/** Inserts a task. `actor` null means the system created it (integration rule). */
async function insertTask(project: ProjectRow, actor: Actor | null, data: NewTask) {
  const db = await getDb();
  if (data.assigneeId) await assertAssignable(project, data.assigneeId);
  await assertLabels(db, project.id, data.labelIds);

  const statuses = await db
    .select()
    .from(projectStatuses)
    .where(eq(projectStatuses.projectId, project.id))
    .orderBy(asc(projectStatuses.position));
  const status = data.statusId ? statuses.find((s) => s.id === data.statusId) : statuses[0];
  if (!status) throw invalid("Etapa inválida para este projeto.");

  if (data.parentId) {
    const [parent] = await db.select().from(tasks).where(eq(tasks.id, data.parentId));
    if (!parent || parent.projectId !== project.id) throw invalid("A tarefa principal não pertence a este projeto.");
    if (parent.parentId) throw invalid("Uma subtarefa não pode ter subtarefas.");
  }

  const created = await db.transaction(async (tx) => {
    // The per-project counter is bumped in the same transaction as the insert, so two
    // concurrent creations cannot receive the same number.
    const [{ number }] = await tx
      .update(projects)
      .set({ taskCounter: sql`${projects.taskCounter} + 1` })
      .where(eq(projects.id, project.id))
      .returning({ number: projects.taskCounter });
    const [task] = await tx
      .insert(tasks)
      .values({
        projectId: project.id,
        number,
        title: data.title,
        description: data.description,
        statusId: status.id,
        priority: data.priority,
        assigneeId: data.assigneeId,
        reporterId: actor?.id ?? null,
        parentId: data.parentId,
        dueDate: data.dueDate,
        position: await nextPosition(tx, status.id),
        source: data.source,
        externalRef: data.externalRef,
        completedAt: status.category === "done" ? new Date() : null,
      })
      .returning();
    if (data.labelIds.length > 0) {
      await tx.insert(taskLabels).values(data.labelIds.map((labelId) => ({ taskId: task.id, labelId })));
    }
    await tx.insert(activity).values({ taskId: task.id, actorId: actor?.id ?? null, type: "created", data: { source: data.source } });
    return task;
  });

  const ref = taskRef(project.key, created.number);
  const who = actor?.name ?? sourceName(data.source);
  if (created.assigneeId) {
    await notify({
      recipients: [created.assigneeId],
      actorId: actor?.id ?? null,
      type: "assigned",
      task: { id: created.id, ref, title: created.title },
      message: `${who} atribuiu a você`,
    });
  }
  if (!created.parentId) {
    announceInProjectChannel(project.slackChannelId, `${who} criou uma tarefa`, { ref, title: created.title });
  }
  return { id: created.id, ref, title: created.title };
}

function sourceName(source: TaskSource) {
  return source === "shopify" ? "Shopify" : source === "guru" ? "Guru" : "BARCA PM";
}

export async function createTask(actor: Actor, input: CreateTaskInput, source: TaskSource = "web") {
  const data = parse(createSchema, input);
  const project = await requireProject(actor, data.projectId, "edit");
  return insertTask(project, actor, { ...data, source });
}

/** Used by automation rules: no acting user, and the project is trusted input. */
export async function createSystemTask(
  projectId: string,
  data: Pick<NewTask, "title" | "description" | "priority" | "assigneeId" | "source" | "externalRef">,
) {
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.archivedAt) throw notFound("Projeto da regra não existe mais ou foi arquivado.");
  return insertTask(project, null, {
    ...data,
    title: parse(titleSchema, data.title.slice(0, 200)),
    dueDate: null,
    parentId: null,
    labelIds: [],
  });
}

async function loadTaskForWrite(actor: Actor, taskId: string, level: "view" | "edit") {
  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw notFound("Tarefa não encontrada.");
  const project = await requireProject(actor, task.projectId, level);
  return { task, project };
}

export async function updateTask(actor: Actor, taskId: string, input: UpdateTaskInput, position?: number) {
  const patch = parse(updateSchema, input);
  const { task, project } = await loadTaskForWrite(actor, taskId, "edit");
  const db = await getDb();
  const ref = taskRef(project.key, task.number);

  const changes: Partial<typeof tasks.$inferInsert> = {};
  const log: { type: string; data: ActivityData }[] = [];
  const after: (() => Promise<void> | void)[] = [];
  const brief = { id: task.id, ref, title: patch.title ?? task.title };

  if (patch.title !== undefined && patch.title !== task.title) {
    changes.title = patch.title;
    log.push({ type: "title_changed", data: { from: task.title, to: patch.title } });
  }
  if (patch.description !== undefined && patch.description !== task.description) {
    changes.description = patch.description;
    log.push({ type: "description_changed", data: {} });
  }
  if (patch.priority !== undefined && patch.priority !== task.priority) {
    changes.priority = patch.priority;
    log.push({ type: "priority_changed", data: { from: task.priority, to: patch.priority } });
  }
  if (patch.dueDate !== undefined && patch.dueDate !== task.dueDate) {
    changes.dueDate = patch.dueDate;
    log.push({ type: "due_changed", data: { from: task.dueDate, to: patch.dueDate } });
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
    let assigneeName: string | null = null;
    if (patch.assigneeId) {
      await assertAssignable(project, patch.assigneeId);
      const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, patch.assigneeId));
      assigneeName = person.name;
    }
    changes.assigneeId = patch.assigneeId;
    log.push({ type: "assigned", data: { to: assigneeName } });
    after.push(() =>
      notify({
        recipients: [patch.assigneeId],
        actorId: actor.id,
        type: "assigned",
        task: brief,
        message: `${actor.name} atribuiu a você`,
      }),
    );
  }
  if (patch.statusId !== undefined && patch.statusId !== task.statusId) {
    const statuses = await db.select().from(projectStatuses).where(eq(projectStatuses.projectId, project.id));
    const from = statuses.find((s) => s.id === task.statusId);
    const to = statuses.find((s) => s.id === patch.statusId);
    if (!to) throw invalid("Etapa inválida para este projeto.");
    changes.statusId = to.id;
    changes.position = position ?? (await nextPosition(db, to.id));
    if (to.category === "done" && !task.completedAt) changes.completedAt = new Date();
    if (to.category !== "done") changes.completedAt = null;
    log.push({ type: "status_changed", data: { from: from?.name ?? null, to: to.name } });
    after.push(() =>
      notify({
        recipients: [task.assigneeId, task.reporterId],
        actorId: actor.id,
        type: "status_changed",
        task: brief,
        message: `${actor.name} moveu para ${to.name}`,
      }),
    );
    if (to.category === "done" && from?.category !== "done" && !task.parentId) {
      after.push(() => announceInProjectChannel(project.slackChannelId, `${actor.name} concluiu`, brief));
    }
  } else if (position !== undefined && position !== task.position) {
    changes.position = position;
  }

  let labelsChanged = false;
  if (patch.labelIds !== undefined) {
    await assertLabels(db, project.id, patch.labelIds);
    const current = await db.select().from(taskLabels).where(eq(taskLabels.taskId, task.id));
    const next = new Set(patch.labelIds);
    labelsChanged = current.length !== next.size || current.some((row) => !next.has(row.labelId));
  }

  if (Object.keys(changes).length === 0 && !labelsChanged) return { id: task.id, ref };

  await db.transaction(async (tx) => {
    // Reordering inside a column is not a content change, so it leaves updatedAt alone.
    const contentChanged = log.length > 0 || labelsChanged;
    await tx
      .update(tasks)
      .set(contentChanged ? { ...changes, updatedAt: new Date() } : changes)
      .where(eq(tasks.id, task.id));
    if (labelsChanged && patch.labelIds) {
      await tx.delete(taskLabels).where(eq(taskLabels.taskId, task.id));
      if (patch.labelIds.length > 0) {
        await tx.insert(taskLabels).values([...new Set(patch.labelIds)].map((labelId) => ({ taskId: task.id, labelId })));
      }
    }
    if (log.length > 0) {
      await tx.insert(activity).values(log.map((entry) => ({ taskId: task.id, actorId: actor.id, ...entry })));
    }
  });
  for (const effect of after) await effect();
  return { id: task.id, ref };
}

/**
 * Drops a card between two neighbours of a status column. The new position is the
 * midpoint of the neighbours, so no other row needs to be rewritten.
 */
export async function moveTask(
  actor: Actor,
  taskId: string,
  target: { statusId: string; beforeId: string | null; afterId: string | null },
) {
  const db = await getDb();
  const neighbourIds = [target.beforeId, target.afterId].filter((id): id is string => !!id && id !== taskId);
  const neighbours = neighbourIds.length
    ? await db
        .select({ id: tasks.id, position: tasks.position })
        .from(tasks)
        .where(and(inArray(tasks.id, neighbourIds), eq(tasks.statusId, target.statusId)))
    : [];
  const before = neighbours.find((n) => n.id === target.beforeId)?.position;
  const after = neighbours.find((n) => n.id === target.afterId)?.position;

  let position: number;
  if (before !== undefined && after !== undefined) position = (before + after) / 2;
  else if (before !== undefined) position = before + POSITION_GAP;
  else if (after !== undefined) position = after - POSITION_GAP;
  else position = await nextPosition(db, target.statusId);

  return updateTask(actor, taskId, { statusId: target.statusId }, position);
}

export async function deleteTask(actor: Actor, taskId: string) {
  const { task, project } = await loadTaskForWrite(actor, taskId, "edit");
  if (!canManageProject(actor, project) && task.reporterId !== actor.id) {
    throw forbidden("Só quem criou a tarefa ou quem gerencia o projeto pode excluí-la.");
  }
  const db = await getDb();
  await db.delete(tasks).where(eq(tasks.id, taskId));
}

export async function addComment(actor: Actor, taskId: string, body: string) {
  const text = parse(
    z.string().trim().min(1, "Escreva o comentário antes de enviar.").max(20_000, "O comentário é longo demais."),
    body,
  );
  const { task, project } = await loadTaskForWrite(actor, taskId, "view");
  if (!canComment(actor, project)) throw forbidden();
  const db = await getDb();
  const [comment] = await db
    .insert(comments)
    .values({ taskId, authorId: actor.id, body: text })
    .returning({ id: comments.id });
  const participants = await db
    .selectDistinct({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.taskId, taskId));
  await notify({
    recipients: [task.assigneeId, task.reporterId, ...participants.map((p) => p.authorId)],
    actorId: actor.id,
    type: "commented",
    task: { id: task.id, ref: taskRef(project.key, task.number), title: task.title },
    message: `${actor.name} comentou`,
  });
  return comment.id;
}

export async function deleteComment(actor: Actor, commentId: string) {
  const db = await getDb();
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!comment) throw notFound("Comentário não encontrado.");
  const { project } = await loadTaskForWrite(actor, comment.taskId, "view");
  if (comment.authorId !== actor.id && !canManageProject(actor, project)) throw forbidden();
  await db.delete(comments).where(eq(comments.id, commentId));
}
