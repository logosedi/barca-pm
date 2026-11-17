import type { IntegrationSource } from "./constants";

// Events BARCA PM knows how to label. Any other topic sent by the platforms is still
// stored and counted; it just shows up under its raw name.

export interface TopicInfo {
  topic: string;
  label: string;
  /** Shown as an indicator in the "Negócio" block of the dashboard. */
  kpi?: boolean;
  /** The event carries a monetary value that is worth summing. */
  money?: boolean;
}

export const TOPICS: Record<IntegrationSource, TopicInfo[]> = {
  guru: [
    { topic: "subscription.started", label: "Assinatura iniciada", kpi: true },
    { topic: "subscription.active", label: "Assinatura ativa" },
    { topic: "subscription.trial", label: "Assinatura em período de teste" },
    { topic: "subscription.pastdue", label: "Assinatura com pagamento atrasado", kpi: true },
    { topic: "subscription.canceled", label: "Assinatura cancelada", kpi: true },
    { topic: "subscription.expired", label: "Assinatura expirada" },
    { topic: "subscription.inactive", label: "Assinatura inativa" },
    { topic: "transaction.approved", label: "Venda aprovada", kpi: true, money: true },
    { topic: "transaction.waiting_payment", label: "Venda aguardando pagamento" },
    { topic: "transaction.canceled", label: "Venda cancelada" },
    { topic: "transaction.refunded", label: "Reembolso", kpi: true, money: true },
    { topic: "transaction.chargeback", label: "Chargeback", kpi: true, money: true },
    { topic: "transaction.dispute", label: "Contestação aberta" },
    { topic: "transaction.abandoned", label: "Checkout abandonado" },
  ],
  shopify: [
    { topic: "orders/create", label: "Pedido criado" },
    { topic: "orders/paid", label: "Pedido pago", kpi: true, money: true },
    { topic: "orders/cancelled", label: "Pedido cancelado", kpi: true },
    { topic: "refunds/create", label: "Reembolso", kpi: true, money: true },
    { topic: "products/create", label: "Produto criado" },
    { topic: "products/update", label: "Produto atualizado" },
    { topic: "customers/create", label: "Cliente criado" },
    { topic: "subscription_contracts/create", label: "Contrato de assinatura criado", kpi: true },
    { topic: "subscription_contracts/update", label: "Contrato de assinatura atualizado" },
    { topic: "subscription_billing_attempts/success", label: "Cobrança de assinatura aprovada" },
    { topic: "subscription_billing_attempts/failure", label: "Cobrança de assinatura recusada", kpi: true },
  ],
};

export const SOURCE_LABELS: Record<IntegrationSource, string> = {
  guru: "Guru",
  shopify: "Shopify",
};

export function topicLabel(source: IntegrationSource, topic: string) {
  return TOPICS[source].find((item) => item.topic === topic)?.label ?? topic;
}

/** Placeholders an automation rule can use in its title and description. */
export const TEMPLATE_VARIABLES = [
  { name: "customer_name", description: "Nome do cliente" },
  { name: "customer_email", description: "E-mail do cliente" },
  { name: "product_name", description: "Produto ou plano" },
  { name: "amount", description: "Valor, quando o evento tem um" },
  { name: "reference", description: "Número do pedido, da assinatura ou da transação" },
  { name: "status", description: "Status informado pela plataforma" },
  { name: "reason", description: "Motivo (cancelamento, falha de cobrança)" },
] as const;

/** Replaces `{{name}}` placeholders. Unknown names become an empty string. */
export function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, name: string) => variables[name.toLowerCase()] ?? "").trim();
}
