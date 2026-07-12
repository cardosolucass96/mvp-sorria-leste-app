# Sorria Leste MCP

Servidor MCP remoto para o Codex/ChatGPT consultar a operação da Sorria Leste. Ele roda como um Cloudflare Worker separado da aplicação Next.js, usa OAuth próprio, D1 direto com queries preparadas e KV para o fluxo de autorização.

## Escopo v2

Este MCP é somente leitura operacional. Ele ajuda a consultar agenda, fila, follow-ups não financeiros, clientes, equipe, categorias, atendimentos, termos e catálogo.

Ele não é financeiro e não é clínico:

- Não retorna pagamentos, saldo, caixa, comissões, descontos, preços de catálogo, valores de atendimento ou valores de procedimento.
- Não retorna prontuários, notas clínicas, anexos/R2, observações clínicas sensíveis ou HTML completo dos termos.
- Follow-ups do tipo `cobranca` são rejeitados/omitidos.
- CPF, telefone e e-mail de clientes são mascarados.
- Toda resposta passa por uma guarda final que remove chaves financeiras como `valor`, `pagamento`, `saldo`, `comissao`, `caixa` e `desconto`.
- Toda chamada registra apenas metadados em `mcp_audit_log`: usuário, client id, ferramenta, unidade e sucesso/erro. Não registra payload nem dado pessoal.

## Ferramentas

### Acesso e catálogo

- `minhas_unidades`: unidades liberadas para a conexão.
- `listar_categorias`: categorias ativas, slug, ordem, roles permitidas e `pula_avaliacao`.
- `listar_equipe`: usuários ativos por unidade e/ou role, sem e-mail por padrão.
- `listar_procedimentos`: catálogo ativo sem preço/comissão; retorna id, nome, descrição sanitizada, categoria, `por_dente`, `tem_etapas`, `tem_face` e etapas sem valores.
- `listar_termos`: slug, título, status e atualização dos termos; não retorna HTML.

### Agenda, fila e atendimentos

- `agenda_do_dia`: agenda de uma unidade em uma data, com resumo por status e telefone mascarado.
- `listar_agendamentos`: agenda por período/status.
- `listar_agendamentos_pendentes`: agendamentos pendentes ou sem data, filtráveis por período/status/tipo.
- `painel_fila`: fila agrupada por categoria, parecida com o painel TV.
- `listar_fila_execucao`: itens individuais de execução por categoria e, opcionalmente, executor.
- `listar_atendimentos`: lista atendimentos com status operacional.
- `detalhar_atendimento_operacional`: ficha operacional do atendimento com cliente mascarado, categoria, avaliador, executores, itens, destinos e agendamentos relacionados.
- `resumo_operacional`: resumo simples legado.
- `resumo_operacional_v2`: consolidado por unidade/período com atendimentos, agenda, faltas/cancelamentos, fila atual e follow-ups não financeiros.

### Clientes e follow-ups

- `buscar_clientes`: busca por nome/telefone com PII mascarada.
- `obter_cliente_resumo`: resumo básico legado.
- `perfil_cliente_operacional`: perfil administrativo com origem, plano, cadastro, atendimentos recentes, próximos agendamentos, follow-ups abertos e vínculos.
- `historico_cliente_operacional`: timeline resumida de atendimentos, agendamentos e follow-ups não financeiros.
- `estatisticas_clientes`: agregados de novos clientes por período, origem, sexo e plano odontológico.
- `listar_followups`: follow-ups por unidade/status/tipo/responsável/cliente/período, excluindo cobrança.
- `resumo_followups`: contadores de follow-ups abertos, atrasados, vencendo hoje e concluídos por tipo, excluindo cobrança.

## Exemplos de prompts

```text
Use o MCP sorria-leste e mostre minha agenda de hoje na unidade 1.
```

```text
Mostre a fila de execução da categoria geral na unidade 1.
```

```text
Resumo operacional v2 da unidade 1 hoje, sem financeiro.
```

```text
Busque o perfil operacional do cliente 123.
```

```text
Liste follow-ups atrasados da unidade 1, sem cobranças.
```

## Preparação

1. O ambiente `staging` deve usar D1 separado ou cópia anonimizada. Aplique `lib/migrations/add_mcp_audit.sql` antes de publicar o Worker.
2. Configure o secret, de forma interativa e sem colocá-lo em arquivos versionados:

   ```bash
   npx wrangler secret put MCP_ALLOWED_EMAILS --config workers/sorria-leste-mcp/wrangler.jsonc --env staging
   ```

   Informe o e-mail do administrador que poderá conectar o Codex. Para mais de um, use uma lista separada por vírgulas.
3. Gere os tipos e valide:

   ```bash
   npm run cf-typegen
   npm run check
   npm test
   npm run deploy:dry-run
   npm run deploy:dry-run:staging
   ```

4. Depois do deploy em staging, conecte o Codex:

   ```bash
   codex mcp add sorria-leste-staging --url https://<worker-staging>/mcp
   codex mcp login sorria-leste-staging
   ```

O fluxo OAuth usa as credenciais do usuário ativo da aplicação exclusivamente na página de consentimento; a senha não é registrada e o Codex recebe apenas tokens OAuth revogáveis.
