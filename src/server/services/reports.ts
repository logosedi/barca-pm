import { and, eq, gte, inArray, ne, or } from "drizzle-orm";
import type { StatusCategory } from "@/lib/constants";
import type { Actor } from "@/lib/permissions";
import { addDaysISO, isValidISODate, taskRef, todayISO } from "@/lib/utils";
import { getDb } from "../db/client";
import { projectStatuses, tasks, users } from "../db/schema";
import { invalid } from "../errors";
import { listVisibleProjects } from "./projects";

// Progress reports. One implementation feeds the dashboard and the MCP report tools,
// so a number shown on screen and a number quoted by an AI assistant always agree.
// Everything is computed from status categories, which is what makes workflows of
// different disciplines comparable.

const WEEKS_IN_TREND = 8;

export interface ReportTask {
  ref: string;
  title: string;
  project: string;
  assignee: string | null;
  dueDate: string | null;
  completedOn: string | null;
}

export interface WorkspaceReport {
  from: string;
  to: string;
  totals: {
    /** Not done, right now. */
    open: number;
    inProgress: number;
    overdue: number;
    /** Created / completed inside the period. */
    created: number;
    completed: number;
    /** Completed in the period of the same length right before this one. */
    completedPrevious: number;
    /** Mean days from creation to completion, for tasks completed in the period. */
    averageCycleDays: number | null;
  };
  byCategory: Record<StatusCategory, number>;
  weekly: { week: string; created: number; completed: number }[];
  projects: { key: string; name: string; team: string; teamColor: string; open: number; done: number; overdue: number; completed: number }[];
  teams: { name: string; color: string; open: number; overdue: number; completed: number }[];
  people: { name: string; open: number; overdue: number; completed: number }[];
  overdueTasks: ReportTask[];
  completedTasks: ReportTask[];
}

export interface ReportOptions {
  from?: string;
  to?: string;
  teamId?: string;
  projectKey?: string;
}

