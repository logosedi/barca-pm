import { verifySlackSignature } from "@/server/integrations/slack/api";
import { handleInteraction } from "@/server/integrations/slack/handlers";

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
    // Interactions arrive form-encoded, with the JSON document in the `payload` field.
    const payload = JSON.parse(new URLSearchParams(rawBody).get("payload") ?? "{}");
    return Response.json(await handleInteraction(payload));
  } catch (error) {
    console.error("[slack] falha na interação:", error);
    return new Response("Erro ao processar a interação.", { status: 500 });
  }
}
