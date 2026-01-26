# 🦷 Sorria Leste MVP - Roadmap de Desenvolvimento

> MVP para validação de regras de negócio - Sistema de Gestão Odontológica

---

## 📋 Visão Geral do MVP

### Objetivo
Criar um MVP extremamente simples para **validar as regras de negócio** do sistema de gestão odontológica. Foco em simplicidade e facilidade de alteração.

### Características do MVP
- ✅ **Sem autenticação real** - Login apenas com email (frontend)
- ✅ **Banco local SQLite** - Arquivo local, sem servidor
- ✅ **UI básica** - Design system mínimo, só para funcionar
- ✅ **Código limpo e simples** - Facilitar alterações rápidas
- ✅ **Roda apenas local** - Sem deploy/ambientes

---

## 👥 Usuários e Permissões

| Perfil | O que pode ver | O que pode fazer |
|--------|----------------|------------------|
| **Atendente** | Todos os dados do cliente | Cadastrar cliente, criar atendimento, receber pagamentos |
| **Avaliador** | Apenas nome do cliente + fila | Gerar procedimentos, mover para pagamento |
| **Executor** | Apenas clientes destinados a ele | Executar procedimentos, adicionar novos procedimentos (comissão dele) |

---

## 🔄 Fluxo Principal do Sistema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FLUXO DO ATENDIMENTO                                │
└─────────────────────────────────────────────────────────────────────────────────┘

1. RECEPÇÃO (Atendente)
   │
   ├─► Cliente chega
   ├─► Verifica se existe no sistema
   ├─► Se não existe → Cadastra cliente
   └─► Cria ATENDIMENTO
           │
           ▼
2. AVALIAÇÃO (Dentista Avaliador)
   │
   ├─► Vê apenas: Nome do cliente
   ├─► Gera os PROCEDIMENTOS necessários
   ├─► Define qual EXECUTOR vai fazer cada procedimento
   └─► Finaliza avaliação → Volta para ATENDIMENTO
           │
           ▼
3. PAGAMENTO (Atendente)
   │
   ├─► Cliente volta no atendimento
   ├─► Atendente mostra orçamento dos procedimentos
   ├─► Registra PAGAMENTO
   └─► Só libera para execução APÓS pagamento confirmado
           │
           ▼
4. EXECUÇÃO (Dentista Executor)
   │
   ├─► Vê apenas clientes destinados a ele
   ├─► NÃO pode editar/apagar procedimentos do avaliador
   ├─► PODE adicionar novos procedimentos (comissão dele)
   │       │
   │       └─► Se adicionou algo → Cliente volta para PAGAMENTO
   │
   └─► Marca procedimentos como CONCLUÍDOS
           │
           ▼
5. FINALIZAÇÃO (Atendente)
   │
   ├─► Todos os procedimentos concluídos
   ├─► Todos os pagamentos quitados
   └─► Dá BAIXA no atendimento
```

---

## 🗄️ Modelagem de Dados Simplificada

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│    USUARIOS     │     │      CLIENTES       │     │  PROCEDIMENTOS   │
├─────────────────┤     ├─────────────────────┤     │    (Catálogo)    │
│ id              │     │ id                  │     ├──────────────────┤
│ nome            │     │ nome                │     │ id               │
│ email           │     │ cpf                 │     │ nome             │
│ role            │     │ telefone            │     │ valor            │
│ ativo           │     │ email               │     │ comissao_venda   │
└─────────────────┘     │ created_at          │     │ comissao_execucao│
                        └─────────────────────┘     └──────────────────┘
                                  │
                                  │ 1:N
                                  ▼
                        ┌─────────────────────┐
                        │    ATENDIMENTOS     │
                        ├─────────────────────┤
                        │ id                  │
                        │ cliente_id          │
                        │ avaliador_id        │
                        │ status              │◄── triagem | avaliacao | 
                        │ created_at          │    aguardando_pagamento |
                        │ finalizado_at       │    em_execucao | finalizado
                        └─────────────────────┘
                                  │
                                  │ 1:N
                                  ▼
                        ┌─────────────────────┐
                        │ ITENS_ATENDIMENTO   │
                        ├─────────────────────┤
                        │ id                  │
                        │ atendimento_id      │
                        │ procedimento_id     │
                        │ executor_id         │
                        │ criado_por_id       │◄── Quem criou (avaliador ou executor)
                        │ valor               │
                        │ status              │◄── pendente | pago | executando | concluido
                        │ created_at          │
                        │ concluido_at        │
                        └─────────────────────┘
                                  │
                                  │ 1:N
                                  ▼
                        ┌─────────────────────┐
                        │     PAGAMENTOS      │
                        ├─────────────────────┤
                        │ id                  │
                        │ atendimento_id      │
                        │ valor               │
                        │ metodo              │◄── dinheiro | pix | cartao
                        │ created_at          │
                        └─────────────────────┘
```

---

## 🚀 SPRINTS

---

### Sprint 1: Setup e Estrutura Base ✅
> **Objetivo**: Projeto funcionando com banco local

