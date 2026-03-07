# Plano: Procedimentos como Entidades Independentes

## 1. Problema Atual

Hoje o sistema trata o **atendimento** como a entidade principal e os **itens (procedimentos)** como partes inseparáveis dele. Isso cria restrições que não refletem a realidade da clínica:

### Restrições Problemáticas:
1. **Para liberar para execução** (`aguardando_pagamento → em_execucao`): exige pelo menos 1 procedimento pago — **OK, mas o atendimento inteiro muda de status**
2. **Para finalizar** (`em_execucao → finalizado`): exige **TODOS** os procedimentos concluídos e pagos — **PROBLEMÁTICO**
3. O paciente não pode optar por fazer apenas **alguns** dos procedimentos sugeridos
4. O atendimento fica "travado" se 1 procedimento não for pago/executado

### Cenário Real (que hoje não funciona):
> O avaliador sugere 3 procedimentos (limpeza, restauração, canal).  
> O paciente decide fazer apenas limpeza e restauração.  
> Paga os dois, são executados e concluídos.  
> O canal fica "pendente" — mas o atendimento **não pode ser fechado**.

---

## 2. Nova Filosofia: Procedimentos Independentes

Após sair da avaliação, cada **procedimento (item_atendimento)** passa a ter vida própria:

```
                    ┌──────────────────────────────────────────┐
  ATENDIMENTO       │  triagem → avaliacao → em_andamento → finalizado  │
                    └──────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
  PROCEDIMENTO 1:  pendente → pago → executando → concluido
  PROCEDIMENTO 2:  pendente → pago → executando → concluido
  PROCEDIMENTO 3:  pendente → ........... → cancelado
```

### Novos Status do Item:
| Status | Descrição |
|--------|-----------|
| `pendente` | Sugerido pelo avaliador, aguardando decisão do paciente |
| `pago` | Paciente pagou, aguardando execução |
| `executando` | Executor iniciou o procedimento |
| `concluido` | Procedimento finalizado com sucesso (com prontuário) |
| **`cancelado`** | **NOVO** - Paciente optou por não fazer ou desistiu |

### Novo Status do Atendimento:
| Status | Descrição |
|--------|-----------|
| `triagem` | Entrada do paciente (sem mudança) |
| `avaliacao` | Avaliador analisando e sugerindo procedimentos (sem mudança) |
| **`em_andamento`** | **SUBSTITUI** `aguardando_pagamento` e `em_execucao` — o atendimento está ativo, procedimentos estão sendo gerenciados individualmente |
| `finalizado` | Atendimento encerrado (permite procedimentos pendentes/cancelados) |

### Por que unificar `aguardando_pagamento` + `em_execucao` em `em_andamento`?

Porque no modelo novo, **procedimentos diferentes podem estar em fases diferentes ao mesmo tempo**:
- Procedimento A: já pago e em execução
- Procedimento B: acabou de ser pago
- Procedimento C: ainda pendente (aguardando decisão do paciente)

Não faz sentido o **atendimento inteiro** ser "aguardando pagamento" ou "em execução" quando cada procedimento tem seu próprio ciclo.

---

## 3. Mudanças Necessárias

### 3.1 Banco de Dados (Schema)

#### 3.1.1 Tabela `itens_atendimento` — Adicionar status `cancelado`
```sql
-- ALTER: mudar CHECK constraint para incluir 'cancelado'
-- D1 não suporta ALTER CHECK, então trataremos por validação na API
-- Novo status: 'cancelado' 
-- Novo campo: cancelado_at TEXT (data do cancelamento)
-- Novo campo: motivo_cancelamento TEXT (motivo opcional)
ALTER TABLE itens_atendimento ADD COLUMN cancelado_at TEXT;
ALTER TABLE itens_atendimento ADD COLUMN motivo_cancelamento TEXT;
```

#### 3.1.2 Tabela `atendimentos` — Novo status `em_andamento`
```sql
-- Migrar dados existentes:
UPDATE atendimentos SET status = 'em_andamento' WHERE status IN ('aguardando_pagamento', 'em_execucao');
-- D1 não suporta ALTER CHECK, trataremos por validação na API
-- Novo status válido: 'triagem', 'avaliacao', 'em_andamento', 'finalizado'
```

### 3.2 APIs Afetadas

#### 3.2.1 `PUT /api/atendimentos/[id]` — Transições de status
**ANTES:**
```
triagem → avaliacao → aguardando_pagamento → em_execucao → finalizado
```
**DEPOIS:**
```
triagem → avaliacao → em_andamento → finalizado
```

**Regras de transição:**
| De | Para | Validação |
|----|------|-----------|
| `triagem` | `avaliacao` | Nenhuma (sem mudança) |
| `avaliacao` | `em_andamento` | Pelo menos 1 procedimento adicionado |
| `em_andamento` | `finalizado` | **SEM RESTRIÇÕES** — admin/atendente decide quando fechar |

