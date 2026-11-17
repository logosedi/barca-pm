"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { TaskSummary } from "@/lib/types";
import { addDaysISO, cn } from "@/lib/utils";
import { openTask } from "./task-link";
import { Button } from "./ui";

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MAX_PER_DAY = 4;
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Weeks (Monday to Sunday) that cover the given month (YYYY-MM). */
function monthWeeks(month: string) {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  let day = addDaysISO(first, -weekday);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDaysISO(day, 1);
    }
    weeks.push(week);
  } while (day.slice(0, 7) === month);
  return weeks;
}

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

/** Month view of tasks and subtasks by due date. */
export function Calendar({ tasks, today }: { tasks: TaskSummary[]; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [expanded, setExpanded] = useState<string | null>(null);
  const byDay = new Map<string, TaskSummary[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const items = byDay.get(task.dueDate);
    if (items) items.push(task);
    else byDay.set(task.dueDate, [task]);
  }
  const undated = tasks.filter((task) => !task.dueDate && task.statusCategory !== "done").length;

  return (
    <div className="px-6 pb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-2 w-44 text-base font-semibold text-slate-900 first-letter:uppercase">
          {monthFormatter.format(new Date(`${month}-01T00:00:00Z`))}
        </h3>
        <Button size="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" onClick={() => setMonth(today.slice(0, 7))}>
          Hoje
        </Button>
        <Button size="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
          <ChevronRight className="size-4" />
        </Button>
        {undated > 0 ? (
          <span className="ml-auto text-sm text-slate-500">
            {undated === 1 ? "1 tarefa aberta sem prazo não aparece aqui." : `${undated} tarefas abertas sem prazo não aparecem aqui.`}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[44rem] overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-500 uppercase">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="py-1.5">
                {weekday}
              </div>
            ))}
          </div>
          {monthWeeks(month).map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
              {week.map((day) => {
                const items = byDay.get(day) ?? [];
                const showAll = expanded === day;
                const visible = showAll ? items : items.slice(0, MAX_PER_DAY);
                return (
                  <div key={day} className={cn("min-h-28 border-r border-slate-100 p-1.5 last:border-r-0", day.slice(0, 7) !== month && "bg-slate-50/70")}>
                    <div
                      className={cn(
                        "mb-1 flex size-6 items-center justify-center rounded-full text-xs",
                        day === today ? "bg-brand-700 font-semibold text-white" : day.slice(0, 7) === month ? "text-slate-700" : "text-slate-400",
                      )}
                    >
                      {Number(day.slice(8))}
                    </div>
                    <ul className="space-y-1">
                      {visible.map((task) => {
                        const done = task.statusCategory === "done";
                        const late = !done && day < today;
                        return (
                          <li key={task.id}>
                            <button
                              type="button"
                              title={`${task.ref} · ${task.title}`}
                              className={cn(
                                "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs",
                                done
                                  ? "bg-slate-100 text-slate-400 line-through"
                                  : late
                                    ? "bg-red-50 text-red-700 hover:bg-red-100"
                                    : "bg-brand-50 text-brand-900 hover:bg-brand-100",
                              )}
                              onClick={() => openTask(task.ref)}
                            >
                              {task.title}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {items.length > MAX_PER_DAY ? (
                      <button
                        type="button"
                        className="mt-1 px-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
                        onClick={() => setExpanded(showAll ? null : day)}
                      >
                        {showAll ? "Mostrar menos" : `+${items.length - MAX_PER_DAY} tarefas`}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
