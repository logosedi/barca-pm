/** Placeholder shown while a page's data loads. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl p-6" aria-busy="true">
      <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="mt-4 h-72 animate-pulse rounded-xl bg-slate-200/70" />
    </div>
  );
}
