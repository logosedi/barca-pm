"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { allowAttempt, clearAttempts } from "@/server/auth/rate-limit";
import { endSession, startSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { seedDemoData } from "@/server/seed/demo";
import { acceptInvite, authenticate, setupWorkspace } from "@/server/services/users";

export interface FormState {
  error?: string;
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function failure(error: unknown): FormState {
  unstable_rethrow(error);
  if (error instanceof AppError) return { error: error.message };
  console.error("[auth] erro inesperado:", error);
  return { error: "Algo deu errado do nosso lado. Tente novamente." };
}

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email").trim().toLowerCase();
  const address = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${address}:${email}`;
  if (!allowAttempt(key)) return { error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." };
  try {
    const userId = await authenticate(email, field(formData, "password"));
    // One message for every failure, so the form does not reveal which e-mails exist.
    if (!userId) return { error: "E-mail ou senha incorretos." };
    clearAttempts(key);
    await startSession(userId);
  } catch (error) {
    return failure(error);
  }
  redirect("/");
}

export async function setupAction(_previous: FormState, formData: FormData): Promise<FormState> {
  try {
    const userId = await setupWorkspace({
      name: field(formData, "name"),
      email: field(formData, "email"),
      password: field(formData, "password"),
    });
    if (formData.get("demo") === "on") await seedDemoData(userId);
    await startSession(userId);
  } catch (error) {
    return failure(error);
  }
  redirect("/");
}

export async function acceptInviteAction(_previous: FormState, formData: FormData): Promise<FormState> {
  try {
    if (field(formData, "password") !== field(formData, "confirmation")) return { error: "As senhas não são iguais." };
    const userId = await acceptInvite(field(formData, "token"), field(formData, "password"));
    await startSession(userId);
  } catch (error) {
    return failure(error);
  }
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