> **Decisão importante**: A finalização não exige mais que todos os procedimentos estejam pagos/concluídos. O atendente pode fechar o atendimento quando o paciente decide que não quer mais fazer nada. Procedimentos não concluídos ficam registrados como pendentes ou cancelados.

#### 3.2.2 `POST /api/atendimentos/[id]/finalizar` — Lógica nova
- NÃO exige mais que todos itens estejam concluídos
- NÃO exige mais que tudo esteja pago
- Gera comissões **apenas** para itens `concluido`
- Itens `pendente` que não foram pagos podem ser automaticamente marcados como `cancelado`
- Itens `pago` mas não executados geram um alerta (possível necessidade de estorno)
- Registra um resumo do fechamento

#### 3.2.3 `POST /api/atendimentos/[id]/pagamentos` — Sem mudança de status global
- Quando um pagamento é feito, **apenas** o item pago muda de status (`pendente → pago`)
- O atendimento **NÃO muda** de status automaticamente (já está em `em_andamento`)

#### 3.2.4 `GET /api/execucao` — Já funciona por procedimento ✅
- Já busca apenas itens com status `pago` ou `executando`
- **Atualizar** filtro: mudar `a.status = 'em_execucao'` para `a.status = 'em_andamento'`

#### 3.2.5 `POST /api/atendimentos` — Fluxo orto
- **Atualizar**: criar com status `em_andamento` ao invés de `aguardando_pagamento`

#### 3.2.6 **NOVA** `PUT /api/atendimentos/[id]/itens/[itemId]` — Cancelar procedimento
- Permite marcar item como `cancelado` com motivo
- Apenas permitido para itens `pendente` (não pagos)
- Para itens `pago` precisa de aprovação do admin (estorno)

### 3.3 Páginas Frontend Afetadas

#### 3.3.1 `app/atendimentos/[id]/page.tsx` — Detalhes do Atendimento
- **Remover** botão "Liberar para Execução" (não existe mais essa transição)
- **Atualizar** mapa de status (remover `aguardando_pagamento` e `em_execucao`, adicionar `em_andamento`)
- **Adicionar** botão "Cancelar" por procedimento individual
- **Atualizar** botão "Finalizar" — deve mostrar resumo (quantos concluídos, pendentes, cancelados)
- **Adicionar** modal de confirmação de finalização com resumo

#### 3.3.2 `app/atendimentos/[id]/pagamento/page.tsx` — Página de Pagamento
- **Atualizar** para funcionar com status `em_andamento`
- Ao pagar um item, NÃO deve mudar status do atendimento
- Mostrar quais itens estão pendentes/pagos/cancelados

#### 3.3.3 `app/avaliacao/[id]/page.tsx` — Avaliação
- Botão "Concluir Avaliação" agora muda para `em_andamento` ao invés de `aguardando_pagamento`

#### 3.3.4 `app/execucao/page.tsx` — Fila de Execução
- Sem mudança significativa (já trabalha por procedimento)
- Atualizar label/texto se necessário

#### 3.3.5 `app/execucao/[id]/page.tsx` — Execução de Procedimento
- Sem mudança significativa
- Atualizar referências ao status `em_execucao`

#### 3.3.6 `app/atendimentos/page.tsx` — Lista de Atendimentos
- Atualizar filtros e badges de status
- Remover `aguardando_pagamento` e `em_execucao` dos filtros
- Adicionar `em_andamento`

#### 3.3.7 `app/atendimentos/novo/page.tsx` — Novo Atendimento
- Fluxo orto: mudar referência de `aguardando_pagamento` para `em_andamento`

#### 3.3.8 `app/dashboard/page.tsx` — Dashboard
- Atualizar contadores de status

#### 3.3.9 `components/layout/Sidebar.tsx`
- Sem mudança

### 3.4 Tipos TypeScript (`lib/types.ts`)

```typescript
// ANTES
export type AtendimentoStatus = 
  | 'triagem' | 'avaliacao' | 'aguardando_pagamento' | 'em_execucao' | 'finalizado';
export type ItemStatus = 'pendente' | 'pago' | 'executando' | 'concluido';

// DEPOIS
export type AtendimentoStatus = 
  | 'triagem' | 'avaliacao' | 'em_andamento' | 'finalizado';
export type ItemStatus = 'pendente' | 'pago' | 'executando' | 'concluido' | 'cancelado';
```

---

## 4. Fluxo Completo (Novo)

