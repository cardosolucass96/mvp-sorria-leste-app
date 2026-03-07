'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cliente } from '@/lib/types';
import { formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import PageHeader from '@/components/ui/PageHeader';
import Table from '@/components/ui/Table';
import type { TableColumn } from '@/components/ui/Table';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import LoadingState from '@/components/ui/LoadingState';
import usePageTitle from '@/lib/utils/usePageTitle';

export default function ClientesPage() {
  usePageTitle('Clientes');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

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

  const columns: TableColumn<Cliente>[] = [
    {
      key: 'nome',
      label: 'Nome',
      render: (cliente) => (
        <Link
          href={`/clientes/${cliente.id}`}
          className="font-medium text-blue-600 hover:text-blue-800"
        >
          {cliente.nome}
        </Link>
      ),
    },
    {
      key: 'cpf',
      label: 'CPF',
      render: (cliente) => <span className="text-gray-600">{formatarCPF(cliente.cpf)}</span>,
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (cliente) => <span className="text-gray-600">{formatarTelefone(cliente.telefone)}</span>,
    },
    {
      key: 'email',
      label: 'Email',
      render: (cliente) => <span className="text-gray-600">{cliente.email || '-'}</span>,
    },
    {
      key: 'acoes',
      label: 'Ações',
      align: 'right',
      render: (cliente) => (
        <div className="space-x-2">
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
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        icon="👥"
        description="Gerenciar clientes da clínica"
        actions={
          <Button onClick={() => router.push('/clientes/novo')}>+ Novo Cliente</Button>
        }
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>}

      {/* Busca */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            label=""
            name="busca"
            type="search"
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por nome, CPF, telefone ou email..."
          />
        </div>
        {busca && (
          <Button variant="secondary" onClick={() => setBusca('')}>Limpar</Button>
        )}
      </div>

      {/* Tabela */}
      <Table
        columns={columns}
        data={clientes}
        loading={isLoading}
        keyExtractor={(c) => c.id}
        emptyMessage={busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
        emptyIcon="👥"
        caption="Lista de clientes"
      />

      {!isLoading && clientes.length > 0 && (
        <p className="text-sm text-gray-500">{clientes.length} cliente(s) encontrado(s)</p>
      )}
    </div>
  );
}
