# Matriz de Auditoria Front x API por Sprints

> Base de referencia: [docs/mapa-sistema.md](./mapa-sistema.md)

## Objetivo

Usar este documento como backlog operacional da conferencia geral entre:

- telas, componentes e fluxos do front
- endpoints reais da API
- contratos de request/response
- regras de role
- regras de unidade
- cobertura minima de seguranca e testes

## Como usar

Cada item abaixo deve ser auditado com o mesmo checklist:

1. confirmar se a chamada do front existe e aponta para a rota certa
2. confirmar se o endpoint existe de fato
3. validar metodo, query params, body e shape da resposta
4. validar role no front e no back
5. validar comportamento com `X-Unidade-Id`
6. marcar se ha endpoint sem uso, tela chamando rota inexistente ou rota sem middleware suficiente
7. registrar correcao, teste e atualizacao da documentacao

## Legenda

### Prioridade

- `P0`: risco alto de quebra, seguranca ou fluxo core
- `P1`: fluxo importante ou cadastro central
- `P2`: importante, mas nao bloqueante
- `P3`: melhoria, limpeza ou legado

### Status inicial

- `ok-validar`: parece alinhado, mas ainda precisa conferencia de contrato
- `atencao`: parece funcional, porem com risco de divergencia ou alta complexidade
- `desalinhado`: ja ha evidencia de inconsistencias front x back
- `sem-guarda`: endpoint sensivel sem middleware/guard aparente
- `orfao`: endpoint sem consumidor claro no front atual
- `legado`: existe, mas o fluxo principal atual parece passar por outro caminho

## Definition of done por item

Um item so fecha quando:

- front e back usam o mesmo contrato
- o endpoint correto responde o shape esperado
- role esta correta dos dois lados
- unidade foi validada
- foi feito teste manual ou automatizado
- o status final do item foi atualizado para `ok`

## Visao geral das sprints

| Sprint | Foco | Meta de saida |
| --- | --- | --- |
| `Sprint 0` | baseline e triagem | matriz refinada, owners, checklist e prioridade final |
| `Sprint 1` | auth, shell, seguranca e inconsistencias criticas | base segura para revisar os modulos sem ruido estrutural |
| `Sprint 2` | cadastros administrativos | usuarios, unidades, categorias e procedimentos auditados |
| `Sprint 3` | clientes e prontuario | ficha, vinculos, saldo, anexos e drawer alinhados |
| `Sprint 4` | atendimento comercial | atendimento, avaliacao, pagamento e encerramento auditados |
| `Sprint 5` | agenda e agendamentos | agenda e regras operacionais por role auditadas |
| `Sprint 6` | execucao, filas e comissoes | filas dinamicas, execucao, historico e comissoes auditados |

---

## Sprint 0 - Baseline e triagem

| ID | Tipo | Item | Escopo | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `S0-01` | processo | congelar inventario | `docs/mapa-sistema.md` + esta matriz | `P0` | `ok-validar` | backlog mudar no meio da auditoria | baseline versao 1 fechado |
| `S0-02` | processo | definir owners | front, api, qa, produto por modulo | `P1` | `ok-validar` | auditoria sem responsavel claro | owner por sprint definido |
| `S0-03` | processo | checklist padrao | contrato, role, unidade, teste, docs | `P0` | `ok-validar` | itens fechados de forma desigual | checklist unico adotado |
| `S0-04` | processo | classificar riscos | `P0/P1/P2/P3` por item | `P1` | `ok-validar` | sprint order errada | backlog priorizado |

---

## Sprint 1 - Auth, shell, seguranca e inconsistencias criticas

### Itens de tela e shared layer

