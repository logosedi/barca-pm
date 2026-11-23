# Verificação

O que foi conferido antes da entrega, como, e o que não foi. Tudo foi executado em Windows, com Node 24 e pnpm 10, em 14 de novembro de 2026.

## Verificações automáticas

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | Sem erros |
| `pnpm lint` | Sem avisos |
| `pnpm test` | 54 de 54 testes passam (5 arquivos, cerca de 35 segundos) |
| `pnpm build` | Build de produção concluído, sem avisos |
| `pnpm db:seed` | Cria os dados de demonstração em banco vazio; recusa rodar em banco com usuários |

O que os testes cobrem:

| Arquivo | Assunto |
| --- | --- |
| `tests/permissions.test.ts` | Matriz de permissões: visibilidade de projetos, edição, gestão, convidados |
| `tests/services.test.ts` | Contas, convites, projetos, tarefas, subtarefas, ordenação do quadro, comentários, busca, notificações, relatório, arquivamento, alcance do convidado |
| `tests/integrations.test.ts` | Assinatura do Slack, HMAC da Shopify, token da Guru, normalização de eventos, regras de automação, eventos repetidos, tipo de imagem pelos bytes |
| `tests/slack.test.ts` | Comando `/barca`, formulário, atalho de mensagem, vínculo de conta por e-mail (com a API do Slack substituída) |
| `tests/mcp.test.ts` | Tokens, escopo de leitura e escrita, ferramentas com as permissões do dono do token |

## Verificação manual no navegador

Feita no servidor de desenvolvimento, com o banco embutido e os dados de demonstração.

| Fluxo | Resultado |
| --- | --- |
| Primeiro acesso: `/` → `/login` → `/setup`, criação do administrador com dados de demonstração | Funciona |
| Login com senha errada e correta, logout | Funciona |
| Painel: indicadores, gráfico semanal, progresso por projeto, carga por pessoa, bloco de negócio | Funciona |
| Quadro: arrastar um cartão para outra coluna e recarregar | A mudança persiste |
| Link curto `/t/TECH-8` | Abre o projeto com o painel da tarefa |
| Tarefa: descrição em Markdown (títulos, lista de tarefas, tabela), prioridade, subtarefa nova e concluída, comentário | Funciona; o cartão no quadro reflete as mudanças |
| Colar uma imagem na descrição | Enviada e exibida |
| Visões de lista (com subtarefas) e calendário | Funcionam |
| Páginas de integrações, configurações, notificações e minhas tarefas | Funcionam |
| Criar token de IA pela tela | Funciona; token exibido uma vez |
| Convite: gerar o link em Pessoas, abrir, senhas diferentes, definir a senha, entrar, reabrir o link | Funciona; o link usado mostra "convite inválido" |
| Times: página como administrador (com controles) e como membro (somente leitura); incluir uma pessoa em um time | Funciona |
| Convidado (`diego@demo.barca`) | Vê só os três projetos dos seus times; sem botões de criar ou editar; campos da tarefa desabilitados; comentou em uma tarefa e quem criou a tarefa foi notificado; projeto e tarefa de outro time respondem "não encontrado"; sem acesso a Integrações nem às configurações de projeto; o filtro de responsáveis lista só colegas de time e quem já aparece nas tarefas |
| Membro (`rafael@demo.barca`) | Não vê o projeto restrito de outro time; recebe as notificações de tarefa atribuída e de comentário |
| Largura de celular (390 px) | Menu recolhido e conteúdo legível, conferido em uma página |

Arrastar e soltar foi acionado por eventos de ponteiro simulados, não por um mouse físico.

## Verificação das integrações por HTTP

Com o servidor rodando e segredos de teste:

| Caso | Resultado |
| --- | --- |
| Shopify com assinatura errada | 401 |
| Shopify `products/create` com regra ativa | Tarefa criada no projeto de marketing |
| Shopify, mesmo evento reenviado | `duplicate`, sem nova tarefa |
| Shopify `orders/paid` sem regra | `ignored`, contado no painel |
| Guru com token errado | 401 |
| Guru, chargeback com regra ativa | Tarefa urgente criada e atribuída; o responsável foi notificado |
| Guru, mesmo evento reenviado sem `X-Request-ID` | `duplicate` |
| Guru, tipo de webhook desconhecido | `ignored` |
| MCP sem token | 401 |
| MCP com token de escrita, pelo cliente do SDK oficial | Lista 11 ferramentas e 1 prompt; `whoami`, `get_workspace_report`, `search_tasks`, `get_business_metrics`, `create_task`, `add_comment` e `update_task` funcionam; tarefa inexistente devolve erro legível |

## Caminho do PostgreSQL

Não havia servidor PostgreSQL nem Docker na máquina. Para exercitar o caminho de produção, o app foi ligado, pelo driver `pg` e por `DATABASE_URL`, a um servidor que fala o protocolo do Postgres sobre o mesmo motor embutido (`pglite-socket`). Nessa configuração:

- `pnpm db:migrate` e `pnpm db:seed` funcionaram;
- o build de produção (`pnpm start`) atendeu login, painel, um webhook da Guru (com reenvio descartado), comentário e mudança de etapa.

Isso confirma o código de conexão, as migrações e as transações pelo driver de produção. **Não confirma o comportamento em um servidor PostgreSQL instalado** (versão, concorrência real, pool com várias conexões simultâneas).

## O que não foi verificado

| Item | Risco |
| --- | --- |
| Slack real | Nenhuma chamada foi feita à API do Slack. Manifesto, permissões e formato das respostas seguem a documentação. Siga o roteiro de [integrations/slack.md](integrations/slack.md) |
| Shopify real | Formato dos cabeçalhos e payloads segue a documentação |
| Guru real | **Maior incerteza.** Nomes dos campos e dos status vieram da documentação pública, sem um payload real para conferir |
| Clientes de IA (Claude, Cursor) conectados ao MCP | Testado só com o cliente do SDK |
| Servidor PostgreSQL instalado | Veja a seção anterior |
| `docker-compose.yml` | Escrito, não executado |
| `Dockerfile` e `docker-stack.yml` | Escritos, nunca construídos nem executados: não havia Docker na máquina de desenvolvimento nem acesso ao Docker no servidor. Os dois comandos que o contêiner roda ao iniciar (migração com tsx e `next start`) são os mesmos verificados fora do contêiner |
| Desempenho com volume | Nenhum teste com milhares de tarefas ou muitos usuários simultâneos |
| Navegadores | Só o Chromium embutido no editor. Firefox e Safari não foram testados |
| Leitor de tela | Não testado |
| Formulários não exercitados na interface | Criar, editar e excluir time; criar projeto; configurações do projeto (etapas, etiquetas, arquivar); mudar papel e desativar pessoa; trocar senha; regras de automação. As telas abrem e os serviços por trás têm testes, mas os formulários não foram preenchidos e enviados nesta rodada final |
| Páginas em celular | Só uma página foi conferida em largura de celular; o quadro kanban em tela pequena não foi avaliado |
