import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type {
  IntegrationSource,
  Priority,
  ProjectVisibility,
  Role,
  StatusCategory,
  TaskSource,
  TeamRole,
  TokenScope,
} from "@/lib/constants";
import type { Discipline } from "@/lib/templates";

// Enumerations are stored as text and typed in TypeScript (validated with Zod at the
// boundaries). Adding a value is then a code change, not an ALTER TYPE migration.

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").$type<Role>().notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  slackUserId: text("slack_user_id"),
  notifySlack: boolean("notify_slack").notNull().default(true),
  inviteTokenHash: text("invite_token_hash"),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token: a leaked database does not leak usable sessions.
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    scope: text("scope").$type<TokenScope>().notNull().default("read"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

export const teams = pgTable("teams", {
  id: id(),
  name: text("name").notNull().unique(),
  discipline: text("discipline").$type<Discipline>().notNull().default("general"),
  color: text("color").notNull().default("#64748b"),
  description: text("description").notNull().default(""),
  createdAt: createdAt(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<TeamRole>().notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export const projects = pgTable("projects", {
  id: id(),
  // Short uppercase prefix used in task references (TECH-12), like Jira.
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "restrict" }),
  visibility: text("visibility").$type<ProjectVisibility>().notNull().default("workspace"),
  discipline: text("discipline").$type<Discipline>().notNull().default("general"),
  slackChannelId: text("slack_channel_id"),
  taskCounter: integer("task_counter").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const projectStatuses = pgTable(
  "project_statuses",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").$type<StatusCategory>().notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("project_statuses_project_idx").on(t.projectId)],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (t) => [uniqueIndex("labels_project_name_idx").on(t.projectId, t.name)],
);

export interface ExternalRef {
  system: IntegrationSource | "slack";
  label: string;
  url?: string;
}

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    statusId: uuid("status_id")
      .notNull()
      .references(() => projectStatuses.id, { onDelete: "restrict" }),
    priority: text("priority").$type<Priority>().notNull().default("none"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    // One level of subtasks: a task with a parent cannot itself be a parent.
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    dueDate: date("due_date", { mode: "string" }),
    // Fractional ordering inside a status column: moving a card only rewrites that card.
    position: doublePrecision("position").notNull().default(0),
    source: text("source").$type<TaskSource>().notNull().default("web"),
    externalRef: jsonb("external_ref").$type<ExternalRef>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tasks_project_number_idx").on(t.projectId, t.number),
    index("tasks_status_idx").on(t.statusId),
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_parent_idx").on(t.parentId),
  ],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_task_idx").on(t.taskId)],
);

export type ActivityData = Record<string, string | number | null>;

export const activity = pgTable(
  "activity",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    // Null actor = the system (integration or automation rule).
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<ActivityData>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activity_task_idx").on(t.taskId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const files = pgTable("files", {
  id: id(),
  uploaderId: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  createdAt: createdAt(),
});

export const integrationEvents = pgTable(
  "integration_events",
  {
    id: id(),
    source: text("source").$type<IntegrationSource>().notNull(),
    topic: text("topic").notNull(),
    // Delivery id from the provider: retries of the same webhook are processed once.
    externalId: text("external_id").notNull(),
    summary: text("summary").notNull().default(""),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status").$type<"received" | "processed" | "ignored" | "failed">().notNull().default("received"),
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("integration_events_dedupe_idx").on(t.source, t.externalId)],
);

export const automationRules = pgTable("automation_rules", {
  id: id(),
  name: text("name").notNull(),
  source: text("source").$type<IntegrationSource>().notNull(),
  topic: text("topic").notNull(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  titleTemplate: text("title_template").notNull(),
  descriptionTemplate: text("description_template").notNull().default(""),
  priority: text("priority").$type<Priority>().notNull().default("medium"),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

// Daily counters of business events received from Shopify and Guru. They feed the
// "Negócio" block of the dashboard and the MCP report tools.
export const businessEventsDaily = pgTable(
  "business_events_daily",
  {
    day: date("day", { mode: "string" }).notNull(),
    source: text("source").$type<IntegrationSource>().notNull(),
    topic: text("topic").notNull(),
    count: integer("count").notNull().default(0),
    amount: doublePrecision("amount").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.source, t.topic] })],
);
