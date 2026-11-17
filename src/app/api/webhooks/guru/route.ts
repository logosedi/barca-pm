import { normalizeGuruEvent, verifyGuruToken } from "@/server/integrations/guru";
import { processIntegrationEvent } from "@/server/services/automations";

export async function POST(request: Request) {
  const token = process.env.GURU_API_TOKEN;
  if (!token) return new Response("Integração com a Guru não configurada.", { status: 503 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("JSON inválido.", { status: 400 });
  }
  if (!verifyGuruToken(payload, token)) return new Response("Token inválido.", { status: 401 });

  const event = normalizeGuruEvent(payload, request.headers.get("x-request-id"));
  // Guru treats any 200 as delivered. Types we do not track are acknowledged and dropped.
  if (!event) return Response.json({ status: "ignored" });

  try {
    return Response.json(await processIntegrationEvent(event));
  } catch (error) {
    console.error("[guru] falha ao processar webhook:", error);
    // Guru retries on 5xx (see the retry table in its webhook documentation).
    return new Response("Erro ao processar o webhook.", { status: 500 });
  }
}
