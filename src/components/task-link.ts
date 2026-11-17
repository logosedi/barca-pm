/**
 * Opens (or, with null, closes) the task side panel by changing the `task` query
 * parameter. It uses the History API directly: Next keeps `useSearchParams` in sync,
 * and no server round trip is needed to re-render the page underneath.
 */
export function openTask(ref: string | null) {
  const url = new URL(window.location.href);
  if (ref) url.searchParams.set("task", ref);
  else url.searchParams.delete("task");
  window.history.pushState(null, "", url);
}
