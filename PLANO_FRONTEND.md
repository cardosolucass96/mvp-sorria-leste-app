# Plano de Desenvolvimento Frontend — Sorria Leste

> **Data:** 2026-03-07  
> **Versão:** 1.0  
> **Stack:** Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript  
> **Princípios:** Design System First, Component-Driven Development, Mobile-First  

---

## 1. Diagnóstico do Estado Atual

### 1.1 Inventário

| Dado | Valor |
|------|-------|
| Total de arquivos frontend | 28 |
| Total de linhas | ~8.800 |
| Componentes reutilizáveis | 1 (`SeletorDentes`) + 3 layout |
| Funções duplicadas | `formatarMoeda` (11×), `formatarData` (10×), `STATUS_CONFIG` (3×) |
| Padrões de loading | 3 diferentes, inconsistentes |
| Padrões de erro | 2 diferentes |
| Tabelas inline | 14 (nenhuma reutilizável) |
| Formulários inline | 10 (nenhum componente de form) |
| Modais inline | 3 (sem focus trap ou padrão) |
| Acessibilidade | Mínima (sem aria-labels, sem foco em modais) |

### 1.2 Problemas Encontrados

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **Zero abstração de componentes** — toda UI está inline nas páginas | Manutenção difícil, inconsistência visual |
| 2 | **`formatarMoeda` duplicada 11 vezes** | Qualquer mudança precisa de 11 atualizações |
| 3 | **Status labels/cores inconsistentes** entre páginas | Triagem = gray em uma página, yellow em outra |
| 4 | **3 padrões de loading diferentes** | UX inconsistente |
| 5 | **Nenhum sistema de feedback** (toast/snackbar) | Usuário não sabe se ação foi bem-sucedida |
| 6 | **Modais sem focus trap** | Acessibilidade comprometida |
| 7 | **`menuItems` duplicado** em Header e Sidebar | Fonte única de verdade inexistente |
| 8 | **Maior arquivo tem 892 linhas** (pagamento) | Impossível manter e testar |
| 9 | **`page.tsx` (home) tem 4 telas dentro** (554 linhas) | Monolítico |
| 10 | **Design tokens de `globals.css` ignorados** | `.badge-triagem`, `.table-header` existem mas não são usados |

### 1.3 O Que Já Está Bom

- CSS variables definidas em `:root` (cores primárias)
- Classes utilitárias no `globals.css` (`.card`, `.btn`, `.badge`, `.input`, `.label`)
- `AuthContext` com `viewMode` admin/dentista bem estruturado
- `AppLayout` com guarda de rota funcionando
- `SeletorDentes` é um bom exemplo de componente isolado

---

## 2. Arquitetura Alvo

### 2.1 Estrutura de Pastas

```
components/
├── ui/                          # Design System — primitivos genéricos
│   ├── Button.tsx               # Botão (variantes: primary, secondary, danger, ghost, outline)
│   ├── Input.tsx                # Input com label, erro, dica
│   ├── Select.tsx               # Select com label, erro
│   ├── Textarea.tsx             # Textarea com label, erro, contador
│   ├── Checkbox.tsx             # Checkbox com label
│   ├── Badge.tsx                # Badge genérico (variantes por cor)
│   ├── Card.tsx                 # Card container (variantes: default, outlined, elevated)
│   ├── Modal.tsx                # Modal com focus trap, ESC, overlay click
│   ├── Table.tsx                # Table wrapper (header, body, empty, loading)
│   ├── PageHeader.tsx           # Título + descrição + ações + voltar
│   ├── EmptyState.tsx           # Estado vazio com ícone e ação
│   ├── LoadingState.tsx         # Loading com skeleton ou spinner
│   ├── Alert.tsx                # Alert (info, success, warning, error)
│   ├── Toast.tsx                # Toast/Snackbar com auto-dismiss
│   ├── ToastProvider.tsx        # Provider global de toasts
│   ├── StatCard.tsx             # Card de métrica: ícone + label + valor
│   ├── Tabs.tsx                 # Tabs (controlled, uncontrolled)
│   ├── FilterBar.tsx            # Barra de filtros com datas, busca, limpar
│   ├── ConfirmDialog.tsx        # Substituição de confirm() nativo
│   ├── Avatar.tsx               # Avatar de usuário (iniciais + cor)
│   ├── Tooltip.tsx              # Tooltip acessível
│   └── index.ts                 # Barrel export
│
├── domain/                      # Componentes de domínio — lógica de negócio
│   ├── StatusBadge.tsx          # Badge de status (atendimento/item) com mapa centralizado
│   ├── StatusPipeline.tsx       # Pipeline visual: triagem → avaliação → ... → finalizado
│   ├── ClienteForm.tsx          # Formulário de cliente (novo/edição) com CPF/telefone
│   ├── ClienteCard.tsx          # Card resumo de cliente
│   ├── ProcedimentoForm.tsx     # Formulário de procedimento (modal)
│   ├── AtendimentoCard.tsx      # Card de atendimento (usado na listagem e kanban)
│   ├── ItemAtendimentoRow.tsx   # Linha de item do atendimento (tabela)
│   ├── PagamentoForm.tsx        # Formulário de registro de pagamento
│   ├── PagamentoDistribuicao.tsx # Distribuição de pagamento por itens
│   ├── ParcelasTable.tsx        # Tabela de parcelas
│   ├── ProntuarioEditor.tsx     # Editor de prontuário (textarea + regras + histórico)
│   ├── AnexosGallery.tsx        # Galeria de anexos com upload + preview + delete
│   ├── SeletorDentes.tsx        # ← já existe, manter
│   ├── ComissoesResumo.tsx      # Tabela resumo de comissões
│   ├── ViewModeToggle.tsx       # Toggle Kanban/Lista ou Resumo/Detalhes
│   └── index.ts
│
├── layout/                      # ← já existe
│   ├── AppLayout.tsx
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── index.ts
│
└── charts/                      # Gráficos do Dashboard
    ├── BarChart.tsx              # Barra horizontal (CSS puro)
    ├── PieChart.tsx              # Donut chart simples
    └── index.ts

lib/
├── db.ts                        # ← já existe
├── types.ts                     # ← já existe
├── schema.sql                   # ← já existe
├── utils/                       # NOVO — utilitários compartilhados
│   ├── formatters.ts            # formatarMoeda, formatarData, formatarDataHora, formatarCPF, formatarTelefone
│   ├── validators.ts            # validarCPF, validarEmail, validarTelefone
│   └── masks.ts                 # Máscaras para inputs (CPF, telefone, moeda)
└── constants/                   # NOVO — constantes centralizadas
    ├── status.ts                # STATUS_CONFIG, ITEM_STATUS, PROXIMOS_STATUS
    ├── origens.ts               # origensOptions (cliente)
    ├── navigation.ts            # menuItems (única fonte para Sidebar + Header)
    └── roles.ts                 # roleLabels, roleColors
```

