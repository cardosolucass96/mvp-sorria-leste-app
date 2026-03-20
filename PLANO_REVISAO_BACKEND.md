# Plano de Revisão Completa — Backend & Testes

> Objetivo: Revisar toda a lógica do backend, corrigir bugs e falhas de segurança, e implementar testes reais (unitários e de integração) para garantir que tudo funciona corretamente.

---

## Diagnóstico Atual

### O que existe
- 25 rotas de API cobrindo: Auth, Clientes, Atendimentos, Itens, Pagamentos, Parcelas, Procedimentos, Execução, Comissões, Dashboard, Usuários, Arquivos
- 12 tabelas no banco D1 (SQLite/Cloudflare)
- Schema SQL com constraints básicas
- Testes existentes são **apenas análise estática** (verificam que strings existem no código-fonte, não executam a lógica)

### Problemas Identificados
1. **Segurança Crítica**: Senhas armazenadas em texto plano (sem hash)
2. **Sem autenticação real**: Nenhum JWT, session, ou middleware de auth — qualquer pessoa pode chamar qualquer endpoint
3. **Sem autorização no backend**: Controle de roles é feito apenas no frontend
4. **Sem testes reais**: Nenhum teste unitário ou de integração que execute código de verdade
5. **Validações incompletas**: Algumas rotas não validam todos os campos obrigatórios
6. **SQL Injection potencial**: Verificar se todas as queries usam prepared statements
7. **Error handling inconsistente**: Falta padronização de respostas de erro
8. **Sem rate limiting**: Endpoints abertos a abuso
9. **Hard-coded defaults**: `recebido_por_id` usa primeiro usuário em alguns casos
10. **Sem transações**: Operações multi-tabela (finalização, pagamentos) devem ser atômicas

---

## Estrutura dos Sprints

| Sprint | Foco | Estimativa |
|--------|------|------------|
| 1 | Infraestrutura de testes + testes utilitários | 1 dia |
| 2 | Testes e revisão — Auth & Segurança | 1-2 dias |
| 3 | Testes e revisão — Clientes & Usuários (CRUD) | 1 dia |
| 4 | Testes e revisão — Procedimentos & Catálogo | 0.5 dia |
| 5 | Testes e revisão — Atendimentos (fluxo principal) | 2 dias |
| 6 | Testes e revisão — Pagamentos & Parcelas | 1-2 dias |
| 7 | Testes e revisão — Execução, Prontuário & Anexos | 1-2 dias |
| 8 | Testes e revisão — Comissões & Finalização | 1 dia |
| 9 | Testes e revisão — Dashboard & Relatórios | 1 dia |
| 10 | Segurança, middleware de auth & hardening | 2 dias |
| 11 | Testes de integração end-to-end do fluxo completo | 1-2 dias |
| 12 | Correções finais, documentação & cobertura | 1 dia |

**Total estimado: 12-16 dias**

---

## Sprint 1 — Infraestrutura de Testes & Utilitários

### Objetivo
Configurar a infraestrutura necessária para testar as rotas de API e criar testes unitários para as funções utilitárias.

### Tarefas

#### 1.1 — Setup do ambiente de testes de API
- [ ] Criar helper de teste que mocka o D1 Database (in-memory SQLite ou mock)
- [ ] Criar factory de `Request` para simular chamadas HTTP às route handlers
- [ ] Criar função `callRoute(handler, { method, body, params, searchParams })` que monta o Request e chama o handler diretamente
- [ ] Configurar seed de dados de teste (usuários, clientes, procedimentos base)
- [ ] Garantir que o mock de `@opennextjs/cloudflare` funciona corretamente com os testes

#### 1.2 — Testes unitários: `lib/utils/validators.ts`
- [ ] `validarCPF` — CPFs válidos e inválidos, CPFs com todos dígitos iguais, strings vazias, com máscara
- [ ] `validarEmail` — emails válidos, inválidos, vazios
- [ ] `validarTelefone` — 10 e 11 dígitos, com máscara, inválidos
- [ ] `validarObrigatorio` — strings com espaços, vazias, null, undefined
- [ ] `validarValor` — positivos, zero, negativos, NaN, Infinity

#### 1.3 — Testes unitários: `lib/utils/formatters.ts`
- [ ] `formatarMoeda` — valores inteiros, decimais, zero, negativos, grandes
- [ ] `formatarData` / `formatarDataHora` / `formatarDataCompleta` — datas válidas, null, undefined
- [ ] `formatarCPF` / `formatarTelefone` — com e sem máscara prévia
- [ ] `formatarPorcentagem` — inteiros, decimais
- [ ] `obterIniciais` — nome completo, nome simples, nome com preposições

