import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/constants";
import {
  canComment,
  canCreateProject,
  canCreateTeam,
  canEditTasks,
  canManageIntegrations,
  canManageMembers,
  canManageProject,
  canManageTeam,
  canViewBusinessMetrics,
  canViewProject,
  type Actor,
} from "@/lib/permissions";

const actor = (role: Role, teamIds: string[] = [], leadTeamIds: string[] = []): Actor => ({
  id: role,
  name: role,
  email: `${role}@teste.barca`,
  role,
  teamIds,
  leadTeamIds,
});

const open = { teamId: "tech", visibility: "workspace" } as const;
const restricted = { teamId: "tech", visibility: "team" } as const;

describe("visibilidade de projetos", () => {
  it("administrador e gestor veem tudo, inclusive projetos restritos de outros times", () => {
    for (const role of ["admin", "manager"] as const) {
      expect(canViewProject(actor(role), open)).toBe(true);
      expect(canViewProject(actor(role), restricted)).toBe(true);
    }
  });

  it("membro vê projetos abertos e os restritos apenas dos seus times", () => {
    expect(canViewProject(actor("member"), open)).toBe(true);
    expect(canViewProject(actor("member"), restricted)).toBe(false);
    expect(canViewProject(actor("member", ["tech"]), restricted)).toBe(true);
  });

  it("convidado só vê projetos dos times em que foi incluído, mesmo os abertos", () => {
    expect(canViewProject(actor("guest"), open)).toBe(false);
    expect(canViewProject(actor("guest", ["tech"]), open)).toBe(true);
    expect(canViewProject(actor("guest", ["tech"]), restricted)).toBe(true);
  });
});

describe("tarefas e comentários", () => {
  it("convidado comenta mas não edita tarefas", () => {
    const guest = actor("guest", ["tech"]);
    expect(canComment(guest, open)).toBe(true);
    expect(canEditTasks(guest, open)).toBe(false);
  });

  it("membro edita tarefas onde enxerga o projeto", () => {
    expect(canEditTasks(actor("member"), open)).toBe(true);
    expect(canEditTasks(actor("member"), restricted)).toBe(false);
  });
});

describe("gestão", () => {
  it("líder do time gerencia o time e os projetos dele, e só dele", () => {
    const lead = actor("member", ["tech"], ["tech"]);
    expect(canManageTeam(lead, "tech")).toBe(true);
    expect(canManageProject(lead, open)).toBe(true);
    expect(canCreateProject(lead, "tech")).toBe(true);
    expect(canManageTeam(lead, "marketing")).toBe(false);
    expect(canCreateProject(lead, "marketing")).toBe(false);
  });

  it("membro comum não gerencia projeto nem cria time", () => {
    const member = actor("member", ["tech"]);
    expect(canManageProject(member, open)).toBe(false);
    expect(canCreateTeam(member)).toBe(false);
  });

  it("convidado nunca gerencia, mesmo marcado como líder", () => {
    const guest = actor("guest", ["tech"], ["tech"]);
    expect(canManageTeam(guest, "tech")).toBe(false);
    expect(canManageProject(guest, open)).toBe(false);
  });

  it("só administrador gerencia pessoas e integrações", () => {
    expect(canManageMembers(actor("admin"))).toBe(true);
    expect(canManageIntegrations(actor("admin"))).toBe(true);
    for (const role of ["manager", "member", "guest"] as const) {
      expect(canManageMembers(actor(role))).toBe(false);
      expect(canManageIntegrations(actor(role))).toBe(false);
    }
  });

  it("indicadores do negócio ficam com administrador e gestor", () => {
    expect(canViewBusinessMetrics(actor("manager"))).toBe(true);
    expect(canViewBusinessMetrics(actor("member"))).toBe(false);
    expect(canCreateTeam(actor("manager"))).toBe(true);
  });
});