### 2.2 Design Tokens (CSS Variables)

```css
:root {
  /* Cores Primárias */
  --color-primary-50: #fff7ed;
  --color-primary-100: #ffedd5;
  --color-primary-200: #fed7aa;
  --color-primary-300: #fdba74;
  --color-primary-400: #fb923c;
  --color-primary-500: #f97316;   /* Principal */
  --color-primary-600: #ea580c;
  --color-primary-700: #c2410c;
  --color-primary-800: #9a3412;
  --color-primary-900: #7c2d12;

  /* Cores Semânticas */
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-error: #dc2626;
  --color-info: #2563eb;

  /* Espaçamento (base 4px) */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */

  /* Tipografia */
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;

  /* Bordas */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Sombras */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);

  /* Z-index */
  --z-dropdown: 1000;
  --z-modal: 1050;
  --z-toast: 1100;
}
```

### 2.3 API dos Componentes (Interface)

#### `Button`
```tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;       // Mostra spinner e desabilita
  disabled?: boolean;
  icon?: ReactNode;        // Ícone à esquerda
  iconRight?: ReactNode;   // Ícone à direita
  fullWidth?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
}
```

#### `Input`
```tsx
interface InputProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'tel';
  placeholder?: string;
  value: string | number;
  onChange: (value: string) => void;
  error?: string;          // Mensagem de erro abaixo
  hint?: string;           // Dica abaixo do input
  required?: boolean;      // Mostra * no label
  disabled?: boolean;
  mask?: 'cpf' | 'telefone' | 'moeda';   // Máscara automática
  icon?: ReactNode;        // Ícone dentro do input
}
```

#### `Table`
```tsx
interface TableProps<T> {
  columns: {
    key: string;
    label: string;
    align?: 'left' | 'center' | 'right';
    render?: (item: T) => ReactNode;
    sortable?: boolean;
    width?: string;
  }[];
  data: T[];
  loading?: boolean;       // Mostra skeleton rows
  emptyMessage?: string;
  emptyIcon?: string;
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string | number;
  stickyHeader?: boolean;
}
```

#### `Modal`
```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  footer?: ReactNode;       // Área de ações
  closeOnOverlay?: boolean;  // Default: true
  closeOnEsc?: boolean;      // Default: true
}
```

#### `StatusBadge`
```tsx
interface StatusBadgeProps {
  type: 'atendimento' | 'item' | 'parcela';
  status: string;
  size?: 'sm' | 'md';
}
// Renderiza badge com cor e label corretos baseado no mapa centralizado
```

#### `PageHeader`
```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: string;            // Emoji
  backHref?: string;        // Se presente, mostra botão ← Voltar
  actions?: ReactNode;      // Botões à direita
}
```

#### `Toast` (via Provider)
```tsx
// Hook: const { toast } = useToast();
// Uso: toast.success('Pagamento registrado!');
//      toast.error('Erro ao salvar');
//      toast.info('Novos procedimentos disponíveis');
interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;  // ms, default 4000
}
```

---

## 3. Princípios de UI/UX

### 3.1 Hierarquia Visual
1. **Uma ação principal por tela** — destacada com `btn-primary` large
2. **Ações secundárias** — `btn-secondary` ou `btn-ghost`
3. **Ações destrutivas** — `btn-danger` com `ConfirmDialog`
4. **Informação mais importante primeiro** — cards de resumo no topo

### 3.2 Feedback ao Usuário
1. **Loading**: skeleton para conteúdo principal, spinner inline para ações
2. **Sucesso**: toast (auto-dismiss 4s) para ações comuns, redirect para criação
3. **Erro**: toast persistente (dismiss manual) para erros de ação; alert inline para erros de formulário
4. **Confirmação**: `ConfirmDialog` para ações destrutivas (deletar, finalizar)
5. **Progresso**: pipeline visual para fluxo de atendimento

### 3.3 Responsividade
1. **Mobile-first**: todas as telas devem funcionar em 360px+
2. **Breakpoints**: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
3. **Sidebar**: oculta em mobile, acessível pelo hamburger
4. **Tabelas**: scroll horizontal em mobile com sticky first column
5. **Cards grid**: 1 col mobile → 2 cols tablet → 3-4 cols desktop

