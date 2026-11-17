// Shared between server and client. Keep this file free of server-only imports.

export const ROLES = ["admin", "manager", "member", "guest"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  manager: "Gestor",
  member: "Membro",
  guest: "Convidado",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Acesso total: pessoas, papéis, times, integrações e todos os projetos.",
  manager: "Vê todos os projetos, cria times e projetos e acompanha os indicadores do negócio.",
  member: "Cria e edita tarefas nos projetos abertos e nos projetos dos seus times.",
  guest: "Só lê e comenta, e apenas nos projetos dos times em que foi incluído.",
};

export const TEAM_ROLES = ["lead", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  lead: "Líder",
  member: "Integrante",
};

export const STATUS_CATEGORIES = ["todo", "in_progress", "done"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  done: "Concluído",
};

export const STATUS_CATEGORY_COLORS: Record<StatusCategory, string> = {
  todo: "#94a3b8",
  in_progress: "#3b8ff6",
  done: "#22a06b",
};

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem prioridade",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2570eb",
  none: "#94a3b8",
};

export const PROJECT_VISIBILITIES = ["workspace", "team"] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<ProjectVisibility, string> = {
  workspace: "Aberto para a empresa",
  team: "Restrito ao time",
};

export const TASK_SOURCES = ["web", "slack", "mcp", "shopify", "guru"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const TASK_SOURCE_LABELS: Record<TaskSource, string> = {
  web: "BARCA PM",
  slack: "Slack",
  mcp: "Assistente de IA (MCP)",
  shopify: "Shopify",
  guru: "Guru",
};

export const TOKEN_SCOPES = ["read", "write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const TOKEN_SCOPE_LABELS: Record<TokenScope, string> = {
  read: "Somente leitura",
  write: "Leitura e escrita",
};

export const INTEGRATION_SOURCES = ["shopify", "guru"] as const;
export type IntegrationSource = (typeof INTEGRATION_SOURCES)[number];

export const COLOR_PALETTE = [
  "#2570eb",
  "#0d9488",
  "#22a06b",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#9333ea",
  "#64748b",
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