#### 1.4 — Testes unitários: `lib/utils/masks.ts`
- [ ] `maskCPF` — digitação progressiva (1 char, 3 chars, 6 chars, 9 chars, 11 chars)
- [ ] `maskTelefone` — 10 e 11 dígitos
- [ ] `maskMoeda` — centavos, reais, valores grandes
- [ ] `unmask` / `unmaskMoeda` — remoção correta de caracteres

### Critério de Conclusão
- [ ] Todos os testes passando
- [ ] Helper de teste de API funcional e documentado
- [ ] Coverage de `lib/utils/` > 90%

### Arquivo de testes
```
__tests__/
  helpers/
    api-test-helper.ts    # Helper para testar route handlers
    db-mock.ts            # Mock do D1 database
    seed.ts               # Dados de teste padrão
  unit/
    validators.test.ts
    formatters.test.ts
    masks.test.ts
```

---

## Sprint 2 — Auth & Segurança

### Objetivo
Revisar e corrigir o sistema de autenticação. Implementar hash de senhas e testes completos.

### Tarefas

#### 2.1 — Revisão de código: `api/auth/login/route.ts`
- [ ] **BUG CRÍTICO**: Senha comparada em texto plano → implementar bcrypt/argon2 (ou `crypto.subtle` para Cloudflare Workers)
- [ ] Verificar se retorna erros genéricos (não revela se email existe ou não)
- [ ] Verificar tratamento de usuários inativos (`ativo = 0`)
- [ ] Verificar se há rate limiting ou proteção contra brute force

#### 2.2 — Revisão de código: `api/auth/senha/route.ts`
- [ ] Verificar validação de senha mínima (6 chars)
- [ ] Verificar que senha atual é validada antes de alterar
- [ ] Implementar hash para nova senha
- [ ] Verificar se usuário inativo pode trocar senha

#### 2.3 — Implementar middleware de autenticação
- [ ] Criar middleware que valida token/session em cada request
- [ ] Decidir estratégia: JWT com cookie HttpOnly ou session-based
- [ ] Aplicar middleware em todas as rotas API (exceto login)
- [ ] Retornar 401 para requests não autenticados

#### 2.4 — Implementar middleware de autorização
- [ ] Criar decorator/wrapper de role-based access
- [ ] Definir permissões por rota:
  - `admin`: tudo
  - `atendente`: clientes, atendimentos (criar/editar), pagamentos
  - `avaliador`: atendimentos (avaliar), itens (adicionar/remover)
  - `executor`: execução, prontuário, anexos
- [ ] Aplicar em todas as rotas
- [ ] Retornar 403 para roles não autorizadas

#### 2.5 — Testes: Auth
- [ ] Login com credenciais válidas → retorna usuário sem senha
- [ ] Login com email inexistente → 401 genérico
- [ ] Login com senha errada → 401 genérico
- [ ] Login com usuário inativo → 401
- [ ] Login sem body → 400
- [ ] Troca de senha → sucesso com senha atual correta
- [ ] Troca de senha → falha com senha atual incorreta
- [ ] Troca de senha → falha com senha nova < 6 chars
- [ ] Middleware auth → 401 sem token
- [ ] Middleware auth → 401 com token expirado
- [ ] Middleware auth → sucesso com token válido
- [ ] Middleware roles → 403 para role não permitida

### Critério de Conclusão
- [ ] Senhas armazenadas com hash
- [ ] Middleware de auth funcional
- [ ] Todos os testes passando
- [ ] Migração de senhas existentes planejada

### Arquivo de testes
```
__tests__/
  api/
    auth/
      login.test.ts
      senha.test.ts
      middleware.test.ts
```

---

## Sprint 3 — Clientes & Usuários (CRUD)

### Objetivo
Revisar e testar completamente os CRUDs de clientes e usuários.

### Tarefas

#### 3.1 — Revisão de código: `api/clientes/`
- [ ] **GET /api/clientes**: Verificar SQL injection na busca (`?busca=`), paginação (existe?), performance com muitos registros
- [ ] **POST /api/clientes**: Verificar todas as validações — nome obrigatório, CPF único (quando fornecido), origem válida, sanitização de inputs
- [ ] **GET /api/clientes/[id]**: Verificar se retorna 404 quando não existe
- [ ] **PUT /api/clientes/[id]**: Verificar CPF único excluindo o próprio registro, validação de origem
- [ ] **DELETE /api/clientes/[id]**: Verificar bloqueio quando há atendimentos vinculados, verificar se é hard delete (deveria ser soft?)

