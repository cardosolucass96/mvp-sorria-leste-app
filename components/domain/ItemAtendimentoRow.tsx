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
  dente_unico?: string | null;
  etapa_label?: string | null;
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
    <tr className="hover:bg-muted">
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">
          {item.procedimento_nome}
          {item.dente_unico && (
            <span className="text-sm text-muted-foreground font-normal ml-1">• Dente {item.dente_unico}</span>
          )}
          {item.etapa_label && (
            <span className="text-sm text-muted-foreground font-normal ml-1">— {item.etapa_label}</span>
          )}
        </div>
        {item.observacoes && (
          <div className="text-xs text-muted-foreground mt-0.5">{item.observacoes}</div>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
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
          <Badge color="orange" size="sm">{dentesFormatados}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      {showActions && (
        <td className="px-4 py-3 text-right space-x-2">
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              className="text-info-600 hover:text-info-800 text-sm font-medium"
            >
              Editar
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => onRemove(item)}
              className="text-error-600 hover:text-error-800 text-sm font-medium"
            >
              Remover
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
