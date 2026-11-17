import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="max-w-md text-center">
        <Logo className="mb-6 text-lg text-slate-900" />
        <h1 className="text-xl font-semibold text-slate-900">Página não encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">
          O endereço não existe, ou aponta para algo que você não tem permissão para ver.
        </p>
        <Link href="/" className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand-700 px-3.5 text-sm font-medium text-white hover:bg-brand-800">
          Ir para o painel
        </Link>
      </div>
    </main>
  );
}
