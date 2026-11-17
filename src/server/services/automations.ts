import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { INTEGRATION_SOURCES, PRIORITIES, type IntegrationSource } from "@/lib/constants";
import { renderTemplate, TOPICS } from "@/lib/integration-topics";
import { canManageIntegrations, canViewBusinessMetrics, type Actor } from "@/lib/permissions";
import type { AutomationRuleInfo, IntegrationEventInfo } from "@/lib/types";
import { todayISO } from "@/lib/utils";
import { getDb } from "../db/client";
import { automationRules, businessEventsDaily, integrationEvents, projects, users, type ExternalRef } from "../db/schema";
import { forbidden, invalid, notFound } from "../errors";
import { createSystemTask } from "./tasks";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid(result.error.issues[0].message);
  return result.data;
}

/** A webhook after the Shopify/Guru adapter normalised it. */
export interface IncomingEvent {
  source: IntegrationSource;
  topic: string;
  /** Delivery id from the provider, used to drop retries of the same webhook. */
  externalId: string;
  summary: string;
  payload: unknown;
  /** Monetary value of the event, when it has one. */
  amount?: number;
  /** Values available to rule templates as {{name}}. */
  variables: Record<string, string>;
  externalRef?: ExternalRef;
}

export type EventOutcome = { status: "duplicate" } | { status: "processed" | "ignored" | "failed"; tasks: string[] };

/**
 * Entry point for every business webhook: stores the event (once), updates the daily
 * counters behind the dashboard and runs the automation rules that match it.
 */
