'use client';

import Link from 'next/link';
import { formatarDataHora, formatarMoeda } from '@/lib/utils/formatters';
import { METODOS_LABEL, HISTORICO_CONFIG, type Pagamento, type Movimentacao } from './types';

export interface AbaPagamentosProps {
  pagamentos: Pagamento[];
  movimentacoes: Movimentacao[];
}

export default function AbaPagamentos({ pagamentos, movimentacoes }: AbaPagamentosProps) {
  const total = pagamentos.filter(p => !p.cancelado).reduce((s, p) => s + p.valor, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Pagamentos</h3>
          <span className="text-sm font-semibold text-success-700 dark:text-success-300">
            Total: {formatarMoeda(total)}
          </span>
        </div>
        {!pagamentos.length ? (
          <p className="text-center py-6 text-muted text-sm">Nenhum pagamento registrado</p>
        ) : (
          <div className="space-y-2">
            {pagamentos.map(p => (
              <div
                key={p.id}
                className={`rounded-lg border border-border p-3 ${p.cancelado ? 'bg-muted/35 opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {METODOS_LABEL[p.metodo] || p.metodo}
                      </span>
                      {p.cancelado ? (
                        <span className="rounded bg-error-500/10 px-1.5 py-0.5 text-xs text-error-700 dark:text-error-200">
                          Cancelado
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted">
                      <Link
                        href={`/atendimentos/${p.atendimento_id}`}
                        className="text-primary-600 hover:underline"
                      >
                        Atend. #{p.atendimento_id}
                      </Link>
                      <span>{formatarDataHora(p.created_at)}</span>
                      {p.recebido_por_nome && <span>Por: {p.recebido_por_nome}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-semibold ${p.cancelado ? 'text-muted-foreground line-through' : 'text-success-600 dark:text-success-300'}`}
                    >
                      {formatarMoeda(p.valor)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {movimentacoes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            Movimentações de Saldo
          </h3>
          <div className="space-y-2">
            {movimentacoes.map((m, i) => {
              const isEntrada = ['credito', 'transferencia_entrada'].includes(m.tipo);
              const cfg = HISTORICO_CONFIG[m.tipo] ?? { label: m.tipo, cor: 'bg-muted' };
              return (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.cor}`} />
                        <span className="text-sm font-medium">{cfg.label}</span>
                      </div>
                      <p className="text-xs text-muted mt-1">{formatarDataHora(m.data)}</p>
                      {m.descricao && (
                        <p className="mt-1 text-xs text-muted-foreground">{m.descricao}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-medium ${isEntrada ? 'text-success-600' : 'text-error-600'}`}
                      >
                        {isEntrada ? '+' : '-'}
                        {formatarMoeda(m.valor)}
                      </p>
                      <p className="text-xs text-muted">Saldo: {formatarMoeda(m.saldo_novo)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
