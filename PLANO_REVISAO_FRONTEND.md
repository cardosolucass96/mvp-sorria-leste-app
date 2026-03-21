# Plano de Revisão — Design System, UI/UX & Frontend

> Pós-MVP · Sorria Leste App
> Objetivo: padronizar o design system, melhorar UX, garantir componentes reutilizáveis e cobrir o frontend com testes.

---

## Sprint 1 — Auditoria & Design Tokens (Fundação)

### 1.1 Auditoria de consistência visual
- [ ] Mapear todas as cores hardcoded no código (ex: `bg-orange-500`, `text-gray-600`) e listar inconsistências
- [ ] Mapear tamanhos de fonte, espaçamentos e border-radius usados inline vs. tokens do `globals.css`
- [ ] Verificar se as CSS variables (`--color-primary-*`, `--space-*`, `--radius-sm`) estão sendo usadas consistentemente em todos os componentes
- [ ] Identificar estilos duplicados ou conflitantes entre componentes

### 1.2 Refatorar Design Tokens
- [ ] Criar escala tipográfica completa como CSS variables (heading-1 a heading-4, body, caption, label)
- [ ] Criar tokens de sombra (`--shadow-sm`, `--shadow-md`, `--shadow-lg`)
- [ ] Criar tokens de transição/animação (`--transition-fast`, `--transition-normal`)
- [ ] Adicionar tokens de breakpoints documentados para responsividade
- [ ] Padronizar a paleta de cores semânticas (surface, border, text-muted, text-primary, etc.)

### 1.3 Documentação do Design System
- [ ] Criar arquivo `DESIGN_SYSTEM.md` com guia de uso dos tokens
- [ ] Documentar a hierarquia de componentes: ui/ → domain/ → pages

**Entregável:** Tokens centralizados, zero cores/tamanhos hardcoded, guia documentado.

---

## Sprint 2 — Componentes UI Base (Primitivos)

### 2.1 Revisão dos componentes `components/ui/`
- [ ] **Button.tsx** — Verificar: estados hover/focus/disabled/loading, acessibilidade (aria-label, role), consistência de tamanhos (sm/md/lg), spinner de loading
- [ ] **Input.tsx** — Verificar: estados de erro, label associada (htmlFor/id), placeholder consistente, foco visível (focus-visible), ícones opcionais
- [ ] **Select.tsx** — Verificar: label, estado de erro, placeholder, acessibilidade teclado
- [ ] **Textarea.tsx** — Verificar: auto-resize opcional, contagem de caracteres, estados
- [ ] **Checkbox.tsx** — Verificar: label clicável, indeterminate state, acessibilidade
- [ ] **Modal.tsx** — Verificar: focus trap, fechar com Escape, click fora, scroll lock do body, acessibilidade (aria-modal, role="dialog")
- [ ] **Table.tsx** — Verificar: responsividade (overflow-x mobile), skeleton loading, empty state, ordenação visual
- [ ] **Toast.tsx** — Verificar: auto-dismiss timer, posição consistente, stacking, acessibilidade (role="alert")
- [ ] **Alert.tsx** — Verificar: ícones por tipo, dismiss opcional, acessibilidade
- [ ] **Badge.tsx** — Verificar: variantes de cor, tamanhos consistentes
- [ ] **Card.tsx** — Verificar: padding consistente, variantes (elevated, outlined, flat)
- [ ] **Tabs.tsx** — Verificar: navegação por teclado (arrow keys), aria-selected, indicador ativo
- [ ] **Tooltip.tsx** — Verificar: posicionamento, delay, acessibilidade
- [ ] **ConfirmDialog.tsx** — Verificar: focus no botão de ação, texto claro, variante danger
- [ ] **LoadingState.tsx** — Verificar: skeleton adequado ao contexto, animação suave
- [ ] **EmptyState.tsx** — Verificar: ilustração, CTA de ação, texto amigável

### 2.2 Componentes faltantes
- [ ] Criar **Spinner/Loading** inline (para botões e áreas pequenas)
- [ ] Criar **FormField** wrapper (label + input + error message + hint text)
- [ ] Criar **Breadcrumb** para navegação hierárquica
- [ ] Criar **Pagination** reutilizável (listagens de clientes, atendimentos, etc.)
- [ ] Criar **SearchInput** com debounce e ícone de busca
- [ ] Criar **Divider** estilizado
- [ ] Avaliar necessidade de **Dropdown Menu** (ações contextuais)

