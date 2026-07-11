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

  it('atribui comissão ao avaliador original com base no procedimento quitado no dia', async () => {
    mockCommonQueries();
    mockQueryResponse('from pagamentos_alocacoes pa', [
      {
        target_type: 'item',
        target_id: 1,
        atendimento_id: 70,
        usuario_id: 10,
        usuario_nome: 'Dr. Carlos Avaliador',
        usuario_valor_diaria: 80,
        origem: 'avaliacao',
        percentual: 10,
        valor_referencia: 200,
        valor_alocado: 200,
        pago_em: '2026-06-07 16:45:00',
        cliente_nome: 'Paciente Teste',
        procedimento_nome: 'Limpeza',
        etapa_label: null,
        dentes: null,
        dente_unico: null,
      },
    ]);
    mockQueryResponse('from itens_atendimento i', []);

    const response = await obterFechamentoCaixaResponse(1, '2026-06-07');
    const avaliador = response.resultado.dentistas.find((item) => item.usuario_id === 10);

    expect(response.resultado.resumo.procedimentos_executados).toBe(0);
    expect(response.resultado.resumo.total_comissao_avaliacao).toBe(20);
    expect(response.resultado.graficos.ranking_avaliadores).toEqual([
      { usuario_id: 10, nome: 'Dr. Carlos Avaliador', valor_gerado: 200, quantidade: 1 },
    ]);
    expect(response.resultado.avaliacoes_pagas_dia).toEqual([
      {
        key: 'item:1',
        usuario_id: 10,
        cliente_nome: 'Paciente Teste',
        procedimento_nome: 'Limpeza',
        procedimento_label: 'Limpeza',
        origem: 'avaliacao',
        percentual: 10,
        valor_base: 200,
        valor_comissao: 20,
        pago_em: '2026-06-07 16:45:00',
        included: true,
        manualmente_editado: false,
        ajustes: [],
      },
    ]);

    expect(avaliador).toMatchObject({
      nome: 'Dr. Carlos Avaliador',
      valor_diaria: 80,
      comissao_avaliacao: 20,
      total_dia: 100,
    });
    expect(avaliador?.procedimentos_executados).toHaveLength(0);
  });

  it('usa comissão de acréscimo quando o procedimento foi quitado no dia', async () => {
    mockCommonQueries();
    mockQueryResponse('from pagamentos_alocacoes pa', [
      {
        target_type: 'item',
        target_id: 2,
        atendimento_id: 71,
        usuario_id: 10,
        usuario_nome: 'Dr. Carlos Avaliador',
        usuario_valor_diaria: 80,
        origem: 'acrescimo',
        percentual: 12,
        valor_referencia: 300,
        valor_alocado: 300,
        pago_em: '2026-06-07 17:10:00',
        cliente_nome: 'Paciente Acréscimo',
        procedimento_nome: 'Teste Mult',
        etapa_label: null,
        dentes: null,
        dente_unico: null,
      },
    ]);
    mockQueryResponse('from itens_atendimento i', []);

    const response = await obterFechamentoCaixaResponse(1, '2026-06-07');

    expect(response.resultado.resumo.total_comissao_avaliacao).toBe(36);
    expect(response.resultado.graficos.ranking_avaliadores).toEqual([
      { usuario_id: 10, nome: 'Dr. Carlos Avaliador', valor_gerado: 300, quantidade: 1 },
    ]);
    expect(response.resultado.avaliacoes_pagas_dia).toEqual([
      {
        key: 'item:2',
        usuario_id: 10,
        cliente_nome: 'Paciente Acréscimo',
        procedimento_nome: 'Teste Mult',
        procedimento_label: 'Teste Mult',
        percentual: 12,
        valor_base: 300,
        valor_comissao: 36,
        origem: 'acrescimo',
        pago_em: '2026-06-07 17:10:00',
        included: true,
        manualmente_editado: false,
        ajustes: [],
      },
    ]);
  });

  it('não contabiliza comissão de avaliação no dia da execução quando a quitação ocorreu antes', async () => {
    mockCommonQueries();
    mockQueryResponse('from pagamentos_alocacoes pa', [
      {
        target_type: 'item',
        target_id: 3,
        atendimento_id: 72,
        usuario_id: 10,
        usuario_nome: 'Dr. Carlos Avaliador',
        usuario_valor_diaria: 80,
        origem: 'avaliacao',
        percentual: 10,
        valor_referencia: 400,
        valor_alocado: 400,
        pago_em: '2026-06-06 18:00:00',
        cliente_nome: 'Paciente Antecipado',
        procedimento_nome: 'Canal',
        etapa_label: null,
        dentes: null,
        dente_unico: null,
      },
    ]);
    mockQueryResponse('from itens_atendimento i', [
      {
        item_id: 3,
        atendimento_id: 72,
        executor_id: 20,
        executor_nome: 'Dra. Ana Executora',
        executor_valor_diaria: 100,
        criado_por_id: 10,
        criado_por_nome: 'Dr. Carlos Avaliador',
        criado_por_valor_diaria: 80,
        adicionado_em_execucao: 0,
        comissao_venda: 10,
        comissao_acrescimo: 15,
        valor: 400,
        concluido_at: '2026-06-07 11:10:00',
        dentes: null,
        dente_unico: null,
        etapa_label: null,
        procedimento_nome: 'Canal',
        cliente_nome: 'Paciente Antecipado',
      },
    ]);

    const response = await obterFechamentoCaixaResponse(1, '2026-06-07');

    expect(response.resultado.resumo.procedimentos_executados).toBe(1);
    expect(response.resultado.resumo.total_comissao_avaliacao).toBe(0);
    expect(response.resultado.graficos.ranking_avaliadores).toEqual([]);
    expect(response.resultado.avaliacoes_pagas_dia).toEqual([]);
    expect(response.resultado.dentistas.find((item) => item.usuario_id === 20)?.procedimentos_executados).toHaveLength(1);
  });

  it('só contabiliza a comissão no dia em que a última parcela quitou o procedimento', async () => {
    mockCommonQueries();
    mockQueryResponse('from pagamentos_alocacoes pa', [
      {
        target_type: 'item',
        target_id: 4,
        atendimento_id: 73,
        usuario_id: 10,
        usuario_nome: 'Dr. Carlos Avaliador',
        usuario_valor_diaria: 80,
        origem: 'avaliacao',
        percentual: 10,
        valor_referencia: 200,
        valor_alocado: 100,
        pago_em: '2026-06-06 14:00:00',
        cliente_nome: 'Paciente Parcelado',
        procedimento_nome: 'Limpeza',
        etapa_label: null,
        dentes: null,
        dente_unico: null,
      },
      {
        target_type: 'item',
        target_id: 4,
        atendimento_id: 73,
        usuario_id: 10,
        usuario_nome: 'Dr. Carlos Avaliador',
        usuario_valor_diaria: 80,
        origem: 'avaliacao',
        percentual: 10,
        valor_referencia: 200,
        valor_alocado: 100,
        pago_em: '2026-06-07 09:30:00',
        cliente_nome: 'Paciente Parcelado',
        procedimento_nome: 'Limpeza',
        etapa_label: null,
        dentes: null,
        dente_unico: null,
      },
    ]);
    mockQueryResponse('from itens_atendimento i', []);

    const response = await obterFechamentoCaixaResponse(1, '2026-06-07');

    expect(response.resultado.resumo.total_comissao_avaliacao).toBe(20);
    expect(response.resultado.graficos.ranking_avaliadores).toEqual([
      { usuario_id: 10, nome: 'Dr. Carlos Avaliador', valor_gerado: 200, quantidade: 1 },
    ]);
    expect(response.resultado.avaliacoes_pagas_dia[0]).toMatchObject({
      key: 'item:4',
      pago_em: '2026-06-07 09:30:00',
      valor_base: 200,
      valor_comissao: 20,
    });
  });

  it('preserva o avaliador original quando a alocação já foi movida para um agendamento', async () => {
    mockCommonQueries();
    mockQueryResponse('from pagamentos_alocacoes pa', [
      {
        target_type: 'agendamento',
        target_id: 33,
        atendimento_id: 74,
        usuario_id: 10,
        usuario_nome: 'Dr. Carlos Avaliador',
        usuario_valor_diaria: 80,
        origem: 'avaliacao',
        percentual: 8,
        valor_referencia: 250,
        valor_alocado: 250,
        pago_em: '2026-06-07 12:00:00',
        cliente_nome: 'Paciente Remarcado',
        procedimento_nome: 'Canal',
        etapa_label: 'Sessão 2',
        dentes: null,
        dente_unico: null,
      },
    ]);
    mockQueryResponse('from itens_atendimento i', []);

    const response = await obterFechamentoCaixaResponse(1, '2026-06-07');

    expect(response.resultado.resumo.total_comissao_avaliacao).toBe(20);
    expect(response.resultado.avaliacoes_pagas_dia).toEqual([
      {
        key: 'agendamento:33',
        usuario_id: 10,
        cliente_nome: 'Paciente Remarcado',
        procedimento_nome: 'Canal',
        procedimento_label: 'Canal — Sessão 2',
        origem: 'avaliacao',
        percentual: 8,
        valor_base: 250,
        valor_comissao: 20,
        pago_em: '2026-06-07 12:00:00',
        included: true,
        manualmente_editado: false,
        ajustes: [],
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
