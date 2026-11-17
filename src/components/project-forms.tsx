"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProjectAction } from "@/app/actions/app";
import { PROJECT_VISIBILITIES, VISIBILITY_LABELS, type ProjectVisibility } from "@/lib/constants";
import { DISCIPLINES, TEMPLATES, type Discipline } from "@/lib/templates";
import { StatusDot } from "./task-bits";
import { Button, Field, fieldClass, Input, Modal, Select, useAction } from "./ui";

interface TeamOption {
  id: string;
  name: string;
  discipline: Discipline;
}

/** Suggests a short key from the project name: "Canal do YouTube" -> "CDY". */
function suggestKey(name: string) {
  const words = name
    .normalize("NFD")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  const key = words.length >= 2 ? words.map((word) => word[0]).join("") : (words[0] ?? "");
  return key.replace(/^[0-9]+/, "").slice(0, 4);
}

export function NewProjectButton({ teams }: { teams: TeamOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Novo projeto
      </Button>
      {open ? <NewProjectModal teams={teams} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NewProjectModal({ teams, onClose }: { teams: TeamOption[]; onClose: () => void }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(teams[0]?.discipline ?? "general");
  const [visibility, setVisibility] = useState<ProjectVisibility>("workspace");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const template = TEMPLATES[discipline];

  return (
    <Modal title="Novo projeto" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          run(() => createProjectAction({ name, key, teamId, discipline, visibility, description }), {
            onSuccess: (project) => router.push(`/projects/${project.key}`),
            onError: setError,
          });
        }}
      >
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Nome">
            <Input
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!keyEdited) setKey(suggestKey(event.target.value));
              }}
            />
          </Field>
          <Field label="Sigla">
            <Input
              required
              maxLength={6}
              placeholder="TECH"
              value={key}
              onChange={(event) => {
                setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                setKeyEdited(true);
              }}
            />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          A sigla identifica as tarefas ({key || "TECH"}-1, {key || "TECH"}-2…) e não pode ser alterada depois.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Time dono">
            <Select
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                const team = teams.find((item) => item.id === event.target.value);
                if (team) setDiscipline(team.discipline);
              }}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quem enxerga">
            <Select value={visibility} onChange={(event) => setVisibility(event.target.value as ProjectVisibility)}>
              {PROJECT_VISIBILITIES.map((value) => (
                <option key={value} value={value}>
                  {VISIBILITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Modelo de fluxo" hint={template.description}>
          <Select value={discipline} onChange={(event) => setDiscipline(event.target.value as Discipline)}>
            {DISCIPLINES.map((value) => (
              <option key={value} value={value}>
                {TEMPLATES[value].label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="-mt-1 flex flex-wrap gap-1.5" aria-label="Etapas do modelo">
          {template.statuses.map((status) => (
            <span key={status.name} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              <StatusDot category={status.category} />
              {status.name}
            </span>
          ))}
        </div>

        <Field label="Descrição">
          <textarea className={fieldClass} rows={2} maxLength={500} placeholder="Opcional" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pending || !name.trim() || key.length < 2}>
            {pending ? "Criando…" : "Criar projeto"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