### 3.4 Acessibilidade (WCAG 2.1 AA)
1. **Labels**: todo input tem `<label>` associado via `htmlFor`
2. **Aria**: `aria-label` em botões de ícone, `aria-live` em feedback
3. **Focus**: foco visível em todos os interativos, trap em modais
4. **Contraste**: mínimo 4.5:1 para texto, 3:1 para componentes
5. **Keyboard**: Tab navega, Enter/Space ativa, Escape fecha modais
6. **Skip-to-content**: link oculto no topo que pula para `<main>`

### 3.5 Padrões de Estado

Cada página deve renderizar 4 estados:

| Estado | Exibição |
|--------|----------|
| **Loading** | `LoadingState` (skeleton ou spinner) |
| **Empty** | `EmptyState` (ícone + mensagem + ação) |
| **Error** | `Alert` de erro com botão de retry |
| **Success** | Conteúdo normal |

---

## 4. Mapa Completo de Telas

### 4.1 Telas por Módulo

| # | Rota | Tela | Componentes Necessários | Complexidade |
|---|------|------|------------------------|-------------|
| 1 | `/login` | Login | Input, Button, Alert | Simples |
| 2 | `/` | Home (4 variantes por role) | StatCard, PageHeader | Média |
| 3 | `/dashboard` | Dashboard Admin | StatCard, BarChart, FilterBar, Table | Alta |
| 4 | `/clientes` | Lista de Clientes | PageHeader, Table, Input (busca), EmptyState | Média |
| 5 | `/clientes/novo` | Novo Cliente | PageHeader, ClienteForm | Média |
| 6 | `/clientes/[id]` | Detalhe/Editar Cliente | PageHeader, ClienteForm, Card, Table (histórico) | Alta |
| 7 | `/atendimentos` | Lista/Kanban Atendimentos | PageHeader, Tabs, Table, AtendimentoCard, StatusBadge, FilterBar | Alta |
| 8 | `/atendimentos/novo` | Novo Atendimento | PageHeader, Select, Input, ClienteForm (inline), Button | Alta |
| 9 | `/atendimentos/[id]` | Detalhe Atendimento | PageHeader, StatusPipeline, Table, StatusBadge, Button, Modal | Muito Alta |
| 10 | `/atendimentos/[id]/pagamento` | Pagamento | PageHeader, PagamentoForm, PagamentoDistribuicao, ParcelasTable | Muito Alta |
| 11 | `/avaliacao` | Fila Avaliação | PageHeader, Card (fila), StatusBadge, EmptyState | Média |
| 12 | `/avaliacao/[id]` | Detalhe Avaliação | PageHeader, SeletorDentes, Select, Table, ProcedimentoForm, Button | Muito Alta |
| 13 | `/execucao` | Fila Execução | PageHeader, Card (grid), StatusBadge, Tabs, EmptyState | Média |
| 14 | `/execucao/[id]` | Execução Procedimento | PageHeader, ProntuarioEditor, AnexosGallery, StatusBadge, Button | Muito Alta |
| 15 | `/procedimentos` | CRUD Procedimentos | PageHeader, Table, Modal, ProcedimentoForm | Alta |
| 16 | `/usuarios` | CRUD Usuários | PageHeader, Table, Modal/Form, Badge | Alta |
| 17 | `/pagamentos` | Visão Pagamentos | PageHeader, Tabs, Table, StatCard, FilterBar | Alta |
| 18 | `/comissoes` | Comissões (Admin) | PageHeader, Tabs, Table, StatCard, FilterBar | Alta |
| 19 | `/meus-procedimentos` | Meus Procedimentos | PageHeader, Table, FilterBar, StatCard | Média |
| 20 | `/minhas-comissoes` | Minhas Comissões (orphan→remover ou integrar) | — | Avaliar |

### 4.2 Fluxos de Navegação

```
Login ──→ Home (baseado no role/viewMode)
  │
  ├── ADMIN ────────────────────────┐
  │   ├─ Dashboard                  │
  │   ├─ Clientes ─→ Novo/Detalhe  │
  │   ├─ Atendimentos ─→ Novo      │
  │   │   └─→ Detalhe ─→ Pagamento │
  │   ├─ Procedimentos (CRUD)      │
  │   ├─ Usuários (CRUD)           │
  │   ├─ Comissões                  │
  │   └─ Pagamentos                │
  │                                 │
  ├── ATENDENTE ────────────────────┤
  │   ├─ Clientes ─→ Novo/Detalhe  │
  │   ├─ Atendimentos ─→ Novo      │
  │   │   └─→ Detalhe ─→ Pagamento │
  │   └─ Pagamentos                │
  │                                 │
  ├── AVALIADOR ────────────────────┤
  │   ├─ Fila Avaliação             │
  │   │   └─→ Detalhe Avaliação    │
  │   └─ Meus Procedimentos        │
  │                                 │
  ├── EXECUTOR ─────────────────────┤
  │   ├─ Fila Execução              │
  │   │   └─→ Detalhe Execução     │
  │   └─ Meus Procedimentos        │
  │                                 │
  └── ADMIN (modo dentista) ────────┤
      ├─ Fila Avaliação             │
      │   └─→ Detalhe Avaliação    │
      ├─ Fila Execução              │
      │   └─→ Detalhe Execução     │
      └─ Meus Procedimentos        │
```

---

## 5. Divisão em Sprints

### Princípio: Cada sprint entrega valor independente e NÃO precisa ser refeita em sprints posteriores.

