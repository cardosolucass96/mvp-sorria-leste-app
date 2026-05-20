# Mapa do Sistema

## Visao geral

- Stack: Next.js App Router (`app/`), componentes React em `components/`, contexto de autenticacao em `contexts/AuthContext.tsx`, hooks auxiliares em `lib/hooks/`.
- A API mora em `app/api/**/route.ts`.
- O sistema e multiunidade. O front injeta `X-Unidade-Id` via `useUnitFetch()` e varias rotas usam `withUnit(...)`.
- O sistema tem dois conceitos de perfil:
  - `role`: role primaria do usuario (`admin`, `atendente`, `avaliador`, `executor`).
  - `roles`: roles efetivas, incluindo `ortodontista`.
- Admin tem `viewMode`:
  - `admin`: navega como admin.
  - `dentista`: `hasRole()` passa a simular `avaliador + executor + ortodontista`. Isso muda menu, tela inicial e navegacao mobile.

## Matriz de roles

| Role / modo | Menu principal | Comportamento marcante |
| --- | --- | --- |
| `admin` | `/`, `/dashboard`, `/clientes`, `/atendimentos`, `/agenda`, `/pagamentos`, `/procedimentos`, `/categorias`, `/usuarios`, `/unidades`, `/comissoes` | Ve a home administrativa, o dashboard analitico, CRUDs administrativos e consegue trocar para modo dentista. |
| `admin` em `viewMode = dentista` | `/`, `/agenda`, filas dinamicas `/fila/[slug]`, `/meus-procedimentos`, `/minhas-comissoes` | Perde o menu admin no `Sidebar`, mas ainda continua sendo admin real para guards que checam `isAdmin`. |
| `atendente` | `/`, `/clientes`, `/atendimentos`, `/agenda`, `/pagamentos` | Foco em cadastro, atendimento, agenda e cobranca. |
| `avaliador` | `/`, `/agenda`, `/avaliacao`, `/meus-procedimentos`, `/minhas-comissoes` | Vê fila de avaliacao, assume atendimentos e acompanha comissoes de venda. |
| `executor` | `/`, `/agenda`, `/meus-procedimentos`, filas dinamicas `/fila/[slug]` | Vê fila de execucao, assume procedimentos e executa itens. |
| `ortodontista` | `/agenda`, `/meus-procedimentos`, filas dinamicas compativeis com `categoria_roles` | Acesso vem das roles dinamicas por categoria, nao do campo `role` primario. |

## Navegacao e layout

- `components/layout/AppLayout.tsx`
  - Protege todas as rotas exceto `/login`.
  - Monta `Sidebar`, `Header`, `BottomNav`.
- `components/layout/Sidebar.tsx`
  - Usa `MENU_ITEMS` + categorias dinamicas vindas de `/api/categorias?ativo=1`.
  - Injeta `/fila/[slug]` logo apos `/agenda`.
- `components/layout/Header.tsx`
  - Troca tema.
  - Abre modal de troca de senha.
  - Exibe `UnitSelector`.
  - Faz toggle `admin <-> dentista`.
- `components/layout/BottomNav.tsx`
  - Navegacao mobile muda por `effectiveRole`.

## Páginas e chamadas do front

### Publico e shell

- `/login`
  - Uso: login.
  - API: `POST /api/auth/login`.
  - Auth: publica.

- `/`
  - Uso: home contextual.
  - API: `GET /api/dashboard?usuario_id=&role=`.
  - Auth: autenticado.
  - Variacao por role:
    - `admin`: painel administrativo com links rapidos.
    - `atendente`: area de recepcao.
    - `avaliador`: fila de avaliacao + comissoes.
    - `executor`: fila de execucao e, para admin em modo dentista, tambem fila de avaliacao.

- `/dashboard`
  - Uso: analytics administrativo.
  - API: `GET /api/dashboard/admin`.
  - Auth/role no front: redireciona se `!isAdmin`.
  - Filtros: presets de periodo + intervalo customizado.

### Clientes

- `/clientes`
  - Uso: busca/listagem paginada de clientes.
  - API:
    - `GET /api/clientes?busca=&page=&limit=&ordem=`
    - `DELETE /api/clientes/:id`
  - Roles visiveis no menu: `admin`, `atendente`.

