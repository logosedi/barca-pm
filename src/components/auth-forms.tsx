"use client";

import { useActionState } from "react";
import { acceptInviteAction, loginAction, setupAction, type FormState } from "@/app/actions/auth";
import { Button, Field, Input } from "./ui";

const INITIAL: FormState = {};

function FormError({ state }: { state: FormState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL);
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormError state={state} />
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, INITIAL);
  return (
    <form action={action} className="space-y-4">
      <Field label="Seu nome">
        <Input name="name" autoComplete="name" required autoFocus />
      </Field>
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Senha" hint="Pelo menos 10 caracteres.">
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <input type="checkbox" name="demo" defaultChecked className="mt-0.5 size-4 accent-brand-700" />
        <span>
          <span className="font-medium text-slate-800">Carregar dados de demonstração</span>
          <span className="mt-0.5 block text-slate-500">
            Cria times, projetos, tarefas e contas de exemplo em cada papel, para avaliar a ferramenta. Não use em
            produção: as contas de exemplo têm uma senha conhecida.
          </span>
        </span>
      </label>
      <FormError state={state} />
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Preparando o workspace…" : "Criar conta de administrador"}
      </Button>
    </form>
  );
}

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, INITIAL);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Crie uma senha" hint="Pelo menos 10 caracteres.">
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />
      </Field>
      <Field label="Repita a senha">
        <Input name="confirmation" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <FormError state={state} />
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Ativando…" : "Ativar conta e entrar"}
      </Button>
    </form>
  );
}
