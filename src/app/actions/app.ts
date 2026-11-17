"use server";

// Server Actions used by the signed-in app. Each one is a thin adapter: it resolves
// the current user, delegates to a service (which validates input and enforces
// permissions) and reports the result. No business rule lives here.

import { appUrl } from "@/server/config";
import { runAction } from "@/server/http";
import {
  createRule,
  deleteRule,
  setRuleEnabled,
  type RuleInput,
} from "@/server/services/automations";
import { markNotificationsRead } from "@/server/services/notifications";
import {
  addLabel,
  addStatus,
  archiveProject,
  createProject,
  deleteLabel,
  deleteStatus,
  shiftStatus,
  updateProject,
  updateStatus,
} from "@/server/services/projects";
import {
  addComment,
  createTask,
  deleteComment,
  deleteTask,
  moveTask,
  updateTask,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/server/services/tasks";
import { createTeam, deleteTeam, removeTeamMember, setTeamMember, updateTeam } from "@/server/services/teams";
import { createApiToken, revokeApiToken } from "@/server/services/tokens";
import {
  changePassword,
  inviteMember,
  renewInvite,
  setMemberActive,
  updateMemberRole,
  updateProfile,
} from "@/server/services/users";

const inviteUrl = (token: string) => `${appUrl()}/invite/${token}`;

// Tasks ---------------------------------------------------------------------

export async function createTaskAction(input: CreateTaskInput) {
  return runAction((actor) => createTask(actor, input));
}

export async function updateTaskAction(taskId: string, patch: UpdateTaskInput) {
  return runAction((actor) => updateTask(actor, taskId, patch));
}

export async function moveTaskAction(
  taskId: string,
  target: { statusId: string; beforeId: string | null; afterId: string | null },
) {
  return runAction((actor) => moveTask(actor, taskId, target));
}

export async function deleteTaskAction(taskId: string) {
  return runAction((actor) => deleteTask(actor, taskId));
}

export async function addCommentAction(taskId: string, body: string) {
  return runAction((actor) => addComment(actor, taskId, body));
}

export async function deleteCommentAction(commentId: string) {
  return runAction((actor) => deleteComment(actor, commentId));
}

// Projects ------------------------------------------------------------------

export async function createProjectAction(input: Parameters<typeof createProject>[1]) {
  return runAction((actor) => createProject(actor, input));
}

export async function updateProjectAction(projectId: string, input: Parameters<typeof updateProject>[2]) {
  return runAction((actor) => updateProject(actor, projectId, input));
}

export async function archiveProjectAction(projectId: string) {
  return runAction((actor) => archiveProject(actor, projectId));
}

export async function addStatusAction(projectId: string, input: { name: string; category: string }) {
  return runAction((actor) => addStatus(actor, projectId, input));
}

export async function updateStatusAction(statusId: string, input: { name: string; category: string }) {
  return runAction((actor) => updateStatus(actor, statusId, input));
}

export async function deleteStatusAction(statusId: string) {
  return runAction((actor) => deleteStatus(actor, statusId));
}

export async function shiftStatusAction(statusId: string, direction: "left" | "right") {
  return runAction((actor) => shiftStatus(actor, statusId, direction));
}

export async function addLabelAction(projectId: string, input: { name: string; color?: string }) {
  return runAction((actor) => addLabel(actor, projectId, input));
}

export async function deleteLabelAction(labelId: string) {
  return runAction((actor) => deleteLabel(actor, labelId));
}

// Teams and people ----------------------------------------------------------

export async function createTeamAction(input: Parameters<typeof createTeam>[1]) {
  return runAction((actor) => createTeam(actor, input));
}

export async function updateTeamAction(teamId: string, input: Parameters<typeof updateTeam>[2]) {
  return runAction((actor) => updateTeam(actor, teamId, input));
}

export async function deleteTeamAction(teamId: string) {
  return runAction((actor) => deleteTeam(actor, teamId));
}

export async function setTeamMemberAction(teamId: string, userId: string, role: string) {
  return runAction((actor) => setTeamMember(actor, teamId, userId, role));
}

export async function removeTeamMemberAction(teamId: string, userId: string) {
  return runAction((actor) => removeTeamMember(actor, teamId, userId));
}

/** Returns the invite link. There is no e-mail delivery yet: the admin shares it. */
export async function inviteMemberAction(input: { name: string; email: string; role: string }) {
  return runAction(async (actor) => inviteUrl((await inviteMember(actor, input)).token));
}

export async function renewInviteAction(userId: string) {
  return runAction(async (actor) => inviteUrl(await renewInvite(actor, userId)));
}

export async function updateMemberRoleAction(userId: string, role: string) {
  return runAction((actor) => updateMemberRole(actor, userId, role));
}

export async function setMemberActiveAction(userId: string, isActive: boolean) {
  return runAction((actor) => setMemberActive(actor, userId, isActive));
}

// Personal settings ---------------------------------------------------------

export async function updateProfileAction(input: { name: string; notifySlack: boolean }) {
  return runAction((actor) => updateProfile(actor, input));
}

export async function changePasswordAction(currentPassword: string, newPassword: string) {
  return runAction((actor) => changePassword(actor, currentPassword, newPassword));
}

/** Returns the plain token, which is shown once and cannot be recovered later. */
export async function createApiTokenAction(input: { name: string; scope: string }) {
  return runAction((actor) => createApiToken(actor, input));
}

export async function revokeApiTokenAction(tokenId: string) {
  return runAction((actor) => revokeApiToken(actor, tokenId));
}

export async function markNotificationsReadAction(notificationId?: string) {
  return runAction((actor) => markNotificationsRead(actor, notificationId));
}

// Integrations --------------------------------------------------------------

export async function createRuleAction(input: RuleInput) {
  return runAction((actor) => createRule(actor, input));
}

export async function setRuleEnabledAction(ruleId: string, enabled: boolean) {
  return runAction((actor) => setRuleEnabled(actor, ruleId, enabled));
}

export async function deleteRuleAction(ruleId: string) {
  return runAction((actor) => deleteRule(actor, ruleId));
}