```
Sprint 0: Fundação (utils + tokens + constantes)
    ↓ — nada depende de implementações anteriores
Sprint 1: Primitivos UI (componentes genéricos)
    ↓ — cada componente é independente
Sprint 2: Componentes de Domínio (negócio)
    ↓ — usam primitivos da Sprint 1
Sprint 3: Refatorar Páginas Simples
    ↓ — usam componentes das Sprints 1-2
Sprint 4: Refatorar Páginas Complexas
    ↓ — usam tudo das Sprints 0-3
Sprint 5: Polish e Acessibilidade
```

---

### Sprint 0 — Fundação (~2-3h)

**Objetivo:** Criar infraestrutura compartilhada que elimina todas as duplicações de código sem tocar em nenhuma página.

**Critério de Pronto:** Todos os testes existentes continuam passando. Nenhuma página é alterada.

#### Tarefas

| # | Tarefa | Arquivo | Descrição |
|---|--------|---------|-----------|
| 0.1 | Criar `formatters.ts` | `lib/utils/formatters.ts` | `formatarMoeda(valor: number): string`, `formatarData(data: string): string`, `formatarDataHora(data: string): string`, `formatarCPF(cpf: string): string`, `formatarTelefone(tel: string): string` |
| 0.2 | Criar `validators.ts` | `lib/utils/validators.ts` | `validarCPF(cpf: string): boolean`, `validarEmail(email: string): boolean`, `validarTelefone(tel: string): boolean` |
| 0.3 | Criar `masks.ts` | `lib/utils/masks.ts` | `maskCPF(value: string): string`, `maskTelefone(value: string): string`, `maskMoeda(value: string): string` |
| 0.4 | Criar `status.ts` | `lib/constants/status.ts` | Exportar `STATUS_CONFIG`, `ITEM_STATUS_CONFIG`, `PROXIMOS_STATUS`, `STATUS_ORDER` — todos os mapas de status com labels, cores (Tailwind), ícones |
| 0.5 | Criar `origens.ts` | `lib/constants/origens.ts` | Exportar `ORIGENS_OPTIONS` com label/value |
| 0.6 | Criar `roles.ts` | `lib/constants/roles.ts` | Exportar `ROLE_LABELS`, `ROLE_COLORS` |
| 0.7 | Criar `navigation.ts` | `lib/constants/navigation.ts` | Exportar `MENU_ITEMS` — fonte única para Sidebar e Header |
| 0.8 | Expandir design tokens | `app/globals.css` | Adicionar variáveis semânticas (success, warning, error, info), z-index, espaçamentos |
| 0.9 | Criar barrel exports | `lib/utils/index.ts`, `lib/constants/index.ts` | Re-exportar tudo |
| 0.10 | Testes | `__tests__/sprint-frontend-0.test.ts` | Testar que arquivos existem + testar formatters puros (unit tests reais) |

#### Regras desta Sprint
- **NÃO** alterar nenhuma página existente
- **NÃO** remover nenhum código duplicado ainda
- Apenas criar os módulos que serão consumidos depois

---

### Sprint 1 — Primitivos UI (~4-5h)

**Objetivo:** Criar todos os componentes genéricos do Design System. Cada componente é independente, testável isoladamente, e não tem lógica de negócio.

**Critério de Pronto:** Cada componente exporta via index. Testes estruturais confirmam existência e props.

#### Tarefas

| # | Tarefa | Arquivo | Descrição |
|---|--------|---------|-----------|
| 1.1 | `Button` | `components/ui/Button.tsx` | 6 variantes (primary, secondary, danger, success, ghost, outline), 3 tamanhos, loading state com spinner, disabled, ícone, `type='button'\|'submit'`, `fullWidth` |
| 1.2 | `Input` | `components/ui/Input.tsx` | Label integrado, estado de erro (borda vermelha + mensagem), required com `*`, dica (hint), ícone, `disabled`. Prop `mask` para CPF/telefone/moeda que aplica máscara automaticamente |
| 1.3 | `Select` | `components/ui/Select.tsx` | Label, erro, required, disabled, opções `{value, label}[]`, placeholder "Selecione..." |
| 1.4 | `Textarea` | `components/ui/Textarea.tsx` | Label, erro, required, disabled, `maxLength` com contador de caracteres, `minLength` com indicador |
| 1.5 | `Badge` | `components/ui/Badge.tsx` | Variantes por cor semântica (gray, orange, amber, green, red, blue, purple), tamanhos sm/md |
| 1.6 | `Card` | `components/ui/Card.tsx` | Variantes: default, outlined, elevated. Props: `padding`, `noPadding` (para tabelas), `borderColor`, `className` |
| 1.7 | `Modal` | `components/ui/Modal.tsx` | Focus trap (tab cycle), fechar com ESC, click no overlay, tamanhos (sm/md/lg/xl), title, footer actions, `aria-modal`, `role="dialog"` |
| 1.8 | `Table` | `components/ui/Table.tsx` | Genérico com columns config, loading skeleton (3 rows), empty state, row click, sticky header, scroll horizontal mobile, `<caption>` acessível |
| 1.9 | `PageHeader` | `components/ui/PageHeader.tsx` | Título (h1 com ícone emoji), descrição, botão voltar (Link), slot de ações (direita), responsivo |
| 1.10 | `EmptyState` | `components/ui/EmptyState.tsx` | Ícone grande (emoji), título, descrição, botão de ação opcional |
| 1.11 | `LoadingState` | `components/ui/LoadingState.tsx` | 2 modos: `skeleton` (linhas pulsantes configuráveis) e `spinner` (central), prop `lines` para skeleton |
| 1.12 | `Alert` | `components/ui/Alert.tsx` | 4 variantes (info, success, warning, error), ícone automático, título opcional, dismissível |
| 1.13 | `Toast` + `ToastProvider` | `components/ui/Toast.tsx`, `ToastProvider.tsx` | Provider no layout root, hook `useToast()`, posição top-right, auto-dismiss, empilhável, tipos (success, error, warning, info), `aria-live="polite"` |
| 1.14 | `StatCard` | `components/ui/StatCard.tsx` | Ícone (emoji/componente), label, valor (formatado), cor do ícone de fundo, `href` opcional (link), borda lateral colorida |
| 1.15 | `Tabs` | `components/ui/Tabs.tsx` | Controlled: `activeTab`, `onTabChange`, `tabs: { key, label, count? }[]`. Renderiza conteúdo via `children` ou `render` prop. Estilo consistente com `bg-orange-500 text-white` ativo |
| 1.16 | `ConfirmDialog` | `components/ui/ConfirmDialog.tsx` | Baseado em `Modal`. Title, message, confirmLabel, cancelLabel, tipo (danger/warning/info), callback `onConfirm` |
| 1.17 | `FilterBar` | `components/ui/FilterBar.tsx` | Grid responsivo de filtros. Slots: busca (texto), data início, data fim, select customizado. Botão "Limpar filtros". Compacto em mobile |
| 1.18 | `Tooltip` | `components/ui/Tooltip.tsx` | Posição (top/right/bottom/left), trigger hover, aria-describedby |
| 1.19 | `Avatar` | `components/ui/Avatar.tsx` | Iniciais do nome, cor automática por hash, tamanhos sm/md/lg |
| 1.20 | Barrel export | `components/ui/index.ts` | Re-exportar todos |
| 1.21 | Testes | `__tests__/sprint-frontend-1.test.ts` | Verificar existência de todos os componentes + exports via barrel |

