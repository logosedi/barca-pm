import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthCard, AuthCardSkeleton } from "@/components/auth-card";
import { SetupForm } from "@/components/auth-forms";
import { countUsers } from "@/server/services/users";

export const metadata: Metadata = { title: "Configuração inicial" };

export default function SetupPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  await connection();
  // The setup screen only exists while the workspace has no users.
  if ((await countUsers()) > 0) redirect("/login");
  return (
    <AuthCard
      title="Bem-vindo ao BARCA PM"
      description="Este é o primeiro acesso. Crie a conta de quem vai administrar o workspace."
    >
      <SetupForm />
    </AuthCard>
  );
}
