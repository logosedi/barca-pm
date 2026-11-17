"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

// Minimal toast store: a module-level list that components subscribe to. Enough for
// "that action failed" and "copied" messages without a dependency.

interface ToastItem {
  id: number;
  kind: "error" | "success";
  message: string;
}

const EMPTY: ToastItem[] = [];
let items: ToastItem[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function push(kind: ToastItem["kind"], message: string) {
  const id = nextId++;
  items = [...items, { id, kind, message }];
  listeners.forEach((listener) => listener());
  setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    listeners.forEach((listener) => listener());
  }, 6000);
}

export const toast = {
  error: (message: string) => push("error", message),
  success: (message: string) => push("success", message),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Toaster() {
  const current = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {current.map((item) => (
        <div
          key={item.id}
          role={item.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg",
            item.kind === "error" ? "bg-red-600" : "bg-slate-800",
          )}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
