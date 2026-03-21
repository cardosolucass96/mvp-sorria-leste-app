/**
 * ClienteCard — card resumo de um cliente para listagens.
 * Exibe nome, CPF formatado, telefone formatado, email, origem.
 */

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';
import type { Cliente } from '@/lib/types';
import { FileText, Phone, Mail } from 'lucide-react';

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
          <h3 className="font-semibold text-foreground truncate">{cliente.nome}</h3>
          <div className="mt-2 space-y-1 text-sm text-neutral-600">
            <p className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 shrink-0 text-neutral-400" aria-hidden="true" /> CPF: {formatarCPF(cliente.cpf)}</p>
            <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0 text-neutral-400" aria-hidden="true" /> Tel: {formatarTelefone(cliente.telefone)}</p>
            {cliente.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 shrink-0 text-neutral-400" aria-hidden="true" /> {cliente.email}</p>}
          </div>
        </div>
        <Badge color="orange" size="sm">
          {getOrigemLabel(cliente.origem)}
        </Badge>
      </div>
    </Card>
  );
}
