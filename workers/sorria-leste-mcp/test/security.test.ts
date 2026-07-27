import { describe, expect, it } from 'vitest';
import {
  canAuthorizeScopes,
  grantedScopes,
  hasFinancialScope,
  hasWriteScope,
  isForbiddenFollowupType,
  isMcpWriter,
  maskCpf,
  maskEmail,
  maskNullableText,
  maskPhone,
  omitFinancialFields,
  safeEqual,
} from '../src/security';

describe('proteções MCP', () => {
  it('aceita leitura operacional e financeira sem perder o escopo base', () => {
    expect(grantedScopes([])).toEqual(['sorria.read']);
    expect(grantedScopes(['sorria.read'])).toEqual(['sorria.read']);
    expect(grantedScopes(['sorria.finance.read'])).toEqual(['sorria.finance.read', 'sorria.read']);
    expect(grantedScopes(['sorria.read', 'sorria.finance.read'])).toEqual(['sorria.finance.read', 'sorria.read']);
    expect(grantedScopes(['sorria.write'])).toEqual(['sorria.write']);
    expect(hasFinancialScope(['sorria.read'])).toBe(false);
    expect(hasFinancialScope(['sorria.read', 'sorria.finance.read'])).toBe(true);
    expect(hasWriteScope(['sorria.write'])).toBe(true);
    expect(grantedScopes(['sorria.admin'])).toBeNull();
  });

  it('separa permissão de escrita da permissão administrativa de leitura', () => {
    const env = {
      MCP_ALLOWED_EMAILS: 'admin@sorria.com',
      MCP_WRITE_ALLOWED_EMAILS: 'sdr@sorria.com, admin@sorria.com',
    } as never;
    const admin = { email: 'admin@sorria.com', role: 'admin', ativo: 1 };
    const sdr = { email: 'sdr@sorria.com', role: 'atendente', ativo: 1 };
    const outsider = { email: 'outro@sorria.com', role: 'atendente', ativo: 1 };

    expect(isMcpWriter(sdr, env)).toBe(true);
    expect(canAuthorizeScopes(admin, env, ['sorria.read'])).toBe(true);
    expect(canAuthorizeScopes(admin, env, ['sorria.write'])).toBe(true);
    expect(canAuthorizeScopes(sdr, env, ['sorria.write'])).toBe(true);
    expect(canAuthorizeScopes(sdr, env, ['sorria.finance.read', 'sorria.read'])).toBe(false);
    expect(canAuthorizeScopes(outsider, env, ['sorria.write'])).toBe(false);
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
    expect(maskNullableText('Paciente pediu desconto de R$ 120,00', 140, { allowFinancialText: true })).toBe('Paciente pediu desconto de R$ 120,00');
    expect(omitFinancialFields({ observacao: 'Retornar sobre Pix amanhã' })).toEqual({ observacao: '[texto oculto]' });
  });

  it('bloqueia follow-up de cobrança', () => {
    expect(isForbiddenFollowupType('cobranca')).toBe(true);
    expect(isForbiddenFollowupType('cobrança')).toBe(true);
    expect(isForbiddenFollowupType('retorno')).toBe(false);
  });
});
