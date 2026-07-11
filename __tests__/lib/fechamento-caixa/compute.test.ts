import {
  applyFechamentoCaixaDraft,
  countFechamentoCaixaAdjustments,
  createEmptyFechamentoCaixaDraft,
} from '@/lib/fechamento-caixa/compute';
import type { FechamentoCaixaVisao } from '@/lib/fechamento-caixa/types';

function createBaseVisao(): FechamentoCaixaVisao {
  return {
    data_referencia: '2026-06-07',
    unidade_id: 1,
    unidade_nome: 'Unidade Centro',
    editado_manual: false,
    ajustes_count: 0,
    resumo: {
      faturamento_dia: 1000,
      faturamento_por_metodo: [{ metodo: 'pix', total: 1000, quantidade: 1 }],
      procedimentos_executados: 2,
      total_diarias: 300,
      total_comissao_avaliacao: 70,
      total_comissao_execucao: 0,
      ajustes_manuais: 0,
      total_final: 630,
      pagamentos_cancelados_dia: {
        quantidade: 1,
        valor: 50,
      },
    },
    graficos: {
      procedimentos_por_quantidade: [
        { nome: 'Limpeza', quantidade: 1, valor_total: 100 },
        { nome: 'Canal', quantidade: 1, valor_total: 300 },
      ],
      ranking_avaliadores: [
        { usuario_id: 1, nome: 'Dra. Ana', valor_gerado: 100, quantidade: 1 },
        { usuario_id: 2, nome: 'Dr. Bruno', valor_gerado: 300, quantidade: 1 },
      ],
      ranking_executores: [
        { usuario_id: 1, nome: 'Dra. Ana', valor_gerado: 100, quantidade: 1 },
        { usuario_id: 2, nome: 'Dr. Bruno', valor_gerado: 300, quantidade: 1 },
      ],
    },
    dentistas: [
      {
        usuario_id: 1,
        nome: 'Dra. Ana',
        included: true,
        manualmente_editado: false,
        ajuste_count: 0,
        valor_diaria: 100,
        comissao_avaliacao: 50,
        comissao_execucao: 30,
        ajustes: [],
        lancamentos_manuais: [],
        total_dia: 180,
        procedimentos_executados: [
          {
            key: 'item:1',
            item_id: 1,
            atendimento_id: 10,
            cliente_nome: 'Maria',
            procedimento_nome: 'Limpeza',
            procedimento_label: 'Limpeza',
            valor: 100,
            concluido_at: '2026-06-07 09:00:00',
            included: true,
            manualmente_editado: false,
            ajustes: [],
            ranking_avaliadores: [{ usuario_id: 1, nome: 'Dra. Ana', valor_gerado: 100 }],
            ranking_executores: [{ usuario_id: 1, nome: 'Dra. Ana', valor_gerado: 100 }],
          },
        ],
      },
      {
        usuario_id: 2,
        nome: 'Dr. Bruno',
        included: true,
        manualmente_editado: false,
        ajuste_count: 0,
        valor_diaria: 200,
        comissao_avaliacao: 20,
        comissao_execucao: 20,
        ajustes: [],
        lancamentos_manuais: [],
        total_dia: 240,
        procedimentos_executados: [
          {
            key: 'item:2',
            item_id: 2,
            atendimento_id: 20,
            cliente_nome: 'João',
            procedimento_nome: 'Canal',
            procedimento_label: 'Canal',
            valor: 300,
            concluido_at: '2026-06-07 11:00:00',
            included: true,
            manualmente_editado: false,
            ajustes: [],
            ranking_avaliadores: [{ usuario_id: 2, nome: 'Dr. Bruno', valor_gerado: 300 }],
            ranking_executores: [{ usuario_id: 2, nome: 'Dr. Bruno', valor_gerado: 300 }],
          },
        ],
      },
    ],
    lancamentos_manuais_gerais: [],
    pagamentos_recebidos_dia: [
      {
        id: 'grupo:1',
        pagamento_grupo_id: 1,
        pagamento_representante_id: 90,
        atendimento_id: 10,
        cliente_id: 100,
        cliente_nome: 'Maria',
        valor_total: 1000,
        observacoes: 'Pagamento confirmado',
        cancelado: false,
        motivo_cancelamento: null,
        created_at: '2026-06-07 08:30:00',
        recebido_por_id: 5,
        recebido_por_nome: 'Recepção',
        formas: [
          {
            id: 90,
            valor: 1000,
            metodo: 'pix',
            observacoes: null,
            cancelado: false,
            motivo_cancelamento: null,
            created_at: '2026-06-07 08:30:00',
          },
        ],
      },
    ],
  };
}

