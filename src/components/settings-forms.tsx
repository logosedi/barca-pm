"use client";

import { useState } from "react";
import { changePasswordAction, createApiTokenAction, revokeApiTokenAction, updateProfileAction } from "@/app/actions/app";
import { TOKEN_SCOPE_LABELS, TOKEN_SCOPES, type TokenScope } from "@/lib/constants";
import type { ApiTokenInfo } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { CopyField } from "./copy-field";
import { toast } from "./toast";
import { Badge, Button, Field, Input, Select, useAction } from "./ui";

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

interface ProfileFormProps {
  profile: { name: string; email: string; notifySlack: boolean };
  slackConfigured: boolean;
  slackLinked: boolean;
}

export function ProfileForm({ profile, slackConfigured, slackLinked }: ProfileFormProps) {
  const { pending, run } = useAction();
  const [name, setName] = useState(profile.name);
  const [notifySlack, setNotifySlack] = useState(profile.notifySlack);
  const [error, setError] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        run(() => updateProfileAction({ name, notifySlack }), { onSuccess: () => toast.success("Perfil atualizado."), onError: setError });
      }}
    >
      <Field label="Nome">
        <Input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="E-mail" hint="O e-mail identifica a conta e casa você com o seu usuário do Slack. Só um administrador pode trocá-lo, direto no banco.">
        <Input readOnly disabled value={profile.email} />
      </Field>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-brand-700" checked={notifySlack} onChange={(event) => setNotifySlack(event.target.checked)} />
        <span>
          <span className="font-medium text-slate-800">Receber notificações por mensagem direta no Slack</span>
          <span className="mt-0.5 block text-slate-500">
            {!slackConfigured
              ? "O Slack ainda não está configurado neste servidor; por enquanto os avisos aparecem só aqui, em Notificações."
              : slackLinked
                ? "Sua conta do Slack já foi encontrada pelo e-mail."
                : "Sua conta do Slack será procurada pelo e-mail no primeiro aviso. Se o e-mail do Slack for outro, nada chega."}
          </span>
        </span>
      </label>
      <FormError message={error} />
      <Button type="submit" variant="primary" disabled={pending}>
        Salvar perfil
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const { pending, run } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (next !== confirmation) {
          setError("As duas senhas novas não são iguais.");
          return;
        }
        setError("");
        run(() => changePasswordAction(current, next), {
          onSuccess: () => {
            setCurrent("");
            setNext("");
            setConfirmation("");
            toast.success("Senha alterada.");
          },
          onError: setError,
        });
      }}
    >
      <Field label="Senha atual">
        <Input required type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nova senha" hint="Pelo menos 10 caracteres.">
          <Input required type="password" autoComplete="new-password" minLength={10} value={next} onChange={(event) => setNext(event.target.value)} />
        </Field>
        <Field label="Repita a nova senha">
          <Input required type="password" autoComplete="new-password" minLength={10} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </Field>
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        Alterar senha
      </Button>
    </form>
  );
}

export function ApiTokens({ tokens, endpoint }: { tokens: ApiTokenInfo[]; endpoint: string }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<TokenScope>("read");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  const snippet = JSON.stringify(
    { mcpServers: { "barca-pm": { url: endpoint, headers: { Authorization: `Bearer ${created ?? "SEU_TOKEN"}` } } } },
    null,
    2,
  );

  return (
    <div className="space-y-5">
      {created ? (
        <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            Token criado. Copie agora: ele não será mostrado de novo. Se perder, revogue e crie outro.
          </p>
          <CopyField label="Token" value={created} />
          <Button size="sm" onClick={() => setCreated(null)}>
            Já copiei
          </Button>
        </div>
      ) : null}

      {tokens.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {token.name} <Badge>{TOKEN_SCOPE_LABELS[token.scope]}</Badge>
                </p>
                <p className="text-xs text-slate-500">
                  <code>{token.prefix}…</code> · criado em {formatDateTime(token.createdAt)} ·{" "}
                  {token.lastUsedAt ? `último uso em ${formatDateTime(token.lastUsedAt)}` : "nunca usado"}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Revogar o token ${token.name}? Quem o usa perde o acesso na hora.`)) run(() => revokeApiTokenAction(token.id));
                }}
              >
                Revogar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Você ainda não tem tokens.</p>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          run(() => createApiTokenAction({ name, scope }), {
            onSuccess: (token) => {
              setCreated(token);
              setName("");
            },
            onError: setError,
          });
        }}
      >
        <div className="min-w-48 flex-1">
          <Field label="Nome do token">
            <Input required maxLength={60} placeholder="Ex.: Claude no meu notebook" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Permissão">
            <Select value={scope} onChange={(event) => setScope(event.target.value as TokenScope)}>
              {TOKEN_SCOPES.map((value) => (
                <option key={value} value={value}>
                  {TOKEN_SCOPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
          Criar token
        </Button>
      </form>
      <FormError message={error} />
      <p className="text-xs text-slate-500">
        “Somente leitura” basta para relatórios. “Leitura e escrita” também deixa o assistente criar tarefas, atualizar e
        comentar em seu nome, dentro do que o seu papel permite.
      </p>

      <div className="space-y-3 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Como conectar um assistente</h3>
        <p className="text-sm text-slate-500">
          Clientes MCP que aceitam servidores HTTP (Claude Code, Cursor e outros) usam o endereço abaixo, com o token no
          cabeçalho <code>Authorization</code>. O formato exato do arquivo varia por cliente; veja docs/integrations/mcp.md.
        </p>
        <CopyField label="Endpoint" value={endpoint} />
        <CopyField label="Exemplo de configuração (mcp.json)" value={snippet} multiline />
      </div>
    </div>
  );
}
