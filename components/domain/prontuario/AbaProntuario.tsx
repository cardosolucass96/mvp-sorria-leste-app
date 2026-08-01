'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { formatarDataHora, formatarDentes } from '@/lib/utils/formatters';
import type { ItemProntuario } from './types';

export interface AbaProntuarioProps {
  prontuarios: ItemProntuario[];
}

export default function AbaProntuario({ prontuarios }: AbaProntuarioProps) {
  if (!prontuarios.length) {
    return (
      <div className="flex flex-col items-center py-10 text-muted">
        <FileText className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm">Nenhuma evolução clínica</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {prontuarios.map(item => {
        const dentes = formatarDentes(item.dentes) || item.dente_unico || null;
        const itens = item.itens?.length
          ? item.itens
          : [{
              item_id: item.item_id,
              procedimento_nome: item.procedimento_nome,
              etapa_label: item.etapa_label,
              executor_nome: item.executor_nome,
              dentes: item.dentes,
              dente_unico: item.dente_unico,
              quantidade: item.quantidade,
              item_observacoes: item.item_observacoes,
              concluido_at: item.concluido_at,
            }];
        const isEvolucaoAgrupada = itens.length > 1;
        return (
          <div key={item.evolucao_id ?? item.item_id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm">
                  {isEvolucaoAgrupada
                    ? `Evolução com ${itens.length} procedimentos`
                    : item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome}
                </h4>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted">
                  {!isEvolucaoAgrupada && item.executor_nome && (
                    <span>
                      Executor responsável: <span className="text-foreground">{item.executor_nome}</span>
                    </span>
                  )}
                  {!isEvolucaoAgrupada && dentes && (
                    <span>
                      Dentes: <span className="text-foreground">{dentes}</span>
                    </span>
                  )}
                  {!isEvolucaoAgrupada && item.quantidade > 1 && (
                    <span>
                      Qtd: <span className="text-foreground">{item.quantidade}</span>
                    </span>
                  )}
                  <Link
                    href={`/atendimentos/${item.atendimento_id}`}
                    className="text-primary-600 hover:underline"
                  >
                    Atend. #{item.atendimento_id}
                  </Link>
                </div>
              </div>
              {item.concluido_at && (
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted">Concluído</p>
                  <p className="text-xs font-medium">{formatarDataHora(item.concluido_at)}</p>
                </div>
              )}
            </div>

            {isEvolucaoAgrupada && (
              <div className="mb-3 rounded-lg border border-border bg-surface-secondary p-3">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">
                  Procedimentos vinculados
                </p>
                <div className="space-y-2">
                  {itens.map((procedimento) => {
                    const dentesItem = formatarDentes(procedimento.dentes) || procedimento.dente_unico || null;
                    return (
                      <div key={procedimento.item_id} className="text-xs text-muted">
                        <p className="font-medium text-foreground">
                          {procedimento.etapa_label
                            ? `${procedimento.procedimento_nome} — ${procedimento.etapa_label}`
                            : procedimento.procedimento_nome}
                        </p>
                        <p>
                          {procedimento.executor_nome && `Executor responsável: ${procedimento.executor_nome}`}
                          {dentesItem && ` · Dentes: ${dentesItem}`}
                          {procedimento.concluido_at && ` · Concluído em ${formatarDataHora(procedimento.concluido_at)}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {item.prontuario_descricao ? (
              <div className="space-y-3">
                <div className="bg-surface-secondary rounded-lg p-3 border-l-4 border-primary-400">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
                    {isEvolucaoAgrupada ? 'Descrição da Evolução' : 'Descrição do Procedimento'}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {item.prontuario_descricao}
                  </p>
                </div>
                {item.prontuario_observacoes && (
                  <div className="rounded-lg border-l-4 border-warning-400 bg-warning-500/10 p-3">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
                      Observações
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {item.prontuario_observacoes}
                    </p>
                  </div>
                )}
                {item.item_observacoes && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
                      Observações do Item
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {item.item_observacoes}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap justify-end text-[11px] text-muted gap-1">
                  <span>
                    Registrado por <span className="font-medium">{item.prontuario_autor}</span>
                  </span>
                  {item.prontuario_data && (
                    <span>em {formatarDataHora(item.prontuario_data)}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border text-center p-3">
                <p className="text-xs text-muted">Evolução clínica não preenchida</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
