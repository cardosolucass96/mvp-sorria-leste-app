import Link from 'next/link';
import { formatarDataHora, formatarMoeda } from '@/lib/utils/formatters';
import { AGENDAMENTO_STATUS_CONFIG } from '@/lib/constants/agendamentos';

export interface ProcedimentoOrcadoAgenda {
  agendamento_id: number;
  atendimento_id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
  valor: number | null;
  valor_pago: number;
  status: string;
  data_agendada: string | null;
  created_at: string;
}

export default function ProcedimentosOrcadosAgenda({ itens }: { itens: ProcedimentoOrcadoAgenda[] }) {
  if (itens.length === 0) return null;
  return (
    <section className="mb-4 space-y-3" aria-label="Procedimentos orçados na agenda">
      <h3 className="font-semibold">Orçados e agendados</h3>
      {itens.map(item => (
        <div key={item.agendamento_id} className="rounded-xl border border-border p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{item.procedimento_nome}{item.etapa_label ? ` — ${item.etapa_label}` : ''}</h4>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">
              {item.valor_pago <= 0 ? 'Orçado — não pago' : item.valor !== null && item.valor_pago >= item.valor ? 'Pago' : 'Pagamento parcial'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <Link href={`/atendimentos/${item.atendimento_id}`} className="text-info-600 hover:underline">Atendimento #{item.atendimento_id}</Link>
            <span>Executor: {item.executor_nome || 'A definir'}</span>
            <span>Total: {item.valor === null ? 'Não informado' : formatarMoeda(item.valor)}</span>
            <span>Pago: {formatarMoeda(item.valor_pago)}</span>
          </div>
          <p className="text-sm text-muted">
            Agendamento #{item.agendamento_id}: {AGENDAMENTO_STATUS_CONFIG[item.status as keyof typeof AGENDAMENTO_STATUS_CONFIG]?.label || item.status}
            {' · '}{item.data_agendada ? formatarDataHora(item.data_agendada) : 'Sem data definida'}
          </p>
        </div>
      ))}
    </section>
  );
}
