import { eq } from "drizzle-orm";
import type { Priority, Role, TeamRole } from "@/lib/constants";
import { TEMPLATES, type Discipline } from "@/lib/templates";
import { addDaysISO, todayISO } from "@/lib/utils";
import { hashPassword } from "../auth/crypto";
import { getDb } from "../db/client";
import {
  activity,
  automationRules,
  businessEventsDaily,
  comments,
  labels,
  projectStatuses,
  projects,
  taskLabels,
  tasks,
  teamMembers,
  teams,
  users,
} from "../db/schema";

// Optional sample workspace offered on the first-run screen. It exists to make the
// product evaluable in minutes (boards with history, a dashboard with trends, people
// in every role). Rows are inserted directly, not through the services, because the
// history has to be backdated.

export const DEMO_PASSWORD = "barca-demo-2026";

const PEOPLE: { key: string; name: string; role: Role }[] = [
  { key: "marina", name: "Marina Costa", role: "manager" },
  { key: "rafael", name: "Rafael Lima", role: "member" },
  { key: "bruno", name: "Bruno Alves", role: "member" },
  { key: "camila", name: "Camila Souza", role: "member" },
  { key: "juliana", name: "Juliana Rocha", role: "member" },
  { key: "larissa", name: "Larissa Melo", role: "member" },
  { key: "pedro", name: "Pedro Nunes", role: "member" },
  { key: "diego", name: "Diego Freitas", role: "guest" },
];

interface DemoTask {
  title: string;
  /** Name of one of the labels of the project's template. */
  label?: string;
  /** Index into the project's statuses. */
  status: number;
  priority?: Priority;
  /** Due date in days from today (negative = past). */
  due?: number;
  subtasks?: string[];
  description?: string;
  comment?: string;
}

interface DemoProject {
  key: string;
  name: string;
  description: string;
  team: string;
  discipline: Discipline;
  visibility?: "team";
  members: [string, TeamRole][];
  tasks: DemoTask[];
}

const LAUNCH_BRIEF = `## Objetivo

Lançar o **plano anual** com 20% de desconto para a base ativa.

## Entregas

- [x] Definir oferta e preço com o financeiro
- [x] Criar o plano na Guru e o produto na Shopify
- [ ] Landing page aprovada
- [ ] Sequência de 3 e-mails
- [ ] Peças para Instagram e YouTube

## Metas

| Indicador | Meta |
| --- | --- |
| Novas assinaturas anuais | 400 |
| Migração de mensal para anual | 8% da base |

> Qualquer mudança de preço precisa passar pela Marina antes de ir ao ar.`;

