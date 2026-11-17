"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  createTeamAction,
  deleteTeamAction,
  removeTeamMemberAction,
  setTeamMemberAction,
  updateTeamAction,
} from "@/app/actions/app";
import { TEAM_ROLE_LABELS, TEAM_ROLES, type TeamRole } from "@/lib/constants";
import { DISCIPLINES, TEMPLATES, type Discipline } from "@/lib/templates";
import type { TeamSummary, UserRef } from "@/lib/types";
import { Avatar, Badge, Button, Card, Field, fieldClass, Input, Modal, Select, useAction } from "./ui";

type TeamDraft = { id?: string; name: string; discipline: Discipline; description: string };

export function NewTeamButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Novo time
      </Button>
      {open ? <TeamModal team={{ name: "", discipline: "general", description: "" }} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TeamModal({ team, onClose }: { team: TeamDraft; onClose: () => void }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(team.name);
  const [discipline, setDiscipline] = useState(team.discipline);
  const [description, setDescription] = useState(team.description);
  const [error, setError] = useState("");

  return (
    <Modal title={team.id ? "Editar time" : "Novo time"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          const input = { name, discipline, description };
          const handlers = { onSuccess: onClose, onError: setError };
          if (team.id) {
            const id = team.id;
            run(() => updateTeamAction(id, input), handlers);
          } else {
            run(() => createTeamAction(input), handlers);
          }
        }}
      >
        <Field label="Nome">
          <Input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Disciplina" hint="Define a cor do time e o modelo de fluxo sugerido para os projetos dele.">
          <Select value={discipline} onChange={(event) => setDiscipline(event.target.value as Discipline)}>
            {DISCIPLINES.map((value) => (
              <option key={value} value={value}>
                {TEMPLATES[value].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descrição">
          <textarea className={fieldClass} rows={2} maxLength={300} placeholder="Opcional" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
            {team.id ? "Salvar" : "Criar time"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface TeamCardProps {
  team: TeamSummary;
  /** People who can still be added to this team. Empty when the viewer cannot manage it. */
  candidates: (UserRef & { guest: boolean })[];
  canManage: boolean;
  canDelete: boolean;
}

export function TeamCard({ team, candidates, canManage, canDelete }: TeamCardProps) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<TeamRole>("member");

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">{team.name}</h2>
            <Badge color={team.color}>{TEMPLATES[team.discipline].label}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {team.description ? `${team.description} · ` : ""}
            {team.projectCount === 1 ? "1 projeto" : `${team.projectCount} projetos`}
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" aria-label={`Editar ${team.name}`} title="Editar time" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
            </Button>
            {canDelete ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Excluir ${team.name}`}
                title="Excluir time"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Excluir o time ${team.name}?`)) run(() => deleteTeamAction(team.id));
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {team.members.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {team.members.map((member) => (
            <li key={member.id} className="flex items-center gap-2.5 py-2">
              <Avatar id={member.id} name={member.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{member.name}</p>
                <p className="truncate text-xs text-slate-500">{member.email}</p>
              </div>
              {canManage ? (
                <>
                  <Select
                    aria-label={`Função de ${member.name} no time`}
                    className="w-32 py-1 text-[13px]"
                    value={member.role}
                    disabled={pending}
                    onChange={(event) => run(() => setTeamMemberAction(team.id, member.id, event.target.value))}
                  >
                    {TEAM_ROLES.map((value) => (
                      <option key={value} value={value}>
                        {TEAM_ROLE_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover ${member.name} do time`}
                    title="Remover do time"
                    disabled={pending}
                    onClick={() => run(() => removeTeamMemberAction(team.id, member.id))}
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <span className="text-xs text-slate-500">{TEAM_ROLE_LABELS[member.role]}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Ninguém neste time ainda.</p>
      )}

      {canManage && candidates.length > 0 ? (
        <form
          className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!userId) return;
            run(() => setTeamMemberAction(team.id, userId, role), { onSuccess: () => setUserId("") });
          }}
        >
          <Select aria-label="Pessoa para adicionar" className="min-w-40 flex-1 py-1.5" value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Adicionar pessoa…</option>
            {candidates.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.guest ? " (convidado)" : ""}
              </option>
            ))}
          </Select>
          <Select aria-label="Função no time" className="w-32 py-1.5" value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>
            {TEAM_ROLES.map((value) => (
              <option key={value} value={value}>
                {TEAM_ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" className="h-auto" disabled={pending || !userId}>
            Adicionar
          </Button>
        </form>
      ) : null}

      {editing ? (
        <TeamModal
          team={{ id: team.id, name: team.name, discipline: team.discipline, description: team.description }}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Card>
  );
}
