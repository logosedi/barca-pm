"use client";

import { Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { inviteMemberAction, renewInviteAction, setMemberActiveAction, updateMemberRoleAction } from "@/app/actions/app";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/constants";
import type { MemberSummary } from "@/lib/types";
import { toast } from "./toast";
import { Avatar, Badge, Button, Field, Input, Modal, Select, useAction } from "./ui";

function copy(text: string, message: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(message),
    () => toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."),
  );
}

/** Shows an invite link. There is no e-mail delivery: the admin sends it to the person. */
function InviteLink({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <Modal title="Link de convite" onClose={onClose}>
      <p className="text-sm text-slate-600">
        Envie este link para {name}. Ele vale por 7 dias e serve para a pessoa criar a própria senha. O BARCA PM ainda
        não envia e-mails, então o convite só chega se você o enviar.
      </p>
      <div className="mt-4 flex gap-2">
        <Input readOnly value={url} onFocus={(event) => event.currentTarget.select()} aria-label="Link de convite" />
        <Button variant="primary" onClick={() => copy(url, "Link copiado.")}>
          <Copy className="size-4" />
          Copiar
        </Button>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Fechar</Button>
      </div>
    </Modal>
  );
}

export function InviteButton() {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ url: string; name: string } | null>(null);

  function reset() {
    setOpen(false);
    setName("");
    setEmail("");
    setRole("member");
    setError("");
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Convidar pessoa
      </Button>
      {open ? (
        <Modal title="Convidar pessoa" onClose={reset}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              run(() => inviteMemberAction({ name, email, role }), {
                onSuccess: (url) => {
                  setLink({ url, name });
                  reset();
                },
                onError: setError,
              });
            }}
          >
            <Field label="Nome">
              <Input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="E-mail" hint="Use o mesmo e-mail do Slack para a pessoa receber notificações e criar tarefas por lá.">
              <Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Papel" hint={ROLE_DESCRIPTIONS[role]}>
              <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                {ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            {error ? (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button onClick={reset}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Gerando…" : "Gerar convite"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
      {link ? <InviteLink url={link.url} name={link.name} onClose={() => setLink(null)} /> : null}
    </>
  );
}

export function MemberRow({ member, canManage, isSelf }: { member: MemberSummary; canManage: boolean; isSelf: boolean }) {
  const { pending, run } = useAction();
  const [link, setLink] = useState<string | null>(null);

  return (
    <tr className={member.isActive ? undefined : "text-slate-400"}>
      <td className="py-2.5 pr-3 pl-4">
        <div className="flex items-center gap-2.5">
          <Avatar id={member.id} name={member.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {member.name}
              {isSelf ? <span className="ml-1.5 font-normal text-slate-400">(você)</span> : null}
            </p>
            <p className="truncate text-xs text-slate-500">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        {canManage && !isSelf ? (
          <Select
            aria-label={`Papel de ${member.name}`}
            className="w-40 py-1 text-[13px]"
            value={member.role}
            disabled={pending}
            onChange={(event) => run(() => updateMemberRoleAction(member.id, event.target.value))}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-sm text-slate-700">{ROLE_LABELS[member.role]}</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {member.teams.length === 0 ? <span className="text-xs text-slate-400">Sem time</span> : null}
          {member.teams.map((team) => (
            <Badge key={team.id}>
              {team.name}
              {team.role === "lead" ? " · líder" : ""}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5">
        {!member.isActive ? (
          <Badge>Desativada</Badge>
        ) : member.pendingInvite ? (
          <Badge color="#ca8a04">Convite pendente</Badge>
        ) : (
          <Badge color="#22a06b">Ativa</Badge>
        )}
      </td>
      {canManage ? (
        <td className="py-2.5 pr-4 pl-3 text-right whitespace-nowrap">
          {member.pendingInvite && member.isActive ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => renewInviteAction(member.id), { onSuccess: setLink })}>
              Novo link
            </Button>
          ) : null}
          {!isSelf ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (member.isActive && !window.confirm(`Desativar ${member.name}? A pessoa perde o acesso na hora; as tarefas dela continuam.`)) return;
                run(() => setMemberActiveAction(member.id, !member.isActive));
              }}
            >
              {member.isActive ? "Desativar" : "Reativar"}
            </Button>
          ) : null}
          {link ? <InviteLink url={link} name={member.name} onClose={() => setLink(null)} /> : null}
        </td>
      ) : null}
    </tr>
  );
}