- `/clientes/novo`
  - Uso: cadastro de cliente.
  - Componentes: `ClienteForm`.
  - API: `POST /api/clientes`.
  - Roles visiveis por fluxo: `admin`, `atendente`.

- `/clientes/[id]`
  - Uso: ficha completa do cliente.
  - Componentes: `ClienteForm`, `StatusBadge`.
  - APIs:
    - `GET /api/clientes/:id`
    - `PUT /api/clientes/:id`
    - `DELETE /api/clientes/:id`
    - `GET /api/clientes/:id/ficha`
    - `GET /api/clientes/:id/vinculos`
    - `POST /api/clientes/:id/vinculos`
    - `DELETE /api/clientes/:id/vinculos/:vinculo_id`
    - `GET /api/clientes/:id/saldo`
    - `POST /api/clientes/:id/saldo/estornar-procedimento`
    - `POST /api/clientes/:id/saldo/transferir`
    - `GET /api/clientes?busca=...` para busca de vinculados/transferencia
  - Abas:
    - `dados`
    - `atendimentos`
    - `procedimentos`
    - `pagamentos`
    - `prontuario`
    - `historico`
    - `vinculados`

### Atendimentos e pagamentos

- `/atendimentos`
  - Uso: pipeline de atendimentos.
  - Componentes: `StatusBadge`, `ViewModeToggle`.
  - API: `GET /api/atendimentos?busca=&status=`.
  - Modos:
    - `kanban`
    - `lista`
  - Roles visiveis no menu: `admin`, `atendente`.

- `/atendimentos/novo`
  - Uso: criar atendimento novo ou converter agendamento em atendimento.
  - Componentes: `ClienteForm`.
  - APIs:
    - `GET /api/clientes?...`
    - `GET /api/usuarios`
    - `GET /api/usuarios?categoria_id=`
    - `GET /api/categorias?ativo=1`
    - `GET /api/procedimentos`
    - `GET /api/agendamentos?cliente_id=&status=pendente,agendado`
    - `POST /api/agendamentos/:id/chegou`
    - `POST /api/clientes`
    - `POST /api/atendimentos`

- `/atendimentos/[id]`
  - Uso: hub central do atendimento.
  - Componentes: `StatusBadge`, `StatusPipeline`.
  - APIs:
    - `GET /api/atendimentos/:id`
    - `PUT /api/atendimentos/:id`
    - `DELETE /api/atendimentos/:id`
    - `GET /api/atendimentos/:id/itens`
    - `POST /api/atendimentos/:id/itens`
    - `DELETE /api/atendimentos/:id/itens?item_id=...`
    - `DELETE /api/atendimentos/:id/itens?group_id=...`
    - `PUT /api/atendimentos/:id/itens/:itemId`
    - `GET /api/atendimentos/:id/pagamentos`
    - `POST /api/atendimentos/:id/pagamentos`
    - `POST /api/atendimentos/:id/gerar-agendamento`
    - `GET /api/clientes/:cliente_id`
    - `GET /api/procedimentos`
    - `GET /api/usuarios` ou `GET /api/usuarios?categoria_id=...`
  - Diferenca por role:
    - `admin` / `atendente`: podem trocar executor em certos status, abrir fluxo de pagamento e encerrar.

- `/atendimentos/[id]/pagamento`
  - Uso: cobranca, desconto, saldo, cancelamento de pagamento e selecao do que vai para hoje.
  - Componentes: `StatusBadge`.
  - APIs:
    - `GET /api/usuarios`
    - `GET /api/atendimentos/:id`
    - `GET /api/clientes/:cliente_id/saldo`
    - `GET /api/atendimentos/:id/pagamentos`
    - `POST /api/atendimentos/:id/pagamentos`
    - `PUT /api/atendimentos/:id/pagamentos/:pagamentoId`
    - `PUT /api/atendimentos/:id/itens/:itemId`
    - `POST /api/atendimentos/:id/selecionar-hoje`

- `/atendimentos/[id]/encerrar`
  - Uso: revisao final e encerramento.
  - Componentes: `StatusBadge`.
  - APIs:
    - `GET /api/atendimentos/:id`
    - `GET /api/atendimentos/:id/pagamentos`
    - `PUT /api/atendimentos/:id`
  - Diferenca por role:
    - CTA de encerramento aparece para `admin` e `atendente`.