**Tarefas:**
- [x] Estrutura Next.js básica (já criado)
- [x] Configurar SQLite local (better-sqlite3 ou sql.js)
- [x] Criar schema do banco de dados
- [x] Seed inicial com dados de teste
- [x] Layout básico (header + sidebar simples)

**Arquivos principais:**
```
/lib/db.ts          → Conexão com SQLite
/lib/schema.sql     → Criação das tabelas
/lib/seed.ts        → Dados iniciais
/components/layout/ → Header e Sidebar
```

**Entregável**: ✅ Projeto roda local com banco SQLite.

---

### Sprint 2: Login Simples + Usuários ✅
> **Objetivo**: Simular login por email (sem auth real)

**Tarefas:**
- [x] Página de login (só seleciona email)
- [x] Guardar usuário logado em localStorage/Context
- [x] CRUD básico de usuários (admin)
- [x] Sidebar muda baseado no role

**Fluxo do login:**
1. Usuário digita email
2. Sistema busca no banco
3. Se existe → salva no contexto e redireciona
4. Se não existe → mostra erro

**Páginas:**
```
/login              → Tela de login
/admin/usuarios     → CRUD de usuários
```

**Entregável**: ✅ Consegue "logar" e ver menu baseado no role.

---

### Sprint 3: Cadastro de Clientes ✅
> **Objetivo**: Atendente cadastra e busca clientes

**Tarefas:**
- [x] Listagem de clientes com busca
- [x] Formulário de cadastro simples
- [x] Visualizar dados do cliente
- [x] Editar cliente

**Páginas:**
```
/clientes           → Lista + busca
/clientes/novo      → Cadastro
/clientes/[id]      → Ver/Editar
```

**Entregável**: ✅ CRUD completo de clientes.

---

### Sprint 4: Catálogo de Procedimentos ✅
> **Objetivo**: Admin configura procedimentos disponíveis

**Tarefas:**
- [x] CRUD de procedimentos
- [x] Campos: nome, valor, % comissão venda, % comissão execução

**Páginas:**
```
/admin/procedimentos → CRUD
```

**Entregável**: ✅ Procedimentos cadastrados no sistema.

---

### Sprint 5: Atendimentos e Pipeline ✅
> **Objetivo**: Criar atendimentos e visualizar pipeline

**Tarefas:**
- [x] Criar atendimento (vincula cliente)
- [x] Pipeline visual (Kanban simples ou lista com filtros)
- [x] Mover atendimento entre etapas (com validações)

**Status do Pipeline:**
```
TRIAGEM → AVALIACAO → AGUARDANDO_PAGAMENTO → EM_EXECUCAO → FINALIZADO
```

**Regras de Transição:**
| De | Para | Condição |
|----|------|----------|
| Triagem | Avaliação | Atendimento criado |
| Avaliação | Aguardando Pagamento | Pelo menos 1 procedimento |
| Aguardando Pagamento | Em Execução | Pagamento confirmado |
| Em Execução | Finalizado | Todos procedimentos concluídos + tudo pago |

**Páginas:**
```
/pipeline           → Visualização Kanban/Lista
/atendimento/novo   → Criar atendimento
/atendimento/[id]   → Detalhes do atendimento
```

**Entregável**: ✅ Pipeline funcionando com regras básicas.

---

### Sprint 6: Avaliação (Dentista Avaliador) ✅
> **Objetivo**: Avaliador adiciona procedimentos

**Tarefas:**
- [x] Tela de avaliação (vê só nome do cliente)
- [x] Adicionar procedimentos ao atendimento
- [x] Selecionar executor para cada procedimento
- [x] Finalizar avaliação → manda para pagamento
- [x] Fila de avaliação com "Meus Atendimentos" e "Atendimentos Disponíveis"
- [x] Avaliador pode "Assumir" atendimentos sem avaliador definido
- [x] Coluna "Vendedor" para rastrear comissão de venda

**Regras:**
- Avaliador só vê: nome do cliente
- Avaliador NÃO vê: CPF, telefone, email, etc
- Procedimentos criados aqui: comissão de venda = criado_por (vendedor)
- Atendente pode adicionar procedimentos desde a triagem
- Só é possível remover procedimentos durante a avaliação

**Páginas:**
```
/avaliacao          → Lista de atendimentos para avaliar
/avaliacao/[id]     → Tela de avaliação
```

**Entregável**: ✅ Avaliador consegue gerar plano de tratamento.

---

### Sprint 7: Pagamento
> **Objetivo**: Atendente registra pagamentos

**Tarefas:**
- [ ] Tela de pagamento (vê orçamento completo)
- [ ] Registrar pagamento (valor, método)
- [ ] Calcular total pago vs total devido
- [ ] Liberar para execução quando pagamento OK

**Regras:**
- Só move para execução após pagamento
- Pode pagar parcialmente (entrada)
- Se executor adicionar procedimento → volta para pagamento

**Páginas:**
```
/atendimento/[id]/pagamento → Tela de pagamento
```

**Entregável**: Fluxo de pagamento funcionando.

---

### Sprint 8: Execução (Dentista Executor)
> **Objetivo**: Executor realiza e marca procedimentos

