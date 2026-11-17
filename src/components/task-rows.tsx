"use client";

import type { TaskSummary } from "@/lib/types";
import { DueDate, PriorityFlag, StatusPill } from "./task-bits";
import { openTask } from "./task-link";

/** Flat list of tasks from any project. Clicking a row opens the task panel. */
export function TaskRows({ tasks, today }: { tasks: TaskSummary[]; today: string }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {tasks.map((task) => (
        <li key={task.id}>
          <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50" onClick={() => openTask(task.ref)}>
            <span className="w-16 shrink-0 text-xs text-slate-400">{task.ref}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{task.title}</span>
              <span className="block truncate text-xs text-slate-500">{task.projectName}</span>
            </span>
            <span className="hidden max-w-40 sm:block">
              <StatusPill name={task.statusName} category={task.statusCategory} />
            </span>
            <PriorityFlag priority={task.priority} />
            <span className="w-14 shrink-0 text-right">
              <DueDate task={task} today={today} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
