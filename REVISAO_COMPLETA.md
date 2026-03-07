# REVISÃO COMPLETA DO SISTEMA — Sorria Leste MVP

> Documento gerado em 07/03/2026 após auditoria completa de código.  
> Cada item tem severidade, localização exata e ação corretiva.

---

## RESUMO EXECUTIVO

| Severidade | Quantidade | Descrição |
|-----------|-----------|-----------|
| 🔴 CRÍTICO | 3 | Bugs que causam erros em produção |
| 🟠 ALTO | 12 | Bugs de lógica, segurança, data integrity |
| 🟡 MÉDIO | 9 | Validações faltando, inconsistências |
| 🟢 BAIXO | 8 | Qualidade de código, UX, performance |
| 📋 FUTURO | 5 | Melhorias planejadas (pós-refatoração de status) |

---

## 🔴 CRÍTICOS (Quebram funcionalidade em produção)

### C1. Fluxo Orto não insere `criado_por_id` (NOT NULL violation)
- **Arquivo:** `app/api/atendimentos/route.ts` L187-190
- **Problema:** O INSERT do item no fluxo orto omite `criado_por_id`, campo NOT NULL na tabela
- **Impact:** Toda criação de atendimento orto falha com erro de constraint SQL
- **Ação:** Adicionar `criado_por_id` (ID do atendente que criou) ao INSERT

### C2. Duas rotas de finalização — comissões podem ser puladas
- **Arquivos:** 
  - `app/api/atendimentos/[id]/route.ts` L169-171 (PUT com `status: 'finalizado'`)
  - `app/api/atendimentos/[id]/finalizar/route.ts` (POST correto)
- **Problema:** PUT permite mudar direto para `finalizado` sem gerar comissões
- **Impact:** Atendimentos finalizados via PUT nunca terão comissões. Perda financeira.
- **Ação:** Remover `finalizado` das `transicoesPermitidas['em_execucao']` no PUT. Toda finalização obrigatoriamente via `/finalizar`.

### C3. `criado_por_id` tratado como nullable apesar de NOT NULL no schema
- **Arquivos:**
  - `app/api/atendimentos/[id]/itens/route.ts` L147: `criado_por_id || null`
  - `app/api/atendimentos/[id]/finalizar/route.ts` L9: interface declara `number | null`
- **Problema:** API permite inserir null, interface permite null, finalização pula comissão de venda silenciosamente 
- **Impact:** Avaliadores perdem comissão de venda se criado_por_id não for enviado
- **Ação:** Validar criado_por_id como obrigatório no POST de itens. Corrigir interfaces.

---

## 🟠 ALTO (Bugs de lógica e segurança)

### H1. API de usuários expõe senhas
- **Arquivos:** `app/api/usuarios/route.ts` L7, `app/api/usuarios/[id]/route.ts` L11
- **Problema:** `SELECT *` retorna campo `senha` no JSON
- **Ação:** Substituir por `SELECT id, nome, email, role, ativo, created_at`

### H2. Sem state machine para status de itens
- **Arquivo:** `app/api/atendimentos/[id]/itens/[itemId]/route.ts` L77-82
- **Problema:** PUT aceita qualquer valor de status. Pode pular pagamento, reverter conclusão.
- **Ação:** Implementar validação de transições: `pendente→pago→executando→concluido`

### H3. Items podem ser atualizados em atendimentos finalizados
- **Arquivo:** `app/api/atendimentos/[id]/itens/[itemId]/route.ts`
- **Problema:** PUT não valida status do atendimento. Permite alterar itens de atendimento finalizado.
- **Ação:** Bloquear edições em atendimentos finalizados

### H4. Pagamento pode ser aplicado a itens de outro atendimento
- **Arquivo:** `app/api/atendimentos/[id]/pagamentos/route.ts` L116-120
- **Problema:** Itens no payload não são validados se pertencem ao atendimento
- **Ação:** Validar `item.atendimento_id === atendimento_id` para cada item

### H5. Sem limite de pagamento — overpayment possível
- **Arquivo:** `app/api/atendimentos/[id]/pagamentos/route.ts` L90-112
- **Problema:** Nenhuma validação de valor máximo. `valor_pago` pode exceder `valor`.
- **Ação:** Validar `valor_aplicado <= (item.valor - item.valor_pago)` para cada item

### H6. Verificação de executor é facilmente ignorável
- **Arquivo:** `app/api/atendimentos/[id]/itens/[itemId]/route.ts` L54-59
- **Problema:** `if (usuario_id && item.executor_id && ...)` — omitir `usuario_id` bypassa a checagem
- **Ação:** Tornar `usuario_id` obrigatório para mudanças de status