### 2.3 Padronização de API dos componentes
- [ ] Garantir que todos os componentes usem `className` como prop para extensão
- [ ] Garantir `forwardRef` nos componentes de form (Input, Select, Textarea, Checkbox)
- [ ] Padronizar nomenclatura de variantes (`variant`, `size`, `color`) em todos os componentes
- [ ] Garantir que todos os componentes exportem seus tipos no `index.ts`

**Entregável:** Componentes base revisados, acessíveis, com API consistente.

---

## Sprint 3 — Componentes de Domínio & Formulários

### 3.1 Revisão dos formulários
- [ ] **ClienteForm.tsx** — Verificar: validação em tempo real, máscaras (CPF, telefone), feedback de erro inline, UX de campos obrigatórios (asterisco), tab order lógica
- [ ] **ProcedimentoForm.tsx** — Verificar: mesmos critérios acima
- [ ] **PagamentoForm.tsx** — Verificar: cálculos em tempo real (parcelas, total), UX de seleção de método de pagamento
- [ ] **ProntuarioEditor.tsx** — Verificar: auto-save ou indicador de alterações não salvas, UX de edição

### 3.2 Refatorar padrão de formulários
- [ ] Criar hook `useForm` genérico com: estado, validação, dirty tracking, submit handler
- [ ] Padronizar padrão de erro: `{ field: string; message: string }[]`
- [ ] Implementar validação de formulário com feedback visual consistente (borda vermelha + mensagem)
- [ ] Garantir que todos os forms tenham estado de loading no submit (botão disabled + spinner)
- [ ] Implementar prevenção de navegação com alterações não salvas (beforeunload + modal)

### 3.3 Revisão dos componentes de domínio
- [ ] **StatusBadge.tsx** — Cores e labels consistentes com o enum `AtendimentoStatus`
- [ ] **StatusPipeline.tsx** — Verificar visualização clara do fluxo de estados
- [ ] **ClienteCard.tsx** — Informações essenciais visíveis, ação de click/navigate
- [ ] **AtendimentoCard.tsx** — Status visível, informações resumidas, ações rápidas
- [ ] **ParcelasTable.tsx** — Status de pagamento claro, ações de marcar como pago
- [ ] **AnexosGallery.tsx** — Preview de imagens, download, upload com drag & drop
- [ ] **PagamentoDistribuicao.tsx** — Visualização clara da distribuição entre dentistas
- [ ] **SeletorDentes.tsx** — UX intuitiva, feedback visual de seleção, responsivo

**Entregável:** Formulários validados, UX consistente, componentes de domínio revisados.

---

## Sprint 4 — Layout, Navegação & Responsividade

### 4.1 Layout principal
- [ ] **AppLayout.tsx** — Verificar: transição sidebar mobile (hamburger → drawer), scroll behavior, loading state inicial
- [ ] **Header.tsx** — Verificar: responsividade, informações visíveis, menu de perfil mobile
- [ ] **Sidebar.tsx** — Verificar: collapse em telas menores, indicador de rota ativa, transição suave, scroll em menus longos
- [ ] Verificar consistência de padding/margin entre todas as páginas

### 4.2 Responsividade completa
- [ ] Testar e corrigir TODAS as páginas nos breakpoints: 320px, 375px, 768px, 1024px, 1440px
- [ ] **Tabelas** — Garantir scroll horizontal ou layout cards em mobile
- [ ] **Formulários** — Stack vertical em mobile, labels acima dos inputs
- [ ] **Dashboard** — Cards em grid responsivo (1 col mobile → 2 cols tablet → 4 cols desktop)
- [ ] **Modais** — Full-screen em mobile, centrado em desktop
- [ ] **SeletorDentes** — Verificar usabilidade em telas touch/pequenas

