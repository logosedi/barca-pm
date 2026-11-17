# Shopify

O BARCA PM recebe webhooks da Shopify e faz duas coisas com eles:

1. **Conta os eventos por dia** e mostra os principais no bloco "Negócio" do painel (gestores e administradores) e na ferramenta `get_business_metrics` do MCP.
2. **Cria tarefas por regra**: em Integrações → Regras, um administrador define que um evento cria uma tarefa em um projeto, com título, prioridade e responsável.

O BARCA PM **não chama a API da Shopify** e não altera nada na loja.

> **Estado da verificação.** A rota foi exercitada com requisições assinadas simuladas (assinatura inválida recusada, evento processado, reenvio descartado) e testes automatizados. **Não foi testada com uma loja real.** Envie um webhook de teste e confira em Integrações → Eventos recentes.

## Conectar

1. No admin da Shopify: **Configurações → Notificações → Webhooks → Criar webhook**.
2. Para cada evento desejado: formato **JSON**, URL `https://SEU-DOMINIO/api/webhooks/shopify` (o endereço exato aparece na página Integrações) e a versão mais recente da API.
3. Na mesma tela, a Shopify mostra o segredo com que assina os webhooks ("Seus webhooks serão assinados com…"). Copie para `SHOPIFY_WEBHOOK_SECRET` no servidor e reinicie o app.

Se os webhooks forem registrados por um app (e não pelo admin), o segredo é a chave secreta desse app.

## Eventos reconhecidos

Qualquer evento enviado é guardado e contado. Estes têm nome amigável na interface:

| Evento | Nome | No painel | Soma valor |
| --- | --- | :-: | :-: |
| `orders/create` | Pedido criado | | |
| `orders/paid` | Pedido pago | Sim | Sim |
| `orders/cancelled` | Pedido cancelado | Sim | |
| `refunds/create` | Reembolso | Sim | Sim |
| `products/create` | Produto criado | | |
| `products/update` | Produto atualizado | | |
| `customers/create` | Cliente criado | | |
| `subscription_contracts/create` | Contrato de assinatura criado | Sim | |
| `subscription_contracts/update` | Contrato de assinatura atualizado | | |
| `subscription_billing_attempts/success` | Cobrança de assinatura aprovada | | |
| `subscription_billing_attempts/failure` | Cobrança de assinatura recusada | Sim | |

Os eventos de assinatura (`subscription_*`) não aparecem na tela de webhooks do admin: a Shopify só os entrega a apps com acesso à API de assinaturas. Se as assinaturas da empresa passam pela Guru, esses eventos provavelmente não serão necessários.

## Regras de automação

Os dados de demonstração trazem uma regra pronta: `products/create` cria "Divulgar novo produto: {{product_name}}" no projeto de marketing, com uma lista de verificação na descrição. Outras ideias:

| Evento | Tarefa sugerida |
| --- | --- |
| `refunds/create` | "Reembolso do pedido {{reference}}: entender o motivo" no projeto de atendimento ou tecnologia |
| `orders/cancelled` | "Pedido {{reference}} cancelado: {{reason}}" |
| `subscription_billing_attempts/failure` | "Cobrança recusada: {{customer_email}}" |

Variáveis disponíveis no título e na descrição:

| Variável | Conteúdo na Shopify |
| --- | --- |
| `{{customer_name}}` | Nome e sobrenome do cliente |
| `{{customer_email}}` | E-mail do pedido ou do cliente |
| `{{product_name}}` | Itens do pedido, ou o título do produto |
| `{{amount}}` | Total do pedido ou soma do reembolso |
| `{{reference}}` | Número do pedido (`#1001`), identificador do produto, do cliente ou do contrato |
| `{{status}}` | Status ou status financeiro |
| `{{reason}}` | Motivo do cancelamento, observação do reembolso ou erro da cobrança |

A tarefa criada guarda um link para o pedido, produto ou cliente no admin da Shopify.

## Como o recebimento funciona

- A assinatura (`X-Shopify-Hmac-Sha256`) é conferida contra o corpo bruto. Assinatura inválida responde 401.
- O mesmo evento reenviado pela Shopify é reconhecido pelo cabeçalho `X-Shopify-Event-Id` e descartado (resposta `{"status":"duplicate"}`).
- Se o processamento falhar, a resposta é 500 e a Shopify tenta de novo mais tarde.
- A Shopify espera a resposta em poucos segundos. O processamento é feito dentro da requisição; com muitas regras para o mesmo evento, isso pode ficar apertado.

## Limites

- Os números são **contagens do que chegou desde a conexão**. Não há importação do histórico nem conferência com os relatórios da Shopify.
- Os valores são somados sem conversão de moeda.
- O payload completo de cada evento fica gravado no banco (inclui dados de clientes). Não há rotina de limpeza.