const PROJECTS: DemoProject[] = [
  {
    key: "TECH",
    name: "Plataforma de assinaturas",
    description: "Área do assinante, checkout e integrações com Shopify e Guru.",
    team: "Tecnologia",
    discipline: "tech",
    members: [["rafael", "lead"], ["bruno", "member"]],
    tasks: [
      { title: "Corrigir falha no login com link mágico", label: "Bug", status: 5, priority: "urgent", due: -12 },
      { title: "Página de gerenciamento da assinatura", label: "Funcionalidade", status: 5, priority: "high", due: -6, subtasks: ["Trocar forma de pagamento", "Pausar assinatura", "Cancelar com pesquisa de motivo"] },
      { title: "Sincronizar status da assinatura da Guru com a área do assinante", label: "Funcionalidade", status: 4, priority: "high", due: 2, comment: "O webhook de `pastdue` chega antes da nova tentativa de cobrança. Precisamos esperar 24h antes de bloquear o acesso." },
      { title: "Checkout: aplicar cupom do plano anual", label: "Funcionalidade", status: 3, priority: "high", due: 1 },
      { title: "Migrar envio de e-mails transacionais", label: "Débito técnico", status: 2, priority: "medium", due: 6, subtasks: ["Mapear templates atuais", "Configurar domínio de envio", "Testar entregabilidade"] },
      { title: "Lentidão na listagem de pedidos", label: "Bug", status: 2, priority: "medium", due: -2 },
      { title: "Relatório de churn por plano", label: "Funcionalidade", status: 1, priority: "medium", due: 12 },
      { title: "Atualizar dependências do app mobile", label: "Débito técnico", status: 1, priority: "low", due: 20 },
      { title: "Login com Google", label: "Funcionalidade", status: 0, priority: "low" },
      { title: "Modo escuro na área do assinante", label: "Melhoria", status: 0, priority: "none" },
    ],
  },
  {
    key: "MKT",
    name: "Campanhas 2026",
    description: "Campanhas de aquisição e retenção de assinantes.",
    team: "Marketing",
    discipline: "marketing",
    members: [["camila", "lead"], ["larissa", "member"]],
    tasks: [
      { title: "Lançamento do plano anual", label: "Campanha", status: 2, priority: "urgent", due: 5, description: LAUNCH_BRIEF, subtasks: ["Landing page", "Sequência de e-mails", "Criativos de mídia paga"], comment: "Landing page está com o design. Entrega prevista para quinta." },
      { title: "Campanha de reativação de ex-assinantes", label: "Campanha", status: 3, priority: "high", due: 3 },
      { title: "E-mail de boas-vindas para novos assinantes", label: "E-mail", status: 5, priority: "medium", due: -15 },
      { title: "Teste A/B de preço na página de planos", label: "Landing page", status: 4, priority: "high", due: -1 },
      { title: "Black Friday: definir oferta", label: "Promoção", status: 1, priority: "high", due: 9 },
      { title: "Parceria com influenciadores do nicho", label: "Campanha", status: 0, priority: "medium" },
      { title: "Relatório mensal de CAC e LTV", label: "Tráfego pago", status: 5, priority: "medium", due: -4 },
      { title: "Fluxo de recuperação de carrinho abandonado", label: "E-mail", status: 2, priority: "medium", due: 8 },
    ],
  },
  {
    key: "EDI",
    name: "Blog e newsletter",
    description: "Artigos, newsletter semanal e materiais ricos.",
    team: "Editorial",
    discipline: "editorial",
    members: [["juliana", "lead"], ["diego", "member"]],
    tasks: [
      { title: "Newsletter #48: bastidores do plano anual", label: "Newsletter", status: 2, priority: "high", due: 2 },
      { title: "Artigo: como aproveitar melhor a assinatura", label: "Artigo", status: 1, priority: "medium", due: 4 },
      { title: "Entrevista com assinante destaque do mês", label: "Entrevista", status: 0, priority: "medium", due: 10 },
      { title: "E-book: guia do iniciante", label: "E-book", status: 1, priority: "low", due: 18, subtasks: ["Roteiro dos capítulos", "Redação", "Diagramação"] },
      { title: "Newsletter #47", label: "Newsletter", status: 4, priority: "high", due: -5 },
      { title: "Artigo: novidades de novembro", label: "Artigo", status: 4, priority: "medium", due: -9 },
      { title: "Revisar guia de estilo editorial", status: 3, priority: "low", due: -3 },
    ],
  },
  {
    key: "SOC",
    name: "Calendário social",
    description: "Posts do Instagram, TikTok e LinkedIn.",
    team: "Social Media",
    discipline: "social",
    members: [["larissa", "lead"], ["camila", "member"]],
    tasks: [
      { title: "Reels: 3 motivos para assinar o plano anual", label: "Reels", status: 2, priority: "high", due: 3 },
      { title: "Carrossel: depoimentos de assinantes", label: "Instagram", status: 3, priority: "medium", due: 1 },
      { title: "Stories: contagem regressiva do lançamento", label: "Stories", status: 4, priority: "high", due: 4 },
      { title: "Post LinkedIn: vaga de pessoa desenvolvedora", label: "LinkedIn", status: 5, priority: "low", due: -7 },
      { title: "TikTok: bastidores da gravação", label: "TikTok", status: 1, priority: "medium", due: 6 },
      { title: "Responder comentários do post de lançamento", label: "Instagram", status: 0, priority: "medium", due: 5 },
      { title: "Reels: tutorial rápido da área do assinante", label: "Reels", status: 5, priority: "medium", due: -11 },
    ],
  },
  {
    key: "YT",
    name: "Canal do YouTube",
    description: "Vídeos longos, Shorts e lives.",
    team: "YouTube",
    discipline: "youtube",
    members: [["pedro", "lead"], ["diego", "member"]],
    tasks: [
      { title: "Vídeo: tour completo pela plataforma", label: "Vídeo longo", status: 3, priority: "high", due: 4, subtasks: ["Roteiro aprovado", "Gravação", "Edição", "Thumbnail"] },
      { title: "Live de lançamento do plano anual", label: "Live", status: 1, priority: "urgent", due: 7 },
      { title: "Shorts: dica da semana #12", label: "Shorts", status: 5, priority: "medium", due: 2 },
      { title: "Vídeo: perguntas dos assinantes", label: "Vídeo longo", status: 2, priority: "medium", due: 9 },
      { title: "Atualizar descrição e cards dos vídeos antigos", status: 0, priority: "low" },
      { title: "Shorts: dica da semana #11", label: "Shorts", status: 6, priority: "medium", due: -6 },
      { title: "Vídeo: retrospectiva do trimestre", label: "Vídeo longo", status: 6, priority: "medium", due: -14 },
    ],
  },
  {
    key: "CRI",
    name: "Estúdio de conteúdo",
    description: "Produção de peças para os outros times. Restrito ao time.",
    team: "Criação de Conteúdo",
    discipline: "content",
    visibility: "team",
    members: [["pedro", "lead"], ["diego", "member"], ["juliana", "member"]],
    tasks: [
      { title: "Identidade visual do plano anual", label: "Design", status: 3, priority: "high", due: -1 },
      { title: "Fotos de produto para a loja", label: "Design", status: 1, priority: "medium", due: 5 },
      { title: "Vinheta de abertura dos vídeos", label: "Vídeo", status: 2, priority: "low", due: 11 },
      { title: "Banco de trilhas sonoras licenciadas", label: "Áudio", status: 0, priority: "low" },
      { title: "Kit de templates para Stories", label: "Design", status: 4, priority: "medium", due: -8 },
    ],
  },
];

