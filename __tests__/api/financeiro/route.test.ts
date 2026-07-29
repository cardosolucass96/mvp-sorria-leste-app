import { callRoute } from '../../helpers/api-test-helper';
import { generateToken } from '@/lib/auth/jwt';
import type { FechamentoCaixaResponse } from '@/lib/fechamento-caixa/types';
import type { FinanceiroResponse } from '@/lib/financeiro/types';

jest.mock('@/lib/helpers/fechamentoCaixa', () => ({
  obterFechamentoCaixaResponse: jest.fn(),
}));

import { GET } from '@/app/api/financeiro/route';
import { obterFechamentoCaixaResponse } from '@/lib/helpers/fechamentoCaixa';

const mockObterFechamentoCaixaResponse = obterFechamentoCaixaResponse as jest.MockedFunction<typeof obterFechamentoCaixaResponse>;
let consoleErrorSpy: jest.SpyInstance;

function createFechamentoFixture(dataReferencia: string): FechamentoCaixaResponse {
  const day = Number(dataReferencia.slice(-2));
  const totalBruto = day * 100;
  const totalLiquido = day * 90;
  const totalFinal = day * 70;
  const totalDiarias = day * 5;
  const totalComissao = day * 10;
  const hasCancelamento = dataReferencia.endsWith('02');
  const metodo = dataReferencia.endsWith('01') ? 'pix' : 'dinheiro';
  const view = {
    data_referencia: dataReferencia,
    unidade_id: 9,
    unidade_nome: 'Unidade Aldeota',
    editado_manual: hasCancelamento,
    ajustes_count: hasCancelamento ? 1 : 0,
    resumo: {
      faturamento_dia: totalBruto,
      total_bruto: totalBruto,
      total_liquido: totalLiquido,
      faturamento_por_metodo: [{ metodo, total: totalBruto, quantidade: 1 }],
      procedimentos_executados: day,
      total_diarias: totalDiarias,
      total_comissao_avaliacao: totalComissao,
      total_comissao_execucao: 0,
      ajustes_manuais: hasCancelamento ? -15 : 0,
      total_final: totalFinal,
      pagamentos_cancelados_dia: {
        quantidade: hasCancelamento ? 1 : 0,
        valor: hasCancelamento ? 25 : 0,
      },
    },
    graficos: {
      procedimentos_por_quantidade: [],
      ranking_avaliadores: [],
      ranking_executores: [],
    },
    dentistas: [],
    avaliacoes_pagas_dia: [],
    lancamentos_manuais_gerais: [],
    pagamentos_recebidos_dia: [{
      id: `grupo:${dataReferencia}`,
      pagamento_grupo_id: day,
      pagamento_representante_id: day,
      atendimento_id: day,
      cliente_id: day,
      cliente_nome: 'Paciente Teste',
      cliente_cpf: null,
      cliente_telefone: null,
      valor_total: totalBruto,
      observacoes: null,
      cancelado: false,
      motivo_cancelamento: null,
      created_at: `${dataReferencia} 10:00:00`,
      recebido_por_id: 77,
      recebido_por_nome: 'Admin Teste',
      formas: [{
        id: day,
        valor: totalBruto,
        metodo,
        forma_pagamento_id: null,
        forma_pagamento_grupo_snapshot: metodo,
        forma_pagamento_subgrupo_snapshot: null,
        valor_taxa: null,
        valor_liquido: totalLiquido,
        observacoes: null,
        cancelado: false,
        motivo_cancelamento: null,
        created_at: `${dataReferencia} 10:00:00`,
      }],
    }],
  };

  return {
    fechamento: {
      id: day,
      unidade_id: 9,
      data_referencia: dataReferencia,
      status: dataReferencia.endsWith('01') ? 'fechado' : 'aberto',
      editado_manual: hasCancelamento,
      ajustes_count: hasCancelamento ? 1 : 0,
      fechado_por_id: dataReferencia.endsWith('01') ? 77 : null,
      fechado_por_nome: dataReferencia.endsWith('01') ? 'Admin Teste' : null,
      fechado_em: dataReferencia.endsWith('01') ? `${dataReferencia} 18:00:00` : null,
      updated_by_id: 77,
      updated_by_nome: 'Admin Teste',
      updated_at: `${dataReferencia} 18:00:00`,
    },
    draft: {
      profissionais: {},
      procedimentos: {},
      lancamentos_manuais: [],
    },
    base: view,
    resultado: view,
    recentes: [],
  };
}

