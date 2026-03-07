/**
 * ProcedimentoForm — formulário de procedimento em modal.
 * Usa Modal, Input, Checkbox, Button (Sprint 1).
 * Encapsula lógica de criar/editar procedimento.
 */

'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Checkbox from '@/components/ui/Checkbox';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';

export interface ProcedimentoFormData {
  nome: string;
  valor: string;
  comissao_venda: string;
  comissao_execucao: string;
  por_dente: boolean;
}

export interface ProcedimentoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProcedimentoFormData) => Promise<void>;
  initialData?: Partial<ProcedimentoFormData>;
  isEditing?: boolean;
  loading?: boolean;
  error?: string;
  showComissoes?: boolean;
}

const emptyForm: ProcedimentoFormData = {
  nome: '',
  valor: '',
  comissao_venda: '',
  comissao_execucao: '',
  por_dente: false,
};

export default function ProcedimentoForm({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing = false,
  loading = false,
  error,
  showComissoes = true,
}: ProcedimentoFormProps) {
  const [formData, setFormData] = useState<ProcedimentoFormData>({ ...emptyForm });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({ ...emptyForm, ...initialData });
    }
  }, [isOpen, initialData]);

  const handleChange = (field: keyof ProcedimentoFormData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar Procedimento' : 'Novo Procedimento'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert type="error">{error}</Alert>
        )}

        <Input
          label="Nome"
          name="nome"
          value={formData.nome}
          onChange={handleChange('nome')}
          required
          placeholder="Ex: Limpeza dental"
          disabled={loading}
        />

        <Input
          label="Valor (R$)"
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

        {showComissoes && (
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Comissão Venda (%)"
              name="comissao_venda"
              type="number"
              value={formData.comissao_venda}
              onChange={handleChange('comissao_venda')}
              placeholder="0"
              disabled={loading}
              min={0}
              max={100}
              step="0.1"
            />

            <Input
              label="Comissão Execução (%)"
              name="comissao_execucao"
              type="number"
              value={formData.comissao_execucao}
              onChange={handleChange('comissao_execucao')}
              placeholder="0"
              disabled={loading}
              min={0}
              max={100}
              step="0.1"
            />
          </div>
        )}

        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <Checkbox
            label="🦷 Cobrar por dente"
            name="por_dente"
            checked={formData.por_dente}
            onChange={(checked) => setFormData((prev) => ({ ...prev, por_dente: checked }))}
            hint="Se marcado, o avaliador poderá selecionar múltiplos dentes e o valor será multiplicado pela quantidade"
            disabled={loading}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
