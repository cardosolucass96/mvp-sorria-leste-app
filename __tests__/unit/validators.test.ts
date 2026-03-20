/**
 * Testes unitários — lib/utils/validators.ts
 * 
 * Cobre: validarCPF, validarEmail, validarTelefone, validarObrigatorio, validarValor
 */

import {
  validarCPF,
  validarEmail,
  validarTelefone,
  validarObrigatorio,
  validarValor,
} from '@/lib/utils/validators';

// ===========================================
// validarCPF
// ===========================================
describe('validarCPF', () => {
  describe('CPFs válidos', () => {
    const cpfsValidos = [
      '52998224725',
      '11144477735',
      '529.982.247-25',       // com máscara
      '111.444.777-35',       // com máscara
    ];

    test.each(cpfsValidos)('aceita CPF válido: %s', (cpf) => {
      expect(validarCPF(cpf)).toBe(true);
    });
  });

  describe('CPFs com todos os dígitos iguais', () => {
    const cpfsIguais = [
      '00000000000',
      '11111111111',
      '22222222222',
      '33333333333',
      '44444444444',
      '55555555555',
      '66666666666',
      '77777777777',
      '88888888888',
      '99999999999',
    ];

    test.each(cpfsIguais)('rejeita CPF com dígitos iguais: %s', (cpf) => {
      expect(validarCPF(cpf)).toBe(false);
    });
  });

  describe('CPFs com dígito verificador errado', () => {
    test('rejeita CPF com 1º dígito verificador errado', () => {
      expect(validarCPF('52998224735')).toBe(false); // último dígito alterado
    });

    test('rejeita CPF com 2º dígito verificador errado', () => {
      expect(validarCPF('52998224726')).toBe(false); // penúltimo dígito alterado
    });
  });

  describe('CPFs com tamanho inválido', () => {
    test('rejeita CPF muito curto', () => {
      expect(validarCPF('1234567890')).toBe(false); // 10 dígitos
    });

    test('rejeita CPF muito longo', () => {
      expect(validarCPF('123456789012')).toBe(false); // 12 dígitos
    });

    test('rejeita CPF vazio', () => {
      expect(validarCPF('')).toBe(false);
    });
  });

  describe('CPFs com caracteres inválidos', () => {
    test('rejeita CPF com letras (fica com menos de 11 dígitos)', () => {
      expect(validarCPF('abcdefghijk')).toBe(false);
    });

    test('remove caracteres não-numéricos e valida', () => {
      // '529.982.247-25' → '52998224725' (válido)
      expect(validarCPF('529.982.247-25')).toBe(true);
    });
  });
});

// ===========================================
// validarEmail
// ===========================================
describe('validarEmail', () => {
  describe('emails válidos', () => {
    const emailsValidos = [
      'user@example.com',
      'User.Name@example.com',
      'user+tag@example.com',
      'user@sub.domain.com',
      'a@b.co',
    ];

    test.each(emailsValidos)('aceita email válido: %s', (email) => {
      expect(validarEmail(email)).toBe(true);
    });
  });

  describe('emails inválidos', () => {
    const emailsInvalidos = [
      '',                    // vazio
      'sem-arroba.com',     // sem @
      '@sem-local.com',     // sem parte local
      'user@',              // sem domínio
      'user@.com',          // domínio inválido
      'user @example.com',  // espaço na parte local
      'user@ example.com',  // espaço no domínio
    ];

    test.each(emailsInvalidos)('rejeita email inválido: %s', (email) => {
      expect(validarEmail(email)).toBe(false);
    });
  });
});

// ===========================================
// validarTelefone
// ===========================================
describe('validarTelefone', () => {
  describe('telefones válidos', () => {
    test('aceita telefone fixo (10 dígitos)', () => {
      expect(validarTelefone('1133445566')).toBe(true);
    });

    test('aceita celular (11 dígitos)', () => {
      expect(validarTelefone('11999887766')).toBe(true);
    });

    test('aceita com máscara: (11) 3344-5566', () => {
      expect(validarTelefone('(11) 3344-5566')).toBe(true);
    });

    test('aceita com máscara: (11) 99988-7766', () => {
      expect(validarTelefone('(11) 99988-7766')).toBe(true);
    });
  });

  describe('telefones inválidos', () => {
    test('rejeita com menos de 10 dígitos', () => {
      expect(validarTelefone('123456789')).toBe(false); // 9 dígitos
    });

    test('rejeita com mais de 11 dígitos', () => {
      expect(validarTelefone('123456789012')).toBe(false); // 12 dígitos
    });

    test('rejeita vazio', () => {
      expect(validarTelefone('')).toBe(false);
    });

    test('rejeita só letras', () => {
      expect(validarTelefone('abcdefghij')).toBe(false);
    });
  });
});

// ===========================================
// validarObrigatorio
// ===========================================
describe('validarObrigatorio', () => {
  test('aceita string com conteúdo', () => {
    expect(validarObrigatorio('texto')).toBe(true);
  });

  test('aceita string com espaços e conteúdo', () => {
    expect(validarObrigatorio('  texto  ')).toBe(true);
  });

  test('rejeita string vazia', () => {
    expect(validarObrigatorio('')).toBe(false);
  });

  test('rejeita string só com espaços', () => {
    expect(validarObrigatorio('   ')).toBe(false);
  });

  test('rejeita string só com tabs e newlines', () => {
    expect(validarObrigatorio('\t\n  ')).toBe(false);
  });
});

// ===========================================
// validarValor
// ===========================================
describe('validarValor', () => {
  describe('valores válidos', () => {
    test('aceita inteiro positivo', () => {
      expect(validarValor(100)).toBe(true);
    });

    test('aceita decimal positivo', () => {
      expect(validarValor(99.99)).toBe(true);
    });

    test('aceita valor muito pequeno', () => {
      expect(validarValor(0.01)).toBe(true);
    });

    test('aceita valor grande', () => {
      expect(validarValor(999999.99)).toBe(true);
    });
  });

  describe('valores inválidos', () => {
    test('rejeita zero', () => {
      expect(validarValor(0)).toBe(false);
    });

    test('rejeita negativo', () => {
      expect(validarValor(-1)).toBe(false);
    });

    test('rejeita NaN', () => {
      expect(validarValor(NaN)).toBe(false);
    });

    test('rejeita Infinity', () => {
      expect(validarValor(Infinity)).toBe(false);
    });

    test('rejeita -Infinity', () => {
      expect(validarValor(-Infinity)).toBe(false);
    });

    test('rejeita string como número (type coercion)', () => {
      // TypeScript não permitiria, mas runtime pode receber
      expect(validarValor('100' as unknown as number)).toBe(false);
    });
  });
});