#### 3.2 — Revisão de código: `api/usuarios/`
- [ ] **GET /api/usuarios**: Verificar que senha NUNCA é retornada (SELECT específico, não `SELECT *`)
- [ ] **POST /api/usuarios**: Verificar email único, role válida, senha padrão com hash
- [ ] **GET /api/usuarios/[id]**: Verificar que senha não é retornada, 404 quando não existe
- [ ] **PUT /api/usuarios/[id]**: Verificar email único excluindo o próprio, validação de role
- [ ] **DELETE /api/usuarios/[id]**: Verificar soft delete, verificar se admin pode deletar a si mesmo

#### 3.3 — Testes: Clientes
- [ ] CRUD completo (criar, ler, atualizar, deletar)
- [ ] Busca por nome, CPF, telefone, email
- [ ] CPF duplicado → 409/400
- [ ] Origem inválida → 400
- [ ] Nome vazio → 400
- [ ] ID inexistente → 404
- [ ] Delete com atendimentos vinculados → 400/409
- [ ] Campos opcionais (CPF, telefone, email) aceitos como null

#### 3.4 — Testes: Usuários
- [ ] CRUD completo
- [ ] Email duplicado → 409/400
- [ ] Role inválida → 400
- [ ] Usuário criado com senha padrão (hash)
- [ ] GET nunca retorna campo senha
- [ ] Soft delete (ativo = 0)
- [ ] Busca filtra por role

### Critério de Conclusão
- [ ] Todos os testes passando
- [ ] Nenhum endpoint retorna senha
- [ ] Validações consistentes e completas

### Arquivo de testes
```
__tests__/
  api/
    clientes/
      crud.test.ts
      validacoes.test.ts
    usuarios/
      crud.test.ts
      validacoes.test.ts
```

---

## Sprint 4 — Procedimentos & Catálogo

### Objetivo
Revisar e testar o CRUD de procedimentos odontológicos.

### Tarefas

#### 4.1 — Revisão de código: `api/procedimentos/`
- [ ] **GET**: Verificar filtro de inativos, busca por nome
- [ ] **POST**: Verificar validações — nome obrigatório, valor > 0, comissões entre 0-100, `por_dente` boolean
- [ ] **PUT**: Verificar que `por_dente` pode ser alterado, valores de comissão validados
- [ ] **DELETE**: Verificar soft delete (ativo=0), verificar se procedimento em uso pode ser inativado

#### 4.2 — Testes: Procedimentos
- [ ] CRUD completo
- [ ] Busca por nome
- [ ] Filtro de inativos (padrão oculta, `?inativos=true` mostra)
- [ ] Comissão > 100 → 400
- [ ] Comissão < 0 → 400
- [ ] Valor negativo → 400
- [ ] Nome vazio → 400
- [ ] Soft delete não apaga registro
- [ ] Campo `por_dente` funciona corretamente
- [ ] Procedimento com valor 0 — é permitido?

### Critério de Conclusão
- [ ] Todos os testes passando
- [ ] Validações de comissão corretas

### Arquivo de testes
```
__tests__/
  api/
    procedimentos/
      crud.test.ts
      validacoes.test.ts
```

---

## Sprint 5 — Atendimentos (Fluxo Principal)

### Objetivo
Revisar a máquina de estados dos atendimentos e toda a lógica de transições. Este é o coração do sistema.

### Tarefas

#### 5.1 — Revisão de código: `api/atendimentos/` (listagem e criação)
- [ ] **GET**: Verificar JOINs (cliente, avaliador), filtros (status, cliente_id, busca), performance
- [ ] **POST normal**: Verificar validação de `avaliador_id` (existe? tem role avaliador?), `cliente_id` obrigatório
- [ ] **POST orto**: Verificar fluxo orto — cria atendimento com `aguardando_pagamento` + auto-cria item
- [ ] **Bloqueio**: Verificar que cliente com caso aberto não pode ter outro atendimento
- [ ] Verificar se `liberado_por_id` e `liberado_em` são setados corretamente

#### 5.2 — Revisão de código: `api/atendimentos/[id]` (detalhe e atualização)
- [ ] **GET [id]**: Verificar que retorna todos os itens com JOINs, totais (valor, valor_pago) calculados corretamente
- [ ] **PUT [id]**: Revisar TODA a máquina de estados:
  - `triagem → avaliacao` ✓
  - `avaliacao → aguardando_pagamento` (requer ≥1 item) ✓
  - `aguardando_pagamento → em_execucao` (requer ≥1 item pago) ✓
  - `em_execucao → aguardando_pagamento` (volta permitida) ✓
  - `em_execucao → finalizado` (NÃO deve ser direto, deve usar /finalizar)
  - Transições inválidas retornam erro claro
