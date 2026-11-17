import { and, asc, count, eq, gt, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { ROLES, type Role } from "@/lib/constants";
import { canManageMembers, type Actor } from "@/lib/permissions";
import type { MemberSummary, UserRef } from "@/lib/types";
import { hashPassword, randomToken, sha256, verifyPassword } from "../auth/crypto";
import { getDb } from "../db/client";
import { sessions, teamMembers, teams, users } from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const passwordSchema = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .max(200, "A senha é longa demais.");
const nameSchema = z.string().trim().min(2, "Informe o nome.").max(80, "O nome é longo demais.");
const emailSchema = z.string().trim().toLowerCase().max(200).pipe(z.email("E-mail inválido."));

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid(result.error.issues[0].message);
  return result.data;
}

export async function countUsers() {
  const db = await getDb();
  const [row] = await db.select({ value: count() }).from(users);
  return row.value;
}

/** First-run setup: creates the first administrator. Refuses once any user exists. */
export async function setupWorkspace(input: { name: string; email: string; password: string }) {
  const data = parse(z.object({ name: nameSchema, email: emailSchema, password: passwordSchema }), input);
  const db = await getDb();
  if ((await countUsers()) > 0) throw conflict("O BARCA PM já foi configurado. Entre com a sua conta.");
  const [user] = await db
    .insert(users)
    .values({ name: data.name, email: data.email, role: "admin", passwordHash: await hashPassword(data.password) })
    .returning({ id: users.id });
  return user.id;
}

export async function authenticate(email: string, password: string) {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid || !user.isActive) return null;
  return user.id;
}

export async function createSession(userId: string) {
  const db = await getDb();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(token: string) {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function findActorBySessionToken(token: string): Promise<Actor | null> {
  const db = await getDb();
  const [session] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())));
  return session ? loadActor(session.userId) : null;
}

/** Loads the user with the team memberships that permission checks depend on. */
export async function loadActor(userId: string): Promise<Actor | null> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) return null;
  const memberships = await db.select().from(teamMembers).where(eq(teamMembers.userId, userId));
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamIds: memberships.map((m) => m.teamId),
    leadTeamIds: memberships.filter((m) => m.role === "lead").map((m) => m.teamId),
  };
}

/**
 * The people directory. Guests are outsiders (freelancers, partners), so they only
 * see who shares a team with them, and only those shared teams.
 */
export async function listMembers(actor: Actor): Promise<MemberSummary[]> {
  const all = await loadMembers();
  if (actor.role !== "guest") return all;
  return all
    .map((member) => ({ ...member, teams: member.teams.filter((team) => actor.teamIds.includes(team.id)) }))
    .filter((member) => member.id === actor.id || member.teams.length > 0);
}

async function loadMembers(): Promise<MemberSummary[]> {
  const db = await getDb();
  const [rows, memberships] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db
      .select({ userId: teamMembers.userId, role: teamMembers.role, id: teams.id, name: teams.name })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .orderBy(asc(teams.name)),
  ]);
  return rows.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    pendingInvite: user.passwordHash === null,
    slackLinked: user.slackUserId !== null,
    teams: memberships.filter((m) => m.userId === user.id).map((m) => ({ id: m.id, name: m.name, role: m.role })),
  }));
}

/** People a task can be assigned to: every active account that has finished signing up. */
export async function listAssignableUsers(): Promise<UserRef[]> {
  const db = await getDb();
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.passwordHash)))
    .orderBy(asc(users.name));
}

export async function findActiveUserByEmail(email: string) {
  const db = await getDb();
  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.email, email.trim().toLowerCase()), eq(users.isActive, true)));
  return user ?? null;
}

async function issueInvite(userId: string) {
  const db = await getDb();
  const token = randomToken();
  await db
    .update(users)
    .set({ inviteTokenHash: sha256(token), inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS) })
    .where(eq(users.id, userId));
  return token;
}

/** Creates an account without a password and returns the one-time invite token. */
export async function inviteMember(actor: Actor, input: { name: string; email: string; role: string }) {
  if (!canManageMembers(actor)) throw forbidden();
  const data = parse(z.object({ name: nameSchema, email: emailSchema, role: z.enum(ROLES) }), input);
  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  if (existing) throw conflict("Já existe uma pessoa com esse e-mail.");
  const [user] = await db
    .insert(users)
    .values({ name: data.name, email: data.email, role: data.role })
    .returning({ id: users.id });
  return { userId: user.id, token: await issueInvite(user.id) };
}

export async function renewInvite(actor: Actor, userId: string) {
  if (!canManageMembers(actor)) throw forbidden();
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw notFound("Pessoa não encontrada.");
  if (user.passwordHash) throw conflict("Essa pessoa já ativou a conta.");
  return issueInvite(userId);
}

export async function findInvite(token: string) {
  const db = await getDb();
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(eq(users.inviteTokenHash, sha256(token)), gt(users.inviteExpiresAt, new Date()), eq(users.isActive, true)),
    );
  return user ?? null;
}

export async function acceptInvite(token: string, password: string) {
  const invite = await findInvite(token);
  if (!invite) throw notFound("Este convite é inválido ou expirou. Peça um novo a quem administra o BARCA PM.");
  const db = await getDb();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parse(passwordSchema, password)), inviteTokenHash: null, inviteExpiresAt: null })
    .where(eq(users.id, invite.id));
  return invite.id;
}

export async function updateMemberRole(actor: Actor, userId: string, role: string) {
  if (!canManageMembers(actor)) throw forbidden();
  const nextRole: Role = parse(z.enum(ROLES), role);
  if (nextRole !== "admin") await assertNotLastAdmin(userId);
  const db = await getDb();
  await db.update(users).set({ role: nextRole }).where(eq(users.id, userId));
}

export async function setMemberActive(actor: Actor, userId: string, isActive: boolean) {
  if (!canManageMembers(actor)) throw forbidden();
  if (!isActive) {
    if (userId === actor.id) throw invalid("Você não pode desativar a própria conta.");
    await assertNotLastAdmin(userId);
  }
  const db = await getDb();
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
  if (!isActive) await db.delete(sessions).where(eq(sessions.userId, userId));
}

async function assertNotLastAdmin(userId: string) {
  const db = await getDb();
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (target?.role !== "admin") return;
  const [others] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, userId)));
  if (others.value === 0) throw invalid("É preciso manter pelo menos um administrador ativo.");
}

export async function getProfile(actor: Actor) {
  const db = await getDb();
  const [user] = await db
    .select({ name: users.name, email: users.email, notifySlack: users.notifySlack, slackUserId: users.slackUserId })
    .from(users)
    .where(eq(users.id, actor.id));
  return user;
}

export async function updateProfile(actor: Actor, input: { name: string; notifySlack: boolean }) {
  const data = parse(z.object({ name: nameSchema, notifySlack: z.boolean() }), input);
  const db = await getDb();
  await db.update(users).set(data).where(eq(users.id, actor.id));
}

export async function changePassword(actor: Actor, currentPassword: string, newPassword: string) {
  const db = await getDb();
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
  if (!(await verifyPassword(currentPassword, user?.passwordHash ?? null))) throw invalid("A senha atual não confere.");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parse(passwordSchema, newPassword)) })
    .where(eq(users.id, actor.id));
}
