import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, AuthCardSkeleton } from "@/components/auth-card";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";
import { countUsers } from "@/server/services/users";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <Login />
    </Suspense>
  );
}

async function Login() {
  // Reads the session cookie first, so nothing below runs while prerendering the shell.
  if (await getCurrentUser()) redirect("/");
  if ((await countUsers()) === 0) redirect("/setup");
  return (
    <AuthCard title="Entrar" description="Use o e-mail e a senha da sua conta.">
      <LoginForm />
    </AuthCard>
  );
}
