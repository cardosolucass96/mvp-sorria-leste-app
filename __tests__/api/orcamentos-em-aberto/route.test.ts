import { callRoute } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 2,
    email: 'atendente@test.com',
    role: 'atendente',
    nome: 'Atendente Teste',
    unidade_ids: [1],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { GET as listOrcamentosEmAberto } from '@/app/api/orcamentos-em-aberto/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('GET /api/orcamentos-em-aberto', () => {
  it('agrupa orçamentos por atendimento e expõe subprocedimentos com situação de agendamento', async () => {
    mockQueryResponse('from itens_atendimento i', [
      {
        item_id: 10,
        atendimento_id: 1,
        cliente_id: 101,
        cliente_nome: 'Maria Silva',
        cliente_telefone: '85999990000',
        orcamento_em: '2026-07-10 09:00:00',
        procedimento_id: 201,
        procedimento_nome: 'Limpeza',
        tem_etapas: 0,
        valor: 300,
        valor_final: 300,
        valor_pago: 100,
        etapas_valores: null,
        item_created_at: '2026-07-10 09:05:00',
      },
      {
        item_id: 20,
        atendimento_id: 2,
        cliente_id: 102,
        cliente_nome: 'Carlos Lima',
        cliente_telefone: null,
        orcamento_em: '2026-07-11 08:00:00',
        procedimento_id: 202,
        procedimento_nome: 'Canal',
        tem_etapas: 1,
        valor: 200,
        valor_final: 200,
        valor_pago: 0,
        etapas_valores: null,
        item_created_at: '2026-07-11 08:20:00',
      },
    ]);

    mockQueryResponse('from agendamentos ag', [
      {
        agendamento_id: 301,
        atendimento_origem_id: 2,
        item_atendimento_origem_id: 20,
        cliente_id: 102,
        cliente_nome: 'Carlos Lima',
        cliente_telefone: null,
        orcamento_em: '2026-07-11 08:00:00',
        procedimento_id: 202,
        procedimento_nome: 'Canal',
        etapa_modelo_id: 7,
        etapa_modelo_nome: 'Sessão 1',
        status: 'agendado',
        data_agendada: '2026-07-20 10:00:00',
        valor: 200,
        valor_pago: 0,
        agendamento_created_at: '2026-07-12 09:00:00',
      },
    ]);

    mockQueryResponse('from procedimento_etapas_modelo where procedimento_id = ?', [
      { id: 7, nome: 'Sessão 1', valor: 200 },
    ]);
    mockQueryResponse('where pa.item_atendimento_id = ? and pa.etapa_modelo_id = ? and p.cancelado = 0', { total: 0 });

    const { status, data } = await callRoute<{
      summary: {
        valor_total_aberto: number;
        orcamentos_abertos: number;
        subprocedimentos_abertos: number;
        sem_agendamento: number;
        agendamento_sem_data: number;
        agendado_com_data: number;
      };
      items: Array<{
        atendimento_id: number;
        valor_total_aberto: number;
        subprocedimentos: Array<{
          procedimento_nome: string;
          etapa_label: string | null;
          situacao_agendamento: string;
          agendamento_id: number | null;
        }>;
      }>;
    }>(listOrcamentosEmAberto, '/api/orcamentos-em-aberto');

    expect(status).toBe(200);
    expect(data.summary).toEqual({
      valor_total_aberto: 400,
      orcamentos_abertos: 2,
      subprocedimentos_abertos: 2,
      sem_agendamento: 1,
      agendamento_sem_data: 0,
      agendado_com_data: 1,
    });

    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toEqual(expect.objectContaining({
      atendimento_id: 2,
      valor_total_aberto: 200,
      subprocedimentos: [
        expect.objectContaining({
          procedimento_nome: 'Canal',
          etapa_label: 'Sessão 1',
          situacao_agendamento: 'agendado_com_data',
          agendamento_id: 301,
        }),
      ],
    }));
    expect(data.items[1]).toEqual(expect.objectContaining({
      atendimento_id: 1,
      valor_total_aberto: 200,
      subprocedimentos: [
        expect.objectContaining({
          procedimento_nome: 'Limpeza',
          etapa_label: null,
          situacao_agendamento: 'sem_agendamento',
          agendamento_id: null,
        }),
      ],
    }));

    const queries = getExecutedQueries();
    const itensQuery = queries.find((query) => query.sql.includes('FROM itens_atendimento i'));
    expect(itensQuery?.sql).toContain("COALESCE(a.tipo, 'normal') != 'sessao'");
    expect(itensQuery?.sql).toContain('i.adicionado_em_execucao = 0');
  });
});
