/**
 * ItemAtendimentoRow — dados de renderização para uma linha de item de atendimento.
 * Usado como render functions dentro do Table genérico.
 * Exibe procedimento, executor, valor, status badge, dentes, ações.
 */

import StatusBadge from './StatusBadge';
import Badge from '@/components/ui/Badge';
import { formatarMoeda } from '@/lib/utils/formatters';
import type { ItemStatus } from '@/lib/types';

export interface ItemAtendimentoData {
  id: number;
  procedimento_nome: string;
  executor_nome?: string | null;
  valor: number;
  status: ItemStatus;
  dentes: string | null;
  quantidade: number;
  observacoes?: string | null;
}

export interface ItemAtendimentoRowProps {
  item: ItemAtendimentoData;
  onEdit?: (item: ItemAtendimentoData) => void;
  onRemove?: (item: ItemAtendimentoData) => void;
  showActions?: boolean;
}

function formatarDentes(dentes: string | null): string | null {
  if (!dentes) return null;
  try {
    const arr = JSON.parse(dentes);
    return arr.join(', ');
  } catch {
    return dentes;
  }
}

export default function ItemAtendimentoRow({
  item,
  onEdit,
  onRemove,
  showActions = true,
}: ItemAtendimentoRowProps) {
  const dentesFormatados = formatarDentes(item.dentes);

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{item.procedimento_nome}</div>
        {item.observacoes && (
          <div className="text-xs text-gray-500 mt-0.5">{item.observacoes}</div>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">
        {item.executor_nome || '-'}
      </td>
      <td className="px-4 py-3 text-right font-medium">
        {formatarMoeda(item.valor)}
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge type="item" status={item.status} size="sm" />
      </td>
      <td className="px-4 py-3 text-center">
        {dentesFormatados ? (
          <Badge color="orange" size="sm">🦷 {dentesFormatados}</Badge>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      {showActions && (
        <td className="px-4 py-3 text-right space-x-2">
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Editar
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => onRemove(item)}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
            >
              Remover
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
