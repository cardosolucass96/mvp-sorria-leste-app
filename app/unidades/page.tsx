'use client';

import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { PageHeader, Card, Button, Input, Badge, Alert, LoadingState, Table, ConfirmDialog } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import usePageTitle from '@/lib/utils/usePageTitle';
import type { Unidade } from '@/lib/types';

interface UnidadeFormData {
  nome: string;
  endereco: string;
  telefone: string;
}

const initialForm: UnidadeFormData = { nome: '', endereco: '', telefone: '' };

export default function UnidadesPage() {
  usePageTitle('Unidades');
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<UnidadeFormData>(initialForm);
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

  const loadUnidades = async () => {
    try {
      const res = await fetch('/api/unidades');
      if (res.ok) {
        setUnidades(await res.json());
      }
    } catch {
      setError('Erro ao carregar unidades');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadUnidades(); }, []);

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(''); setSuccess(''); }, 3000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  const handleNew = () => {
    setFormData(initialForm);
    setEditingId(null);
    setShowForm(true);
    setError('');
  };

  const handleEdit = (u: Unidade) => {
    setFormData({
      nome: u.nome,
      endereco: u.endereco || '',
      telefone: u.telefone || '',
    });
    setEditingId(u.id);
    setShowForm(true);
    setError('');
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(initialForm);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.nome.trim()) {
      setError('Nome da unidade é obrigatório');
      return;
    }

    try {
      const url = editingId ? `/api/unidades/${editingId}` : '/api/unidades';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao salvar');
        return;
      }

      setSuccess(editingId ? 'Unidade atualizada!' : 'Unidade criada!');
      handleCancel();
      loadUnidades();
    } catch {
      setError('Erro ao salvar unidade');
    }
  };

  const handleToggleAtivo = (u: Unidade) => {
    const acao = u.ativo ? 'desativar' : 'reativar';
    setConfirmDialog({
      isOpen: true,
      title: `${u.ativo ? 'Desativar' : 'Reativar'} Unidade`,
      message: `Deseja ${acao} a unidade "${u.nome}"?`,
      confirmLabel: u.ativo ? 'Desativar' : 'Reativar',
      type: u.ativo ? 'warning' : 'info',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/unidades/${u.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo: !u.ativo }),
          });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || `Erro ao ${acao}`);
            return;
          }
          setSuccess(`Unidade ${u.ativo ? 'desativada' : 'reativada'}!`);
          loadUnidades();
        } catch {
          setError(`Erro ao ${acao} unidade`);
        }
      },
    });
  };

  if (isLoading) return <LoadingState mode="spinner" text="Carregando..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unidades"
        icon={<Building2 className="w-7 h-7" />}
        description="Gerenciar unidades (clínicas) do sistema"
        actions={<Button onClick={handleNew}>+ Nova Unidade</Button>}
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>}

      {showForm && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Editar Unidade' : 'Nova Unidade'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nome *"
              name="nome"
              value={formData.nome}
              onChange={(v) => setFormData({ ...formData, nome: v })}
              placeholder="Ex: Barra do Ceará"
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Endereço"
                name="endereco"
                value={formData.endereco}
                onChange={(v) => setFormData({ ...formData, endereco: v })}
                placeholder="Rua, número, bairro"
              />
              <Input
                label="Telefone"
                name="telefone"
                value={formData.telefone}
                onChange={(v) => setFormData({ ...formData, telefone: v })}
                placeholder="(85) 99999-0000"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Salvar</Button>
              <Button type="button" variant="secondary" onClick={handleCancel}>Cancelar</Button>
            </div>
          </form>
        </Card>
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

      <Table<Unidade>
        columns={[
          {
            key: 'nome',
            label: 'Nome',
            render: (u) => (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-neutral-400" />
                <span className="font-medium text-foreground">{u.nome}</span>
              </div>
            ),
          },
          {
            key: 'endereco',
            label: 'Endereço',
            render: (u) => (
              <span className="text-neutral-600">{u.endereco || '—'}</span>
            ),
          },
          {
            key: 'telefone',
            label: 'Telefone',
            render: (u) => (
              <span className="text-neutral-600">{u.telefone || '—'}</span>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            render: (u) => (
              <Badge color={u.ativo ? 'green' : 'red'}>
                {u.ativo ? 'Ativa' : 'Inativa'}
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleAtivo(u)}
                  className={u.ativo ? 'text-error-600 hover:text-error-800' : 'text-success-600 hover:text-success-800'}
                >
                  {u.ativo ? 'Desativar' : 'Reativar'}
                </Button>
              </div>
            ),
          },
        ] as TableColumn<Unidade>[]}
        data={unidades}
        keyExtractor={(u) => u.id}
        emptyMessage="Nenhuma unidade cadastrada"
        caption="Unidades do sistema"
      />
    </div>
  );
}
