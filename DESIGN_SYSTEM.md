# Design System — Sorria Leste

> Guia de uso dos tokens, componentes e padrões de UI do sistema.

---

## 1. Tokens de Design

Todos os tokens vivem em `app/globals.css` dentro do bloco `@theme { ... }` (Tailwind v4).  
São acessíveis como classes Tailwind (ex: `bg-primary-500`, `text-success-600`, `shadow-md`).

### 1.1 Paleta de Cores

| Token | Uso | Exemplo Tailwind |
|-------|-----|-----------------|
| `primary-50..900` | Marca (laranja) — botões, links, destaques | `bg-primary-500`, `text-primary-700` |
| `neutral-50..900` | Texto, fundos, bordas neutras | `bg-neutral-100`, `text-neutral-600` |
| `success-50..800` | Ações positivas, status concluído | `bg-success-100`, `text-success-700` |
| `warning-50..800` | Alertas, status pendente | `bg-warning-100`, `text-warning-700` |
| `error-50..900` | Erros, ações destrutivas | `bg-error-100`, `text-error-600` |
| `info-50..800` | Informação, dicas | `bg-info-100`, `text-info-600` |

### 1.2 Superfícies & Texto

| Token | Valor | Uso |
|-------|-------|-----|
| `surface` | `#ffffff` | Fundo de cards |
| `surface-secondary` | `#fafaf9` | Fundo alternativo (headers de tabela) |
| `surface-muted` | `#f5f5f4` | Fundo de áreas desabilitadas |
| `background` | `#fff7ed` | Fundo geral da app (laranja claro) |
| `foreground` | `#1c1917` | Texto principal |
| `muted` | `#78716c` | Texto secundário / placeholder |
| `border` | `#e7e5e4` | Bordas padrão |
| `border-light` | `#ffedd5` | Bordas sutis / decorativas |
| `ring` | `#f97316` | Cor do focus ring |

### 1.3 Tipografia

| Token | Tamanho | Uso |
|-------|---------|-----|
| `heading-1` | 2rem (32px) | Título de página |
| `heading-2` | 1.5rem (24px) | Seção principal |
| `heading-3` | 1.25rem (20px) | Subseção |
| `heading-4` | 1.125rem (18px) | Card header |
| `body` | 1rem (16px) | Texto padrão |
| `body-sm` | 0.875rem (14px) | Texto secundário |
| `caption` | 0.75rem (12px) | Legenda, metadata |
| `label` | 0.875rem (14px) | Labels de formulário |

**Line heights:** heading = 1.25, body = 1.5, caption = 1.4  
**Pesos:** normal (400), medium (500), semibold (600), bold (700)

### 1.4 Sombras

| Token | Uso |
|-------|-----|
| `shadow-xs` | Bordas sutis |
| `shadow-sm` | Cards flat |
| `shadow-md` | Cards padrão |
| `shadow-lg` | Dropdowns, popovers |
| `shadow-xl` | Modais |

### 1.5 Z-index

| Token | Valor | Uso |
|-------|-------|-----|
| `z-index-dropdown` | 1000 | Dropdowns |
| `z-index-sticky` | 1020 | Headers fixos |
| `z-index-modal-backdrop` | 1040 | Overlay do modal |
| `z-index-modal` | 1050 | Conteúdo do modal |
| `z-index-toast` | 1100 | Toasts (sempre visíveis) |

### 1.6 Transições

| Token | Valor | Uso |
|-------|-------|-----|
| `transition-duration-fast` | 150ms | Hover, focus |
| `transition-duration-normal` | 200ms | Abertura de menus |
| `transition-duration-slow` | 300ms | Modais, sidebars |
| `transition-timing-function-smooth` | cubic-bezier(0.4, 0, 0.2, 1) | Todas as transições |

### 1.7 Breakpoints

| Nome | Largura | Dispositivo |
|------|---------|-------------|
| `sm` | 640px | Smartphone landscape |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape / desktop pequeno |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Tela grande |

**Abordagem:** Mobile-first. Escreva estilos para 360px+, use breakpoints para expandir.

---

## 2. Hierarquia de Componentes

```
components/
├── ui/          ← Primitivos genéricos (sem lógica de negócio)
├── domain/      ← Componentes com lógica de negócio
├── layout/      ← Estrutura da app (AppLayout, Header, Sidebar)
└── charts/      ← Gráficos do Dashboard
```

### 2.1 Regra de Importação

```
pages → domain/ → ui/
           ↓        ↓
       lib/constants + lib/utils
```

- `ui/` **nunca** importa de `domain/` ou páginas
- `domain/` importa de `ui/` e `lib/`
- Páginas importam de `domain/`, `ui/` e `lib/`

### 2.2 Componentes UI (`components/ui/`)

