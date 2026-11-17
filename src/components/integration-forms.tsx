"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createRuleAction, deleteRuleAction, setRuleEnabledAction } from "@/app/actions/app";
import { INTEGRATION_SOURCES, PRIORITIES, PRIORITY_LABELS, type IntegrationSource, type Priority } from "@/lib/constants";
import { SOURCE_LABELS, TEMPLATE_VARIABLES, topicLabel } from "@/lib/integration-topics";
import type { AutomationRuleInfo, UserRef } from "@/lib/types";
import { Badge, Button, Field, fieldClass, Input, Modal, Select, useAction } from "./ui";

interface RuleFormOptions {
  topics: Record<IntegrationSource, string[]>;
  projects: { id: string; name: string }[];
  people: UserRef[];
}

export function RuleList({ rules, options }: { rules: AutomationRuleInfo[]; options: RuleFormOptions }) {
  const { pending, run } = useAction();
  const [creating, setCreating] = useState(false);

  return (
    <>
      {rules.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhuma regra ainda. Exemplo: quando a Guru avisar um chargeback, criar uma tarefa urgente no projeto de Suporte.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{rule.name}</p>
                <p className="text-sm text-slate-500">
                  Quando <Badge>{SOURCE_LABELS[rule.source]}</Badge> enviar “{topicLabel(rule.source, rule.topic)}”, criar em{" "}
                  <span className="font-medium text-slate-700">{rule.project.name}</span> a tarefa “{rule.titleTemplate}”
                  {rule.assignee ? ` para ${rule.assignee.name}` : ""}.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700"
                  checked={rule.enabled}
                  disabled={pending}
                  onChange={(event) => run(() => setRuleEnabledAction(rule.id, event.target.checked))}
                />
                Ativa
              </label>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Excluir regra ${rule.name}`}
                title="Excluir regra"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Excluir a regra ${rule.name}?`)) run(() => deleteRuleAction(rule.id));
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        {options.projects.length === 0 ? (
          <p className="text-sm text-slate-500">Crie um projeto antes de adicionar regras.</p>
        ) : (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nova regra
          </Button>
        )}
      </div>
      {creating ? <RuleModal options={options} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function RuleModal({ options, onClose }: { options: RuleFormOptions; onClose: () => void }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [source, setSource] = useState<IntegrationSource>("guru");
  const [topic, setTopic] = useState(options.topics.guru[0] ?? "");
  const [projectId, setProjectId] = useState(options.projects[0]?.id ?? "");
  const [titleTemplate, setTitleTemplate] = useState("");
  const [descriptionTemplate, setDescriptionTemplate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState("");

  return (
    <Modal title="Nova regra de automação" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          run(
            () =>
              createRuleAction({
                name,
                source,
                topic,
                projectId,
                titleTemplate,
                descriptionTemplate,
                priority,
                assigneeId: assigneeId || null,
              }),
            { onSuccess: onClose, onError: setError },
          );
        }}
      >
        <Field label="Nome da regra">
          <Input autoFocus required maxLength={80} placeholder="Ex.: Chargeback vira tarefa urgente" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="Plataforma">
            <Select
              value={source}
              onChange={(event) => {
                const next = event.target.value as IntegrationSource;
                setSource(next);
                setTopic(options.topics[next][0] ?? "");
              }}
            >
              {INTEGRATION_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {SOURCE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quando chegar o evento">
            <Select value={topic} onChange={(event) => setTopic(event.target.value)}>
              {options.topics[source].map((value) => (
                <option key={value} value={value}>
                  {topicLabel(source, value)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Criar a tarefa no projeto">
          <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Título da tarefa">
          <Input
            required
            maxLength={200}
            placeholder="Chargeback de {{customer_name}} ({{reference}})"
            value={titleTemplate}
            onChange={(event) => setTitleTemplate(event.target.value)}
          />
        </Field>
        <Field label="Descrição (Markdown)">
          <textarea
            className={fieldClass}
            rows={4}
            maxLength={5000}
            placeholder={"Cliente: {{customer_name}} ({{customer_email}})\nProduto: {{product_name}}"}
            value={descriptionTemplate}
            onChange={(event) => setDescriptionTemplate(event.target.value)}
          />
        </Field>
        <details className="text-sm text-slate-600">
          <summary className="font-medium text-slate-700">Variáveis disponíveis</summary>
          <ul className="mt-2 space-y-1">
            {TEMPLATE_VARIABLES.map((variable) => (
              <li key={variable.name}>
                <code className="rounded bg-slate-100 px-1 text-xs">{`{{${variable.name}}}`}</code> {variable.description}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Uma variável que o evento não traz fica em branco.</p>
        </details>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prioridade">
            <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">Sem responsável</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Salvando…" : "Criar regra"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