- [ ] Verificar se o status pode "pular" etapas (ex: triagem → em_execucao)

#### 5.3 — Revisão de código: `api/atendimentos/[id]/itens/`
- [ ] **GET**: Verificar JOINs corretos
- [ ] **POST**: Verificar que só permite adicionar em `triagem`, `avaliacao`, `em_execucao`
- [ ] **POST em em_execucao**: Verificar que volta automaticamente para `aguardando_pagamento`
- [ ] **DELETE**: Verificar que só permite em `avaliacao`
- [ ] **PUT item**: Verificar que só executor designado pode alterar status
- [ ] Verificar `criado_por_id` sempre preenchido
- [ ] Verificar campo `dentes` (JSON) é salvo/lido corretamente
- [ ] Verificar `quantidade` para procedimentos não `por_dente`

#### 5.4 — Testes: Atendimentos
- [ ] Criar atendimento normal → status `triagem`
- [ ] Criar atendimento orto → status `aguardando_pagamento` + item criado
- [ ] Cliente com caso aberto → bloqueio
- [ ] Todas as transições válidas da máquina de estados
- [ ] Todas as transições INVÁLIDAS → erro
- [ ] Transição `avaliacao → aguardando_pagamento` sem itens → erro
- [ ] Transição `aguardando_pagamento → em_execucao` sem pago → erro
- [ ] GET detalhe retorna totais corretos
- [ ] Filtros de listagem funcionam

#### 5.5 — Testes: Itens de Atendimento
- [ ] Adicionar item em cada status permitido
- [ ] Adicionar item em status não permitido → erro
- [ ] Remover item em `avaliacao` → sucesso
- [ ] Remover item fora de `avaliacao` → erro
- [ ] Atualizar status do item (pendente → pago → executando → concluido)
- [ ] Executor não designado tenta mudar status → erro
- [ ] `concluido_at` setado automaticamente ao concluir
- [ ] Adicionar item em `em_execucao` reverte para `aguardando_pagamento`

### Critério de Conclusão
- [ ] Máquina de estados 100% testada
- [ ] Nenhuma transição inválida é permitida
- [ ] Fluxo orto funciona corretamente
- [ ] Todos os testes passando

### Arquivo de testes
```
__tests__/
  api/
    atendimentos/
      crud.test.ts
      status-machine.test.ts
      itens.test.ts
      fluxo-orto.test.ts
```

---

## Sprint 6 — Pagamentos & Parcelas

### Objetivo
Revisar toda a lógica financeira — pagamentos, distribuição por item, parcelas e vencimentos.

### Tarefas

#### 6.1 — Revisão de código: `api/atendimentos/[id]/pagamentos/`
- [ ] **POST**: Verificar validação de valor > 0
- [ ] Verificar validação de método de pagamento
- [ ] Verificar que status deve ser `aguardando_pagamento` ou `em_execucao`
- [ ] Verificar distribuição por item (`itens: [{item_id, valor_aplicado}]`):
  - Soma dos `valor_aplicado` deve ser igual ao `valor` do pagamento
  - `item_id` deve pertencer ao atendimento
  - `valor_pago` do item é atualizado incrementalmente
  - Item transita para `pago` quando `valor_pago >= valor`
- [ ] Verificar se pagamento parcial funciona (pagar parte do item)
- [ ] Verificar se pagamento excedente é bloqueado (pagar mais que o valor do item)
- [ ] Verificar `recebido_por_id` — **BUG**: provavelmente hardcoded
- [ ] Verificar criação de `pagamentos_itens` (tabela junction)

#### 6.2 — Revisão de código: `api/atendimentos/[id]/parcelas/` e `api/parcelas/`
- [ ] **GET parcelas**: Verificar ordenação por número
- [ ] **POST parcela**: Verificar auto-incremento do número
- [ ] **PUT parcela**: Verificar que marca como paga, vincula `pagamento_id`
- [ ] **DELETE parcela**: Verificar bloqueio se já paga
- [ ] **GET /api/parcelas/vencidas**: Verificar lógica de vencimento (data < hoje + não paga)
- [ ] Verificar se parcelas somam ao valor total do atendimento

#### 6.3 — Testes: Pagamentos
- [ ] Pagamento com valor válido → sucesso
- [ ] Pagamento com valor 0 ou negativo → erro
- [ ] Pagamento com método inválido → erro
- [ ] Pagamento em status inválido → erro
- [ ] Distribuição por item → `valor_pago` atualizado
- [ ] Distribuição com soma incorreta → erro
- [ ] Item com `valor_pago >= valor` → transita para `pago`
- [ ] Pagamento parcial (item ainda não `pago`)
- [ ] Item de outro atendimento → erro
- [ ] `pagamentos_itens` criado corretamente

