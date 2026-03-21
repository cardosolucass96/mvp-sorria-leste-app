# Documentação da API — Sorria Leste MVP

> **Base URL**: `/api`  
> **Autenticação**: JWT via header `Authorization: Bearer <token>` ou cookie `auth-token` (HttpOnly, 24h)  
> **Formato**: Todos os endpoints retornam JSON. Uploads usam `multipart/form-data`.

---

## Índice

1. [Autenticação](#1-autenticação)
2. [Clientes](#2-clientes)
3. [Usuários](#3-usuários)
4. [Procedimentos](#4-procedimentos)
5. [Atendimentos](#5-atendimentos)
6. [Itens de Atendimento](#6-itens-de-atendimento)
7. [Pagamentos](#7-pagamentos)
8. [Parcelas](#8-parcelas)
9. [Finalização](#9-finalização)
10. [Execução](#10-execução)
11. [Notas de Execução](#11-notas-de-execução)
12. [Prontuário](#12-prontuário)
13. [Anexos de Execução](#13-anexos-de-execução)
14. [Comissões](#14-comissões)
15. [Dashboard](#15-dashboard)
16. [Parcelas Vencidas](#16-parcelas-vencidas)
17. [Meus Procedimentos](#17-meus-procedimentos)
18. [Arquivos (R2)](#18-arquivos-r2)
19. [Máquina de Estados](#19-máquina-de-estados)
20. [Fluxo de Comissões](#20-fluxo-de-comissões)
21. [Códigos de Erro Padrão](#21-códigos-de-erro-padrão)

---

## 1. Autenticação

### `POST /api/auth/login`

Autentica um usuário e retorna token JWT.

| Campo   | Tipo   | Obrigatório | Descrição        |
|---------|--------|-------------|------------------|
| `email` | string | ✅          | E-mail do usuário |
| `senha` | string | ✅          | Senha do usuário  |

**Resposta (200)**:
```json
{
  "user": { "id": 1, "nome": "...", "email": "...", "role": "admin", "ativo": 1, "created_at": "..." },
  "token": "eyJhbGciOi..."
}
```
Também define cookie `auth-token` (HttpOnly, 24h).

**Erros**: `400` (campos faltando), `401` (credenciais inválidas), `500`

---

### `PUT /api/auth/senha`

Altera a senha de um usuário.

| Campo         | Tipo   | Obrigatório | Descrição                  |
|---------------|--------|-------------|----------------------------|
| `usuario_id`  | number | ✅          | ID do usuário              |
| `senha_atual` | string | ✅          | Senha atual para validação |
| `nova_senha`  | string | ✅          | Nova senha (mín. 6 chars)  |

**Resposta (200)**:
```json
{ "success": true, "message": "Senha alterada com sucesso" }
```

**Erros**: `400` (campos faltando, nova_senha < 6), `401` (senha atual incorreta), `404` (usuário não encontrado), `500`

---

## 2. Clientes

### `GET /api/clientes`

Lista clientes com filtro opcional.

| Query   | Tipo   | Descrição                                   |
|---------|--------|---------------------------------------------|
| `busca` | string | Busca por nome, CPF, telefone ou e-mail    |

**Resposta (200)**: `Cliente[]`

---

### `POST /api/clientes`

Cria um novo cliente.

| Campo            | Tipo   | Obrigatório | Descrição                                                     |
|------------------|--------|-------------|---------------------------------------------------------------|
| `nome`           | string | ✅          | Nome completo                                                 |
| `cpf`            | string | ❌          | CPF (validado, único)                                         |
| `telefone`       | string | ❌          | Telefone                                                      |
| `email`          | string | ❌          | E-mail                                                        |
| `data_nascimento`| string | ❌          | Data de nascimento (ISO)                                      |
| `endereco`       | string | ❌          | Endereço                                                      |
| `origem`         | string | ✅          | `fachada`, `trafego_meta`, `trafego_google`, `organico`, `indicacao` |
| `observacoes`    | string | ❌          | Observações                                                   |

**Resposta (201)**: `Cliente`

**Erros**: `400` (nome vazio, origem inválida), `409` (CPF duplicado), `500`

---

### `GET /api/clientes/[id]`

Retorna cliente por ID.

**Resposta (200)**: `Cliente`  
**Erros**: `404`, `500`

---

### `PUT /api/clientes/[id]`

Atualiza dados do cliente.

**Body**: Mesmos campos de `POST`, todos opcionais.  
**Resposta (200)**: `Cliente` (atualizado)  
**Erros**: `400` (nome vazio, origem inválida), `404`, `409` (CPF duplicado), `500`

---

### `DELETE /api/clientes/[id]`

Exclui cliente (delete físico).

**Resposta (200)**:
```json
{ "message": "Cliente excluído com sucesso" }
```

**Erros**: `404`, `409` (cliente possui atendimentos vinculados), `500`

---

## 3. Usuários

### `GET /api/usuarios`

Lista todos os usuários (sem campo senha).

**Resposta (200)**: `Usuario[]` (`id`, `nome`, `email`, `role`, `ativo`, `created_at`)

---

### `POST /api/usuarios`

Cria usuário com senha padrão `Sorria@123`.

| Campo   | Tipo   | Obrigatório | Descrição                                      |
|---------|--------|-------------|-------------------------------------------------|
| `nome`  | string | ✅          | Nome completo                                   |
| `email` | string | ✅          | E-mail (único)                                  |
| `role`  | string | ✅          | `admin`, `atendente`, `avaliador`, `executor`   |

**Resposta (201)**: `Usuario`  
**Erros**: `400` (campos faltando, role inválida), `409` (e-mail duplicado), `500`

---

### `GET /api/usuarios/[id]`

**Resposta (200)**: `Usuario`  
**Erros**: `404`, `500`

---

### `PUT /api/usuarios/[id]`

| Campo  | Tipo    | Descrição            |
|--------|---------|----------------------|
| `nome` | string  | Nome                 |
| `email`| string  | E-mail               |
| `role` | string  | Papel                |
| `ativo`| boolean | Ativo/inativo        |

**Resposta (200)**: `Usuario`  
**Erros**: `400` (role inválida), `404`, `409` (e-mail duplicado), `500`

---

### `DELETE /api/usuarios/[id]`

Desativação lógica (soft delete → `ativo=0`).

**Resposta (200)**:
```json
{ "message": "Usuário desativado com sucesso" }
```

**Erros**: `404`, `500`

---

## 4. Procedimentos

### `GET /api/procedimentos`

| Query      | Tipo   | Descrição                              |
|------------|--------|----------------------------------------|
| `busca`    | string | Busca por nome                         |
| `inativos` | string | `"true"` para incluir inativos        |

**Resposta (200)**: `Procedimento[]`

---

### `POST /api/procedimentos`

| Campo              | Tipo    | Obrigatório | Descrição                            |
|--------------------|---------|-------------|--------------------------------------|
| `nome`             | string  | ✅          | Nome do procedimento                 |
| `valor`            | number  | ✅          | Valor (≥ 0)                          |
| `comissao_venda`   | number  | ❌          | % comissão de venda (0-100)          |
| `comissao_execucao`| number  | ❌          | % comissão de execução (0-100)       |
| `por_dente`        | boolean | ❌          | Se o valor é cobrado por dente       |

**Resposta (201)**: `Procedimento`  
**Erros**: `400` (nome vazio, valor negativo, comissão fora do range), `500`

---

### `GET /api/procedimentos/[id]`

**Resposta (200)**: `Procedimento`  
**Erros**: `404`, `500`

---

### `PUT /api/procedimentos/[id]`

**Body**: Mesmos campos de `POST`, todos opcionais.  
**Resposta (200)**: `Procedimento`  
**Erros**: `400`, `404`, `500`

---

### `DELETE /api/procedimentos/[id]`

Desativação lógica (soft delete → `ativo=0`).

**Resposta (200)**:
```json
{ "message": "Procedimento desativado com sucesso" }
```

**Erros**: `404`, `500`

---

## 5. Atendimentos

### `GET /api/atendimentos`

| Query       | Tipo   | Descrição                   |
|-------------|--------|-----------------------------|
| `status`    | string | Filtrar por status          |
| `cliente_id`| string | Filtrar por cliente         |
| `busca`     | string | Busca por nome/CPF cliente  |

**Resposta (200)**: `AtendimentoComCliente[]` (inclui `cliente_nome`, `cliente_cpf`, `cliente_telefone`, `avaliador_nome`)

---

### `POST /api/atendimentos`

Cria atendimento. Dois fluxos possíveis:

#### Fluxo Normal
| Campo         | Tipo   | Obrigatório | Descrição                 |
|---------------|--------|-------------|---------------------------|
| `cliente_id`  | number | ✅          | ID do cliente             |
| `avaliador_id`| number | ❌          | ID do avaliador atribuído |

Cria atendimento com status `triagem`.

#### Fluxo Ortodontia
| Campo           | Tipo   | Obrigatório | Descrição                 |
|-----------------|--------|-------------|---------------------------|
| `cliente_id`    | number | ✅          | ID do cliente             |
| `tipo_orto`     | true   | ✅          | Flag de fluxo ortodontia  |
| `executor_id`   | number | ✅          | ID do executor            |
| `procedimento_id`| number| ✅          | ID do procedimento        |
| `valor`         | number | ❌          | Valor customizado         |

Cria atendimento com status `aguardando_pagamento` e auto-cria um item.

**Resposta (201)**: `AtendimentoComCliente`  
**Erros**: `400` (cliente_id faltando, cliente já tem atendimento aberto, avaliador com role errado, campos orto faltando), `404`, `500`

---

### `GET /api/atendimentos/[id]`

Retorna atendimento completo com itens e totais.

**Resposta (200)**:
```json
{
  "id": 1,
  "cliente_id": 1,
  "cliente_nome": "...",
  "avaliador_nome": "...",
  "liberado_por_nome": "...",
  "status": "avaliacao",
  "itens": [...],
  "total": 1500.00,
  "total_pago": 500.00,
  ...
}
```

**Erros**: `404`, `500`

---

### `PUT /api/atendimentos/[id]`

Atualiza status (transição) ou avaliador.

| Campo         | Tipo          | Descrição                               |
|---------------|---------------|-----------------------------------------|
| `status`      | string        | Próximo status (ver Máquina de Estados) |
| `avaliador_id`| number\|null  | Atribuir/remover avaliador             |

**Regras de transição** — ver [Máquina de Estados](#19-máquina-de-estados).

**Resposta (200)**: `AtendimentoComCliente`  
**Erros**: `400` (transição inválida, sem itens, sem itens pagos), `404`, `500`

---

## 6. Itens de Atendimento

### `GET /api/atendimentos/[id]/itens`

**Resposta (200)**: `ItemAtendimentoCompleto[]` (inclui `procedimento_nome`, `executor_nome`, `criado_por_nome`)

---

### `POST /api/atendimentos/[id]/itens`

Adiciona procedimento ao atendimento.

| Campo            | Tipo   | Obrigatório | Descrição                     |
|------------------|--------|-------------|-------------------------------|
| `procedimento_id`| number | ✅          | ID do procedimento            |
| `executor_id`    | number | ❌          | ID do executor atribuído      |
| `criado_por_id`  | number | ❌          | ID de quem criou              |
| `valor`          | number | ❌          | Valor customizado (default do procedimento) |
| `dentes`         | string | ❌          | JSON array de números dos dentes |
| `quantidade`     | number | ❌          | Quantidade de dentes          |

> **Nota**: Se adicionado durante status `em_execucao`, o atendimento reverte para `aguardando_pagamento`.

**Resposta (201)**: `ItemAtendimentoCompleto`  
**Erros**: `400` (status inadequado, procedimento_id faltando, executor com role errado), `404`, `500`

---

### `PUT /api/atendimentos/[id]/itens/[itemId]`

Atualiza item de atendimento.

| Campo        | Tipo          | Descrição                                |
|--------------|---------------|------------------------------------------|
| `executor_id`| number\|null  | Atribuir/remover executor                |
| `valor`      | number        | Valor do item                            |
| `status`     | string        | `pendente`, `pago`, `executando`, `concluido` |
| `usuario_id` | number        | ID do usuário que faz a alteração        |

> Se `status=concluido`, define `concluido_at` automaticamente.

**Resposta (200)**: `ItemAtendimentoCompleto`  
**Erros**: `400` (sem campos), `403` (executor não designado tenta mudar para executando/concluido), `404`, `500`

---

### `DELETE /api/atendimentos/[id]/itens?item_id=X`

Remove item do atendimento.

| Query       | Tipo   | Obrigatório | Descrição       |
|-------------|--------|-------------|-----------------|
| `item_id`   | string | ✅          | ID do item      |
| `usuario_id`| string | ❌          | ID do operador  |

**Resposta (200)**: `{ "message": "Item removido com sucesso" }`  
**Erros**: `400` (item_id faltando, atendimento não está em avaliação), `404`, `500`

---

## 7. Pagamentos

### `GET /api/atendimentos/[id]/pagamentos`

**Resposta (200)**: `(Pagamento & { recebido_por_nome })[]`  
**Erros**: `404`, `500`

---

### `POST /api/atendimentos/[id]/pagamentos`

Registra pagamento.

| Campo        | Tipo   | Obrigatório | Descrição                                     |
|--------------|--------|-------------|------------------------------------------------|
| `valor`      | number | ✅          | Valor (> 0)                                    |
| `metodo`     | string | ✅          | `dinheiro`, `pix`, `cartao_debito`, `cartao_credito` |
| `parcelas`   | number | ❌          | Número de parcelas (para cartão)               |
| `observacoes`| string | ❌          | Observações                                    |
| `itens`      | array  | ❌          | Distribuição: `[{ item_id, valor_aplicado }]` |

> **recebido_por_id**: Extraído automaticamente do JWT. Fallback para primeiro usuário do sistema.  
> Se `itens` fornecido, atualiza `valor_pago` dos itens e marca como `pago` quando integralmente pagos.

**Resposta (201)**: `Pagamento`  
**Erros**: `400` (status inadequado, valor ≤ 0, método inválido, soma dos itens ≠ valor), `404`, `500`

---

## 8. Parcelas

### `GET /api/atendimentos/[id]/parcelas`

**Resposta (200)**: `Parcela[]`  
**Erros**: `404`, `500`

---

### `POST /api/atendimentos/[id]/parcelas`

| Campo            | Tipo   | Obrigatório | Descrição              |
|------------------|--------|-------------|------------------------|
| `valor`          | number | ✅          | Valor da parcela (> 0) |
| `data_vencimento`| string | ✅          | Data de vencimento     |
| `observacoes`    | string | ❌          | Observações            |

**Resposta (201)**: `Parcela` (auto-incrementa `numero`)  
**Erros**: `400` (valor ≤ 0, data_vencimento faltando), `404`, `500`

---

### `PUT /api/atendimentos/[id]/parcelas`

Marca parcela como paga.

| Campo         | Tipo   | Obrigatório | Descrição            |
|---------------|--------|-------------|----------------------|
| `parcela_id`  | number | ✅          | ID da parcela        |
| `pagamento_id`| number | ❌          | ID do pagamento      |

**Resposta (200)**: `Parcela` (com `pago=1`)  
**Erros**: `400` (parcela_id faltando), `404`, `500`

---

### `DELETE /api/atendimentos/[id]/parcelas?parcela_id=X`

Remove parcela não paga.

| Query        | Tipo   | Obrigatório | Descrição       |
|--------------|--------|-------------|-----------------|
| `parcela_id` | string | ✅          | ID da parcela   |

**Resposta (200)**: `{ "message": "Parcela removida com sucesso" }`  
**Erros**: `400` (parcela_id faltando, parcela já paga), `404`, `500`

---

## 9. Finalização

### `POST /api/atendimentos/[id]/finalizar`

Finaliza atendimento e calcula comissões.

**Pré-condições**:
- Status deve ser `em_execucao`
- Todos os itens devem estar `concluido`
- Todos os itens devem estar integralmente pagos (`valor_pago ≥ valor`)

**Resposta (200)**:
```json
{
  "success": true,
  "message": "Atendimento finalizado com sucesso",
  "comissoes": {
    "venda": 150.00,
    "execucao": 200.00,
    "total": 350.00,
    "detalhes": [
      { "tipo": "venda", "usuario_id": 1, "valor": 150.00 },
      { "tipo": "execucao", "usuario_id": 2, "valor": 200.00 }
    ]
  }
}
```

**Erros**: `400` (não em em_execucao, sem itens, itens não concluídos com `pendentes` count, itens não pagos com `valorFaltante`), `404`, `500`

---

## 10. Execução

### `GET /api/execucao?executor_id=X`

Retorna procedimentos para o executor visualizar.

**Resposta (200)**:
```json
{
  "meusProcedimentos": [...],  // Itens atribuídos ao executor
  "disponiveis": [...]         // Itens sem executor atribuído
}
```

Filtra itens com status `pago`/`executando`/`concluido` de atendimentos em `em_execucao`.

**Erros**: `400` (executor_id ausente), `500`

---

### `GET /api/execucao/item/[id]`

Retorna detalhe do item de execução com dados do cliente e procedimento.

**Resposta (200)**:
```json
{
  "item_id": 1,
  "atendimento_id": 1,
  "procedimento_nome": "Limpeza",
  "por_dente": 0,
  "executor_nome": "Dr. João",
  "cliente_nome": "Maria",
  "valor": 500,
  "valor_pago": 500,
  "dentes": null,
  "status": "pago",
  ...
}
```

**Erros**: `404`, `500`

---

## 11. Notas de Execução

### `GET /api/execucao/item/[id]/notas`

**Resposta (200)**: `Nota[]` (`id`, `item_atendimento_id`, `usuario_id`, `usuario_nome`, `texto`, `created_at`)

---

### `POST /api/execucao/item/[id]/notas`

| Campo       | Tipo   | Obrigatório | Descrição            |
|-------------|--------|-------------|----------------------|
| `usuario_id`| number | ✅          | ID do autor da nota  |
| `texto`     | string | ✅          | Texto da nota        |

**Resposta (201)**: `{ "id": 1, "message": "Nota adicionada com sucesso" }`  
**Erros**: `400` (usuario_id faltando, texto vazio), `500`

---

## 12. Prontuário

### `GET /api/execucao/item/[id]/prontuario`

**Resposta (200)**:
```json
{
  "prontuario": {
    "id": 1,
    "item_atendimento_id": 1,
    "usuario_id": 2,
    "usuario_nome": "Dr. João",
    "descricao": "...",
    "observacoes": "...",
    "created_at": "...",
    "updated_at": "..."
  }
}
```
Retorna `{ "prontuario": null }` se não existir.

---

### `POST /api/execucao/item/[id]/prontuario`

Cria ou atualiza prontuário (upsert).

| Campo        | Tipo   | Obrigatório | Descrição                    |
|--------------|--------|-------------|------------------------------|
| `usuario_id` | number | ✅          | ID do autor                  |
| `descricao`  | string | ✅          | Descrição clínica (mín. 50 chars) |
| `observacoes`| string | ❌          | Observações adicionais       |

**Resposta (200/201)**: `{ "success": true, "prontuario": Prontuario, "message": "Prontuário criado|atualizado" }`  
**Erros**: `400` (usuario_id faltando, descrição < 50 chars), `500`

---

## 13. Anexos de Execução

### `GET /api/execucao/item/[id]/anexos`

**Resposta (200)**: `Anexo[]` (`id`, `item_atendimento_id`, `usuario_id`, `usuario_nome`, `nome_arquivo`, `tipo_arquivo`, `caminho`, `tamanho`, `descricao`, `created_at`)

---

### `POST /api/execucao/item/[id]/anexos`

Upload de arquivo via `FormData`.

| Campo       | Tipo   | Obrigatório | Descrição                            |
|-------------|--------|-------------|--------------------------------------|
| `arquivo`   | File   | ✅          | Arquivo a ser enviado                |
| `usuario_id`| string | ✅          | ID do usuário (como string no form)  |
| `descricao` | string | ❌          | Descrição do anexo                   |

**Tipos permitidos**: JPEG, PNG, GIF, WebP, MP4, WebM, MOV, PDF, DOC, DOCX  
**Tamanho máximo**: 50MB (vídeo), 10MB (demais)

**Resposta (201)**: `{ "id": 1, "caminho": "execucao/1/abc123.jpg", "message": "Arquivo enviado com sucesso" }`  
**Erros**: `400` (arquivo faltando, usuario_id faltando, tipo inválido, arquivo muito grande), `500`

---

### `DELETE /api/execucao/item/[id]/anexos?anexo_id=X`

Remove anexo (deleta do R2 e do banco).

| Query      | Tipo   | Obrigatório | Descrição        |
|------------|--------|-------------|------------------|
| `anexo_id` | string | ✅          | ID do anexo      |

**Resposta (200)**: `{ "message": "Anexo removido com sucesso" }`  
**Erros**: `400` (anexo_id faltando), `403` (anexo não pertence a este item), `500`

---

## 14. Comissões

### `GET /api/comissoes`

| Query        | Tipo   | Descrição                            |
|--------------|--------|--------------------------------------|
| `usuario_id` | string | Filtrar por usuário                  |
| `data_inicio`| string | Data início (ISO)                    |
| `data_fim`   | string | Data fim (ISO)                       |
| `resumo`     | string | `"true"` para visão agregada         |

**Resposta detalhada (200)**:
```json
{
  "comissoes": [
    {
      "id": 1,
      "usuario_nome": "Maria",
      "procedimento_nome": "Limpeza",
      "cliente_nome": "João",
      "tipo": "venda",
      "percentual": 10,
      "valor_base": 500,
      "valor_comissao": 50
    }
  ],
  "totais": { "venda": 150, "execucao": 200, "geral": 350 }
}
```

**Resposta resumida (200)** (`resumo=true`):
```json
[
  {
    "usuario_id": 1,
    "usuario_nome": "Maria",
    "total_venda": 150,
    "total_execucao": 200,
    "total_geral": 350,
    "quantidade": 5
  }
]
```

---

## 15. Dashboard

### `GET /api/dashboard`

| Query       | Tipo   | Descrição                                |
|-------------|--------|------------------------------------------|
| `usuario_id`| string | ID do usuário logado                     |
| `role`      | string | `executor`, `avaliador`, `admin`         |

**Resposta (200)**:
```json
{
  "totalClientes": 50,
  "atendimentosHoje": 3,
  "aguardandoPagamento": 5,
  "finalizadosHoje": 2,
  "emExecucao": 8,
  "emAvaliacao": 4,
  "parcelasVencidas": 1,
  "minhasComissoes": 350.00,
  "meusProcedimentos": 3,
  "procedimentosDisponiveis": 2,
  "meusAtendimentosAvaliacao": 4,
  "atendimentosDisponiveisAvaliacao": 6
}
```

---

### `GET /api/dashboard/admin`

Dashboard administrativo com métricas detalhadas.

| Query        | Tipo   | Descrição              |
|--------------|--------|------------------------|
| `data_inicio`| string | Data início do período |
| `data_fim`   | string | Data fim do período    |

**Resposta (200)**:
```json
{
  "resumo": {
    "faturamento": 50000,
    "aReceber": 10000,
    "vencidas": 2000,
    "parcelasVencidas": 3,
    "totalAtendimentos": 120,
    "totalClientes": 50,
    "ticketMedio": 416.67,
    "taxaConversao": 0.65,
    "comissoesTotal": 5000,
    "atendimentosFinalizados": 78
  },
  "porStatus": [{ "status": "triagem", "count": 10 }],
  "porCanal": [{ "origem": "fachada", "label": "Fachada", "total": 20000, "count": 30 }],
  "topProcedimentos": [{ "nome": "Limpeza", "total": 15000, "count": 40 }],
  "faturamentoMensal": [{ "mes": "2025-01", "faturamento": 8000, "atendimentos": 15 }],
  "topVendedores": [{ "nome": "Maria", "tipo": "venda", "total": 3000 }],
  "topExecutores": [{ "nome": "Dr. João", "tipo": "execucao", "total": 2000 }]
}
```

---

## 16. Parcelas Vencidas

### `GET /api/parcelas/vencidas`

Retorna parcelas não pagas com data de vencimento anterior a hoje.

**Resposta (200)**:
```json
[
  {
    "id": 1,
    "atendimento_id": 5,
    "numero": 3,
    "valor": 300,
    "data_vencimento": "2025-01-15",
    "pago": 0,
    "cliente_nome": "João"
  }
]
```

---

## 17. Meus Procedimentos

### `GET /api/meus-procedimentos?usuario_id=X`

Retorna procedimentos associados ao usuário (como avaliador ou executor).

**Resposta (200)**:
```json
[
  {
    "item_id": 1,
    "atendimento_id": 5,
    "procedimento_nome": "Limpeza",
    "cliente_nome": "João",
    "dentes": null,
    "quantidade": 1,
    "status": "pago",
    "tipo": "execucao",
    "created_at": "...",
    "concluido_at": null
  }
]
```

**Erros**: `400` (usuario_id ausente), `500`

---

## 18. Arquivos (R2)

### `GET /api/arquivos/[...path]`

Serve arquivos do Cloudflare R2.

| Segmentos | Descrição                                            |
|-----------|------------------------------------------------------|
| `path`    | Catch-all: e.g. `execucao/5/1234.jpg` → R2 key     |

| Query      | Tipo   | Descrição                         |
|------------|--------|-----------------------------------|
| `download` | string | `"true"` para forçar download    |

**Resposta (200)**: Binary stream com `Content-Type`, `Content-Length`, `Cache-Control: max-age=31536000`  
**Erros**: `404` (arquivo não encontrado no R2), `500`

---

## 19. Máquina de Estados

### Atendimento

```
┌──────────┐    ┌───────────┐    ┌─────────────────────┐    ┌─────────────┐    ┌────────────┐
│ triagem  │───▶│ avaliacao │───▶│ aguardando_pagamento│───▶│ em_execucao │───▶│ finalizado │
└──────────┘    └───────────┘    └─────────────────────┘    └─────────────┘    └────────────┘
                                          ▲                        │
                                          │                        │
                                          └────────────────────────┘
                                            (regressão ao adicionar item)
```

| Transição                             | Condição                                                      |
|---------------------------------------|---------------------------------------------------------------|
| `triagem` → `avaliacao`               | Nenhuma                                                       |
| `avaliacao` → `aguardando_pagamento`  | ≥ 1 item cadastrado                                           |
| `aguardando_pagamento` → `em_execucao`| ≥ 1 item com status `pago`. Define `liberado_por_id` via JWT. |
| `em_execucao` → `finalizado`          | Via `/finalizar`: todos itens `concluido` e pagos             |
| `em_execucao` → `aguardando_pagamento`| Automática ao adicionar novo item em `em_execucao`            |

### Item

```
┌──────────┐    ┌──────┐    ┌───────────┐    ┌───────────┐
│ pendente │───▶│ pago │───▶│ executando│───▶│ concluido │
└──────────┘    └──────┘    └───────────┘    └───────────┘
```

| Transição                | Condição                                       |
|--------------------------|-------------------------------------------------|
| `pendente` → `pago`     | Automática quando `valor_pago ≥ valor`          |
| `pago` → `executando`   | Executor designado muda status manualmente      |
| `executando` → `concluido` | Executor designado finaliza. Define `concluido_at` |

---

## 20. Fluxo de Comissões

Comissões são calculadas automaticamente ao **finalizar** um atendimento (`POST /api/atendimentos/[id]/finalizar`).

Para cada **item do atendimento**:

### Comissão de Venda
- **Destinatário**: `criado_por_id` do item (quem adicionou o procedimento ao atendimento)
- **Percentual**: `comissao_venda` do procedimento
- **Cálculo**: `valor_item × (comissao_venda / 100)`

### Comissão de Execução
- **Destinatário**: `executor_id` do item
- **Percentual**: `comissao_execucao` do procedimento
- **Cálculo**: `valor_item × (comissao_execucao / 100)`

### Regras
1. Comissão de venda só é gerada se `criado_por_id` existe e `comissao_venda > 0`
2. Comissão de execução só é gerada se `executor_id` existe e `comissao_execucao > 0`
3. Ambos os tipos são registrados na tabela `comissoes` com `tipo = 'venda'` ou `tipo = 'execucao'`
4. Comissões ficam vinculadas ao `atendimento_id` e `item_atendimento_id`

---

## 21. Códigos de Erro Padrão

| Código | Significado                                     |
|--------|-------------------------------------------------|
| `400`  | Bad Request — campos faltando, validação falhou |
| `401`  | Unauthorized — credenciais inválidas            |
| `403`  | Forbidden — sem permissão para a ação           |
| `404`  | Not Found — recurso não encontrado              |
| `409`  | Conflict — duplicata (CPF, e-mail)              |
| `500`  | Internal Server Error — erro inesperado         |

### Formato de Erro Padrão

```json
{ "error": "Mensagem descritiva do erro" }
```

Alguns endpoints adicionam contexto extra:

```json
{
  "error": "Existem 2 itens não concluídos",
  "pendentes": 2
}
```

```json
{
  "error": "Existem itens não pagos integralmente",
  "valorFaltante": 250.00
}
```

---

## Tabelas do Banco

| Tabela                  | Descrição                           |
|-------------------------|-------------------------------------|
| `usuarios`              | Usuários do sistema                 |
| `clientes`              | Clientes da clínica                 |
| `procedimentos`         | Catálogo de procedimentos           |
| `atendimentos`          | Atendimentos (fluxo principal)      |
| `itens_atendimento`     | Itens/procedimentos do atendimento  |
| `pagamentos`            | Pagamentos recebidos                |
| `pagamento_itens`       | Distribuição pagamento → itens      |
| `parcelas`              | Parcelas de cobrança                |
| `comissoes`             | Comissões calculadas                |
| `notas_execucao`        | Notas do executor                   |
| `prontuarios`           | Prontuários clínicos                |
| `anexos_execucao`       | Arquivos anexados (R2)              |

---

*Gerado automaticamente — Sprint 12 (Correções Finais & Documentação)*
