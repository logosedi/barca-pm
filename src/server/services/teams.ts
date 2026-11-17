import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { TEAM_ROLES } from "@/lib/constants";
import { canCreateTeam, canManageTeam, type Actor } from "@/lib/permissions";
import { DISCIPLINES, TEMPLATES } from "@/lib/templates";
import type { TeamSummary } from "@/lib/types";
import { getDb } from "../db/client";
import { projects, teamMembers, teams, users } from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";

const teamSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do time.").max(60, "O nome é longo demais."),
  discipline: z.enum(DISCIPLINES),
  description: z.string().trim().max(300, "A descrição é longa demais.").default(""),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid(result.error.issues[0].message);
  return result.data;
}

/** Teams and their people. Guests only see the teams they were added to. */
export async function listTeams(actor: Actor): Promise<TeamSummary[]> {
  const all = await loadTeams();
  return actor.role === "guest" ? all.filter((team) => actor.teamIds.includes(team.id)) : all;
}

async function loadTeams(): Promise<TeamSummary[]> {
  const db = await getDb();
  const [rows, members, projectCounts] = await Promise.all([
    db.select().from(teams).orderBy(asc(teams.name)),
    db
      .select({ teamId: teamMembers.teamId, role: teamMembers.role, id: users.id, name: users.name, email: users.email })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(users.isActive, true))
      .orderBy(asc(users.name)),
    db.select({ teamId: projects.teamId, value: count() }).from(projects).groupBy(projects.teamId),
  ]);
  return rows.map((team) => ({
    id: team.id,
    name: team.name,
    discipline: team.discipline,
    color: team.color,
    description: team.description,
    projectCount: projectCounts.find((p) => p.teamId === team.id)?.value ?? 0,
    members: members
      .filter((m) => m.teamId === team.id)
      .map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
  }));
}

export async function createTeam(actor: Actor, input: { name: string; discipline: string; description?: string }) {
  if (!canCreateTeam(actor)) throw forbidden();
  const data = parse(teamSchema, input);
  const db = await getDb();
  const [existing] = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, data.name));
  if (existing) throw conflict("Já existe um time com esse nome.");
  const [team] = await db
    .insert(teams)
    .values({ ...data, color: TEMPLATES[data.discipline].color })
    .returning({ id: teams.id });
  return team.id;
}

export async function updateTeam(
  actor: Actor,
  teamId: string,
  input: { name: string; discipline: string; description?: string },
) {
  if (!canManageTeam(actor, teamId)) throw forbidden();
  const data = parse(teamSchema, input);
  const db = await getDb();
  const [existing] = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, data.name));
  if (existing && existing.id !== teamId) throw conflict("Já existe um time com esse nome.");
  await db
    .update(teams)
    .set({ ...data, color: TEMPLATES[data.discipline].color })
    .where(eq(teams.id, teamId));
}

export async function deleteTeam(actor: Actor, teamId: string) {
  if (!canCreateTeam(actor)) throw forbidden();
  const db = await getDb();
  const [used] = await db.select({ value: count() }).from(projects).where(eq(projects.teamId, teamId));
  if (used.value > 0) throw conflict("Este time ainda tem projetos. Mova ou exclua os projetos antes.");
  await db.delete(teams).where(eq(teams.id, teamId));
}

export async function setTeamMember(actor: Actor, teamId: string, userId: string, role: string) {
  if (!canManageTeam(actor, teamId)) throw forbidden();
  const teamRole = parse(z.enum(TEAM_ROLES), role);
  const db = await getDb();
  const [[team], [user]] = await Promise.all([
    db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)),
    db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)),
  ]);
  if (!team || !user) throw notFound("Time ou pessoa não encontrados.");
  if (teamRole === "lead" && user.role === "guest") throw invalid("Um convidado não pode liderar um time.");
  await db
    .insert(teamMembers)
    .values({ teamId, userId, role: teamRole })
    .onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { role: teamRole } });
}

export async function removeTeamMember(actor: Actor, teamId: string, userId: string) {
  if (!canManageTeam(actor, teamId)) throw forbidden();
  const db = await getDb();
  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
}
