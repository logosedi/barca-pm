"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useState } from "react";
import { createTaskAction, moveTaskAction } from "@/app/actions/app";
import type { LabelInfo, ProjectDetail, TaskSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DueDate, PriorityFlag, StatusDot, TaskCounters } from "./task-bits";
import { openTask } from "./task-link";
import { toast } from "./toast";
import { Avatar, Input, useAction } from "./ui";

type Order = Record<string, string[]>;

function buildOrder(project: ProjectDetail, tasks: TaskSummary[]): Order {
  const order: Order = Object.fromEntries(project.statuses.map((status) => [status.id, [] as string[]]));
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) order[task.statusId]?.push(task.id);
  return order;
}

interface BoardProps {
  project: ProjectDetail;
  /** Top-level tasks to show, already filtered. */
  tasks: TaskSummary[];
  today: string;
}

/**
 * Kanban board. Cards move between and inside columns by drag and drop (mouse, touch
 * or keyboard). The drop is applied on screen right away and then saved; if saving
 * fails the board goes back to what the server has.
 */
export function Board({ project, tasks, today }: BoardProps) {
  const { run } = useAction();
  const [order, setOrder] = useState(() => buildOrder(project, tasks));
  const [activeId, setActiveId] = useState<string | null>(null);

  // Fresh data from the server replaces the local arrangement.
  const [source, setSource] = useState({ project, tasks });
  if (source.project !== project || source.tasks !== tasks) {
    setSource({ project, tasks });
    setOrder(buildOrder(project, tasks));
  }

  const sensors = useSensors(
    // The distance lets a plain click open the task instead of starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const labels = new Map(project.labels.map((label) => [label.id, label]));
  const columnOf = (id: string) => (id in order ? id : Object.keys(order).find((statusId) => order[statusId].includes(id)));

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeTask = String(active.id);
    const from = columnOf(activeTask);
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    setOrder((current) => {
      const overIndex = current[to].indexOf(String(over.id));
      const index = overIndex >= 0 ? overIndex : current[to].length;
      return {
        ...current,
        [from]: current[from].filter((id) => id !== activeTask),
        [to]: [...current[to].slice(0, index), activeTask, ...current[to].slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const taskId = String(active.id);
    const column = columnOf(taskId);
    const original = buildOrder(project, tasks);
    if (!over || !column) {
      setOrder(original);
      return;
    }
    let ids = order[column];
    const from = ids.indexOf(taskId);
    const to = ids.indexOf(String(over.id));
    if (to >= 0 && to !== from) ids = arrayMove(ids, from, to);
    setOrder({ ...order, [column]: ids });

    const index = ids.indexOf(taskId);
    const before = ids[index - 1] ?? null;
    const after = ids[index + 1] ?? null;
    const was = original[column]?.indexOf(taskId) ?? -1;
    if (was >= 0 && (original[column][was - 1] ?? null) === before && (original[column][was + 1] ?? null) === after) return;

    run(() => moveTaskAction(taskId, { statusId: column, beforeId: before, afterId: after }), {
      onError: (message) => {
        toast.error(message);
        setOrder(original);
      },
    });
  }

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      id="board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: dragged }) => setActiveId(String(dragged.id))}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOrder(buildOrder(project, tasks));
      }}
    >
      <div className="flex h-full min-h-0 items-start gap-3 overflow-x-auto px-6 pb-4">
        {project.statuses.map((status) => {
          const ids = order[status.id] ?? [];
          return (
            <Column key={status.id} id={status.id} ids={ids}>
              <div className="flex items-center gap-2 px-1 pb-2">
                <StatusDot category={status.category} />
                <h3 className="truncate text-sm font-semibold text-slate-800">{status.name}</h3>
                <span className="text-xs text-slate-400">{ids.length}</span>
              </div>
              <ul className="flex min-h-10 flex-1 flex-col gap-2 overflow-y-auto pb-1">
                {ids.map((id) => {
                  const task = byId.get(id);
                  return task ? <SortableCard key={id} task={task} labels={labels} today={today} draggable={project.canEdit} /> : null;
                })}
              </ul>
              {project.canEdit ? <QuickAdd projectId={project.id} statusId={status.id} /> : null}
            </Column>
          );
        })}
      </div>
      <DragOverlay>
        {active ? (
          <div className="rotate-2 cursor-grabbing">
            <CardBody task={active} labels={labels} today={today} className="shadow-lg" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ id, ids, children }: { id: string; ids: string[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      className={cn("flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-2.5", isOver && "ring-2 ring-brand-300")}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </section>
  );
}

interface CardProps {
  task: TaskSummary;
  labels: Map<string, LabelInfo>;
  today: string;
}

function SortableCard({ task, labels, today, draggable }: CardProps & { draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !draggable });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("rounded-lg", draggable && "cursor-grab touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      aria-roledescription={draggable ? "cartão arrastável" : undefined}
      onClick={() => openTask(task.ref)}
    >
      <CardBody task={task} labels={labels} today={today} />
    </li>
  );
}

function CardBody({ task, labels, today, className }: CardProps & { className?: string }) {
  const taskLabels = task.labelIds.map((id) => labels.get(id)).filter((label): label is LabelInfo => !!label);
  return (
    <article className={cn("rounded-lg border border-slate-200 bg-white p-3 shadow-xs hover:border-slate-300", className)}>
      {taskLabels.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {taskLabels.map((label) => (
            <span key={label.id} className="rounded px-1.5 py-px text-[11px] font-medium" style={{ backgroundColor: `${label.color}1f`, color: label.color }}>
              {label.name}
            </span>
          ))}
        </div>
      ) : null}
      {/* A real button, so keyboard users can open the task; Enter on the card itself starts a drag. */}
      <button type="button" className="block w-full text-left text-sm leading-snug font-medium text-slate-900 hover:text-brand-700">
        {task.title}
      </button>
      <div className="mt-2 flex items-center gap-2.5">
        <span className="text-xs text-slate-400">{task.ref}</span>
        <PriorityFlag priority={task.priority} />
        <DueDate task={task} today={today} />
        <TaskCounters task={task} />
        <span className="flex-1" />
        {task.assignee ? <Avatar id={task.assignee.id} name={task.assignee.name} size="sm" /> : null}
      </div>
    </article>
  );
}

function QuickAdd({ projectId, statusId }: { projectId: string; statusId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const { pending, run } = useAction();

  if (!open) {
    return (
      <button
        type="button"
        className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-700"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Nova tarefa
      </button>
    );
  }
  return (
    <form
      className="mt-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || pending) return;
        // The field stays open and focused, so several cards can be typed in a row.
        run(() => createTaskAction({ projectId, statusId, title }), { onSuccess: () => setTitle("") });
      }}
    >
      <Input
        autoFocus
        aria-label="Título da nova tarefa"
        placeholder="Título e Enter"
        value={title}
        maxLength={200}
        aria-busy={pending}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          if (!title.trim()) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
      />
    </form>
  );
}