| ID | Tipo | Item | Escopo | Roles | Unidade | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S1-01` | shared | auth shell | `contexts/AuthContext.tsx`, `useUnitFetch`, `apiFetch`, `AppLayout`, `Header`, `Sidebar`, `BottomNav`, `UnitSelector` | todas | sim | `P0` | `atencao` | role real vs `effectiveRole`, troca de unidade e logout global | base de autenticacao e unidade validada |
| `S1-02` | tela | `/login` | login e persistencia de sessao | publica | nao | `P0` | `ok-validar` | contrato do login, cookie, token e roles efetivas | fluxo de login auditado |
| `S1-03` | tela | `/` | home por role e `viewMode` | todas | sim | `P0` | `atencao` | divergencia entre role real, role efetiva e cards exibidos | home auditada por role |
| `S1-04` | tela | `/dashboard` | guarda admin no front + filtros | admin | sim | `P0` | `atencao` | tela protegida no front, mas endpoint pode nao estar protegido no back | fluxo admin fechado dos dois lados |
| `S1-05` | tela | `/comissoes` | redirect se `!isAdmin` + abas resumo/detalhes | admin | sim | `P0` | `atencao` | guarda dependente do front | tela e endpoint alinhados |

### Itens de API e seguranca

| ID | Tipo | Item | Escopo | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `S1-06` | api | auth | `POST /api/auth/login`, `PUT /api/auth/senha` | `P0` | `sem-guarda` | troca de senha sem middleware aparente | auth review concluida |
| `S1-07` | api | dashboard e comissoes admin | `GET /api/dashboard/admin`, `GET /api/comissoes` | `P0` | `sem-guarda` | acesso admin protegido so na UI | guard server-side decidido e aplicado |
| `S1-08` | api | rotas abertas fase 1 | `GET/POST /api/usuarios`, `GET/PUT/DELETE /api/usuarios/[id]`, `GET/POST /api/procedimentos`, `GET/PUT/DELETE /api/procedimentos/[id]` | `P0` | `sem-guarda` | cadastros sensiveis sem protecao aparente | politica de auth fechada |
| `S1-09` | api | rotas abertas fase 2 | `GET/POST /api/clientes`, `GET/PUT/DELETE /api/clientes/[id]`, `GET /api/arquivos/[...path]`, `GET/POST/DELETE /api/execucao/item/[id]/anexos`, `GET/POST /api/execucao/item/[id]/prontuario`, `GET/POST /api/execucao/item/[id]/notas` | `P0` | `sem-guarda` | superficie grande sem middleware aparente | risco de seguranca mapeado e corrigido |
| `S1-10` | api | inconsistencia critica de execucao | chamadas do front para `/api/execucao/etapa/:id` e `/api/execucao/etapa/:id/prontuario` | `P0` | `desalinhado` | tela chama endpoints inexistentes | rota implementada ou front refatorado |

---

## Sprint 2 - Cadastros administrativos

### Telas

| ID | Tipo | Item | Escopo | Roles | Unidade | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S2-01` | tela | `/usuarios` | CRUD de usuarios, roles e unidades | admin | parcial | `P1` | `atencao` | telas admin usam API aparentemente aberta | fluxo admin validado |
| `S2-02` | tela | `/unidades` | CRUD de unidades | admin | n/a | `P1` | `ok-validar` | precisa conferir contrato real e protecao | tela auditada |
| `S2-03` | tela | `/categorias` | CRUD de categorias e `categoria_roles` | admin | n/a | `P1` | `ok-validar` | impacto no menu dinamico e filas | tela auditada |
| `S2-04` | tela | `/procedimentos` | CRUD, busca, etapas e categoria | admin | n/a | `P1` | `atencao` | alta dependencia com avaliacao e execucao | tela auditada |

### API

