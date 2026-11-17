"use client";

import { Check, CornerDownRight, ExternalLink, Link2, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  addCommentAction,
  createTaskAction,
  deleteCommentAction,
  deleteTaskAction,
  updateTaskAction,
} from "@/app/actions/app";
import { PRIORITIES, PRIORITY_LABELS, TASK_SOURCE_LABELS, type Priority, type TaskSource } from "@/lib/constants";
import type { ActionResult, ActivityInfo, TaskDetail, TaskSummary } from "@/lib/types";
import { cn, formatDateTime, formatDay, isOverdue } from "@/lib/utils";
import type { UpdateTaskInput } from "@/server/services/tasks";
import { Markdown } from "./markdown";
import { MarkdownEditor } from "./markdown-editor";
import { openTask } from "./task-link";
import { toast } from "./toast";
import { Avatar, Badge, Button, Input, Select, useAction } from "./ui";

/**
 * Mounted once in the app layout. Any screen opens a task by setting `?task=REF`
 * (see `openTask`), so the panel works over the board, the lists and the dashboard.
 */
export function TaskPanelHost() {
  const ref = useSearchParams().get("task");
  if (!ref) return null;
  return <TaskPanel key={ref} taskRef={ref} />;
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; task: TaskDetail };

function TaskPanel({ taskRef }: { taskRef: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((current) => current + 1);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tasks/${encodeURIComponent(taskRef)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar a tarefa.");
        setState({ status: "ready", task: body as TaskDetail });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ status: "error", message: error.message });
      });
    return () => controller.abort();
  }, [taskRef, version]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape inside a field cancels that edit instead of closing the panel.
      if (event.key === "Escape" && !(event.target as HTMLElement).closest("input, textarea, select")) openTask(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={() => openTask(null)} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Tarefa ${taskRef}`}
        className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
      >
        {state.status === "ready" ? (
          <TaskContent task={state.task} reload={reload} />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <span className="text-sm font-medium text-slate-500">{taskRef}</span>
              <Button variant="ghost" size="icon" onClick={() => openTask(null)} aria-label="Fechar">
                <X className="size-4" />
              </Button>
            </div>
            {state.status === "loading" ? (
              <div className="space-y-3 p-5" aria-busy="true">
                <div className="h-7 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-24 animate-pulse rounded bg-slate-100" />
                <div className="h-40 animate-pulse rounded bg-slate-100" />
              </div>
            ) : (
              <div className="p-5">
                <p className="font-medium text-slate-800">{state.message}</p>
                <p className="mt-1 text-sm text-slate-500">
                  A tarefa pode ter sido excluída, o projeto pode ter sido arquivado, ou você não tem acesso a ele.
                </p>
                <Button className="mt-4" onClick={reload}>
                  Tentar de novo
                </Button>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function TaskContent({ task, reload }: { task: TaskDetail; reload: () => void }) {
  const { pending, run } = useAction();
  const done = task.statusCategory === "done";

  /** Runs an action and reloads the panel; the action itself refreshes the page below. */
  function mutate<T>(action: () => Promise<ActionResult<T>>, onSuccess?: (data: T) => void) {
    run(action, {
      onSuccess: (data) => {
        onSuccess?.(data);
        reload();
      },
    });
  }
  const update = (patch: UpdateTaskInput) => mutate(() => updateTaskAction(task.id, patch));

  function copyLink() {
    const url = `${window.location.origin}/t/${task.ref}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copiado."),
      () => toast.error(`Não foi possível copiar. O link é ${url}`),
    );
  }

  function remove() {
    const warning =
      task.subtaskCount > 0
        ? `Excluir ${task.ref} e as ${task.subtaskCount} subtarefas? Não dá para desfazer.`
        : `Excluir ${task.ref}? Não dá para desfazer.`;
    if (!window.confirm(warning)) return;
    run(() => deleteTaskAction(task.id), { onSuccess: () => openTask(null) });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{task.ref}</span>
          <span className="truncate">{task.projectName}</span>
          {pending ? <span className="text-xs text-slate-400">Salvando…</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={copyLink} title="Copiar link" aria-label="Copiar link">
            <Link2 className="size-4" />
          </Button>
          {task.canDelete ? (
            <Button variant="ghost" size="icon" onClick={remove} title="Excluir tarefa" aria-label="Excluir tarefa">
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={() => openTask(null)} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        <div>
          {task.parent ? (
            <button
              type="button"
              className="mb-1.5 flex max-w-full items-center gap-1.5 text-[13px] text-slate-500 hover:text-brand-700"
              onClick={() => openTask(task.parent!.ref)}
            >
              <CornerDownRight className="size-3.5 shrink-0" />
              <span className="truncate">
                Subtarefa de {task.parent.ref} · {task.parent.title}
              </span>
            </button>
          ) : null}
          <TitleField key={task.title} title={task.title} editable={task.canEdit} onSave={(title) => update({ title })} />
        </div>

        <dl className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
          <dt className="text-slate-500">Etapa</dt>
          <dd>
            <Select
              aria-label="Etapa"
              className="max-w-xs py-1.5"
              value={task.statusId}
              disabled={!task.canEdit}
              onChange={(event) => update({ statusId: event.target.value })}
            >
              {task.statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </Select>
          </dd>

          <dt className="text-slate-500">Responsável</dt>
          <dd>
            <Select
              aria-label="Responsável"
              className="max-w-xs py-1.5"
              value={task.assignee?.id ?? ""}
              disabled={!task.canEdit}
              onChange={(event) => update({ assigneeId: event.target.value || null })}
            >
              <option value="">Sem responsável</option>
              {/* Keeps the current assignee selectable even if they left the project's audience. */}
              {task.assignee && !task.assignableUsers.some((user) => user.id === task.assignee!.id) ? (
                <option value={task.assignee.id}>{task.assignee.name}</option>
              ) : null}
              {task.assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </dd>

          <dt className="text-slate-500">Prioridade</dt>
          <dd>
            <Select
              aria-label="Prioridade"
              className="max-w-xs py-1.5"
              value={task.priority}
              disabled={!task.canEdit}
              onChange={(event) => update({ priority: event.target.value as Priority })}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </dd>

          <dt className="text-slate-500">Prazo</dt>
          <dd className="flex items-center gap-2">
            <Input
              aria-label="Prazo"
              type="date"
              className="max-w-xs py-1.5"
              value={task.dueDate ?? ""}
              disabled={!task.canEdit}
              onChange={(event) => update({ dueDate: event.target.value || null })}
            />
            {isOverdue(task.dueDate, done) ? <Badge color="#dc2626">Atrasada</Badge> : null}
          </dd>

          {task.labels.length > 0 ? (
            <>
              <dt className="self-start pt-1 text-slate-500">Etiquetas</dt>
              <dd className="flex flex-wrap gap-1.5">
                {task.labels.map((label) => {
                  const active = task.labelIds.includes(label.id);
                  if (!task.canEdit) return active ? <Badge key={label.id} color={label.color}>{label.name}</Badge> : null;
                  return (
                    <button
                      key={label.id}
                      type="button"
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                        active ? "border-transparent" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                      )}
                      style={active ? { backgroundColor: `${label.color}1f`, color: label.color } : undefined}
                      onClick={() =>
                        update({
                          labelIds: active ? task.labelIds.filter((id) => id !== label.id) : [...task.labelIds, label.id],
                        })
                      }
                    >
                      {label.name}
                    </button>
                  );
                })}
                {!task.canEdit && task.labelIds.length === 0 ? <span className="text-slate-400">Nenhuma</span> : null}
              </dd>
            </>
          ) : null}

          <dt className="text-slate-500">Criada</dt>
          <dd className="text-slate-700">
            {formatDateTime(task.createdAt)}
            {task.reporter ? ` por ${task.reporter.name}` : ""}
            {task.source !== "web" ? ` · via ${TASK_SOURCE_LABELS[task.source]}` : ""}
          </dd>

          {task.externalRef ? (
            <>
              <dt className="text-slate-500">Origem</dt>
              <dd className="text-slate-700">
                {task.externalRef.url ? (
                  <a
                    href={task.externalRef.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-700 underline"
                  >
                    {task.externalRef.label}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  task.externalRef.label
                )}
              </dd>
            </>
          ) : null}
        </dl>

        <DescriptionSection
          key={task.description}
          description={task.description}
          editable={task.canEdit}
          onSave={(description, close) => mutate(() => updateTaskAction(task.id, { description }), close)}
          pending={pending}
        />

        {!task.parent ? <SubtaskSection task={task} mutate={mutate} pending={pending} /> : null}

        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Comentários{task.comments.length > 0 ? ` (${task.comments.length})` : ""}
          </h3>
          <ul className="space-y-4">
            {task.comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <Avatar id={comment.author?.id ?? "removed"} name={comment.author?.name ?? "?"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="font-medium text-slate-800">{comment.author?.name ?? "Conta removida"}</span>
                    <span className="text-slate-400">{formatDateTime(comment.createdAt)}</span>
                    {comment.canDelete ? (
                      <button
                        type="button"
                        className="ml-auto text-xs text-slate-400 hover:text-red-600"
                        onClick={() => {
                          if (window.confirm("Excluir este comentário?")) mutate(() => deleteCommentAction(comment.id));
                        }}
                      >
                        Excluir
                      </button>
                    ) : null}
                  </div>
                  <Markdown className="mt-1">{comment.body}</Markdown>
                </div>
              </li>
            ))}
          </ul>
          {task.canComment ? (
            <CommentForm
              pending={pending}
              onSend={(body, clear) => mutate(() => addCommentAction(task.id, body), clear)}
              hasComments={task.comments.length > 0}
            />
          ) : null}
        </section>

        <details className="group">
          <summary className="text-sm font-semibold text-slate-900 select-none">
            Histórico <span className="font-normal text-slate-400">({task.activity.length})</span>
          </summary>
          <ul className="mt-3 space-y-1.5 text-[13px] text-slate-600">
            {task.activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-1.5">
                <span className="font-medium text-slate-700">{entry.actor?.name ?? "Automação"}</span>
                <span>{describeActivity(entry)}</span>
                <span className="text-slate-400">· {formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </>
  );
}

function TitleField({ title, editable, onSave }: { title: string; editable: boolean; onSave: (title: string) => void }) {
  const [value, setValue] = useState(title);
  if (!editable) return <h2 className="text-xl font-semibold text-slate-900">{title}</h2>;

  function commit() {
    const next = value.trim();
    if (!next) setValue(title);
    else if (next !== title) onSave(next);
  }
  return (
    <textarea
      aria-label="Título"
      rows={1}
      value={value}
      maxLength={200}
      className="-mx-2 block w-[calc(100%+1rem)] resize-none rounded-lg border border-transparent px-2 py-1 text-xl font-semibold text-slate-900 [field-sizing:content] hover:border-slate-200 focus:border-brand-500 focus:outline-none"
      onChange={(event) => setValue(event.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setValue(title);
          event.stopPropagation();
        }
      }}
    />
  );
}

function DescriptionSection({
  description,
  editable,
  onSave,
  pending,
}: {
  description: string;
  editable: boolean;
  onSave: (description: string, close: () => void) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Descrição</h3>
        {editable && !editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-2">
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            autoFocus
            minHeight="10rem"
            placeholder="Contexto, critérios de aceite, links…"
            onSubmit={() => onSave(draft, () => setEditing(false))}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={() => {
                setDraft(description);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" variant="primary" disabled={pending} onClick={() => onSave(draft, () => setEditing(false))}>
              Salvar descrição
            </Button>
          </div>
        </div>
      ) : description.trim() ? (
        <Markdown>{description}</Markdown>
      ) : editable ? (
        <button
          type="button"
          className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-4 text-left text-sm text-slate-400 hover:border-slate-400 hover:text-slate-500"
          onClick={() => setEditing(true)}
        >
          Adicionar descrição. Aceita Markdown e imagens coladas.
        </button>
      ) : (
        <p className="text-sm text-slate-400">Sem descrição.</p>
      )}
    </section>
  );
}

function SubtaskSection({
  task,
  mutate,
  pending,
}: {
  task: TaskDetail;
  mutate: <T>(action: () => Promise<ActionResult<T>>, onSuccess?: (data: T) => void) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const firstOpen = task.statuses.find((status) => status.category === "todo") ?? task.statuses[0];
  const firstDone = task.statuses.find((status) => status.category === "done");

  function toggle(subtask: TaskSummary) {
    const target = subtask.statusCategory === "done" ? firstOpen : firstDone;
    if (!target) return;
    mutate(() => updateTaskAction(subtask.id, { statusId: target.id }));
  }

  function add() {
    if (!title.trim()) return;
    mutate(() => createTaskAction({ projectId: task.projectId, parentId: task.id, title }), () => setTitle(""));
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">
        Subtarefas
        {task.subtasks.length > 0 ? (
          <span className="ml-1.5 font-normal text-slate-400">
            {task.subtasks.filter((subtask) => subtask.statusCategory === "done").length}/{task.subtasks.length}
          </span>
        ) : null}
      </h3>
      {task.subtasks.length > 0 ? (
        <ul className="mb-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {task.subtasks.map((subtask) => {
            const done = subtask.statusCategory === "done";
            return (
              <li key={subtask.id} className="flex items-center gap-2.5 px-3 py-2">
                <button
                  type="button"
                  disabled={!task.canEdit || !firstDone}
                  aria-label={done ? `Reabrir ${subtask.title}` : `Concluir ${subtask.title}`}
                  aria-pressed={done}
                  className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-full border",
                    done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 hover:border-emerald-600",
                  )}
                  onClick={() => toggle(subtask)}
                >
                  {done ? <Check className="size-3" strokeWidth={3} /> : null}
                </button>
                <button
                  type="button"
                  className={cn("min-w-0 flex-1 truncate text-left text-sm hover:text-brand-700", done && "text-slate-400 line-through")}
                  onClick={() => openTask(subtask.ref)}
                >
                  {subtask.title}
                </button>
                {!done ? <span className="shrink-0 text-xs text-slate-400">{subtask.statusName}</span> : null}
                {subtask.dueDate ? (
                  <span className={cn("shrink-0 text-xs", isOverdue(subtask.dueDate, done) ? "font-medium text-red-600" : "text-slate-400")}>
                    {formatDay(subtask.dueDate)}
                  </span>
                ) : null}
                {subtask.assignee ? <Avatar id={subtask.assignee.id} name={subtask.assignee.name} size="sm" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {task.canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            aria-label="Nova subtarefa"
            placeholder="Adicionar subtarefa…"
            className="py-1.5"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending || !title.trim()}>
            Adicionar
          </Button>
        </form>
      ) : task.subtasks.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma subtarefa.</p>
      ) : null}
    </section>
  );
}

function CommentForm({
  onSend,
  pending,
  hasComments,
}: {
  onSend: (body: string, clear: () => void) => void;
  pending: boolean;
  hasComments: boolean;
}) {
  const [body, setBody] = useState("");
  const send = () => {
    if (body.trim()) onSend(body, () => setBody(""));
  };
  return (
    <div className={cn("space-y-2", hasComments && "mt-4")}>
      <MarkdownEditor value={body} onChange={setBody} placeholder="Escreva um comentário…" minHeight="4.5rem" onSubmit={send} />
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-slate-400">Ctrl + Enter envia</span>
        <Button size="sm" variant="primary" disabled={pending || !body.trim()} onClick={send}>
          Comentar
        </Button>
      </div>
    </div>
  );
}

function describeActivity({ type, data }: ActivityInfo) {
  const text = (value: string | number | null | undefined) => (value == null ? "" : String(value));
  switch (type) {
    case "created": {
      const source = text(data.source) as TaskSource;
      return source && source !== "web" && TASK_SOURCE_LABELS[source] ? `criou a tarefa via ${TASK_SOURCE_LABELS[source]}` : "criou a tarefa";
    }
    case "title_changed":
      return `renomeou para “${text(data.to)}”`;
    case "description_changed":
      return "editou a descrição";
    case "priority_changed":
      return `mudou a prioridade para ${PRIORITY_LABELS[text(data.to) as Priority] ?? text(data.to)}`;
    case "due_changed":
      return data.to ? `definiu o prazo para ${formatDay(text(data.to), true)}` : "removeu o prazo";
    case "assigned":
      return data.to ? `atribuiu a ${text(data.to)}` : "removeu o responsável";
    case "status_changed":
      return data.from ? `moveu de ${text(data.from)} para ${text(data.to)}` : `moveu para ${text(data.to)}`;
    default:
      return type;
  }
}