#### 6.4 — Testes: Parcelas
- [ ] Criar parcela → número auto-incrementado
- [ ] Marcar parcela como paga → sucesso
- [ ] Deletar parcela paga → erro
- [ ] Deletar parcela pendente → sucesso
- [ ] Listar vencidas → retorna apenas não pagas com data passada
- [ ] Parcelas ordenadas por número

### Critério de Conclusão
- [ ] Lógica financeira 100% correta
- [ ] Distribuição por itens funciona sem bugs
- [ ] Parcelas vencidas corretamente calculadas
- [ ] Todos os testes passando

### Arquivo de testes
```
__tests__/
  api/
    pagamentos/
      crud.test.ts
      distribuicao.test.ts
    parcelas/
      crud.test.ts
      vencidas.test.ts
```

---

## Sprint 7 — Execução, Prontuário & Anexos

### Objetivo
Revisar toda a lógica do fluxo de execução de procedimentos, incluindo upload de arquivos e prontuário eletrônico.

### Tarefas

#### 7.1 — Revisão de código: `api/execucao/`
- [ ] **GET /api/execucao**: Verificar filtro por `executor_id`, separação "meus" vs "disponíveis"
- [ ] Verificar que só mostra itens com status `pago`, `executando`, `concluido`
- [ ] Verificar que só mostra itens de atendimentos `em_execucao`
- [ ] Verificar JOINs (procedimento, cliente, executor)
- [ ] **GET item detail**: Verificar que traz todas as informações necessárias

#### 7.2 — Revisão de código: `api/execucao/item/[id]/notas/`
- [ ] **GET**: Verificar ordenação
- [ ] **POST**: Verificar validações — `usuario_id` e `texto` obrigatórios
- [ ] Verificar se qualquer usuário pode adicionar nota (deveria ser só executor?)

#### 7.3 — Revisão de código: `api/execucao/item/[id]/anexos/`
- [ ] **GET**: Verificar que lista apenas anexos do item
- [ ] **POST**: Verificar validação de tipo de arquivo (imagens, vídeos, PDF, DOC)
- [ ] Verificar limite de tamanho (50MB vídeo, 10MB outros)
- [ ] Verificar que arquivo é salvo no R2 com path correto
- [ ] **DELETE**: Verificar que deleta do R2 E do banco
- [ ] Verificar que só pode deletar anexos do próprio item (ownership)

#### 7.4 — Revisão de código: `api/execucao/item/[id]/prontuario/`
- [ ] **GET**: Verificar retorno (único por item)
- [ ] **POST**: Verificar upsert (cria ou atualiza)
- [ ] Verificar mínimo 50 caracteres para descrição
- [ ] Verificar que prontuário é obrigatório para marcar item como concluído

#### 7.5 — Revisão de código: `api/arquivos/[...path]/`
- [ ] Verificar que proxy do R2 funciona corretamente
- [ ] Verificar Content-Type correto
- [ ] Verificar header de cache
- [ ] Verificar `?download=true` para Content-Disposition
- [ ] **SEGURANÇA**: Verificar que não permite path traversal

#### 7.6 — Testes: Execução
- [ ] Fila do executor mostra apenas seus procedimentos
- [ ] "Disponíveis" mostra apenas sem executor
- [ ] Filtros de status funcionam
- [ ] Notas criadas corretamente
- [ ] Upload simulado (mock R2) salva metadados no banco
- [ ] Tipo de arquivo inválido → erro
- [ ] Arquivo muito grande → erro
- [ ] Delete de anexo remove do R2 e banco
- [ ] Prontuário GET/POST funciona
- [ ] Prontuário com < 50 chars → erro
- [ ] Prontuário upsert (criar e atualizar)

### Critério de Conclusão
- [ ] Fila de execução funciona corretamente
- [ ] Upload/download de arquivos seguro
- [ ] Prontuário com validação completa
- [ ] Todos os testes passando

### Arquivo de testes
```
__tests__/
  api/
    execucao/
      fila.test.ts
      notas.test.ts
      anexos.test.ts
      prontuario.test.ts
    arquivos/
      proxy.test.ts
```

---

## Sprint 8 — Comissões & Finalização

### Objetivo
Revisar a lógica de finalização de atendimentos e geração automática de comissões.

### Tarefas