#### Detalhes de Implementação (exemplos)

**Button — Estados visuais:**
```
┌─────────────┬──────────────────────────────┐
│ primary     │ bg-orange-500 hover:bg-600   │
│ secondary   │ bg-orange-100 text-orange-800│
│ danger      │ bg-red-600 hover:bg-red-700  │
│ success     │ bg-green-600 hover:bg-700    │
│ ghost       │ text-gray-700 hover:bg-100   │
│ outline     │ border-2 border-orange-500   │
│ (loading)   │ opacity-50 pointer-events-no │
│ (disabled)  │ opacity-50 cursor-not-allowed│
└─────────────┴──────────────────────────────┘
```

**Modal — Estrutura HTML:**
```html
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="overlay" onClick={onClose} />
  <div class="panel" ref={panelRef}>
    <h2 id="modal-title">{title}</h2>
    <button aria-label="Fechar" onClick={onClose}>×</button>
    <div>{children}</div>
    {footer && <div class="footer">{footer}</div>}
  </div>
</div>
```

**Table — Skeleton Loading:**
```
┌─────────┬──────────┬─────────┐
│ ████░░░ │ ██████░  │ ███░░░░ │  ← skeleton row 1
│ █████░░ │ ████░░░  │ ██████░ │  ← skeleton row 2
│ ███░░░░ │ ███████░ │ █████░░ │  ← skeleton row 3
└─────────┴──────────┴─────────┘
```

#### Regras desta Sprint
- Componentes **NÃO sabem nada** sobre atendimentos, clientes, procedimentos
- Toda prop é genérica (cor, texto, callback)
- Acessibilidade é obrigatória em cada componente
- Nenhuma página é alterada

---

### Sprint 2 — Componentes de Domínio (~4-5h)

**Objetivo:** Criar componentes que encapsulam lógica de negócio usando os primitivos da Sprint 1 + utilitários da Sprint 0.

**Critério de Pronto:** Componentes de domínio usam exclusivamente componentes UI da Sprint 1. Testes confirmam.

#### Tarefas

| # | Tarefa | Arquivo | Descrição |
|---|--------|---------|-----------|
| 2.1 | `StatusBadge` | `components/domain/StatusBadge.tsx` | Usa `Badge` + `STATUS_CONFIG`/`ITEM_STATUS_CONFIG`. Props: `type` (atendimento\|item\|parcela), `status`. Mapeia automaticamente para cor e label |
| 2.2 | `StatusPipeline` | `components/domain/StatusPipeline.tsx` | Pipeline visual horizontal: etapas do atendimento com status ativo destacado. Usa cores de `STATUS_CONFIG`. Responsivo (horizontal desktop, vertical mobile) |
| 2.3 | `ClienteForm` | `components/domain/ClienteForm.tsx` | Formulário completo: nome, CPF (com máscara), telefone (com máscara), email, data nascimento, origem (select). Props: `initialData?` (para edição), `onSubmit`, `loading`. Usa `Input`, `Select`, `Button` da Sprint 1. Validação no submit |
| 2.4 | `ClienteCard` | `components/domain/ClienteCard.tsx` | Card resumo: nome, CPF formatado, telefone formatado, email, origem badge. Prop: `cliente`, `onClick?` |
| 2.5 | `ProcedimentoForm` | `components/domain/ProcedimentoForm.tsx` | Modal de formulário: nome, valor (moeda), tipo (select), comissão venda %, comissão execução %, por_dente (checkbox). Usa `Modal`, `Input`, `Select`, `Checkbox`, `Button` |
| 2.6 | `AtendimentoCard` | `components/domain/AtendimentoCard.tsx` | Card para listagem/kanban: cliente nome, status badge, data, total, qtd itens. Props: `atendimento`, `compact?` (para kanban) |
| 2.7 | `ItemAtendimentoRow` | `components/domain/ItemAtendimentoRow.tsx` | Linha de tabela para item: procedimento nome, executor nome, valor (moeda), status badge, dentes, ações (editar/remover). Composable — usado dentro de `Table` |
| 2.8 | `PagamentoForm` | `components/domain/PagamentoForm.tsx` | Formulário de pagamento: método (select), valor (moeda input), parcelas opcionais. Validação de valor > 0 e método obrigatório |
| 2.9 | `PagamentoDistribuicao` | `components/domain/PagamentoDistribuicao.tsx` | Distribuição do pagamento por itens: lista de itens com checkbox + valor input. Validação automática (soma = total). Barra de progresso |
| 2.10 | `ParcelasTable` | `components/domain/ParcelasTable.tsx` | Tabela de parcelas: nº, valor, vencimento, status. Badges para vencida/pendente/paga. Usa `Table` |
| 2.11 | `ProntuarioEditor` | `components/domain/ProntuarioEditor.tsx` | Textarea com contador do mínimo de caracteres, botão salvar, histórico de versões, loading state. Usa `Textarea`, `Button`, `Alert` |
| 2.12 | `AnexosGallery` | `components/domain/AnexosGallery.tsx` | Grid de thumbnails, upload com drag & drop, preview em modal, delete com confirm. Validação de tipo/tamanho. Usa `Modal`, `Button`, `ConfirmDialog`, `EmptyState` |
| 2.13 | `ComissoesResumo` | `components/domain/ComissoesResumo.tsx` | Tabela resumo por profissional: nome, total venda, total execução, total geral. Usa `Table`, `formatarMoeda` |
| 2.14 | `ViewModeToggle` | `components/domain/ViewModeToggle.tsx` | Toggle entre modos (kanban/lista, resumo/detalhes). Props: `options: {key, label, icon}[]`, `active`, `onChange`. Usa `Tabs` |
| 2.15 | Barrel export | `components/domain/index.ts` | Re-exportar todos |
| 2.16 | Testes | `__tests__/sprint-frontend-2.test.ts` | Estruturais + verifica que domain components importam de `components/ui` |

