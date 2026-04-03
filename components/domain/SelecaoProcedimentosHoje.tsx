'use client';

import { formatarMoeda } from '@/lib/utils/formatters';

interface Etapa {
  id: number;
  item_atendimento_id: number;
  dente: string;
  face: string;
  status: string;
  nome?: string;
  tipo?: 'face' | 'modelo';
  valor?: number | null;
}

interface ItemAtendimento {
  id: number;
  procedimento_id: number;
  procedimento_nome: string;
  valor: number;
  valor_pago: number;
  status: string;
  group_id: string | null;
  dente_unico: string | null;
  etapa_label: string | null;
  etapas?: Etapa[];
}

const FACE_LABEL: Record<string, string> = {
  V: 'Vestibular',
  L: 'Lingual',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal',
};

interface Props {
  itens: ItemAtendimento[];
  itensHoje: Set<number>;
  onToggleItem: (id: number) => void;
  datasAgendamento: Record<number, string>;
  onSetData: (id: number, data: string) => void;
  etapasHoje: Set<number>;
  onToggleEtapa: (id: number) => void;
  etapasDatas: Record<number, string>;
  onSetEtapaData: (id: number, data: string) => void;
  onConfirmar: () => void;
  confirmando: boolean;
  onFinalizarSemProcedimentos: () => void;
}

// Calcula o valor efetivo de um item considerando apenas as etapas selecionadas
function calcularValorEfetivo(item: ItemAtendimento, etapasHoje: Set<number>): number {
  const etapas = item.etapas ?? [];
  const etapasModelo = etapas.filter(e => e.tipo === 'modelo');
  if (etapasModelo.length === 0) return item.valor;
  const selecionadas = etapasModelo.filter(e => etapasHoje.has(e.id));
  if (selecionadas.length === etapasModelo.length) return item.valor;
  if (selecionadas.length === 0) return 0;
  const todosTemValor = selecionadas.every(e => e.valor != null);
  if (!todosTemValor) return item.valor;
  return selecionadas.reduce((sum, e) => sum + (e.valor ?? 0), 0);
}

