# Component Reuse Matrix

Decisões permitidas: `manter`, `ajustar`, `extrair`, `substituir`, `descontinuar`

| Camada | Item | Consumidores atuais | Decisão | Próxima ação | Status |
| --- | --- | --- | --- | --- | --- |
| `ui` | `Button` | shell, formulários, modais, listagens | ajustar | manter como CTA padrão e remover botões crus onde já houver encaixe | em andamento |
| `ui` | `Input` | login, forms, filtros, modais | ajustar | consolidar como base de texto/data/tel/search | em andamento |
| `ui` | `Select` | forms e modais | ajustar | substituir selects crus das telas auditadas | em andamento |
| `ui` | `Textarea` | prontuário, followup, avaliação, execução | ajustar | substituir textareas cruas nas ondas 1 e 2 | em andamento |
| `ui` | `Card` | home, dashboard, drawers, listagens | ajustar | usar `bg-card` e remover containers ad hoc | em andamento |
| `ui` | `Alert` | login, senha, feedback inline | ajustar | virar padrão de erro/sucesso inline | em andamento |
| `ui` | `Badge` | status e chips contextuais | ajustar | consolidar contraste e variantes por papel/estado | em andamento |
| `ui` | `Table` | clientes, comissões, histórico, procedimentos | ajustar | servir também como base de zebra/loading/sticky header | em andamento |
| `ui` | `Tabs` | cliente detalhe, comissões, prontuário, meus procedimentos | manter | fechar QA de teclado e variantes | mapeado |
| `ui` | `Modal` | agenda, cliente detalhe, atendimento detalhe, followup, fechamento | ajustar | virar casca única de dialog | em andamento |
| `ui` | `ConfirmDialog` | clientes, agenda, categorias, usuários, execução | ajustar | padronizar cópia, ícone e variantes | em andamento |
| `ui` | `Toast` | followup, agenda, execução, fechamento, atendimento | ajustar | manter via Sonner global e revisar semântica | em andamento |
| `ui` | `LoadingState` | poucas telas | ajustar | expandir uso para loading/empty/error/success | mapeado |
| `ui` | `EmptyState` | poucas telas | ajustar | expandir uso nas listagens e filas | mapeado |
| `ui` | `SearchInput` | clientes, followup, listagens | manter | substituir campos de busca repetidos quando possível | mapeado |
| `ui` | `Pagination` | clientes, agenda | manter | expandir para outras listagens longas | mapeado |
| `domain` | `StatusBadge` | atendimento, agenda, filas, histórico | manter | seguir como fonte única de status visual | mapeado |
| `domain` | `StatusPipeline` | atendimento, execução | manter | revisar contraste no dark mode | mapeado |
| `domain` | `ClienteForm` | `/clientes/novo`, `/clientes/[id]`, `/atendimentos/novo` | manter | reduzir formulários ad hoc ao redor dele | mapeado |
| `domain` | `ProcedimentoForm` | `/procedimentos` | manter | virar padrão para CRUD de procedimento | mapeado |
| `domain` | `PagamentoForm` | pagamento e detalhes | ajustar | revisar consistência com inputs/totais | mapeado |
| `domain` | `ProntuarioDrawer` | agenda, avaliação, execução, fila, meus procedimentos | ajustar | concluir shell clínica comum | em andamento |
| `domain` | `AnexosGallery` | cliente/execução/avaliação | ajustar | avaliar se pode centralizar anexos multiuso | mapeado |
| `domain` | `ViewModeToggle` | agenda, atendimentos, followup | extrair | usar como base para toggles segmentados restantes | mapeado |
| `domain` | `ComissoesResumo` | `/comissoes`, `/minhas-comissoes` | manter | revisar apenas tema e tabela | mapeado |
| `domain` | `AgendaCalendario` | `/agenda` | manter | alinhar tokens e controles auxiliares | mapeado |
| `domain` | `FollowupCalendario` | `/followup` | manter | alinhar tokens e contraste do dark mode | mapeado |
| `domain` | `TrocarSenhaModal` | header global | ajustar | já migrado para `Alert` e `Modal` padronizados | em andamento |
| `domain` | `SelecaoProcedimentosHoje` | pagamento/atendimento | ajustar | migrar campos crus para `Input`/`Checkbox` | mapeado |
| Padrão candidato | Cliente picker inline | `agenda`, `atendimentos/novo`, `header` | extrair | criar componente de busca/seleção reutilizável | mapeado |
| Padrão candidato | Toggle segmentado inline | `followup`, `agenda`, `atendimentos/novo`, `header` | extrair | convergir em `ViewModeToggle` ou novo `SegmentedControl` | mapeado |
| Padrão candidato | Blocos de ação em detalhe | `clientes/[id]`, `atendimentos/[id]`, `avaliacao/[id]`, `execucao/[id]` | extrair | criar barra/cluster de ações recorrente | mapeado |
| Padrão candidato | Modal operacional com formulário curto | `agenda`, `followup`, `fechamento-caixa` | extrair | criar casca com footer padrão e validação curta | mapeado |