- `/pagamentos`
  - Uso: resumo de atendimentos com pagamentos pendentes.
  - APIs:
    - `GET /api/atendimentos`
    - `GET /api/atendimentos/:id`
  - Roles visiveis no menu: `admin`, `atendente`.

### Agenda e agendamentos

- `/agenda`
  - Uso: agenda operacional.
  - Componentes: `StatusBadge`, `ProntuarioDrawer`, `AgendaCalendario`.
  - APIs:
    - `GET /api/agendamentos?status=&busca=&data_inicio=&data_fim=&page=...`
    - `POST /api/agendamentos`
    - `PUT /api/agendamentos/:id`
    - `POST /api/agendamentos/:id/chegou`
    - `GET /api/usuarios`
    - `GET /api/procedimentos`
    - `GET /api/clientes?busca=...`
  - Modos:
    - `lista`
    - `calendario`
  - Diferenca por role:
    - `admin` / `atendente`: agenda completa, reagendamento, cancelamento, troca de executor, botao "Chegou".
    - `avaliador` / `executor`: agenda pessoal; o clique leva para `/avaliacao/:id` ou `/execucao/:id` conforme status.

### Avaliacao

- `/avaliacao`
  - Uso: fila de atendimentos em avaliacao.
  - Componentes: `ProntuarioDrawer`.
  - APIs:
    - `GET /api/atendimentos`
    - `PUT /api/atendimentos/:id` para assumir atendimento
  - Diferenca por role:
    - `avaliador`: fluxo principal.
    - `admin` em modo dentista consegue usar via `hasRole`.

- `/avaliacao/[id]`
  - Uso: detalhamento da avaliacao.
  - APIs:
    - `GET /api/atendimentos/:id`
    - `PUT /api/atendimentos/:id`
    - `GET /api/procedimentos`
    - `GET /api/procedimentos/:id`
    - `GET /api/usuarios` ou `GET /api/usuarios?categoria_id=...`
    - `GET /api/atendimentos/:id/itens`
    - `POST /api/atendimentos/:id/itens`
    - `PUT /api/atendimentos/:id/itens/:itemId`
    - `DELETE /api/atendimentos/:id/itens?item_id=...&usuario_id=...`
  - Papel: monta o plano de tratamento e libera o atendimento para pagamento/execucao.

### Execucao e filas dinamicas

- `/execucao`
  - Uso: redirect sem UI.
  - Comportamento: redireciona para `geral` ou a primeira categoria visivel em `/fila/[slug]`.

- `/fila/[slug]`
  - Uso: fila dinamica por categoria.
  - Componentes: `StatusBadge`, `ProntuarioDrawer`.
  - API:
    - `GET /api/fila/:slug?executor_id=...`
    - `PUT /api/atendimentos/:atendimento_id/itens/:itemId` para assumir item
  - Modos:
    - `procedimento`
    - `paciente`
  - Diferenca por role:
    - visibilidade depende de `categoria_roles` cruzado com `user.roles`.

- `/execucao/[id]`
  - Uso: detalhe de um item/procedimento.
  - Componentes: `StatusBadge`, `ProntuarioDrawer`.
  - APIs:
    - `GET /api/execucao/item/:id`
    - `GET /api/execucao/item/:id/anexos`
    - `POST /api/execucao/item/:id/anexos`
    - `DELETE /api/execucao/item/:id/anexos?anexo_id=...`
    - `GET /api/execucao/item/:id/prontuario`
    - `POST /api/execucao/item/:id/prontuario`
    - `PUT /api/atendimentos/:atendimento_id/itens/:itemId`
    - `POST /api/atendimentos/:atendimento_id/itens`
    - `GET /api/procedimentos`
  - Observacao importante:
    - o front tambem chama `/api/execucao/etapa/:id` e `/api/execucao/etapa/:id/prontuario`, mas essas rotas nao existem em `app/api`.

- `/fila/[slug]/[id]`
  - Uso: alias da tela `/execucao/[id]`.
  - Implementacao: `export { default } from '@/app/execucao/[id]/page';`

### Historico pessoal e comissoes

