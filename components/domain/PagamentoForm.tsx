/**
 * PagamentoForm — formulário de pagamento.
 * Método (select), valor (moeda input), parcelas.
 */

'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { METODO_PAGAMENTO_LABELS } from '@/lib/constants/status';
import type { MetodoPagamento } from '@/lib/types';

export interface PagamentoFormData {
  metodo: string;
  valor: string;
  parcelas: string;
  observacoes: string;
}

export interface PagamentoFormProps {
  onSubmit: (data: PagamentoFormData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  error?: string;
  maxValor?: number;
  className?: string;
}

const metodoOptions = Object.entries(METODO_PAGAMENTO_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default function PagamentoForm({
  onSubmit,
  onCancel,
  loading = false,
  error,
  maxValor,
  className = '',
}: PagamentoFormProps) {
  const [formData, setFormData] = useState<PagamentoFormData>({
    metodo: '',
    valor: '',
    parcelas: '1',
    observacoes: '',
  });

  const handleChange = (field: keyof PagamentoFormData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const showParcelas = formData.metodo === 'cartao_credito';

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      {error && <Alert type="error">{error}</Alert>}

      <Select
        label="Método de Pagamento"
        name="metodo"
        value={formData.metodo}
        onChange={handleChange('metodo')}
        options={metodoOptions}
        required
        disabled={loading}
      />

      <Input
        label={`Valor${maxValor ? ` (máx. R$ ${maxValor.toFixed(2)})` : ''}`}
        name="valor"
        type="number"
        value={formData.valor}
        onChange={handleChange('valor')}
        required
        placeholder="0,00"
        disabled={loading}
        min={0}
        step="0.01"
      />

      {showParcelas && (
        <Input
          label="Parcelas"
          name="parcelas"
          type="number"
          value={formData.parcelas}
          onChange={handleChange('parcelas')}
          min={1}
          max={12}
          disabled={loading}
        />
      )}

      <div className="flex justify-end gap-3 pt-4">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={loading}>
          Registrar Pagamento
        </Button>
      </div>
    </form>
  );
}
