import {
  montarSelecaoPagamentoPayload,
  type PagamentoItemInput,
} from '@/lib/utils/pagamentoSelecao';

describe('montarSelecaoPagamentoPayload', () => {
  it('transforma item simples pago deixado como pendente em agendamento sem data', () => {
    const itens: PagamentoItemInput[] = [
      {
        id: 10,
        status: 'pago',
        etapa_label: null,
        executor_id: null,
        etapas: [],
      },
    ];

    const result = montarSelecaoPagamentoPayload(
      itens,
      {},
      {},
      {},
      {},
      {},
      {}
    );

    expect(result.itensHoje).toEqual([]);
    expect(result.itensAgendar).toEqual([
      {
        item_id: 10,
        data_agendada: null,
      },
    ]);
    expect(result.etapasAgendar).toEqual([]);
  });

  it('mantem item simples pendente sem pagamento fora do agendamento automatico', () => {
    const itens: PagamentoItemInput[] = [
      {
        id: 11,
        status: 'pendente',
        etapa_label: null,
        executor_id: null,
        etapas: [],
      },
    ];

    const result = montarSelecaoPagamentoPayload(
      itens,
      {},
      {},
      {},
      {},
      {},
      {}
    );

    expect(result.itensHoje).toEqual([]);
    expect(result.itensAgendar).toEqual([]);
    expect(result.etapasAgendar).toEqual([]);
  });

  it('transforma sessao paga deixada pendente em agendamento sem data e mantem sessao marcada para hoje no item', () => {
    const itens: PagamentoItemInput[] = [
      {
        id: 20,
        status: 'pago',
        etapa_label: null,
        executor_id: 7,
        etapas: [
          { id: 200001, nome: 'Sessao 1' },
          { id: 200002, nome: 'Sessao 2' },
        ],
      },
    ];

    const result = montarSelecaoPagamentoPayload(
      itens,
      {},
      {
        200001: 'hoje',
        200002: 'pendente',
      },
      {},
      {},
      {},
      {}
    );

    expect(result.itensHoje).toEqual([20]);
    expect(result.itensAgendar).toEqual([]);
    expect(result.etapasAgendar).toEqual([
      {
        etapa_id: 200002,
        item_id: 20,
        tipo: 'modelo',
        data_agendada: null,
        pago_override: 1,
      },
    ]);
  });

  it('preserva data e executor quando item pago for agendado explicitamente', () => {
    const itens: PagamentoItemInput[] = [
      {
        id: 30,
        status: 'pago',
        etapa_label: null,
        executor_id: null,
        etapas: [],
      },
    ];

    const result = montarSelecaoPagamentoPayload(
      itens,
      { 30: 'agendar' },
      {},
      { 30: '2026-06-10' },
      {},
      { 30: '4' },
      {}
    );

    expect(result.itensHoje).toEqual([]);
    expect(result.itensAgendar).toEqual([
      {
        item_id: 30,
        data_agendada: '2026-06-10',
        executor_id: 4,
      },
    ]);
  });
});
