'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cliente } from '@/lib/types';
import { formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import { Users } from 'lucide-react';
import { PageHeader, Table, Button, Alert, SearchInput, Pagination, ConfirmDialog } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import usePageTitle from '@/lib/utils/usePageTitle';

export default function ClientesPage() {
  usePageTitle('Clientes');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const router = useRouter();
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const openConfirm = (config: Omit<typeof confirmDialog, 'isOpen'>) => {
    setConfirmDialog({ ...config, isOpen: true });
  };

  // Carregar clientes
  const loadClientes = async (searchTerm = '', pageNum = 1) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ page: String(pageNum) });
      if (searchTerm) params.set('busca', searchTerm);

      const response = await fetch(`/api/clientes?${params}`);
      const data = await response.json();
      setClientes(data.clientes);
      setTotal(data.total);
      setTotalPages(data.totalPages);
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

  // Busca com debounce (SearchInput handles debounce internally)
  const handleSearch = useCallback((term: string) => {
    setPage(1);
    loadClientes(term, 1);
  }, []);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadClientes(busca, newPage);
  };

  // Excluir cliente
  const handleDelete = (id: number, nome: string) => {
    openConfirm({
      title: 'Excluir Cliente',
      message: `Deseja excluir o cliente "${nome}"?`,
      confirmLabel: 'Excluir',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
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
          loadClientes(busca, page);
        } catch {
          setError('Erro ao excluir cliente');
        }
      },
    });
  };

  const columns: TableColumn<Cliente>[] = [
    {
      key: 'nome',
      label: 'Nome',
      render: (cliente) => (
        <Link
          href={`/clientes/${cliente.id}`}
          className="font-medium text-info-600 hover:text-info-800"
        >
          {cliente.nome}
        </Link>
      ),
    },
    {
      key: 'cpf',
      label: 'CPF',
      render: (cliente) => <span className="text-neutral-600">{formatarCPF(cliente.cpf)}</span>,
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (cliente) => <span className="text-neutral-600">{formatarTelefone(cliente.telefone)}</span>,
    },
    {
      key: 'email',
      label: 'Email',
      render: (cliente) => <span className="text-neutral-600">{cliente.email || '-'}</span>,
    },
    {
      key: 'acoes',
      label: 'Ações',
      align: 'right',
      render: (cliente) => (
        <div className="space-x-2">
          <Link href={`/clientes/${cliente.id}`}>
            <Button variant="ghost" size="sm" className="text-info-600 hover:text-info-800">
              Ver/Editar
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(cliente.id, cliente.nome)}
            className="text-error-600 hover:text-error-800"
          >
            Excluir
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        icon={<Users className="w-7 h-7" />}
        description="Gerenciar clientes da clínica"
        actions={
          <Button onClick={() => router.push('/clientes/novo')}>+ Novo Cliente</Button>
        }
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>}

      {/* Busca */}
      <SearchInput
        value={busca}
        onChange={setBusca}
        onSearch={handleSearch}
        placeholder="Buscar por nome, CPF, telefone ou email..."
      />

      {/* Tabela */}
      <Table
        columns={columns}
        data={clientes}
        loading={isLoading}
        keyExtractor={(c) => c.id}
        emptyMessage={busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
        caption="Lista de clientes"
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />

      {!isLoading && total > 0 && (
        <p className="text-sm text-muted text-center">
          {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} de {total} cliente(s)
        </p>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        type={confirmDialog.type}
      />
    </div>
  );
}
