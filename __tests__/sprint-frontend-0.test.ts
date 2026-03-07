/**
 * Testes Sprint 0 — Fundação (utils + constants)
 * Verifica que todos os módulos existem e funções operam corretamente.
 */

import {
  formatarMoeda,
  formatarData,
  formatarDataHora,
  formatarDataCompleta,
  formatarCPF,
  formatarTelefone,
  formatarPorcentagem,
  obterIniciais,
} from '../lib/utils/formatters';

import {
  validarCPF,
  validarEmail,
  validarTelefone,
  validarObrigatorio,
  validarValor,
} from '../lib/utils/validators';

import {
  maskCPF,
  maskTelefone,
  maskMoeda,
  unmask,
  unmaskMoeda,
} from '../lib/utils/masks';

import {
  STATUS_CONFIG,
  STATUS_CHART_COLORS,
  STATUS_ORDER,
  PROXIMOS_STATUS,
  ITEM_STATUS_CONFIG,
  PARCELA_STATUS_CONFIG,
  METODO_PAGAMENTO_LABELS,
  getAtendimentoStatus,
  getItemStatus,
} from '../lib/constants/status';

import {
  ORIGENS_OPTIONS,
  ORIGENS_VALIDAS,
  getOrigemLabel,
} from '../lib/constants/origens';

import {
  ROLE_LABELS,
  ROLE_LABELS_DESCRITIVOS,
  ROLE_COLORS,
  ALL_ROLES,
  getRoleLabel,
} from '../lib/constants/roles';

import {
  MENU_ITEMS,
  VIEW_MODE_LABELS,
} from '../lib/constants/navigation';

// ─── Barrel exports ─────────────────────────────────────────────

import * as utils from '../lib/utils';
import * as constants from '../lib/constants';

// =====================================================
// SPRINT 0 — FORMATTERS
// =====================================================