#### 8.1 — Revisão de código: `api/atendimentos/[id]/finalizar/`
- [ ] Verificar que TODOS os itens devem estar `concluido`
- [ ] Verificar que TODOS os valores foram pagos (`valor_pago >= valor` para cada item)
- [ ] Verificar geração de comissão de **venda** (quem criou o item / avaliador):
  - Percentual correto (`comissao_venda` do procedimento)
  - Valor calculado: `item.valor * procedimento.comissao_venda / 100`
  - Tipo = `venda`
  - `usuario_id` = criador do item ou avaliador
- [ ] Verificar geração de comissão de **execução** (executor):
  - Percentual correto (`comissao_execucao` do procedimento)
  - Valor calculado: `item.valor * procedimento.comissao_execucao / 100`
  - Tipo = `execucao`
  - `usuario_id` = executor do item
- [ ] Verificar que `finalizado_at` é setado
- [ ] Verificar que status muda para `finalizado`
- [ ] **ATOMICIDADE**: Verificar se usa batch/transação (se uma comissão falha, tudo deve reverter)
- [ ] Verificar se comissões duplicadas são prevenidas (finalizar duas vezes)

#### 8.2 — Revisão de código: `api/comissoes/`
- [ ] **GET**: Verificar filtros por `usuario_id`, `data_inicio`, `data_fim`
- [ ] Verificar modo `?resumo=true` — agregação por usuário
- [ ] Verificar que retorna nome do procedimento e cliente
- [ ] Verificar cálculo de totais (venda + execução + geral)

#### 8.3 — Testes: Finalização
- [ ] Finalizar com todos itens concluídos e pagos → sucesso
- [ ] Finalizar com item não concluído → erro
- [ ] Finalizar com pagamento incompleto → erro
- [ ] Comissões geradas com valores corretos
- [ ] Comissão de venda para criador do item
- [ ] Comissão de execução para executor
- [ ] `finalizado_at` preenchido
- [ ] Tentar finalizar atendimento já finalizado → erro
- [ ] Comissões com procedimento `comissao_venda = 0` → não gera comissão de venda

#### 8.4 — Testes: Comissões API
- [ ] Listar todas as comissões
- [ ] Filtrar por usuário
- [ ] Filtrar por período
- [ ] Resumo por usuário (totais corretos)

### Critério de Conclusão
- [ ] Cálculo de comissões matematicamente correto
- [ ] Finalização é atômica
- [ ] Não permite finalização duplicada
- [ ] Todos os testes passando

### Arquivo de testes
```
__tests__/
  api/
    atendimentos/
      finalizar.test.ts
    comissoes/
      crud.test.ts
      calculo.test.ts
```

---

## Sprint 9 — Dashboard & Relatórios

### Objetivo
Revisar e testar os endpoints de dashboard e métricas administrativas.

### Tarefas

#### 9.1 — Revisão de código: `api/dashboard/`
- [ ] **GET**: Verificar estatísticas por role
- [ ] Executor: procedimentos meus + disponíveis
- [ ] Avaliador: avaliações minhas + não atribuídas
- [ ] Total de clientes, atendimentos do dia
- [ ] Contagem por status de atendimento
- [ ] Parcelas vencidas
- [ ] Comissões mensais do usuário

#### 9.2 — Revisão de código: `api/dashboard/admin`
- [ ] **GET**: Verificar todas as métricas:
  - Receita total e a receber
  - Parcelas em atraso
  - Atendimentos por status
  - Receita por canal de aquisição
  - Top 10 procedimentos
  - Tendência de receita 6 meses
  - Total clientes e ticket médio
  - Top vendedores e executores
  - Taxa de conversão
  - Total comissões
- [ ] Verificar filtro de período (`data_inicio`, `data_fim`)
- [ ] **PERFORMANCE**: Verificar se queries são eficientes (N+1, subqueries desnecessárias)

#### 9.3 — Revisão de código: `api/meus-procedimentos/`
- [ ] Verificar que combina itens criados + executados
- [ ] Verificar ordenação
- [ ] Verificar que requer `usuario_id`

#### 9.4 — Testes: Dashboard
- [ ] Dashboard retorna métricas corretas para cada role
- [ ] Dashboard admin com dados → métricas calculadas corretamente
- [ ] Dashboard admin sem dados → zeros, não erros
- [ ] Filtro de período funciona
- [ ] Meus procedimentos retorna os corretos

### Critério de Conclusão
- [ ] Métricas calculadas corretamente
- [ ] Dashboard não quebra com banco vazio
- [ ] Queries performáticas
- [ ] Todos os testes passando