### H7. DELETE de anexo sem validação de propriedade
- **Arquivo:** `app/api/execucao/item/[id]/anexos/route.ts` L163-190
- **Problema:** Não valida se o anexo pertence ao item do parâmetro `[id]`
- **Ação:** Adicionar `WHERE id = ? AND item_atendimento_id = ?`

### H8. Botão "Liberar para Execução" desconectado do novo fluxo
- **Arquivo:** `app/atendimentos/[id]/pagamento/page.tsx` L219, L437
- **Problema:** Envia `status: 'em_execucao'` hardcoded. No plano novo será `em_andamento` (já estará nesse status)
- **Ação:** Este botão será removido na refatoração de status

### H9. `meus-procedimentos` verifica status inválido `em_andamento` para item
- **Arquivo:** `app/meus-procedimentos/page.tsx` L217
- **Problema:** `em_andamento` é status de atendimento, não de item. Nunca será true.
- **Ação:** Corrigir para verificar `executando`

### H10. Dashboard: labels/cores sem fallback para status desconhecido
- **Arquivo:** `app/dashboard/page.tsx` L33-42, L349
- **Problema:** Se API retornar status não mapeado, label é `undefined`
- **Ação:** Adicionar fallback `|| status.status` nos labels

### H11. `atendimentos/page.tsx`: crash se status desconhecido
- **Arquivo:** `app/atendimentos/page.tsx` L258
- **Problema:** `statusConfig` cast para `StatusType` sem fallback
- **Ação:** Adicionar fallback para status desconhecido

### H12. Itens adicionados durante execução nunca podem ser deletados
- **Arquivo:** `app/api/atendimentos/[id]/itens/route.ts` L182-190
- **Problema:** DELETE exige `status === 'avaliacao'`. Itens adicionados em `em_execucao` ficam orphan.
- **Ação:** Permitir delete para itens `pendente` (não pagos) em qualquer status ativo

---

## 🟡 MÉDIO (Validações e inconsistências)

### M1. TODOs de autenticação — IDs hardcoded
- **Arquivos:**
  - `app/api/atendimentos/[id]/route.ts` L162: `liberado_por_id`
  - `app/api/atendimentos/[id]/pagamentos/route.ts` L125: `recebido_por_id`
- **Problema:** `SELECT id FROM usuarios LIMIT 1` — atribui ações ao usuário errado
- **Ação:** Aceitar `usuario_id` no body do request (solução pragmática para MVP)

### M2. Parcelas sem validação de status do atendimento
- **Arquivo:** `app/api/atendimentos/[id]/parcelas/route.ts` L58-74
- **Problema:** Cria parcelas em qualquer status, incluindo `finalizado`
- **Ação:** Validar status permitido

### M3. Parcelas e pagamentos são sistemas desconectados
- **Arquivo:** `app/api/atendimentos/[id]/parcelas/route.ts` L149-176
- **Problema:** Marcar parcela como paga não cria registro em `pagamentos` nem atualiza `valor_pago`
- **Ação:** Integrar parcelas com o sistema de pagamentos

### M4. Validação de finalização inconsistente entre PUT e /finalizar
- **Arquivo:** `app/api/atendimentos/[id]/route.ts` L293-310
- **Problema:** validarTransicao compara SUM globais, `/finalizar` compara por item
- **Ação:** Unificar lógica (resolver junto com C2)

### M5. Campos do schema não expostos nas APIs
| Tabela | Campo | API faltando |
|--------|-------|-------------|
| `procedimentos` | `descricao` | POST não aceita |
| `itens_atendimento` | `observacoes` | POST não aceita |
| `atendimentos` | `observacoes` | POST normal não aceita |
| `atendimentos` | `cliente_email` | GET lista não faz join |

### M6. Notas/Prontuário não validam existência do item
- **Arquivos:** `app/api/execucao/item/[id]/notas/route.ts`, `app/api/execucao/item/[id]/prontuario/route.ts`
- **Problema:** POST aceita qualquer ID sem verificar se existe
- **Ação:** Verificar existência antes de inserir

### M7. Prontuário não valida se usuário é o executor do item
- **Arquivo:** `app/api/execucao/item/[id]/prontuario/route.ts`
- **Problema:** Qualquer usuário pode criar prontuário para qualquer item
- **Ação:** Validar `usuario_id === item.executor_id`

### M8. Timezone inconsistente em parcelas vencidas
- **Arquivo:** `app/api/parcelas/vencidas/route.ts` L18
- **Problema:** Usa `new Date().toISOString()` (UTC) enquanto DB usa `localtime`
- **Ação:** Usar `DATE('now', 'localtime')` no SQL

