/**
 * Testes Sprint 1 — Primitivos UI
 * Verifica que todos os componentes existem, são exportados, e têm as interfaces previstas.
 */

import * as fs from 'fs';
import * as path from 'path';

const UI_DIR = path.join(__dirname, '..', 'components', 'ui');

// ─── Lista de componentes obrigatórios ──────────────────────────

const REQUIRED_COMPONENTS = [
  'Button',
  'Input',
  'Select',
  'Textarea',
  'Checkbox',
  'Badge',
  'Card',
  'Modal',
  'Table',
  'PageHeader',
  'EmptyState',
  'LoadingState',
  'Alert',
  'Toast',
  'StatCard',
  'Tabs',
  'FilterBar',
  'ConfirmDialog',
  'Tooltip',
  'Avatar',
];

// ─── Testes de existência de arquivos ───────────────────────────

describe('Sprint 1: arquivos de componentes UI existem', () => {
  REQUIRED_COMPONENTS.forEach((name) => {
    test(`${name}.tsx existe`, () => {
      const filePath = path.join(UI_DIR, `${name}.tsx`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('index.ts barrel export existe', () => {
    expect(fs.existsSync(path.join(UI_DIR, 'index.ts'))).toBe(true);
  });
});

// ─── Testes do barrel export ────────────────────────────────────

describe('Sprint 1: barrel export re-exporta todos os componentes', () => {
  let barrelContent: string;

  beforeAll(() => {
    barrelContent = fs.readFileSync(path.join(UI_DIR, 'index.ts'), 'utf-8');
  });

  REQUIRED_COMPONENTS.forEach((name) => {
    // Toast export é diferente (ToastProvider, useToast)
    if (name === 'Toast') {
      test('barrel re-exporta ToastProvider e useToast', () => {
        expect(barrelContent).toContain('ToastProvider');
        expect(barrelContent).toContain('useToast');
      });
    } else {
      test(`barrel re-exporta ${name}`, () => {
        expect(barrelContent).toContain(name);
      });
    }
  });
});

// ─── Verificação de conteúdo dos componentes ────────────────────

describe('Sprint 1: componentes têm estrutura correta', () => {
  // Helper
  function readComp(name: string): string {
    return fs.readFileSync(path.join(UI_DIR, `${name}.tsx`), 'utf-8');
  }

  describe('Button', () => {
    let src: string;
    beforeAll(() => { src = readComp('Button'); });

    test('exporta ButtonProps interface', () => {
      expect(src).toContain('ButtonProps');
    });
    test('suporta 6 variantes', () => {
      expect(src).toContain('primary');
      expect(src).toContain('secondary');
      expect(src).toContain('danger');
      expect(src).toContain('success');
      expect(src).toContain('ghost');
      expect(src).toContain('outline');
    });
    test('suporta 3 tamanhos', () => {
      expect(src).toContain("'sm'");
      expect(src).toContain("'md'");
      expect(src).toContain("'lg'");
    });
    test('tem loading state com spinner', () => {
      expect(src).toContain('loading');
      const hasAnimateSpin = src.includes('animate-spin');
      const hasSpinnerImport = src.includes('Spinner');
      expect(hasAnimateSpin || hasSpinnerImport).toBe(true);
    });
    test('tem prop disabled', () => {
      expect(src).toContain('disabled');
    });
    test('é forwardRef', () => {
      expect(src).toContain('forwardRef');
    });
  });

  describe('Input', () => {
    let src: string;
    beforeAll(() => { src = readComp('Input'); });

    test('exporta InputProps interface', () => {
      expect(src).toContain('InputProps');
    });
    test('tem label integrado', () => {
      expect(src).toContain('<label');
      expect(src).toContain('htmlFor');
    });
    test('tem estado de erro com aria-invalid', () => {
      expect(src).toContain('aria-invalid');
      expect(src).toContain('error');
    });
    test('suporta masks (cpf, telefone, moeda)', () => {
      expect(src).toContain("'cpf'");
      expect(src).toContain("'telefone'");
      expect(src).toContain("'moeda'");
    });
    test('tem required indicator', () => {
      expect(src).toContain('required');
    });
    test('usa useId para acessibilidade', () => {
      expect(src).toContain('useId');
    });
  });

  describe('Select', () => {
    let src: string;
    beforeAll(() => { src = readComp('Select'); });

    test('tem label e opções', () => {
      expect(src).toContain('<label');
      expect(src).toContain('<select');
      expect(src).toContain('<option');
    });
    test('tem placeholder "Selecione..."', () => {
      expect(src).toContain('Selecione...');
    });
    test('suporta erro', () => {
      expect(src).toContain('error');
      expect(src).toContain('aria-invalid');
    });
  });

  describe('Textarea', () => {
    let src: string;
    beforeAll(() => { src = readComp('Textarea'); });

    test('tem label e textarea', () => {
      expect(src).toContain('<label');
      expect(src).toContain('<textarea');
    });
    test('suporta maxLength com contador', () => {
      expect(src).toContain('maxLength');
      expect(src).toMatch(/value\.length/);
    });
    test('suporta minLength com indicador', () => {
      expect(src).toContain('minLength');
    });
  });

  describe('Checkbox', () => {
    let src: string;
    beforeAll(() => { src = readComp('Checkbox'); });

    test('é input type checkbox', () => {
      expect(src).toContain('type="checkbox"');
    });
    test('tem label clicável', () => {
      expect(src).toContain('<label');
      expect(src).toContain('htmlFor');
    });
  });

  describe('Badge', () => {
    let src: string;
    beforeAll(() => { src = readComp('Badge'); });

    test('suporta cores semânticas', () => {
      expect(src).toContain('gray');
      expect(src).toContain('orange');
      expect(src).toContain('green');
      expect(src).toContain('red');
      expect(src).toContain('blue');
      expect(src).toContain('purple');
    });
    test('é rounded-full', () => {
      expect(src).toContain('rounded-full');
    });
  });

  describe('Card', () => {
    let src: string;
    beforeAll(() => { src = readComp('Card'); });

    test('suporta 3 variantes', () => {
      expect(src).toContain('default');
      expect(src).toContain('outlined');
      expect(src).toContain('elevated');
    });
    test('tem noPadding prop', () => {
      expect(src).toContain('noPadding');
    });
    test('suporta onClick (interativo)', () => {
      expect(src).toContain('onClick');
      expect(src).toContain('cursor-pointer');
    });
  });

  describe('Modal', () => {
    let src: string;
    beforeAll(() => { src = readComp('Modal'); });

    test('tem role="dialog" e aria-modal', () => {
      expect(src).toContain('role="dialog"');
      expect(src).toContain('aria-modal="true"');
    });
    test('tem aria-labelledby', () => {
      expect(src).toContain('aria-labelledby');
    });
    test('implementa focus trap', () => {
      expect(src).toContain('focusable');
      expect(src).toContain('Tab');
    });
    test('fecha com Escape', () => {
      expect(src).toContain('Escape');
    });
    test('tem overlay click', () => {
      expect(src).toContain('closeOnOverlay');
    });
    test('suporta 4 tamanhos', () => {
      expect(src).toContain("'sm'");
      expect(src).toContain("'md'");
      expect(src).toContain("'lg'");
      expect(src).toContain("'xl'");
    });
    test('tem footer slot', () => {
      expect(src).toContain('footer');
    });
    test('previne scroll do body', () => {
      expect(src).toContain('overflow');
    });
  });

  describe('Table', () => {
    let src: string;
    beforeAll(() => { src = readComp('Table'); });

    test('exporta TableColumn e TableProps', () => {
      expect(src).toContain('TableColumn');
      expect(src).toContain('TableProps');
    });
    test('tem skeleton loading', () => {
      expect(src).toContain('Skeleton');
      expect(src).toContain('animate-pulse');
    });
    test('tem empty state', () => {
      expect(src).toContain('emptyMessage');
    });
    test('suporta onRowClick', () => {
      expect(src).toContain('onRowClick');
    });
    test('suporta sticky header', () => {
      expect(src).toContain('stickyHeader');
    });
    test('tem caption acessível', () => {
      expect(src).toContain('<caption');
      expect(src).toContain('sr-only');
    });
  });

  describe('PageHeader', () => {
    let src: string;
    beforeAll(() => { src = readComp('PageHeader'); });

    test('tem título h1', () => {
      expect(src).toContain('<h1');
    });
    test('suporta ícone emoji', () => {
      expect(src).toContain('icon');
    });
    test('suporta backHref com Voltar', () => {
      expect(src).toContain('backHref');
      expect(src).toContain('Voltar');
    });
    test('tem slot para ações', () => {
      expect(src).toContain('actions');
    });
    test('é responsivo', () => {
      expect(src).toContain('sm:flex-row');
    });
  });

  describe('EmptyState', () => {
    let src: string;
    beforeAll(() => { src = readComp('EmptyState'); });

    test('tem ícone, título, descrição', () => {
      expect(src).toContain('icon');
      expect(src).toContain('title');
      expect(src).toContain('description');
    });
    test('suporta ação (botão)', () => {
      expect(src).toContain('actionLabel');
      expect(src).toContain('onAction');
    });
  });

  describe('LoadingState', () => {
    let src: string;
    beforeAll(() => { src = readComp('LoadingState'); });

    test('suporta modo spinner', () => {
      expect(src).toContain('spinner');
      const hasAnimateSpin = src.includes('animate-spin');
      const hasSpinnerImport = src.includes('Spinner');
      expect(hasAnimateSpin || hasSpinnerImport).toBe(true);
    });
    test('suporta modo skeleton', () => {
      expect(src).toContain('skeleton');
      expect(src).toContain('animate-pulse');
    });
    test('tem role="status"', () => {
      expect(src).toContain('role="status"');
    });
  });

  describe('Alert', () => {
    let src: string;
    beforeAll(() => { src = readComp('Alert'); });

    test('suporta 4 tipos', () => {
      expect(src).toContain("'info'");
      expect(src).toContain("'success'");
      expect(src).toContain("'warning'");
      expect(src).toContain("'error'");
    });
    test('tem role="alert" ou role="status" para acessibilidade', () => {
      // Suporta role dinâmico (alert para error/warning, status para info/success)
      expect(src).toMatch(/role=.*alert|role=.*status/);
    });
    test('suporta dismiss', () => {
      expect(src).toContain('dismissible');
    });
  });

  describe('Toast', () => {
    let src: string;
    beforeAll(() => { src = readComp('Toast'); });

    test('exporta ToastProvider e useToast', () => {
      expect(src).toContain('ToastProvider');
      expect(src).toContain('useToast');
    });
    test('suporta 4 tipos', () => {
      expect(src).toContain('success');
      expect(src).toContain('error');
      expect(src).toContain('warning');
      expect(src).toContain('info');
    });
    test('tem aria-live para acessibilidade', () => {
      expect(src).toContain('aria-live');
    });
    test('tem auto-dismiss com timeout', () => {
      expect(src).toContain('setTimeout');
      expect(src).toContain('duration');
    });
    test('errors persistem (duration 0)', () => {
      expect(src).toContain('dur ?? 0');
    });
  });

  describe('StatCard', () => {
    let src: string;
    beforeAll(() => { src = readComp('StatCard'); });

    test('tem ícone, label, valor', () => {
      expect(src).toContain('icon');
      expect(src).toContain('label');
      expect(src).toContain('value');
    });
    test('suporta href (link)', () => {
      expect(src).toContain('href');
      expect(src).toContain('Link');
    });
    test('tem borda lateral colorida', () => {
      expect(src).toContain('border-l-4');
    });
  });

  describe('Tabs', () => {
    let src: string;
    beforeAll(() => { src = readComp('Tabs'); });

    test('é controlled (activeTab + onTabChange)', () => {
      expect(src).toContain('activeTab');
      expect(src).toContain('onTabChange');
    });
    test('suporta variante pills', () => {
      expect(src).toContain('pills');
      expect(src).toContain('bg-primary-500');
    });
    test('suporta variante underline', () => {
      expect(src).toContain('underline');
      expect(src).toContain('border-b');
    });
    test('suporta count badge', () => {
      expect(src).toContain('count');
    });
    test('tem role="tablist" e role="tab"', () => {
      expect(src).toContain('role="tablist"');
      expect(src).toContain('role="tab"');
    });
    test('tem aria-selected', () => {
      expect(src).toContain('aria-selected');
    });
  });

  describe('FilterBar', () => {
    let src: string;
    beforeAll(() => { src = readComp('FilterBar'); });

    test('suporta campo de texto e data', () => {
      expect(src).toContain("'text'");
      expect(src).toContain("'date'");
    });
    test('suporta campo select', () => {
      expect(src).toContain("'select'");
    });
    test('tem botão limpar filtros', () => {
      expect(src).toContain('Limpar filtros');
    });
    test('é responsivo (grid)', () => {
      expect(src).toContain('grid');
      expect(src).toContain('lg:grid-cols-4');
    });
    test('tem toggle mobile', () => {
      expect(src).toContain('md:hidden');
      expect(src).toContain('md:block');
    });
  });

  describe('ConfirmDialog', () => {
    let src: string;
    beforeAll(() => { src = readComp('ConfirmDialog'); });

    test('usa Modal internamente', () => {
      expect(src).toContain('Modal');
    });
    test('tem onConfirm callback', () => {
      expect(src).toContain('onConfirm');
    });
    test('suporta tipos danger/warning/info', () => {
      expect(src).toContain("'danger'");
      expect(src).toContain("'warning'");
      expect(src).toContain("'info'");
    });
    test('tem loading state', () => {
      expect(src).toContain('loading');
    });
  });

  describe('Tooltip', () => {
    let src: string;
    beforeAll(() => { src = readComp('Tooltip'); });

    test('suporta 4 posições', () => {
      expect(src).toContain("'top'");
      expect(src).toContain("'right'");
      expect(src).toContain("'bottom'");
      expect(src).toContain("'left'");
    });
    test('tem role="tooltip"', () => {
      expect(src).toContain('role="tooltip"');
    });
    test('usa aria-describedby', () => {
      expect(src).toContain('aria-describedby');
    });
  });

  describe('Avatar', () => {
    let src: string;
    beforeAll(() => { src = readComp('Avatar'); });

    test('usa obterIniciais de formatters', () => {
      expect(src).toContain('obterIniciais');
    });
    test('tem 3 tamanhos', () => {
      expect(src).toContain("'sm'");
      expect(src).toContain("'md'");
      expect(src).toContain("'lg'");
    });
    test('gera cor automática por hash', () => {
      expect(src).toContain('hashColor');
    });
    test('tem aria-label', () => {
      expect(src).toContain('aria-label');
    });
  });
});

// ─── Verificação de que NÃO existe lógica de negócio ────────────

describe('Sprint 1: componentes UI são genéricos (sem lógica de negócio)', () => {
  const businessTerms = ['atendimento', 'procedimento', 'avaliacao', 'execucao', 'comissao'];

  REQUIRED_COMPONENTS.forEach((name) => {
    test(`${name}.tsx não contém termos de negócio`, () => {
      const content = fs.readFileSync(path.join(UI_DIR, `${name}.tsx`), 'utf-8');
      businessTerms.forEach((term) => {
        // Procura como substring (case-insensitive), excluindo imports e comments
        const lines = content.split('\n').filter(
          (l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.includes('import')
        );
        const code = lines.join('\n').toLowerCase();
        expect(code).not.toContain(term);
      });
    });
  });
});
