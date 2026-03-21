/**
 * PagamentoDistribuicao — distribuição de pagamento por itens.
 * Lista de itens com checkbox + valor input. Barra de progresso mostrando soma.
 */

'use client';

import Checkbox from '@/components/ui/Checkbox';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { formatarMoeda } from '@/lib/utils/formatters';

export interface ItemDistribuicao {
  id: number;
  nome: string;
  valorRestante: number;
  selecionado: boolean;
  valorAplicado: string;
}

export interface PagamentoDistribuicaoProps {
  itens: ItemDistribuicao[];
  totalPagamento: number;
  onChange: (itens: ItemDistribuicao[]) => void;
  className?: string;
}

export default function PagamentoDistribuicao({
  itens,
  totalPagamento,
  onChange,
  className = '',
}: PagamentoDistribuicaoProps) {
  const totalDistribuido = itens.reduce(
    (sum, item) => sum + (item.selecionado ? parseFloat(item.valorAplicado) || 0 : 0),
    0
  );

  const percentual = totalPagamento > 0 ? Math.min((totalDistribuido / totalPagamento) * 100, 100) : 0;
  const isValid = Math.abs(totalDistribuido - totalPagamento) < 0.01;

  const handleToggle = (index: number) => (checked: boolean) => {
    const updated = [...itens];
    updated[index] = {
      ...updated[index],
      selecionado: checked,
      valorAplicado: checked ? updated[index].valorRestante.toFixed(2) : '0',
    };
    onChange(updated);
  };

  const handleValorChange = (index: number) => (value: string) => {
    const updated = [...itens];
    updated[index] = { ...updated[index], valorAplicado: value };
    onChange(updated);
  };

  const distribuirIgualmente = () => {
    const selecionados = itens.filter((i) => i.selecionado);
    if (selecionados.length === 0) return;

    const valorPorItem = totalPagamento / selecionados.length;
    const updated = itens.map((item) => ({
      ...item,
      valorAplicado: item.selecionado ? valorPorItem.toFixed(2) : '0',
    }));
    onChange(updated);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">Distribuir para itens</h3>
        <Button variant="ghost" size="sm" onClick={distribuirIgualmente}>
          Distribuir igualmente
        </Button>
      </div>

      {/* Barra de progresso */}
      <div>
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>Distribuído: {formatarMoeda(totalDistribuido)}</span>
          <span>Total: {formatarMoeda(totalPagamento)}</span>
        </div>
        <div className="w-full bg-neutral-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              isValid ? 'bg-success-500' : percentual > 100 ? 'bg-error-500' : 'bg-primary-500'
            }`}
            style={{ width: `${Math.min(percentual, 100)}%` }}
          />
        </div>
      </div>

      {/* Lista de itens */}
      <div className="space-y-2">
        {itens.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 p-3 rounded-lg border ${
              item.selecionado ? 'border-primary-200 bg-primary-50' : 'border-border bg-surface'
            }`}
          >
            <Checkbox
              label={item.nome}
              checked={item.selecionado}
              onChange={handleToggle(index)}
            />
            <span className="text-xs text-muted shrink-0">
              (restante: {formatarMoeda(item.valorRestante)})
            </span>
            {item.selecionado && (
              <div className="w-28 shrink-0">
                <Input
                  label=""
                  name={`valor-${item.id}`}
                  type="number"
                  value={item.valorAplicado}
                  onChange={handleValorChange(index)}
                  min={0}
                  step="0.01"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
