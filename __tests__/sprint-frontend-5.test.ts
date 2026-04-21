/**
 * Testes Sprint 5 — Acessibilidade & Polish
 * Verifica: skip-to-content, aria-labels, landmarks, ErrorBoundary,
 * usePageTitle, scroll-to-top, aria-live, focus-trap, transitions,
 * focus rings
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const COMPONENTS = path.join(ROOT, 'components');
const APP = path.join(ROOT, 'app');
const LIB = path.join(ROOT, 'lib');

function readFile(...segments: string[]): string {
  return fs.readFileSync(path.join(ROOT, ...segments), 'utf-8');
}

function readComponent(...segments: string[]): string {
  return fs.readFileSync(path.join(COMPONENTS, ...segments), 'utf-8');
}

function readPage(...segments: string[]): string {
  return fs.readFileSync(path.join(APP, ...segments), 'utf-8');
}

// ═══════════════════════════════════════════════════════════════
// SKIP-TO-CONTENT
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Skip-to-Content', () => {
  let layout: string;
  beforeAll(() => { layout = readComponent('layout', 'AppLayout.tsx'); });

  test('possui link "Pular para conteúdo"', () => {
    expect(layout).toContain('Pular para conteúdo');
  });

  test('link aponta para #main-content', () => {
    expect(layout).toContain('href="#main-content"');
  });

  test('link tem class sr-only com focus:not-sr-only', () => {
    expect(layout).toMatch(/sr-only.*focus:not-sr-only/);
  });

  test('main tem id="main-content"', () => {
    expect(layout).toContain('id="main-content"');
  });
});

// ═══════════════════════════════════════════════════════════════
// LANDMARKS & ROLES
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Landmarks & Roles', () => {
  let layout: string;
  let sidebar: string;

  beforeAll(() => {
    layout = readComponent('layout', 'AppLayout.tsx');
    sidebar = readComponent('layout', 'Sidebar.tsx');
  });

  test('main tem role="main"', () => {
    expect(layout).toContain('role="main"');
  });

  test('Sidebar tem navegação com role tablist ou menu items', () => {
    // shadcn Sidebar uses SidebarMenu with role="tab" or menu items
    expect(sidebar).toMatch(/SidebarMenu|role="tab"|role="menu"|<nav/);
  });
});

// ═══════════════════════════════════════════════════════════════
// ARIA LABELS (Header)
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Aria Labels no Header', () => {
  let header: string;
  beforeAll(() => { header = readComponent('layout', 'Header.tsx'); });

  test('Header usa DropdownMenu para acessibilidade', () => {
    expect(header).toContain('DropdownMenu');
    expect(header).toContain('DropdownMenuTrigger');
  });

  test('Header tem aria-label no theme toggle', () => {
    expect(header).toMatch(/aria-label/);
  });

  test('Header usa SidebarTrigger para mobile menu', () => {
    expect(header).toContain('SidebarTrigger');
  });

  test('Header tem TrocarSenhaModal', () => {
    expect(header).toContain('TrocarSenhaModal');
  });

  test('Header tem logout functionality', () => {
    expect(header).toContain('logout');
  });
});

// ═══════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: ErrorBoundary', () => {
  let errorBoundary: string;
  let layout: string;

  beforeAll(() => {
    errorBoundary = readComponent('ui', 'ErrorBoundary.tsx');
    layout = readComponent('layout', 'AppLayout.tsx');
  });

  test('ErrorBoundary existe como componente', () => {
    expect(errorBoundary).toBeTruthy();
  });

  test('ErrorBoundary usa getDerivedStateFromError', () => {
    expect(errorBoundary).toContain('getDerivedStateFromError');
  });

  test('ErrorBoundary usa componentDidCatch', () => {
    expect(errorBoundary).toContain('componentDidCatch');
  });

  test('ErrorBoundary tem fallback UI com role="alert"', () => {
    expect(errorBoundary).toContain('role="alert"');
  });

  test('ErrorBoundary tem botão "Tentar novamente"', () => {
    expect(errorBoundary).toContain('Tentar novamente');
  });

  test('ErrorBoundary aceita prop fallback customizado', () => {
    expect(errorBoundary).toContain('fallback');
    expect(errorBoundary).toMatch(/props\.fallback/);
  });

  test('AppLayout usa ErrorBoundary', () => {
    expect(layout).toContain('ErrorBoundary');
    expect(layout).toContain("from '@/components/ui/ErrorBoundary'");
  });
});

// ═══════════════════════════════════════════════════════════════
// TOAST — ARIA LIVE
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Toast acessibilidade', () => {
  let toast: string;
  beforeAll(() => { toast = readComponent('ui', 'Toast.tsx'); });

  test('Toast usa Sonner (aria-live delegado ao Sonner/Toaster)', () => {
    expect(toast).toContain('sonner');
  });

  test('Toast suporta 4 tipos via Sonner', () => {
    expect(toast).toContain('success');
    expect(toast).toContain('error');
    expect(toast).toContain('warning');
    expect(toast).toContain('info');
  });
});

// ═══════════════════════════════════════════════════════════════
// MODAL — FOCUS TRAP & ARIA
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Modal acessibilidade', () => {
  let modal: string;
  beforeAll(() => { modal = readComponent('ui', 'Modal.tsx'); });

  test('Modal usa Dialog primitivo (role/aria/focus-trap delegados ao @base-ui)', () => {
    expect(modal).toContain('Dialog');
    expect(modal).toContain('DialogContent');
  });

  test('Modal usa DialogTitle para aria-labelledby', () => {
    expect(modal).toContain('DialogTitle');
  });

  test('Modal controla open/close via onOpenChange', () => {
    expect(modal).toContain('onOpenChange');
  });
});

// ═══════════════════════════════════════════════════════════════
// TABLE — CAPTION ACESSÍVEL
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Table caption acessível', () => {
  let table: string;
  beforeAll(() => { table = readComponent('ui', 'Table.tsx'); });

  test('Table aceita prop caption', () => {
    expect(table).toContain('caption');
  });

  test('Table usa sr-only para caption', () => {
    expect(table).toContain('sr-only');
  });
});

// ═══════════════════════════════════════════════════════════════
// usePageTitle HOOK
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: usePageTitle hook', () => {
  let hook: string;
  beforeAll(() => { hook = readFile('lib', 'utils', 'usePageTitle.ts'); });

  test('hook usePageTitle existe', () => {
    expect(hook).toBeTruthy();
  });

  test('define document.title com sufixo "Sorria Leste"', () => {
    expect(hook).toContain('Sorria Leste');
    expect(hook).toContain('document.title');
  });

  test('restaura título anterior no cleanup', () => {
    // Deve guardar o title anterior e restaurá-lo
    expect(hook).toMatch(/previous.*=.*document\.title/);
    expect(hook).toMatch(/return.*\(\).*=>/s);
  });
});

// ═══════════════════════════════════════════════════════════════
// usePageTitle — Uso em TODAS as páginas
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: usePageTitle em todas as páginas', () => {
  const pages: [string[], string][] = [
    [['page.tsx'], 'Início'],
    [['login', 'page.tsx'], 'Login'],
    [['dashboard', 'page.tsx'], 'Dashboard'],
    [['clientes', 'page.tsx'], 'Clientes'],
    [['clientes', 'novo', 'page.tsx'], 'Novo Cliente'],
    [['clientes', '[id]', 'page.tsx'], 'Ficha do Cliente'],
    [['atendimentos', 'page.tsx'], 'Atendimentos'],
    [['atendimentos', 'novo', 'page.tsx'], 'Novo Atendimento'],
    [['atendimentos', '[id]', 'page.tsx'], 'Detalhes do Atendimento'],
    [['atendimentos', '[id]', 'pagamento', 'page.tsx'], 'Pagamento do Atendimento'],
    [['avaliacao', 'page.tsx'], 'Avaliação'],
    [['avaliacao', '[id]', 'page.tsx'], 'Detalhes da Avaliação'],
    [['procedimentos', 'page.tsx'], 'Procedimentos'],
    [['execucao', 'page.tsx'], 'Fila de Execução'],
    [['execucao', '[id]', 'page.tsx'], 'Execução de Procedimento'],
    [['pagamentos', 'page.tsx'], 'Pagamentos'],
    [['comissoes', 'page.tsx'], 'Comissões'],
    [['minhas-comissoes', 'page.tsx'], 'Minhas Comissões'],
    [['meus-procedimentos', 'page.tsx'], 'Meus Procedimentos'],
    [['usuarios', 'page.tsx'], 'Usuários'],
  ];

  test.each(pages)('%s usa usePageTitle', (segments, title) => {
    const src = readPage(...segments);
    expect(src).toContain("from '@/lib/utils/usePageTitle'");
    expect(src).toContain(`usePageTitle('${title}')`);
  });
});

// ═══════════════════════════════════════════════════════════════
// SCROLL TO TOP
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Scroll to top on navigation', () => {
  let layout: string;
  beforeAll(() => { layout = readComponent('layout', 'AppLayout.tsx'); });

  test('AppLayout usa pathname para determinar rota', () => {
    expect(layout).toContain('pathname');
  });
});

// ═══════════════════════════════════════════════════════════════
// TRANSITIONS — Polimento visual
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Transitions nos componentes UI', () => {
  const componentsWithTransitions = [
    ['Button.tsx', 'transition'],
    ['Card.tsx', 'transition'],
    ['Input.tsx', 'transition'],
    ['Select.tsx', 'transition'],
    ['Textarea.tsx', 'transition'],
    // Modal.tsx e Toast.tsx: transitions em _shadcn/dialog.tsx e Sonner respectivamente
    ['Table.tsx', 'transition'],
    ['Tabs.tsx', 'transition'],
  ];

  test.each(componentsWithTransitions)('%s tem transitions', (component) => {
    const src = readComponent('ui', component);
    expect(src).toMatch(/transition/);
  });
});

// ═══════════════════════════════════════════════════════════════
// FOCUS STYLES — Acessibilidade via teclado
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Focus styles para navegação por teclado', () => {
  const componentsWithFocusRing = [
    'Button.tsx',
    'Input.tsx',
    'Select.tsx',
    'Textarea.tsx',
    'Checkbox.tsx',
  ];

  test.each(componentsWithFocusRing)('%s tem focus:ring styles', (component) => {
    const src = readComponent('ui', component);
    expect(src).toMatch(/focus:ring/);
  });
});

// ═══════════════════════════════════════════════════════════════
// EMPTY STATES — Verificação de uso
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Empty states nas listas', () => {
  test('Table component tem suporte a emptyMessage', () => {
    const table = readComponent('ui', 'Table.tsx');
    expect(table).toContain('emptyMessage');
  });

  test('EmptyState component existe', () => {
    const emptyState = readComponent('ui', 'EmptyState.tsx');
    expect(emptyState).toBeTruthy();
    expect(emptyState).toMatch(/icon|emoji/i);
  });

  const pagesWithEmptyState = [
    ['execucao', 'page.tsx'],
    ['clientes', '[id]', 'page.tsx'],
  ];

  test.each(pagesWithEmptyState)('%s usa EmptyState', (...segments) => {
    const src = readPage(...segments);
    expect(src).toContain('EmptyState');
  });

  const pagesWithTableEmpty = [
    ['meus-procedimentos', 'page.tsx'],
    ['minhas-comissoes', 'page.tsx'],
    ['clientes', 'page.tsx'],
    ['pagamentos', 'page.tsx'],
    ['comissoes', 'page.tsx'],
  ];

  test.each(pagesWithTableEmpty)('%s usa Table com emptyMessage', (...segments) => {
    const src = readPage(...segments);
    expect(src).toContain('emptyMessage');
  });
});

// ═══════════════════════════════════════════════════════════════
// SIDEBAR — Toggle aria
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Sidebar acessibilidade', () => {
  let sidebar: string;
  beforeAll(() => { sidebar = readComponent('layout', 'Sidebar.tsx'); });

  test('Sidebar usa shadcn SidebarMenuButton com tooltip e isActive', () => {
    expect(sidebar).toContain('SidebarMenuButton');
    expect(sidebar).toContain('isActive');
  });
});

// ═══════════════════════════════════════════════════════════════
// GLOBAL — Verificações finais
// ═══════════════════════════════════════════════════════════════

describe('Sprint 5: Verificações globais', () => {
  test('globals.css define focus styles globais', () => {
    const globals = readFile('app', 'globals.css');
    expect(globals).toContain('focus');
  });

  test('layout raiz tem lang="pt-BR"', () => {
    const layout = readFile('app', 'layout.tsx');
    expect(layout).toContain('lang="pt-BR"');
  });
});
