import {
  ajustarEtapasAoValorDoItem,
  obterValorEfetivoAgendamento,
  obterValorEfetivoItem,
} from '@/lib/helpers/pagamentoFlow';

const ETAPAS_IMPLANTE = [
  { id: 1, nome: 'Cirurgia', valor: 1000 },
  { id: 2, nome: 'Coroa', valor: 500 },
];

describe('ajustarEtapasAoValorDoItem', () => {
  it.each([
    {
      cenario: 'procedimento simples sem etapas',
      etapas: [],
      valorItem: 450,
      esperado: [],
    },
    {
      cenario: 'procedimento com etapas usando o valor padrão',
      etapas: ETAPAS_IMPLANTE,
      valorItem: 1500,
      esperado: [1000, 500],
    },
    {
      cenario: 'procedimento com etapas usando valor customizado maior',
      etapas: ETAPAS_IMPLANTE,
      valorItem: 2000,
      esperado: [1333.33, 666.67],
    },
    {
      cenario: 'procedimento com etapas usando valor customizado menor',
      etapas: ETAPAS_IMPLANTE,
      valorItem: 1200,
      esperado: [800, 400],
    },
    {
      cenario: 'procedimento gratuito com etapas',
      etapas: ETAPAS_IMPLANTE,
      valorItem: 0,
      esperado: [0, 0],
    },
    {
      cenario: 'procedimento com etapas sem pesos configurados',
      etapas: [
        { id: 1, nome: 'Primeira', valor: 0 },
        { id: 2, nome: 'Segunda', valor: 0 },
      ],
      valorItem: 2000,
      esperado: [1000, 1000],
    },
    {
      cenario: 'procedimento com três etapas e arredondamento de centavos',
      etapas: [
        { id: 1, nome: 'Primeira', valor: 1 },
        { id: 2, nome: 'Segunda', valor: 1 },
        { id: 3, nome: 'Terceira', valor: 1 },
      ],
      valorItem: 100,
      esperado: [33.33, 33.33, 33.34],
    },
  ])('$cenario', ({ etapas, valorItem, esperado }) => {
    const resultado = ajustarEtapasAoValorDoItem(etapas, valorItem);

    expect(resultado.map((etapa) => etapa.valor)).toEqual(esperado);
    if (etapas.length > 0) {
      expect(resultado.reduce((sum, etapa) => sum + etapa.valor, 0)).toBeCloseTo(valorItem, 2);
    }
  });

  it('preserva a proporção de overrides existentes ao reconciliar o total', () => {
    const resultado = ajustarEtapasAoValorDoItem([
      { id: 1, nome: 'Cirurgia', valor: 1200 },
      { id: 2, nome: 'Coroa', valor: 800 },
    ], 1500);

    expect(resultado.map((etapa) => etapa.valor)).toEqual([900, 600]);
  });
});

describe('fontes efetivas de valor', () => {
  it('prioriza valor_final para itens legados', () => {
    expect(obterValorEfetivoItem({ valor: 1500, valor_final: 2000 })).toBe(2000);
    expect(obterValorEfetivoItem({ valor: 1500, valor_final: null })).toBe(1500);
  });

  it('preserva o snapshot já reconciliado do agendamento', () => {
    expect(obterValorEfetivoAgendamento({
      valor: 1333.33,
      valor_pago: 0,
      procedimento_valor: 2000,
      etapa_modelo_id: 1,
      etapas_modelo: ETAPAS_IMPLANTE,
    })).toBe(1333.33);
  });

  it('reconcilia o valor bruto de uma etapa legado com o total do procedimento', () => {
    expect(obterValorEfetivoAgendamento({
      valor: 1000,
      valor_pago: 0,
      procedimento_valor: 2000,
      etapa_modelo_id: 1,
      etapas_modelo: ETAPAS_IMPLANTE,
    })).toBe(1333.33);
  });

  it('preserva um valor de agendamento editado que não corresponde ao modelo legado', () => {
    expect(obterValorEfetivoAgendamento({
      valor: 1400,
      valor_pago: 0,
      procedimento_valor: 2000,
      etapa_modelo_id: 1,
      etapas_modelo: ETAPAS_IMPLANTE,
    })).toBe(1400);
  });

  it('nunca retorna valor abaixo do que já foi pago', () => {
    expect(obterValorEfetivoAgendamento({
      valor: 500,
      valor_pago: 700,
      procedimento_valor: 2000,
      etapa_modelo_id: 2,
      etapas_modelo: ETAPAS_IMPLANTE,
    })).toBe(700);
  });

  it('corrige agendamento legado sem pesos configurados', () => {
    expect(obterValorEfetivoAgendamento({
      valor: 2000,
      valor_pago: 0,
      procedimento_valor: 2000,
      etapa_modelo_id: 1,
      etapas_modelo: [
        { id: 1, valor: null },
        { id: 2, valor: null },
      ],
    })).toBe(1000);
  });
});