### Arquivo de testes
```
__tests__/
  api/
    dashboard/
      dashboard.test.ts
      admin.test.ts
    meus-procedimentos/
      index.test.ts
```

---

## Sprint 10 — Segurança, Middleware & Hardening

### Objetivo
Implementar as camadas de segurança que faltam e fortalecer o backend contra abusos.

### Tarefas

#### 10.1 — Implementar hash de senhas
- [ ] Escolher algoritmo compatível com Cloudflare Workers (`crypto.subtle` com PBKDF2 ou scrypt)
- [ ] Criar funções `hashPassword(plain)` e `verifyPassword(plain, hash)`
- [ ] Atualizar `POST /api/auth/login` para usar `verifyPassword`
- [ ] Atualizar `PUT /api/auth/senha` para usar `hashPassword`
- [ ] Atualizar `POST /api/usuarios` para hashear senha padrão
- [ ] Criar migration script para hashear senhas existentes

#### 10.2 — Implementar autenticação baseada em JWT
- [ ] Criar `lib/auth.ts` com funções de JWT (sign, verify)
- [ ] Login retorna JWT em cookie HttpOnly
- [ ] Criar middleware `withAuth(handler)` que valida JWT
- [ ] Adicionar `user` ao context do request
- [ ] Token com expiração (ex: 24h)
- [ ] Endpoint de refresh token (opcional)

#### 10.3 — Implementar autorização por role
- [ ] Criar middleware `withRole(handler, roles[])` que verifica role do usuário
- [ ] Aplicar em cada rota conforme mapeamento de permissões
- [ ] Testes para cada combinação de role x endpoint

#### 10.4 — Sanitização e validação de inputs
- [ ] Revisar TODA entrada de texto para SQL injection (prepared statements)
- [ ] Sanitizar HTML/scripts em campos de texto livre
- [ ] Validar e limitar tamanho de inputs
- [ ] Implementar paginação em endpoints de listagem

#### 10.5 — Headers de segurança e CORS
- [ ] Configurar CORS adequadamente
- [ ] Headers: X-Content-Type-Options, X-Frame-Options, etc.
- [ ] Verificar CSP (Content Security Policy)

#### 10.6 — Testes de segurança
- [ ] SQL injection em campos de busca
- [ ] XSS em campos de texto
- [ ] IDOR (acessar recursos de outros usuários)
- [ ] Token manipulation
- [ ] Path traversal no endpoint de arquivos

### Critério de Conclusão
- [ ] Senhas com hash
- [ ] JWT funcional
- [ ] Autorização por role em todas as rotas
- [ ] Nenhuma vulnerabilidade conhecida
- [ ] Todos os testes passando

### Arquivo de testes
```
__tests__/
  security/
    password-hashing.test.ts
    jwt.test.ts
    authorization.test.ts
    input-validation.test.ts
    file-traversal.test.ts
```

---

## Sprint 11 — Testes de Integração End-to-End

### Objetivo
Testar o fluxo completo de um atendimento do início ao fim, validando que todas as peças trabalham juntas.

### Tarefas

#### 11.1 — Fluxo completo: Atendimento Normal
```
1. Criar cliente
2. Criar atendimento (triagem)
3. Avançar para avaliação
4. Adicionar procedimentos (itens)
5. Avançar para aguardando_pagamento
6. Registrar pagamento com distribuição por item
7. Verificar itens marcados como pago
8. Avançar para em_execução
9. Executor assume procedimento
10. Registrar notas de execução
11. Fazer upload de anexo
12. Preencher prontuário
13. Marcar item como concluído
14. Finalizar atendimento
15. Verificar comissões geradas
16. Verificar dashboard atualizado
```

#### 11.2 — Fluxo completo: Atendimento Orto
```
1. Criar cliente
2. Criar atendimento orto (pula para aguardando_pagamento)
3. Registrar pagamento
4. Avançar para execução
5. Completar procedimento
6. Finalizar e verificar comissões
```

#### 11.3 — Fluxo com parcelas
```
1. Criar atendimento com procedimentos
2. Criar parcelas programadas
3. Registrar pagamentos vinculados às parcelas
4. Verificar marcação de parcelas como pagas
5. Verificar parcelas vencidas
```

#### 11.4 — Fluxos de erro
- [ ] Tentar pular etapas da pipeline
- [ ] Tentar finalizar sem pagar tudo
- [ ] Tentar deletar cliente com atendimento ativo
- [ ] Tentar adicionar item em atendimento finalizado
- [ ] Pagamento distribuído com soma errada

