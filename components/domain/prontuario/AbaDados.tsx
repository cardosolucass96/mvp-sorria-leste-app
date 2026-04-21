'use client';

import { Cliente } from '@/lib/types';
import { formatarData, formatarMoeda, formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';

export interface AbaDadosProps {
  cliente: Cliente;
  saldo?: { saldo: number; saldo_calculado: number };
}

export default function AbaDados({ cliente, saldo }: AbaDadosProps) {
  const idade = calcularIdade(cliente.data_nascimento);

  return (
    <div className="space-y-6">
      {saldo && (saldo.saldo > 0 || saldo.saldo_calculado > 0) && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4">
          <h3 className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-2">Saldo</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted">Crédito em procedimentos</p>
              <p className="font-semibold">{formatarMoeda(saldo.saldo_calculado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Saldo disponível</p>
              <p className={`font-semibold ${saldo.saldo > 0 ? 'text-success-700' : ''}`}>
                {formatarMoeda(saldo.saldo)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Dados Pessoais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Nome Completo" value={cliente.nome} />
          <Campo label="CPF" value={cliente.cpf ? formatarCPF(cliente.cpf) : null} />
          <Campo
            label="Data de Nascimento"
            value={
              cliente.data_nascimento
                ? `${formatarData(cliente.data_nascimento)}${idade !== null ? ` (${idade} anos)` : ''}`
                : null
            }
          />
          <Campo
            label="Sexo"
            value={cliente.sexo ? cliente.sexo.charAt(0).toUpperCase() + cliente.sexo.slice(1) : null}
          />
          <Campo label="Origem" value={getOrigemLabel(cliente.origem)} />
          <Campo label="Plano Odontológico" value={cliente.plano_odontologico} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Contato</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Telefone" value={cliente.telefone ? formatarTelefone(cliente.telefone) : null} />
          <Campo label="Email" value={cliente.email} />
          <div className="sm:col-span-2">
            <Campo label="Endereço" value={cliente.endereco} />
          </div>
        </div>
      </div>

      {cliente.observacoes && (
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Observações</h3>
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{cliente.observacoes}</p>
        </div>
      )}
    </div>
  );
}

function Campo({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium text-sm">{value || '-'}</p>
    </div>
  );
}

function calcularIdade(dataNasc: string | null): number | null {
  if (!dataNasc) return null;
  const hoje = new Date();
  const nasc = new Date(dataNasc);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade >= 0 ? idade : null;
}
