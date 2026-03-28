'use client';

import { useState, useEffect } from 'react';
import { Usuario, UserRole } from '@/lib/types';
import { Users } from 'lucide-react';
import { PageHeader, Card, Button, Input, Select, Badge, Alert, LoadingState, Table, ConfirmDialog } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { ROLE_LABELS_DESCRITIVOS } from '@/lib/constants/roles';
import usePageTitle from '@/lib/utils/usePageTitle';

const roleOptions = Object.entries(ROLE_LABELS_DESCRITIVOS).map(([value, label]) => ({
  value,
  label,
}));

interface UsuarioFormData {
  nome: string;
  email: string;
  role: UserRole;
}

const initialFormData: UsuarioFormData = {
  nome: '',
  email: '',
  role: 'atendente',
};

export default function UsuariosPage() {
  usePageTitle('Usuários');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<UsuarioFormData>(initialFormData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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

  // Carregar usuários
  const loadUsuarios = async () => {
    try {
      const response = await fetch('/api/usuarios');
      const data = await response.json();
      setUsuarios(data);
    } catch {
      setError('Erro ao carregar usuários');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsuarios();
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

  // Abrir formulário para novo usuário
  const handleNew = () => {
    setFormData(initialFormData);
    setEditingId(null);
    setShowForm(true);
    setError('');
  };

  // Abrir formulário para editar
  const handleEdit = (usuario: Usuario) => {
    setFormData({
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
    });
    setEditingId(usuario.id);
    setShowForm(true);
    setError('');
  };

  // Cancelar formulário
  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(initialFormData);
    setError('');
  };

  // Salvar (criar ou atualizar)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const url = editingId ? `/api/usuarios/${editingId}` : '/api/usuarios';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao salvar');
        return;
      }

      setSuccess(editingId ? 'Usuário atualizado!' : 'Usuário criado!');
      handleCancel();
      loadUsuarios();
    } catch {
      setError('Erro ao salvar usuário');
    }
  };

  // Desativar usuário
  const handleDelete = (id: number, nome: string) => {
    openConfirm({
      title: 'Desativar Usuário',
      message: `Deseja desativar o usuário "${nome}"?`,
      confirmLabel: 'Desativar',
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const response = await fetch(`/api/usuarios/${id}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            const data = await response.json();
            setError(data.error || 'Erro ao desativar');
            return;
          }

          setSuccess('Usuário desativado!');
          loadUsuarios();
        } catch {
          setError('Erro ao desativar usuário');
        }
      },
    });
  };

  // Reativar usuário
  const handleReactivate = async (id: number) => {
    try {
      const response = await fetch(`/api/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Erro ao reativar');
        return;
      }

      setSuccess('Usuário reativado!');
      loadUsuarios();
    } catch {
      setError('Erro ao reativar usuário');
    }
  };

  const getRoleBadgeColor = (role: UserRole): 'evaluation' | 'blue' | 'amber' | 'green' => {
    const map: Record<UserRole, 'evaluation' | 'blue' | 'amber' | 'green'> = {
      admin: 'evaluation',
      atendente: 'blue',
      avaliador: 'amber',
      executor: 'green',
    };
    return map[role];
  };

  if (isLoading) {
    return <LoadingState mode="spinner" text="Carregando..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        icon={<Users className="w-7 h-7" />}
        description="Gerenciar usuários do sistema"
        actions={<Button onClick={handleNew}>+ Novo Usuário</Button>}
      />

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>
      )}
      {success && (
        <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>
      )}

      {/* Formulário */}
      {showForm && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome"
                name="nome"
                value={formData.nome}
                onChange={(v) => setFormData({ ...formData, nome: v })}
                required
              />
              <Input
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={(v) => setFormData({ ...formData, email: v })}
                required
              />
            </div>
            <Select
              label="Perfil"
              name="role"
              value={formData.role}
              onChange={(v) => setFormData({ ...formData, role: v as UserRole })}
              options={roleOptions}
              required
            />
            <div className="flex gap-2">
              <Button type="submit">Salvar</Button>
              <Button type="button" variant="secondary" onClick={handleCancel}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tabela de Usuários */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        type={confirmDialog.type}
      />

      <Table<Usuario>
        columns={[
          {
            key: 'nome',
            label: 'Nome',
            render: (u) => <span className="font-medium text-foreground">{u.nome}</span>,
          },
          {
            key: 'email',
            label: 'Email',
            render: (u) => <span className="text-neutral-600">{u.email}</span>,
          },
          {
            key: 'role',
            label: 'Perfil',
            render: (u) => (
              <Badge color={getRoleBadgeColor(u.role)}>
                {ROLE_LABELS_DESCRITIVOS[u.role]}
              </Badge>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            render: (u) => (
              <Badge color={u.ativo ? 'green' : 'red'}>
                {u.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            align: 'right',
            render: (u) => (
              <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(u)} className="text-info-600 hover:text-info-800">
                  Editar
                </Button>
                {u.ativo ? (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(u.id, u.nome)} className="text-error-600 hover:text-error-800">
                    Desativar
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleReactivate(u.id)} className="text-success-600 hover:text-success-800">
                    Reativar
                  </Button>
                )}
              </div>
            ),
          },
        ] as TableColumn<Usuario>[]}
        data={usuarios}
        keyExtractor={(u) => u.id}
        emptyMessage="Nenhum usuário cadastrado"
        caption="Usuários do sistema"
      />
    </div>
  );
}
