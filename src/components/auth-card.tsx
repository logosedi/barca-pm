import type { ReactNode } from "react";
import { Logo } from "./logo";

export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Logo className="mb-6 text-lg text-slate-900" />
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {description ? <p className="mt-1 mb-5 text-sm text-slate-500">{description}</p> : <div className="mb-5" />}
          {children}
        </div>
      </div>
    </main>
  );
}

export function AuthCardSkeleton() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Logo className="mb-6 text-lg text-slate-900" />
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    </main>
  );
}