- `/meus-procedimentos`
  - Uso: historico de avaliacoes e execucoes.
  - Componentes: `StatusBadge`, `ProntuarioDrawer`.
  - API: `GET /api/meus-procedimentos?usuario_id=...`
  - Abas dinamicas:
    - `todos`
    - `avaliacao` se `hasRole(['avaliador', 'admin'])`
    - `execucao` se `hasRole(['executor', 'admin'])`

- `/minhas-comissoes`
  - Uso: comissoes do usuario logado.
  - API: `GET /api/comissoes?usuario_id=...&data_inicio=&data_fim=`
  - Filtros: intervalo de datas.
  - Menu: `avaliador`; admin em modo dentista tambem pode enxergar por `hasRole`.

- `/comissoes`
  - Uso: visao administrativa de comissoes.
  - API: `GET /api/comissoes?resumo=true` e `GET /api/comissoes?...`
  - Abas:
    - `resumo`
    - `detalhes`
  - Filtros: usuario, data inicio, data fim.
  - Diferenca por role:
    - no front, redireciona se `!isAdmin`.

### Cadastros administrativos

- `/procedimentos`
  - Uso: CRUD de procedimentos e etapas.
  - APIs:
    - `GET /api/procedimentos`
    - `GET /api/procedimentos/:id`
    - `POST /api/procedimentos`
    - `PUT /api/procedimentos/:id`
    - `DELETE /api/procedimentos/:id`
    - `GET /api/categorias?ativo=1`

- `/categorias`
  - Uso: CRUD de categorias/filas dinamicas.
  - APIs:
    - `GET /api/categorias`
    - `POST /api/categorias`
    - `PUT /api/categorias/:id`
    - `DELETE /api/categorias/:id`

- `/usuarios`
  - Uso: CRUD de usuarios, roles e unidades.
  - APIs:
    - `GET /api/usuarios`
    - `POST /api/usuarios`
    - `PUT /api/usuarios/:id`
    - `DELETE /api/usuarios/:id`
    - `GET /api/unidades`

- `/unidades`
  - Uso: CRUD das unidades.
  - APIs:
    - `GET /api/unidades`
    - `POST /api/unidades`
    - `PUT /api/unidades/:id`

## Chamadas transversais fora das páginas

- `contexts/AuthContext.tsx`
  - `POST /api/auth/login`
  - `GET /api/unidades`
- `components/domain/TrocarSenhaModal.tsx`
  - `PUT /api/auth/senha`
- `components/domain/ProntuarioDrawer.tsx`
  - `GET /api/clientes/:id`
  - `GET /api/clientes/:id/ficha`
  - `GET /api/clientes/:id/vinculos`
  - `GET /api/clientes/:id/saldo`
- `lib/hooks/useUnitFetch.ts`
  - injeta `X-Unidade-Id` em toda chamada que usa `unitFetch`.
- `lib/utils/apiFetch.ts`
  - wrapper simples que trata `401` globalmente.

## Inventario da API

### Auth

- `POST /api/auth/login`
  - Auth: publica.
  - Uso: login, monta JWT, cookie, unidades e roles.
  - Consumidor: `contexts/AuthContext.tsx`.

- `PUT /api/auth/senha`
  - Auth: sem middleware aparente.
  - Uso: troca de senha.
  - Consumidor: `components/domain/TrocarSenhaModal.tsx`.

### Unidades

- `GET /api/unidades`
  - Auth: `withAuth`.
  - Consumidores: `AuthContext`, `Usuarios`, `Unidades`.

- `POST /api/unidades`
  - Auth: `withRole(['admin'])`.
  - Consumidor: `app/unidades/page.tsx`.

- `PUT /api/unidades/[id]`
  - Auth: `withRole(['admin'])`.
  - Consumidor: `app/unidades/page.tsx`.

### Usuarios

- `GET /api/usuarios`
  - Auth: sem middleware aparente.
  - Filtros: `unidade_id`, `categoria_id`, `role`.
  - Consumidores: `Agenda`, `Usuarios`, `Atendimento detalhe`, `Pagamento`, `Novo Atendimento`, `Avaliacao detalhe`.

- `POST /api/usuarios`
  - Auth: sem middleware aparente.
  - Uso: cria usuario com `usuario_roles` e `usuario_unidades`.
  - Consumidor: `app/usuarios/page.tsx`.

