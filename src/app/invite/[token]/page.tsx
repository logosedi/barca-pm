import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthCard, AuthCardSkeleton } from "@/components/auth-card";
import { InviteForm } from "@/components/auth-forms";
import { findInvite } from "@/server/services/users";

export const metadata: Metadata = { title: "Convite" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const invite = await findInvite(token);
  if (!invite) {
    return (
      <AuthCard title="Convite inválido" description="Este link expirou ou já foi usado.">
        <p className="text-sm text-slate-600">
          Peça um novo convite a quem administra o BARCA PM. Se você já ativou a conta,{" "}
          <Link href="/login" className="font-medium text-brand-700 underline">
            entre por aqui
          </Link>
          .
        </p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={`Olá, ${invite.name}`} description={`Você foi convidado para o BARCA PM como ${invite.email}.`}>
      <InviteForm token={token} />
    </AuthCard>
  );
}
