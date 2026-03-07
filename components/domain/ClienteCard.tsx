/**
 * ClienteCard — card resumo de um cliente para listagens.
 * Exibe nome, CPF formatado, telefone formatado, email, origem.
 */

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';
import type { Cliente } from '@/lib/types';

export interface ClienteCardProps {
  cliente: Cliente;
  onClick?: () => void;
  className?: string;
}

export default function ClienteCard({ cliente, onClick, className }: ClienteCardProps) {
  return (
    <Card onClick={onClick} className={className}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate">{cliente.nome}</h3>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <p>📄 CPF: {formatarCPF(cliente.cpf)}</p>
            <p>📱 Tel: {formatarTelefone(cliente.telefone)}</p>
            {cliente.email && <p>✉️ {cliente.email}</p>}
          </div>
        </div>
        <Badge color="orange" size="sm">
          {getOrigemLabel(cliente.origem)}
        </Badge>
      </div>
    </Card>
  );
}