- `GET /api/usuarios/[id]`
  - Auth: sem middleware aparente.
  - Consumidor: `app/usuarios/page.tsx`.

- `PUT /api/usuarios/[id]`
  - Auth: sem middleware aparente.
  - Consumidor: `app/usuarios/page.tsx`.

- `DELETE /api/usuarios/[id]`
  - Auth: sem middleware aparente.
  - Semantica: soft delete (`ativo = 0`).
  - Consumidor: `app/usuarios/page.tsx`.

### Categorias

- `GET /api/categorias`
  - Auth: `withAuth`.
  - Consumidores: `Sidebar`, `useCategoriasFila`, `Novo Atendimento`, `Procedimentos`, `Categorias`.

- `POST /api/categorias`
  - Auth: `withRole(['admin'])`.
  - Consumidor: `app/categorias/page.tsx`.

- `GET /api/categorias/[id]`
  - Auth: `withAuth`.
  - Consumidor: `app/categorias/page.tsx`.

- `PUT /api/categorias/[id]`
  - Auth: `withRole(['admin'])`.
  - Consumidor: `app/categorias/page.tsx`.

- `DELETE /api/categorias/[id]`
  - Auth: `withRole(['admin'])`.
  - Consumidor: `app/categorias/page.tsx`.

### Procedimentos

- `GET /api/procedimentos`
  - Auth: sem middleware aparente.
  - Consumidores: `Procedimentos`, `Novo Atendimento`, `Avaliacao detalhe`, `Atendimento detalhe`, `Execucao`, `Agenda`.

- `POST /api/procedimentos`
  - Auth: sem middleware aparente.
  - Consumidor: `app/procedimentos/page.tsx`.

- `GET /api/procedimentos/[id]`
  - Auth: sem middleware aparente.
  - Consumidores: `Procedimentos`, `Avaliacao detalhe`.

- `PUT /api/procedimentos/[id]`
  - Auth: sem middleware aparente.
  - Consumidor: `app/procedimentos/page.tsx`.

- `DELETE /api/procedimentos/[id]`
  - Auth: sem middleware aparente.
  - Consumidor: `app/procedimentos/page.tsx`.

### Clientes

- `GET /api/clientes`
  - Auth: sem middleware aparente.
  - Consumidores: `Clientes`, `Cliente detalhe`, `Novo Atendimento`, `Agenda`, `ProntuarioDrawer`.

- `POST /api/clientes`
  - Auth: sem middleware aparente.
  - Consumidores: `Clientes novo`, `Novo Atendimento`.

- `GET /api/clientes/[id]`
  - Auth: sem middleware aparente.
  - Consumidores: `Cliente detalhe`, `Atendimento detalhe`, `ProntuarioDrawer`.

- `PUT /api/clientes/[id]`
  - Auth: sem middleware aparente.
  - Consumidor: `Cliente detalhe`.

- `DELETE /api/clientes/[id]`
  - Auth: sem middleware aparente.
  - Consumidores: `Clientes`, `Cliente detalhe`.

- `GET /api/clientes/[id]/ficha`
  - Auth: `withAuth`.
  - Consumidores: `Cliente detalhe`, `ProntuarioDrawer`.

- `GET /api/clientes/[id]/vinculos`
  - Auth: sem middleware aparente.
  - Consumidores: `Cliente detalhe`, `ProntuarioDrawer`.

- `POST /api/clientes/[id]/vinculos`
  - Auth: sem middleware aparente.
  - Consumidor: `Cliente detalhe`.

- `DELETE /api/clientes/[id]/vinculos/[vinculo_id]`
  - Auth: sem middleware aparente.
  - Consumidor: `Cliente detalhe`.

- `GET /api/clientes/[id]/saldo`
  - Auth: sem middleware aparente.
  - Consumidores: `Cliente detalhe`, `Pagamento`, `ProntuarioDrawer`.

- `GET /api/clientes/[id]/saldo/movimentacoes`
  - Auth: sem middleware aparente.
  - Observacao: nao apareceu nas chamadas do front atual.

- `POST /api/clientes/[id]/saldo/creditar`
  - Auth: sem middleware aparente.
  - Observacao: endpoint catalogado, sem consumidor encontrado no front atual.

