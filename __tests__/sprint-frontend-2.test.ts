/**
 * Testes Sprint 2 — Componentes de Domínio
 * Verifica que todos os componentes existem, são exportados, e têm as interfaces previstas.
 */

import * as fs from 'fs';
import * as path from 'path';

const DOMAIN_DIR = path.join(__dirname, '..', 'components', 'domain');

// ─── Lista de componentes de domínio obrigatórios ───────────────

const REQUIRED_COMPONENTS = [
  'StatusBadge',
  'StatusPipeline',
  'ClienteForm',
  'ClienteCard',
  'ProcedimentoForm',
  'AtendimentoCard',
  'ItemAtendimentoRow',
  'PagamentoForm',
  'PagamentoDistribuicao',
  'ParcelasTable',
  'ProntuarioEditor',
  'AnexosGallery',
  'ComissoesResumo',
  'ViewModeToggle',
];

// ─── Testes de existência de arquivos ───────────────────────────

describe('Sprint 2: arquivos de componentes de domínio existem', () => {
  REQUIRED_COMPONENTS.forEach((name) => {
    test(`${name}.tsx existe`, () => {
      const filePath = path.join(DOMAIN_DIR, `${name}.tsx`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('index.ts barrel export existe', () => {
    expect(fs.existsSync(path.join(DOMAIN_DIR, 'index.ts'))).toBe(true);
  });
});

// ─── Testes do barrel export ────────────────────────────────────

describe('Sprint 2: barrel export re-exporta todos os componentes', () => {
  let barrelContent: string;

  beforeAll(() => {
    barrelContent = fs.readFileSync(path.join(DOMAIN_DIR, 'index.ts'), 'utf-8');
  });

  REQUIRED_COMPONENTS.forEach((name) => {
    test(`barrel re-exporta ${name}`, () => {
      expect(barrelContent).toContain(name);
    });
  });

  test('barrel re-exporta tipos', () => {
    expect(barrelContent).toContain('ClienteFormData');
    expect(barrelContent).toContain('ClienteFormProps');
  });
});

// ─── Verificação de conteúdo dos componentes ────────────────────

describe('Sprint 2: componentes têm estrutura correta', () => {
  function readComp(name: string): string {
    return fs.readFileSync(path.join(DOMAIN_DIR, `${name}.tsx`), 'utf-8');
  }

  describe('StatusBadge', () => {
    let src: string;
    beforeAll(() => { src = readComp('StatusBadge'); });

    test('exporta StatusBadgeProps', () => {
      expect(src).toContain('StatusBadgeProps');
    });
    test('suporta 3 tipos (atendimento, item, parcela)', () => {
      expect(src).toContain('atendimento');
      expect(src).toContain('item');
      expect(src).toContain('parcela');
    });
    test('usa Badge do Sprint 1', () => {
      expect(src).toContain("from '@/components/ui/Badge'");
    });
    test('usa STATUS_CONFIG do Sprint 0', () => {
      expect(src).toContain('STATUS_CONFIG');
    });
    test('usa ITEM_STATUS_CONFIG', () => {
      expect(src).toContain('ITEM_STATUS_CONFIG');
    });
    test('usa PARCELA_STATUS_CONFIG', () => {
      expect(src).toContain('PARCELA_STATUS_CONFIG');
    });
  });

  describe('StatusPipeline', () => {
    let src: string;
    beforeAll(() => { src = readComp('StatusPipeline'); });

    test('exporta StatusPipelineProps', () => {
      expect(src).toContain('StatusPipelineProps');
    });
    test('usa STATUS_ORDER do Sprint 0', () => {
      expect(src).toContain('STATUS_ORDER');
    });
    test('usa STATUS_CONFIG do Sprint 0', () => {
      expect(src).toContain('STATUS_CONFIG');
    });
    test('aceita currentStatus como AtendimentoStatus', () => {
      expect(src).toContain('AtendimentoStatus');
    });
  });

  describe('ClienteForm', () => {
    let src: string;
    beforeAll(() => { src = readComp('ClienteForm'); });

    test('exporta ClienteFormData', () => {
      expect(src).toContain('export interface ClienteFormData');
    });
    test('exporta ClienteFormProps', () => {
      expect(src).toContain('export interface ClienteFormProps');
    });
    test('usa Input com mask=cpf', () => {
      expect(src).toContain('mask="cpf"');
    });
    test('usa Input com mask=telefone', () => {
      expect(src).toContain('mask="telefone"');
    });
    test('usa Select com ORIGENS_OPTIONS', () => {
      expect(src).toContain('ORIGENS_OPTIONS');
    });
    test('usa Textarea', () => {
      expect(src).toContain("from '@/components/ui/Textarea'");
    });
    test('usa Button com loading', () => {
      expect(src).toContain('loading');
    });
    test('suporta onCancel', () => {
      expect(src).toContain('onCancel');
    });
    test('suporta submitLabel', () => {
      expect(src).toContain('submitLabel');
    });
  });

  describe('ClienteCard', () => {
    let src: string;
    beforeAll(() => { src = readComp('ClienteCard'); });

    test('usa formatarCPF', () => {
      expect(src).toContain('formatarCPF');
    });
    test('usa formatarTelefone', () => {
      expect(src).toContain('formatarTelefone');
    });
    test('usa getOrigemLabel', () => {
      expect(src).toContain('getOrigemLabel');
    });
  });

  describe('ProcedimentoForm', () => {
    let src: string;
    beforeAll(() => { src = readComp('ProcedimentoForm'); });

    test('usa Modal do Sprint 1', () => {
      expect(src).toContain("from '@/components/ui/Modal'");
    });
    test('usa Input do Sprint 1', () => {
      expect(src).toContain("from '@/components/ui/Input'");
    });
    test('usa Checkbox do Sprint 1', () => {
      expect(src).toContain('Checkbox');
    });
    test('suporta isEditing prop', () => {
      expect(src).toContain('isEditing');
    });
    test('suporta showComissoes prop', () => {
      expect(src).toContain('showComissoes');
    });
  });

  describe('AtendimentoCard', () => {
    let src: string;
    beforeAll(() => { src = readComp('AtendimentoCard'); });

    test('usa StatusBadge', () => {
      expect(src).toContain('StatusBadge');
    });
    test('usa formatarMoeda', () => {
      expect(src).toContain('formatarMoeda');
    });
    test('suporta compact mode', () => {
      expect(src).toContain('compact');
    });
  });

  describe('ItemAtendimentoRow', () => {
    let src: string;
    beforeAll(() => { src = readComp('ItemAtendimentoRow'); });

    test('usa StatusBadge', () => {
      expect(src).toContain('StatusBadge');
    });
    test('usa formatarMoeda', () => {
      expect(src).toContain('formatarMoeda');
    });
    test('suporta onEdit e onRemove', () => {
      expect(src).toContain('onEdit');
      expect(src).toContain('onRemove');
    });
  });

  describe('PagamentoForm', () => {
    let src: string;
    beforeAll(() => { src = readComp('PagamentoForm'); });

    test('usa METODO_PAGAMENTO_LABELS', () => {
      expect(src).toContain('METODO_PAGAMENTO_LABELS');
    });
    test('suporta maxValor prop', () => {
      expect(src).toContain('maxValor');
    });
    test('suporta parcelas para cartão', () => {
      expect(src).toContain('parcelas');
    });
  });

  describe('PagamentoDistribuicao', () => {
    let src: string;
    beforeAll(() => { src = readComp('PagamentoDistribuicao'); });

    test('tem barra de progresso', () => {
      expect(src).toMatch(/progress|barra|width/i);
    });
    test('tem distribuir igualmente', () => {
      expect(src).toMatch(/distribuir|igualmente/i);
    });
  });

  describe('ParcelasTable', () => {
    let src: string;
    beforeAll(() => { src = readComp('ParcelasTable'); });

    test('usa StatusBadge com type=parcela', () => {
      expect(src).toContain('parcela');
    });
    test('suporta onMarcarPaga', () => {
      expect(src).toContain('onMarcarPaga');
    });
  });

  describe('ProntuarioEditor', () => {
    let src: string;
    beforeAll(() => { src = readComp('ProntuarioEditor'); });

    test('usa Textarea', () => {
      expect(src).toContain('Textarea');
    });
    test('usa formatarDataCompleta', () => {
      expect(src).toContain('formatarDataCompleta');
    });
    test('suporta onSave', () => {
      expect(src).toContain('onSave');
    });
  });

  describe('AnexosGallery', () => {
    let src: string;
    beforeAll(() => { src = readComp('AnexosGallery'); });

    test('usa Modal para preview', () => {
      expect(src).toContain('Modal');
    });
    test('usa ConfirmDialog para delete', () => {
      expect(src).toContain('ConfirmDialog');
    });
    test('suporta maxSizeMB', () => {
      expect(src).toContain('maxSizeMB');
    });
  });

  describe('ComissoesResumo', () => {
    let src: string;
    beforeAll(() => { src = readComp('ComissoesResumo'); });

    test('usa formatarMoeda', () => {
      expect(src).toContain('formatarMoeda');
    });
    test('mostra total geral', () => {
      expect(src).toMatch(/total|geral/i);
    });
  });

  describe('ViewModeToggle', () => {
    let src: string;
    beforeAll(() => { src = readComp('ViewModeToggle'); });

    test('suporta options prop', () => {
      expect(src).toContain('options');
    });
    test('suporta active prop', () => {
      expect(src).toContain('active');
    });
    test('suporta onChange callback', () => {
      expect(src).toContain('onChange');
    });
  });
});

// ─── Testes de integração entre Sprint 0/1 e Sprint 2 ──────────

describe('Sprint 2: componentes usam módulos das sprints anteriores', () => {
  function readComp(name: string): string {
    return fs.readFileSync(path.join(DOMAIN_DIR, `${name}.tsx`), 'utf-8');
  }

  test('StatusBadge importa de @/lib/constants/status', () => {
    const src = readComp('StatusBadge');
    expect(src).toContain("from '@/lib/constants/status'");
  });

  test('ClienteForm importa de @/lib/constants/origens', () => {
    const src = readComp('ClienteForm');
    expect(src).toContain("from '@/lib/constants/origens'");
  });

  test('AtendimentoCard importa formatarMoeda de @/lib/utils/formatters', () => {
    const src = readComp('AtendimentoCard');
    expect(src).toContain("from '@/lib/utils/formatters'");
  });

  test('ProntuarioEditor importa formatarDataCompleta de @/lib/utils/formatters', () => {
    const src = readComp('ProntuarioEditor');
    expect(src).toContain("from '@/lib/utils/formatters'");
  });

  test('PagamentoForm importa de @/lib/constants/status', () => {
    const src = readComp('PagamentoForm');
    expect(src).toContain("from '@/lib/constants/status'");
  });
});

// ─── Nenhum componente de domínio usa CSS inline hardcoded para status ──

describe('Sprint 2: sem cores hardcoded de status', () => {
  const statusColorPatterns = [
    /badge-success/,
    /badge-warning/,
    /badge-danger/,
    /badge-info/,
    /badge-secondary/,
    /badge-primary/,
  ];

  REQUIRED_COMPONENTS.forEach((name) => {
    test(`${name} não usa classes badge-* legadas`, () => {
      const src = fs.readFileSync(path.join(DOMAIN_DIR, `${name}.tsx`), 'utf-8');
      statusColorPatterns.forEach((pattern) => {
        expect(src).not.toMatch(pattern);
      });
    });
  });
});
