# UI Audit Matrix

Status permitidos: `todo`, `mapeado`, `em-refactor`, `em-qa`, `feito`, `bloqueado`

Cada PR de UI deve atualizar esta matriz.

| Área | Tela / Componente | Roles auditadas | Light | Dark | Responsivo | Acessibilidade | Reutilização | Status | Observações | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fundação | `app/globals.css` | todas | em revisão | em revisão | n/a | n/a | central | em-qa | tokens semânticos e superfícies unificados | atual |
| Fundação | `components/ui/Button` | todas | em revisão | em revisão | ok | em revisão | central | em-qa | foco, contraste e variantes alinhados | atual |
| Fundação | `components/ui/Input` | todas | em revisão | em revisão | ok | em revisão | central | em-qa | contrato `field-control` consolidado | atual |
| Fundação | `components/ui/Select` | todas | em revisão | em revisão | ok | em revisão | central | em-qa | mesmo contrato visual do input | atual |
| Fundação | `components/ui/Textarea` | todas | em revisão | em revisão | ok | em revisão | central | em-qa | mesmo contrato visual do input | atual |
| Fundação | `components/ui/Card` | todas | em revisão | em revisão | ok | ok | central | em-qa | superfícies migradas para `card` | atual |
| Fundação | `components/ui/Alert` | todas | em revisão | em revisão | ok | em revisão | central | em-qa | feedback semântico por tipo | atual |
| Fundação | `components/ui/Badge` | todas | em revisão | em revisão | ok | ok | central | em-qa | badges com contraste light/dark | atual |
| Fundação | `components/ui/Table` | todas | em revisão | em revisão | em revisão | em revisão | central | em-qa | cabeçalho e superfícies alinhados | atual |
| Fundação | `components/ui/Modal` | todas | em revisão | em revisão | em revisão | em revisão | central | em-qa | header/footer/description padronizados | atual |
| Fundação | `components/ui/ConfirmDialog` | todas | em revisão | em revisão | ok | em revisão | central | em-qa | mídia/ícone e variantes revisadas | atual |
| Fundação | `components/ui/Toast` | todas | em revisão | em revisão | ok | em revisão | central | em-qa | Toaster renderizado globalmente | atual |
| Shell | `app/login` | pública | em revisão | em revisão | em revisão | em revisão | parcial | em-qa | parou de forçar light e ganhou toggle | atual |
| Shell | `components/layout/AppLayout` | autenticado | ok | ok | ok | ok | central | mapeado | revisar depois com smoke de navegação |  |
| Shell | `components/layout/Header` | todas | em revisão | em revisão | em revisão | em revisão | central | em-qa | botões e foco visível alinhados | atual |
| Shell | `components/layout/Sidebar` | todas | ok | ok | em revisão | em revisão | central | mapeado | depende do smoke por role |  |
| Shell | `components/layout/BottomNav` | todas mobile | em revisão | em revisão | em revisão | em revisão | central | em-qa | sheet e foco do botão "Mais" revisados | atual |
| Shell | `components/layout/UnitSelector` | multiunidade | em revisão | em revisão | ok | em revisão | central | em-qa | trigger e contraste revisados | atual |
| Shell | `components/domain/TrocarSenhaModal` | autenticado | em revisão | em revisão | ok | em revisão | reutiliza ui | em-qa | agora usa `Alert` e `Modal` semântico | atual |
| Shell | `components/domain/ProntuarioDrawer` | admin, atendente, avaliador, executor | em revisão | em revisão | em revisão | em revisão | reutiliza ui | em-qa | erro/footer alinhados ao tema | atual |
| Onda 1 | `app/clientes/[id]` | admin, atendente | mapeado | mapeado | mapeado | mapeado | alto | mapeado | 10 abas, 4 modais, 1 confirm |  |
| Onda 1 | `app/agenda` | admin, atendente, avaliador, executor, ortodontista | mapeado | mapeado | mapeado | mapeado | alto | mapeado | 5 modais, 1 confirm, 1 drawer |  |
| Onda 1 | `app/atendimentos/[id]` | admin, atendente | mapeado | mapeado | mapeado | mapeado | alto | mapeado | 4 modais, 1 confirm |  |
| Onda 1 | `app/atendimentos/[id]/pagamento` | admin, atendente | mapeado | mapeado | mapeado | mapeado | alto | mapeado | tela longa e sensível a estados |  |
| Onda 1 | `app/followup` | admin, atendente | mapeado | mapeado | mapeado | mapeado | alto | mapeado | 2 modais, 1 confirm, toggle lista/calendário |  |
| Onda 2 | `app/avaliacao/[id]` | avaliador, admin/dentista | mapeado | mapeado | mapeado | mapeado | alto | mapeado | formulário inline e anexos |  |
| Onda 2 | `app/execucao/[id]` | executor, admin/dentista, ortodontista | mapeado | mapeado | mapeado | mapeado | alto | mapeado | prontuário, anexos e confirmações |  |
| Onda 2 | `app/fechamento-caixa` | admin | mapeado | mapeado | mapeado | mapeado | alto | mapeado | 4 modais e muitos toasts |  |
| Onda 2 | `app/atendimentos/novo` | admin, atendente | mapeado | mapeado | mapeado | mapeado | médio | mapeado | picker de cliente e modal novo cliente |  |
| Onda 2 | `app/clientes` | admin, atendente | mapeado | mapeado | mapeado | mapeado | médio | mapeado | listagem paginada |  |
| Onda 2 | `app/meus-procedimentos` | avaliador, executor, admin/dentista | mapeado | mapeado | mapeado | mapeado | médio | mapeado | tabs por role e drawer |  |
| Onda 3 | `app/page` | todas | mapeado | mapeado | mapeado | mapeado | médio | mapeado | home varia por role e viewMode |  |
| Onda 3 | `app/dashboard` | admin | mapeado | mapeado | mapeado | mapeado | médio | mapeado | cards e gráficos |  |
| Onda 3 | `app/usuarios` | admin | mapeado | mapeado | mapeado | mapeado | alto | mapeado | CRUD com roles/unidades |  |
| Onda 3 | `app/unidades` | admin | mapeado | mapeado | mapeado | mapeado | médio | mapeado | cards/listagem administrativa |  |
| Onda 3 | `app/procedimentos` | admin | mapeado | mapeado | mapeado | mapeado | alto | mapeado | modal + campos inline |  |
| Onda 3 | `app/categorias` | admin | mapeado | mapeado | mapeado | mapeado | médio | mapeado | form inline + confirm |  |
| Onda 3 | `app/comissoes` | admin | mapeado | mapeado | mapeado | mapeado | médio | mapeado | tabs resumo/detalhes |  |
| Onda 3 | `app/minhas-comissoes` | avaliador, admin/dentista | mapeado | mapeado | mapeado | mapeado | médio | mapeado | filtros simples |  |
| Onda 3 | `app/pagamentos` | admin, atendente | mapeado | mapeado | mapeado | mapeado | baixo | mapeado | depende de detalhe de atendimento |  |
| Onda 3 | `app/painel-tv` | admin, atendente | mapeado | mapeado | mapeado | n/a | baixo | mapeado | landing do painel TV |  |
| Onda 3 | `app/painel-tv/[slug]` | admin, atendente | mapeado | mapeado | mapeado | n/a | baixo | mapeado | template por fila |  |
| Onda 3 | `app/painel-tv/todas` | admin, atendente | mapeado | mapeado | mapeado | n/a | baixo | mapeado | template consolidado |  |
| Template | `app/fila/[slug]` | executor, ortodontista, admin/dentista | mapeado | mapeado | mapeado | mapeado | alto | mapeado | tratar como família de tela |  |
| Template | `app/fila/[slug]/[id]` | executor, ortodontista, admin/dentista | mapeado | mapeado | mapeado | mapeado | alto | mapeado | alias do detalhe de execução |  |
| Template | `app/avaliacao` | avaliador, admin/dentista | mapeado | mapeado | mapeado | mapeado | médio | mapeado | fila + drawer |  |
| Template | `app/atendimentos` | admin, atendente | mapeado | mapeado | mapeado | mapeado | médio | mapeado | toggle kanban/lista |  |
| Template | `app/atendimentos/[id]/encerrar` | admin, atendente | mapeado | mapeado | mapeado | mapeado | médio | mapeado | revisão final |  |
| Template | `app/clientes/novo` | admin, atendente | mapeado | mapeado | mapeado | mapeado | baixo | mapeado | usa `ClienteForm` |  |
| Template | `app/execucao` | executor, ortodontista, admin/dentista | mapeado | mapeado | mapeado | n/a | baixo | mapeado | redirect sem UI |  |
