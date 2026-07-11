import { callRoute } from '../../helpers/api-test-helper';
import { generateToken } from '@/lib/auth/jwt';
import type { FechamentoCaixaResponse } from '@/lib/fechamento-caixa/types';

jest.mock('@/lib/helpers/fechamentoCaixa', () => {
  const actual = jest.requireActual('@/lib/helpers/fechamentoCaixa');
  return {
    ...actual,
    obterFechamentoCaixaResponse: jest.fn(),
    salvarDraftFechamentoCaixa: jest.fn(),
    fecharFechamentoCaixa: jest.fn(),
    reabrirFechamentoCaixa: jest.fn(),
  };
});

import { GET, PUT } from '@/app/api/fechamento-caixa/route';
import { POST as postFechar } from '@/app/api/fechamento-caixa/fechar/route';
import { POST as postReabrir } from '@/app/api/fechamento-caixa/reabrir/route';
import {
  obterFechamentoCaixaResponse,
  salvarDraftFechamentoCaixa,
  fecharFechamentoCaixa,
  reabrirFechamentoCaixa,
} from '@/lib/helpers/fechamentoCaixa';

const mockObterFechamentoCaixaResponse = obterFechamentoCaixaResponse as jest.MockedFunction<typeof obterFechamentoCaixaResponse>;
const mockSalvarDraftFechamentoCaixa = salvarDraftFechamentoCaixa as jest.MockedFunction<typeof salvarDraftFechamentoCaixa>;
const mockFecharFechamentoCaixa = fecharFechamentoCaixa as jest.MockedFunction<typeof fecharFechamentoCaixa>;
const mockReabrirFechamentoCaixa = reabrirFechamentoCaixa as jest.MockedFunction<typeof reabrirFechamentoCaixa>;
let consoleErrorSpy: jest.SpyInstance;

