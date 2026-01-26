'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cliente } from '@/lib/types';

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Carregar clientes
  const loadClientes = async (searchTerm = '') => {
    try {
      setIsLoading(true);
      const url = searchTerm 
        ? `/api/clientes?busca=${encodeURIComponent(searchTerm)}`
        : '/api/clientes';
      
      const response = await fetch(url);
      const data = await response.json();
      setClientes(data);
    } catch {
      setError('Erro ao carregar clientes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClientes();
  }, []);

  // Limpar mensagens após 3 segundos
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Busca com debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadClientes(busca);
    }, 300);
    return () => clearTimeout(timer);
  }, [busca]);

  // Excluir cliente
  const handleDelete = async (id: number, nome: string) => {
    if (!confirm(`Deseja excluir o cliente "${nome}"?`)) return;

    try {
      const response = await fetch(`/api/clientes/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao excluir');
        return;
      }

      setSuccess('Cliente excluído!');
      loadClientes(busca);
    } catch {
      setError('Erro ao excluir cliente');
    }
  };

  // Formatar CPF para exibição
  const formatCpf = (cpf: string | null) => {
    if (!cpf) return '-';
    return cpf;
  };

  // Formatar telefone para exibição
  const formatTelefone = (telefone: string | null) => {
    if (!telefone) return '-';
    return telefone;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">👥 Clientes</h1>
          <p className="text-gray-600">Gerenciar clientes da clínica</p>
        </div>
        <Link href="/clientes/novo" className="btn btn-primary">
          + Novo Cliente
        </Link>
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

      {/* Busca */}
      <div className="card">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por nome, CPF, telefone ou email..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input"
            />
          </div>
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="btn btn-secondary"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">
            Carregando...
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    CPF
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Telefone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clientes.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link 
                        href={`/clientes/${cliente.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {cliente.nome}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {formatCpf(cliente.cpf)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {formatTelefone(cliente.telefone)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {cliente.email || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                      <Link
                        href={`/clientes/${cliente.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Ver/Editar
                      </Link>
                      <button
                        onClick={() => handleDelete(cliente.id, cliente.nome)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {clientes.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              </div>
            )}

            {/* Rodapé com contagem */}
            <div className="bg-gray-50 px-6 py-3 text-sm text-gray-500">
              {clientes.length} cliente(s) encontrado(s)
            </div>
          </>
        )}
      </div>
    </div>
  );
}
