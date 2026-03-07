/**
 * Testes Sprint 3 — Refatoração de Páginas Simples
 * Verifica que as páginas agora usam os componentes centralizados das Sprints 0/1/2
 * e NÃO contêm mais definições inline/duplicadas.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.join(__dirname, '..', 'app');
const LAYOUT_DIR = path.join(__dirname, '..', 'components', 'layout');

function readPage(...segments: string[]): string {
  return fs.readFileSync(path.join(APP_DIR, ...segments), 'utf-8');
}

function readLayout(name: string): string {
  return fs.readFileSync(path.join(LAYOUT_DIR, name), 'utf-8');
}

// ─── Login ──────────────────────────────────────────────────────

describe('Sprint 3: login/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('login', 'page.tsx'); });

  test('usa Input do Sprint 1', () => {
    expect(src).toContain("from '@/components/ui/Input'");
  });
  test('usa Button do Sprint 1', () => {
    expect(src).toContain("from '@/components/ui/Button'");
  });
  test('usa Alert do Sprint 1', () => {
    expect(src).toContain("from '@/components/ui/Alert'");
  });
  test('não tem <input inline', () => {
    // Login deveria usar Input component, não <input> raw
    // Mas verificamos que NÃO tem formData com handleChange inlines de email/senha
    // A page pode ter e.preventDefault, mas não deve duplicar classes.
    expect(src).not.toMatch(/className=".*border.*rounded.*px-.*py-/);
  });
});

// ─── Clientes ───────────────────────────────────────────────────

describe('Sprint 3: clientes/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('clientes', 'page.tsx'); });

  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });
  test('usa Table do Sprint 1', () => {
    expect(src).toContain('Table');
  });
  test('usa Input do Sprint 1', () => {
    expect(src).toContain('Input');
  });
  test('usa Button do Sprint 1', () => {
    expect(src).toContain('Button');
  });
  test('usa formatarCPF do Sprint 0', () => {
    expect(src).toContain('formatarCPF');
    expect(src).toContain("from '@/lib/utils/formatters'");
  });
  test('usa formatarTelefone do Sprint 0', () => {
    expect(src).toContain('formatarTelefone');
  });
  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
  test('não define formatarCPF localmente', () => {
    expect(src).not.toMatch(/function formatarCPF/);
  });
  test('não define formatarTelefone localmente', () => {
    expect(src).not.toMatch(/function formatarTelefone/);
  });
});

// ─── Clientes / Novo ───────────────────────────────────────────

describe('Sprint 3: clientes/novo/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('clientes', 'novo', 'page.tsx'); });

  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });
  test('usa Card do Sprint 1', () => {
    expect(src).toContain('Card');
  });
  test('usa ClienteForm do Sprint 2', () => {
    expect(src).toContain('ClienteForm');
    expect(src).toContain("from '@/components/domain/ClienteForm'");
  });
  test('não define origensOptions localmente', () => {
    expect(src).not.toMatch(/const origensOptions/);
  });
  test('não define handleCpfChange localmente', () => {
    expect(src).not.toMatch(/handleCpfChange/);
  });
  test('não define handleTelChange localmente', () => {
    expect(src).not.toMatch(/handleTelefoneChange/);
  });
  test('arquivo tem menos de 100 linhas (refatoração efetiva)', () => {
    const lines = src.split('\n').length;
    expect(lines).toBeLessThan(100);
  });
});

// ─── Clientes / [id] (detalhe + edição) ────────────────────────

describe('Sprint 3: clientes/[id]/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('clientes', '[id]', 'page.tsx'); });

  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });
  test('usa Card do Sprint 1', () => {
    expect(src).toContain('Card');
  });
  test('usa Button do Sprint 1', () => {
    expect(src).toContain('Button');
  });
  test('usa Alert do Sprint 1', () => {
    expect(src).toContain('Alert');
  });
  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
  test('usa EmptyState', () => {
    expect(src).toContain('EmptyState');
  });
  test('usa ClienteForm do Sprint 2', () => {
    expect(src).toContain('ClienteForm');
    expect(src).toContain("from '@/components/domain'");
  });
  test('usa formatarData do Sprint 0', () => {
    expect(src).toContain('formatarData');
    expect(src).toContain("from '@/lib/utils/formatters'");
  });
  test('usa formatarCPF do Sprint 0', () => {
    expect(src).toContain('formatarCPF');
  });
  test('usa formatarTelefone do Sprint 0', () => {
    expect(src).toContain('formatarTelefone');
  });
  test('usa getOrigemLabel do Sprint 0', () => {
    expect(src).toContain('getOrigemLabel');
    expect(src).toContain("from '@/lib/constants/origens'");
  });
  test('não define origensOptions localmente', () => {
    expect(src).not.toMatch(/const origensOptions/);
  });
  test('não define getOrigemLabel localmente', () => {
    expect(src).not.toMatch(/function getOrigemLabel/);
  });
  test('não define handleCpfChange localmente', () => {
    expect(src).not.toMatch(/handleCpfChange/);
  });
  test('não define handleTelefoneChange localmente', () => {
    expect(src).not.toMatch(/handleTelefoneChange/);
  });
  test('não define formatDate localmente', () => {
    expect(src).not.toMatch(/function formatDate/);
  });
});

// ─── Procedimentos ──────────────────────────────────────────────

describe('Sprint 3: procedimentos/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('procedimentos', 'page.tsx'); });

  test('importa componentes do barrel @/components/ui', () => {
    expect(src).toContain("from '@/components/ui'");
  });
  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });
  test('usa Button do Sprint 1', () => {
    expect(src).toContain('Button');
  });
  test('usa Input do Sprint 1', () => {
    expect(src).toContain('Input');
  });
  test('usa Checkbox do Sprint 1', () => {
    expect(src).toContain('Checkbox');
  });
  test('usa Modal do Sprint 1', () => {
    expect(src).toContain('Modal');
  });
  test('usa Badge do Sprint 1', () => {
    expect(src).toContain('Badge');
  });
  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
  test('usa formatarMoeda do Sprint 0', () => {
    expect(src).toContain('formatarMoeda');
    expect(src).toContain("from '@/lib/utils/formatters'");
  });
  test('não define formatarMoeda localmente', () => {
    expect(src).not.toMatch(/function formatarMoeda/);
    expect(src).not.toMatch(/const formatarMoeda/);
  });
});

// ─── Usuários ───────────────────────────────────────────────────

describe('Sprint 3: usuarios/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('usuarios', 'page.tsx'); });

  test('importa componentes do barrel @/components/ui', () => {
    expect(src).toContain("from '@/components/ui'");
  });
  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });
  test('usa Card do Sprint 1', () => {
    expect(src).toContain('Card');
  });
  test('usa Button do Sprint 1', () => {
    expect(src).toContain('Button');
  });
  test('usa Input do Sprint 1', () => {
    expect(src).toContain('Input');
  });
  test('usa Select do Sprint 1', () => {
    expect(src).toContain('Select');
  });
  test('usa Badge do Sprint 1', () => {
    expect(src).toContain('Badge');
  });
  test('usa ROLE_LABELS_DESCRITIVOS do Sprint 0', () => {
    expect(src).toContain('ROLE_LABELS_DESCRITIVOS');
    expect(src).toContain("from '@/lib/constants/roles'");
  });
  test('não define roleLabels localmente', () => {
    expect(src).not.toMatch(/const roleLabels\s*[:=]/);
  });
});

// ─── Meus Procedimentos ────────────────────────────────────────

describe('Sprint 3: meus-procedimentos/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('meus-procedimentos', 'page.tsx'); });

  test('importa componentes do barrel @/components/ui', () => {
    expect(src).toContain("from '@/components/ui'");
  });
  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });
  test('usa StatCard do Sprint 1', () => {
    expect(src).toContain('StatCard');
  });
  test('usa Tabs do Sprint 1', () => {
    expect(src).toContain('Tabs');
  });
  test('usa StatusBadge do Sprint 2', () => {
    expect(src).toContain('StatusBadge');
    expect(src).toContain("from '@/components/domain'");
  });
  test('usa formatarData do Sprint 0', () => {
    expect(src).toContain('formatarData');
    expect(src).toContain("from '@/lib/utils/formatters'");
  });
  test('usa EmptyState do Sprint 1', () => {
    expect(src).toContain('EmptyState');
  });
  test('não define formatarData localmente', () => {
    expect(src).not.toMatch(/function formatarData/);
    expect(src).not.toMatch(/const formatarData/);
  });
});

// ─── Execução ───────────────────────────────────────────────────

describe('Sprint 3: execucao/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('execucao', 'page.tsx'); });

  test('importa componentes do barrel @/components/ui', () => {
    expect(src).toContain("from '@/components/ui'");
  });
  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });
  test('usa Card do Sprint 1', () => {
    expect(src).toContain('Card');
  });
  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
  test('usa EmptyState', () => {
    expect(src).toContain('EmptyState');
  });
  test('usa StatusBadge do Sprint 2', () => {
    expect(src).toContain('StatusBadge');
    expect(src).toContain("from '@/components/domain'");
  });
  test('não define getStatusBadge localmente', () => {
    expect(src).not.toMatch(/function getStatusBadge/);
    expect(src).not.toMatch(/const getStatusBadge/);
  });
});

// ─── Avaliação ──────────────────────────────────────────────────

describe('Sprint 3: avaliacao/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('avaliacao', 'page.tsx'); });

  test('importa componentes do barrel @/components/ui', () => {
    expect(src).toContain("from '@/components/ui'");
  });
  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });
  test('usa Card do Sprint 1', () => {
    expect(src).toContain('Card');
  });
  test('usa Badge do Sprint 1', () => {
    expect(src).toContain('Badge');
  });
  test('usa Button do Sprint 1', () => {
    expect(src).toContain('Button');
  });
  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
  test('usa Alert', () => {
    expect(src).toContain('Alert');
  });
  test('usa formatarDataHora do Sprint 0', () => {
    expect(src).toContain('formatarDataHora');
    expect(src).toContain("from '@/lib/utils/formatters'");
  });
  test('não define formatarData localmente', () => {
    expect(src).not.toMatch(/function formatarData/);
    expect(src).not.toMatch(/const formatarData/);
  });
});

// ─── Layout (Sidebar) ──────────────────────────────────────────

describe('Sprint 3: Sidebar centraliza MENU_ITEMS', () => {
  let src: string;
  beforeAll(() => { src = readLayout('Sidebar.tsx'); });

  test('importa MENU_ITEMS de @/lib/constants/navigation', () => {
    expect(src).toContain('MENU_ITEMS');
    expect(src).toContain("from '@/lib/constants/navigation'");
  });
  test('não define menuItems localmente', () => {
    expect(src).not.toMatch(/const menuItems\s*[:=]/);
  });
  test('não define MenuItem interface localmente', () => {
    expect(src).not.toMatch(/interface MenuItem/);
  });
});

// ─── Layout (Header) ───────────────────────────────────────────

describe('Sprint 3: Header centraliza MENU_ITEMS, ROLE_LABELS, VIEW_MODE_LABELS', () => {
  let src: string;
  beforeAll(() => { src = readLayout('Header.tsx'); });

  test('importa MENU_ITEMS de navigation', () => {
    expect(src).toContain('MENU_ITEMS');
    expect(src).toContain("from '@/lib/constants/navigation'");
  });
  test('importa VIEW_MODE_LABELS de navigation', () => {
    expect(src).toContain('VIEW_MODE_LABELS');
  });
  test('importa ROLE_LABELS de roles', () => {
    expect(src).toContain('ROLE_LABELS');
    expect(src).toContain("from '@/lib/constants/roles'");
  });
  test('não define menuItems localmente', () => {
    expect(src).not.toMatch(/const menuItems\s*[:=]/);
  });
  test('não define roleLabels localmente', () => {
    expect(src).not.toMatch(/const roleLabels\s*[:=]/);
  });
  test('não define viewModeLabels localmente', () => {
    expect(src).not.toMatch(/const viewModeLabels\s*[:=]/);
  });
});

// ─── Layout root (ToastProvider) ────────────────────────────────

describe('Sprint 3: layout.tsx envolve com ToastProvider', () => {
  let src: string;
  beforeAll(() => { src = readPage('layout.tsx'); });

  test('importa ToastProvider de @/components/ui/Toast', () => {
    expect(src).toContain('ToastProvider');
    expect(src).toContain('from "@/components/ui/Toast"');
  });
  test('contém <ToastProvider>', () => {
    expect(src).toContain('<ToastProvider>');
  });
  test('contém </ToastProvider>', () => {
    expect(src).toContain('</ToastProvider>');
  });
  test('ToastProvider envolve AppLayout', () => {
    const toastIdx = src.indexOf('<ToastProvider>');
    const appLayoutIdx = src.indexOf('<AppLayout>');
    expect(toastIdx).toBeLessThan(appLayoutIdx);
  });
});

// ─── Verificações transversais: sem duplicações nas páginas ─────

describe('Sprint 3: sem definições duplicadas nas páginas refatoradas', () => {
  const pages = [
    { name: 'clientes/page.tsx', path: ['clientes', 'page.tsx'] },
    { name: 'clientes/novo/page.tsx', path: ['clientes', 'novo', 'page.tsx'] },
    { name: 'clientes/[id]/page.tsx', path: ['clientes', '[id]', 'page.tsx'] },
    { name: 'procedimentos/page.tsx', path: ['procedimentos', 'page.tsx'] },
    { name: 'usuarios/page.tsx', path: ['usuarios', 'page.tsx'] },
    { name: 'meus-procedimentos/page.tsx', path: ['meus-procedimentos', 'page.tsx'] },
    { name: 'execucao/page.tsx', path: ['execucao', 'page.tsx'] },
    { name: 'avaliacao/page.tsx', path: ['avaliacao', 'page.tsx'] },
    { name: 'login/page.tsx', path: ['login', 'page.tsx'] },
  ];

  pages.forEach(({ name, path: segments }) => {
    describe(name, () => {
      let src: string;
      beforeAll(() => { src = readPage(...segments); });

      test('não redefine formatarMoeda', () => {
        expect(src).not.toMatch(/function formatarMoeda/);
        expect(src).not.toMatch(/const formatarMoeda\s*=/);
      });

      test('não redefine origensOptions', () => {
        expect(src).not.toMatch(/const origensOptions\s*=/);
      });

      test('não redefine getOrigemLabel', () => {
        expect(src).not.toMatch(/function getOrigemLabel/);
      });
    });
  });
});
