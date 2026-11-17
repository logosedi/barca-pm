# Slack

O que a integração faz:

| No Slack | Resultado |
| --- | --- |
| `/barca` | Abre o formulário "Nova tarefa" (projeto, título, descrição, prioridade, responsável, prazo) |
| `/barca TECH Corrigir login` | Cria a tarefa direto no projeto de sigla TECH |
| `/barca minhas` | Lista as suas tarefas em aberto, com link |
| `/barca ajuda` | Mostra os comandos |
| Menu "⋯" de uma mensagem → **Criar tarefa no BARCA** | Abre o formulário com o texto da mensagem como título e descrição |
| Atalho global **Nova tarefa** | Abre o formulário vazio |
| Mensagem direta do app | Avisa quando uma tarefa é atribuída a você, quando comentam e quando mudam de etapa uma tarefa sua |
| Canal do projeto | Avisa quando uma tarefa é criada ou concluída no projeto |

Cada pessoa age no Slack com as permissões da conta BARCA PM que tem **o mesmo e-mail** do perfil dela no Slack. Quem não tem conta recebe uma mensagem pedindo um convite.

> **Estado da verificação.** As rotas foram exercitadas com testes automatizados e requisições assinadas simuladas. A integração ainda **não foi usada com um workspace real do Slack**. Siga o roteiro de teste no fim deste documento na primeira conexão.

## 1. Criar o app

O Slack precisa alcançar o BARCA PM por um endereço público em HTTPS. Para testar em uma máquina local, use um túnel (ngrok, Cloudflare Tunnel) e coloque o endereço do túnel em `APP_URL`.

1. Abra https://api.slack.com/apps → **Create New App** → **From an app manifest**.
2. Escolha o workspace e cole o manifesto abaixo, trocando `SEU-DOMINIO` nos dois endereços.

```yaml
display_information:
  name: BARCA PM
  description: Crie tarefas e receba avisos do BARCA PM
features:
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: true
  bot_user:
    display_name: BARCA PM
    always_online: true
  shortcuts:
    - name: Nova tarefa
      type: global
      callback_id: barca_new_task
      description: Cria uma tarefa no BARCA PM
    - name: Criar tarefa no BARCA
      type: message
      callback_id: barca_task_from_message
      description: Transforma esta mensagem em tarefa
  slash_commands:
    - command: /barca
      url: https://SEU-DOMINIO/api/slack/commands
      description: Criar e consultar tarefas do BARCA PM
      usage_hint: "[SIGLA título] | minhas | ajuda"
      should_escape: false
oauth_config:
  scopes:
    bot:
      - commands
      - chat:write
      - users:read
      - users:read.email
settings:
  interactivity:
    is_enabled: true
    request_url: https://SEU-DOMINIO/api/slack/interactions
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

Os identificadores `barca_new_task` e `barca_task_from_message` precisam ser exatamente esses: é por eles que o BARCA PM reconhece os atalhos.

Para que servem as permissões:

| Permissão | Uso |
| --- | --- |
| `commands` | Comando `/barca` e atalhos |
| `chat:write` | Enviar mensagens diretas e avisos nos canais |
| `users:read`, `users:read.email` | Ler o e-mail do perfil para casar a pessoa com a conta do BARCA PM |

3. Em **Install App**, instale no workspace.

## 2. Configurar o BARCA PM

Defina no servidor e reinicie o app:

| Variável | Onde encontrar no Slack |
| --- | --- |
| `SLACK_BOT_TOKEN` | **OAuth & Permissions** → Bot User OAuth Token (começa com `xoxb-`) |
| `SLACK_SIGNING_SECRET` | **Basic Information** → App Credentials → Signing Secret |
| `APP_URL` | O endereço público do BARCA PM; é usado nos links das mensagens |

A página **Integrações** do BARCA PM passa a mostrar o Slack como configurado.

## 3. Avisos no canal do projeto

1. No Slack, abra o canal, clique no nome dele e copie o **ID do canal** no rodapé (algo como `C0123ABCDEF`).
2. No BARCA PM, abra o projeto → **Configurações** → campo do canal do Slack, e cole o ID.
3. Convide o app para o canal: `/invite @BARCA PM`. Sem isso, o Slack recusa as mensagens (o erro aparece só no log do servidor).

## 4. Notificações pessoais

Cada pessoa liga ou desliga as mensagens diretas em **Configurações → Perfil**. As notificações dentro do BARCA PM continuam chegando de qualquer forma. Ninguém é avisado das próprias ações.

## Roteiro de teste da primeira conexão

1. `/barca ajuda` responde com a lista de comandos. Se responder "dispatch_failed" ou nada, confira o endereço do comando e o `SLACK_SIGNING_SECRET`.
2. `/barca minhas` lista as suas tarefas. Se disser que não encontrou a sua conta, o e-mail do Slack é diferente do e-mail no BARCA PM.
3. `/barca` abre o formulário. Se nada abrir, veja o log do servidor: o Slack dá três segundos para abrir o formulário, e a primeira chamada depois de um reinício pode passar disso. Repita o comando.
4. Crie uma tarefa pelo formulário com outra pessoa como responsável: você recebe a confirmação e ela recebe o aviso, ambos por mensagem direta.
5. Use **Criar tarefa no BARCA** em uma mensagem.
6. Crie uma tarefa em um projeto com canal configurado e confira o aviso no canal.

## Limites

- Só um workspace do Slack por instalação.
- Responder a um aviso no Slack não cria comentário no BARCA PM.
- Avisos são enviados depois da resposta ao usuário, sem reenvio: se o Slack estiver fora do ar no momento, o aviso do Slack se perde (o do BARCA PM fica).
- O formulário lista no máximo 100 projetos.
- Não há lembretes de prazo nem resumo diário (veja o [roadmap](../ROADMAP.md)).
