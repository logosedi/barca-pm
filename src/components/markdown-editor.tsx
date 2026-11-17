"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { toast } from "./toast";

interface MarkdownEditorProps {
  value: string;
  /** A state setter: uploads finish asynchronously and patch the latest text. */
  onChange: Dispatch<SetStateAction<string>>;
  placeholder?: string;
  autoFocus?: boolean;
  /** Called on Ctrl/Cmd + Enter. */
  onSubmit?: () => void;
  minHeight?: string;
}

let uploadCounter = 0;

async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body });
  const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error ?? "Não foi possível enviar a imagem.");
  return result.url;
}

/**
 * Markdown textarea with a preview tab. Images can be pasted from the clipboard,
 * dropped onto the field or picked from disk: each one is uploaded and replaced by
 * its Markdown reference at the cursor position.
 */
export function MarkdownEditor({ value, onChange, placeholder, autoFocus, onSubmit, minHeight = "7rem" }: MarkdownEditorProps) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function insertImages(files: Iterable<File>) {
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return false;
    const element = textarea.current;
    let start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;

    images.forEach((file, index) => {
      const name = (file.name || "imagem").replace(/[[\]()]/g, "");
      // A unique placeholder marks where the image goes while it uploads.
      const placeholderText = `![Enviando ${name}… #${++uploadCounter}]()`;
      const insertAt = start;
      const replaceUntil = index === 0 ? end : start;
      onChange((current) => `${current.slice(0, insertAt)}${placeholderText}\n${current.slice(replaceUntil)}`);
      start += placeholderText.length + 1;

      setUploading((count) => count + 1);
      uploadImage(file)
        .then((url) => onChange((current) => current.replace(placeholderText, `![${name}](${url})`)))
        .catch((error: Error) => {
          onChange((current) => current.replace(`${placeholderText}\n`, "").replace(placeholderText, ""));
          toast.error(error.message);
        })
        .finally(() => setUploading((count) => count - 1));
    });
    return true;
  }

  const tabClass = (active: boolean) =>
    cn("rounded-md px-2.5 py-1 text-[13px] font-medium", active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700");

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/25">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="flex gap-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "write"} className={tabClass(tab === "write")} onClick={() => setTab("write")}>
            Escrever
          </button>
          <button type="button" role="tab" aria-selected={tab === "preview"} className={tabClass(tab === "preview")} onClick={() => setTab("preview")}>
            Visualizar
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {uploading > 0 ? <span>Enviando imagem…</span> : <span className="hidden sm:inline">Markdown. Cole ou arraste imagens.</span>}
          <button
            type="button"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            title="Anexar imagem"
            aria-label="Anexar imagem"
            onClick={() => picker.current?.click()}
          >
            <ImagePlus className="size-4" />
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(event) => {
              insertImages(event.target.files ?? []);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      {tab === "write" ? (
        <textarea
          ref={textarea}
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          style={{ minHeight }}
          className="block w-full resize-y px-3 py-2 text-sm leading-relaxed [field-sizing:content] placeholder:text-slate-400 focus:outline-none"
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            if (insertImages(event.clipboardData.files)) event.preventDefault();
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            if (insertImages(event.dataTransfer.files)) event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && onSubmit) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
      ) : (
        <div className="px-3 py-2" style={{ minHeight }}>
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-slate-400">Nada para visualizar ainda.</p>}
        </div>
      )}
    </div>
  );
}
