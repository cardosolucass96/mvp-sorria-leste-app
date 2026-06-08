'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import type { VinculoCliente } from '@/lib/types';

export interface AbaVinculosProps {
  vinculos: VinculoCliente[];
}

export default function AbaVinculos({ vinculos }: AbaVinculosProps) {
  if (!vinculos.length) {
    return (
      <div className="flex flex-col items-center py-10 text-muted">
        <Users className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm">Nenhum vínculo cadastrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {vinculos.map(v => (
        <div key={v.id} className="rounded-lg border border-border p-3">
          <Link
            href={`/clientes/${v.outro_cliente_id}`}
            className="font-medium text-primary-600 hover:underline text-sm"
          >
            {v.outro_cliente_nome}
          </Link>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted">
            {v.outro_cliente_cpf && <span>CPF: {v.outro_cliente_cpf}</span>}
            {v.outro_cliente_telefone && <span>Tel: {v.outro_cliente_telefone}</span>}
          </div>
          {v.observacao && (
            <p className="mt-2 whitespace-pre-wrap rounded bg-muted/35 px-2 py-1.5 text-sm text-foreground">
              {v.observacao}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
