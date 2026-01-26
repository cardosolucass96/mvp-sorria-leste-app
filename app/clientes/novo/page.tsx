'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ClienteFormData {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  data_nascimento: string;
  endereco: string;
  origem: string;
  observacoes: string;
}

const origensOptions = [
  { value: 'fachada', label: 'Fachada' },
  { value: 'trafego_meta', label: 'Tráfego Meta (Facebook/Instagram)' },
  { value: 'trafego_google', label: 'Tráfego Google' },
  { value: 'organico', label: 'Orgânico' },
  { value: 'indicacao', label: 'Indicação' },
];

const initialFormData: ClienteFormData = {
  nome: '',
  cpf: '',
  telefone: '',
  email: '',
  data_nascimento: '',
  endereco: '',
  origem: '',
  observacoes: '',
};

export default function NovoClientePage() {
  const [formData, setFormData] = useState<ClienteFormData>(initialFormData);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Formatar CPF
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    // Formata: 000.000.000-00
    if (value.length > 9) {
      value = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
    } else if (value.length > 6) {
      value = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6)}`;
    } else if (value.length > 3) {
      value = `${value.slice(0, 3)}.${value.slice(3)}`;
    }
    
    setFormData(prev => ({ ...prev, cpf: value }));
  };

  // Formatar Telefone
  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    // Formata: (00) 00000-0000
    if (value.length > 6) {
      value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 2) {
      value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    }
    
    setFormData(prev => ({ ...prev, telefone: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao cadastrar cliente');
        setIsLoading(false);
        return;
      }

      // Redireciona para a página do cliente criado
      router.push(`/clientes/${data.id}`);
    } catch {
      setError('Erro ao cadastrar cliente');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          href="/clientes" 
          className="text-gray-600 hover:text-gray-900"
        >
          ← Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">➕ Novo Cliente</h1>
          <p className="text-gray-600">Cadastrar novo cliente na clínica</p>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Formulário */}
      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados Pessoais */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Dados Pessoais</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="nome" className="label">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="nome"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  className="input"
                  required
                  placeholder="Digite o nome completo"
                />
              </div>

              <div>
                <label htmlFor="cpf" className="label">CPF</label>
                <input
                  type="text"
                  id="cpf"
                  name="cpf"
                  value={formData.cpf}
                  onChange={handleCpfChange}
                  className="input"
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <label htmlFor="data_nascimento" className="label">Data de Nascimento</label>
                <input
                  type="date"
                  id="data_nascimento"
                  name="data_nascimento"
                  value={formData.data_nascimento}
                  onChange={handleChange}
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="origem" className="label">
                  Origem <span className="text-red-500">*</span>
                </label>
                <select
                  id="origem"
                  name="origem"
                  value={formData.origem}
                  onChange={handleChange}
                  className="input"
                  required
                >
                  <option value="">Selecione</option>
                  {origensOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Contato */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Contato</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="telefone" className="label">Telefone</label>
                <input
                  type="text"
                  id="telefone"
                  name="telefone"
                  value={formData.telefone}
                  onChange={handleTelefoneChange}
                  className="input"
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div>
                <label htmlFor="email" className="label">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="input"
                  placeholder="email@exemplo.com"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="endereco" className="label">Endereço</label>
                <input
                  type="text"
                  id="endereco"
                  name="endereco"
                  value={formData.endereco}
                  onChange={handleChange}
                  className="input"
                  placeholder="Rua, número, bairro, cidade"
                />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label htmlFor="observacoes" className="label">Observações</label>
            <textarea
              id="observacoes"
              name="observacoes"
              value={formData.observacoes}
              onChange={handleChange}
              className="input"
              rows={3}
              placeholder="Observações sobre o cliente (alergias, preferências, etc.)"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? 'Salvando...' : 'Cadastrar Cliente'}
            </button>
            <Link href="/clientes" className="btn btn-secondary">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