/** Small deterministic generator so every demo workspace looks the same. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

export async function seedDemoData(adminId: string) {
  const db = await getDb();
  const random = createRandom(2026);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const now = Date.now();
  const today = todayISO();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await db.transaction(async (tx) => {
    const people = await tx
      .insert(users)
      .values(PEOPLE.map((person) => ({ name: person.name, email: `${person.key}@demo.barca`, role: person.role, passwordHash })))
      .returning({ id: users.id, email: users.email });
    const userId = (key: string) => people.find((person) => person.email === `${key}@demo.barca`)!.id;

    for (const demo of PROJECTS) {
      const template = TEMPLATES[demo.discipline];
      let [team] = await tx.select().from(teams).where(eq(teams.name, demo.team));
      if (!team) {
        [team] = await tx
          .insert(teams)
          .values({ name: demo.team, discipline: demo.discipline, color: template.color, description: template.description })
          .returning();
      }
      await tx
        .insert(teamMembers)
        .values(demo.members.map(([key, role]) => ({ teamId: team.id, userId: userId(key), role })))
        .onConflictDoNothing();

      const [project] = await tx
        .insert(projects)
        .values({
          key: demo.key,
          name: demo.name,
          description: demo.description,
          teamId: team.id,
          discipline: demo.discipline,
          visibility: demo.visibility ?? "workspace",
          createdBy: adminId,
        })
        .returning();
      const statuses = await tx
        .insert(projectStatuses)
        .values(template.statuses.map((status, position) => ({ projectId: project.id, ...status, position })))
        .returning();
      const projectLabels = template.labels.length
        ? await tx.insert(labels).values(template.labels.map((label) => ({ projectId: project.id, ...label }))).returning()
        : [];

      const assignees = [...demo.members.map(([key]) => userId(key)), adminId];
      let number = 0;
      const insertTask = async (item: DemoTask, index: number, parentId: string | null, statusIndex: number) => {
        const status = statuses[statusIndex];
        const createdAt = new Date(now - between(6, 50) * DAY_MS);
        const completedAt =
          status.category === "done" ? new Date(Math.min(now - between(0, 20) * DAY_MS, now)) : null;
        const [task] = await tx
          .insert(tasks)
          .values({
            projectId: project.id,
            number: ++number,
            title: item.title,
            description: item.description ?? "",
            statusId: status.id,
            priority: item.priority ?? "none",
            // Leaves a few tasks unassigned, and gives the administrator some work too.
            assigneeId: index % 7 === 6 ? null : assignees[index % assignees.length],
            reporterId: index % 3 === 0 ? adminId : assignees[0],
            parentId,
            dueDate: item.due === undefined ? null : addDaysISO(today, item.due),
            position: (index + 1) * 1000,
            createdAt: completedAt && completedAt < createdAt ? new Date(completedAt.getTime() - 5 * DAY_MS) : createdAt,
            updatedAt: completedAt ?? createdAt,
            completedAt,
          })
          .returning();
        await tx.insert(activity).values({ taskId: task.id, actorId: task.reporterId, type: "created", data: { source: "web" }, createdAt: task.createdAt });
        return task;
      };

      for (const [index, item] of demo.tasks.entries()) {
        const task = await insertTask(item, index, null, item.status);
        const label = projectLabels.find((candidate) => candidate.name === item.label);
        if (item.label && !label) throw new Error(`Etiqueta "${item.label}" não existe no modelo de ${demo.key}.`);
        if (label) await tx.insert(taskLabels).values({ taskId: task.id, labelId: label.id });
        if (item.comment) {
          await tx.insert(comments).values({ taskId: task.id, authorId: assignees[0], body: item.comment, createdAt: new Date(now - DAY_MS) });
        }
        const lastStatus = statuses.length - 1;
        for (const [subIndex, title] of (item.subtasks ?? []).entries()) {
          // Subtasks of a finished task are finished; otherwise the first ones are.
          const done = item.status === lastStatus || subIndex < Math.floor((item.subtasks!.length * item.status) / lastStatus);
          await insertTask({ title, status: 0, priority: "none" }, index + subIndex + 1, task.id, done ? lastStatus : 0);
        }
      }
      await tx.update(projects).set({ taskCounter: number }).where(eq(projects.id, project.id));
    }

    // Thirty days of business events, as if the Shopify and Guru webhooks had been on.
    const events: (typeof businessEventsDaily.$inferInsert)[] = [];
    for (let offset = 29; offset >= 0; offset--) {
      const day = addDaysISO(today, -offset);
      const sales = between(18, 34) + (offset < 7 ? 8 : 0);
      const add = (source: "guru" | "shopify", topic: string, count: number, unit = 0) => {
        if (count > 0) events.push({ day, source, topic, count, amount: Math.round(count * unit * 100) / 100 });
      };
      add("guru", "subscription.started", between(9, 21) + (offset < 7 ? 6 : 0));
      add("guru", "subscription.canceled", between(2, 9));
      add("guru", "subscription.pastdue", between(1, 6));
      add("guru", "transaction.approved", sales, 49.9);
      add("guru", "transaction.refunded", between(0, 2), 49.9);
      add("guru", "transaction.chargeback", random() < 0.15 ? 1 : 0, 49.9);
      add("shopify", "orders/paid", between(5, 14), 129);
      add("shopify", "refunds/create", random() < 0.2 ? 1 : 0, 129);
    }
    await tx.insert(businessEventsDaily).values(events).onConflictDoNothing();

    const [tech] = await tx.select().from(projects).where(eq(projects.key, "TECH"));
    const [marketing] = await tx.select().from(projects).where(eq(projects.key, "MKT"));
    await tx.insert(automationRules).values([
      {
        name: "Chargeback vira tarefa urgente",
        source: "guru",
        topic: "transaction.chargeback",
        projectId: tech.id,
        titleTemplate: "Chargeback: {{customer_name}} ({{product_name}})",
        descriptionTemplate:
          "A Guru registrou um chargeback de **R$ {{amount}}**.\n\n- Cliente: {{customer_name}} ({{customer_email}})\n- Transação: {{reference}}\n\n- [ ] Conferir o histórico do cliente\n- [ ] Enviar evidências à operadora\n- [ ] Bloquear o acesso, se for fraude",
        priority: "urgent",
        assigneeId: userId("rafael"),
      },
      {
        name: "Produto novo na loja pede divulgação",
        source: "shopify",
        topic: "products/create",
        projectId: marketing.id,
        titleTemplate: "Divulgar novo produto: {{product_name}}",
        descriptionTemplate:
          "Um produto foi criado na Shopify.\n\n- [ ] Revisar título, fotos e descrição da página\n- [ ] Post de anúncio nas redes\n- [ ] Incluir na próxima newsletter",
        priority: "medium",
        assigneeId: userId("camila"),
      },
    ]);
  });

  return { accounts: PEOPLE.map((person) => ({ email: `${person.key}@demo.barca`, role: person.role })) };
}