### 4.3 Navegação & UX
- [ ] Implementar breadcrumbs nas páginas de detalhe (Clientes > João > Atendimento #123)
- [ ] Verificar se todas as rotas possuem loading state (skeleton) durante fetch
- [ ] Verificar se erros de API são exibidos com feedback visual (toast ou alert)
- [ ] Verificar comportamento do botão "voltar" em todas as páginas
- [ ] Garantir page titles corretos via `usePageTitle()`
- [ ] Verificar redirects após ações (criar, editar, deletar)

**Entregável:** App 100% responsivo, navegação intuitiva, loading/error states em todas as páginas.

---

## Sprint 5 — Acessibilidade & Performance

### 5.1 Acessibilidade (WCAG 2.1 AA)
- [ ] Rodar audit com Lighthouse e axe-core em todas as páginas
- [ ] Verificar contraste de cores (mínimo 4.5:1 para texto, 3:1 para elementos grandes)
- [ ] Garantir navegação completa por teclado (Tab, Enter, Escape, Arrow keys)
- [ ] Verificar landmarks semânticos (`<main>`, `<nav>`, `<header>`, `<aside>`)
- [ ] Verificar `aria-label` em botões com apenas ícone
- [ ] Verificar `alt` em todas as imagens
- [ ] Verificar que focus-visible está visível em todos os elementos interativos
- [ ] Verificar anúncio de erros para screen readers (`aria-live`, `role="alert"`)
- [ ] Verificar skip-to-content link

### 5.2 Performance
- [ ] Implementar lazy loading nas rotas/páginas (dynamic imports)
- [ ] Verificar bundle size e identificar imports pesados
- [ ] Otimizar re-renders desnecessários (React.memo, useMemo, useCallback onde necessário)
- [ ] Verificar se imagens usam `next/image` com lazy loading
- [ ] Implementar debounce em buscas/filtros
- [ ] Verificar se o `AuthContext` não causa re-renders cascata desnecessários

### 5.3 Micro-interações & Polish
- [ ] Adicionar transições suaves em: abertura de modal, mudança de tab, hover de cards
- [ ] Adicionar animação de entrada nas listas (fade-in stagger)
- [ ] Feedback visual em ações destrutivas (delete com confirmação + toast de sucesso)
- [ ] Estados de hover consistentes em todos os elementos clicáveis

**Entregável:** Score Lighthouse > 90, WCAG 2.1 AA compliance, UX polida.

---

## Sprint 6 — Testes de Componentes UI

### 6.1 Setup de testes frontend
- [ ] Configurar Jest com `jsdom` environment para testes de componente
- [ ] Instalar e configurar `@testing-library/react` e `@testing-library/user-event`
- [ ] Configurar `@testing-library/jest-dom` para matchers customizados
- [ ] Criar helpers de teste: `renderWithProviders()` (AuthContext, Toast, etc.)

### 6.2 Testes dos componentes UI primitivos
- [ ] **Button** — renderização de variantes, click handler, estado disabled, loading
- [ ] **Input** — renderização, onChange, valor controlado, estado de erro, placeholder
- [ ] **Select** — renderização de opções, onChange, valor default, disabled
- [ ] **Modal** — abrir/fechar, focus trap, Escape, click outside
- [ ] **Table** — renderização de dados, ordenação, loading, empty state
- [ ] **Toast** — exibição, auto-dismiss, múltiplos toasts, tipos
- [ ] **Tabs** — troca de tab, conteúdo correto, navegação teclado
- [ ] **Alert** — variantes, dismiss, conteúdo
- [ ] **Badge** — variantes, texto
- [ ] **ConfirmDialog** — abrir, confirmar, cancelar, loading

### 6.3 Testes dos componentes de domínio
- [ ] **ClienteForm** — validação de CPF, telefone, campos obrigatórios, submit
- [ ] **ProcedimentoForm** — validação, submit, edição
- [ ] **PagamentoForm** — cálculo de parcelas, validação, métodos de pagamento
- [ ] **StatusBadge** — mapeamento correto status → cor/label
- [ ] **ParcelasTable** — renderização, ações, estados
- [ ] **SeletorDentes** — seleção/deseleção, múltipla seleção, visual

**Entregável:** Cobertura de testes > 80% nos componentes, CI green.

---

## Sprint 7 — Testes E2E & de Integração Frontend

### 7.1 Setup E2E
- [ ] Instalar e configurar Playwright ou Cypress
- [ ] Configurar banco de testes e seed data
- [ ] Criar fixtures de autenticação (login automático por role)

### 7.2 Fluxos críticos E2E
- [ ] **Login** — login com credenciais válidas/inválidas, redirect pós-login por role, logout
- [ ] **CRUD Cliente** — criar, listar, editar, buscar cliente
- [ ] **Fluxo Atendimento completo** — criar atendimento → avaliação → pagamento → execução → finalizar
- [ ] **Pagamento com parcelas** — criar pagamento parcelado, marcar parcelas como pagas
- [ ] **Execução (dentista)** — fila de execução, upload de anexo, prontuário, concluir
- [ ] **Dashboard** — dados carregam corretamente por role
- [ ] **Gestão de usuários** — criar, editar, desativar usuário (admin only)
- [ ] **Comissões** — verificar cálculo correto após conclusão de procedimento

### 7.3 Testes de integração de páginas
- [ ] Cada página carrega sem erros (smoke test de todas as rotas)
- [ ] Todas as listagens mostram loading → dados ou empty state
- [ ] Todos os formulários validam e mostram erros
- [ ] Navegação entre páginas mantém estado correto do auth
- [ ] Role-based access: dentista NÃO acessa rotas admin e vice-versa

### 7.4 Testes visuais (opcional)
- [ ] Configurar screenshot testing com Playwright
- [ ] Capturar snapshots das páginas principais em desktop e mobile
- [ ] Usar para detectar regressões visuais em futuras mudanças

**Entregável:** Fluxos críticos cobertos por E2E, confidence para deploy.

---

## Sprint 8 — QA Final & Hardening

### 8.1 Checklist de qualidade por página
- [ ] **Login** — responsive, error states, loading, remember me
- [ ] **Dashboard** — gráficos carregam, filtros funcionam, responsive
- [ ] **Clientes** — CRUD completo, busca, paginação, detalhes
- [ ] **Atendimentos** — criação, status pipeline, detalhes, ações por status
- [ ] **Pagamentos** — criação, parcelas, status, distribuição
- [ ] **Execução** — fila, detalhes, upload, prontuário, conclusão
- [ ] **Procedimentos** — CRUD, validações (admin only)
- [ ] **Usuários** — CRUD, roles, ativar/desativar (admin only)
- [ ] **Comissões** — listagem, filtros, cálculos corretos
- [ ] **Meus Procedimentos** — listagem por dentista
- [ ] **Minhas Comissões** — listagem por dentista

### 8.2 Edge cases & error handling
- [ ] Testar com API retornando 500 — verificar que erro é exibido gracefully
- [ ] Testar com rede lenta (throttle) — verificar loading states
- [ ] Testar com token expirado — verificar redirect para login
- [ ] Testar ações concorrentes (double click em submit, etc.)
- [ ] Testar com dados vazios (nenhum cliente, nenhum atendimento, etc.)
- [ ] Testar com dados extremos (nomes longos, valores altos, muitas parcelas)

### 8.3 Cleanup & finalização
- [ ] Remover console.logs de desenvolvimento
- [ ] Remover código comentado
- [ ] Verificar que não há `any` desnecessário no TypeScript
- [ ] Verificar que não há warnings no build (`next build`)
- [ ] Verificar que ESLint passa sem erros
- [ ] Atualizar `DESIGN_SYSTEM.md` com estado final

**Entregável:** App production-ready, zero bugs conhecidos, código limpo.

---

## Resumo dos Sprints

| Sprint | Foco | Duração estimada |
|--------|------|-----------------|
| 1 | Auditoria & Design Tokens | — |
| 2 | Componentes UI Base | — |
| 3 | Componentes de Domínio & Formulários | — |
| 4 | Layout, Navegação & Responsividade | — |
| 5 | Acessibilidade & Performance | — |
| 6 | Testes de Componentes UI | — |
| 7 | Testes E2E & Integração | — |
| 8 | QA Final & Hardening | — |

---

## Stack de ferramentas para os testes

| Ferramenta | Uso |
|------------|-----|
| Jest + jsdom | Testes unitários de componentes |
| @testing-library/react | Renderização e interação com componentes |
| @testing-library/user-event | Simulação realista de eventos do usuário |
| Playwright | Testes E2E (fluxos completos no browser) |
| axe-core | Auditoria de acessibilidade automatizada |
| Lighthouse CI | Performance e melhores práticas |
