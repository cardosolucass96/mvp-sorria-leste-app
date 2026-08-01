import { ajustarEtapasAoValorDoItem } from '@/lib/helpers/pagamentoFlow';

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