- `POST /api/clientes/[id]/saldo/debitar`
  - Auth: sem middleware aparente.
  - Uso: usar saldo para pagar item.

- `POST /api/clientes/[id]/saldo/estornar`
  - Auth: sem middleware aparente.
  - Observacao: endpoint catalogado, sem consumidor encontrado no front atual.

- `POST /api/clientes/[id]/saldo/estornar-procedimento`
  - Auth: sem middleware aparente.
  - Consumidor: `Cliente detalhe`.

- `POST /api/clientes/[id]/saldo/transferir`
  - Auth: sem middleware aparente.
  - Consumidor: `Cliente detalhe`.

- `GET /api/clientes/[id]/anexos`
  - Auth: sem middleware aparente.
  - Observacao: endpoint catalogado, sem consumidor encontrado no front atual.

- `POST /api/clientes/[id]/anexos`
  - Auth: sem middleware aparente.
  - Observacao: endpoint catalogado, sem consumidor encontrado no front atual.

- `DELETE /api/clientes/[id]/anexos`
  - Auth: sem middleware aparente.
  - Observacao: endpoint catalogado, sem consumidor encontrado no front atual.

### Dashboard e comissoes

- `GET /api/dashboard`
  - Auth: `withUnit`.
  - Consumidor: home `/`.
  - Parametros: `usuario_id`, `role`.

- `GET /api/dashboard/admin`
  - Auth: `withUnit`.
  - Consumidor: `app/dashboard/page.tsx`.

- `GET /api/comissoes`
  - Auth: `withUnit`.
  - Consumidores: `Comissoes`, `Minhas Comissoes`.
  - Modos:
    - resumo via `?resumo=true`
    - detalhes via payload completo

- `GET /api/meus-procedimentos`
  - Auth: `withUnit`.
  - Consumidor: `app/meus-procedimentos/page.tsx`.

### Atendimentos

- `GET /api/atendimentos`
  - Auth: `withUnit`.
  - Consumidores: `Atendimentos`, `Avaliacao`, `Pagamentos`, `Novo Atendimento`.

- `POST /api/atendimentos`
  - Auth: `withUnit`.
  - Consumidor: `Novo Atendimento`.

- `GET /api/atendimentos/[id]`
  - Auth: `withUnit`.
  - Consumidores: `Atendimento detalhe`, `Pagamento`, `Encerrar`, `Avaliacao detalhe`, `Pagamentos`.

- `PUT /api/atendimentos/[id]`
  - Auth: `withUnit`.
  - Consumidores: `Avaliacao`, `Avaliacao detalhe`, `Atendimento detalhe`, `Pagamento`, `Encerrar`.

- `DELETE /api/atendimentos/[id]`
  - Auth: `withUnit`.
  - Consumidor: `Atendimento detalhe`.

- `GET /api/atendimentos/[id]/itens`
  - Auth: `withUnit`.
  - Consumidores: `Atendimento detalhe`, `Avaliacao detalhe`.

- `POST /api/atendimentos/[id]/itens`
  - Auth: `withUnit`.
  - Consumidores: `Atendimento detalhe`, `Avaliacao detalhe`, `Execucao`.

- `DELETE /api/atendimentos/[id]/itens`
  - Auth: `withUnit`.
  - Consumidores: `Atendimento detalhe`, `Avaliacao detalhe`.

- `PUT /api/atendimentos/[id]/itens/[itemId]`
  - Auth: `withUnit`.
  - Consumidores: `Atendimento detalhe`, `Pagamento`, `Execucao`, `Fila`.

- `GET /api/atendimentos/[id]/pagamentos`
  - Auth: `withUnit`.
  - Consumidores: `Atendimento detalhe`, `Pagamento`, `Encerrar`.

- `POST /api/atendimentos/[id]/pagamentos`
  - Auth: `withUnit`.
  - Consumidores: `Atendimento detalhe`, `Pagamento`.

- `PUT /api/atendimentos/[id]/pagamentos/[pagamentoId]`
  - Auth: `withUnit`.
  - Consumidor: `Pagamento`.

- `POST /api/atendimentos/[id]/finalizar`
  - Auth: `withUnit`.
  - Fluxo: finalizacao do atendimento.

