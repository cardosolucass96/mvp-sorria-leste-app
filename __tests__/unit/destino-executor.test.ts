import { getExecutorDestinoInicial, resolverExecutorDestinoId } from '@/lib/utils/destinoExecutor';

describe('destinoExecutor utils', () => {
  describe('resolverExecutorDestinoId', () => {
    it('preserva null explicito do destino', () => {
      expect(resolverExecutorDestinoId(null, 4)).toBeNull();
    });

    it('usa executor atual quando nao existe override', () => {
      expect(resolverExecutorDestinoId(undefined, 4)).toBe(4);
    });
  });

  describe('getExecutorDestinoInicial', () => {
    it('retorna vazio quando o destino salvo remove o executor', () => {
      expect(getExecutorDestinoInicial('fazer_hoje', null, 4)).toBe('');
    });

    it('usa executor atual quando nao existe destino salvo', () => {
      expect(getExecutorDestinoInicial(null, null, 4)).toBe('4');
    });
  });
});