### 4.1 Fluxo Normal
```
1. Atendente cria atendimento → status: triagem
2. Atendente despacha para avaliação → status: avaliacao
3. Avaliador adiciona procedimentos sugeridos (itens: pendente)
4. Avaliador finaliza avaliação → status: em_andamento
5. Paciente decide quais fazer e PAGA individualmente (itens: pago)
6. Procedimentos pagos aparecem na fila do executor
7. Executor executa e conclui com prontuário (itens: concluido)
8. Procedimentos não desejados → cancelados (itens: cancelado)
9. Atendente fecha o atendimento → status: finalizado (gera comissões dos concluídos)
```

### 4.2 Fluxo Orto
```
1. Atendente cria atendimento orto → status: em_andamento (com item já criado)
2. Paciente paga → item: pago
3. Executor executa → item: concluido
4. Atendente fecha → status: finalizado
```

### 4.3 Cenário: Paciente desiste parcialmente
```
Avaliador sugere: Limpeza (R$100), Restauração (R$250), Canal (R$800)
Paciente paga Limpeza e Restauração
Paciente cancela Canal → item marcado como "cancelado"
Limpeza e Restauração são executadas
Atendente finaliza → Comissões geradas apenas para Limpeza e Restauração
```

---

## 5. Checklist de Implementação

### Fase 1: Schema e Migração
- [ ] Adicionar campos `cancelado_at` e `motivo_cancelamento` em `itens_atendimento`
- [ ] Atualizar `schema.sql` com novo CHECK
- [ ] Migrar dados D1: `aguardando_pagamento` → `em_andamento`, `em_execucao` → `em_andamento`

### Fase 2: APIs Backend
- [ ] `lib/types.ts` — Atualizar tipos
- [ ] `PUT /api/atendimentos/[id]` — Novas transições de status + regra de finalização flexível
- [ ] `POST /api/atendimentos/[id]/finalizar` — Finalização sem exigir 100% concluído/pago
- [ ] `PUT /api/atendimentos/[id]/itens/[itemId]` — Suportar status `cancelado`
- [ ] `POST /api/atendimentos/[id]/pagamentos` — Não mudar status do atendimento
- [ ] `POST /api/atendimentos` — Fluxo orto: `em_andamento` ao invés de `aguardando_pagamento`
- [ ] `GET /api/execucao` — Filtrar por `a.status = 'em_andamento'`
- [ ] `GET /api/atendimentos` — Suportar novo status nos filtros
- [ ] `GET /api/dashboard` e `GET /api/dashboard/admin` — Atualizar contadores

### Fase 3: Frontend
- [ ] `app/atendimentos/page.tsx` — Novos filtros e badges
- [ ] `app/atendimentos/[id]/page.tsx` — Remover botão liberar, atualizar finalizar, adicionar cancelar item
- [ ] `app/atendimentos/[id]/pagamento/page.tsx` — Adaptar para `em_andamento`
- [ ] `app/atendimentos/novo/page.tsx` — Fluxo orto com `em_andamento`
- [ ] `app/avaliacao/[id]/page.tsx` — Concluir para `em_andamento`
- [ ] `app/avaliacao/page.tsx` — Verificar filtros
- [ ] `app/execucao/page.tsx` — Verificar labels
- [ ] `app/execucao/[id]/page.tsx` — Verificar referências a status antigos
- [ ] `app/dashboard/page.tsx` — Novos contadores
- [ ] `app/pagamentos/page.tsx` — Verificar filtros

### Fase 4: Testes
- [ ] Atualizar testes estruturais que referenciam status antigos
- [ ] Verificar se tests que leem os arquivos TSX encontram novos status

---

## 6. Riscos e Decisões

### ⚠️ Itens pagos mas não executados
Se o paciente pagou um procedimento mas na finalização ele não foi executado, precisamos:
- **Opção A**: Bloquear finalização para itens pagos não concluídos (exigir cancelamento explícito ou conclusão)
- **Opção B**: Alertar mas permitir fechar (registrar como "pago não executado")
- **Recomendação**: **Opção A** — itens pagos devem ser concluídos ou ter o pagamento estornado/reaplicado antes de fechar

### ⚠️ Dados existentes
- Atendimentos com status `aguardando_pagamento` e `em_execucao` precisam ser migrados para `em_andamento`
- Isso é uma migração simples (UPDATE)

### ⚠️ Estorno de pagamento
- Se um item `pago` precisa ser cancelado, o valor pago precisa ser tratado
- Para o MVP, podemos apenas alertar e exigir que o admin resolva manualmente
- Futuro: funcionalidade de estorno/remanejamento de valor

---

## 7. Resumo de Impacto

| Componente | Nível de Mudança |
|-----------|-----------------|
| Schema/DB | 🟡 Médio — adicionar campos, migrar status |
| APIs | 🔴 Alto — lógica de transição e finalização reescrita |
| Frontend | 🔴 Alto — múltiplas páginas precisam de atualização |
| Testes | 🟡 Médio — atualizar referências de status |
| Deploy | 🟢 Baixo — migração D1 simples |
