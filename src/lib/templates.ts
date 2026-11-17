import type { StatusCategory } from "./constants";

// Project templates per discipline. Every status belongs to one of three categories
// (todo / in_progress / done), which is what dashboards and reports aggregate on.
// That lets each team name its workflow freely while progress stays comparable.

export const DISCIPLINES = [
  "tech",
  "marketing",
  "editorial",
  "social",
  "youtube",
  "content",
  "general",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export interface ProjectTemplate {
  label: string;
  description: string;
  color: string;
  statuses: { name: string; category: StatusCategory }[];
  labels: { name: string; color: string }[];
}

export const TEMPLATES: Record<Discipline, ProjectTemplate> = {
  tech: {
    label: "Tecnologia",
    description: "Desenvolvimento de produto com revisão de código e QA.",
    color: "#2570eb",
    statuses: [
      { name: "Backlog", category: "todo" },
      { name: "A fazer", category: "todo" },
      { name: "Em desenvolvimento", category: "in_progress" },
      { name: "Code review", category: "in_progress" },
      { name: "QA", category: "in_progress" },
      { name: "Concluído", category: "done" },
    ],
    labels: [
      { name: "Bug", color: "#dc2626" },
      { name: "Funcionalidade", color: "#2570eb" },
      { name: "Melhoria", color: "#0d9488" },
      { name: "Débito técnico", color: "#64748b" },
    ],
  },
  marketing: {
    label: "Marketing",
    description: "Campanhas do planejamento à veiculação.",
    color: "#db2777",
    statuses: [
      { name: "Ideias", category: "todo" },
      { name: "Planejamento", category: "todo" },
      { name: "Em produção", category: "in_progress" },
      { name: "Aprovação", category: "in_progress" },
      { name: "No ar", category: "in_progress" },
      { name: "Concluído", category: "done" },
    ],
    labels: [
      { name: "Campanha", color: "#db2777" },
      { name: "E-mail", color: "#2570eb" },
      { name: "Tráfego pago", color: "#ea580c" },
      { name: "Landing page", color: "#0d9488" },
      { name: "Promoção", color: "#ca8a04" },
    ],
  },
  editorial: {
    label: "Editorial",
    description: "Da pauta à publicação, com revisão.",
    color: "#9333ea",
    statuses: [
      { name: "Pauta", category: "todo" },
      { name: "Redação", category: "in_progress" },
      { name: "Revisão", category: "in_progress" },
      { name: "Aprovado", category: "in_progress" },
      { name: "Publicado", category: "done" },
    ],
    labels: [
      { name: "Artigo", color: "#9333ea" },
      { name: "Newsletter", color: "#2570eb" },
      { name: "E-book", color: "#0d9488" },
      { name: "Entrevista", color: "#ca8a04" },
    ],
  },
  social: {
    label: "Social media",
    description: "Calendário de posts com design, aprovação e agendamento.",
    color: "#ea580c",
    statuses: [
      { name: "Ideias", category: "todo" },
      { name: "Copy", category: "in_progress" },
      { name: "Design", category: "in_progress" },
      { name: "Aprovação", category: "in_progress" },
      { name: "Agendado", category: "in_progress" },
      { name: "Publicado", category: "done" },
    ],
    labels: [
      { name: "Instagram", color: "#db2777" },
      { name: "TikTok", color: "#0f172a" },
      { name: "LinkedIn", color: "#2570eb" },
      { name: "X", color: "#64748b" },
      { name: "Reels", color: "#9333ea" },
      { name: "Stories", color: "#ea580c" },
    ],
  },
  youtube: {
    label: "YouTube",
    description: "Produção de vídeo do roteiro à publicação.",
    color: "#dc2626",
    statuses: [
      { name: "Ideias", category: "todo" },
      { name: "Roteiro", category: "in_progress" },
      { name: "Gravação", category: "in_progress" },
      { name: "Edição", category: "in_progress" },
      { name: "Thumbnail e SEO", category: "in_progress" },
      { name: "Agendado", category: "in_progress" },
      { name: "Publicado", category: "done" },
    ],
    labels: [
      { name: "Vídeo longo", color: "#dc2626" },
      { name: "Shorts", color: "#ea580c" },
      { name: "Live", color: "#9333ea" },
      { name: "Patrocinado", color: "#ca8a04" },
    ],
  },
  content: {
    label: "Criação de conteúdo",
    description: "Peças de conteúdo do briefing à entrega.",
    color: "#0d9488",
    statuses: [
      { name: "Briefing", category: "todo" },
      { name: "Produção", category: "in_progress" },
      { name: "Revisão", category: "in_progress" },
      { name: "Aprovado", category: "in_progress" },
      { name: "Entregue", category: "done" },
    ],
    labels: [
      { name: "Vídeo", color: "#dc2626" },
      { name: "Design", color: "#db2777" },
      { name: "Texto", color: "#2570eb" },
      { name: "Áudio", color: "#9333ea" },
    ],
  },
  general: {
    label: "Geral",
    description: "Fluxo simples para qualquer tipo de trabalho.",
    color: "#64748b",
    statuses: [
      { name: "A fazer", category: "todo" },
      { name: "Em andamento", category: "in_progress" },
      { name: "Concluído", category: "done" },
    ],
    labels: [],
  },
};

export function isDiscipline(value: string): value is Discipline {
  return (DISCIPLINES as readonly string[]).includes(value);
}
