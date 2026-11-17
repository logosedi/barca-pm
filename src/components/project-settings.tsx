"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addLabelAction,
  addStatusAction,
  archiveProjectAction,
  deleteLabelAction,
  deleteStatusAction,
  shiftStatusAction,
  updateProjectAction,
  updateStatusAction,
} from "@/app/actions/app";
import {
  COLOR_PALETTE,
  PROJECT_VISIBILITIES,
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABELS,
  VISIBILITY_LABELS,
  type ProjectVisibility,
  type StatusCategory,
} from "@/lib/constants";
import type { ProjectDetail, StatusInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusDot } from "./task-bits";
import { toast } from "./toast";
import { Badge, Button, Card, Field, fieldClass, Input, Select, useAction } from "./ui";

export function ProjectSettings({ project, slackConnected }: { project: ProjectDetail; slackConnected: boolean }) {
  return (
    <div className="space-y-6">
      <DetailsForm project={project} slackConnected={slackConnected} />
      <StatusesCard project={project} />
      <LabelsCard project={project} />
      <ArchiveCard project={project} />
    </div>
  );
}

function DetailsForm({ project, slackConnected }: { project: ProjectDetail; slackConnected: boolean }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [visibility, setVisibility] = useState<ProjectVisibility>(project.visibility);
  const [channel, setChannel] = useState(project.slackChannelId ?? "");

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold text-slate-900">Dados do projeto</h2>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => updateProjectAction(project.id, { name, description, visibility, slackChannelId: channel || null }), {
            onSuccess: () => toast.success("Projeto atualizado."),
          });
        }}
      >
        <Field label="Nome">
          <Input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Descrição">
          <textarea className={fieldClass} rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field
          label="Quem enxerga"
          hint="Aberto: todos os membros da empresa. Restrito: só o time dono, gestores e administradores. Convidados só veem projetos dos times em que estão."
        >
          <Select value={visibility} onChange={(event) => setVisibility(event.target.value as ProjectVisibility)}>
            {PROJECT_VISIBILITIES.map((value) => (
              <option key={value} value={value}>
                {VISIBILITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Canal do Slack"
          hint={
            slackConnected
              ? "ID do canal que recebe um aviso quando uma tarefa é criada ou concluída (ex.: C0123ABCD). Convide o app BARCA PM para o canal. Deixe vazio para não avisar."
              : "O Slack ainda não está conectado neste servidor, então nenhum aviso será enviado. Veja docs/integrations/slack.md."
          }
        >
          <Input placeholder="C0123ABCD" value={channel} onChange={(event) => setChannel(event.target.value.trim())} />
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          Salvar
        </Button>
      </form>
    </Card>
  );
}

function StatusesCard({ project }: { project: ProjectDetail }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategory>("in_progress");

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-slate-900">Etapas do fluxo</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        São as colunas do quadro, na ordem abaixo. Cada etapa pertence a uma categoria, e é a categoria que alimenta o
        painel e os relatórios: tarefas em etapas “Concluído” contam como entregues.
      </p>
      <ul className="space-y-2">
        {project.statuses.map((status, index) => (
          <StatusRow key={status.id} status={status} first={index === 0} last={index === project.statuses.length - 1} />
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => addStatusAction(project.id, { name, category }), { onSuccess: () => setName("") });
        }}
      >
        <div className="min-w-40 flex-1">
          <Field label="Nova etapa">
            <Input required maxLength={40} placeholder="Ex.: Em aprovação" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Categoria">
            <Select value={category} onChange={(event) => setCategory(event.target.value as StatusCategory)}>
              {STATUS_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_CATEGORY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={pending || !name.trim()}>
          Adicionar etapa
        </Button>
      </form>
    </Card>
  );
}

function StatusRow({ status, first, last }: { status: StatusInfo; first: boolean; last: boolean }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(status.name);

  const save = (next: { name: string; category: string }) => {
    if (!next.name.trim()) {
      setName(status.name);
      return;
    }
    if (next.name.trim() === status.name && next.category === status.category) return;
    run(() => updateStatusAction(status.id, next), { onError: (message) => { toast.error(message); setName(status.name); } });
  };

  return (
    <li className={cn("flex items-center gap-2", pending && "opacity-60")}>
      <StatusDot category={status.category} />
      <Input
        aria-label="Nome da etapa"
        className="flex-1 py-1.5"
        maxLength={40}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => save({ name, category: status.category })}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <Select
        aria-label="Categoria"
        className="w-40 py-1.5"
        value={status.category}
        onChange={(event) => save({ name, category: event.target.value })}
      >
        {STATUS_CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {STATUS_CATEGORY_LABELS[value]}
          </option>
        ))}
      </Select>
      <Button size="icon" variant="ghost" disabled={first || pending} aria-label="Mover para antes" title="Mover para antes" onClick={() => run(() => shiftStatusAction(status.id, "left"))}>
        <ArrowUp className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" disabled={last || pending} aria-label="Mover para depois" title="Mover para depois" onClick={() => run(() => shiftStatusAction(status.id, "right"))}>
        <ArrowDown className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        disabled={pending}
        aria-label={`Excluir etapa ${status.name}`}
        title="Excluir etapa"
        onClick={() => run(() => deleteStatusAction(status.id))}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

function LabelsCard({ project }: { project: ProjectDetail }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLOR_PALETTE[0]);

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold text-slate-900">Etiquetas</h2>
      {project.labels.length > 0 ? (
        <ul className="mb-4 flex flex-wrap gap-2">
          {project.labels.map((label) => (
            <li key={label.id} className="flex items-center gap-1">
              <Badge color={label.color}>{label.name}</Badge>
              <button
                type="button"
                className="rounded p-0.5 text-slate-400 hover:text-red-600"
                aria-label={`Excluir etiqueta ${label.name}`}
                title="Excluir etiqueta"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Excluir a etiqueta ${label.name}? Ela sai de todas as tarefas.`)) run(() => deleteLabelAction(label.id));
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-slate-500">Este projeto ainda não tem etiquetas.</p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => addLabelAction(project.id, { name, color }), { onSuccess: () => setName("") });
        }}
      >
        <div className="min-w-40 flex-1">
          <Field label="Nova etiqueta">
            <Input required maxLength={30} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </div>
        <div role="radiogroup" aria-label="Cor" className="flex h-9 items-center gap-1.5">
          {COLOR_PALETTE.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={color === value}
              aria-label={`Cor ${value}`}
              className={cn("size-5 rounded-full", color === value && "ring-2 ring-slate-900 ring-offset-2")}
              style={{ backgroundColor: value }}
              onClick={() => setColor(value)}
            />
          ))}
        </div>
        <Button type="submit" disabled={pending || !name.trim()}>
          Adicionar etiqueta
        </Button>
      </form>
    </Card>
  );
}

function ArchiveCard({ project }: { project: ProjectDetail }) {
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <Card className="border-red-200 p-5">
      <h2 className="font-semibold text-slate-900">Arquivar projeto</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        O projeto some das listas, do painel e dos relatórios. As tarefas não são apagadas, mas hoje não há tela para
        desarquivar: isso exige uma alteração direta no banco de dados.
      </p>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Arquivar o projeto ${project.name}?`)) return;
          run(() => archiveProjectAction(project.id), { onSuccess: () => router.push("/projects") });
        }}
      >
        Arquivar projeto
      </Button>
    </Card>
  );
}
