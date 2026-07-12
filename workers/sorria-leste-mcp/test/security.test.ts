import { describe, expect, it } from 'vitest';
import {
  grantedReadScope,
  isForbiddenFollowupType,
  maskCpf,
  maskEmail,
  maskNullableText,
  maskPhone,
  omitFinancialFields,
  safeEqual,
} from '../src/security';

describe('proteções MCP', () => {
  it('aceita somente o escopo inicial de leitura', () => {
    expect(grantedReadScope([])).toEqual(['sorria.read']);
    expect(grantedReadScope(['sorria.read'])).toEqual(['sorria.read']);
    expect(grantedReadScope(['sorria.write'])).toBeNull();
  });

  it('mascara identificadores pessoais nos resultados', () => {
    expect(maskCpf('123.456.789-00')).toBe('***.***.***-00');
    expect(maskPhone('(85) 99999-1234')).toBe('***1234');
    expect(maskEmail('paciente@example.com')).toBe('p***@example.com');
  });

  it('compara segredos sem retornar cedo', () => {
    expect(safeEqual('mesmo', 'mesmo')).toBe(true);
    expect(safeEqual('mesmo', 'outro')).toBe(false);
  });

  it('remove campos financeiros de objetos aninhados', () => {
    const cleaned = omitFinancialFields({
      id: 1,
      nome: 'Procedimento',
      valor: 100,
      saldo: 50,
      nested: {
        comissao_execucao: 10,
        procedimento: 'Limpeza',
      },
      items: [
        { id: 10, desconto_valor: 5, status: 'ok' },
        { id: 11, pagamento_id: 99, status: 'ok' },
      ],
    });

    const serialized = JSON.stringify(cleaned);
    expect(serialized).not.toContain('valor');
    expect(serialized).not.toContain('saldo');
    expect(serialized).not.toContain('comissao');
    expect(serialized).not.toContain('desconto');
    expect(serialized).not.toContain('pagamento');
    expect(cleaned).toMatchObject({
      id: 1,
      nome: 'Procedimento',
      nested: { procedimento: 'Limpeza' },
      items: [{ id: 10, status: 'ok' }, { id: 11, status: 'ok' }],
    });
  });

  it('oculta texto livre com conteúdo financeiro', () => {
    expect(maskNullableText('Paciente pediu desconto de R$ 120,00')).toBe('[texto oculto]');
    expect(omitFinancialFields({ observacao: 'Retornar sobre Pix amanhã' })).toEqual({ observacao: '[texto oculto]' });
  });

  it('bloqueia follow-up de cobrança', () => {
    expect(isForbiddenFollowupType('cobranca')).toBe(true);
    expect(isForbiddenFollowupType('cobrança')).toBe(true);
    expect(isForbiddenFollowupType('retorno')).toBe(false);
  });
});
