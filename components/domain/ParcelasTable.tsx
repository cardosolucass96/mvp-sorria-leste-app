/**
 * ParcelasTable — tabela de parcelas com status badges.
 * Usa Table (Sprint 1) + StatusBadge.
 */

'use client';

import Table from '@/components/ui/Table';
import type { TableColumn } from '@/components/ui/Table';
import StatusBadge from './StatusBadge';
import { formatarMoeda, formatarData } from '@/lib/utils/formatters';

export interface ParcelaData {
  id: number;
  numero: number;
  valor: number;
  vencimento: string;
  status: 'pendente' | 'paga' | 'vencida';
  pago_em?: string | null;
}

export interface ParcelasTableProps {
  parcelas: ParcelaData[];
  loading?: boolean;
  onMarcarPaga?: (parcela: ParcelaData) => void;
  className?: string;
}

export default function ParcelasTable({
  parcelas,
  loading = false,
  onMarcarPaga,
  className = '',
}: ParcelasTableProps) {
  const columns: TableColumn<ParcelaData>[] = [
    {
      key: 'numero',
      label: 'Parcela',
      render: (p) => <span className="font-medium">{p.numero}ª</span>,
    },
    {
      key: 'valor',
      label: 'Valor',
      align: 'right',
      render: (p) => formatarMoeda(p.valor),
    },
    {
      key: 'vencimento',
      label: 'Vencimento',
      render: (p) => formatarData(p.vencimento),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      render: (p) => <StatusBadge type="parcela" status={p.status} showIcon={false} size="sm" />,
    },
    ...(onMarcarPaga
      ? [
          {
            key: 'acoes',
            label: 'Ações',
            align: 'right' as const,
            render: (p: ParcelaData) =>
              p.status === 'pendente' || p.status === 'vencida' ? (
                <button
                  onClick={() => onMarcarPaga(p)}
                  className="text-green-600 hover:text-green-800 text-sm font-medium"
                >
                  Marcar Paga
                </button>
              ) : p.pago_em ? (
                <span className="text-xs text-gray-500">Pago em {formatarData(p.pago_em)}</span>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Table
      columns={columns}
      data={parcelas}
      loading={loading}
      keyExtractor={(p) => p.id}
      emptyMessage="Nenhuma parcela registrada"
      emptyIcon="💳"
      caption="Tabela de parcelas"
      className={className}
    />
  );
}
