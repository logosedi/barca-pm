import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { renderTemplate } from "@/lib/integration-topics";
import { todayISO } from "@/lib/utils";
import { normalizeGuruEvent, verifyGuruToken } from "@/server/integrations/guru";
import { normalizeShopifyEvent, verifyShopifyHmac } from "@/server/integrations/shopify";
import { verifySlackSignature } from "@/server/integrations/slack/api";
import { createRule, getBusinessMetrics, listRecentEvents, processIntegrationEvent } from "@/server/services/automations";
import { sniffImageType } from "@/server/services/files";
import { getTaskDetail } from "@/server/services/tasks";
import { createWorkspace, useTestDb } from "./helpers";

describe("assinatura do Slack", () => {
  const signingSecret = "segredo-do-slack";
  const rawBody = "command=%2Fbarca&text=minhas";
  const sign = (timestamp: string) =>
    `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;

  it("aceita a assinatura correta e recusa corpo alterado, segredo errado e replay", () => {
    const now = 1_800_000_000;
    const timestamp = String(now);
    const base = { signingSecret, timestamp, signature: sign(timestamp), rawBody, now };
    expect(verifySlackSignature(base)).toBe(true);
    expect(verifySlackSignature({ ...base, rawBody: `${rawBody}&x=1` })).toBe(false);
    expect(verifySlackSignature({ ...base, signingSecret: "outro" })).toBe(false);
    expect(verifySlackSignature({ ...base, signature: null })).toBe(false);
    // Same valid signature, replayed ten minutes later.
    expect(verifySlackSignature({ ...base, now: now + 600 })).toBe(false);
  });
});

describe("webhooks da Shopify", () => {
  it("valida o HMAC em base64 do corpo bruto", () => {
    const body = JSON.stringify({ id: 1 });
    const header = createHmac("sha256", "segredo").update(body).digest("base64");
    expect(verifyShopifyHmac(body, header, "segredo")).toBe(true);
    expect(verifyShopifyHmac(`${body} `, header, "segredo")).toBe(false);
    expect(verifyShopifyHmac(body, null, "segredo")).toBe(false);
    expect(verifyShopifyHmac(body, header, "")).toBe(false);
  });

  it("normaliza um pedido pago", () => {
    const event = normalizeShopifyEvent({
      topic: "orders/paid",
      shopDomain: "loja.myshopify.com",
      deliveryId: "evt-1",
      payload: {
        id: 820982911946154500,
        name: "#1001",
        total_price: "129.90",
        email: "cliente@exemplo.com",
        customer: { first_name: "Lia", last_name: "Prado" },
        line_items: [{ title: "Plano anual" }, { title: "Caneca" }],
      },
    });
    expect(event).toMatchObject({
      source: "shopify",
      topic: "orders/paid",
      amount: 129.9,
      summary: "Pedido #1001",
      variables: { customer_name: "Lia Prado", customer_email: "cliente@exemplo.com", product_name: "Plano anual, Caneca", amount: "129.90" },
    });
    expect(event.externalRef?.url).toBe("https://loja.myshopify.com/admin/orders/820982911946154500");
  });
});

describe("webhooks da Guru", () => {
  // Shape taken from the subscription example in Guru's webhook documentation.
  const subscription = {
    webhook_type: "subscription",
    api_token: "token-da-conta",
    id: "sub_BOAEj2WTKoclmg4X",
    subscription_code: "sub_9CFyWTuPwXdJUikS",
    last_status: "canceled",
    name: "Assinatura Mensal",
    cancel_reason: "Preço",
    next_cycle_value: 49.9,
    dates: { last_status_at: "2026-11-10T18:39:34Z" },
    subscriber: { name: "Nome Assinante", email: "email@email.email" },
  };

  it("confere o api_token enviado no corpo", () => {
    expect(verifyGuruToken(subscription, "token-da-conta")).toBe(true);
    expect(verifyGuruToken(subscription, "outro-token")).toBe(false);
    expect(verifyGuruToken({ ...subscription, api_token: undefined }, "token-da-conta")).toBe(false);
    expect(verifyGuruToken(subscription, "")).toBe(false);
  });

  it("normaliza assinatura e nunca guarda o token da conta", () => {
    const event = normalizeGuruEvent(subscription, "req-1")!;
    expect(event).toMatchObject({
      topic: "subscription.canceled",
      externalId: "req-1",
      amount: 49.9,
      variables: { customer_name: "Nome Assinante", product_name: "Assinatura Mensal", reference: "sub_9CFyWTuPwXdJUikS", reason: "Preço" },
    });
    expect(JSON.stringify(event.payload)).not.toContain("token-da-conta");
  });

  it("sem X-Request-ID, a mesma mudança de status gera o mesmo id e mudanças diferentes não", () => {
    const first = normalizeGuruEvent(subscription, null)!;
    const retry = normalizeGuruEvent(subscription, null)!;
    const later = normalizeGuruEvent({ ...subscription, last_status: "active" }, null)!;
    expect(retry.externalId).toBe(first.externalId);
    expect(later.externalId).not.toBe(first.externalId);
  });

  it("normaliza transação e ignora tipos que não acompanhamos", () => {
    const event = normalizeGuruEvent(
      { webhook_type: "transaction", api_token: "t", id: "9b71cfb2", status: "chargeback", payment: { total: 97 }, contact: { name: "Rui", email: "rui@exemplo.com" }, product: { name: "Curso" } },
      "req-2",
    )!;
    expect(event).toMatchObject({ topic: "transaction.chargeback", amount: 97, variables: { customer_name: "Rui", product_name: "Curso", amount: "97.00" } });
    expect(normalizeGuruEvent({ webhook_type: "eticket", api_token: "t" }, "req-3")).toBeNull();
  });
});

describe("regras de automação", () => {
  beforeEach(useTestDb);

  it("substitui variáveis e descarta as desconhecidas", () => {
    expect(renderTemplate("Chargeback: {{customer_name}} ({{ amount }}) {{nao_existe}}", { customer_name: "Rui", amount: "97.00" })).toBe(
      "Chargeback: Rui (97.00)",
    );
  });

  it("evento cria tarefa pela regra, conta no indicador e não é processado duas vezes", async () => {
    const { admin, member, project } = await createWorkspace();
    await createRule(admin, {
      name: "Chargeback",
      source: "guru",
      topic: "transaction.chargeback",
      projectId: project.id,
      titleTemplate: "Chargeback: {{customer_name}}",
      descriptionTemplate: "Valor: R$ {{amount}}",
      priority: "urgent",
      assigneeId: member.id,
    });
    const event = normalizeGuruEvent(
      { webhook_type: "transaction", api_token: "t", id: "tx-1", status: "chargeback", payment: { total: 97 }, contact: { name: "Rui" } },
      "req-1",
    )!;

    expect(await processIntegrationEvent(event)).toEqual({ status: "processed", tasks: ["TECH-1"] });
    expect(await processIntegrationEvent(event)).toEqual({ status: "duplicate" });

    const task = await getTaskDetail(admin, "TECH-1");
    expect(task).toMatchObject({
      title: "Chargeback: Rui",
      description: "Valor: R$ 97.00",
      priority: "urgent",
      source: "guru",
      reporter: null,
      assignee: { name: "Bia Membro" },
      externalRef: { system: "guru", label: "Transação tx-1" },
    });

    const today = todayISO();
    const metrics = await getBusinessMetrics(admin, today, today);
    expect(metrics.totals).toEqual([{ source: "guru", topic: "transaction.chargeback", count: 1, amount: 97 }]);
    expect((await listRecentEvents(admin)).map((item) => item.status)).toEqual(["processed"]);
  });

  it("evento sem regra é guardado e contado, sem criar tarefa", async () => {
    const { admin } = await createWorkspace();
    const event = normalizeShopifyEvent({ topic: "orders/paid", shopDomain: "", deliveryId: "evt-9", payload: { id: 1, name: "#1", total_price: "10.00" } });
    expect(await processIntegrationEvent(event)).toEqual({ status: "ignored", tasks: [] });
    expect((await getBusinessMetrics(admin, todayISO(), todayISO())).totals[0]).toMatchObject({ topic: "orders/paid", count: 1, amount: 10 });
  });

  it("membro não acessa indicadores do negócio nem regras", async () => {
    const { member, project } = await createWorkspace();
    await expect(getBusinessMetrics(member, todayISO(), todayISO())).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createRule(member, { name: "X", source: "guru", topic: "transaction.approved", projectId: project.id, titleTemplate: "X" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("upload de imagens", () => {
  it("identifica o formato pelos bytes, não pelo nome ou tipo declarado", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBP"))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
