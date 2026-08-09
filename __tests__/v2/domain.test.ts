import {
  assertCanExecute,
  assertEvaluationCanFinish,
  assertProcedureCanBeEdited,
  calcularComissaoCentavos,
  deriveBudgetStatus,
  deriveFinancialStatus,
  V2DomainError,
} from '@/lib/v2/domain';

describe('domínio procedure-centric V2', () => {
  it('deriva o financeiro exclusivamente das alocações ativas', () => {
    expect(deriveFinancialStatus(20_000, 0, false)).toBe('nao_pago');
    expect(deriveFinancialStatus(20_000, 10_000, true)).toBe('parcial');
    expect(deriveFinancialStatus(20_000, 20_000, true)).toBe('quitado');
    expect(deriveFinancialStatus(20_000, 0, true)).toBe('estornado');
  });

  it('deriva aceite parcial por procedimento', () => {
    expect(deriveBudgetStatus(['aceito', 'proposto'])).toBe('parcialmente_aceito');
    expect(deriveBudgetStatus(['aceito', 'aceito'])).toBe('aceito');
    expect(deriveBudgetStatus(['recusado', 'recusado'])).toBe('recusado');
  });

  it('exige motivo para concluir avaliação sem orçamento', () => {
    expect(() => assertEvaluationCanFinish(false, '')).toThrow(V2DomainError);
    expect(assertEvaluationCanFinish(false, 'Sem indicação clínica')).toBe('Sem indicação clínica');
    expect(assertEvaluationCanFinish(true, null)).toBeNull();
  });

  it('bloqueia edição após aceite ou recebimento', () => {
    expect(() => assertProcedureCanBeEdited('aceito', 0)).toThrow('Procedimentos aceitos');
    expect(() => assertProcedureCanBeEdited('proposto', 1)).toThrow('Procedimentos aceitos');
    expect(() => assertProcedureCanBeEdited('proposto', 0)).not.toThrow();
  });

  it('bloqueia execução sem quitação e aceita liberação administrativa', () => {
    expect(() => assertCanExecute({
      statusComercial: 'aceito',
      statusFinanceiro: 'parcial',
      hasAdminRelease: false,
      origem: 'avaliacao',
    })).toThrow('quitação integral');
    expect(() => assertCanExecute({
      statusComercial: 'aceito',
      statusFinanceiro: 'parcial',
      hasAdminRelease: true,
      origem: 'avaliacao',
    })).not.toThrow();
  });

  it('calcula comissões em centavos e pontos-base', () => {
    expect(calcularComissaoCentavos(10_000, 400)).toBe(400);
  });
});
