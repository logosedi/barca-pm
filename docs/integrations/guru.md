# Digital Manager Guru

O BARCA PM recebe os webhooks de **assinaturas** e de **transações** da Guru e faz duas coisas com eles:

1. **Conta os eventos por dia** e mostra os principais no bloco "Negócio" do painel (gestores e administradores) e na ferramenta `get_business_metrics` do MCP: assinaturas iniciadas, atrasadas e canceladas, vendas aprovadas, reembolsos e chargebacks.
2. **Cria tarefas por regra**: em Integrações → Regras, um administrador define que um evento cria uma tarefa em um projeto. O exemplo dos dados de demonstração é "chargeback vira tarefa urgente no projeto de tecnologia".

O BARCA PM **não chama a API da Guru** e não altera nada na conta.

> **Estado da verificação.** Os nomes dos campos foram tirados da documentação pública da Guru para desenvolvedores e **não foram conferidos com um webhook real**. A rota foi exercitada com payloads simulados nesse formato. Na primeira conexão, envie um webhook de teste de assinatura e um de transação e confira em Integrações → Eventos recentes se o resumo, o evento e o valor fazem sentido. Se um campo vier com outro nome, o ajuste é em `src/server/integrations/guru.ts`.

## Conectar

1. No painel da Guru, crie um webhook (em Configurações → Webhooks; o nome do menu pode variar) para **assinaturas** e outro para **transações**, apontando para `https://SEU-DOMINIO/api/webhooks/guru` (o endereço exato aparece na página Integrações do BARCA PM). Marque os status que interessam.
2. A Guru não assina os webhooks: ela envia o **token de API da conta** dentro de cada payload, no campo `api_token`. Copie esse token para `GURU_API_TOKEN` no servidor e reinicie o app. O BARCA PM recusa (401) qualquer payload cujo token não confira.

O token é removido do payload antes de o evento ser gravado.

## Como os eventos são nomeados

O nome do evento é o tipo do webhook mais o status informado pela Guru:

- Assinaturas: `subscription.` + `last_status` → `subscription.started`, `subscription.canceled`…
- Transações: `transaction.` + `status` → `transaction.approved`, `transaction.chargeback`…

| Evento | Nome | No painel | Soma valor |
| --- | --- | :-: | :-: |
| `subscription.started` | Assinatura iniciada | Sim | |
| `subscription.active` | Assinatura ativa | | |
| `subscription.trial` | Assinatura em período de teste | | |
| `subscription.pastdue` | Assinatura com pagamento atrasado | Sim | |
| `subscription.canceled` | Assinatura cancelada | Sim | |
| `subscription.expired` | Assinatura expirada | | |
| `subscription.inactive` | Assinatura inativa | | |
| `transaction.approved` | Venda aprovada | Sim | Sim |
| `transaction.waiting_payment` | Venda aguardando pagamento | | |
| `transaction.canceled` | Venda cancelada | | |
| `transaction.refunded` | Reembolso | Sim | Sim |
| `transaction.chargeback` | Chargeback | Sim | Sim |
| `transaction.dispute` | Contestação aberta | | |
| `transaction.abandoned` | Checkout abandonado | | |

Um status que não esteja nesta lista é guardado e contado do mesmo jeito, com o nome bruto, e pode ser usado em regras depois de ter chegado ao menos uma vez. Outros tipos de webhook (por exemplo, ingressos) são respondidos com sucesso e ignorados.

## Campos lidos

| Variável da regra | Assinatura | Transação |
| --- | --- | --- |
| `{{customer_name}}` | `subscriber.name` | `contact.name` |
| `{{customer_email}}` | `subscriber.email` | `contact.email` |
| `{{product_name}}` | `name` ou `product.name` | `product.name` |
| `{{amount}}` | `next_cycle_value` ou `current_invoice.value` | `payment.total`, `payment.gross` ou `value` |
| `{{reference}}` | `subscription_code` ou `id` | `id` |
| `{{status}}` | `last_status` | `status` |
| `{{reason}}` | `cancel_reason` | `payment.refuse_reason` |

## Ideias de regras

| Evento | Tarefa sugerida | Para quem |
| --- | --- | --- |
| `transaction.chargeback` | "Chargeback: {{customer_name}} ({{product_name}})", urgente | Tecnologia ou financeiro |
| `subscription.pastdue` | "Recuperar pagamento: {{customer_email}}" | Atendimento |
| `subscription.canceled` | "Entender cancelamento: {{customer_name}} ({{reason}})" | Marketing ou produto |
| `transaction.refunded` | "Reembolso de R$ {{amount}}: registrar motivo" | Atendimento |

Cuidado com eventos frequentes: uma regra em `subscription.started` ou `transaction.approved` cria uma tarefa por venda.

## Como o recebimento funciona

- Reenvios do mesmo webhook são descartados. O BARCA PM usa o cabeçalho `X-Request-ID` quando existe; sem ele, reconhece a repetição pela combinação de assinatura ou transação, status e data da mudança de status.
- Se o processamento falhar, a resposta é 500, para que a Guru tente de novo.

## Limites

- Os números são **contagens do que chegou desde a conexão**. Não há importação do histórico nem conferência com os relatórios da Guru. Servem para ver tendência ao lado das entregas, não para fechamento financeiro.
- "Assinatura iniciada" e "Assinatura cancelada" contam eventos, não a base ativa: não há cálculo de MRR nem de churn.
- O payload de cada evento (com dados de clientes, sem o token) fica gravado no banco. Não há rotina de limpeza.
