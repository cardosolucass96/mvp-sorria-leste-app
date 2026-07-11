import {
  mockQueryResponse,
  resetMockDb,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';

jest.mock('@/lib/helpers/garantirComissaoSchema', () => ({
  garantirSchemaComissoesOrigem: jest.fn().mockResolvedValue(undefined),
  garantirSchemaProcedimentosComissaoAcrescimo: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/helpers/garantirUsuarioSchema', () => ({
  garantirSchemaUsuariosValorDiaria: jest.fn().mockResolvedValue(undefined),
}));

import { obterFechamentoCaixaResponse } from '@/lib/helpers/fechamentoCaixa';

function mockCommonQueries() {
  mockQueryResponse('pragma table_info(fechamentos_caixa)', [
    { name: 'updated_by_id' },
    { name: 'updated_at' },
  ]);
  mockQueryResponse('from fechamentos_caixa f', []);
  mockQueryResponse('select nome from unidades', { nome: 'Unidade Centro' });
  mockQueryResponse('from usuarios u', [
    { id: 10, nome: 'Dr. Carlos Avaliador', valor_diaria: 80 },
    { id: 20, nome: 'Dra. Ana Executora', valor_diaria: 100 },
  ]);
  mockQueryResponse('select coalesce(sum(p.valor), 0) as total', { total: 500 });
  mockQueryResponse('group by p.metodo', [
    { metodo: 'pix', total: 500, quantidade: 1 },
  ]);
  mockQueryResponse('p.cancelado = 1', { quantidade: 0, valor: 0 });
  mockQueryResponse('pg.valor_total as grupo_valor_total', []);
  mockQueryResponse('from comissoes c', []);
}

describe('obterFechamentoCaixaResponse', () => {
  beforeEach(() => {
    resetMockDb();
    setupCloudflareContextMock();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  it('atribui comissão ao avaliador original com base no procedimento executado do dia', async () => {
    mockCommonQueries();
    mockQueryResponse('from itens_atendimento i', [
      {
        item_id: 1,
        atendimento_id: 70,
        executor_id: 20,
        executor_nome: 'Dra. Ana Executora',
        executor_valor_diaria: 100,
        criado_por_id: 10,
        criado_por_nome: 'Dr. Carlos Avaliador',
        criado_por_valor_diaria: 80,
        adicionado_em_execucao: 0,
        comissao_venda: 10,
        comissao_acrescimo: 15,
        valor: 200,
        concluido_at: '2026-06-07 16:45:00',
        dentes: null,
        dente_unico: null,
        etapa_label: null,
        procedimento_nome: 'Limpeza',
        cliente_nome: 'Paciente Teste',
      },
    ]);

    const response = await obterFechamentoCaixaResponse(1, '2026-06-07');
    const avaliador = response.resultado.dentistas.find((item) => item.usuario_id === 10);
    const executor = response.resultado.dentistas.find((item) => item.usuario_id === 20);

    expect(response.resultado.resumo.procedimentos_executados).toBe(1);
    expect(response.resultado.resumo.total_comissao_avaliacao).toBe(20);
    expect(response.resultado.graficos.ranking_avaliadores).toEqual([
      { usuario_id: 10, nome: 'Dr. Carlos Avaliador', valor_gerado: 200, quantidade: 1 },
    ]);

    expect(avaliador).toMatchObject({
      nome: 'Dr. Carlos Avaliador',
      valor_diaria: 80,
      comissao_avaliacao: 20,
      total_dia: 100,
    });
    expect(avaliador?.procedimentos_executados).toHaveLength(0);

    expect(executor?.procedimentos_executados[0].ranking_avaliadores).toEqual([
      {
        usuario_id: 10,
        nome: 'Dr. Carlos Avaliador',
        valor_gerado: 200,
        valor_comissao: 20,
        origem: 'avaliacao',
      },
    ]);
  });

  it('usa comissão de acréscimo quando o procedimento foi adicionado na execução e concluído no dia', async () => {
    mockCommonQueries();
    mockQueryResponse('from itens_atendimento i', [
      {
        item_id: 2,
        atendimento_id: 71,
        executor_id: 20,
        executor_nome: 'Dra. Ana Executora',
        executor_valor_diaria: 100,
        criado_por_id: 10,
        criado_por_nome: 'Dr. Carlos Avaliador',
        criado_por_valor_diaria: 80,
        adicionado_em_execucao: 1,
        comissao_venda: 10,
        comissao_acrescimo: 12,
        valor: 300,
        concluido_at: '2026-06-07 17:10:00',
        dentes: null,
        dente_unico: null,
        etapa_label: null,
        procedimento_nome: 'Teste Mult',
        cliente_nome: 'Paciente Acréscimo',
      },
    ]);

    const response = await obterFechamentoCaixaResponse(1, '2026-06-07');
    const executor = response.resultado.dentistas.find((item) => item.usuario_id === 20);

    expect(response.resultado.resumo.total_comissao_avaliacao).toBe(36);
    expect(response.resultado.graficos.ranking_avaliadores).toEqual([
      { usuario_id: 10, nome: 'Dr. Carlos Avaliador', valor_gerado: 300, quantidade: 1 },
    ]);
    expect(executor?.procedimentos_executados[0].ranking_avaliadores).toEqual([
      {
        usuario_id: 10,
        nome: 'Dr. Carlos Avaliador',
        valor_gerado: 300,
        valor_comissao: 36,
        origem: 'acrescimo',
      },
    ]);
  });

  it('inclui os pagamentos recebidos no dia agrupando múltiplas formas da mesma cobrança', async () => {
    mockCommonQueries();
    mockQueryResponse('from itens_atendimento i', []);
    mockQueryResponse('pg.valor_total as grupo_valor_total', [
      {
        id: 501,
        atendimento_id: 70,
        cliente_id: 900,
        cliente_nome: 'Paciente Financeiro',
        cliente_cpf: '12345678901',
        cliente_telefone: '11999998888',
        pagamento_grupo_id: 12,
        recebido_por_id: 44,
        recebido_por_nome: 'Recepção 1',
        valor: 300,
        metodo: 'pix',
        observacoes: 'Parcela PIX',
        cancelado: 0,
        motivo_cancelamento: null,
        created_at: '2026-06-07 10:15:00',
        grupo_valor_total: 500,
        grupo_observacoes: 'Cobrança combinada',
        grupo_cancelado: 0,
        grupo_motivo_cancelamento: null,
        grupo_created_at: '2026-06-07 10:15:00',
      },
      {
        id: 502,
        atendimento_id: 70,
        cliente_id: 900,
        cliente_nome: 'Paciente Financeiro',
        cliente_cpf: '12345678901',
        cliente_telefone: '11999998888',
        pagamento_grupo_id: 12,
        recebido_por_id: 44,
        recebido_por_nome: 'Recepção 1',
        valor: 200,
        metodo: 'cartao_credito',
        observacoes: null,
        cancelado: 0,
        motivo_cancelamento: null,
        created_at: '2026-06-07 10:16:00',
        grupo_valor_total: 500,
        grupo_observacoes: 'Cobrança combinada',
        grupo_cancelado: 0,
        grupo_motivo_cancelamento: null,
        grupo_created_at: '2026-06-07 10:15:00',
      },
    ]);

    const response = await obterFechamentoCaixaResponse(1, '2026-06-07');

    expect(response.resultado.pagamentos_recebidos_dia).toEqual([
      {
        id: 'grupo:12',
        pagamento_grupo_id: 12,
        pagamento_representante_id: 501,
        atendimento_id: 70,
        cliente_id: 900,
        cliente_nome: 'Paciente Financeiro',
        cliente_cpf: '12345678901',
        cliente_telefone: '11999998888',
        valor_total: 500,
        observacoes: 'Cobrança combinada',
        cancelado: false,
        motivo_cancelamento: null,
        created_at: '2026-06-07 10:15:00',
        recebido_por_id: 44,
        recebido_por_nome: 'Recepção 1',
        formas: [
          {
            id: 502,
            valor: 200,
            metodo: 'cartao_credito',
            observacoes: null,
            cancelado: false,
            motivo_cancelamento: null,
            created_at: '2026-06-07 10:16:00',
          },
          {
            id: 501,
            valor: 300,
            metodo: 'pix',
            observacoes: 'Parcela PIX',
            cancelado: false,
            motivo_cancelamento: null,
            created_at: '2026-06-07 10:15:00',
          },
        ],
      },
    ]);
  });
});
