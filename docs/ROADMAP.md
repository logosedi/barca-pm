# Roadmap

O que existe hoje é uma primeira versão completa do que foi pedido. Esta lista reúne o que ficou de fora de propósito, em ordem sugerida de prioridade dentro de cada grupo. Para cada item, a decisão relacionada em [DECISIONS.md](DECISIONS.md) explica por que não entrou.

## Antes de colocar em produção

| Item | Por quê |
| --- | --- |
| Testar Slack, Shopify e Guru com as contas reais | Só foram exercitados com requisições simuladas; o mapeamento de campos da Guru veio da documentação ([0007](DECISIONS.md#0007-slack-por-http-direto-sem-o-sdk-oficial), [0008](DECISIONS.md#0008-shopify-e-guru-por-webhooks-com-regras-de-automação)) |
| Rodar contra um servidor PostgreSQL de verdade | O caminho do Postgres foi verificado pelo driver, mas contra o motor embutido, não contra um servidor instalado ([VERIFICATION.md](VERIFICATION.md)) |
| Recuperação de senha | Hoje ninguém consegue redefinir uma senha esquecida pela interface ([0004](DECISIONS.md#0004-autenticação-própria-sessões-no-banco-scrypt-e-convites-por-link)) |
| Envio de e-mail (convites e recuperação) | O administrador copia o link do convite à mão |
| Dockerfile do app e integração contínua | Só o Postgres está no `docker-compose.yml`; os testes rodam apenas localmente |
| Backup do banco e da pasta de imagens | Não há nada automatizado |

## Produto

| Item | Observação |
| --- | --- |
| Atualização em tempo real do quadro e das notificações | Maior diferença de experiência em relação a Asana, Jira e Monday ([0014](DECISIONS.md#0014-páginas-renderizadas-por-requisição-sem-cache-de-dados-e-sem-tempo-real)) |
| Lembretes de prazo e resumo diário no Slack | Dependem de um agendador ([0015](DECISIONS.md#0015-efeitos-colaterais-em-segundo-plano-no-próprio-processo)) |
| Menções (`@pessoa`) em comentários, com notificação | Hoje são avisados o responsável, quem criou e quem já comentou |
| Campos personalizados por projeto | Canal e formato para social media, duração para vídeo, pontos para tecnologia ([0006](DECISIONS.md#0006-etapas-livres-por-projeto-agrupadas-em-três-categorias)) |
| Tarefas recorrentes | Newsletter semanal, post fixo, vídeo quinzenal: comum em times de conteúdo |
| Anexos que não são imagem (PDF, vídeo, roteiro) | Só imagens são aceitas hoje |
| Editor visual de texto | Se os times não técnicos não se adaptarem ao Markdown ([0011](DECISIONS.md#0011-markdown-como-formato-de-texto-e-imagens-como-arquivos-enviados)) |
| Filtros salvos e filtro por etiqueta e prioridade | Hoje: busca por texto e filtro por responsável |
| Dependências entre tarefas e visão de cronograma (Gantt) | Presente em todas as ferramentas de referência |
| Sprints e estimativas para o time de tecnologia | |
| Desarquivar projetos, mover tarefas entre projetos, mudar a sigla | |
| Aprovações explícitas (aprovar ou pedir ajustes) | Hoje a aprovação é uma etapa do fluxo |
| Tema escuro, inglês | ([0016](DECISIONS.md#0016-interface-em-português-tema-claro-e-componentes-próprios)) |
| Fuso horário por pessoa | Hoje fixo em `America/Sao_Paulo` |

## Integrações

| Item | Observação |
| --- | --- |
| Login com Google ou Slack (SSO) | Dispensa senhas e convites manuais |
| Comentários a partir do Slack | Responder ao aviso vira comentário na tarefa |
| Números reais de assinatura (base ativa, MRR, churn) pela API da Guru | Os webhooks dão contagens de eventos, não a posição da base ([0008](DECISIONS.md#0008-shopify-e-guru-por-webhooks-com-regras-de-automação)) |
| Regras com condições (valor mínimo, produto específico) e limite de tarefas por período | Hoje a regra dispara para todo evento do tipo |
| Retenção e limpeza dos payloads de webhooks | Guardam dados de clientes sem prazo |
| OAuth no servidor MCP | Para clientes de IA que só aceitam conectores com login ([0009](DECISIONS.md#0009-mcp-por-http-sem-estado-com-tokens-pessoais)) |
| Calendário editorial exportável (iCal) | Para ver prazos no Google Calendar |

## Técnico

| Item | Observação |
| --- | --- |
| Imagens em armazenamento de objetos (S3 ou compatível), com acesso conferido por projeto | Permite mais de uma instância e fecha o limite de privacidade das imagens |
| Fila durável para efeitos em segundo plano | pg-boss sobre o próprio Postgres é o caminho mais curto |
| Limite de requisições no MCP, nos webhooks e no login em armazenamento compartilhado | |
| Testes de interface automatizados (Playwright) | A interface só foi verificada à mão |
| Registro de auditoria de ações administrativas | |
| Renumeração das posições do quadro | A ordenação por decimais se esgota após dezenas de inserções no mesmo ponto ([0012](DECISIONS.md#0012-kanban-com-posição-fracionária-e-dnd-kit)) |
| Paginação do quadro e da lista | Hoje o projeto inteiro é carregado de uma vez |
| Revisão de acessibilidade com leitor de tela | |
| Multi-inquilino | Só se o produto for oferecido a outras empresas ([0018](DECISIONS.md#0018-uma-instalação-por-empresa)) |
