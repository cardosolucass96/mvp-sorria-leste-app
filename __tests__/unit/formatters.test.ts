/**
 * Testes unitários — lib/utils/formatters.ts
 *
 * Cobre: formatarMoeda, formatarData, formatarDataHora, formatarDataCompleta,
 *        formatarCPF, formatarTelefone, formatarPorcentagem, obterIniciais
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
} from '@/lib/utils/formatters';

// ===========================================
// formatarMoeda
// ===========================================
describe('formatarMoeda', () => {
  test('formata valor inteiro', () => {
    const result = formatarMoeda(100);
    expect(result).toContain('100');
    expect(result).toContain('R$');
  });

  test('formata valor com centavos', () => {
    const result = formatarMoeda(1234.56);
    expect(result).toContain('1.234');
    expect(result).toContain('56');
    expect(result).toContain('R$');
  });

  test('formata zero', () => {
    const result = formatarMoeda(0);
    expect(result).toContain('0');
    expect(result).toContain('R$');
  });

  test('formata valor negativo', () => {
    const result = formatarMoeda(-50);
    expect(result).toContain('50');
    expect(result).toContain('R$');
  });

  test('formata valor grande', () => {
    const result = formatarMoeda(1000000);
    expect(result).toContain('1.000.000');
    expect(result).toContain('R$');
  });

  test('formata valor com duas casas decimais', () => {
    const result = formatarMoeda(99.9);
    // Deve exibir R$ 99,90 — com duas casas
    expect(result).toContain('99');
    expect(result).toContain('90');
  });
});

// ===========================================
// formatarData
// ===========================================
describe('formatarData', () => {
  test('formata data ISO como dd/mm/aaaa', () => {
    // Usar formato com T para evitar problemas de timezone
    const result = formatarData('2025-03-15T12:00:00');
    expect(result).toMatch(/15\/03\/2025/);
  });

  test('formata data com hora (ignora hora)', () => {
    const result = formatarData('2025-12-25T10:30:00');
    expect(result).toMatch(/25\/12\/2025/);
  });

  test('formata data no início do ano', () => {
    // Date-only strings ('2025-01-01') são interpretadas como UTC meia-noite,
    // e toLocaleDateString em UTC-3 mostra o dia anterior. Usar datetime para evitar.
    const result = formatarData('2025-01-01T12:00:00');
    expect(result).toMatch(/01\/01\/2025/);
  });

  test('formata data no fim do ano', () => {
    const result = formatarData('2025-12-31T12:00:00');
    expect(result).toMatch(/31\/12\/2025/);
  });
});

// ===========================================
// formatarDataHora
// ===========================================
describe('formatarDataHora', () => {
  test('formata data e hora', () => {
    const result = formatarDataHora('2025-03-15T14:30:00');
    expect(result).toMatch(/15\/03\/2025/);
    expect(result).toMatch(/14:30/);
  });

  test('formata meia-noite', () => {
    const result = formatarDataHora('2025-01-01T00:00:00');
    expect(result).toMatch(/01\/01\/2025/);
    expect(result).toMatch(/00:00/);
  });
});

// ===========================================
// formatarDataCompleta
// ===========================================
describe('formatarDataCompleta', () => {
  test('formata data completa com segundos', () => {
    const result = formatarDataCompleta('2025-03-15T14:30:45');
    expect(result).toMatch(/15\/03\/2025/);
    expect(result).toMatch(/14:30/);
    // Dependendo do locale, pode ter "45" para segundos
  });

  test('retorna string não vazia para data válida', () => {
    const result = formatarDataCompleta('2025-06-20T08:15:30');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ===========================================
// formatarCPF
// ===========================================
describe('formatarCPF', () => {
  test('formata CPF com 11 dígitos', () => {
    expect(formatarCPF('52998224725')).toBe('529.982.247-25');
  });

  test('formata CPF que já tem máscara parcial (remove e remascara)', () => {
    expect(formatarCPF('529.982.247-25')).toBe('529.982.247-25');
  });

  test('retorna "-" para null', () => {
    expect(formatarCPF(null)).toBe('-');
  });

  test('retorna CPF original se não tem 11 dígitos', () => {
    expect(formatarCPF('12345')).toBe('12345');
  });

  test('retorna "-" para string vazia', () => {
    // String vazia '' é falsy em JS, então !cpf === true → retorna '-'
    const result = formatarCPF('');
    expect(result).toBe('-');
  });
});

// ===========================================
// formatarTelefone
// ===========================================
describe('formatarTelefone', () => {
  test('formata celular (11 dígitos)', () => {
    expect(formatarTelefone('11999887766')).toBe('(11) 99988-7766');
  });

  test('formata fixo (10 dígitos)', () => {
    expect(formatarTelefone('1133445566')).toBe('(11) 3344-5566');
  });

  test('retorna "-" para null', () => {
    expect(formatarTelefone(null)).toBe('-');
  });

  test('retorna original se não é 10 nem 11 dígitos', () => {
    expect(formatarTelefone('12345')).toBe('12345');
  });

  test('retorna "-" para string vazia', () => {
    // String vazia '' é falsy em JS, então !telefone === true → retorna '-'
    const result = formatarTelefone('');
    expect(result).toBe('-');
  });

  test('formata telefone que já tem máscara', () => {
    // '(11) 99988-7766' → remove → '11999887766' → 11 dígitos → remascara
    expect(formatarTelefone('(11) 99988-7766')).toBe('(11) 99988-7766');
  });
});

// ===========================================
// formatarPorcentagem
// ===========================================
describe('formatarPorcentagem', () => {
  test('formata inteiro', () => {
    expect(formatarPorcentagem(15)).toBe('15%');
  });

  test('formata zero', () => {
    expect(formatarPorcentagem(0)).toBe('0%');
  });

  test('formata 100', () => {
    expect(formatarPorcentagem(100)).toBe('100%');
  });

  test('formata decimal', () => {
    expect(formatarPorcentagem(12.5)).toBe('12.5%');
  });
});

// ===========================================
// obterIniciais
// ===========================================
describe('obterIniciais', () => {
  test('retorna iniciais de nome completo', () => {
    expect(obterIniciais('Lucas Cardoso')).toBe('LC');
  });

  test('retorna iniciais de nome com 3 partes (pega as 2 primeiras)', () => {
    expect(obterIniciais('Maria da Silva')).toBe('MD');
  });

  test('retorna uma inicial para nome simples', () => {
    expect(obterIniciais('Lucas')).toBe('L');
  });

  test('retorna iniciais em maiúsculo', () => {
    expect(obterIniciais('lucas cardoso')).toBe('LC');
  });

  test('ignora espaços extras', () => {
    expect(obterIniciais('  Lucas  Cardoso  ')).toBe('LC');
  });

  test('retorna no máximo 2 iniciais', () => {
    expect(obterIniciais('Ana Maria da Silva')).toBe('AM');
  });
});
