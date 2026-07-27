# Sorria Leste MCP

Servidor MCP remoto para o Codex/ChatGPT consultar a operação da Sorria Leste e executar escrita operacional mínima para SDR IA. Ele roda como um Cloudflare Worker separado da aplicação Next.js, usa OAuth próprio, D1 direto com queries preparadas e KV para o fluxo de autorização.

## Escopo v4

Este MCP tem leitura operacional/financeira e uma escrita V1 bem limitada:

- `sorria.read`: operação diária sem financeiro sensível.
- `sorria.finance.read`: adiciona consultas financeiras e follow-up de cobrança.
- `sorria.write`: permite criar cliente e criar agendamento de avaliação.

O servidor ajuda a consultar agenda, fila, clientes, equipe, categorias, atendimentos, termos, catálogo, follow-ups e, quando autorizado, financeiro. Para SDR IA, a escrita não exige uma nova role: use um usuário ativo `atendente` com nome/e-mail próprios e libere o e-mail via `MCP_WRITE_ALLOWED_EMAILS`.

Para automações server-to-server como n8n, há também um endpoint HTTP direto protegido por API key:

- `POST /api/sdr/lead-avaliacao`: cria cliente e cria agendamento de avaliação em uma chamada.

Ele continua não clínico e não permite escrita fora da V1:

- Não retorna prontuários, notas clínicas, anexos/R2, observações clínicas sensíveis ou HTML completo dos termos.
- Não cria procedimentos, atendimentos, pagamentos, follow-ups, anexos ou qualquer dado clínico.
- CPF, telefone e e-mail de clientes são mascarados.
- No escopo operacional, follow-ups do tipo `cobranca` continuam omitidos e toda resposta passa por uma guarda final que remove chaves financeiras como `valor`, `pagamento`, `saldo`, `comissao`, `caixa` e `desconto`.
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
- `criar_cliente` (`sorria.write`): cria cliente/lead com `nome` e `origem` obrigatórios e campos cadastrais opcionais.
- `criar_agendamento_avaliacao` (`sorria.write`): cria apenas agendamento de avaliação para um cliente e unidade; `dataAgendada` usa `YYYY-MM-DDTHH:mm` no fuso da clínica.
- `obter_cliente_resumo`: resumo básico legado.
- `perfil_cliente_operacional`: perfil administrativo com origem, plano, cadastro, atendimentos recentes, próximos agendamentos, follow-ups abertos e vínculos.
- `historico_cliente_operacional`: timeline resumida de atendimentos, agendamentos e follow-ups não financeiros.
- `estatisticas_clientes`: agregados de novos clientes por período, origem, sexo e plano odontológico.
- `listar_followups`: follow-ups por unidade/status/tipo/responsável/cliente/período, excluindo cobrança.
- `resumo_followups`: contadores de follow-ups abertos, atrasados, vencendo hoje e concluídos por tipo, excluindo cobrança.
- `listar_followups_completos`: versão expandida com descrição, criador, conclusão, busca textual e, quando autorizado, cobrança.
- `detalhar_followup`: detalhe completo de um follow-up por ID; cobrança exige escopo financeiro.

### Financeiro (`sorria.finance.read`)

- `detalhar_atendimento_financeiro`: valores dos itens, pendências, pagamentos, taxas, formas e alocações do atendimento.
- `perfil_cliente_financeiro`: saldo atual, saldo calculado, pendências, atendimentos financeiros, pagamentos recentes e movimentações.
- `resumo_financeiro_unidade`: consolidado financeiro por unidade/período com totais, taxas, cancelamentos, recebimentos por método e por recebedor.

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

```text
Liste follow-ups completos da unidade 1 da atendente 7, incluindo descrição.
```

```text
Resumo financeiro da unidade 1 entre 2026-07-01 e 2026-07-12.
```

```text
Detalhe financeiro do atendimento 123.
```

```text
Use o MCP sorria-leste com sorria.write e cadastre o cliente Ana Teste, origem trafego_meta, telefone (85) 99999-0000.
```

```text
Use o MCP sorria-leste com sorria.write e crie uma avaliação para o cliente 123 na unidade 1 em 2026-08-10T14:30.
```

### Endpoint para n8n

Use `Authorization: Bearer <SDR_API_KEY>` ou `X-API-Key: <SDR_API_KEY>`.

```bash
curl -X POST "https://<worker>/api/sdr/lead-avaliacao" \
  -H "Authorization: Bearer $SDR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Ana Teste",
    "origem": "trafego_meta",
    "telefone": "(85) 99999-0000",
    "email": "ana@example.com",
    "unidadeId": 1,
    "dataAgendada": "2026-08-10T14:30",
    "observacoes": "Lead captado pelo n8n",
    "observacoesAgendamento": "Primeira avaliação"
  }'
```

Campos obrigatórios: `nome`, `origem`, `unidadeId`. Sem `dataAgendada`, o agendamento nasce como `pendente`; com data, nasce como `agendado`. A data usa o fuso da clínica no formato `YYYY-MM-DDTHH:mm`.

## Preparação

1. O ambiente `staging` deve usar D1 separado ou cópia anonimizada. Aplique `lib/migrations/add_mcp_audit.sql` antes de publicar o Worker.
2. Configure os secrets, de forma interativa e sem colocá-los em arquivos versionados:

   ```bash
   npx wrangler secret put MCP_ALLOWED_EMAILS --config workers/sorria-leste-mcp/wrangler.jsonc --env staging
   npx wrangler secret put MCP_WRITE_ALLOWED_EMAILS --config workers/sorria-leste-mcp/wrangler.jsonc --env staging
   npx wrangler secret put SDR_API_KEY --config workers/sorria-leste-mcp/wrangler.jsonc --env staging
   ```

   `MCP_ALLOWED_EMAILS` recebe administradores com leitura ampla. `MCP_WRITE_ALLOWED_EMAILS` recebe atendentes/admins autorizados à escrita V1. `SDR_API_KEY` protege o endpoint HTTP usado por n8n. Para mais de um e-mail, use uma lista separada por vírgulas.
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
