# BARCA PM

Ferramenta de gestão de projetos para times multidisciplinares (tecnologia, marketing, editorial, social media, YouTube e criação de conteúdo), com quadro kanban, lista, calendário, painel de progresso, integração com Slack, Shopify e Digital Manager Guru, e um servidor MCP para assistentes de IA.

## O que tem

- **Projetos em kanban, lista e calendário.** Cada projeto tem as próprias etapas; arrastar um cartão muda a etapa e a ordem. Modelos prontos por disciplina (por exemplo, YouTube: Ideias → Roteiro → Gravação → Edição → Thumbnail e SEO → Agendado → Publicado).
- **Tarefas e subtarefas** com responsável, prioridade, prazo, etiquetas, comentários e histórico. Referências curtas como `TECH-12`, com link direto (`/t/TECH-12`).
- **Markdown** na descrição e nos comentários (títulos, listas de tarefas, tabelas, código), com **imagens coladas direto no campo** (Ctrl+V, arrastar ou escolher arquivo).
- **Times e papéis**: administrador, gestor, membro e convidado, mais líder de time. Projetos abertos para a empresa ou restritos ao time. Tabela completa em [docs/PERMISSIONS.md](docs/PERMISSIONS.md).
- **Painel** com tarefas abertas, em andamento, atrasadas, concluídas no período, evolução semanal, progresso por projeto e carga por pessoa, com filtro por time.
- **Slack**: `/barca` cria tarefas, o menu de uma mensagem transforma a mensagem em tarefa, e avisos chegam por mensagem direta e no canal do projeto.
- **Shopify e Guru**: os webhooks viram indicadores do negócio no painel (assinaturas iniciadas e canceladas, vendas, reembolsos, chargebacks) e podem **criar tarefas por regra** (por exemplo, chargeback na Guru → tarefa urgente no projeto de tecnologia).
- **MCP**: assistentes de IA consultam tarefas, geram relatórios e, com permissão, criam e atualizam tarefas, sempre com as permissões da pessoa dona do token.

## Como rodar

Requisitos: Node 22 ou mais novo e pnpm 10.

```bash
pnpm install
pnpm dev
```

Abra http://localhost:3000. No primeiro acesso, a tela de configuração cria a conta de administrador e oferece carregar **dados de demonstração** (seis times, seis projetos, tarefas com histórico e pessoas em todos os papéis). Sem nenhuma configuração, o app usa um banco embutido gravado em `.data/`.

As contas de demonstração usam a senha `barca-demo-2026`:

| Conta | Papel |
| --- | --- |
| `marina@demo.barca` | Gestora |
| `rafael@demo.barca`, `bruno@demo.barca`, `camila@demo.barca`, `juliana@demo.barca`, `larissa@demo.barca`, `pedro@demo.barca` | Membros |
| `diego@demo.barca` | Convidado |

Para criar os dados de demonstração pela linha de comando, em um banco vazio e com o servidor parado: `pnpm db:seed` (cria também `admin@demo.barca`).

### Configuração

Copie `.env.example` para `.env.local`. Nada é obrigatório para rodar localmente.

| Variável | Para quê |
| --- | --- |
| `APP_URL` | URL pública do app, usada nos links enviados ao Slack e nas instruções do MCP |
| `DATABASE_URL` | Postgres de produção. Vazio = banco embutido em `.data/pglite` |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | [docs/integrations/slack.md](docs/integrations/slack.md) |
| `SHOPIFY_WEBHOOK_SECRET` | [docs/integrations/shopify.md](docs/integrations/shopify.md) |
| `GURU_API_TOKEN` | [docs/integrations/guru.md](docs/integrations/guru.md) |
| `UPLOAD_DIR` | Pasta das imagens enviadas. Padrão: `.data/uploads` |

A página **Integrações** (administradores) mostra o que está conectado e os endereços a cadastrar em cada plataforma.

### Produção

```bash
docker compose up -d          # Postgres 16 (ou use um Postgres gerenciado)
# .env.local: DATABASE_URL=postgres://barca:barca@localhost:5432/barca
pnpm db:migrate               # aplica as migrações
pnpm build && pnpm start
```

Com Docker, `docker build -t barca-pm .` gera a imagem do app, que aplica as migrações ao iniciar; o `docker-stack.yml` traz o serviço para Docker Swarm.

O app precisa de um processo Node de longa duração e de um disco persistente para `UPLOAD_DIR`. Detalhes e limites em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#implantação).

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` / `pnpm start` | Build e servidor de produção |
| `pnpm test` | Testes (Vitest, com banco em memória) |
| `pnpm typecheck` | Gera os tipos de rotas e roda o TypeScript |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Gera uma migração a partir de mudanças em `src/server/db/schema.ts` |
| `pnpm db:migrate` | Aplica as migrações no Postgres de `DATABASE_URL` |
| `pnpm db:seed` | Cria os dados de demonstração em um banco vazio |

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [docs/DECISIONS.md](docs/DECISIONS.md) | **Todas as decisões técnicas e de produto**, com alternativas consideradas, custos e quando rever |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Como o sistema é organizado, modelo de dados, segurança e implantação |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | O que cada papel pode fazer |
| [docs/integrations/slack.md](docs/integrations/slack.md) | Criar o app do Slack e conectar |
| [docs/integrations/shopify.md](docs/integrations/shopify.md) | Webhooks da Shopify |
| [docs/integrations/guru.md](docs/integrations/guru.md) | Webhooks da Digital Manager Guru |
| [docs/integrations/mcp.md](docs/integrations/mcp.md) | Conectar um assistente de IA |
| [docs/ROADMAP.md](docs/ROADMAP.md) | O que ficou de fora e o que vem depois |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | O que foi testado, como, e o que ainda não foi |
