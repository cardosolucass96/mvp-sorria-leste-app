import type { OrcamentosEmAbertoResponse } from '../contracts';
import type { DadosOrcamentos } from './dados';
import { criarDescritoresDosItens } from './itens-orcados';
import { vincularAgendamentos } from './agendamentos-orcados';
import { agruparOrcamentos } from './resumo-orcamentos';

export function montarOrcamentos(dados: DadosOrcamentos): OrcamentosEmAbertoResponse {
  const { descriptors, originToDescriptorKey } = criarDescritoresDosItens(dados.baseItems, dados.etapasPorItem);
  const states = vincularAgendamentos(dados, descriptors, originToDescriptorKey);
  return agruparOrcamentos(states);
}