#### Regras desta Sprint
- Componentes de domínio **USAM** componentes UI, nunca replicam
- Toda formatação vem de `lib/utils/formatters`
- Todo mapa de status vem de `lib/constants/status`
- Nenhuma página é alterada

---

### Sprint 3 — Refatorar Páginas Simples (~5-6h)

**Objetivo:** Migrar as páginas de menor complexidade para usar os novos componentes. Eliminar código duplicado nelas.

**Critério de Pronto:** Páginas refatoradas usam componentes da Sprint 1-2. Nenhum `formatarMoeda` ou `STATUS_CONFIG` inline. Testes passam.

#### Tarefas

| # | Tarefa | Rota | O que Muda |
|---|--------|------|-----------|
| 3.1 | Login | `/login` | Trocar inputs por `Input`, botão por `Button` (com loading), erro por `Alert` |
| 3.2 | Clientes lista | `/clientes` | `PageHeader` + `Table` genérico + `Input` busca + `EmptyState` |
| 3.3 | Clientes novo | `/clientes/novo` | `PageHeader` + `ClienteForm` (extrai ~200 linhas para componente) |
| 3.4 | Clientes detalhe | `/clientes/[id]` | `PageHeader` + `ClienteForm` (modo edição) + `Table` histórico + `StatCard` |
| 3.5 | Procedimentos | `/procedimentos` | `PageHeader` + `Table` + `ProcedimentoForm` (modal) + `formatarMoeda` centralizado |
| 3.6 | Usuários | `/usuarios` | `PageHeader` + `Table` + `Modal` + `Input`/`Select` + `Badge` roles |
| 3.7 | Meus Procedimentos | `/meus-procedimentos` | `PageHeader` + `Table` + `StatusBadge` + `StatCard` + `Tabs` filtro + `formatarData` centralizado |
| 3.8 | Execução (fila) | `/execucao` | `PageHeader` + `Card` grid + `StatusBadge` + `EmptyState` + `Tabs` (meus/disponíveis) |
| 3.9 | Avaliação (fila) | `/avaliacao` | `PageHeader` + `Card` grid + `StatusBadge` + `EmptyState` |
| 3.10 | Atualizar Sidebar | `Sidebar.tsx` | Importar `MENU_ITEMS` de `lib/constants/navigation` em vez de definir inline |
| 3.11 | Atualizar Header | `Header.tsx` | Importar `MENU_ITEMS` + usar `Avatar` + trocar form senha por `Modal` + `Input` |
| 3.12 | Integrar Toast | `layout.tsx` | Adicionar `ToastProvider` no root layout |
| 3.13 | Remover código morto | `minhas-comissoes/` | Avaliar: remover se orphan, ou redirecionar para `/meus-procedimentos` |
| 3.14 | Testes | `__tests__/sprint-frontend-3.test.ts` | Verificar que páginas NÃO contêm mais funções duplicadas inline |

#### O que é eliminado desta Sprint

| Duplicação | Páginas afetadas | Ação |
|-----------|-----------------|------|
| `formatarMoeda` inline | 11 páginas | Importar de `lib/utils/formatters` |
| `formatarData` inline | 10 páginas | Importar de `lib/utils/formatters` |
| `STATUS_CONFIG` inline | 3 páginas | Importar de `lib/constants/status` |
| `origensOptions` inline | 2 páginas | Importar de `lib/constants/origens` |
| `menuItems` duplicado | 2 componentes | Importar de `lib/constants/navigation` |
| CPF/tel formatters | 2 páginas | Encapsulado em `ClienteForm` |
| Loading inconsistente | 14 páginas | Usar `LoadingState` |
| Erro inconsistente | 10 páginas | Usar `Alert` ou `Toast` |

