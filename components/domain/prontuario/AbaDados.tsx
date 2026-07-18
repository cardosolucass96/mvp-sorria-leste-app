'use client';

import { Cliente } from '@/lib/types';
import { formatarData, formatarMoeda, formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';
import { calculateAgeFromDateOnly } from '@/lib/time';

export interface AbaDadosProps {
  cliente: Cliente & { idade?: number | null };
  saldo?: { saldo: number; saldo_calculado: number };
  restricted?: boolean;
}

export default function AbaDados({ cliente, saldo, restricted = false }: AbaDadosProps) {
  const idade = typeof cliente.idade === 'number'
    ? cliente.idade
    : calcularIdade(cliente.data_nascimento);
  const sexo = cliente.sexo ? cliente.sexo.charAt(0).toUpperCase() + cliente.sexo.slice(1) : null;

  if (restricted) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Dados do Paciente</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Nome Completo" value={cliente.nome} />
          <Campo label="Idade" value={idade !== null ? `${idade} anos` : null} />
          <Campo label="Sexo" value={sexo} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {saldo && (saldo.saldo > 0 || saldo.saldo_calculado > 0) && (
        <div className="tone-primary rounded-lg p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Saldo</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted">Crédito em procedimentos</p>
              <p className="font-semibold">{formatarMoeda(saldo.saldo_calculado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Saldo disponível</p>
              <p className={`font-semibold ${saldo.saldo > 0 ? 'text-success-700 dark:text-success-300' : ''}`}>
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
            value={sexo}
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
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{cliente.observacoes}</p>
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
  return calculateAgeFromDateOnly(dataNasc);
}
