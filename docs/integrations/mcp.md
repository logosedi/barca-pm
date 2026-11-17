# MCP: BARCA PM para assistentes de IA

O BARCA PM expõe um servidor [MCP](https://modelcontextprotocol.io) em `https://SEU-DOMINIO/api/mcp`. Com ele, um assistente de IA (Claude, Cursor e outros clientes MCP) pode consultar projetos e tarefas, montar relatórios de progresso e, se a pessoa permitir, criar e atualizar tarefas.

O assistente age **em nome de quem criou o token** e enxerga exatamente o que essa pessoa enxerga no BARCA PM. Os números do relatório são calculados pela mesma função que alimenta o painel.

> **Estado da verificação.** O servidor foi testado de ponta a ponta com o cliente do SDK oficial de MCP sobre HTTP (listar ferramentas, relatório, busca, criar, comentar e mover tarefa, recusa sem token) e com testes automatizados. As configurações de cliente abaixo seguem a documentação de cada produto e **não foram testadas com os aplicativos em si**.

## 1. Criar um token

No BARCA PM: **Configurações → Tokens de acesso para IA (MCP)**.

- **Somente leitura** basta para relatórios e consultas.
- **Leitura e escrita** também permite criar tarefas, atualizar e comentar, dentro do que o papel da pessoa permite.

O token (`barca_pat_…`) aparece uma única vez. Trate como uma senha: quem tiver o token acessa o BARCA PM como você. Para cancelar, use **Revogar** na mesma tela.

## 2. Conectar o cliente

**Cursor** (`.cursor/mcp.json` no projeto, ou `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "barca-pm": {
      "url": "https://SEU-DOMINIO/api/mcp",
      "headers": { "Authorization": "Bearer barca_pat_..." }
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add --transport http barca-pm https://SEU-DOMINIO/api/mcp \
  --header "Authorization: Bearer barca_pat_..."
```

**Clientes que só aceitam servidores locais** (Claude Desktop, por exemplo) podem usar a ponte `mcp-remote`:

```json
{
  "mcpServers": {
    "barca-pm": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://SEU-DOMINIO/api/mcp", "--header", "Authorization:${BARCA_AUTH}"],
      "env": { "BARCA_AUTH": "Bearer barca_pat_..." }
    }
  }
}
```

Conectores que exigem login por OAuth (como os adicionados pela interface web de alguns assistentes) **não são suportados**: o servidor aceita apenas o token no cabeçalho `Authorization`. O motivo está na decisão [0009](../DECISIONS.md#0009-mcp-por-http-sem-estado-com-tokens-pessoais).

## 3. O que pedir

- "Faça o relatório semanal do time de Marketing." (há um prompt pronto, `relatorio_semanal`)
- "Quais tarefas estão atrasadas e quem é o responsável por cada uma?"
- "Compare o que o time de Tecnologia concluiu neste mês com o mês passado."
- "O que mudou na TECH-12 desde que foi criada?"
- "Os cancelamentos de assinatura subiram nas últimas duas semanas? Havia alguma entrega atrasada nesse período?" (gestores e administradores)
- "Crie uma tarefa no projeto YT para gravar o vídeo de lançamento, para a Camila, com prazo na sexta." (token de leitura e escrita)

## Ferramentas

### Leitura

| Ferramenta | O que devolve | Parâmetros |
| --- | --- | --- |
| `whoami` | Dono do token, papel, escopo do token e a data de hoje | |
| `list_projects` | Projetos visíveis, com time, etapas, etiquetas e contagem de tarefas | |
| `list_teams` | Times, disciplina e integrantes | |
| `list_members` | Pessoas ativas, com e-mail, papel e times | |
| `search_tasks` | Até 100 tarefas, das atualizadas mais recentemente para as mais antigas | `project_key`, `status_category`, `open_only`, `assignee_email` (ou `me`), `unassigned`, `priority`, `overdue`, `due_from`, `due_to`, `completed_from`, `completed_to`, `updated_since`, `query`, `limit` |
| `get_task` | Uma tarefa completa: descrição, subtarefas, comentários e histórico | `ref` |
| `get_workspace_report` | Indicadores de um período (padrão: últimos 30 dias): abertas, em andamento e atrasadas agora; criadas e concluídas no período; período anterior; tempo médio de conclusão; evolução semanal; divisão por projeto, time e pessoa; listas de atrasadas e concluídas | `from`, `to`, `team_name`, `project_key` |
| `get_business_metrics` | Eventos da Shopify e da Guru por dia e no total (só gestores e administradores) | `from`, `to` |

### Escrita (só com token de leitura e escrita)

| Ferramenta | O que faz | Parâmetros |
| --- | --- | --- |
| `create_task` | Cria uma tarefa, ou uma subtarefa se `parent_ref` for informado | `project_key`, `title`, `description`, `status_name`, `priority`, `assignee_email`, `due_date`, `parent_ref` |
| `update_task` | Altera só os campos informados; `status_name` move de etapa | `ref`, `title`, `description`, `status_name`, `priority`, `assignee_email`, `due_date` |
| `add_comment` | Comenta em uma tarefa (Markdown); os envolvidos são notificados | `ref`, `body` |

Datas usam o formato `AAAA-MM-DD`. Tarefas criadas pelo assistente ficam marcadas com a origem "Assistente de IA (MCP)" e aparecem no histórico em nome do dono do token.

## Comportamento e limites

- Com um token somente leitura, as ferramentas de escrita nem aparecem para o assistente.
- Erros esperados (tarefa inexistente, sem permissão, etapa que não existe no projeto) voltam como mensagem em português que o assistente consegue interpretar e corrigir.
- Convidados não listam pessoas nem times.
- De propósito, não há ferramentas para excluir tarefas, gerenciar pessoas ou alterar configurações.
- O servidor não guarda sessão: cada chamada é independente, só `POST` é aceito, e não há notificações enviadas pelo servidor.
- Não há limite de requisições por token.
- O conteúdo das tarefas é texto escrito por pessoas (e por webhooks). Um assistente que lê esse conteúdo pode ser induzido por instruções escritas dentro de uma tarefa. Para uso apenas de relatórios, prefira tokens somente leitura.