| ID | Tipo | Item | Escopo | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `S2-05` | api | usuarios | `GET/POST /api/usuarios`, `GET/PUT/DELETE /api/usuarios/[id]` | `P1` | `sem-guarda` | CRUD sensivel, multi-role e multiunidade | contratos e guards fechados |
| `S2-06` | api | unidades | `GET/POST /api/unidades`, `PUT /api/unidades/[id]` | `P1` | `ok-validar` | confirmar simetria front/back | contratos fechados |
| `S2-07` | api | categorias | `GET/POST /api/categorias`, `GET/PUT/DELETE /api/categorias/[id]` | `P1` | `ok-validar` | categorias impactam sidebars e filas | contratos fechados |
| `S2-08` | api | procedimentos | `GET/POST /api/procedimentos`, `GET/PUT/DELETE /api/procedimentos/[id]` | `P1` | `sem-guarda` | CRUD base do atendimento sem protecao aparente | contratos e guards fechados |

---

## Sprint 3 - Clientes, ficha e prontuario

### Telas e componentes

| ID | Tipo | Item | Escopo | Roles | Unidade | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S3-01` | tela | `/clientes` | listagem, busca, paginacao e exclusao | admin, atendente | nao | `P1` | `atencao` | API sem middleware aparente | tela auditada |
| `S3-02` | tela | `/clientes/novo` | cadastro usando `ClienteForm` | admin, atendente | nao | `P1` | `ok-validar` | contrato com form compartilhado | tela auditada |
| `S3-03` | tela | `/clientes/[id]` | ficha completa, edicao, exclusao, vinculos, saldo, modais | admin, atendente | nao | `P1` | `atencao` | fluxo denso com varias abas e chamadas | tela auditada |
| `S3-04` | componente | `ProntuarioDrawer` | ficha resumida reutilizada em agenda, avaliacao, execucao, fila, meus procedimentos | varias | nao | `P1` | `atencao` | repeticao de contrato da ficha em varios fluxos | drawer auditado |

### API

| ID | Tipo | Item | Escopo | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `S3-05` | api | clientes core | `GET/POST /api/clientes`, `GET/PUT/DELETE /api/clientes/[id]` | `P1` | `sem-guarda` | endpoints core sem middleware aparente | contratos e guards fechados |
| `S3-06` | api | ficha e vinculos | `GET /api/clientes/[id]/ficha`, `GET/POST /api/clientes/[id]/vinculos`, `DELETE /api/clientes/[id]/vinculos/[vinculo_id]` | `P1` | `atencao` | contrato usado por tela e drawer | alinhamento validado |
| `S3-07` | api | saldo | `GET /api/clientes/[id]/saldo`, `GET /api/clientes/[id]/saldo/movimentacoes`, `POST /creditar`, `POST /debitar`, `POST /estornar`, `POST /estornar-procedimento`, `POST /transferir` | `P1` | `sem-guarda` | alto impacto financeiro e parte do fluxo parece sem uso | mapa de uso real fechado |
| `S3-08` | api | anexos do cliente | `GET/POST/DELETE /api/clientes/[id]/anexos` | `P2` | `orfao` | endpoint existe sem consumidor claro no front atual | decidir manter, integrar ou remover |

---

## Sprint 4 - Atendimento comercial

### Telas

| ID | Tipo | Item | Escopo | Roles | Unidade | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S4-01` | tela | `/atendimentos` | pipeline, busca, filtro e views `kanban/lista` | admin, atendente | sim | `P1` | `atencao` | fluxo core da clinica | tela auditada |
| `S4-02` | tela | `/atendimentos/novo` | novo atendimento, novo cliente, conversao de agendamento, categoria e usuarios | admin, atendente | sim | `P1` | `atencao` | tela cruza varios recursos ao mesmo tempo | tela auditada |
| `S4-03` | tela | `/atendimentos/[id]` | detalhe central do atendimento, itens, procedimentos, pagamentos, agendamento | admin, atendente | sim | `P0` | `atencao` | hub mais complexo do sistema | tela auditada |
| `S4-04` | tela | `/avaliacao` | lista de atendimentos disponiveis e meus atendimentos | avaliador, admin-dentista | sim | `P1` | `ok-validar` | role depende de `hasRole` e disponibilidade | tela auditada |
| `S4-05` | tela | `/avaliacao/[id]` | montagem do plano de tratamento, itens e valores | avaliador, admin-dentista | sim | `P0` | `atencao` | alto acoplamento com itens e liberacao para pagamento | tela auditada |
| `S4-06` | tela | `/atendimentos/[id]/pagamento` | pagamento, desconto, saldo, selecao do que vai para hoje, cancelamento | admin, atendente | sim | `P0` | `atencao` | alta criticidade financeira | tela auditada |
| `S4-07` | tela | `/atendimentos/[id]/encerrar` | revisao final e encerramento | admin, atendente | sim | `P1` | `ok-validar` | precisa casar com regras de status do back | tela auditada |

