/**
 * Testes unitários — lib/utils/masks.ts
 *
 * Cobre: maskCPF, maskTelefone, maskMoeda, unmask, unmaskMoeda
 */

import {
  maskCPF,
  maskTelefone,
  maskMoeda,
  unmask,
  unmaskMoeda,
} from '@/lib/utils/masks';

// ===========================================
// maskCPF
// ===========================================
describe('maskCPF', () => {
  test('máscara vazia para string vazia', () => {
    expect(maskCPF('')).toBe('');
  });

  test('1 dígito — sem pontuação', () => {
    expect(maskCPF('5')).toBe('5');
  });

  test('3 dígitos — sem pontuação', () => {
    expect(maskCPF('529')).toBe('529');
  });

  test('4 dígitos — adiciona primeiro ponto', () => {
    expect(maskCPF('5299')).toBe('529.9');
  });

  test('6 dígitos — primeiro bloco completo', () => {
    expect(maskCPF('529982')).toBe('529.982');
  });

  test('7 dígitos — adiciona segundo ponto', () => {
    expect(maskCPF('5299822')).toBe('529.982.2');
  });

  test('9 dígitos — segundo bloco completo', () => {
    expect(maskCPF('529982247')).toBe('529.982.247');
  });

  test('10 dígitos — adiciona traço', () => {
    expect(maskCPF('5299822472')).toBe('529.982.247-2');
  });

  test('11 dígitos — CPF completo', () => {
    expect(maskCPF('52998224725')).toBe('529.982.247-25');
  });

  test('mais de 11 dígitos — trunca', () => {
    expect(maskCPF('529982247251234')).toBe('529.982.247-25');
  });

  test('ignora caracteres não numéricos na entrada', () => {
    expect(maskCPF('529.982.247-25')).toBe('529.982.247-25');
  });

  test('entrada com letras — extrai apenas dígitos', () => {
    expect(maskCPF('abc529def')).toBe('529');
  });
});

// ===========================================
// maskTelefone
// ===========================================
describe('maskTelefone', () => {
  test('máscara vazia para string vazia', () => {
    expect(maskTelefone('')).toBe('(');
  });

  test('1 dígito', () => {
    expect(maskTelefone('1')).toBe('(1');
  });

  test('2 dígitos — DDD', () => {
    expect(maskTelefone('11')).toBe('(11');
  });

  test('3 dígitos — abre parêntese e espaço', () => {
    expect(maskTelefone('119')).toBe('(11) 9');
  });

  test('6 dígitos', () => {
    expect(maskTelefone('119998')).toBe('(11) 9998');
  });

  test('10 dígitos — telefone fixo completo', () => {
    expect(maskTelefone('1133445566')).toBe('(11) 3344-5566');
  });

  test('11 dígitos — celular completo', () => {
    expect(maskTelefone('11999887766')).toBe('(11) 99988-7766');
  });

  test('mais de 11 dígitos — trunca', () => {
    expect(maskTelefone('119998877661234')).toBe('(11) 99988-7766');
  });

  test('ignora caracteres não numéricos', () => {
    expect(maskTelefone('(11) 99988-7766')).toBe('(11) 99988-7766');
  });
});

// ===========================================
// maskMoeda
// ===========================================
describe('maskMoeda', () => {
  test('retorna vazio para string vazia', () => {
    expect(maskMoeda('')).toBe('');
  });

  test('retorna vazio para string sem dígitos', () => {
    expect(maskMoeda('abc')).toBe('');
  });

  test('1 dígito → centavos (R$ 0,01)', () => {
    expect(maskMoeda('1')).toBe('R$ 0,01');
  });

  test('2 dígitos → centavos (R$ 0,12)', () => {
    expect(maskMoeda('12')).toBe('R$ 0,12');
  });

  test('3 dígitos → R$ 1,23', () => {
    expect(maskMoeda('123')).toBe('R$ 1,23');
  });

  test('5 dígitos → R$ 123,45', () => {
    expect(maskMoeda('12345')).toBe('R$ 123,45');
  });

  test('6 dígitos → R$ 1.234,56', () => {
    expect(maskMoeda('123456')).toBe('R$ 1.234,56');
  });

  test('7 dígitos → R$ 12.345,67', () => {
    expect(maskMoeda('1234567')).toBe('R$ 12.345,67');
  });

  test('9 dígitos → R$ 1.234.567,89', () => {
    expect(maskMoeda('123456789')).toBe('R$ 1.234.567,89');
  });

  test('entrada já formatada — extrai dígitos e reformata', () => {
    expect(maskMoeda('R$ 1.234,56')).toBe('R$ 1.234,56');
  });

  test('entrada com zeros à esquerda', () => {
    expect(maskMoeda('001')).toBe('R$ 0,01');
  });
});

// ===========================================
// unmask
// ===========================================
describe('unmask', () => {
  test('remove pontos e traços de CPF', () => {
    expect(unmask('529.982.247-25')).toBe('52998224725');
  });

  test('remove parênteses, espaços e traço de telefone', () => {
    expect(unmask('(11) 99988-7766')).toBe('11999887766');
  });

  test('retorna vazio para string vazia', () => {
    expect(unmask('')).toBe('');
  });

  test('retorna apenas dígitos de string mista', () => {
    expect(unmask('abc123def456')).toBe('123456');
  });

  test('retorna string inalterada se já é só dígitos', () => {
    expect(unmask('12345')).toBe('12345');
  });

  test('retorna vazio se não tem dígitos', () => {
    expect(unmask('abcdef')).toBe('');
  });
});

// ===========================================
// unmaskMoeda
// ===========================================
describe('unmaskMoeda', () => {
  test('converte "R$ 1.234,56" → 1234.56', () => {
    expect(unmaskMoeda('R$ 1.234,56')).toBe(1234.56);
  });

  test('converte "R$ 0,01" → 0.01', () => {
    expect(unmaskMoeda('R$ 0,01')).toBe(0.01);
  });

  test('converte "R$ 100,00" → 100', () => {
    expect(unmaskMoeda('R$ 100,00')).toBe(100);
  });

  test('converte "R$ 0,00" → 0', () => {
    expect(unmaskMoeda('R$ 0,00')).toBe(0);
  });

  test('retorna 0 para string vazia', () => {
    expect(unmaskMoeda('')).toBe(0);
  });

  test('retorna 0 para string sem dígitos', () => {
    expect(unmaskMoeda('abc')).toBe(0);
  });

  test('converte "15000" → 150 (interpreta como centavos)', () => {
    expect(unmaskMoeda('15000')).toBe(150);
  });

  test('converte "R$ 99,90" → 99.9', () => {
    expect(unmaskMoeda('R$ 99,90')).toBe(99.9);
  });
});
