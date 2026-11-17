import { createHmac } from "node:crypto";
import { safeEqual } from "../auth/crypto";
import type { IncomingEvent } from "../services/automations";

// Shopify adapter: verifies webhook signatures and turns each payload into the
// neutral IncomingEvent that the automation engine understands.

/** `X-Shopify-Hmac-Sha256` is the base64 HMAC-SHA256 of the raw body. */
export function verifyShopifyHmac(rawBody: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return safeEqual(expected, header);
}

type Json = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");
const object = (value: unknown): Json => (value && typeof value === "object" ? (value as Json) : {});
const amountOf = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function customerName(customer: Json) {
  return [text(customer.first_name), text(customer.last_name)].filter(Boolean).join(" ");
}

export function normalizeShopifyEvent(input: {
  topic: string;
  shopDomain: string;
  deliveryId: string;
  payload: unknown;
}): IncomingEvent {
  const { topic, shopDomain } = input;
  const body = object(input.payload);
  const customer = object(body.customer);
  const [resource] = topic.split("/");
  const admin = (path: string) => (shopDomain ? `https://${shopDomain}/admin/${path}` : undefined);

  const variables: Record<string, string> = {
    customer_name: customerName(customer),
    customer_email: text(body.email) || text(customer.email),
    product_name: "",
    amount: "",
    reference: text(body.name) || text(body.id),
    status: text(body.status) || text(body.financial_status),
    reason: text(body.cancel_reason) || text(body.error_message),
  };
  let amount: number | undefined;
  let externalRef: IncomingEvent["externalRef"];
  let summary = topic;

  if (resource === "orders") {
    const items = Array.isArray(body.line_items) ? (body.line_items as Json[]) : [];
    variables.product_name = items.map((item) => text(item.title)).filter(Boolean).join(", ");
    amount = amountOf(body.total_price);
    externalRef = { system: "shopify", label: `Pedido ${variables.reference}`, url: admin(`orders/${text(body.id)}`) };
    summary = `Pedido ${variables.reference}`;
  } else if (resource === "refunds") {
    const transactions = Array.isArray(body.transactions) ? (body.transactions as Json[]) : [];
    amount = transactions.reduce((sum, item) => sum + (amountOf(item.amount) ?? 0), 0);
    variables.reference = text(body.order_id);
    variables.reason = text(body.note);
    externalRef = { system: "shopify", label: `Reembolso do pedido ${variables.reference}`, url: admin(`orders/${variables.reference}`) };
    summary = `Reembolso do pedido ${variables.reference}`;
  } else if (resource === "products") {
    variables.product_name = text(body.title);
    variables.reference = text(body.handle) || text(body.id);
    externalRef = { system: "shopify", label: `Produto ${variables.product_name}`, url: admin(`products/${text(body.id)}`) };
    summary = `Produto ${variables.product_name}`;
  } else if (resource === "customers") {
    variables.customer_name = customerName(body);
    variables.reference = text(body.id);
    externalRef = { system: "shopify", label: `Cliente ${variables.customer_name || variables.customer_email}`, url: admin(`customers/${text(body.id)}`) };
    summary = `Cliente ${variables.customer_name || variables.customer_email}`;
  } else if (resource === "subscription_contracts") {
    variables.reference = text(body.id);
    summary = `Contrato de assinatura ${variables.reference}`;
    externalRef = { system: "shopify", label: summary };
  } else if (resource === "subscription_billing_attempts") {
    variables.reference = text(body.subscription_contract_id);
    summary = `Cobrança do contrato ${variables.reference}`;
    externalRef = { system: "shopify", label: summary };
  }
  if (amount !== undefined) variables.amount = amount.toFixed(2);

  return {
    source: "shopify",
    topic,
    externalId: input.deliveryId,
    summary,
    payload: input.payload,
    amount,
    variables,
    externalRef,
  };
}
