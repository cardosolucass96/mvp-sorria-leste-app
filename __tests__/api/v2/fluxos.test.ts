import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  getExecutedQueries,
  mockQueryResponse,
  resetMockDb,
  setMockCloudflareEnv,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1,
    email: 'admin@test.com',
    role: 'admin',
    roles: ['admin'],
    nome: 'Admin Teste',
    unidade_ids: [1],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86_400,
  }),
}));

import { POST as createAppointment } from '@/app/api/v2/agenda/route';
import { POST as createReceipt } from '@/app/api/v2/recebimentos/route';
import { POST as finishEvaluation } from '@/app/api/v2/avaliacoes/[id]/concluir/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  setMockCloudflareEnv({ PROCEDURE_CENTRIC_FLOW: 'true' });
  mockQueryResponse('select id from unidades', { id: 1 });
});

afterEach(() => teardownCloudflareContextMock());

describe('fluxos críticos V2', () => {
  it('rejeita agendamento sem data antes de gravar', async () => {
    mockQueryResponse('join cliente_unidades_v2', { id: 10, nome: 'Paciente' });
    const response = await callRoute<{ error: string }>(createAppointment, '/api/v2/agenda', {
      method: 'POST',
      body: { cliente_id: 10, finalidade_avaliacao: true, avaliador_id: 6 },
      headers: { 'X-Unidade-Id': '1' },
    });
    expect(response.status).toBe(400);
    expect(response.data.error).toContain('data_agendada');
    expect(getExecutedQueries().some((query) => query.sql.includes('INSERT INTO agenda_compromissos'))).toBe(false);
  });

  it('registra recebimento avulso sem criar atendimento clínico', async () => {
    mockQueryResponse('join cliente_unidades_v2', { id: 10, nome: 'Paciente' });
    mockQueryResponse('select id from formas_pagamento', [{ id: 2 }]);
    const response = await callRoute<{ id: string; atendimento_clinico_id: null }>(createReceipt, '/api/v2/recebimentos', {
      method: 'POST',
      headers: { 'X-Unidade-Id': '1', 'Idempotency-Key': 'receipt-test-1' },
      body: {
        cliente_id: 10,
        canal: 'presencial',
        formas: [{ forma_pagamento_id: 2, valor_centavos: 15_000 }],
        alocacoes: [],
      },
    });
    expect(response.status).toBe(201);
    expect(response.data.atendimento_clinico_id).toBeNull();
    const sql = getExecutedQueries().map((query) => query.sql).join('\n');
    expect(sql).toContain('INSERT INTO recebimentos');
    expect(sql).not.toContain('INSERT INTO atendimentos_clinicos');
  });

  it('exige motivo ao concluir avaliação sem procedimento', async () => {
    mockQueryResponse('select * from avaliacoes', {
      id: 'evaluation-1',
      cliente_id: 10,
      avaliador_id: 1,
      status: 'em_andamento',
      unidade_id: 1,
    });
    mockQueryResponse('count(*) as total from procedimentos_cliente', { total: 0 });
    const response = await callRoute<{ error: string }>(
      finishEvaluation,
      '/api/v2/avaliacoes/evaluation-1/concluir',
      { method: 'POST', body: {}, headers: { 'X-Unidade-Id': '1' } },
      createRouteContext({ id: 'evaluation-1' }),
    );
    expect(response.status).toBe(400);
    expect(response.data.error).toContain('motivo_sem_orcamento');
  });
});
