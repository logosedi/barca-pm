import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { TaskRows } from "@/components/task-rows";
import { EmptyState, PageHeader } from "@/components/ui";
import type { TaskSummary } from "@/lib/types";
import { addDaysISO, todayISO } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { listMyTasks } from "@/server/services/tasks";

export const metadata: Metadata = { title: "Minhas tarefas" };

export default function MyTasksPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MyTasks />
    </Suspense>
  );
}

async function MyTasks() {
  const user = await requireUser();
  const tasks = await listMyTasks(user);
  const today = todayISO();
  const nextWeek = addDaysISO(today, 7);

  const groups: { title: string; tasks: TaskSummary[] }[] = [
    { title: "Atrasadas", tasks: tasks.filter((task) => task.dueDate && task.dueDate < today) },
    { title: "Hoje", tasks: tasks.filter((task) => task.dueDate === today) },
    { title: "Próximos 7 dias", tasks: tasks.filter((task) => task.dueDate && task.dueDate > today && task.dueDate <= nextWeek) },
    { title: "Mais adiante", tasks: tasks.filter((task) => task.dueDate && task.dueDate > nextWeek) },
    { title: "Sem prazo", tasks: tasks.filter((task) => !task.dueDate) },
  ];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title="Minhas tarefas"
        description={
          tasks.length === 0
            ? "Tarefas abertas atribuídas a você, de todos os projetos."
            : `${tasks.length} ${tasks.length === 1 ? "tarefa aberta atribuída" : "tarefas abertas atribuídas"} a você, de todos os projetos.`
        }
      />
      {tasks.length === 0 ? (
        <EmptyState title="Tudo em dia">Nenhuma tarefa aberta está atribuída a você.</EmptyState>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((group) => group.tasks.length > 0)
            .map((group) => (
              <section key={group.title}>
                <h2 className="mb-2 text-sm font-semibold text-slate-700">
                  {group.title} <span className="font-normal text-slate-400">{group.tasks.length}</span>
                </h2>
                <TaskRows tasks={group.tasks} today={today} />
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