- `POST /api/atendimentos/[id]/gerar-agendamento`
  - Auth: `withUnit`.
  - Consumidor: `Atendimento detalhe`.

- `POST /api/atendimentos/[id]/selecionar-hoje`
  - Auth: `withUnit`.
  - Consumidor: `Pagamento`.

### Agendamentos

- `GET /api/agendamentos`
  - Auth: `withUnit`.
  - Consumidores: `Agenda`, `Novo Atendimento`.
  - Diferenca por role no endpoint:
    - `avaliador` e `executor` so conseguem criar agendamento para si no `POST`.

- `POST /api/agendamentos`
  - Auth: `withUnit`.
  - Consumidor: `Agenda`.

- `GET /api/agendamentos/[id]`
  - Auth: `withUnit`.
  - Observacao: endpoint catalogado; nao apareceu como chamada direta no front atual.

- `PUT /api/agendamentos/[id]`
  - Auth: `withUnit`.
  - Consumidor: `Agenda`.

- `POST /api/agendamentos/[id]/chegou`
  - Auth: `withUnitRole(['admin', 'atendente'])`.
  - Consumidores: `Agenda`, `Novo Atendimento`.

### Execucao, filas e arquivos

- `GET /api/execucao`
  - Auth: `withUnit`.
  - Lista itens "meus" e "disponiveis".
  - Consumidor indireto do fluxo de execucao; a rota `/execucao` no front hoje redireciona para `/fila/[slug]`.

- `GET /api/execucao/item/[id]`
  - Auth: `withUnit`.
  - Consumidor: `Execucao detalhe`.

- `GET /api/execucao/item/[id]/anexos`
  - Auth: sem middleware aparente.
  - Consumidor: `Execucao detalhe`.

- `POST /api/execucao/item/[id]/anexos`
  - Auth: sem middleware aparente.
  - Consumidor: `Execucao detalhe`.

- `DELETE /api/execucao/item/[id]/anexos`
  - Auth: sem middleware aparente.
  - Consumidor: `Execucao detalhe`.

- `GET /api/execucao/item/[id]/prontuario`
  - Auth: sem middleware aparente.
  - Consumidor: `Execucao detalhe`.

- `POST /api/execucao/item/[id]/prontuario`
  - Auth: sem middleware aparente.
  - Consumidor: `Execucao detalhe`.

- `GET /api/execucao/item/[id]/notas`
  - Auth: sem middleware aparente.
  - Observacao: endpoint catalogado, sem chamada no front atual.

- `POST /api/execucao/item/[id]/notas`
  - Auth: sem middleware aparente.
  - Observacao: endpoint catalogado, sem chamada no front atual.

- `GET /api/fila/[slug]`
  - Auth: `withUnit`.
  - Regra extra: checa `categoria_roles` x `getUserRoles(context.user)`.
  - Consumidor: `app/fila/[slug]/page.tsx`.

- `GET /api/arquivos/[...path]`
  - Auth: sem middleware aparente.
  - Consumidor: links de anexos na tela de execucao.

## Componentes

### Layout

- `components/layout/AppLayout.tsx`
- `components/layout/Header.tsx`
- `components/layout/Sidebar.tsx`
- `components/layout/BottomNav.tsx`
- `components/layout/UnitSelector.tsx`

### Domain ativos no fluxo atual

- `AgendaCalendario.tsx` - calendario da agenda.
- `ClienteForm.tsx` - formulario compartilhado de cliente.
- `ProntuarioDrawer.tsx` - drawer lateral com ficha completa do cliente.
- `StatusBadge.tsx` - badges de status de atendimento/item.
- `StatusPipeline.tsx` - pipeline visual do atendimento.
- `TrocarSenhaModal.tsx` - troca de senha do usuario.
- `ViewModeToggle.tsx` - kanban/lista em atendimentos.

### Subcomponentes do prontuario

- `components/domain/prontuario/AbaDados.tsx`
- `components/domain/prontuario/AbaAtendimentos.tsx`
- `components/domain/prontuario/AbaProcedimentos.tsx`
- `components/domain/prontuario/AbaPagamentos.tsx`
- `components/domain/prontuario/AbaProntuario.tsx`
- `components/domain/prontuario/AbaHistorico.tsx`
- `components/domain/prontuario/AbaVinculos.tsx`