function weekStart(day: string) {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysISO(day, -weekday);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Defaults to the last 30 days. Both ends are inclusive. */
export function resolvePeriod(options: ReportOptions) {
  const to = options.to ?? todayISO();
  const from = options.from ?? addDaysISO(to, -29);
  if (!isValidISODate(from) || !isValidISODate(to)) throw invalid("Datas inválidas. Use o formato AAAA-MM-DD.");
  if (from > to) throw invalid("A data inicial precisa ser anterior à data final.");
  return { from, to };
}

export async function getWorkspaceReport(actor: Actor, options: ReportOptions = {}): Promise<WorkspaceReport> {
  const { from, to } = resolvePeriod(options);
  const today = todayISO();
  const length = daysBetween(from, to) + 1;
  const previousFrom = addDaysISO(from, -length);
  const firstWeek = addDaysISO(weekStart(today), -7 * (WEEKS_IN_TREND - 1));
  const windowStart = previousFrom < firstWeek ? previousFrom : firstWeek;

  const projectList = (await listVisibleProjects(actor)).filter(
    (project) =>
      (!options.teamId || project.team.id === options.teamId) &&
      (!options.projectKey || project.key === options.projectKey.toUpperCase()),
  );

  const report: WorkspaceReport = {
    from,
    to,
    totals: { open: 0, inProgress: 0, overdue: 0, created: 0, completed: 0, completedPrevious: 0, averageCycleDays: null },
    byCategory: { todo: 0, in_progress: 0, done: projectList.reduce((sum, project) => sum + project.doneTasks, 0) },
    weekly: Array.from({ length: WEEKS_IN_TREND }, (_, i) => ({ week: addDaysISO(firstWeek, 7 * i), created: 0, completed: 0 })),
    projects: [],
    teams: [],
    people: [],
    overdueTasks: [],
    completedTasks: [],
  };
  if (projectList.length === 0) return report;

  const db = await getDb();
  // Open tasks plus anything created or completed since the start of the window:
  // enough for every figure below without loading the whole history.
  const windowDate = new Date(`${windowStart}T00:00:00-03:00`);
  const [rows, people] = await Promise.all([
    db
      .select({
        number: tasks.number,
        title: tasks.title,
        projectId: tasks.projectId,
        assigneeId: tasks.assigneeId,
        dueDate: tasks.dueDate,
        createdAt: tasks.createdAt,
        completedAt: tasks.completedAt,
        category: projectStatuses.category,
      })
      .from(tasks)
      .innerJoin(projectStatuses, eq(tasks.statusId, projectStatuses.id))
      .where(
        and(
          inArray(tasks.projectId, projectList.map((project) => project.id)),
          or(ne(projectStatuses.category, "done"), gte(tasks.completedAt, windowDate), gte(tasks.createdAt, windowDate)),
        ),
      ),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);

  const projectById = new Map(projectList.map((project) => [project.id, project]));
  const nameById = new Map(people.map((person) => [person.id, person.name]));
  const perProject = new Map(projectList.map((project) => [project.id, { open: 0, overdue: 0, completed: 0 }]));
  const perPerson = new Map<string, { name: string; open: number; overdue: number; completed: number }>();
  const weekIndex = new Map(report.weekly.map((bucket, i) => [bucket.week, i]));
  let cycleDays = 0;

  const person = (id: string | null) => {
    const key = id ?? "";
    let entry = perPerson.get(key);
    if (!entry) {
      entry = { name: id ? (nameById.get(id) ?? "Pessoa removida") : "Sem responsável", open: 0, overdue: 0, completed: 0 };
      perPerson.set(key, entry);
    }
    return entry;
  };

  for (const row of rows) {
    const project = projectById.get(row.projectId)!;
    const tally = perProject.get(row.projectId)!;
    const done = row.category === "done";
    const createdOn = todayISO(row.createdAt);
    const completedOn = done && row.completedAt ? todayISO(row.completedAt) : null;
    const brief: ReportTask = {
      ref: taskRef(project.key, row.number),
      title: row.title,
      project: project.name,
      assignee: row.assigneeId ? (nameById.get(row.assigneeId) ?? null) : null,
      dueDate: row.dueDate,
      completedOn,
    };

    if (!done) {
      report.totals.open++;
      report.byCategory[row.category]++;
      tally.open++;
      person(row.assigneeId).open++;
      if (row.category === "in_progress") report.totals.inProgress++;
      if (row.dueDate && row.dueDate < today) {
        report.totals.overdue++;
        tally.overdue++;
        person(row.assigneeId).overdue++;
        report.overdueTasks.push(brief);
      }
    }
    if (createdOn >= from && createdOn <= to) report.totals.created++;
    const createdWeek = weekIndex.get(weekStart(createdOn));
    if (createdWeek !== undefined) report.weekly[createdWeek].created++;

    if (completedOn) {
      if (completedOn >= from && completedOn <= to) {
        report.totals.completed++;
        tally.completed++;
        person(row.assigneeId).completed++;
        cycleDays += (row.completedAt!.getTime() - row.createdAt.getTime()) / 86_400_000;
        report.completedTasks.push(brief);
      } else if (completedOn >= previousFrom && completedOn < from) {
        report.totals.completedPrevious++;
      }
      const completedWeek = weekIndex.get(weekStart(completedOn));
      if (completedWeek !== undefined) report.weekly[completedWeek].completed++;
    }
  }

  if (report.totals.completed > 0) {
    report.totals.averageCycleDays = Math.round((cycleDays / report.totals.completed) * 10) / 10;
  }
  report.projects = projectList.map((project) => ({
    key: project.key,
    name: project.name,
    team: project.team.name,
    teamColor: project.team.color,
    done: project.doneTasks,
    ...perProject.get(project.id)!,
  }));
  const perTeam = new Map<string, WorkspaceReport["teams"][number]>();
  for (const project of report.projects) {
    const team = perTeam.get(project.team) ?? { name: project.team, color: project.teamColor, open: 0, overdue: 0, completed: 0 };
    team.open += project.open;
    team.overdue += project.overdue;
    team.completed += project.completed;
    perTeam.set(project.team, team);
  }
  report.teams = [...perTeam.values()];
  report.people = [...perPerson.values()].sort((a, b) => b.open - a.open);
  report.overdueTasks.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  report.completedTasks.sort((a, b) => (b.completedOn ?? "").localeCompare(a.completedOn ?? ""));
  return report;
}
