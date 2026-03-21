/**
 * ClienteForm — formulário completo de cliente (novo + edição).
 * Usa Input, Select, Textarea, Button (Sprint 1) + ORIGENS_OPTIONS (Sprint 0).
 * Encapsula máscaras de CPF/telefone e layout em grid.
 */

'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { ORIGENS_OPTIONS } from '@/lib/constants/origens';
import { validarCPF, validarEmail, validarTelefone } from '@/lib/utils/validators';
import { unmask } from '@/lib/utils/masks';

export interface ClienteFormData {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  data_nascimento: string;
  endereco: string;
  origem: string;
  observacoes: string;
}

export interface ClienteFormProps {
  initialData?: Partial<ClienteFormData>;
  onSubmit: (data: ClienteFormData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  error?: string;
  submitLabel?: string;
  className?: string;
}

const emptyForm: ClienteFormData = {
  nome: '',
  cpf: '',
  telefone: '',
  email: '',
  data_nascimento: '',
  endereco: '',
  origem: '',
  observacoes: '',
};

export default function ClienteForm({
  initialData,
  onSubmit,
  onCancel,
  loading = false,
  error,
  submitLabel = 'Salvar',
  className = '',
}: ClienteFormProps) {
  const [formData, setFormData] = useState<ClienteFormData>({
    ...emptyForm,
    ...initialData,
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ClienteFormData, string>>>({});

  const handleChange = (field: keyof ClienteFormData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof ClienteFormData, string>> = {};
    if (!formData.nome.trim()) errors.nome = 'Nome é obrigatório';
    else if (formData.nome.trim().length < 2) errors.nome = 'Nome deve ter ao menos 2 caracteres';
    if (formData.cpf && !validarCPF(unmask(formData.cpf))) errors.cpf = 'CPF inválido';
    if (formData.email && !validarEmail(formData.email)) errors.email = 'Email inválido';
    if (formData.telefone && !validarTelefone(unmask(formData.telefone))) errors.telefone = 'Telefone inválido';
    if (!formData.origem) errors.origem = 'Origem é obrigatória';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${className}`}>
      {error && (
        <Alert type="error">{error}</Alert>
      )}

      {/* Dados Pessoais */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Dados Pessoais</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Nome Completo"
              name="nome"
              value={formData.nome}
              onChange={handleChange('nome')}
              required
              placeholder="Digite o nome completo"
              disabled={loading}
              error={fieldErrors.nome}
            />
          </div>

          <Input
            label="CPF"
            name="cpf"
            value={formData.cpf}
            onChange={handleChange('cpf')}
            mask="cpf"
            placeholder="000.000.000-00"
            disabled={loading}
            error={fieldErrors.cpf}
          />

          <Input
            label="Data de Nascimento"
            name="data_nascimento"
            type="date"
            value={formData.data_nascimento}
            onChange={handleChange('data_nascimento')}
            disabled={loading}
          />

          <Select
            label="Origem"
            name="origem"
            value={formData.origem}
            onChange={handleChange('origem')}
            options={ORIGENS_OPTIONS}
            required
            placeholder="Selecione..."
            disabled={loading}
            error={fieldErrors.origem}
          />
        </div>
      </div>

      {/* Contato */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Contato</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Telefone"
            name="telefone"
            value={formData.telefone}
            onChange={handleChange('telefone')}
            mask="telefone"
            placeholder="(00) 00000-0000"
            disabled={loading}
            error={fieldErrors.telefone}
          />

          <Input
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange('email')}
            placeholder="email@exemplo.com"
            disabled={loading}
            error={fieldErrors.email}
          />

          <div className="md:col-span-2">
            <Input
              label="Endereço"
              name="endereco"
              value={formData.endereco}
              onChange={handleChange('endereco')}
              placeholder="Rua, número, bairro, cidade"
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {/* Observações */}
      <Textarea
        label="Observações"
        name="observacoes"
        value={formData.observacoes}
        onChange={handleChange('observacoes')}
        rows={3}
        placeholder="Observações sobre o cliente (alergias, preferências, etc.)"
        disabled={loading}
      />

      {/* Botões */}
      <div className="flex gap-2 pt-4 border-t">
        <Button type="submit" loading={loading}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