async function buildAuthHeaders(role: 'admin' | 'atendente' | 'avaliador' | 'executor' = 'admin') {
  const token = await generateToken({
    id: 77,
    email: `${role}@sorria.com`,
    role,
    roles: [role],
    nome: `${role} Teste`,
    unidade_ids: [9],
    unidade_atual: 9,
  });

  return {
    Authorization: `Bearer ${token}`,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockObterFechamentoCaixaResponse.mockImplementation(async (_unidadeId, dataReferencia) => (
    createFechamentoFixture(dataReferencia)
  ));
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('GET /api/financeiro', () => {
  it('permite admin e agrega o período usando fechamentos por dia', async () => {
    const { status, data } = await callRoute<FinanceiroResponse>(GET, '/api/financeiro', {
      searchParams: {
        data: '2026-06-07',
        data_inicio: '2026-06-01',
        data_fim: '2026-06-02',
      },
      headers: await buildAuthHeaders('admin'),
    });

    expect(status).toBe(200);
    expect(data.dia.meta.data_referencia).toBe('2026-06-07');
    expect(data.periodo).toEqual({
      data_inicio: '2026-06-01',
      data_fim: '2026-06-02',
      dias: 2,
    });
    expect(data.dias).toHaveLength(2);
    expect(data.resumo_periodo.total_liquido).toBe(270);
    expect(data.resumo_periodo.total_final).toBe(210);
    expect(data.graficos.faturamento_por_dia).toHaveLength(2);
    expect(data.graficos.metodos_pagamento.map((item) => item.metodo)).toEqual(['dinheiro', 'pix']);
    expect(mockObterFechamentoCaixaResponse).toHaveBeenCalledWith(9, '2026-06-07');
    expect(mockObterFechamentoCaixaResponse).toHaveBeenCalledWith(9, '2026-06-01');
    expect(mockObterFechamentoCaixaResponse).toHaveBeenCalledWith(9, '2026-06-02');
  });

  it('rejeita atendente', async () => {
    const { status, data } = await callRoute<{ error: string }>(GET, '/api/financeiro', {
      searchParams: {
        data: '2026-06-07',
        data_inicio: '2026-06-01',
        data_fim: '2026-06-02',
      },
      headers: await buildAuthHeaders('atendente'),
    });

    expect(status).toBe(403);
    expect(data.error).toContain('não autorizado');
    expect(mockObterFechamentoCaixaResponse).not.toHaveBeenCalled();
  });

  it('rejeita data inválida', async () => {
    const { status, data } = await callRoute<{ error: string }>(GET, '/api/financeiro', {
      searchParams: {
        data: '07/06/2026',
        data_inicio: '2026-06-01',
        data_fim: '2026-06-02',
      },
      headers: await buildAuthHeaders('admin'),
    });

    expect(status).toBe(400);
    expect(data.error).toContain('Data inválida');
    expect(mockObterFechamentoCaixaResponse).not.toHaveBeenCalled();
  });

  it('rejeita início maior que fim', async () => {
    const { status, data } = await callRoute<{ error: string }>(GET, '/api/financeiro', {
      searchParams: {
        data: '2026-06-07',
        data_inicio: '2026-06-08',
        data_fim: '2026-06-02',
      },
      headers: await buildAuthHeaders('admin'),
    });

    expect(status).toBe(400);
    expect(data.error).toContain('Data início');
    expect(mockObterFechamentoCaixaResponse).not.toHaveBeenCalled();
  });

  it('rejeita período maior que 31 dias', async () => {
    const { status, data } = await callRoute<{ error: string }>(GET, '/api/financeiro', {
      searchParams: {
        data: '2026-06-07',
        data_inicio: '2026-06-01',
        data_fim: '2026-07-02',
      },
      headers: await buildAuthHeaders('admin'),
    });

    expect(status).toBe(400);
    expect(data.error).toContain('Período máximo');
    expect(mockObterFechamentoCaixaResponse).not.toHaveBeenCalled();
  });
});
