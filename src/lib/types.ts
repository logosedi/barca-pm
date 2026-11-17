// Data shapes returned by the service layer and consumed by the UI, the Slack
// handlers and the MCP tools. Timestamps are ISO strings so they survive JSON.

import type {
  IntegrationSource,
  Priority,
  ProjectVisibility,
  Role,
  StatusCategory,
  TaskSource,
  TeamRole,
  TokenScope,
} from "./constants";
import type { Discipline } from "./templates";

export interface UserRef {
  id: string;
  name: string;
}

export interface MemberSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  pendingInvite: boolean;
  slackLinked: boolean;
  teams: { id: string; name: string; role: TeamRole }[];
}

export interface TeamSummary {
  id: string;
  name: string;
  discipline: Discipline;
  color: string;
  description: string;
  projectCount: number;
  members: { id: string; name: string; email: string; role: TeamRole }[];
}

export interface StatusInfo {
  id: string;
  name: string;
  category: StatusCategory;
  position: number;
}

export interface LabelInfo {
  id: string;
  name: string;
  color: string;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  discipline: Discipline;
  visibility: ProjectVisibility;
  slackChannelId: string | null;
  team: { id: string; name: string; color: string };
  openTasks: number;
  doneTasks: number;
}

export interface ProjectDetail extends ProjectSummary {
  statuses: StatusInfo[];
  labels: LabelInfo[];
  canEdit: boolean;
  canManage: boolean;
}

export interface TaskSummary {
  id: string;
  ref: string;
  number: number;
  projectId: string;
  projectKey: string;
  projectName: string;
  title: string;
  statusId: string;
  statusName: string;
  statusCategory: StatusCategory;
  priority: Priority;
  assignee: UserRef | null;
  dueDate: string | null;
  parentId: string | null;
  position: number;
  labelIds: string[];
  subtaskCount: number;
  subtaskDone: number;
  commentCount: number;
  source: TaskSource;
  createdAt: string;
  completedAt: string | null;
}

export interface CommentInfo {
  id: string;
  author: UserRef | null;
  body: string;
  createdAt: string;
  canDelete: boolean;
}

export interface ActivityInfo {
  id: string;
  actor: UserRef | null;
  type: string;
  data: Record<string, string | number | null>;
  createdAt: string;
}

export interface TaskDetail extends TaskSummary {
  description: string;
  reporter: UserRef | null;
  parent: { ref: string; title: string } | null;
  externalRef: { system: string; label: string; url?: string } | null;
  updatedAt: string;
  subtasks: TaskSummary[];
  comments: CommentInfo[];
  activity: ActivityInfo[];
  statuses: StatusInfo[];
  labels: LabelInfo[];
  assignableUsers: UserRef[];
  canEdit: boolean;
  canComment: boolean;
  canDelete: boolean;
}

export interface NotificationInfo {
  id: string;
  type: string;
  message: string;
  taskRef: string | null;
  read: boolean;
  createdAt: string;
}

export interface ApiTokenInfo {
  id: string;
  name: string;
  prefix: string;
  scope: TokenScope;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface AutomationRuleInfo {
  id: string;
  name: string;
  source: IntegrationSource;
  topic: string;
  project: { id: string; key: string; name: string };
  titleTemplate: string;
  descriptionTemplate: string;
  priority: Priority;
  assignee: UserRef | null;
  enabled: boolean;
}

export interface IntegrationEventInfo {
  id: string;
  source: IntegrationSource;
  topic: string;
  summary: string;
  status: string;
  detail: string;
  createdAt: string;
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
