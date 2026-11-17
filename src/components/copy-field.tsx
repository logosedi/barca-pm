"use client";

import { Copy } from "lucide-react";
import { toast } from "./toast";

/** Read-only value (a URL, a token, a config snippet) with a copy button. */
export function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-start gap-2">
        {multiline ? (
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-800">
            {value}
          </pre>
        ) : (
          <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">{value}</code>
        )}
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
          aria-label={`Copiar ${label}`}
          title="Copiar"
          onClick={() =>
            navigator.clipboard.writeText(value).then(
              () => toast.success("Copiado."),
              () => toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."),
            )
          }
        >
          <Copy className="size-4" />
        </button>
      </div>
    </div>
  );
}