export default function SelecaoProcedimentosHoje({
  itens,
  itensHoje,
  onToggleItem,
  datasAgendamento,
  onSetData,
  etapasHoje,
  onToggleEtapa,
  etapasDatas,
  onSetEtapaData,
  onConfirmar,
  confirmando,
  onFinalizarSemProcedimentos,
}: Props) {
  const itensParaHoje = itens.filter(i => itensHoje.has(i.id));
  const itensParaAgendar = itens.filter(i => !itensHoje.has(i.id));
  const totalHoje = itensParaHoje.reduce((sum, i) => sum + calcularValorEfetivo(i, etapasHoje), 0);
  const nenhumSelecionado = itensHoje.size === 0;

  // Conta etapas que serão adiadas (de itens que ficam hoje)
  const etapasAdiadas = itensParaHoje
    .flatMap(i => (i.etapas ?? []).filter(e => !etapasHoje.has(e.id)));

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-foreground">O que será feito hoje?</h2>
          <p className="text-sm text-muted mt-1">
            Selecione os procedimentos (e etapas) que serão realizados nesta sessão. Os não selecionados irão para a fila de agendamentos.
          </p>
        </div>

        <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-lg overflow-hidden">
          {itens.map((item) => {
            const selecionado = itensHoje.has(item.id);
            const etapas = item.etapas ?? [];
            const temEtapas = etapas.length > 0;
            let label = item.dente_unico
              ? `${item.procedimento_nome} • Dente ${item.dente_unico}`
              : item.procedimento_nome;
            if (item.etapa_label) label += ` — ${item.etapa_label}`;
            const valorExibido = selecionado
              ? calcularValorEfetivo(item, etapasHoje)
              : item.valor;

            return (
              <div key={item.id} className={`${selecionado ? 'bg-surface' : 'bg-neutral-50'}`}>
                {/* Linha do item */}
                <div className="px-4 py-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={() => onToggleItem(item.id)}
                      className="w-4 h-4 accent-primary-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${selecionado ? 'text-foreground' : 'text-neutral-500'}`}>
                        {label}
                      </span>
                      {temEtapas && selecionado && (
                        <span className="ml-2 text-xs text-muted">
                          {etapas.filter(e => etapasHoje.has(e.id)).length}/{etapas.length} etapa(s)
                        </span>
                      )}
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${selecionado ? 'text-foreground' : 'text-neutral-400'}`}>
                      {formatarMoeda(valorExibido)}
                    </span>
                  </label>

                  {/* Data de agendamento (quando item inteiro não selecionado) */}
                  {!selecionado && (
                    <div className="mt-2 ml-7">
                      <label className="block text-xs text-muted mb-1">
                        Data prevista para agendamento (opcional)
                      </label>
                      <input
                        type="date"
                        value={datasAgendamento[item.id] ?? ''}
                        onChange={(e) => onSetData(item.id, e.target.value)}
                        className="input text-sm py-1"
                      />
                    </div>
                  )}
                </div>

                {/* Sub-lista de etapas (apenas quando item está selecionado e tem etapas) */}
                {selecionado && temEtapas && (
                  <div className="ml-7 mr-4 mb-3 border border-neutral-200 rounded-lg overflow-hidden">
                    {etapas.map((etapa) => {
                      const etapaSelecionada = etapasHoje.has(etapa.id);
                      return (
                        <div key={etapa.id} className={`px-3 py-2 border-b border-neutral-100 last:border-b-0 ${etapaSelecionada ? '' : 'bg-neutral-50'}`}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={etapaSelecionada}
                              onChange={() => onToggleEtapa(etapa.id)}
                              className="w-3.5 h-3.5 accent-primary-600 shrink-0"
                            />
                            <span className={`text-xs font-medium flex-1 ${etapaSelecionada ? 'text-foreground' : 'text-neutral-500'}`}>
                              {etapa.tipo === 'modelo'
                                ? (etapa.nome ?? `Etapa ${etapas.indexOf(etapa) + 1}`)
                                : `Dente ${etapa.dente} — ${FACE_LABEL[etapa.face] ?? etapa.face} (${etapa.face})`}
                            </span>
                            {etapa.tipo === 'modelo' && etapa.valor != null && (
                              <span className={`text-xs font-semibold ${etapaSelecionada ? 'text-foreground' : 'text-neutral-400'}`}>
                                {formatarMoeda(etapa.valor)}
                              </span>
                            )}
                            {!etapaSelecionada && (
                              <span className="text-xs text-warning-600">→ agenda</span>
                            )}
                          </label>
                          {!etapaSelecionada && (
                            <div className="mt-1.5 ml-5">
                              <input
                                type="date"
                                value={etapasDatas[etapa.id] ?? ''}
                                onChange={(e) => onSetEtapaData(etapa.id, e.target.value)}
                                className="input text-xs py-0.5"
                                placeholder="Data prevista (opcional)"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Resumo */}
        <div className="mt-4 flex flex-col gap-1 text-sm text-muted">
          <span>
            {itensParaHoje.length > 0
              ? `${itensParaHoje.length} procedimento(s) hoje — ${formatarMoeda(totalHoje)}`
              : 'Nenhum procedimento selecionado para hoje'}
            {itensParaAgendar.length > 0 && (
              <span className="ml-2 text-warning-600">
                · {itensParaAgendar.length} vão para a agenda
              </span>
            )}
          </span>
          {etapasAdiadas.length > 0 && (
            <span className="text-warning-600">
              · {etapasAdiadas.length} etapa(s) de procedimentos de hoje serão agendadas separadamente
            </span>
          )}
        </div>

        <div className="mt-4">
          {nenhumSelecionado ? (
            <button
              onClick={onFinalizarSemProcedimentos}
              disabled={confirmando}
              className="btn btn-secondary w-full disabled:opacity-50"
            >
              {confirmando ? 'Processando...' : 'Confirmar sem procedimentos hoje'}
            </button>
          ) : (
            <button
              onClick={onConfirmar}
              disabled={confirmando}
              className="btn btn-primary w-full disabled:opacity-50"
            >
              {confirmando ? 'Confirmando...' : 'Confirmar e ir para execução →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
