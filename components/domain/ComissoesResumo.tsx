/**
 * ComissoesResumo — tabela resumo de comissões por profissional.
 * Usa Table (Sprint 1) + formatarMoeda (Sprint 0).
 */

'use client';

import Table from '@/components/ui/Table';
import type { TableColumn } from '@/components/ui/Table';
import { formatarMoeda } from '@/lib/utils/formatters';

export interface ComissaoResumoData {
  id: number;
  nome: string;
  role: string;
  total_venda: number;
  total_execucao: number;
}

export interface ComissoesResumoProps {
  comissoes: ComissaoResumoData[];
  loading?: boolean;
  className?: string;
}

export default function ComissoesResumo({
  comissoes,
  loading = false,
  className = '',
}: ComissoesResumoProps) {
  const columns: TableColumn<ComissaoResumoData>[] = [
    {
      key: 'nome',
      label: 'Profissional',
      render: (c) => (
        <div>
          <span className="font-medium text-gray-900">{c.nome}</span>
          <span className="text-xs text-gray-500 ml-2">({c.role})</span>
        </div>
      ),
    },
    {
      key: 'total_venda',
      label: 'Comissão Venda',
      align: 'right',
      render: (c) => (
        <span className={c.total_venda > 0 ? 'text-blue-700 font-medium' : 'text-gray-400'}>
          {formatarMoeda(c.total_venda)}
        </span>
      ),
    },
    {
      key: 'total_execucao',
      label: 'Comissão Execução',
      align: 'right',
      render: (c) => (
        <span className={c.total_execucao > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}>
          {formatarMoeda(c.total_execucao)}
        </span>
      ),
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      render: (c) => (
        <span className="font-bold text-gray-900">
          {formatarMoeda(c.total_venda + c.total_execucao)}
        </span>
      ),
    },
  ];

  const totalGeral = comissoes.reduce(
    (sum, c) => sum + c.total_venda + c.total_execucao,
    0
  );

  return (
    <div className={className}>
      <Table
        columns={columns}
        data={comissoes}
        loading={loading}
        keyExtractor={(c) => c.id}
        emptyMessage="Nenhuma comissão registrada"
        emptyIcon="💰"
        caption="Resumo de comissões por profissional"
      />
      {comissoes.length > 0 && (
        <div className="mt-3 text-right text-sm">
          <span className="text-gray-500">Total Geral: </span>
          <span className="font-bold text-gray-900">{formatarMoeda(totalGeral)}</span>
        </div>
      )}
    </div>
  );
}
