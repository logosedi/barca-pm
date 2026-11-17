import type { ProjectVisibility, Role } from "./constants";

// Single source of truth for authorization. Pure functions, so the same rules run in
// the service layer (enforcement) and in the UI (hiding what the user cannot do).
// The matrix is documented in docs/PERMISSIONS.md and covered by tests/permissions.test.ts.

export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Teams the user belongs to (any team role). */
  teamIds: string[];
  /** Teams the user leads. */
  leadTeamIds: string[];
}

export interface ProjectAccess {
  teamId: string;
  visibility: ProjectVisibility;
}

const seesEverything = (actor: Actor) => actor.role === "admin" || actor.role === "manager";

export function canViewProject(actor: Actor, project: ProjectAccess) {
  if (seesEverything(actor)) return true;
  if (actor.teamIds.includes(project.teamId)) return true;
  return actor.role === "member" && project.visibility === "workspace";
}

export function canComment(actor: Actor, project: ProjectAccess) {
  return canViewProject(actor, project);
}

export function canEditTasks(actor: Actor, project: ProjectAccess) {
  return actor.role !== "guest" && canViewProject(actor, project);
}

export function canManageProject(actor: Actor, project: ProjectAccess) {
  return seesEverything(actor) || canLeadTeam(actor, project.teamId);
}

export function canCreateProject(actor: Actor, teamId: string) {
  return seesEverything(actor) || canLeadTeam(actor, teamId);
}

export function canCreateTeam(actor: Actor) {
  return seesEverything(actor);
}

export function canManageTeam(actor: Actor, teamId: string) {
  return seesEverything(actor) || canLeadTeam(actor, teamId);
}

export function canManageMembers(actor: Actor) {
  return actor.role === "admin";
}

export function canManageIntegrations(actor: Actor) {
  return actor.role === "admin";
}

export function canViewBusinessMetrics(actor: Actor) {
  return seesEverything(actor);
}

function canLeadTeam(actor: Actor, teamId: string) {
  return actor.role !== "guest" && actor.leadTeamIds.includes(teamId);
}
