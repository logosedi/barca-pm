import { Flag, ListTree, MessageSquare } from "lucide-react";
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_CATEGORY_COLORS, type Priority, type StatusCategory } from "@/lib/constants";
import type { TaskSummary } from "@/lib/types";
import { cn, formatDay, isOverdue } from "@/lib/utils";

// Small read-only pieces of a task, shared by the board, the lists and the dashboard.

export function PriorityFlag({ priority, withLabel }: { priority: Priority; withLabel?: boolean }) {
  if (priority === "none" && !withLabel) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs" style={{ color: PRIORITY_COLORS[priority] }} title={`Prioridade: ${PRIORITY_LABELS[priority]}`}>
      <Flag className="size-3.5" fill={priority === "none" ? "none" : "currentColor"} />
      {withLabel ? <span className="font-medium">{PRIORITY_LABELS[priority]}</span> : <span className="sr-only">{PRIORITY_LABELS[priority]}</span>}
    </span>
  );
}

export function DueDate({ task, today }: { task: Pick<TaskSummary, "dueDate" | "statusCategory">; today: string }) {
  if (!task.dueDate) return null;
  const late = isOverdue(task.dueDate, task.statusCategory === "done", today);
  return (
    <span className={cn("shrink-0 text-xs whitespace-nowrap", late ? "font-semibold text-red-600" : "text-slate-500")} title={late ? "Atrasada" : "Prazo"}>
      {formatDay(task.dueDate)}
    </span>
  );
}

export function StatusDot({ category }: { category: StatusCategory }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_CATEGORY_COLORS[category] }} />;
}

export function StatusPill({ name, category }: { name: string; category: StatusCategory }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      <StatusDot category={category} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function TaskCounters({ task }: { task: Pick<TaskSummary, "subtaskCount" | "subtaskDone" | "commentCount"> }) {
  return (
    <>
      {task.subtaskCount > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500" title="Subtarefas concluídas">
          <ListTree className="size-3.5" />
          {task.subtaskDone}/{task.subtaskCount}
        </span>
      ) : null}
      {task.commentCount > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500" title="Comentários">
          <MessageSquare className="size-3.5" />
          {task.commentCount}
        </span>
      ) : null}
    </>
  );
}