#### Regras desta Sprint
- Manter funcionalidade 100% idêntica — é REFATORAÇÃO, não feature
- Testar cada página após migração antes de ir para a próxima
- Não alterar nenhuma API

---

### Sprint 4 — Refatorar Páginas Complexas (~6-8h)

**Objetivo:** Migrar as páginas mais complexas (as "big 5": pagamento, atendimento detalhe, avaliação detalhe, execução detalhe, home). Quebrar arquivos grandes em composições de componentes.

**Critério de Pronto:** Nenhum arquivo de página tem mais de 300 linhas. Toda lógica de UI usa componentes reutilizáveis.

#### Tarefas

| # | Tarefa | Rota | Linhas Antes → Depois | Estratégia |
|---|--------|------|----------------------|-----------|
| 4.1 | Home | `/` (page.tsx) | 554 → ~200 | Extrair cada variante de role para componente: `HomeAdmin.tsx`, `HomeAtendente.tsx`, `HomeDentista.tsx`. Cada um usa `StatCard`, `PageHeader`. Componente pai faz switch por `effectiveRole` |
| 4.2 | Atendimentos lista | `/atendimentos` | 301 → ~150 | `PageHeader` + `ViewModeToggle` + `Tabs` + `Table` (modo lista) + `AtendimentoCard` grid (modo kanban) + `StatusBadge` |
| 4.3 | Novo Atendimento | `/atendimentos/novo` | 389 → ~200 | Extrair fluxo normal e orto como sub-componentes. Usar `Select`, `Input`, `Button`, `Card`, `Alert` |
| 4.4 | Detalhe Atendimento | `/atendimentos/[id]` | 500 → ~250 | `StatusPipeline` + `Table` com `ItemAtendimentoRow` + `Modal` para adicionar item + ações como `Button` + `ConfirmDialog` para finalizar |
| 4.5 | Pagamento | `/atendimentos/[id]/pagamento` | 892 → ~300 | **Maior refatoração.** Quebrar em: (a) `PagamentoForm` para novo pagamento, (b) `PagamentoDistribuicao` para distribuir por itens, (c) `ParcelasTable` para parcelas, (d) `Table` para histórico. Página orquestra fluxo |
| 4.6 | Avaliação detalhe | `/avaliacao/[id]` | 524 → ~250 | Extrair: lista de procedimentos como `Table` com `ItemAtendimentoRow`, formulário "adicionar procedimento" como sub-componente, usar `SeletorDentes`, `Select`, `Button` |
| 4.7 | Execução detalhe | `/execucao/[id]` | 783 → ~300 | **Segunda maior.** Quebrar em: (a) `ProntuarioEditor`, (b) `AnexosGallery`, (c) info card com `Card` + `StatusBadge`, (d) ações com `Button` + `ConfirmDialog` |
| 4.8 | Dashboard | `/dashboard` | 465 → ~250 | Extrair charts como `BarChart`. Usar `StatCard`, `FilterBar`, `Table`, `Card` |
| 4.9 | Comissões | `/comissoes` | 332 → ~150 | `Tabs` + `ComissoesResumo` + `Table` detalhes + `FilterBar` + `StatCard` |
| 4.10 | Pagamentos visão geral | `/pagamentos` | 307 → ~150 | `Tabs` + `Table` (parcelas vencidas) + `Table` (pagamentos recentes) + `StatCard` |
| 4.11 | Testes | `__tests__/sprint-frontend-4.test.ts` | Verificar que nenhuma página excede 300 linhas. Verificar que as "big 5" usam componentes de domínio |

#### Estratégia de Decomposição (exemplo: Pagamento 892 → ~300)

```
ANTES (pagamento/page.tsx — 892 linhas):
  ├── State: 20 useState hooks
  ├── Fetch: 5 API calls
  ├── Forms: 2 formulários inline
  ├── Tables: 3 tabelas inline
  ├── Logic: distribuição, parcelas, validação
  └── JSX: ~600 linhas de template

DEPOIS (pagamento/page.tsx — ~300 linhas):
  ├── State: 8 useState hooks (orquestração)
  ├── Fetch: 5 API calls (mantém)
  ├── Componentes importados:
  │   ├── <PageHeader>             ~5 linhas
  │   ├── <StatCard> × 3           ~15 linhas
  │   ├── <PagamentoForm>          ~10 linhas (invocação)
  │   ├── <PagamentoDistribuicao>  ~10 linhas (invocação)
  │   ├── <ParcelasTable>          ~10 linhas (invocação)
  │   ├── <Table> (histórico)      ~30 linhas (columns config)
  │   └── <Alert>, <Toast>         ~5 linhas
  └── JSX: ~200 linhas de template (composição)
```

#### Regras desta Sprint
- Funcionalidade 100% idêntica — é REFATORAÇÃO
- Cada página é migrada e testada individualmente antes da próxima
- Se uma página > 300 linhas, extrair mais sub-componentes
- `confirm()` e `alert()` nativos → `ConfirmDialog` e `Toast`

---

### Sprint 5 — Polish, Acessibilidade e UX (~3-4h)

**Objetivo:** Polir toda a interface, garantir acessibilidade WCAG 2.1 AA, melhorar UX com micro-interações.

**Critério de Pronto:** Auditoria de acessibilidade sem erros críticos. UX consistente em todas as páginas.

#### Tarefas