### API

| ID | Tipo | Item | Escopo | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `S4-08` | api | atendimentos core | `GET/POST /api/atendimentos`, `GET/PUT/DELETE /api/atendimentos/[id]` | `P0` | `atencao` | status, role e unidade no fluxo principal | contratos e regras fechados |
| `S4-09` | api | itens do atendimento | `GET/POST/DELETE /api/atendimentos/[id]/itens`, `PUT /api/atendimentos/[id]/itens/[itemId]` | `P0` | `atencao` | regras de executor, categoria e status | contratos e regras fechados |
| `S4-10` | api | pagamentos do atendimento | `GET/POST /api/atendimentos/[id]/pagamentos`, `PUT /api/atendimentos/[id]/pagamentos/[pagamentoId]` | `P0` | `atencao` | pagamentos, cancelamento e reflexos no saldo | contratos fechados |
| `S4-11` | api | operacoes do atendimento | `POST /api/atendimentos/[id]/finalizar`, `POST /api/atendimentos/[id]/gerar-agendamento`, `POST /api/atendimentos/[id]/selecionar-hoje` | `P1` | `atencao` | operacoes multi-etapa com alto acoplamento | contratos fechados |

---

## Sprint 5 - Agenda e agendamentos

### Telas

| ID | Tipo | Item | Escopo | Roles | Unidade | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S5-01` | tela | `/agenda` | filtros, views `lista/calendario`, novo agendamento, reagendar, cancelar, trocar executor, chegar | admin, atendente, avaliador, executor, ortodontista | sim | `P0` | `atencao` | comportamento muda muito por role | tela auditada por role |

### API

| ID | Tipo | Item | Escopo | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `S5-02` | api | agendamentos core | `GET/POST /api/agendamentos`, `GET/PUT /api/agendamentos/[id]` | `P1` | `atencao` | agenda cruza busca, paginacao, role e unidade | contratos fechados |
| `S5-03` | api | chegada do agendamento | `POST /api/agendamentos/[id]/chegou` | `P0` | `ok-validar` | muda estado operacional e cria atendimento | regra validada por role |
| `S5-04` | api | endpoints de agenda sem uso direto | `GET /api/agendamentos/[id]` | `P3` | `orfao` | pode ser legado ou preparacao para futuras telas | decidir manter ou integrar |

---

## Sprint 6 - Execucao, filas dinamicas e comissoes

### Telas

| ID | Tipo | Item | Escopo | Roles | Unidade | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S6-01` | tela | `/execucao` | redirect para fila visivel | executor, ortodontista, admin-dentista | sim | `P2` | `ok-validar` | depende de categorias visiveis | redirect auditado |
| `S6-02` | tela | `/fila/[slug]` | fila dinamica por categoria, views `procedimento/paciente`, assumir procedimentos | executor, ortodontista, admin-dentista | sim | `P0` | `atencao` | depende de `categoria_roles` e contrato da fila | tela auditada |
| `S6-03` | tela | `/fila/[slug]/[id]` | alias da execucao detalhada | executor, ortodontista, admin-dentista | sim | `P2` | `ok-validar` | alias pode mascarar divergencias do fluxo real | alias auditado |
| `S6-04` | tela | `/execucao/[id]` | execucao do item, prontuario, anexos, pegar procedimento, concluir, adicionar procedimento | executor, ortodontista, admin-dentista | sim | `P0` | `desalinhado` | chama endpoints inexistentes de etapa | fluxo corrigido |
| `S6-05` | tela | `/meus-procedimentos` | historico pessoal com tabs dinamicas | avaliador, executor, admin-dentista | sim | `P1` | `ok-validar` | depende de `hasRole` e consolidacao de duas naturezas de item | tela auditada |
| `S6-06` | tela | `/minhas-comissoes` | comissoes do usuario logado | avaliador, admin-dentista | sim | `P1` | `ok-validar` | precisa casar com endpoint de comissoes e role efetiva | tela auditada |