**Tarefas:**
- [ ] Lista de atendimentos do executor
- [ ] Marcar procedimento como concluído
- [ ] Adicionar novo procedimento (comissão dele)
- [ ] Se adicionar → status volta para aguardando pagamento

**Regras:**
- Executor só vê atendimentos destinados a ele
- NÃO pode editar/deletar procedimentos do avaliador
- PODE adicionar novos procedimentos
- Novos procedimentos: comissão de venda = executor

**Páginas:**
```
/execucao           → Lista de atendimentos do executor
/execucao/[id]      → Executar procedimentos
```

**Entregável**: Executor consegue trabalhar e adicionar procedimentos.

---

### Sprint 9: Finalização e Comissões
> **Objetivo**: Fechar atendimento e calcular comissões

**Tarefas:**
- [ ] Validar: todos procedimentos concluídos
- [ ] Validar: todo valor foi pago
- [ ] Dar baixa no atendimento
- [ ] Calcular comissões automaticamente
- [ ] Tela simples de visualização de comissões

**Cálculo de Comissões:**
```
Para cada item_atendimento:
  - Comissão Venda = valor × % comissão_venda → vai para criado_por_id
  - Comissão Execução = valor × % comissão_execução → vai para executor_id
```

**Páginas:**
```
/comissoes          → Lista de comissões (admin)
/minhas-comissoes   → Comissões do usuário logado
```

**Entregável**: Sistema calcula comissões corretamente.

---

### Sprint 10: Ajustes e Testes
> **Objetivo**: Testar fluxos e corrigir bugs

**Tarefas:**
- [ ] Testar fluxo completo: cadastro → avaliação → pagamento → execução → finalização
- [ ] Testar permissões por role
- [ ] Testar adição de procedimento pelo executor
- [ ] Testar cálculo de comissões
- [ ] Corrigir bugs encontrados

**Entregável**: MVP funcional para validação.

---

## 📁 Estrutura de Pastas Simplificada

```
mvp-sorria-leste-app/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    → Redirect para login ou dashboard
│   ├── login/
│   │   └── page.tsx
│   ├── clientes/
│   │   ├── page.tsx                → Lista
│   │   ├── novo/page.tsx           → Cadastro
│   │   └── [id]/page.tsx           → Ver/Editar
│   ├── pipeline/
│   │   └── page.tsx                → Kanban
│   ├── atendimento/
│   │   ├── novo/page.tsx           → Criar
│   │   └── [id]/
│   │       ├── page.tsx            → Detalhes
│   │       └── pagamento/page.tsx  → Pagamento
│   ├── avaliacao/
│   │   ├── page.tsx                → Fila do avaliador
│   │   └── [id]/page.tsx           → Avaliar
│   ├── execucao/
│   │   ├── page.tsx                → Fila do executor
│   │   └── [id]/page.tsx           → Executar
│   ├── comissoes/
│   │   └── page.tsx                → Ver comissões
│   └── admin/
│       ├── usuarios/page.tsx       → CRUD usuários
│       └── procedimentos/page.tsx  → CRUD procedimentos
├── components/
│   ├── layout/
│   │   ├── header.tsx
│   │   └── sidebar.tsx
│   ├── ui/                         → Componentes básicos (button, input, etc)
│   └── ...
├── lib/
│   ├── db.ts                       → Conexão SQLite
│   ├── schema.sql                  → Tabelas
│   ├── seed.ts                     → Dados iniciais
│   └── utils.ts
├── contexts/
│   └── auth-context.tsx            → Usuário logado
└── types/
    └── index.ts                    → Tipos TypeScript
```

---

## ⏱️ Estimativa de Tempo

| Sprint | Descrição | Estimativa |
|--------|-----------|------------|
| 1 | Setup e Estrutura | 1-2 dias |
| 2 | Login + Usuários | 1-2 dias |
| 3 | Clientes | 1-2 dias |
| 4 | Procedimentos | 1 dia |
| 5 | Atendimentos + Pipeline | 2-3 dias |
| 6 | Avaliação | 1-2 dias |
| 7 | Pagamento | 1-2 dias |
| 8 | Execução | 1-2 dias |
| 9 | Finalização + Comissões | 1-2 dias |
| 10 | Testes + Ajustes | 2-3 dias |

**Total estimado**: ~2-3 semanas

---

## 🎯 Critérios de Sucesso do MVP

- [ ] Atendente consegue cadastrar cliente e criar atendimento
- [ ] Avaliador só vê nome do cliente, consegue gerar procedimentos
- [ ] Pagamento é obrigatório antes da execução
- [ ] Executor só vê seus atendimentos, pode adicionar procedimentos
- [ ] Se executor adiciona → volta para pagamento
- [ ] Comissões são calculadas corretamente
- [ ] Atendimento só finaliza quando tudo pago e concluído

---

## 📝 Stack Técnica Simplificada

- **Framework**: Next.js 15 (App Router)
- **Estilo**: Tailwind CSS (básico)
- **Banco**: SQLite (arquivo local)
- **ORM**: Queries SQL diretas (simples)
- **Auth**: Context + localStorage (fake auth)
- **Estado**: React Context (simples)
