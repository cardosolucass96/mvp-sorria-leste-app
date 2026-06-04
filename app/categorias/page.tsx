'use client';

import { useState, useEffect } from 'react';
import { Tags } from 'lucide-react';
import type { UserRole, CategoriaComRoles } from '@/lib/types';
import { PageHeader, Card, Button, Input, Select, Badge, Alert, LoadingState, Table, ConfirmDialog } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { ROLE_LABELS, ALL_ROLES } from '@/lib/constants/roles';
import usePageTitle from '@/lib/utils/usePageTitle';

const COR_OPTIONS = [
  { value: 'primary', label: 'Primary (laranja)' },
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success (verde)' },
  { value: 'warning', label: 'Warning (amarelo)' },
  { value: 'error', label: 'Error (vermelho)' },
  { value: 'evaluation', label: 'Evaluation (roxo)' },
];

const ICONE_OPTIONS = [
  { value: 'Activity', label: 'Activity (padrão execução)' },
  { value: 'Smile', label: 'Smile (dente/ortodontia)' },
  { value: 'Stethoscope', label: 'Stethoscope' },
  { value: 'Heart', label: 'Heart' },
  { value: 'Sparkles', label: 'Sparkles' },
  { value: 'Scissors', label: 'Scissors (cirurgia)' },
];

interface CategoriaFormData {
  nome: string;
  slug: string;
  cor: string;
  icone: string;
  ordem: number;
  pula_avaliacao: boolean;
  roles: UserRole[];
}

const initialFormData: CategoriaFormData = {
  nome: '',
  slug: '',
  cor: 'primary',
  icone: 'Activity',
  ordem: 0,
  pula_avaliacao: false,
  roles: ['executor'],
};

