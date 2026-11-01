import { roundMoney } from '@/modules/financeiro/public';
import type { DadosOrcamentos } from './dados';
import { adicionarValoresUnicos, buildDescriptorKey, buildOriginKey, coletarDentesLabels, type DescriptorBase } from './descritores';

export function criarDescritoresDosItens(
  baseItems: DadosOrcamentos['baseItems'],
  etapasPorItem: DadosOrcamentos['etapasPorItem'],
) {
  const descriptors = new Map<string, DescriptorBase>();
  const originToDescriptorKey = new Map<string, string>();

  const registrarDescriptor = (payload: {
    key: string;
    atendimento_id: number;
    atendimento_status: string;
    cliente_id: number;
    cliente_nome: string;
    cliente_telefone: string | null;
    orcamento_em: string;
    item_id: number;
    procedimento_id: number;
    procedimento_nome: string;
    etapa_modelo_id: number | null;
    etapa_label: string | null;
    por_dente: boolean;
    group_id: string | null;
    dentes_labels: string[];
    valor_total: number;
    valor_pago: number;
    saldo_aberto: number;
    referencia_em: string;
  }) => {
    const current = descriptors.get(payload.key);
    if (current) {
      if (!current.item_ids.includes(payload.item_id)) {
        current.item_ids.push(payload.item_id);
      }
      adicionarValoresUnicos(current.dentes_labels, payload.dentes_labels);
      current.valor_total = roundMoney(current.valor_total + payload.valor_total);
      current.valor_pago = roundMoney(current.valor_pago + payload.valor_pago);
      current.saldo_aberto = roundMoney(current.saldo_aberto + payload.saldo_aberto);
      if (payload.referencia_em > current.referencia_em) {
        current.referencia_em = payload.referencia_em;
      }
      return;
    }

    descriptors.set(payload.key, {
      key: payload.key,
      atendimento_id: payload.atendimento_id,
      atendimento_status: payload.atendimento_status,
      cliente_id: payload.cliente_id,
      cliente_nome: payload.cliente_nome,
      cliente_telefone: payload.cliente_telefone,
      orcamento_em: payload.orcamento_em,
      item_ids: [payload.item_id],
      procedimento_id: payload.procedimento_id,
      procedimento_nome: payload.procedimento_nome,
      etapa_modelo_id: payload.etapa_modelo_id,
      etapa_label: payload.etapa_label,
      por_dente: payload.por_dente,
      group_id: payload.group_id,
      dentes_labels: [...payload.dentes_labels],
      valor_total: payload.valor_total,
      valor_pago: payload.valor_pago,
      saldo_aberto: payload.saldo_aberto,
      referencia_em: payload.referencia_em,
    });
  };

  baseItems.forEach((item) => {
    const porDente = item.por_dente === 1;
    const groupId = item.group_id?.trim() || null;
    const dentesLabels = coletarDentesLabels(item);

    if (item.tem_etapas) {
      const etapas = etapasPorItem[item.item_id] ?? [];

      etapas.forEach((etapa) => {
        const valorTotal = roundMoney(etapa.valor ?? 0);
        const valorPago = etapa.valor_pago;
        const saldoAberto = roundMoney(Math.max(0, valorTotal - valorPago));
        if (saldoAberto <= 0) return;

        const key = buildDescriptorKey(item.item_id, etapa.id, groupId, porDente);
        originToDescriptorKey.set(buildOriginKey(item.item_id, etapa.id), key);
        registrarDescriptor({
          key,
          atendimento_id: item.atendimento_id,
          atendimento_status: item.atendimento_status,
          cliente_id: item.cliente_id,
          cliente_nome: item.cliente_nome,
          cliente_telefone: item.cliente_telefone,
          orcamento_em: item.orcamento_em,
          item_id: item.item_id,
          procedimento_id: item.procedimento_id,
          procedimento_nome: item.procedimento_nome,
          etapa_modelo_id: etapa.id,
          etapa_label: etapa.nome,
          por_dente: porDente,
          group_id: groupId,
          dentes_labels: dentesLabels,
          valor_total: valorTotal,
          valor_pago: valorPago,
          saldo_aberto: saldoAberto,
          referencia_em: item.item_created_at,
        });
      });

      return;
    }

    const valorTotal = roundMoney(item.valor_final ?? item.valor);
    const valorPago = roundMoney(item.valor_pago);
    const saldoAberto = roundMoney(Math.max(0, valorTotal - valorPago));
    if (saldoAberto <= 0) return;

    const key = buildDescriptorKey(item.item_id, null, groupId, porDente);
    originToDescriptorKey.set(buildOriginKey(item.item_id, null), key);
    registrarDescriptor({
      key,
      atendimento_id: item.atendimento_id,
      atendimento_status: item.atendimento_status,
      cliente_id: item.cliente_id,
      cliente_nome: item.cliente_nome,
      cliente_telefone: item.cliente_telefone,
      orcamento_em: item.orcamento_em,
      item_id: item.item_id,
      procedimento_id: item.procedimento_id,
      procedimento_nome: item.procedimento_nome,
      etapa_modelo_id: null,
      etapa_label: null,
      por_dente: porDente,
      group_id: groupId,
      dentes_labels: dentesLabels,
      valor_total: valorTotal,
      valor_pago: valorPago,
      saldo_aberto: saldoAberto,
      referencia_em: item.item_created_at,
    });
  });

  return { descriptors, originToDescriptorKey };
}