| # | Tarefa | Descrição |
|---|--------|-----------|
| 5.1 | Skip-to-content | Adicionar `<a href="#main-content" class="sr-only focus:not-sr-only">Pular para conteúdo</a>` no `AppLayout` |
| 5.2 | `aria-label` em todos os botões de ícone | Header (🔑, hamburger), todos os botões emoji do app |
| 5.3 | `aria-live` no Toast | Para que screen readers anunciem notificações |
| 5.4 | Focus trap nos Modais | Verificar que Tab circula dentro, que foco retorna ao trigger ao fechar |
| 5.5 | Contraste de cores | Verificar e corrigir `text-orange-100` sobre fundos claros |
| 5.6 | `<caption>` em todas as tabelas | Adicionar prop `caption` no componente `Table` e usar em todas as instâncias |
| 5.7 | `<title>` por página | Usar `next/head` ou metadata export em cada page.tsx |
| 5.8 | Transições suaves | Adicionar `transition-all duration-200` em cards, botões hover, modal appear |
| 5.9 | Scroll to top | Ao navegar entre páginas, scroll para o topo |
| 5.10 | Responsive final | Testar todas as 20 telas em 360px, 768px, 1024px, 1440px |
| 5.11 | Empty states | Verificar que todas as listas têm `EmptyState` quando vazias |
| 5.12 | Error boundaries | Adicionar error boundary nas páginas para não crashar o app |
| 5.13 | Keyboard navigation | Testar Tab order em todas as páginas, verificar que Enter/Space ativa botões |
| 5.14 | Testes finais | `__tests__/sprint-frontend-5.test.ts` Acessibilidade + consistência + responsividade (estrutural) |

---

## 6. Estimativa de Esforço

| Sprint | Escopo | Horas Est. | Arquivos Criados | Arquivos Modificados |
|--------|--------|-----------|-----------------|---------------------|
| Sprint 0 | Fundação | 2-3h | ~10 | 0 |
| Sprint 1 | Primitivos UI | 4-5h | ~22 | 0 |
| Sprint 2 | Componentes Domínio | 4-5h | ~16 | 0 |
| Sprint 3 | Páginas Simples | 5-6h | ~1 (test) | ~14 |
| Sprint 4 | Páginas Complexas | 6-8h | ~5 (sub-comps) | ~10 |
| Sprint 5 | Polish/A11y | 3-4h | ~2 | ~25 |
| **Total** | | **24-31h** | **~56** | **~49** |

---

## 7. Métricas de Sucesso

| Métrica | Antes | Meta |
|---------|-------|------|
| Componentes reutilizáveis | 1 | 35+ |
| Duplicação `formatarMoeda` | 11 cópias | 0 |
| Duplicação `formatarData` | 10 cópias | 0 |
| Maior arquivo (linhas) | 892 | < 300 |
| Padrões de loading | 3 diferentes | 1 (`LoadingState`) |
| Padrões de erro | 2 diferentes | 1 (`Alert` / `Toast`) |
| Status colors inconsistentes | Sim | Não (centralizado) |
| Aria-labels em botões | 0 | 100% |
| Focus trap em modais | 0/3 | 3/3 |
| Testes frontend | 233 | 300+ |

---

## 8. Regras de Ouro

1. **Nunca duplicar** — se existe em 2+ lugares, deve ser componente ou utilitário
2. **Primitivo vs Domínio** — se não tem lógica de negócio, é `ui/`; se tem, é `domain/`
3. **Props, não hardcode** — cores, labels, tamanhos são sempre props ou constantes
4. **Acessibilidade não é opcional** — cada componente nasce acessível, nunca é adicionada depois
5. **Mobile-first sempre** — escrever para 360px, depois expandir com breakpoints
6. **Um componente, uma responsabilidade** — se faz 2 coisas, divida
7. **Testes a cada sprint** — não acumular dívida técnica
8. **Refatoração ≠ Feature** — nas Sprints 3-4, a funcionalidade deve ser IDÊNTICA ao antes

---

## 9. Ordem de Execução (Grafo de Dependências)

```
Sprint 0 (fundação)
  │
  │  ← Nenhuma dependência
  ▼
Sprint 1 (primitivos UI)
  │
  │  ← Depende APENAS de Sprint 0 (tokens CSS)
  │    (componentes UI são independentes entre si)
  ▼
Sprint 2 (componentes domínio)
  │
  │  ← Depende de Sprint 0 (utils, constants) + Sprint 1 (componentes UI)
  │    (componentes domínio são independentes entre si)
  ▼
Sprint 3 (páginas simples)
  │
  │  ← Depende de Sprints 0-2
  │    (cada página pode ser migrada independentemente)
  ▼
Sprint 4 (páginas complexas)
  │
  │  ← Depende de Sprints 0-2 + pode usar aprendizados da Sprint 3
  │    (cada página pode ser migrada independentemente)
  ▼
Sprint 5 (polish)
  │
  │  ← Depende de todas as sprints anteriores
  │    (mas cada tarefa é independente)
  ▼
  ✅ PRONTO
```

**Importante:** Sprints 3 e 4 podem ser executadas em PARALELO se necessário, pois cada página é migrada independentemente. A Sprint 5 deve ser a última pois faz ajustes finais em todo o app.

---

## 10. Checklist por Componente

Antes de considerar qualquer componente como "pronto":

- [ ] Props tipadas com TypeScript
- [ ] `'use client'` se usar hooks
- [ ] Props opcionais têm valores default
- [ ] Responsivo (funciona em 360px+)
- [ ] `aria-label` onde necessário
- [ ] `role` e `aria-*` attrs corretos
- [ ] Keyboard navigable (Tab, Enter, Escape)
- [ ] Exportado via barrel (`index.ts`)
- [ ] Sem hardcode de cores (usa Tailwind/tokens)
- [ ] Sem lógica de negócio (se for `ui/`)
- [ ] Testável isoladamente
