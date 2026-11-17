import type { Role, TeamRole } from "@/lib/constants";
import type { Actor } from "@/lib/permissions";
import { createPgliteDb, getDb, setDb } from "@/server/db/client";
import { teamMembers, users } from "@/server/db/schema";
import { createProject } from "@/server/services/projects";
import { createTeam } from "@/server/services/teams";
import { loadActor } from "@/server/services/users";

/** Fresh in-memory Postgres (PGlite) with all migrations applied. */
export async function useTestDb() {
  setDb(await createPgliteDb());
}

export async function createUser(name: string, role: Role, teams: [string, TeamRole][] = []): Promise<Actor> {
  const db = await getDb();
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}@teste.barca`;
  // A placeholder hash is enough: these accounts never log in with a password.
  const [user] = await db.insert(users).values({ name, email, role, passwordHash: "scrypt$1$1$1$AA==$AA==" }).returning();
  if (teams.length > 0) {
    await db.insert(teamMembers).values(teams.map(([teamId, teamRole]) => ({ teamId, userId: user.id, role: teamRole })));
  }
  return (await loadActor(user.id))!;
}

/** An admin, a TECH team with one open project, and a member of that team. */
export async function createWorkspace() {
  const admin = await createUser("Ana Admin", "admin");
  const teamId = await createTeam(admin, { name: "Tecnologia", discipline: "tech" });
  const project = await createProject(admin, {
    name: "Plataforma",
    key: "TECH",
    teamId,
    discipline: "tech",
    visibility: "workspace",
  });
  const member = await createUser("Bia Membro", "member", [[teamId, "member"]]);
  return { admin, member, teamId, project };
}