### Domain com pouco ou nenhum uso visivel nas páginas atuais

- `AnexosGallery.tsx`
- `AtendimentoCard.tsx`
- `ClienteCard.tsx`
- `ComissoesResumo.tsx`
- `ItemAtendimentoRow.tsx`
- `PagamentoForm.tsx`
- `ProcedimentoForm.tsx`
- `ProntuarioEditor.tsx`
- `SelecaoProcedimentosHoje.tsx`
- `SeletorDentes.tsx`

### UI base (`components/ui`)

- `Alert.tsx`
- `Avatar.tsx`
- `Badge.tsx`
- `Breadcrumb.tsx`
- `Button.tsx`
- `Card.tsx`
- `Checkbox.tsx`
- `ConfirmDialog.tsx`
- `Divider.tsx`
- `EmptyState.tsx`
- `ErrorBoundary.tsx`
- `FilterBar.tsx`
- `FormField.tsx`
- `Input.tsx`
- `LoadingState.tsx`
- `Modal.tsx`
- `PageHeader.tsx`
- `Pagination.tsx`
- `SearchInput.tsx`
- `Select.tsx`
- `Spinner.tsx`
- `StatCard.tsx`
- `Table.tsx`
- `Tabs.tsx`
- `Textarea.tsx`
- `Toast.tsx`
- `Tooltip.tsx`

### UI shadcn/base (`components/ui/_shadcn`)

- `alert-dialog.tsx`
- `calendar.tsx`
- `command.tsx`
- `dialog.tsx`
- `dropdown-menu.tsx`
- `input-group.tsx`
- `input.tsx`
- `label.tsx`
- `popover.tsx`
- `progress.tsx`
- `radio-group.tsx`
- `scroll-area.tsx`
- `separator.tsx`
- `sheet.tsx`
- `sidebar.tsx`
- `skeleton.tsx`
- `sonner.tsx`
- `switch.tsx`
- `textarea.tsx`
- `tooltip.tsx`

## Abas, modos e areas internas

- `AuthContext`
  - `viewMode`: `admin` / `dentista`
- `Agenda`
  - `viewMode`: `lista` / `calendario`
- `Atendimentos`
  - `viewMode`: `kanban` / `lista`
- `Comissoes`
  - abas: `resumo` / `detalhes`
- `Meus Procedimentos`
  - abas dinamicas: `todos`, `avaliacao`, `execucao`
- `Cliente detalhe`
  - abas: `dados`, `atendimentos`, `procedimentos`, `pagamentos`, `prontuario`, `historico`, `vinculados`
- `ProntuarioDrawer`
  - abas: `dados`, `atendimentos`, `procedimentos`, `prontuario`, `historico`, `pagamentos`, `vinculados`
- `Fila por categoria`
  - visualizacao: `procedimento` / `paciente`

## Achados importantes

- Inconsistencia real entre front e back:
  - `app/execucao/[id]/page.tsx` chama:
    - `/api/execucao/etapa/:id`
    - `/api/execucao/etapa/:id/prontuario`
  - Essas rotas nao existem em `app/api`.

- Cobertura de middleware da API e irregular:
  - varias rotas usam `withUnit`, `withRole` ou `withAuth`;
  - varias rotas de `clientes`, `procedimentos`, `usuarios`, `auth/senha`, `execucao/item/*` e `arquivos` aparecem sem middleware aparente.

- Alguns guards estao so no front:
  - `/dashboard` redireciona se `!isAdmin`, mas `GET /api/dashboard/admin` esta em `withUnit`, nao em `withRole(['admin'])`.
  - `/comissoes` tambem depende de guarda no front; o endpoint `GET /api/comissoes` esta apenas em `withUnit`.

- O menu dinamico por categoria e um ponto central do sistema:
  - `Sidebar` busca `/api/categorias?ativo=1`;
  - `fila/[slug]` ainda faz uma checagem adicional no back contra `categoria_roles`.

- A tela de cliente e o `ProntuarioDrawer` repetem a mesma ideia de navegação por abas.
  - Isso e bom para consistencia;
  - tambem indica oportunidade de extrair um shell compartilhado se a equipe quiser reduzir duplicacao.
