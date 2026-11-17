"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { LabelInfo, ProjectDetail, TaskSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DueDate, PriorityFlag, StatusDot, TaskCounters } from "./task-bits";
import { openTask } from "./task-link";
import { Avatar, EmptyState } from "./ui";

interface TaskListProps {
  project: ProjectDetail;
  /** Top-level tasks to show, already filtered. */
  tasks: TaskSummary[];
  /** Subtasks to show under each parent, by parent id. */
  subtasks: Map<string, TaskSummary[]>;
  today: string;
}

/** Tasks grouped by workflow step, with subtasks nested under their parent. */
export function TaskList({ project, tasks, subtasks, today }: TaskListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const labels = new Map(project.labels.map((label) => [label.id, label]));

  if (tasks.length === 0) {
    return (
      <div className="px-6">
        <EmptyState title="Nenhuma tarefa por aqui">Crie a primeira tarefa ou ajuste os filtros.</EmptyState>
      </div>
    );
  }

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5 px-6 pb-6">
      {project.statuses.map((status) => {
        const group = tasks.filter((task) => task.statusId === status.id).sort((a, b) => a.position - b.position);
        if (group.length === 0) return null;
        return (
          <section key={status.id}>
            <h3 className="mb-1.5 flex items-center gap-2 px-1 text-sm font-semibold text-slate-800">
              <StatusDot category={status.category} />
              {status.name}
              <span className="font-normal text-slate-400">{group.length}</span>
            </h3>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {group.map((task) => {
                const children = subtasks.get(task.id) ?? [];
                const open = !collapsed.has(task.id);
                return (
                  <li key={task.id}>
                    <Row task={task} labels={labels} today={today}>
                      {children.length > 0 ? (
                        <button
                          type="button"
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-expanded={open}
                          aria-label={open ? "Recolher subtarefas" : "Mostrar subtarefas"}
                          onClick={() => toggle(task.id)}
                        >
                          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      ) : (
                        <span className="w-5" />
                      )}
                    </Row>
                    {open && children.length > 0 ? (
                      <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/60">
                        {children.map((subtask) => (
                          <li key={subtask.id}>
                            <Row task={subtask} labels={labels} today={today} nested>
                              <span className="w-5" />
                            </Row>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  task,
  labels,
  today,
  nested,
  children,
}: {
  task: TaskSummary;
  labels: Map<string, LabelInfo>;
  today: string;
  nested?: boolean;
  children: React.ReactNode;
}) {
  const done = task.statusCategory === "done";
  return (
    <div className={cn("flex items-center gap-2.5 py-2 pr-3", nested ? "pl-9" : "pl-2")}>
      {children}
      <span className="w-16 shrink-0 text-xs text-slate-400">{task.ref}</span>
      <button
        type="button"
        className={cn("min-w-0 flex-1 truncate text-left text-sm hover:text-brand-700", done ? "text-slate-400 line-through" : "text-slate-900", !nested && "font-medium")}
        onClick={() => openTask(task.ref)}
      >
        {task.title}
      </button>
      <span className="hidden shrink-0 gap-1 lg:flex">
        {task.labelIds.slice(0, 2).map((id) => {
          const label = labels.get(id);
          return label ? (
            <span key={id} className="rounded px-1.5 py-px text-[11px] font-medium" style={{ backgroundColor: `${label.color}1f`, color: label.color }}>
              {label.name}
            </span>
          ) : null;
        })}
      </span>
      {nested ? <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{task.statusName}</span> : <TaskCounters task={task} />}
      <PriorityFlag priority={task.priority} />
      <span className="w-14 shrink-0 text-right">
        <DueDate task={task} today={today} />
      </span>
      <span className="w-6 shrink-0">{task.assignee ? <Avatar id={task.assignee.id} name={task.assignee.name} size="sm" /> : null}</span>
    </div>
  );
}
