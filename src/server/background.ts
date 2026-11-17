import { after } from "next/server";

// Side effects that must not delay or fail the request that triggered them (Slack
// messages, mostly). Inside a request they run after the response is sent, through
// Next's `after`; outside one (scripts, tests) they start immediately.
//
// This is in-process and best effort: work in flight is lost if the server dies.
// docs/ROADMAP.md covers the move to a durable queue.

const pending = new Set<Promise<void>>();

export function runInBackground(label: string, work: () => Promise<void>) {
  const run = () => {
    const promise = work()
      .catch((error) => console.error(`[background] ${label} falhou:`, error))
      .finally(() => pending.delete(promise));
    pending.add(promise);
    return promise;
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Waits for everything queued so far. Used by scripts and tests. */
export async function flushBackground() {
  while (pending.size > 0) await Promise.all(pending);
}
