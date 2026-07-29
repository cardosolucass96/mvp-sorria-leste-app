import { MENU_ITEMS } from '@/lib/constants/navigation';

describe('navegação Financeiro', () => {
  test('insere Financeiro logo depois de Fechamento de Caixa e somente para admin', () => {
    const fechamentoIndex = MENU_ITEMS.findIndex((item) => item.href === '/fechamento-caixa');
    const financeiroIndex = MENU_ITEMS.findIndex((item) => item.href === '/financeiro');
    const financeiro = MENU_ITEMS[financeiroIndex];

    expect(fechamentoIndex).toBeGreaterThanOrEqual(0);
    expect(financeiroIndex).toBe(fechamentoIndex + 1);
    expect(financeiro.label).toBe('Financeiro');
    expect(financeiro.roles).toEqual(['admin']);
  });
});
