import 'server-only';
import { buscarEtapasComValor, buscarEtapasModelo, somarAlocacoesAtivasDaEtapa } from '@/modules/financeiro/server';
import { montarOrcamentos } from '../domain/montar-orcamentos';
import type { DadosOrcamentos } from '../domain/dados';
import { buscarOrigensOrcamentos } from './repository';

export async function listarOrcamentosEmAberto(unidadeId: number) {
  const { baseItems, activeAgendamentos } = await buscarOrigensOrcamentos(unidadeId);
  const etapasPorItem: DadosOrcamentos['etapasPorItem'] = {};
  await Promise.all(baseItems.filter(item => item.tem_etapas).map(async item => {
    const etapas = await buscarEtapasComValor(item);
    etapasPorItem[item.item_id] = await Promise.all(etapas.map(async etapa => ({
      ...etapa,
      valor: etapa.valor ?? 0,
      valor_pago: await somarAlocacoesAtivasDaEtapa(item.item_id, etapa.id),
    })));
  }));
  const etapasModelo: DadosOrcamentos['etapasModelo'] = {};
  const procedimentos = new Set(activeAgendamentos
    .filter(ag => ag.etapa_modelo_id != null && ag.procedimento_id != null)
    .map(ag => ag.procedimento_id!));
  await Promise.all([...procedimentos].map(async id => {
    etapasModelo[id] = await buscarEtapasModelo(id);
  }));
  return montarOrcamentos({ baseItems, activeAgendamentos, etapasPorItem, etapasModelo });
}