#### 11.5 — Cenários de concorrência/edge cases
- [ ] Dois pagamentos simultâneos para o mesmo item
- [ ] Adicionar item durante execução (revert para aguardando_pagamento)
- [ ] Procedimento `por_dente` com múltiplos dentes
- [ ] Item com quantidade > 1
- [ ] Procedimento com comissão 0%

### Critério de Conclusão
- [ ] Fluxo completo normal funciona sem falhas
- [ ] Fluxo orto funciona sem falhas
- [ ] Fluxo com parcelas funciona sem falhas
- [ ] Edge cases tratados
- [ ] Todos os testes passando

### Arquivo de testes
```
__tests__/
  integration/
    fluxo-normal.test.ts
    fluxo-orto.test.ts
    fluxo-parcelas.test.ts
    edge-cases.test.ts
```

---

## Sprint 12 — Correções Finais, Documentação & Cobertura

### Objetivo
Fechar todas as issues encontradas durante os sprints, garantir cobertura de testes e documentar a API.

### Tarefas

#### 12.1 — Correções pendentes
- [ ] Resolver todos os bugs encontrados nos sprints anteriores
- [ ] Remover código morto (página `minhas-comissoes` se não usada)
- [ ] Corrigir `recebido_por_id` hardcoded nos pagamentos
- [ ] Limpar TODOs no código

#### 12.2 — Cobertura de testes
- [ ] Executar `jest --coverage`
- [ ] Garantir cobertura mínima:
  - `lib/utils/` > 95%
  - `app/api/` > 80%
  - `lib/db.ts` > 70%
- [ ] Adicionar testes faltantes para atingir as metas

#### 12.3 — Documentação da API
- [ ] Documentar todos os endpoints (método, path, body, response)
- [ ] Documentar códigos de erro e suas condições
- [ ] Documentar a máquina de estados dos atendimentos
- [ ] Documentar o fluxo de comissões

#### 12.4 — Performance
- [ ] Revisar queries que podem ser lentas (subqueries, falta de índices)
- [ ] Verificar se todas as foreign keys tem índice correspondente
- [ ] Verificar se as queries do dashboard admin são eficientes

#### 12.5 — Validação final
- [ ] Rodar todos os testes: `npm test`
- [ ] Verificar build: `npm run build`
- [ ] Deploy em ambiente de staging e testar manualmente os fluxos críticos

### Critério de Conclusão
- [ ] Zero bugs conhecidos
- [ ] Cobertura de testes satisfatória
- [ ] API documentada
- [ ] Build sem erros
- [ ] Deploy funcional

---

## Resumo de Arquivos de Teste a Criar

```
__tests__/
  helpers/
    api-test-helper.ts
    db-mock.ts
    seed.ts
  unit/
    validators.test.ts
    formatters.test.ts
    masks.test.ts
  api/
    auth/
      login.test.ts
      senha.test.ts
      middleware.test.ts
    clientes/
      crud.test.ts
      validacoes.test.ts
    usuarios/
      crud.test.ts
      validacoes.test.ts
    procedimentos/
      crud.test.ts
      validacoes.test.ts
    atendimentos/
      crud.test.ts
      status-machine.test.ts
      itens.test.ts
      fluxo-orto.test.ts
      finalizar.test.ts
    pagamentos/
      crud.test.ts
      distribuicao.test.ts
    parcelas/
      crud.test.ts
      vencidas.test.ts
    execucao/
      fila.test.ts
      notas.test.ts
      anexos.test.ts
      prontuario.test.ts
    arquivos/
      proxy.test.ts
    comissoes/
      crud.test.ts
      calculo.test.ts
    dashboard/
      dashboard.test.ts
      admin.test.ts
    meus-procedimentos/
      index.test.ts
  security/
    password-hashing.test.ts
    jwt.test.ts
    authorization.test.ts
    input-validation.test.ts
    file-traversal.test.ts
  integration/
    fluxo-normal.test.ts
    fluxo-orto.test.ts
    fluxo-parcelas.test.ts
    edge-cases.test.ts
```

---

## Prioridades

### P0 (Crítico — fazer primeiro)
- Sprint 2: Hash de senhas e auth (segurança)
- Sprint 5: Máquina de estados (core business)
- Sprint 6: Lógica financeira (dinheiro não pode ter bug)

### P1 (Importante)
- Sprint 1: Infraestrutura de testes (prerequisito)
- Sprint 8: Comissões (impacto financeiro)
- Sprint 10: Middleware de segurança

### P2 (Necessário)
- Sprint 3, 4: CRUDs básicos
- Sprint 7: Execução e prontuário
- Sprint 9: Dashboard

### P3 (Finalização)
- Sprint 11: Integração E2E
- Sprint 12: Documentação e cobertura