export async function processIntegrationEvent(event: IncomingEvent): Promise<EventOutcome> {
  const db = await getDb();
  const [stored] = await db
    .insert(integrationEvents)
    .values({
      source: event.source,
      topic: event.topic,
      externalId: event.externalId,
      summary: event.summary.slice(0, 300),
      payload: event.payload,
    })
    .onConflictDoNothing({ target: [integrationEvents.source, integrationEvents.externalId] })
    .returning({ id: integrationEvents.id });
  if (!stored) return { status: "duplicate" };

  await db
    .insert(businessEventsDaily)
    .values({ day: todayISO(), source: event.source, topic: event.topic, count: 1, amount: event.amount ?? 0 })
    .onConflictDoUpdate({
      target: [businessEventsDaily.day, businessEventsDaily.source, businessEventsDaily.topic],
      set: {
        count: sql`${businessEventsDaily.count} + 1`,
        amount: sql`${businessEventsDaily.amount} + ${event.amount ?? 0}`,
      },
    });

  const rules = await db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.source, event.source),
        eq(automationRules.topic, event.topic),
        eq(automationRules.enabled, true),
      ),
    );

  const created: string[] = [];
  const failures: string[] = [];
  for (const rule of rules) {
    try {
      const task = await createSystemTask(rule.projectId, {
        title: renderTemplate(rule.titleTemplate, event.variables) || rule.name,
        description: renderTemplate(rule.descriptionTemplate, event.variables),
        priority: rule.priority,
        assigneeId: rule.assigneeId,
        source: event.source,
        externalRef: event.externalRef,
      });
      created.push(task.ref);
    } catch (error) {
      failures.push(`Regra "${rule.name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const status = failures.length > 0 ? "failed" : created.length > 0 ? "processed" : "ignored";
  const detail =
    failures.join(" | ") ||
    (created.length > 0 ? `Tarefas criadas: ${created.join(", ")}` : "Nenhuma regra ativa para este evento.");
  await db.update(integrationEvents).set({ status, detail }).where(eq(integrationEvents.id, stored.id));
  return { status, tasks: created };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const ruleSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à regra.").max(80, "O nome é longo demais."),
  source: z.enum(INTEGRATION_SOURCES),
  topic: z.string().trim().min(1, "Escolha o evento.").max(100),
  projectId: z.uuid("Escolha o projeto."),
  titleTemplate: z.string().trim().min(1, "Informe o título da tarefa.").max(200, "O título é longo demais."),
  descriptionTemplate: z.string().max(5000, "A descrição é longa demais.").default(""),
  priority: z.enum(PRIORITIES).default("medium"),
  assigneeId: z.uuid().nullable().default(null),
});
export type RuleInput = z.input<typeof ruleSchema>;

export async function listRules(actor: Actor): Promise<AutomationRuleInfo[]> {
  if (!canManageIntegrations(actor)) throw forbidden();
  const db = await getDb();
  const assignee = alias(users, "assignee");
  const rows = await db
    .select({ rule: automationRules, project: projects, assigneeName: assignee.name })
    .from(automationRules)
    .innerJoin(projects, eq(automationRules.projectId, projects.id))
    .leftJoin(assignee, eq(automationRules.assigneeId, assignee.id))
    .orderBy(asc(automationRules.source), asc(automationRules.name));
  return rows.map(({ rule, project, assigneeName }) => ({
    id: rule.id,
    name: rule.name,
    source: rule.source,
    topic: rule.topic,
    project: { id: project.id, key: project.key, name: project.name },
    titleTemplate: rule.titleTemplate,
    descriptionTemplate: rule.descriptionTemplate,
    priority: rule.priority,
    assignee: rule.assigneeId && assigneeName ? { id: rule.assigneeId, name: assigneeName } : null,
    enabled: rule.enabled,
  }));
}

export async function createRule(actor: Actor, input: RuleInput) {
  if (!canManageIntegrations(actor)) throw forbidden();
  const data = parse(ruleSchema, input);
  const db = await getDb();
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, data.projectId));
  if (!project) throw notFound("Projeto não encontrado.");
  await db.insert(automationRules).values(data);
}

export async function setRuleEnabled(actor: Actor, ruleId: string, enabled: boolean) {
  if (!canManageIntegrations(actor)) throw forbidden();
  const db = await getDb();
  await db.update(automationRules).set({ enabled }).where(eq(automationRules.id, ruleId));
}

export async function deleteRule(actor: Actor, ruleId: string) {
  if (!canManageIntegrations(actor)) throw forbidden();
  const db = await getDb();
  await db.delete(automationRules).where(eq(automationRules.id, ruleId));
}

export async function listRecentEvents(actor: Actor, limit = 30): Promise<IntegrationEventInfo[]> {
  if (!canManageIntegrations(actor)) throw forbidden();
  const db = await getDb();
  const rows = await db
    .select({
      id: integrationEvents.id,
      source: integrationEvents.source,
      topic: integrationEvents.topic,
      summary: integrationEvents.summary,
      status: integrationEvents.status,
      detail: integrationEvents.detail,
      createdAt: integrationEvents.createdAt,
    })
    .from(integrationEvents)
    .orderBy(desc(integrationEvents.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** Catalogued topics plus any other topic that has actually arrived, per source. */
export async function listKnownTopics(): Promise<Record<IntegrationSource, string[]>> {
  const db = await getDb();
  const seen = await db
    .selectDistinct({ source: integrationEvents.source, topic: integrationEvents.topic })
    .from(integrationEvents);
  const result = { shopify: [] as string[], guru: [] as string[] };
  for (const source of INTEGRATION_SOURCES) {
    const topics = new Set(TOPICS[source].map((item) => item.topic));
    for (const row of seen) if (row.source === source) topics.add(row.topic);
    result[source] = [...topics];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Business indicators
// ---------------------------------------------------------------------------

export interface BusinessMetrics {
  from: string;
  to: string;
  totals: { source: IntegrationSource; topic: string; count: number; amount: number }[];
  daily: { day: string; source: IntegrationSource; topic: string; count: number; amount: number }[];
}

/** Events received from Shopify and Guru between two days (inclusive), per day and in total. */
export async function getBusinessMetrics(actor: Actor, from: string, to: string): Promise<BusinessMetrics> {
  if (!canViewBusinessMetrics(actor)) throw forbidden("Os indicadores do negócio são restritos a gestores e administradores.");
  const db = await getDb();
  const daily = await db
    .select()
    .from(businessEventsDaily)
    .where(and(gte(businessEventsDaily.day, from), lte(businessEventsDaily.day, to)))
    .orderBy(asc(businessEventsDaily.day));
  const totals = new Map<string, BusinessMetrics["totals"][number]>();
  for (const row of daily) {
    const key = `${row.source}:${row.topic}`;
    const total = totals.get(key) ?? { source: row.source, topic: row.topic, count: 0, amount: 0 };
    total.count += row.count;
    total.amount += row.amount;
    totals.set(key, total);
  }
  return { from, to, totals: [...totals.values()], daily };
}