### M9. Redirect de comissões para página sem link no Sidebar
- **Arquivo:** `app/comissoes/page.tsx` L61
- **Problema:** Redireciona non-admin para `/minhas-comissoes` que não está no Sidebar
- **Ação:** Redirecionar para `/meus-procedimentos` ou adicionar link

---

## 🟢 BAIXO (Qualidade de código, UX, performance)

### L1. `app/minhas-comissoes/page.tsx` — Página orphan
- Removida do Sidebar mas ainda acessível via URL/redirect
- **Ação:** Deletar e ajustar redirect para `/meus-procedimentos`

### L2. API de notas de execução — Dead code
- **Arquivo:** `app/api/execucao/item/[id]/notas/route.ts`
- UI de notas foi removida da página de execução
- **Ação:** Manter API (pode ser usada futuramente) ou deletar

### L3. Variável `hoje` não utilizada no dashboard
- **Arquivo:** `app/api/dashboard/route.ts` L30
- **Ação:** Remover

### L4. Interface `AtendimentoComCliente` faltando campo
- **Arquivo:** `app/api/atendimentos/[id]/route.ts` L14-22
- Query retorna `liberado_por_nome` mas interface não declara
- **Ação:** Adicionar à interface

### L5. Sem paginação em endpoints de lista
- Todos os GETs (atendimentos, clientes, usuarios, procedimentos, comissões)
- **Ação:** Implementar LIMIT/OFFSET (pós-MVP)

### L6. `usuarios/[id]/route.ts` — `ativo: null` desativa usuário
- **Problema:** `null ? 1 : 0` = `0`
- **Ação:** Verificar `ativo !== undefined && ativo !== null`

### L7. Performance: N+1 fetch em pagamentos
- **Arquivo:** `app/pagamentos/page.tsx` L55-63
- Faz 1 fetch por atendimento para buscar totais
- **Ação:** Resolver com JOIN na API

### L8. Performance: avaliacao/page.tsx busca todos atendimentos
- **Arquivo:** `app/avaliacao/page.tsx` L31-32
- **Ação:** Filtrar por status no server-side

---

## 📋 FUTURO (Refatoração de Status — PLANO_PROCEDIMENTOS_INDEPENDENTES.md)

Estes itens serão tratados quando a migração `aguardando_pagamento`/`em_execucao` → `em_andamento` for implementada. Estão documentados no plano existente e afetam **28+ locais** no código entre frontend e backend.

### F1. 15 referências a `aguardando_pagamento` e 15 a `em_execucao` em APIs
### F2. 15 referências a esses status em frontend
### F3. Schema CHECK constraint (D1 não suporta ALTER)
### F4. Dados existentes no D1 precisam de UPDATE
### F5. Testes automatizados que referenciam status antigos

---

## ORDEM DE EXECUÇÃO RECOMENDADA

### Sprint A: Correções Críticas (impacto imediato)
1. ~~C1~~ Fix `criado_por_id` no fluxo orto
2. ~~C2~~ Bloquear finalização via PUT (forçar uso de `/finalizar`)
3. ~~C3~~ Validar `criado_por_id` como obrigatório
4. ~~H1~~ Remover senha do SELECT de usuários
5. ~~H9~~ Corrigir status badge em meus-procedimentos

### Sprint B: Segurança e Integridade
6. ~~H2~~ State machine para status de itens
7. ~~H3~~ Bloquear edição de itens em atendimentos finalizados
8. ~~H4~~ Validar itens pertencem ao atendimento no pagamento
9. ~~H5~~ Validar limite de pagamento (sem overpayment)
10. ~~H6~~ Tornar usuario_id obrigatório no update de item
11. ~~H7~~ Validar propriedade de anexo no delete
12. ~~H10~~ ~~H11~~ Fallbacks para status desconhecido no frontend
13. ~~H12~~ Permitir delete de itens pendentes em qualquer status

### Sprint C: Validações e Limpeza
14. ~~M1~~ Resolver TODOs de autenticação
15. ~~M2~~ ~~M3~~ Integrar parcelas com pagamentos
16. ~~M5~~ Expor campos faltantes nas APIs
17. ~~M6~~ ~~M7~~ Validar existência/permissão em notas/prontuário
18. ~~M8~~ Fix timezone parcelas
19. ~~M9~~ Fix redirect comissões
20. ~~L1~~ Limpar página orphan
21. ~~L3~~ ~~L4~~ ~~L6~~ Fixes menores de código

### Sprint D: Migração de Status (PLANO_PROCEDIMENTOS_INDEPENDENTES.md)
22. Migrar schema + dados D1
23. Atualizar APIs
24. Atualizar frontend
25. Atualizar testes