describe('fechamento-caixa compute', () => {
  it('retorna um draft vazio por padrão', () => {
    expect(createEmptyFechamentoCaixaDraft()).toEqual({
      profissionais: {},
      procedimentos: {},
      lancamentos_manuais: [],
    });
  });

  it('aplica exclusões, overrides e lançamentos manuais recalculando resumo e rankings', () => {
    const draft = {
      profissionais: {
        '1': {
          valor_diaria_override: 150,
          valor_diaria_motivo: 'Cobriu um turno extra',
        },
        '2': {
          included: false,
          included_motivo: 'Profissional não compareceu',
        },
      },
      procedimentos: {
        'item:1': {
          valor_override: 120,
          valor_motivo: 'Valor final corrigido no fechamento',
        },
      },
      lancamentos_manuais: [
        {
          id: 'manual-geral',
          escopo: 'geral' as const,
          usuario_id: null,
          descricao: 'Ajuste geral positivo',
          valor: 50,
          motivo: 'Diferença validada no caixa',
          created_at: '2026-06-07 18:00:00',
        },
        {
          id: 'manual-profissional',
          escopo: 'profissional' as const,
          usuario_id: 1,
          descricao: 'Desconto de adiantamento',
          valor: -10,
          motivo: 'Adiantamento registrado no dia',
          created_at: '2026-06-07 18:05:00',
        },
      ],
    };

    const result = applyFechamentoCaixaDraft(createBaseVisao(), draft);

    expect(countFechamentoCaixaAdjustments(draft)).toBe(5);
    expect(result.ajustes_count).toBe(5);
    expect(result.editado_manual).toBe(true);

    expect(result.dentistas[0].nome).toBe('Dra. Ana');
    expect(result.dentistas[0].valor_diaria).toBe(150);
    expect(result.dentistas[0].comissao_execucao).toBe(0);
    expect(result.dentistas[0].total_dia).toBe(190);
    expect(result.dentistas[0].manualmente_editado).toBe(true);
    expect(result.dentistas[0].lancamentos_manuais).toHaveLength(1);

    expect(result.dentistas[1].nome).toBe('Dr. Bruno');
    expect(result.dentistas[1].included).toBe(false);

    expect(result.resumo.procedimentos_executados).toBe(1);
    expect(result.resumo.total_diarias).toBe(150);
    expect(result.resumo.total_comissao_avaliacao).toBe(50);
    expect(result.resumo.total_comissao_execucao).toBe(0);
    expect(result.resumo.ajustes_manuais).toBe(40);
    expect(result.resumo.total_final).toBe(840);

    expect(result.graficos.procedimentos_por_quantidade).toEqual([
      { nome: 'Limpeza', quantidade: 1, valor_total: 120 },
    ]);
    expect(result.graficos.ranking_avaliadores).toEqual([
      { usuario_id: 1, nome: 'Dra. Ana', valor_gerado: 120, quantidade: 1 },
    ]);
    expect(result.graficos.ranking_executores).toEqual([
      { usuario_id: 1, nome: 'Dra. Ana', valor_gerado: 120, quantidade: 1 },
    ]);
    expect(result.lancamentos_manuais_gerais).toHaveLength(1);
    expect(result.pagamentos_recebidos_dia).toHaveLength(1);
  });
});
