import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-brand-700" />
        <path
          d="M16 6v13M16 8l7 9h-7M16 11l-5 6h5"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7 21h18l-2.5 4h-13z" fill="#fff" />
      </svg>
      BARCA PM
    </span>
  );
}
