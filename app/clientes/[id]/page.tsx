'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Cliente } from '@/lib/types';
import { User } from 'lucide-react';
import { PageHeader, Card, Button, Alert, LoadingState, EmptyState } from '@/components/ui';
import { ClienteForm, ClienteFormData } from '@/components/domain';
import { formatarData, formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';
import usePageTitle from '@/lib/utils/usePageTitle';

export default function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  usePageTitle('Detalhes do Cliente');
  const { id } = use(params);
  const [cliente, setCliente] = useState<Cliente | null>(null);
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

  const handleSubmit = async (formData: ClienteFormData) => {
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

  if (isLoading) {
    return <LoadingState mode="spinner" text="Carregando..." />;
  }

  if (!cliente) {
    return (
      <EmptyState
        icon={<User className="w-7 h-7" />}
        title="Cliente não encontrado"
        actionLabel="Voltar para lista"
        onAction={() => router.push('/clientes')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={cliente.nome}
        icon={<User className="w-7 h-7" />}
        description={`Cadastrado em ${formatarData(cliente.created_at)}`}
        breadcrumb={[
          { label: 'Clientes', href: '/clientes' },
          { label: cliente.nome },
        ]}
        actions={
          !isEditing ? (
            <div className="flex gap-2">
              <Button onClick={() => setIsEditing(true)}>Editar</Button>
              <Button variant="danger" onClick={handleDelete}>Excluir</Button>
            </div>
          ) : undefined
        }
      />

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>
      )}
      {success && (
        <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>
      )}

      <Card>
        {isEditing ? (
          <ClienteForm
            initialData={{
              nome: cliente.nome || '',
              cpf: cliente.cpf || '',
              telefone: cliente.telefone || '',
              email: cliente.email || '',
              data_nascimento: cliente.data_nascimento || '',
              endereco: cliente.endereco || '',
              origem: cliente.origem || '',
              observacoes: cliente.observacoes || '',
            }}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={isSaving}
            error={error}
            submitLabel="Salvar Alterações"
          />
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Dados Pessoais</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted">Nome Completo</p>
                  <p className="font-medium">{cliente.nome}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">CPF</p>
                  <p className="font-medium">{cliente.cpf ? formatarCPF(cliente.cpf) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Data de Nascimento</p>
                  <p className="font-medium">{cliente.data_nascimento ? formatarData(cliente.data_nascimento) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Origem</p>
                  <p className="font-medium">{getOrigemLabel(cliente.origem)}</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-4">Contato</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted">Telefone</p>
                  <p className="font-medium">{cliente.telefone ? formatarTelefone(cliente.telefone) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Email</p>
                  <p className="font-medium">{cliente.email || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted">Endereço</p>
                  <p className="font-medium">{cliente.endereco || '-'}</p>
                </div>
              </div>
            </div>

            {cliente.observacoes && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Observações</h2>
                <p className="text-neutral-700 whitespace-pre-wrap">{cliente.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {!isEditing && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Ações Rápidas</h2>
          <div className="flex gap-4">
            <Link href={`/atendimentos/novo?cliente=${id}`}>
              <Button>Novo Atendimento</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