| Componente | Descrição | Props Principais |
|------------|-----------|-----------------|
| `Button` | Botão com variantes | `variant`, `size`, `loading`, `disabled`, `icon` |
| `Input` | Input com label e erro | `label`, `name`, `error`, `mask`, `required` |
| `Select` | Select com label | `label`, `options`, `error`, `required` |
| `Textarea` | Textarea com contador | `label`, `maxLength`, `error`, `required` |
| `Checkbox` | Checkbox com label | `label`, `checked`, `onChange` |
| `Badge` | Badge de status | `variant`, `size`, `children` |
| `Card` | Container de conteúdo | `variant`, `noPadding`, `className` |
| `Modal` | Modal acessível | `isOpen`, `onClose`, `title`, `size` |
| `Table` | Tabela genérica | `columns`, `data`, `loading`, `emptyMessage` |
| `PageHeader` | Cabeçalho de página | `title`, `icon`, `backHref`, `actions` |
| `EmptyState` | Estado vazio | `icon`, `title`, `description`, `onAction` |
| `LoadingState` | Loading (spinner/skeleton) | `mode`, `lines`, `text` |
| `Alert` | Alerta contextual | `type`, `title`, `dismissible` |
| `Toast` | Notificação temporária | Via `useToast()` hook |
| `StatCard` | Card de métrica | `icon`, `label`, `value`, `color` |
| `Tabs` | Abas | `activeTab`, `onTabChange`, `tabs` |
| `FilterBar` | Barra de filtros | `onSearch`, `onDateChange`, `onClear` |
| `ConfirmDialog` | Diálogo de confirmação | `title`, `message`, `onConfirm`, `type` |
| `Tooltip` | Tooltip acessível | `content`, `position` |
| `Avatar` | Avatar com iniciais | `name`, `size` |
| `Spinner` | Spinner inline | `size`, `className` |
| `SearchInput` | Busca com debounce | `onSearch`, `placeholder`, `debounceMs` |
| `FormField` | Wrapper label+input+erro | `label`, `error`, `hint`, `required` |
| `Breadcrumb` | Navegação hierárquica | `items: { label, href }[]` |
| `Pagination` | Paginação | `page`, `totalPages`, `onPageChange` |
| `Divider` | Separador visual | `label`, `orientation` |

### 2.3 Componentes de Domínio (`components/domain/`)

| Componente | Descrição |
|------------|-----------|
| `StatusBadge` | Badge de status (atendimento/item/parcela) com mapa centralizado |
| `StatusPipeline` | Pipeline visual do fluxo de atendimento |
| `ClienteForm` | Formulário de cliente (novo/edição) com máscaras |
| `ClienteCard` | Card resumo de cliente |
| `ProcedimentoForm` | Formulário de procedimento em modal |
| `AtendimentoCard` | Card de atendimento para listagem |
| `ItemAtendimentoRow` | Linha de item de atendimento |
| `PagamentoForm` | Formulário de pagamento |
| `PagamentoDistribuicao` | Distribuição de pagamento por itens |
| `ParcelasTable` | Tabela de parcelas |
| `ProntuarioEditor` | Editor de prontuário |
| `AnexosGallery` | Galeria de anexos com upload |
| `ComissoesResumo` | Resumo de comissões por profissional |
| `ViewModeToggle` | Toggle entre modos de visualização |

---

## 3. Padrões de UI/UX

### 3.1 Estados de Página

Toda página deve renderizar 4 estados:

| Estado | Componente | Comportamento |
|--------|-----------|--------------|
| Loading | `<LoadingState>` | Skeleton ou spinner enquanto carrega |
| Empty | `<EmptyState>` | Ícone + mensagem + ação quando sem dados |
| Error | `<Alert type="error">` | Mensagem com botão de retry |
| Success | Conteúdo normal | Dados renderizados |

### 3.2 Feedback ao Usuário

| Situação | Feedback |
|----------|---------|
| Ação bem-sucedida | `toast.success()` — auto-dismiss 4s |
| Erro de ação | `toast.error()` — dismiss manual |
| Erro de formulário | Inline abaixo do campo (borda vermelha + mensagem) |
| Ação destrutiva | `<ConfirmDialog>` antes de executar |
| Progresso de fluxo | `<StatusPipeline>` visual |

### 3.3 Hierarquia de Ações

1. **Ação principal** — `Button variant="primary"` (uma por tela)
2. **Ação secundária** — `Button variant="secondary"` ou `variant="ghost"`
3. **Ação destrutiva** — `Button variant="danger"` + `ConfirmDialog`

### 3.4 Acessibilidade

- Todo input tem `<label>` associado via `htmlFor`
- Botões com ícone têm `aria-label`
- Modais têm `aria-modal`, `role="dialog"`, focus trap
- Toasts usam `aria-live="polite"`
- Focus visível em todos os interativos (`:focus-visible`)
- Skip-to-content link no AppLayout
- Contraste mínimo: 4.5:1 texto, 3:1 componentes
- Tab navega, Enter/Space ativa, Escape fecha modais

---

## 4. Utilitários (`lib/`)

### 4.1 Formatadores (`lib/utils/formatters.ts`)

| Função | Descrição |
|--------|-----------|
| `formatarMoeda(valor)` | `1234.5` → `R$ 1.234,50` |
| `formatarData(data)` | `2026-03-20` → `20/03/2026` |
| `formatarDataHora(data)` | `2026-03-20T10:30` → `20/03/2026 10:30` |
| `formatarCPF(cpf)` | `12345678900` → `123.456.789-00` |
| `formatarTelefone(tel)` | `11999998888` → `(11) 99999-8888` |

### 4.2 Validadores (`lib/utils/validators.ts`)

| Função | Descrição |
|--------|-----------|
| `validarCPF(cpf)` | Valida dígitos verificadores |
| `validarEmail(email)` | Regex padrão |
| `validarTelefone(tel)` | 10-11 dígitos |

### 4.3 Máscaras (`lib/utils/masks.ts`)

| Função | Descrição |
|--------|-----------|
| `maskCPF(value)` | Aplica máscara `___.___.___-__` |
| `maskTelefone(value)` | Aplica máscara `(__) _____-____` |
| `maskMoeda(value)` | Aplica máscara de moeda BRL |

### 4.4 Constantes (`lib/constants/`)

| Arquivo | Exports |
|---------|---------|
| `status.ts` | `STATUS_CONFIG`, `ITEM_STATUS_CONFIG`, `PROXIMOS_STATUS`, `STATUS_ORDER` |
| `origens.ts` | `ORIGENS_OPTIONS` |
| `roles.ts` | `ROLE_LABELS`, `ROLE_COLORS` |
| `navigation.ts` | `MENU_ITEMS` |
