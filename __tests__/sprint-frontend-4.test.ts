/**
 * Testes Sprint 4 — Refatoração de Páginas Complexas
 * Verifica que as páginas agora usam componentes centralizados (Sprints 0/1/2)
 * e NÃO contêm definições inline/duplicadas de formatters, status configs, etc.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.join(__dirname, '..', 'app');

function readPage(...segments: string[]): string {
  return fs.readFileSync(path.join(APP_DIR, ...segments), 'utf-8');
}

// ─── Helper: verifica que usa import centralizado de formatters ─

function expectCentralizedFormatters(src: string, funcs: string[]) {
  funcs.forEach(fn => {
    // Deve importar do centralized
    expect(src).toContain("from '@/lib/utils/formatters'");
    // Não deve ter definição inline
    expect(src).not.toMatch(new RegExp(`(function|const)\\s+${fn}\\s*[=(]`));
  });
}

// ─── Helper: verifica que usa import centralizado de status ─────

function expectCentralizedStatus(src: string) {
  expect(src).toContain("from '@/lib/constants/status'");
  // Não deve ter inline STATUS_CONFIG ou ITEM_STATUS
  expect(src).not.toMatch(/const\s+STATUS_CONFIG\s*[:=]/);
  expect(src).not.toMatch(/const\s+ITEM_STATUS\s*[:=]/);
  expect(src).not.toMatch(/const\s+PROXIMOS_STATUS\s*[:=]/);
  expect(src).not.toMatch(/const\s+statusLabels\s*[:=]/);
  expect(src).not.toMatch(/const\s+statusColors\s*[:=]/);
}

// ═══════════════════════════════════════════════════════════════
// MINHAS COMISSÕES
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: minhas-comissoes/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('minhas-comissoes', 'page.tsx'); });

  test('usa formatarMoeda centralizado', () => {
    expectCentralizedFormatters(src, ['formatarMoeda']);
  });

  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });

  test('usa Badge', () => {
    expect(src).toContain('Badge');
  });

  test('usa Table', () => {
    expect(src).toContain('Table');
  });
});

// ═══════════════════════════════════════════════════════════════
// COMISSÕES
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: comissoes/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('comissoes', 'page.tsx'); });

  test('usa formatarMoeda centralizado', () => {
    expectCentralizedFormatters(src, ['formatarMoeda']);
  });

  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });

  test('usa Tabs', () => {
    expect(src).toContain('Tabs');
  });

  test('usa Table', () => {
    expect(src).toContain('Table');
  });
});

// ═══════════════════════════════════════════════════════════════
// PAGAMENTOS
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: pagamentos/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('pagamentos', 'page.tsx'); });

  test('usa formatarMoeda centralizado', () => {
    expectCentralizedFormatters(src, ['formatarMoeda']);
  });

  test('usa PageHeader', () => {
    expect(src).toContain('PageHeader');
  });

  test('usa Tabs', () => {
    expect(src).toContain('Tabs');
  });

  test('usa Table', () => {
    expect(src).toContain('Table');
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
});

// ═══════════════════════════════════════════════════════════════
// ATENDIMENTOS (Lista)
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: atendimentos/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('atendimentos', 'page.tsx'); });

  test('usa formatarMoeda centralizado', () => {
    expectCentralizedFormatters(src, ['formatarMoeda']);
  });

  test('usa StatusBadge', () => {
    expect(src).toContain('StatusBadge');
  });

  test('usa ViewModeToggle', () => {
    expect(src).toContain('ViewModeToggle');
  });

  test('usa Table', () => {
    expect(src).toContain('Table');
  });

  test('não tem STATUS_CONFIG inline', () => {
    expect(src).not.toMatch(/const\s+STATUS_CONFIG\s*[:=]/);
    expect(src).not.toMatch(/const\s+STATUS_ORDER\s*[:=]/);
  });

  test('importa status do centralizado', () => {
    expect(src).toContain("from '@/lib/constants/status'");
  });
});

// ═══════════════════════════════════════════════════════════════
// ATENDIMENTOS / NOVO
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: atendimentos/novo/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('atendimentos', 'novo', 'page.tsx'); });

  test('usa formatarMoeda centralizado', () => {
    expectCentralizedFormatters(src, ['formatarMoeda']);
  });

  test('usa Alert', () => {
    expect(src).toContain('Alert');
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
});

// ═══════════════════════════════════════════════════════════════
// ATENDIMENTOS / [ID] (Detalhe)
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: atendimentos/[id]/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('atendimentos', '[id]', 'page.tsx'); });

  test('usa formatarMoeda e formatarDataHora centralizados', () => {
    expectCentralizedFormatters(src, ['formatarMoeda', 'formatarDataHora']);
  });

  test('usa constantes de status centralizadas', () => {
    expectCentralizedStatus(src);
  });

  test('usa StatusBadge', () => {
    expect(src).toContain('StatusBadge');
  });

  test('usa StatusPipeline', () => {
    expect(src).toContain('StatusPipeline');
  });

  test('usa Alert', () => {
    expect(src).toContain('Alert');
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
});

// ═══════════════════════════════════════════════════════════════
// ATENDIMENTOS / [ID] / PAGAMENTO
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: atendimentos/[id]/pagamento/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('atendimentos', '[id]', 'pagamento', 'page.tsx'); });

  test('usa formatarMoeda, formatarData, formatarDataHora centralizados', () => {
    expectCentralizedFormatters(src, ['formatarMoeda', 'formatarData', 'formatarDataHora']);
  });

  test('usa StatusBadge', () => {
    expect(src).toContain('StatusBadge');
  });

  test('usa Alert', () => {
    expect(src).toContain('Alert');
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
});

// ═══════════════════════════════════════════════════════════════
// AVALIAÇÃO / [ID]
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: avaliacao/[id]/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('avaliacao', '[id]', 'page.tsx'); });

  test('usa formatarMoeda centralizado', () => {
    expectCentralizedFormatters(src, ['formatarMoeda']);
  });

  test('usa Alert', () => {
    expect(src).toContain('Alert');
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });

  test('ainda usa SeletorDentes (componente específico)', () => {
    expect(src).toContain('SeletorDentes');
  });
});

// ═══════════════════════════════════════════════════════════════
// EXECUÇÃO / [ID]
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: execucao/[id]/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('execucao', '[id]', 'page.tsx'); });

  test('usa formatarDataHora centralizado', () => {
    expectCentralizedFormatters(src, ['formatarDataHora']);
  });

  test('usa StatusBadge', () => {
    expect(src).toContain('StatusBadge');
  });

  test('usa Alert', () => {
    expect(src).toContain('Alert');
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });

  test('usa Modal', () => {
    expect(src).toContain('Modal');
  });

  test('não tem getStatusBadge inline', () => {
    expect(src).not.toMatch(/function\s+getStatusBadge/);
  });

  test('não tem formatarData inline', () => {
    expect(src).not.toMatch(/function\s+formatarData/);
  });
});

// ═══════════════════════════════════════════════════════════════
// HOME (page.tsx)
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: page.tsx (home)', () => {
  let src: string;
  beforeAll(() => { src = readPage('page.tsx'); });

  test('usa formatarMoeda centralizado', () => {
    expectCentralizedFormatters(src, ['formatarMoeda']);
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });

  test('mantém seções por role', () => {
    expect(src).toContain("effectiveRole === 'admin'");
    expect(src).toContain("effectiveRole === 'atendente'");
    expect(src).toContain("effectiveRole === 'avaliador'");
    expect(src).toContain("effectiveRole === 'executor'");
  });
});

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: dashboard/page.tsx', () => {
  let src: string;
  beforeAll(() => { src = readPage('dashboard', 'page.tsx'); });

  test('usa formatarMoeda centralizado (via alias)', () => {
    expect(src).toContain("from '@/lib/utils/formatters'");
    // Não deve ter definição inline de formatCurrency
    expect(src).not.toMatch(/new\s+Intl\.NumberFormat/);
  });

  test('usa STATUS_CONFIG centralizado', () => {
    expect(src).toContain("from '@/lib/constants/status'");
    expect(src).not.toMatch(/const\s+statusLabels\s*[:=]/);
    expect(src).not.toMatch(/const\s+statusColors\s*[:=]/);
  });

  test('usa LoadingState', () => {
    expect(src).toContain('LoadingState');
  });
});

// ═══════════════════════════════════════════════════════════════
// VERIFICAÇÃO GERAL: nenhuma página duplica formatarMoeda inline
// ═══════════════════════════════════════════════════════════════

describe('Sprint 4: verificação global — sem formatters inline', () => {
  const pages = [
    ['minhas-comissoes', 'page.tsx'],
    ['comissoes', 'page.tsx'],
    ['pagamentos', 'page.tsx'],
    ['atendimentos', 'page.tsx'],
    ['atendimentos', 'novo', 'page.tsx'],
    ['atendimentos', '[id]', 'page.tsx'],
    ['atendimentos', '[id]', 'pagamento', 'page.tsx'],
    ['avaliacao', '[id]', 'page.tsx'],
    ['execucao', '[id]', 'page.tsx'],
    ['page.tsx'],
    ['dashboard', 'page.tsx'],
  ];

  test.each(pages)('página %s não define formatarMoeda inline', (...segments) => {
    const src = readPage(...segments);
    // Nenhuma página deve ter uma definição local de formatarMoeda
    expect(src).not.toMatch(/(?:function|const)\s+formatarMoeda\s*[=(]/);
  });

  test.each(pages)('página %s não define formatarData inline', (...segments) => {
    const src = readPage(...segments);
    expect(src).not.toMatch(/(?:function|const)\s+formatarData\s*[=(]/);
  });
});
