# Registro de decisões

Cada decisão abaixo traz o contexto, o que foi escolhido, as alternativas consideradas, o custo assumido e o sinal para rever. As decisões 0016 e 0018 são de produto, não de tecnologia, e foram tomadas sem consulta: vale conferir primeiro.

| Nº | Decisão |
| --- | --- |
| [0001](#0001-monólito-modular-em-nextjs-16-e-typescript) | Monólito modular em Next.js 16 e TypeScript |
| [0002](#0002-postgresql-em-produção-pglite-embutido-no-desenvolvimento) | PostgreSQL em produção, PGlite embutido no desenvolvimento |
| [0003](#0003-drizzle-orm-com-migrações-sql-versionadas) | Drizzle ORM com migrações SQL versionadas |
| [0004](#0004-autenticação-própria-sessões-no-banco-scrypt-e-convites-por-link) | Autenticação própria: sessões no banco, scrypt e convites por link |
| [0005](#0005-permissões-em-funções-puras-aplicadas-na-camada-de-serviços) | Permissões em funções puras, aplicadas na camada de serviços |
| [0006](#0006-etapas-livres-por-projeto-agrupadas-em-três-categorias) | Etapas livres por projeto, agrupadas em três categorias |
| [0007](#0007-slack-por-http-direto-sem-o-sdk-oficial) | Slack por HTTP direto, sem o SDK oficial |
| [0008](#0008-shopify-e-guru-por-webhooks-com-regras-de-automação) | Shopify e Guru por webhooks, com regras de automação |
| [0009](#0009-mcp-por-http-sem-estado-com-tokens-pessoais) | MCP por HTTP sem estado, com tokens pessoais |
| [0010](#0010-uma-camada-de-serviços-para-todas-as-entradas) | Uma camada de serviços para todas as entradas |
| [0011](#0011-markdown-como-formato-de-texto-e-imagens-como-arquivos-enviados) | Markdown como formato de texto e imagens como arquivos enviados |
| [0012](#0012-kanban-com-posição-fracionária-e-dnd-kit) | Kanban com posição fracionária e dnd-kit |
| [0013](#0013-referências-curtas-um-nível-de-subtarefas-e-painel-lateral-pela-url) | Referências curtas, um nível de subtarefas e painel lateral pela URL |
| [0014](#0014-páginas-renderizadas-por-requisição-sem-cache-de-dados-e-sem-tempo-real) | Páginas renderizadas por requisição, sem cache de dados e sem tempo real |
| [0015](#0015-efeitos-colaterais-em-segundo-plano-no-próprio-processo) | Efeitos colaterais em segundo plano no próprio processo |
| [0016](#0016-interface-em-português-tema-claro-e-componentes-próprios) | Interface em português, tema claro e componentes próprios |
| [0017](#0017-testes-com-vitest-e-banco-em-memória) | Testes com Vitest e banco em memória |
| [0018](#0018-uma-instalação-por-empresa) | Uma instalação por empresa |
| [0019](#0019-relatórios-calculados-sob-demanda) | Relatórios calculados sob demanda |

---

## 0001. Monólito modular em Next.js 16 e TypeScript

**Contexto.** O produto precisa de interface web, API para Slack e webhooks, e um servidor MCP. A equipe que vai manter é pequena.

**Decisão.** Uma única aplicação Next.js 16 (App Router, React 19) em TypeScript estrito. Interface, Server Actions, rotas HTTP e servidor MCP rodam no mesmo processo e compartilham os mesmos tipos e a mesma camada de serviços (0010).

**Alternativas.**
- *SPA (Vite) + API separada (NestJS ou Fastify).* Separação mais nítida, mas dois projetos para publicar, contrato de API para manter e tipos duplicados. Não há um segundo cliente (app móvel, por exemplo) que justifique isso hoje.
- *Rails ou Laravel.* Produtivos para esse tipo de sistema, mas o kanban com arrastar e soltar e o editor com colagem de imagens exigiriam uma camada de JavaScript de qualquer forma, e o SDK oficial de MCP mais maduro é o de TypeScript.
- *Remix / React Router 7.* Tecnicamente equivalente; Next foi preferido pela documentação e pelo ecossistema.

**Custo.** A aplicação fica acoplada às convenções do Next, que mudam bastante entre versões (o 16 tem diferenças relevantes; veja 0014). Como a regra de negócio está em `src/server/services`, sem importar nada do Next, trocar a casca não exige reescrever as regras.

**Rever quando** existir um segundo cliente que precise de uma API pública estável.

## 0002. PostgreSQL em produção, PGlite embutido no desenvolvimento

**Contexto.** O modelo é relacional (times, projetos, tarefas, comentários) e os relatórios são agregações. Ao mesmo tempo, quem for avaliar o projeto deve conseguir rodá-lo sem instalar nada além do Node.

**Decisão.** PostgreSQL 15 ou mais novo em produção, via `pg`. Quando `DATABASE_URL` está vazio, o app usa PGlite (o Postgres compilado para WebAssembly, rodando dentro do processo) com os dados em `.data/pglite`. É o mesmo dialeto SQL e o mesmo código de consulta nos dois casos; só o driver muda (`src/server/db/client.ts`).

**Alternativas.**
- *SQLite no desenvolvimento e Postgres em produção.* Dois dialetos: tipos, `jsonb`, `returning` e funções de data divergem, e bugs passam a existir só em produção.
- *Exigir Docker para desenvolver.* Funciona, mas cria uma barreira para rodar e para os testes.
- *MySQL, MongoDB.* Sem vantagem aqui; o Postgres cobre `jsonb` para os dados soltos (payload de webhooks, histórico).

**Custo.**
- PGlite aceita um processo por vez. Uma trava por arquivo (`.data/pglite.lock`) impede que `pnpm dev` e `pnpm db:seed` abram o mesmo banco juntos, com uma mensagem clara.
- O banco embutido migra sozinho ao iniciar; o Postgres precisa de `pnpm db:migrate` a cada versão.
- PGlite não é para produção: sem conexões concorrentes, sem backup em operação.

**Rever quando** nunca: é uma conveniência de desenvolvimento que pode ser removida sem tocar no resto.

## 0003. Drizzle ORM com migrações SQL versionadas

**Decisão.** O esquema é definido em TypeScript (`src/server/db/schema.ts`), as consultas usam o construtor de consultas do Drizzle e as migrações são arquivos SQL gerados em `drizzle/` e versionados no repositório.

**Alternativas.**
- *Prisma.* Mais popular, mas depende de um motor próprio e não tem driver para PGlite com a mesma maturidade, o que derrubaria a decisão 0002.
- *Kysely ou SQL puro.* Menos camadas, porém sem geração de migrações a partir do esquema.

**Detalhes que valem avaliar.**
- Enumerações (papel, prioridade, categoria de etapa) são colunas de texto tipadas no TypeScript e validadas com Zod na entrada. Acrescentar um valor é mudança de código, sem `ALTER TYPE`. O custo é o banco não recusar um valor inválido gravado por fora do app.
- Chaves primárias são UUID. O número visível da tarefa (`TECH-12`) vem de um contador por projeto, incrementado na mesma transação da inserção.

## 0004. Autenticação própria: sessões no banco, scrypt e convites por link

**Contexto.** É uma ferramenta interna: sem cadastro aberto e com poucas dezenas de contas.

**Decisão.**
- Senhas com scrypt (`node:crypto`), com os parâmetros gravados junto do hash, para poder aumentar o custo depois sem migração.
- Sessão é um token aleatório em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, válido por 30 dias. O banco guarda só o SHA-256 do token.
- Entrada de pessoas por convite: o administrador cria a conta e recebe um link válido por 7 dias, que a pessoa usa para definir a senha. **O app não envia e-mail**; o administrador repassa o link.
- A primeira conta é criada na tela `/setup`, que só funciona enquanto não existe nenhum usuário.
- Limite de 10 tentativas de login por endereço e e-mail a cada 15 minutos, em memória.

**Alternativas.**
- *Auth.js, Clerk, Auth0.* Resolveriam login social e SSO, mas acrescentam um serviço externo ou uma biblioteca grande para um fluxo que aqui cabe em duas centenas de linhas.
- *JWT sem estado.* Não permite encerrar uma sessão na hora (logout, conta desativada) sem uma lista de revogação, que é um banco de sessões com outro nome.
- *Login com Google ou com Slack.* É o próximo passo natural (veja o roadmap); ficou de fora para não depender de credenciais OAuth que só a empresa pode criar.
- *bcrypt ou argon2.* Exigem módulo nativo; scrypt já vem no Node.

**Custo.** Sem "esqueci minha senha": hoje o administrador não tem como redefinir a senha de outra pessoa pela interface. Sem segundo fator. O limite de tentativas vale por processo: com mais de uma instância, precisa de um armazenamento compartilhado. `/setup` fica aberto ao primeiro visitante de uma instalação nova, então a conta de administrador deve ser criada logo após publicar.

**Rever quando** a empresa quiser SSO, ou antes de expor o app fora de uma rede confiável sem ter resolvido a recuperação de senha.

## 0005. Permissões em funções puras, aplicadas na camada de serviços

**Decisão.** Quatro papéis na empresa (administrador, gestor, membro, convidado), dois papéis dentro do time (líder, integrante) e duas visibilidades de projeto (aberto para a empresa, restrito ao time). As regras são funções puras em `src/lib/permissions.ts`. Os serviços as aplicam em toda operação; a interface usa as mesmas funções só para esconder o que a pessoa não pode fazer. A tabela está em [PERMISSIONS.md](PERMISSIONS.md).

**Escolhas dentro da decisão.**
- Um projeto que a pessoa não pode ver responde "não encontrado", não "proibido", para não revelar que existe. Vale o mesmo para projetos arquivados.
- Convidado só lê e comenta, só nos projetos dos times em que foi incluído. Na lista de pessoas e nos filtros de responsável, só enxerga quem divide um time com ele, além de quem já aparece como responsável nas tarefas que ele pode abrir. Pensado para freelancers e parceiros.
- Um convidado pode ser responsável por uma tarefa, mas não pode mudar a etapa dela: ele avisa por comentário e alguém do time move. É uma consequência de "só lê e comenta" que pode incomodar no uso com freelancers; a alternativa seria um papel intermediário que edita apenas as próprias tarefas.
- Só pode ser responsável por uma tarefa quem enxerga o projeto dela.
- Qualquer membro que enxerga um projeto pode editar as tarefas dele. Não há permissão por tarefa nem por campo.
- Não é possível rebaixar ou desativar o último administrador ativo.

**Alternativas.**
- *Permissões configuráveis por projeto, como no Jira.* Muito mais flexível e muito mais difícil de explicar e de testar. Quatro papéis fixos cobrem o que foi pedido.
- *Biblioteca de políticas (CASL, Casbin).* As regras cabem em 70 linhas legíveis; uma biblioteca não acrescentaria nada.
- *Row-Level Security do Postgres.* Protege mesmo contra erro de programação, mas complica o uso do pool de conexões e não funciona igual no PGlite.

**Custo.** A segurança depende de todo serviço chamar a verificação. A mitigação é estrutural (todo serviço recebe o ator como primeiro argumento) e por testes (`tests/permissions.test.ts`, `tests/services.test.ts`).

## 0006. Etapas livres por projeto, agrupadas em três categorias

**Contexto.** Um time de tecnologia trabalha com "Code review" e "QA"; um canal de YouTube, com "Roteiro" e "Thumbnail e SEO". O painel, porém, precisa somar tudo.

**Decisão.** Cada projeto define as próprias etapas, com nome e ordem livres, e cada etapa pertence a uma de três categorias: *a fazer*, *em andamento*, *concluído*. Painel, relatórios e MCP agregam pela categoria. Há sete modelos de projeto (tecnologia, marketing, editorial, social media, YouTube, criação de conteúdo e geral) que preenchem etapas e etiquetas ao criar o projeto; depois disso o projeto é independente do modelo.

**Alternativas.**
- *Etapas fixas para todos (como o Trello básico).* Simples, mas não serve a times diferentes.
- *Campos personalizados e tipos de tarefa (ClickUp, Jira).* É o que mais diferencia essas ferramentas e também o que mais as torna pesadas. Ficou no roadmap.

**Custo.** Mudar a categoria de uma etapa reclassifica as tarefas que estão nela (a data de conclusão é preenchida ou apagada). Uma etapa só pode ser excluída quando está vazia.

## 0007. Slack por HTTP direto, sem o SDK oficial

**Decisão.** A integração usa quatro métodos da Web API do Slack (`chat.postMessage`, `views.open`, `users.info`, `users.lookupByEmail`), chamados com `fetch`, mais a verificação de assinatura das requisições recebidas. As contas são casadas pelo e-mail e o vínculo é gravado no primeiro contato. Tudo o que alguém faz pelo Slack roda com as permissões da conta BARCA dessa pessoa.

O que existe: `/barca` (abre o formulário), `/barca SIGLA título` (cria direto), `/barca minhas` (lista), atalho global, atalho de mensagem ("Criar tarefa no BARCA"), aviso por mensagem direta (tarefa atribuída, comentário, mudança de etapa) e aviso no canal do projeto (tarefa criada, tarefa concluída).

**Alternativas.**
- *Bolt (SDK oficial).* Traz servidor HTTP próprio e várias dependências para algo que aqui são duas rotas. Verificar a assinatura são dez linhas.
- *Socket Mode.* Dispensa URL pública, mas exige uma conexão permanente, o que não combina com um app web comum.
- *Webhook de entrada (só notificações).* Não permite criar tarefas a partir do Slack, que foi pedido.
- *Instalação por OAuth.* Necessária para distribuir o app a várias empresas; para um único workspace, o token do bot em variável de ambiente basta.

**Custo.** O `trigger_id` do Slack expira em três segundos, então abrir o formulário é feito dentro da requisição; uma primeira chamada lenta (servidor frio) pode falhar e a pessoa precisa repetir o comando. Sem sincronização no sentido contrário: responder na conversa do Slack não vira comentário.

**Não verificado.** As rotas foram testadas com requisições assinadas simuladas e testes automatizados com a API do Slack substituída. **Nenhuma chamada foi feita ao Slack real**; o primeiro uso deve seguir o roteiro de [integrations/slack.md](integrations/slack.md).

## 0008. Shopify e Guru por webhooks, com regras de automação

**Contexto.** A empresa vende assinaturas pela Shopify e pela Digital Manager Guru. O pedido foi aproveitar o que essas plataformas tiverem de útil para a gestão de projetos.

**Decisão.** O que é útil para um gestor de projetos não é replicar o painel financeiro dessas plataformas, e sim duas coisas:

1. **Eventos que geram trabalho.** Um chargeback, uma falha de cobrança, um produto novo: cada um pode criar uma tarefa no projeto certo, com responsável e prioridade, por meio de regras configuráveis (evento → projeto, título com variáveis como `{{customer_name}}`).
2. **Contexto para ler o progresso.** Contagens diárias de assinaturas iniciadas e canceladas, vendas, reembolsos e chargebacks aparecem no painel (para gestores e administradores) e no MCP, para cruzar entregas com resultado.

Tecnicamente: cada plataforma tem um adaptador que valida a origem (HMAC do corpo, na Shopify; `api_token` no corpo, na Guru) e converte o payload em um evento neutro. Um único motor grava o evento uma vez (reenvios são descartados pelo identificador de entrega), atualiza os contadores diários e executa as regras.

**Alternativas.**
- *Consultar as APIs periodicamente.* Daria números exatos (MRR, base ativa), mas exige credenciais de API, agendador e tratamento de paginação e limites. Webhooks dão o que interessa a este produto com muito menos.
- *Ações fixas no código, sem regras.* Cada empresa quer tarefas diferentes para cada evento; regras resolvem sem mexer em código.
- *Vincular tarefas a clientes ou pedidos, como um CRM.* Fora do escopo de uma ferramenta de projetos.

**Custo.**
- Os números do painel são **contagens de webhooks recebidos a partir da conexão**, não a verdade financeira. Não há carga do histórico nem reconciliação. Servem para tendência, não para fechamento.
- Tarefas criadas por regra não têm autor (aparecem como criadas pela Shopify ou pela Guru).
- O token da Guru trafega dentro de cada payload; ele é removido antes de gravar o evento.

**Não verificado.** O mapeamento dos campos da Guru foi escrito a partir da documentação pública (webhooks de assinatura e de transação) e **não foi conferido com um payload real**. Os tópicos de assinatura da Shopify (`subscription_contracts/*`, `subscription_billing_attempts/*`) só são entregues a apps com acesso à API de assinaturas. Antes de confiar, envie um evento de teste de cada plataforma e confira o resultado em Integrações → Eventos recentes.

## 0009. MCP por HTTP sem estado, com tokens pessoais

**Contexto.** Pessoas de fora do time técnico devem poder pedir a um assistente de IA um relatório de progresso, sem exportar dados à mão.

**Decisão.**
- Servidor MCP no próprio app, em `POST /api/mcp`, com o transporte Streamable HTTP do SDK oficial em modo sem estado (cada requisição é independente, resposta em JSON).
- Autenticação por **token pessoal** (`barca_pat_…`), criado em Configurações. O banco guarda só o hash; o token é mostrado uma vez. Cada token tem escopo de leitura ou de leitura e escrita, e pode ser revogado.
- O assistente age como a pessoa dona do token: as ferramentas chamam os mesmos serviços da interface, com as mesmas permissões. Com token de leitura, as ferramentas de escrita nem são anunciadas.
- Oito ferramentas de leitura (`whoami`, `list_projects`, `list_teams`, `list_members`, `search_tasks`, `get_task`, `get_workspace_report`, `get_business_metrics`), três de escrita (`create_task`, `update_task`, `add_comment`) e um prompt pronto (`relatorio_semanal`). `get_workspace_report` usa o mesmo cálculo do painel, então os números da tela e os do assistente coincidem.

**Alternativas.**
- *Servidor MCP local (stdio), instalado na máquina de cada pessoa.* Exige Node e configuração em cada computador, e acesso ao banco ou a uma API. Um endereço HTTP e um token são mais simples para quem não é técnico.
- *OAuth 2.1 como na especificação de autorização do MCP.* É o caminho para conectores publicados em diretórios de clientes de IA; pede servidor de autorização, registro dinâmico de clientes e telas de consentimento. Token pessoal funciona hoje em todos os clientes que aceitam cabeçalhos.
- *Sessões com SSE.* Só seriam necessárias se o servidor enviasse notificações por conta própria.
- *API REST pública, com o MCP por cima.* Duplicaria a superfície sem um consumidor para a API.

**Custo.** Clientes que só aceitam conectores com OAuth (o diretório de conectores do Claude na web, por exemplo) não conseguem conectar diretamente. O token dá acesso equivalente ao da pessoa: deve ser tratado como senha. Não há ferramenta para excluir tarefas nem para gerenciar pessoas, de propósito. Não há limite de requisições por token.

## 0010. Uma camada de serviços para todas as entradas

**Decisão.** Toda regra de negócio fica em `src/server/services`. Interface (Server Actions), Slack, webhooks e MCP são adaptadores finos que convertem a entrada, chamam um serviço e formatam a saída. Todo serviço recebe o ator, valida a entrada com Zod, verifica a permissão e lança `AppError` com um código (`not_found`, `forbidden`, `invalid`, `conflict`, `unauthorized`) e uma mensagem em português que pode ser mostrada ao usuário. Erros inesperados são registrados no servidor e viram uma mensagem genérica.

**Por quê.** Com quatro portas de entrada, a alternativa seria repetir validação e permissão em quatro lugares, e mais cedo ou mais tarde uma delas ficaria para trás. Assim, uma tarefa criada pelo Slack, pelo assistente de IA ou pela tela passa pelo mesmo código, gera o mesmo histórico e as mesmas notificações.

**Custo.** Os serviços devolvem estruturas pensadas para a interface; o MCP as reformata. Não há camada de repositório separada: os serviços falam direto com o Drizzle.

## 0011. Markdown como formato de texto e imagens como arquivos enviados

**Decisão.** Descrições e comentários são guardados como Markdown (com tabelas, listas de tarefas e riscado, via `remark-gfm`) e exibidos com `react-markdown`. O editor é um campo de texto com abas Escrever e Visualizar. Ao colar, arrastar ou escolher uma imagem, o editor insere um marcador, envia o arquivo para `/api/uploads` e troca o marcador por `![nome](/api/files/…)`.

**Alternativas.**
- *Editor visual (TipTap, Lexical, BlockNote).* Mais amigável para quem não conhece Markdown, o que pesa em times de marketing e editorial. Em troca: um formato próprio de documento, um pacote grande e muito mais superfície de bugs. Markdown puro também é o que o Slack e os assistentes de IA escrevem e leem melhor. **É a decisão de interface mais discutível deste projeto**; se os times não técnicos rejeitarem, a troca fica contida em um componente (`markdown-editor.tsx`), mantendo Markdown como formato gravado.
- *Imagens embutidas em base64 no texto.* Simples e sem armazenamento, mas incha o banco e todas as respostas que carregam o texto.

**Segurança.** HTML dentro do Markdown não é interpretado. O tipo da imagem é identificado pelos primeiros bytes, não pela extensão nem pelo tipo declarado; só PNG, JPEG, GIF e WebP, até 10 MB. Os arquivos são servidos com `nosniff` e uma política que impede execução.

**Custo.**
- Os arquivos ficam em disco local (`UPLOAD_DIR`). Isso exige disco persistente e uma única instância, ou um volume compartilhado. O acesso ao disco está isolado em `src/server/services/files.ts` para a troca por S3.
- **Qualquer pessoa autenticada que tenha o endereço de uma imagem consegue abri-la**, mesmo sem acesso ao projeto. O endereço é um UUID impossível de adivinhar, mas não há verificação por projeto.
- Imagens de tarefas excluídas não são apagadas do disco.

## 0012. Kanban com posição fracionária e dnd-kit

**Decisão.** A ordem dos cartões em uma coluna é um número decimal. Soltar um cartão entre dois vizinhos grava a média das posições deles: uma única linha é atualizada. A interface move o cartão na hora e confirma com o servidor; se o servidor recusar, a tela volta ao estado real e mostra o erro. O arrastar e soltar usa dnd-kit, que funciona com mouse, toque e teclado.

**Alternativas.**
- *Posições inteiras, renumerando a coluna a cada movimento.* Várias linhas atualizadas por movimento e conflitos quando duas pessoas mexem na mesma coluna.
- *Chaves de ordenação em texto (LexoRank, fractional-indexing).* Não esgotam a precisão, ao custo de mais código. Com números decimais, dividir o mesmo intervalo cerca de 50 vezes seguidas esgota a precisão; na prática isso pede dezenas de inserções exatamente no mesmo ponto, e ainda não há rotina de renumeração.
- *HTML5 drag and drop nativo ou `@hello-pangea/dnd`.* O nativo não funciona bem em toque; o segundo não acompanhou as versões novas do React com a mesma velocidade.

**Custo.** Sem tempo real (0014): se duas pessoas movem cartões ao mesmo tempo, cada uma vê o resultado da outra só ao recarregar ou na próxima ação.

## 0013. Referências curtas, um nível de subtarefas e painel lateral pela URL

**Decisão.**
- Cada projeto tem uma sigla e cada tarefa um número sequencial dentro dele: `TECH-12`, como no Jira. A referência aparece no Slack, no MCP e no endereço `/t/TECH-12`.
- Subtarefas têm **um nível só**. Uma subtarefa é uma tarefa completa (responsável, prazo, etapa), mas não pode ter subtarefas.
- A tarefa abre em um painel lateral sobre a página atual, controlado pelo parâmetro `?task=TECH-12`. O endereço pode ser copiado e o botão Voltar fecha o painel.

**Alternativas.**
- *Hierarquia livre (ClickUp).* Complica quadro, relatórios e permissões, e na prática vira bagunça. Um nível cobre o caso de lista de verificação com responsáveis.
- *Página própria para a tarefa.* Perde-se o contexto do quadro a cada clique.
- *Rotas interceptadas do Next para o painel.* É o mecanismo "oficial", mas acrescenta rotas paralelas em cada tela onde uma tarefa pode abrir. Um parâmetro de URL lido por um componente global resolve com uma fração do código.

**Custo.** A sigla do projeto não pode ser alterada depois de criado. Mover tarefas entre projetos não existe.

## 0014. Páginas renderizadas por requisição, sem cache de dados e sem tempo real

**Decisão.**
- O Next 16 roda com Cache Components ligado. Cada página tem uma casca estática (esqueleto) e o conteúdo é gerado por requisição, dentro de `<Suspense>`. **Nenhum dado é guardado em cache**: toda leitura vai ao banco.
- Toda leitura autenticada passa por `getCurrentUser()`, que chama `connection()` antes de tocar no banco. Sem isso, o Next tenta pré-renderizar a página durante o build ou a pré-carga de links, e acessar o banco nesse momento é um erro.
- Depois de cada mudança, a Server Action chama `refresh()` e a tela atual é atualizada.
- **Não há tempo real.** O que outra pessoa fez aparece na próxima navegação ou ação.

**Alternativas.**
- *Cache com invalidação por etiqueta (`'use cache'`, `updateTag`).* Reduz a carga no banco, mas num sistema em que quase tudo depende de quem está olhando (permissões) e muda o tempo todo, o risco de mostrar dado velho ou de outra pessoa supera o ganho nesta escala.
- *WebSocket ou SSE para tempo real.* Asana, Jira e Monday têm. Exige um canal de publicação entre instâncias (Postgres `LISTEN/NOTIFY` ou Redis) e reconciliação no cliente. Ficou no roadmap como o primeiro item de maior impacto.
- *Cliente com React Query consumindo uma API.* Daria revalidação periódica com pouco esforço, mas exigiria expor toda a leitura como API, contrariando 0001.

**Custo.** Como a casca é enviada antes de saber quem está olhando, uma página inexistente ou uma sessão expirada responde HTTP 200 com o redirecionamento ou o "não encontrado" dentro do conteúdo. Nenhum dado vaza (a casca não contém dados), mas ferramentas que olham só o código HTTP veem 200. As rotas de API respondem com os códigos corretos.

## 0015. Efeitos colaterais em segundo plano no próprio processo

**Decisão.** Enviar mensagens ao Slack não pode atrasar nem derrubar a ação que as provocou. Esses efeitos rodam depois da resposta, com `after()` do Next, e falhas são apenas registradas no log.

**Alternativas.** Fila durável (pg-boss sobre o próprio Postgres, BullMQ com Redis, ou um serviço como Inngest). Garante reenvio e sobrevive a reinícios, ao custo de um processo trabalhador e de mais infraestrutura.

**Custo.** Se o processo cair entre a resposta e o envio, a notificação do Slack se perde (a notificação dentro do app já foi gravada antes). Não há reenvio. Também não existe agendador: **lembretes de prazo e resumos diários não foram feitos**, porque dependem dele. Em plataformas serverless, `after()` depende de suporte da plataforma.

**Rever quando** entrarem lembretes de prazo, ou quando perder um aviso do Slack passar a ser um problema.

## 0016. Interface em português, tema claro e componentes próprios

**Decisão de produto, tomada sem consulta.** O pedido veio em inglês, mas a empresa opera em português (Guru, regra de responder em português). A interface, as mensagens de erro, os textos do Slack, as descrições das ferramentas MCP e esta documentação estão em **português do Brasil**; código e comentários, em inglês. Os textos estão escritos direto nos componentes, sem camada de tradução. Datas usam o fuso `America/Sao_Paulo`, fixo.

**Decisão técnica.** Tailwind CSS 4 com um conjunto pequeno de componentes próprios (`src/components/ui.tsx`), ícones do lucide e gráficos com Recharts. Só tema claro.

**Alternativas.**
- *Inglês, ou i18n desde o início (next-intl).* Se parte do time não lê português, a troca exige extrair os textos de cerca de 30 arquivos; é trabalho mecânico, mas não é pequeno.
- *shadcn/ui, Radix, MUI.* Aceleram e trazem acessibilidade testada (foco em modais, menus, seletores). Os componentes próprios mantêm o pacote pequeno e o visual sob controle, mas a acessibilidade ficou no básico: rótulos, foco visível, Esc para fechar, arrastar pelo teclado. Não houve teste com leitor de tela.

**Rever quando** o time pedir inglês, tema escuro, ou quando a manutenção dos componentes próprios começar a custar mais do que adotar uma biblioteca.

## 0017. Testes com Vitest e banco em memória

**Decisão.** Os testes exercitam os serviços de verdade contra um Postgres real em memória (PGlite), sem dublês de banco: 54 testes cobrindo permissões, serviços, webhooks, Slack (com a API do Slack substituída) e MCP (cliente e servidor ligados em memória). Os arquivos rodam em série, porque cada um sobe uma instância do PGlite e várias em paralelo esgotam a memória do processo.

**Alternativas.** Dublês do banco (rápidos, mas não pegam erro de SQL); Postgres em contêiner (fiel, mas exige Docker para rodar os testes).

**O que falta.** Não há testes automatizados de interface (Playwright). A interface foi verificada à mão em navegador, como descrito em [VERIFICATION.md](VERIFICATION.md). Não há integração contínua configurada.

## 0018. Uma instalação por empresa

**Decisão de produto, tomada sem consulta.** O sistema atende uma empresa por instalação: não existe o conceito de organização ou workspace nas tabelas. Times são a unidade de separação interna.

**Alternativa.** Multi-inquilino (várias empresas no mesmo banco), necessário para vender o BARCA PM como serviço. Exige uma coluna de organização em quase todas as tabelas e em todas as consultas.

**Custo.** Se o plano for oferecer o produto a outras empresas, essa é a mudança estrutural mais cara desta lista; quanto antes for decidida, mais barata.

## 0019. Relatórios calculados sob demanda

**Decisão.** O painel e o relatório do MCP são calculados a cada acesso por uma única função (`getWorkspaceReport`), a partir das tarefas abertas e das criadas ou concluídas na janela do relatório. O tempo médio de conclusão é a média de dias entre criação e conclusão das tarefas concluídas no período. Os indicadores do negócio são a exceção: ficam em uma tabela de contadores diários, atualizada a cada webhook.

**Alternativas.** Tabelas de resumo ou visões materializadas atualizadas por agendador; um banco analítico separado.

**Custo.** O tempo de resposta do painel cresce com o número de tarefas abertas. Para o porte esperado (dezenas de pessoas, alguns milhares de tarefas abertas) é uma consulta simples; não foi medido com volume real. Não há histórico de etapas por dia, então gráficos como fluxo acumulado e burndown não são possíveis sem passar a registrar esse histórico.