describe('Sprint 0: formatters', () => {
  describe('formatarMoeda', () => {
    test('formata valor positivo', () => {
      const result = formatarMoeda(1234.56);
      expect(result).toContain('1.234,56');
    });
    test('formata zero', () => {
      const result = formatarMoeda(0);
      expect(result).toContain('0,00');
    });
    test('formata valor negativo', () => {
      const result = formatarMoeda(-100);
      expect(result).toContain('100,00');
    });
    test('inclui símbolo R$', () => {
      expect(formatarMoeda(10)).toContain('R$');
    });
  });

  describe('formatarData', () => {
    test('formata data ISO para dd/mm/aaaa', () => {
      expect(formatarData('2026-03-07T12:00:00Z')).toMatch(/07\/03\/2026/);
    });
  });

  describe('formatarDataHora', () => {
    test('formata data e hora', () => {
      const result = formatarDataHora('2026-03-07T14:30:00Z');
      expect(result).toMatch(/07\/03\/2026/);
      // Horário pode variar pela timezone
    });
  });

  describe('formatarDataCompleta', () => {
    test('retorna string com data completa', () => {
      const result = formatarDataCompleta('2026-03-07T14:30:00Z');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatarCPF', () => {
    test('formata CPF com 11 dígitos', () => {
      expect(formatarCPF('12345678900')).toBe('123.456.789-00');
    });
    test('retorna "-" para null', () => {
      expect(formatarCPF(null)).toBe('-');
    });
    test('retorna string original para CPF inválido', () => {
      expect(formatarCPF('123')).toBe('123');
    });
  });

  describe('formatarTelefone', () => {
    test('formata celular (11 dígitos)', () => {
      expect(formatarTelefone('11912345678')).toBe('(11) 91234-5678');
    });
    test('formata fixo (10 dígitos)', () => {
      expect(formatarTelefone('1112345678')).toBe('(11) 1234-5678');
    });
    test('retorna "-" para null', () => {
      expect(formatarTelefone(null)).toBe('-');
    });
  });

  describe('formatarPorcentagem', () => {
    test('formata porcentagem', () => {
      expect(formatarPorcentagem(15)).toBe('15%');
    });
  });

  describe('obterIniciais', () => {
    test('retorna iniciais de 2 nomes', () => {
      expect(obterIniciais('Lucas Cardoso')).toBe('LC');
    });
    test('retorna inicial de 1 nome', () => {
      expect(obterIniciais('Admin')).toBe('A');
    });
    test('limita a 2 iniciais', () => {
      expect(obterIniciais('João Silva Santos')).toBe('JS');
    });
  });
});

// =====================================================
// SPRINT 0 — VALIDATORS
// =====================================================

describe('Sprint 0: validators', () => {
  describe('validarCPF', () => {
    test('aceita CPF válido', () => {
      expect(validarCPF('529.982.247-25')).toBe(true);
    });
    test('rejeita CPF com dígitos iguais', () => {
      expect(validarCPF('111.111.111-11')).toBe(false);
    });
    test('rejeita CPF curto', () => {
      expect(validarCPF('123')).toBe(false);
    });
    test('rejeita CPF inválido (dígito errado)', () => {
      expect(validarCPF('529.982.247-26')).toBe(false);
    });
  });

  describe('validarEmail', () => {
    test('aceita email válido', () => {
      expect(validarEmail('user@test.com')).toBe(true);
    });
    test('rejeita email sem @', () => {
      expect(validarEmail('usertest.com')).toBe(false);
    });
    test('rejeita email sem domínio', () => {
      expect(validarEmail('user@')).toBe(false);
    });
  });

  describe('validarTelefone', () => {
    test('aceita celular (11 dígitos)', () => {
      expect(validarTelefone('11912345678')).toBe(true);
    });
    test('aceita fixo (10 dígitos)', () => {
      expect(validarTelefone('1112345678')).toBe(true);
    });
    test('rejeita tel curto', () => {
      expect(validarTelefone('123')).toBe(false);
    });
  });

  describe('validarObrigatorio', () => {
    test('aceita string com conteúdo', () => {
      expect(validarObrigatorio('abc')).toBe(true);
    });
    test('rejeita string vazia', () => {
      expect(validarObrigatorio('')).toBe(false);
    });
    test('rejeita string só com espaços', () => {
      expect(validarObrigatorio('   ')).toBe(false);
    });
  });

  describe('validarValor', () => {
    test('aceita valor positivo', () => {
      expect(validarValor(100)).toBe(true);
    });
    test('rejeita zero', () => {
      expect(validarValor(0)).toBe(false);
    });
    test('rejeita negativo', () => {
      expect(validarValor(-1)).toBe(false);
    });
    test('rejeita Infinity', () => {
      expect(validarValor(Infinity)).toBe(false);
    });
  });
});

// =====================================================
// SPRINT 0 — MASKS
// =====================================================

describe('Sprint 0: masks', () => {
  describe('maskCPF', () => {
    test('aplica máscara parcial', () => {
      expect(maskCPF('12345')).toBe('123.45');
    });
    test('aplica máscara completa', () => {
      expect(maskCPF('12345678900')).toBe('123.456.789-00');
    });
  });

  describe('maskTelefone', () => {
    test('aplica máscara de celular', () => {
      expect(maskTelefone('11912345678')).toBe('(11) 91234-5678');
    });
    test('aplica máscara parcial', () => {
      expect(maskTelefone('119')).toBe('(11) 9');
    });
  });

  describe('maskMoeda', () => {
    test('formata centavos', () => {
      expect(maskMoeda('100')).toBe('R$ 1,00');
    });
    test('formata valor grande', () => {
      expect(maskMoeda('123456')).toBe('R$ 1.234,56');
    });
    test('retorna vazio para input vazio', () => {
      expect(maskMoeda('')).toBe('');
    });
  });

  describe('unmask', () => {
    test('remove tudo que não é dígito', () => {
      expect(unmask('123.456.789-00')).toBe('12345678900');
    });
  });

  describe('unmaskMoeda', () => {
    test('converte valor formatado para número', () => {
      expect(unmaskMoeda('R$ 1.234,56')).toBe(1234.56);
    });
    test('retorna 0 para vazio', () => {
      expect(unmaskMoeda('')).toBe(0);
    });
  });
});

// =====================================================
// SPRINT 0 — STATUS CONSTANTS
// =====================================================

describe('Sprint 0: status constants', () => {
  test('STATUS_CONFIG tem 5 status de atendimento', () => {
    expect(Object.keys(STATUS_CONFIG)).toHaveLength(5);
    expect(STATUS_CONFIG).toHaveProperty('triagem');
    expect(STATUS_CONFIG).toHaveProperty('avaliacao');
    expect(STATUS_CONFIG).toHaveProperty('aguardando_pagamento');
    expect(STATUS_CONFIG).toHaveProperty('em_execucao');
    expect(STATUS_CONFIG).toHaveProperty('finalizado');
  });

  test('cada status tem label, cor, bgCor, icon', () => {
    Object.values(STATUS_CONFIG).forEach((config) => {
      expect(config).toHaveProperty('label');
      expect(config).toHaveProperty('cor');
      expect(config).toHaveProperty('bgCor');
      expect(config).toHaveProperty('icon');
    });
  });

  test('STATUS_CHART_COLORS tem 5 cores sólidas', () => {
    expect(Object.keys(STATUS_CHART_COLORS)).toHaveLength(5);
  });

  test('STATUS_ORDER tem 5 itens na sequência correta', () => {
    expect(STATUS_ORDER).toEqual([
      'triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao', 'finalizado'
    ]);
  });

  test('PROXIMOS_STATUS mapeia transições corretas', () => {
    expect(PROXIMOS_STATUS.triagem).toBe('avaliacao');
    expect(PROXIMOS_STATUS.avaliacao).toBe('aguardando_pagamento');
    expect(PROXIMOS_STATUS.finalizado).toBeNull();
  });

  test('ITEM_STATUS_CONFIG tem 4 status de item', () => {
    expect(Object.keys(ITEM_STATUS_CONFIG)).toHaveLength(4);
    expect(ITEM_STATUS_CONFIG).toHaveProperty('pendente');
    expect(ITEM_STATUS_CONFIG).toHaveProperty('pago');
    expect(ITEM_STATUS_CONFIG).toHaveProperty('executando');
    expect(ITEM_STATUS_CONFIG).toHaveProperty('concluido');
  });

  test('PARCELA_STATUS_CONFIG tem 3 status', () => {
    expect(Object.keys(PARCELA_STATUS_CONFIG)).toHaveLength(3);
  });

  test('METODO_PAGAMENTO_LABELS tem 4 métodos', () => {
    expect(Object.keys(METODO_PAGAMENTO_LABELS)).toHaveLength(4);
    expect(METODO_PAGAMENTO_LABELS.pix).toBe('PIX');
  });

  test('getAtendimentoStatus retorna config válida', () => {
    const cfg = getAtendimentoStatus('triagem');
    expect(cfg.label).toBe('Triagem');
  });

  test('getAtendimentoStatus retorna fallback para status desconhecido', () => {
    const cfg = getAtendimentoStatus('invalido');
    expect(cfg.label).toBe('invalido');
    expect(cfg.icon).toBe('❓');
  });

  test('getItemStatus retorna config válida', () => {
    const cfg = getItemStatus('concluido');
    expect(cfg.label).toBe('Concluído');
  });

  test('getItemStatus retorna fallback para status desconhecido', () => {
    const cfg = getItemStatus('xxx');
    expect(cfg.label).toBe('xxx');
  });
});

// =====================================================
// SPRINT 0 — ORIGENS
// =====================================================

describe('Sprint 0: origens', () => {
  test('ORIGENS_OPTIONS tem 5 opções', () => {
    expect(ORIGENS_OPTIONS).toHaveLength(5);
  });

  test('cada opção tem value e label', () => {
    ORIGENS_OPTIONS.forEach((opt) => {
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('label');
    });
  });

  test('ORIGENS_VALIDAS é derivado de ORIGENS_OPTIONS', () => {
    expect(ORIGENS_VALIDAS).toHaveLength(ORIGENS_OPTIONS.length);
    expect(ORIGENS_VALIDAS).toContain('fachada');
    expect(ORIGENS_VALIDAS).toContain('indicacao');
  });

  test('getOrigemLabel retorna label correto', () => {
    expect(getOrigemLabel('fachada')).toBe('Fachada');
    expect(getOrigemLabel('trafego_meta')).toBe('Tráfego Meta (Facebook/Instagram)');
  });

  test('getOrigemLabel retorna string original para desconhecido', () => {
    expect(getOrigemLabel('outro')).toBe('outro');
  });
});

// =====================================================
// SPRINT 0 — ROLES
// =====================================================

describe('Sprint 0: roles', () => {
  test('ROLE_LABELS tem 4 roles', () => {
    expect(Object.keys(ROLE_LABELS)).toHaveLength(4);
    expect(ROLE_LABELS.admin).toBe('Administrador');
  });

  test('ROLE_LABELS_DESCRITIVOS identifica dentistas', () => {
    expect(ROLE_LABELS_DESCRITIVOS.avaliador).toContain('Dentista');
    expect(ROLE_LABELS_DESCRITIVOS.executor).toContain('Dentista');
  });

  test('ROLE_COLORS tem cor e bgCor para cada role', () => {
    ALL_ROLES.forEach((role) => {
      expect(ROLE_COLORS[role]).toHaveProperty('cor');
      expect(ROLE_COLORS[role]).toHaveProperty('bgCor');
    });
  });

  test('ALL_ROLES tem 4 roles', () => {
    expect(ALL_ROLES).toEqual(['admin', 'atendente', 'avaliador', 'executor']);
  });

  test('getRoleLabel retorna label correto', () => {
    expect(getRoleLabel('admin')).toBe('Administrador');
  });

  test('getRoleLabel retorna string original para desconhecido', () => {
    expect(getRoleLabel('xyz')).toBe('xyz');
  });
});

// =====================================================
// SPRINT 0 — NAVIGATION
// =====================================================

describe('Sprint 0: navigation', () => {
  test('MENU_ITEMS tem 11 itens', () => {
    expect(MENU_ITEMS).toHaveLength(11);
  });

  test('cada item tem href, label, icon', () => {
    MENU_ITEMS.forEach((item) => {
      expect(item).toHaveProperty('href');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('icon');
    });
  });

  test('primeiro item é Início sem restrição de role', () => {
    expect(MENU_ITEMS[0].href).toBe('/');
    expect(MENU_ITEMS[0].label).toBe('Início');
    expect(MENU_ITEMS[0].roles).toBeUndefined();
  });

  test('Dashboard é restrito a admin', () => {
    const dash = MENU_ITEMS.find((i) => i.href === '/dashboard');
    expect(dash?.roles).toEqual(['admin']);
  });

  test('VIEW_MODE_LABELS tem admin e dentista', () => {
    expect(VIEW_MODE_LABELS).toHaveProperty('admin');
    expect(VIEW_MODE_LABELS).toHaveProperty('dentista');
  });
});

// =====================================================
// SPRINT 0 — BARREL EXPORTS
// =====================================================

describe('Sprint 0: barrel exports', () => {
  test('lib/utils/index.ts re-exporta formatters', () => {
    expect(typeof utils.formatarMoeda).toBe('function');
    expect(typeof utils.formatarData).toBe('function');
    expect(typeof utils.formatarDataHora).toBe('function');
    expect(typeof utils.formatarCPF).toBe('function');
    expect(typeof utils.formatarTelefone).toBe('function');
  });

  test('lib/utils/index.ts re-exporta validators', () => {
    expect(typeof utils.validarCPF).toBe('function');
    expect(typeof utils.validarEmail).toBe('function');
    expect(typeof utils.validarTelefone).toBe('function');
  });

  test('lib/utils/index.ts re-exporta masks', () => {
    expect(typeof utils.maskCPF).toBe('function');
    expect(typeof utils.maskTelefone).toBe('function');
    expect(typeof utils.maskMoeda).toBe('function');
    expect(typeof utils.unmask).toBe('function');
    expect(typeof utils.unmaskMoeda).toBe('function');
  });

  test('lib/constants/index.ts re-exporta status', () => {
    expect(constants.STATUS_CONFIG).toBeDefined();
    expect(constants.ITEM_STATUS_CONFIG).toBeDefined();
    expect(constants.STATUS_ORDER).toBeDefined();
  });

  test('lib/constants/index.ts re-exporta origens', () => {
    expect(constants.ORIGENS_OPTIONS).toBeDefined();
    expect(constants.ORIGENS_VALIDAS).toBeDefined();
  });

  test('lib/constants/index.ts re-exporta roles', () => {
    expect(constants.ROLE_LABELS).toBeDefined();
    expect(constants.ALL_ROLES).toBeDefined();
  });

  test('lib/constants/index.ts re-exporta navigation', () => {
    expect(constants.MENU_ITEMS).toBeDefined();
    expect(constants.VIEW_MODE_LABELS).toBeDefined();
  });
});
