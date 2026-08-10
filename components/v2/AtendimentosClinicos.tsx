'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, PlayCircle, SearchCheck, Stethoscope } from 'lucide-react';
import { Alert, Badge, LoadingState, PageHeader, StatCard, Table } from '@/components/ui';
import type { BadgeProps, TableColumn } from '@/components/ui';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { formatarDataHora } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

interface AtendimentoClinico {
  id: string;
  cliente_id: number;
  cliente_nome: string;
  status: 'aguardando' | 'em_andamento' | 'finalizado' | 'cancelado';
  avaliacao_id: string | null;
  avaliacao_status: string | null;
  avaliador_nome: string | null;
  procedimentos_count: number;
  checkin_em: string | null;
  created_at: string;
}

const COLORS: Record<string, BadgeProps['color']> = {
  aguardando: 'amber',
  em_andamento: 'purple',
  finalizado: 'green',
  cancelado: 'gray',
};
const LABELS: Record<string, string> = {
  aguardando: 'Aguardando',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

export default function AtendimentosClinicos() {
  usePageTitle('Atendimentos clínicos');
  const unitFetch = useUnitFetch();
  const [items, setItems] = useState<AtendimentoClinico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await unitFetch('/api/v2/atendimentos');
      const data = await response.json() as AtendimentoClinico[] & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar atendimentos');
      setItems(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar atendimentos');
    } finally {
      setLoading(false);
    }
  }, [unitFetch]);
  useEffect(() => { void load(); }, [load]);

  const columns: TableColumn<AtendimentoClinico>[] = [
    { key: 'cliente_nome', label: 'Paciente', render: (item) => <span className="font-medium text-foreground">{item.cliente_nome}</span> },
    { key: 'status', label: 'Status', render: (item) => <Badge color={COLORS[item.status]}>{LABELS[item.status]}</Badge> },
    {
      key: 'avaliacao',
      label: 'Avaliação',
      render: (item) => item.avaliacao_id
        ? <div><Badge color="evaluation">{item.avaliacao_status}</Badge><p className="mt-1 text-xs text-muted-foreground">{item.avaliador_nome}</p></div>
        : <span className="text-muted-foreground">Não</span>,
    },
    { key: 'procedimentos_count', label: 'Procedimentos', align: 'center' },
    { key: 'checkin_em', label: 'Chegada', render: (item) => formatarDataHora(item.checkin_em ?? item.created_at) },
    { key: 'id', label: 'Identificador', render: (item) => <code className="text-xs text-muted-foreground">{item.id.slice(0, 8)}</code> },
  ];
  const inProgress = items.filter((item) => item.status === 'em_andamento').length;
  const evaluations = items.filter((item) => item.avaliacao_id).length;
  const executions = items.filter((item) => Number(item.procedimentos_count) > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atendimentos clínicos"
        description="Somente avaliações e execuções geram atendimento. Recebimentos e tarefas administrativas ficam fora daqui."
        icon={<Stethoscope className="size-7" />}
      />
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<PlayCircle className="size-5" />} label="Em andamento" value={inProgress} color="border-evaluation-500" />
        <StatCard icon={<SearchCheck className="size-5" />} label="Com avaliação" value={evaluations} color="border-info-500" />
        <StatCard icon={<ClipboardList className="size-5" />} label="Com execução" value={executions} color="border-success-500" />
      </div>
      {loading
        ? <LoadingState text="Carregando atendimentos clínicos..." />
        : <Table columns={columns} data={items} keyExtractor={(item) => item.id} emptyMessage="Nenhum atendimento clínico" caption="Atendimentos clínicos" />}
    </div>
  );
}
