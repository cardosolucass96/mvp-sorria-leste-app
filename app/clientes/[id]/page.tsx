'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Cliente } from '@/lib/types';

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

const getOrigemLabel = (origem: string) => {
  const option = origensOptions.find(opt => opt.value === origem);
  return option?.label || origem;
};

export default function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<ClienteFormData>({
    nome: '',
    cpf: '',
    telefone: '',
    email: '',
    data_nascimento: '',
    endereco: '',
    origem: '',
    observacoes: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  // Carregar cliente
  useEffect(() => {
    const loadCliente = async () => {
      try {
        const response = await fetch(`/api/clientes/${id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            router.push('/clientes');
            return;
          }
          throw new Error('Erro ao carregar');
        }

        const data = await response.json();
        setCliente(data);
        setFormData({
          nome: data.nome || '',
          cpf: data.cpf || '',
          telefone: data.telefone || '',
          email: data.email || '',
          data_nascimento: data.data_nascimento || '',
          endereco: data.endereco || '',
          origem: data.origem || '',
          observacoes: data.observacoes || '',
        });
      } catch {
        setError('Erro ao carregar cliente');
      } finally {
        setIsLoading(false);
      }
    };

    loadCliente();
  }, [id, router]);

  // Limpar mensagens
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Formatar CPF
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
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
    setIsSaving(true);

    try {
      const response = await fetch(`/api/clientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao salvar');
        setIsSaving(false);
        return;
      }

      setCliente(data);
      setSuccess('Cliente atualizado com sucesso!');
      setIsEditing(false);
    } catch {
      setError('Erro ao salvar cliente');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (cliente) {
      setFormData({
        nome: cliente.nome || '',
        cpf: cliente.cpf || '',
        telefone: cliente.telefone || '',
        email: cliente.email || '',
        data_nascimento: cliente.data_nascimento || '',
        endereco: cliente.endereco || '',
        origem: cliente.origem || '',
        observacoes: cliente.observacoes || '',
      });
    }
    setIsEditing(false);
    setError('');
  };

  const handleDelete = async () => {
    if (!confirm(`Deseja excluir o cliente "${cliente?.nome}"?`)) return;

    try {
      const response = await fetch(`/api/clientes/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao excluir');
        return;
      }

      router.push('/clientes');
    } catch {
      setError('Erro ao excluir cliente');
    }
  };

  // Formatar data para exibição
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Cliente não encontrado</p>
        <Link href="/clientes" className="text-blue-600 hover:text-blue-800">
          Voltar para lista
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/clientes" 
            className="text-gray-600 hover:text-gray-900"
          >
            ← Voltar
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">👤 {cliente.nome}</h1>
            <p className="text-gray-600">
              Cadastrado em {formatDate(cliente.created_at)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isEditing && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="btn btn-primary"
              >
                ✏️ Editar
              </button>
              <button
                onClick={handleDelete}
                className="btn btn-danger"
              >
                🗑️ Excluir
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mensagens */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
          {success}
        </div>
      )}

      {/* Conteúdo */}
      <div className="card">
        {isEditing ? (
          /* Modo Edição */
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="observacoes" className="label">Observações</label>
              <textarea
                id="observacoes"
                name="observacoes"
                value={formData.observacoes}
                onChange={handleChange}
                className="input"
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving}
              >
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          /* Modo Visualização */
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Dados Pessoais</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Nome Completo</p>
                  <p className="font-medium">{cliente.nome}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">CPF</p>
                  <p className="font-medium">{cliente.cpf || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Data de Nascimento</p>
                  <p className="font-medium">{formatDate(cliente.data_nascimento)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Origem</p>
                  <p className="font-medium">{getOrigemLabel(cliente.origem)}</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-4">Contato</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Telefone</p>
                  <p className="font-medium">{cliente.telefone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium">{cliente.email || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Endereço</p>
                  <p className="font-medium">{cliente.endereco || '-'}</p>
                </div>
              </div>
            </div>

            {cliente.observacoes && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Observações</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{cliente.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ações Rápidas */}
      {!isEditing && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Ações Rápidas</h2>
          <div className="flex gap-4">
            <Link
              href={`/atendimentos/novo?cliente=${id}`}
              className="btn btn-primary"
            >
              📝 Novo Atendimento
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
