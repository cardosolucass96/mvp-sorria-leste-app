'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Cliente } from '@/lib/types';
import { formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import { ArrowRight, Pencil, Trash2, Users } from 'lucide-react';
import { PageHeader, Table, Button, Alert, SearchInput, Pagination, ConfirmDialog } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import usePageTitle from '@/lib/utils/usePageTitle';

export default function ClientesPage() {
  usePageTitle('Clientes');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const searchParams = useSearchParams();
  const buscaInicial = searchParams.get('busca') ?? '';
  const [busca, setBusca] = useState(buscaInicial);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [limit, setLimit] = useState(50);
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
      if (data.limit) setLimit(data.limit);
    } catch {
      setError('Erro ao carregar clientes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const buscaDaRota = searchParams.get('busca') ?? '';
    setBusca(buscaDaRota);
    setPage(1);
    loadClientes(buscaDaRota, 1);
  }, [searchParams]);

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
          className="group inline-flex items-center gap-2 font-medium text-foreground transition-colors hover:text-primary-600"
        >
          <span>{cliente.nome}</span>
          <ArrowRight className="h-4 w-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
        </Link>
      ),
    },
    {
      key: 'cpf',
      label: 'CPF',
      render: (cliente) => <span className="text-muted-foreground">{formatarCPF(cliente.cpf)}</span>,
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (cliente) => <span className="text-muted-foreground">{formatarTelefone(cliente.telefone)}</span>,
    },
    {
      key: 'email',
      label: 'Email',
      render: (cliente) => <span className="text-muted-foreground">{cliente.email || '-'}</span>,
    },
    {
      key: 'acoes',
      label: 'Ações',
      align: 'right',
      render: (cliente) => (
        <div className="flex justify-end gap-2 whitespace-nowrap">
          <Link href={`/clientes/${cliente.id}`}>
            <Button
              variant="secondary"
              size="sm"
              className="border-border/70 bg-surface-secondary/55 text-foreground hover:bg-surface-secondary"
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Abrir
            </Button>
          </Link>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(cliente.id, cliente.nome)}
            className="bg-transparent text-error-500 hover:bg-error-500/10 hover:text-error-400"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
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
          {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} de {total} cliente(s)
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
