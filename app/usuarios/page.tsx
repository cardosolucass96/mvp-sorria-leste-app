'use client';

import { useState, useEffect } from 'react';
import { Usuario, UserRole } from '@/lib/types';
import { PageHeader, Card, Button, Input, Select, Badge, Alert, LoadingState } from '@/components/ui';
import { ROLE_LABELS_DESCRITIVOS, ROLE_COLORS } from '@/lib/constants/roles';
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
  const handleDelete = async (id: number, nome: string) => {
    if (!confirm(`Deseja desativar o usuário "${nome}"?`)) return;

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

  const getRoleBadgeColor = (role: UserRole): 'purple' | 'blue' | 'amber' | 'green' => {
    const map: Record<UserRole, 'purple' | 'blue' | 'amber' | 'green'> = {
      admin: 'purple',
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
        title="👤 Usuários"
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
      <Card noPadding>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Perfil
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className={!usuario.ativo ? 'bg-gray-50 opacity-60' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-medium text-gray-900">{usuario.nome}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                  {usuario.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge color={getRoleBadgeColor(usuario.role)}>
                    {ROLE_LABELS_DESCRITIVOS[usuario.role]}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge color={usuario.ativo ? 'green' : 'red'}>
                    {usuario.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                  <button
                    onClick={() => handleEdit(usuario)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Editar
                  </button>
                  {usuario.ativo ? (
                    <button
                      onClick={() => handleDelete(usuario.id, usuario.nome)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Desativar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(usuario.id)}
                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                    >
                      Reativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {usuarios.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            Nenhum usuário cadastrado
          </div>
        )}
      </Card>
    </div>
  );
}
