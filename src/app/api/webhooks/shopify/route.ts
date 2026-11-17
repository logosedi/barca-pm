import { normalizeShopifyEvent, verifyShopifyHmac } from "@/server/integrations/shopify";
import { processIntegrationEvent } from "@/server/services/automations";

export async function POST(request: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return new Response("Integração com a Shopify não configurada.", { status: 503 });

  const rawBody = await request.text();
  if (!verifyShopifyHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"), secret)) {
    return new Response("Assinatura inválida.", { status: 401 });
  }
  const topic = request.headers.get("x-shopify-topic");
  // Event id is the same across retries of one event; webhook id is the fallback.
  const deliveryId = request.headers.get("x-shopify-event-id") ?? request.headers.get("x-shopify-webhook-id");
  if (!topic || !deliveryId) return new Response("Cabeçalhos da Shopify ausentes.", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("JSON inválido.", { status: 400 });
  }

  try {
    const outcome = await processIntegrationEvent(
      normalizeShopifyEvent({
        topic,
        shopDomain: request.headers.get("x-shopify-shop-domain") ?? "",
        deliveryId: `${topic}:${deliveryId}`,
        payload,
      }),
    );
    return Response.json(outcome);
  } catch (error) {
    console.error("[shopify] falha ao processar webhook:", error);
    // A 5xx makes Shopify retry the delivery later.
    return new Response("Erro ao processar o webhook.", { status: 500 });
  }
}
