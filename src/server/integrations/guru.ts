import { safeEqual, sha256 } from "../auth/crypto";
import type { IncomingEvent } from "../services/automations";

// Digital Manager Guru adapter. Guru does not sign webhooks: it sends the account's
// `api_token` inside the JSON body, and the receiver compares it with its own copy.
// Field names follow https://docs.digitalmanager.guru/developers (webhooks de
// assinaturas e de transações).

type Json = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");
const object = (value: unknown): Json => (value && typeof value === "object" ? (value as Json) : {});
const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

export function verifyGuruToken(payload: unknown, expected: string) {
  const received = text(object(payload).api_token);
  return Boolean(expected) && Boolean(received) && safeEqual(received, expected);
}

/** Never persist the account token that travels inside every payload. */
export function redactGuruPayload(payload: unknown) {
  return { ...object(payload), api_token: "[removido]" };
}

/** Returns null for webhook types that BARCA PM does not track (e-tickets, for example). */
export function normalizeGuruEvent(payload: unknown, requestId: string | null): IncomingEvent | null {
  const body = object(payload);
  const type = text(body.webhook_type);
  const product = object(body.product);
  const base = { source: "guru" as const, payload: redactGuruPayload(payload) };

  if (type === "subscription") {
    const subscriber = object(body.subscriber);
    const invoice = object(body.current_invoice);
    const status = text(body.last_status) || "unknown";
    const reference = text(body.subscription_code) || text(body.id);
    const amount = firstNumber(body.next_cycle_value, invoice.value);
    const dates = object(body.dates);
    return {
      ...base,
      topic: `subscription.${status}`,
      // Without X-Request-ID, the same status change is recognised by subscription + status + timestamp.
      externalId: requestId ?? sha256(`subscription:${reference}:${status}:${text(dates.last_status_at)}`),
      summary: `Assinatura ${reference} (${status})`,
      amount,
      variables: {
        customer_name: text(subscriber.name),
        customer_email: text(subscriber.email),
        product_name: text(body.name) || text(product.name),
        amount: amount === undefined ? "" : amount.toFixed(2),
        reference,
        status,
        reason: text(body.cancel_reason),
      },
      externalRef: { system: "guru", label: `Assinatura ${reference}` },
    };
  }

  if (type === "transaction") {
    const contact = object(body.contact);
    const payment = object(body.payment);
    const status = text(body.status) || "unknown";
    const reference = text(body.id);
    const amount = firstNumber(payment.total, payment.gross, body.value);
    return {
      ...base,
      topic: `transaction.${status}`,
      externalId: requestId ?? sha256(`transaction:${reference}:${status}`),
      summary: `Transação ${reference} (${status})`,
      amount,
      variables: {
        customer_name: text(contact.name),
        customer_email: text(contact.email),
        product_name: text(product.name),
        amount: amount === undefined ? "" : amount.toFixed(2),
        reference,
        status,
        reason: text(payment.refuse_reason),
      },
      externalRef: { system: "guru", label: `Transação ${reference}` },
    };
  }

  return null;
}
