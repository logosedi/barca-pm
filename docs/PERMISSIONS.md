# Permissões

As regras ficam em `src/lib/permissions.ts`, são aplicadas pelos serviços em toda operação (interface, Slack e MCP) e testadas em `tests/permissions.test.ts` e `tests/services.test.ts`. As razões estão na decisão [0005](DECISIONS.md#0005-permissões-em-funções-puras-aplicadas-na-camada-de-serviços).

## Papéis

| Papel | Para quem |
| --- | --- |
| **Administrador** | Quem cuida da ferramenta: pessoas, papéis, integrações |
| **Gestor** | Lideranças que precisam ver tudo e acompanhar o negócio |
| **Membro** | Quem executa o trabalho |
| **Convidado** | Freelancers, agências e parceiros: leem e comentam só onde foram incluídos |

Dentro de cada time, uma pessoa é **líder** ou **integrante**. O líder gerencia o time e os projetos do time. Um convidado não pode ser líder.

Um projeto é **aberto para a empresa** ou **restrito ao time**.

## Quem vê cada projeto

| | Administrador | Gestor | Membro | Convidado |
| --- | :-: | :-: | :-: | :-: |
| Projeto aberto, de um time em que a pessoa está | Sim | Sim | Sim | Sim |
| Projeto aberto, de outro time | Sim | Sim | Sim | Não |
| Projeto restrito, de um time em que a pessoa está | Sim | Sim | Sim | Sim |
| Projeto restrito, de outro time | Sim | Sim | Não | Não |

Um projeto que a pessoa não pode ver se comporta como se não existisse: não aparece em listas, buscas, painel ou relatórios, e o endereço direto responde "não encontrado".

## O que cada papel pode fazer

"Líder" significa líder do time dono do projeto (ou do time em questão), com papel de membro.

| Ação | Administrador | Gestor | Líder | Membro | Convidado |
| --- | :-: | :-: | :-: | :-: | :-: |
| Ver tarefas, comentários e histórico dos projetos visíveis | Sim | Sim | Sim | Sim | Sim |
| Comentar (com imagens) | Sim | Sim | Sim | Sim | Sim |
| Criar e editar tarefas, mover cartões | Sim | Sim | Sim | Sim | Não |
| Excluir tarefa | Sim | Sim | Sim | Só as que criou | Não |
| Excluir comentário | Sim | Sim | Sim | Só os próprios | Só os próprios |
| Criar projeto | Sim | Sim | No próprio time | Não | Não |
| Configurar projeto (etapas, etiquetas, visibilidade, canal do Slack, arquivar) | Sim | Sim | Sim | Não | Não |
| Criar e excluir times | Sim | Sim | Não | Não | Não |
| Editar time, incluir e remover integrantes | Sim | Sim | No próprio time | Não | Não |
| Ver a lista de pessoas e de times | Todos | Todos | Todos | Todos | Só os próprios times e quem está neles |
| Convidar pessoas, mudar papéis, desativar contas | Sim | Não | Não | Não | Não |
| Integrações e regras de automação | Sim | Não | Não | Não | Não |
| Indicadores do negócio (Shopify e Guru) | Sim | Sim | Não | Não | Não |
| Painel de progresso | Tudo | Tudo | Projetos visíveis | Projetos visíveis | Projetos visíveis |
| Criar tokens de acesso para IA | Sim | Sim | Sim | Sim | Sim |

## Regras complementares

- **Responsável.** Uma tarefa só pode ser atribuída a quem enxerga o projeto dela e já ativou a conta.
- **Último administrador.** Não é possível rebaixar nem desativar o único administrador ativo, e ninguém desativa a própria conta.
- **Conta desativada.** Perde o acesso na hora (as sessões são encerradas e os tokens param de funcionar). Tarefas e comentários da pessoa são mantidos.
- **Slack.** Quem age pelo Slack tem as permissões da conta BARCA com o mesmo e-mail. Sem conta, o comando é recusado.
- **Tokens de IA.** O assistente pode, no máximo, o que a pessoa dona do token pode. Um token de leitura não cria nem altera nada, mesmo que a pessoa possa. Convidados não listam pessoas nem times pelo MCP.
- **Tarefas criadas por regra de automação** não passam por permissão de usuário: a regra é configurada por um administrador e a tarefa aparece como criada pela Shopify ou pela Guru.

## Limites

- Não há permissão por tarefa ou por campo: quem pode editar tarefas em um projeto pode editar todas.
- Um convidado pode ser responsável por uma tarefa, mas não consegue mudar a etapa nem marcar como concluída: precisa avisar por comentário.
- O convidado vê o nome de quem é responsável, autor ou comentarista nas tarefas que pode abrir, mesmo que a pessoa não seja do time dele.
- Não há papéis personalizados.
- Imagens enviadas não seguem a visibilidade do projeto: qualquer pessoa autenticada com o endereço da imagem consegue abri-la.
