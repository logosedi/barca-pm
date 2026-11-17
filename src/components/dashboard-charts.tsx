"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { STATUS_CATEGORY_COLORS } from "@/lib/constants";
import type { ReportTask } from "@/server/services/reports";
import { formatDay } from "@/lib/utils";
import { openTask } from "./task-link";

const CREATED_COLOR = "#94a3b8";
const COMPLETED_COLOR = STATUS_CATEGORY_COLORS.done;

/** Tasks created and completed per week. The gap between the bars is the backlog trend. */
export function WeeklyChart({ data }: { data: { week: string; created: number; completed: number }[] }) {
  const rows = data.map((item) => ({ label: formatDay(item.week), Criadas: item.created, Concluídas: item.completed }));
  return (
    <div className="h-64" role="img" aria-label="Gráfico de tarefas criadas e concluídas por semana, nas últimas 8 semanas">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
          <Tooltip
            cursor={{ fill: "#f1f5f9" }}
            labelFormatter={(label) => `Semana de ${label}`}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
          />
          {/* Same order as the bars; the default would sort the legend alphabetically. */}
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13 }} itemSorter={(item) => (item.value === "Criadas" ? 0 : 1)} />
          <Bar dataKey="Criadas" fill={CREATED_COLOR} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="Concluídas" fill={COMPLETED_COLOR} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ReportTaskList({ tasks, late }: { tasks: ReportTask[]; late?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((task) => (
        <li key={task.ref}>
          <button type="button" className="flex w-full items-center gap-3 px-5 py-2 text-left hover:bg-slate-50" onClick={() => openTask(task.ref)}>
            <span className="w-16 shrink-0 text-xs text-slate-400">{task.ref}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-900">{task.title}</span>
              <span className="block truncate text-xs text-slate-500">
                {task.project} · {task.assignee ?? "sem responsável"}
              </span>
            </span>
            {task.dueDate ? (
              <span className={late ? "shrink-0 text-xs font-semibold text-red-600" : "shrink-0 text-xs text-slate-500"}>{formatDay(task.dueDate)}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
