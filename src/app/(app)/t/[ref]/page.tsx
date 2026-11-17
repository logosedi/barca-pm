import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { parseTaskRef } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";

// Short permanent link to a task (the one sent to Slack and returned by the MCP
// tools). It opens the task's project with the task panel on top.

export default function TaskLinkPage({ params }: PageProps<"/t/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TaskLink params={params} />
    </Suspense>
  );
}

async function TaskLink({ params }: Pick<PageProps<"/t/[ref]">, "params">): Promise<never> {
  await requireUser();
  const { ref } = await params;
  const parsed = parseTaskRef(ref);
  if (!parsed) notFound();
  redirect(`/projects/${parsed.key}?task=${parsed.key}-${parsed.number}`);
}
