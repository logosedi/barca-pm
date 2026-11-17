import { verifySlackSignature } from "@/server/integrations/slack/api";
import { handleSlashCommand } from "@/server/integrations/slack/handlers";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifySlackSignature({
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    rawBody,
  });
  if (!verified) return new Response("Assinatura inválida.", { status: 401 });

  try {
    return Response.json(await handleSlashCommand(new URLSearchParams(rawBody)));
  } catch (error) {
    console.error("[slack] falha no comando:", error);
    // Slack shows the body of a 200 answer to the user; any other status is a generic error.
    return Response.json({ response_type: "ephemeral", text: "Não consegui concluir o comando. Tente de novo em instantes." });
  }
}