function createResponseFixture(overrides: Partial<FechamentoCaixaResponse> = {}): FechamentoCaixaResponse {
  const baseView = {
    data_referencia: '2026-06-07',
    unidade_id: 9,
    unidade_nome: 'Unidade Aldeota',
    editado_manual: false,
    ajustes_count: 0,
    resumo: {
      faturamento_dia: 1000,
      faturamento_por_metodo: [{ metodo: 'pix', total: 1000, quantidade: 1 }],
      procedimentos_executados: 1,
      total_diarias: 100,
      total_comissao_avaliacao: 20,
      total_comissao_execucao: 0,
      ajustes_manuais: 0,
      total_final: 880,
      pagamentos_cancelados_dia: { quantidade: 0, valor: 0 },
    },
    graficos: {
      procedimentos_por_quantidade: [{ nome: 'Limpeza', quantidade: 1, valor_total: 200 }],
      ranking_avaliadores: [{ usuario_id: 77, nome: 'Admin Teste', valor_gerado: 200, quantidade: 1 }],
      ranking_executores: [{ usuario_id: 77, nome: 'Admin Teste', valor_gerado: 200, quantidade: 1 }],
    },
    dentistas: [{
      usuario_id: 77,
      nome: 'Admin Teste',
      included: true,
      manualmente_editado: false,
      ajuste_count: 0,
      valor_diaria: 100,
      comissao_avaliacao: 20,
      comissao_execucao: 0,
      ajustes: [],
      lancamentos_manuais: [],
      total_dia: 120,
      procedimentos_executados: [],
    }],
    lancamentos_manuais_gerais: [],
    pagamentos_recebidos_dia: [],
  };

  return {
    fechamento: {
      id: 1,
      unidade_id: 9,
      data_referencia: '2026-06-07',
      status: 'aberto',
      editado_manual: false,
      ajustes_count: 0,
      fechado_por_id: null,
      fechado_por_nome: null,
      fechado_em: null,
      updated_by_id: 77,
      updated_by_nome: 'Admin Teste',
      updated_at: '2026-06-07 18:00:00',
    },
    draft: {
      profissionais: {},
      procedimentos: {},
      lancamentos_manuais: [],
    },
    base: baseView,
    resultado: baseView,
    recentes: [],
    ...overrides,
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
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('GET /api/fechamento-caixa', () => {
  it('rejeita quando não há autenticação', async () => {
    const { status, data } = await callRoute<{ error: string }>(GET, '/api/fechamento-caixa', {
      searchParams: { data: '2026-06-07' },
    });

    expect(status).toBe(401);
    expect(data.error).toContain('Token');
  });

  it('permite atendente autenticado', async () => {
    mockObterFechamentoCaixaResponse.mockResolvedValue(createResponseFixture());

    const { status } = await callRoute<FechamentoCaixaResponse>(GET, '/api/fechamento-caixa', {
      searchParams: { data: '2026-06-07' },
      headers: await buildAuthHeaders('atendente'),
    });

    expect(status).toBe(200);
    expect(mockObterFechamentoCaixaResponse).toHaveBeenCalledWith(9, '2026-06-07');
  });

  it('rejeita quando o usuário não tem perfil autorizado', async () => {
    const { status, data } = await callRoute<{ error: string }>(GET, '/api/fechamento-caixa', {
      searchParams: { data: '2026-06-07' },
      headers: await buildAuthHeaders('executor'),
    });

    expect(status).toBe(403);
    expect(data.error).toContain('não autorizado');
  });

  it('rejeita data inválida antes de chamar o helper', async () => {
    const { status, data } = await callRoute<{ error: string }>(GET, '/api/fechamento-caixa', {
      searchParams: { data: '07/06/2026' },
      headers: await buildAuthHeaders('admin'),
    });

    expect(status).toBe(400);
    expect(data.error).toContain('Data inválida');
    expect(mockObterFechamentoCaixaResponse).not.toHaveBeenCalled();
  });

  it('encaminha data e unidade atual para o helper', async () => {
    mockObterFechamentoCaixaResponse.mockResolvedValue(createResponseFixture());

    const { status, data } = await callRoute<FechamentoCaixaResponse>(GET, '/api/fechamento-caixa', {
      searchParams: { data: '2026-06-07' },
      headers: await buildAuthHeaders('admin'),
    });

    expect(status).toBe(200);
    expect(data.fechamento.unidade_id).toBe(9);
    expect(mockObterFechamentoCaixaResponse).toHaveBeenCalledWith(9, '2026-06-07');
  });
});

describe('PUT /api/fechamento-caixa', () => {
  it('exige draft no corpo da requisição', async () => {
    const { status, data } = await callRoute<{ error: string }>(PUT, '/api/fechamento-caixa', {
      method: 'PUT',
      searchParams: { data: '2026-06-07' },
      headers: await buildAuthHeaders('admin'),
      body: {},
    });

    expect(status).toBe(400);
    expect(data.error).toContain('draft é obrigatório');
  });

  it('salva revisão usando usuário e unidade do contexto autenticado', async () => {
    const draft = {
      profissionais: {
        '10': {
          included: false,
          included_motivo: 'Não veio',
        },
      },
      procedimentos: {},
      lancamentos_manuais: [],
    };
    mockSalvarDraftFechamentoCaixa.mockResolvedValue(createResponseFixture({ draft }));

    const { status } = await callRoute<FechamentoCaixaResponse>(PUT, '/api/fechamento-caixa', {
      method: 'PUT',
      searchParams: { data: '2026-06-07' },
      headers: await buildAuthHeaders('admin'),
      body: { draft },
    });

    expect(status).toBe(200);
    expect(mockSalvarDraftFechamentoCaixa).toHaveBeenCalledWith({
      unidadeId: 9,
      dataReferencia: '2026-06-07',
      draft,
      usuarioId: 77,
    });
  });

  it('permite atendente salvar revisão', async () => {
    const draft = {
      profissionais: {},
      procedimentos: {},
      lancamentos_manuais: [],
    };
    mockSalvarDraftFechamentoCaixa.mockResolvedValue(createResponseFixture({ draft }));

    const { status } = await callRoute<FechamentoCaixaResponse>(PUT, '/api/fechamento-caixa', {
      method: 'PUT',
      searchParams: { data: '2026-06-07' },
      headers: await buildAuthHeaders('atendente'),
      body: { draft },
    });

    expect(status).toBe(200);
    expect(mockSalvarDraftFechamentoCaixa).toHaveBeenCalledWith({
      unidadeId: 9,
      dataReferencia: '2026-06-07',
      draft,
      usuarioId: 77,
    });
  });
});

describe('POST /api/fechamento-caixa/fechar', () => {
  it('permite atendente fechar caixa', async () => {
    mockFecharFechamentoCaixa.mockResolvedValue(createResponseFixture({
      fechamento: {
        ...createResponseFixture().fechamento,
        status: 'fechado',
      },
    }));

    const { status } = await callRoute<FechamentoCaixaResponse>(postFechar, '/api/fechamento-caixa/fechar', {
      method: 'POST',
      headers: await buildAuthHeaders('atendente'),
      body: { data: '2026-06-07' },
    });

    expect(status).toBe(200);
    expect(mockFecharFechamentoCaixa).toHaveBeenCalledWith({
      unidadeId: 9,
      dataReferencia: '2026-06-07',
      usuarioId: 77,
    });
  });

  it('converte erro de validação em 400', async () => {
    mockFecharFechamentoCaixa.mockRejectedValue(new Error('Valor inválido informado no fechamento de caixa.'));

    const { status, data } = await callRoute<{ error: string }>(postFechar, '/api/fechamento-caixa/fechar', {
      method: 'POST',
      headers: await buildAuthHeaders('admin'),
      body: { data: '2026-06-07' },
    });

    expect(status).toBe(400);
    expect(data.error).toContain('inválido');
  });
});

describe('POST /api/fechamento-caixa/reabrir', () => {
  it('repassa a reabertura com justificativa obrigatória', async () => {
    mockReabrirFechamentoCaixa.mockResolvedValue(createResponseFixture({
      fechamento: {
        ...createResponseFixture().fechamento,
        status: 'aberto',
      },
    }));

    const { status } = await callRoute<FechamentoCaixaResponse>(postReabrir, '/api/fechamento-caixa/reabrir', {
      method: 'POST',
      headers: await buildAuthHeaders('admin'),
      body: { data: '2026-06-07', motivo: 'Conferência refeita pela gerência' },
    });

    expect(status).toBe(200);
    expect(mockReabrirFechamentoCaixa).toHaveBeenCalledWith({
      unidadeId: 9,
      dataReferencia: '2026-06-07',
      usuarioId: 77,
      motivo: 'Conferência refeita pela gerência',
    });
  });

  it('permite atendente reabrir fechamento', async () => {
    mockReabrirFechamentoCaixa.mockResolvedValue(createResponseFixture());

    const { status } = await callRoute<FechamentoCaixaResponse>(postReabrir, '/api/fechamento-caixa/reabrir', {
      method: 'POST',
      headers: await buildAuthHeaders('atendente'),
      body: { data: '2026-06-07', motivo: 'Conferência refeita no balcão' },
    });

    expect(status).toBe(200);
    expect(mockReabrirFechamentoCaixa).toHaveBeenCalledWith({
      unidadeId: 9,
      dataReferencia: '2026-06-07',
      usuarioId: 77,
      motivo: 'Conferência refeita no balcão',
    });
  });

  it('retorna 400 quando o helper exige motivo', async () => {
    mockReabrirFechamentoCaixa.mockRejectedValue(new Error('Motivo da reabertura é obrigatório.'));

    const { status, data } = await callRoute<{ error: string }>(postReabrir, '/api/fechamento-caixa/reabrir', {
      method: 'POST',
      headers: await buildAuthHeaders('admin'),
      body: { data: '2026-06-07', motivo: '' },
    });

    expect(status).toBe(400);
    expect(data.error).toContain('obrigatório');
  });
});
