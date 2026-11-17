"use client";

import { CalendarDays, List, Plus, Search, SquareKanban } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { createTaskAction } from "@/app/actions/app";
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/constants";
import type { ProjectDetail, TaskSummary, UserRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Board } from "./board";
import { Calendar } from "./calendar";
import { MarkdownEditor } from "./markdown-editor";
import { TaskList } from "./task-list";
import { Button, Field, Input, Modal, Select, useAction } from "./ui";

const VIEWS = [
  { id: "board", label: "Quadro", icon: SquareKanban },
  { id: "list", label: "Lista", icon: List },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
] as const;
type View = (typeof VIEWS)[number]["id"];

const UNASSIGNED = "none";

interface ProjectViewProps {
  project: ProjectDetail;
  tasks: TaskSummary[];
  assignees: UserRef[];
  currentUserId: string;
  today: string;
}

export function ProjectView({ project, tasks, assignees, currentUserId, today }: ProjectViewProps) {
  const requested = useSearchParams().get("view");
  const view: View = VIEWS.some((item) => item.id === requested) ? (requested as View) : "board";
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [creating, setCreating] = useState(false);

  // The view lives in the URL so it can be shared, but switching it needs no server work.
  function show(next: View) {
    const url = new URL(window.location.href);
    if (next === "board") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.pushState(null, "", url);
  }

  // A task is shown when it matches the filters or when one of its subtasks does.
  const { parents, subtasks, everything } = useMemo(() => {
    const text = query.trim().toLowerCase();
    const filtering = text !== "" || assignee !== "";
    const matches = (task: TaskSummary) =>
      (text === "" || task.title.toLowerCase().includes(text) || task.ref.toLowerCase().includes(text)) &&
      (assignee === "" || (assignee === UNASSIGNED ? task.assignee === null : task.assignee?.id === assignee));

    const children = new Map<string, TaskSummary[]>();
    for (const task of tasks) {
      if (!task.parentId || (filtering && !matches(task))) continue;
      const siblings = children.get(task.parentId);
      if (siblings) siblings.push(task);
      else children.set(task.parentId, [task]);
    }
    for (const siblings of children.values()) siblings.sort((a, b) => a.position - b.position);
    const top = tasks.filter((task) => !task.parentId && (matches(task) || children.has(task.id)));
    return { parents: top, subtasks: children, everything: filtering ? tasks.filter(matches) : tasks };
  }, [tasks, query, assignee]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="tablist" aria-label="Visualização">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium",
                view === id ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
              onClick={() => show(id)}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            aria-label="Buscar tarefas"
            placeholder="Buscar…"
            className="w-44 py-1.5 pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select aria-label="Filtrar por responsável" className="w-auto py-1.5" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
          <option value="">Todos os responsáveis</option>
          <option value={currentUserId}>Minhas tarefas</option>
          <option value={UNASSIGNED}>Sem responsável</option>
          {assignees
            .filter((user) => user.id !== currentUserId)
            .map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
        </Select>

        <span className="flex-1" />
        {project.canEdit ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nova tarefa
          </Button>
        ) : (
          <span className="text-sm text-slate-500">Acesso de leitura</span>
        )}
      </div>

      <div className={cn("min-h-0 flex-1", view !== "board" && "overflow-y-auto")}>
        {view === "board" ? <Board project={project} tasks={parents} today={today} /> : null}
        {view === "list" ? <TaskList project={project} tasks={parents} subtasks={subtasks} today={today} /> : null}
        {view === "calendar" ? <Calendar tasks={everything} today={today} /> : null}
      </div>

      {creating ? <NewTaskModal project={project} assignees={assignees} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function NewTaskModal({ project, assignees, onClose }: { project: ProjectDetail; assignees: UserRef[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState(project.statuses[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [dueDate, setDueDate] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  function submit() {
    setError("");
    run(
      () =>
        createTaskAction({
          projectId: project.id,
          title,
          description,
          statusId,
          assigneeId: assigneeId || null,
          priority,
          dueDate: dueDate || null,
          labelIds,
        }),
      { onSuccess: onClose, onError: setError },
    );
  }

  return (
    <Modal title={`Nova tarefa em ${project.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label="Título">
          <Input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <div>
          <span className="mb-1 block text-[13px] font-medium text-slate-700">Descrição</span>
          <MarkdownEditor value={description} onChange={setDescription} placeholder="Opcional. Aceita Markdown e imagens coladas." onSubmit={submit} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Etapa">
            <Select value={statusId} onChange={(event) => setStatusId(event.target.value)}>
              {project.statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">Sem responsável</option>
              {assignees.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prazo">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>
        {project.labels.length > 0 ? (
          <div>
            <span className="mb-1 block text-[13px] font-medium text-slate-700">Etiquetas</span>
            <div className="flex flex-wrap gap-1.5">
              {project.labels.map((label) => {
                const active = labelIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium",
                      active ? "border-transparent" : "border-slate-200 text-slate-500 hover:border-slate-300",
                    )}
                    style={active ? { backgroundColor: `${label.color}1f`, color: label.color } : undefined}
                    onClick={() => setLabelIds(active ? labelIds.filter((id) => id !== label.id) : [...labelIds, label.id])}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pending || !title.trim()}>
            {pending ? "Criando…" : "Criar tarefa"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