### API

| ID | Tipo | Item | Escopo | Prioridade | Status inicial | Risco principal | Saida esperada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `S6-07` | api | fila dinamica | `GET /api/fila/[slug]` | `P0` | `atencao` | regra de role por categoria e unidade | contratos e autorizacao fechados |
| `S6-08` | api | execucao legado x atual | `GET /api/execucao` | `P2` | `legado` | fluxo principal atual redireciona para fila, endpoint pode ter ficado para tras | decidir manter ou convergir |
| `S6-09` | api | item de execucao | `GET /api/execucao/item/[id]` | `P1` | `ok-validar` | base da tela de execucao | contrato fechado |
| `S6-10` | api | anexos/prontuario/notas da execucao | `GET/POST/DELETE /api/execucao/item/[id]/anexos`, `GET/POST /api/execucao/item/[id]/prontuario`, `GET/POST /api/execucao/item/[id]/notas` | `P1` | `sem-guarda` | endpoints sensiveis ligados a arquivo e prontuario | guards e contratos fechados |
| `S6-11` | api | meus procedimentos | `GET /api/meus-procedimentos` | `P1` | `ok-validar` | consolida avaliacao e execucao em um endpoint | contrato fechado |
| `S6-12` | api | arquivos | `GET /api/arquivos/[...path]` | `P1` | `sem-guarda` | acesso a arquivo sem guarda aparente | politica de acesso definida |

---

## Sequencia recomendada dentro de cada sprint

Para cada sprint, executar sempre nesta ordem:

1. telas/shared
2. endpoint cluster correspondente
3. roles e guards
4. unidade
5. contrato de response
6. teste manual guiado
7. teste automatizado
8. atualizar `docs/mapa-sistema.md`
9. atualizar esta matriz com status final

## Quadro de saida esperado por sprint

| Sprint | Entregas obrigatorias |
| --- | --- |
| `Sprint 0` | matriz refinada, owners e checklist fechados |
| `Sprint 1` | gaps criticos de seguranca e inconsistencia estrutural resolvidos |
| `Sprint 2` | cadastros admin auditados ponta a ponta |
| `Sprint 3` | clientes e prontuario auditados ponta a ponta |
| `Sprint 4` | atendimento comercial auditado ponta a ponta |
| `Sprint 5` | agenda auditada por role |
| `Sprint 6` | execucao e filas dinamicas auditadas, comissoes fechadas |

## Primeiros alvos recomendados

Se a equipe quiser atacar o maior risco primeiro, comecar por:

1. `S1-10` - rotas de execucao por etapa inexistentes
2. `S1-07` - guards admin em dashboard/comissoes
3. `S1-08` - CRUD sensivel aberto em usuarios/procedimentos
4. `S1-09` - superficies abertas em clientes, execucao e arquivos
5. `S4-03` - tela central de atendimento

## Campo para status final

Sugestao de estados finais para usar durante a execucao:

- `ok`
- `ok-com-ajuste`
- `corrigido`
- `nao-usado-confirmado`
- `legado-confirmado`
- `bloqueado`