function slugify(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function CategoriasPage() {
  usePageTitle('Filas');
  const [categorias, setCategorias] = useState<CategoriaComRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CategoriaFormData>(initialFormData);
  const [slugEditado, setSlugEditado] = useState(false);
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

  const loadCategorias = async () => {
    try {
      const res = await fetch('/api/categorias');
      if (!res.ok) throw new Error('Erro');
      const data = await res.json();
      setCategorias(data);
    } catch {
      setError('Erro ao carregar filas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategorias();
  }, []);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleNew = () => {
    setFormData(initialFormData);
    setEditingId(null);
    setSlugEditado(false);
    setShowForm(true);
    setError('');
  };

  const handleEdit = (c: CategoriaComRoles) => {
    setFormData({
      nome: c.nome,
      slug: c.slug,
      cor: c.cor,
      icone: c.icone,
      ordem: c.ordem,
      pula_avaliacao: !!c.pula_avaliacao,
      roles: c.roles,
    });
    setEditingId(c.id);
    setSlugEditado(true);
    setShowForm(true);
    setError('');
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(initialFormData);
    setSlugEditado(false);
    setError('');
  };

  const handleNomeChange = (v: string) => {
    setFormData(prev => ({
      ...prev,
      nome: v,
      slug: slugEditado || editingId ? prev.slug : slugify(v),
    }));
  };

  const handleSlugChange = (v: string) => {
    setSlugEditado(true);
    setFormData({ ...formData, slug: slugify(v) });
  };

  const toggleRole = (role: UserRole) => {
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.roles.length === 0) {
      setError('Selecione ao menos uma role');
      return;
    }

    try {
      const url = editingId ? `/api/categorias/${editingId}` : '/api/categorias';
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
      setSuccess(editingId ? 'Fila atualizada!' : 'Fila criada!');
      handleCancel();
      loadCategorias();
    } catch {
      setError('Erro ao salvar fila');
    }
  };

  const handleDelete = (c: CategoriaComRoles) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Desativar Fila',
      message: `Desativar a fila "${c.nome}"? Ela deixará de aparecer no menu e nos cadastros.`,
      confirmLabel: 'Desativar',
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/categorias/${c.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Erro ao desativar');
            return;
          }
          setSuccess('Fila desativada!');
          loadCategorias();
        } catch {
          setError('Erro ao desativar fila');
        }
      },
    });
  };

  const handleReactivate = async (id: number) => {
    try {
      const res = await fetch(`/api/categorias/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erro ao reativar');
        return;
      }
      setSuccess('Fila reativada!');
      loadCategorias();
    } catch {
      setError('Erro ao reativar fila');
    }
  };

  if (isLoading) {
    return <LoadingState mode="spinner" text="Carregando..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Filas"
        icon={<Tags className="w-7 h-7" />}
        description="Filas de atendimento (ex: Geral, Ortodontia). Cada fila define quais roles atendem."
        actions={<Button onClick={handleNew}>+ Nova Fila</Button>}
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>}

      {showForm && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Editar Fila' : 'Nova Fila'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome"
                name="nome"
                value={formData.nome}
                onChange={handleNomeChange}
                required
              />
              <Input
                label="Slug (URL)"
                name="slug"
                value={formData.slug}
                onChange={handleSlugChange}
                hint="Aparece na URL /fila/<slug>. Apenas minúsculas, números e hífen."
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Cor"
                name="cor"
                value={formData.cor}
                onChange={(v) => setFormData({ ...formData, cor: v })}
                options={COR_OPTIONS}
              />
              <Select
                label="Ícone"
                name="icone"
                value={formData.icone}
                onChange={(v) => setFormData({ ...formData, icone: v })}
                options={ICONE_OPTIONS}
              />
              <Input
                label="Ordem no menu"
                name="ordem"
                type="number"
                value={String(formData.ordem)}
                onChange={(v) => setFormData({ ...formData, ordem: parseInt(v) || 0 })}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.pula_avaliacao}
                onChange={(e) => setFormData({ ...formData, pula_avaliacao: e.target.checked })}
                className="w-4 h-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-neutral-700">
                Pula avaliação (atendimento nasce em <em>aguardando pagamento</em>)
              </span>
            </label>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Roles que atendem essa fila
              </label>
              <div className="flex flex-wrap gap-3">
                {ALL_ROLES.map(role => (
                  <label key={role} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.roles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="w-4 h-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-neutral-700">{ROLE_LABELS[role]}</span>
                  </label>
                ))}
              </div>
              {formData.roles.length === 0 && (
                <p className="text-xs text-error-600 mt-1">Selecione ao menos uma role</p>
              )}
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

      <Table<CategoriaComRoles>
        columns={[
          {
            key: 'nome',
            label: 'Nome',
            render: (c) => <span className="font-medium text-foreground">{c.nome}</span>,
          },
          {
            key: 'slug',
            label: 'Slug',
            render: (c) => <code className="text-xs text-neutral-600">/fila/{c.slug}</code>,
          },
          {
            key: 'roles',
            label: 'Roles',
            render: (c) => (
              <div className="flex flex-wrap gap-1">
                {c.roles.map(r => (
                  <Badge key={r} color="blue">{ROLE_LABELS[r]}</Badge>
                ))}
              </div>
            ),
          },
          {
            key: 'pula',
            label: 'Avaliação',
            render: (c) => (
              <span className="text-sm">{c.pula_avaliacao ? 'Pula' : 'Normal'}</span>
            ),
          },
          {
            key: 'ordem',
            label: 'Ordem',
            render: (c) => <span className="text-sm text-neutral-600">{c.ordem}</span>,
          },
          {
            key: 'status',
            label: 'Status',
            render: (c) => (
              <Badge color={c.ativo ? 'green' : 'red'}>
                {c.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            align: 'right',
            render: (c) => (
              <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(c)} className="text-info-600 hover:text-info-800">
                  Editar
                </Button>
                {c.ativo ? (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(c)} className="text-error-600 hover:text-error-800">
                    Desativar
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleReactivate(c.id)} className="text-success-600 hover:text-success-800">
                    Reativar
                  </Button>
                )}
              </div>
            ),
          },
        ] as TableColumn<CategoriaComRoles>[]}
        data={categorias}
        keyExtractor={(c) => c.id}
        emptyMessage="Nenhuma fila cadastrada"
        caption="Filas de atendimento"
      />
    </div>
  );
}
