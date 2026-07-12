'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { TermoTemplate } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader, Card, Button, Input, Textarea, Checkbox, Alert, LoadingState, ConfirmDialog } from '@/components/ui';
import { buildTermoPrintableDocument } from '@/lib/helpers/termosDocumento';
import { buildSampleTermoContext, renderTermoTemplate, TERMO_PLACEHOLDER_KEYS } from '@/lib/helpers/termosPlaceholder';
import usePageTitle from '@/lib/utils/usePageTitle';

interface TermoForm {
  slug: string;
  titulo: string;
  conteudo_html: string;
  ativo: number;
}

const INITIAL_FORM: TermoForm = {
  titulo: '',
  slug: '',
  conteudo_html: '',
  ativo: 1,
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}

export default function TermosPage() {
  usePageTitle('Termos');

  const router = useRouter();
  const { user, isAdmin, isLoading: authLoading } = useAuth();

  const [termos, setTermos] = useState<TermoTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<TermoForm>(INITIAL_FORM);
  const [salvando, setSalvando] = useState(false);
  const [editandoSlug, setEditandoSlug] = useState<string | null>(null);
  const [slugEditado, setSlugEditado] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [slugErro, setSlugErro] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const previewHtml = form.conteudo_html.trim()
    ? renderTermoTemplate(form.conteudo_html, buildSampleTermoContext()).html
    : '';
  const previewDocument = buildTermoPrintableDocument(form.titulo || 'Previa do termo', previewHtml);

  const carregarTermos = async () => {
    try {
      const res = await fetch('/api/termos');
      if (!res.ok) throw new Error('Erro ao carregar');
      const data = await res.json();
      setTermos(data);
    } catch {
      setError('Erro ao carregar termos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) {
      router.push('/');
      return;
    }
    carregarTermos();
  }, [user, isAdmin, authLoading, router]);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleNovo = () => {
    setForm(INITIAL_FORM);
    setEditandoSlug(null);
    setSlugEditado(false);
    setSlugErro('');
    setMostrarFormulario(true);
  };

  const abrirEdicao = (termo: TermoTemplate) => {
    setForm({
      titulo: termo.titulo,
      slug: termo.slug,
      conteudo_html: termo.conteudo_html,
      ativo: termo.ativo,
    });
    setEditandoSlug(termo.slug);
    setSlugEditado(true);
    setSlugErro('');
    setMostrarFormulario(true);
  };

  const cancelarFormulario = () => {
    setForm(INITIAL_FORM);
    setEditandoSlug(null);
    setSlugEditado(false);
    setSlugErro('');
    setMostrarFormulario(false);
  };

  const handleTituloChange = (titulo: string) => {
    setForm((prev) => ({
      ...prev,
      titulo,
      slug: slugEditado || editandoSlug ? prev.slug : slugify(titulo),
    }));
  };

  const handleSlugChange = (slug: string) => {
    setSlugEditado(true);
    setSlugErro('');
    setForm((prev) => ({
      ...prev,
      slug,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSlugErro('');

    const titulo = form.titulo.trim();
    const slug = slugify(form.slug.trim());
    const conteudo_html = form.conteudo_html.trim();

    if (!titulo) {
      setError('Título é obrigatório.');
      return;
    }
    if (!slug) {
      setSlugErro('Slug inválido. Use letras, números e hífen.');
      return;
    }
    if (!conteudo_html) {
      setError('Conteúdo HTML é obrigatório.');
      return;
    }

    setSalvando(true);
    try {
      const url = editandoSlug
        ? `/api/termos/${editandoSlug}`
        : '/api/termos';

      const response = await fetch(url, {
        method: editandoSlug ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          slug,
          conteudo_html,
          ativo: form.ativo,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data?.error) {
          setError(data.error);
        } else {
          setError('Erro ao salvar termo');
        }
        return;
      }

      setSuccess(editandoSlug ? 'Termo atualizado com sucesso.' : 'Termo criado com sucesso.');
      cancelarFormulario();
      await carregarTermos();
      void data;
    } catch {
      setError('Erro ao salvar termo');
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleAtivo = async (termo: TermoTemplate, ativo: number) => {
    try {
      const response = await fetch(`/api/termos/${termo.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ativo: ativo ? 1 : 0,
          titulo: termo.titulo,
          slug: termo.slug,
          conteudo_html: termo.conteudo_html,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Erro ao atualizar termo');
        return;
      }

      await carregarTermos();
    } catch {
      setError('Erro ao atualizar termo');
    }
  };

  const handleExcluir = (termo: TermoTemplate) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remover termo',
      message: `Deseja remover o termo "${termo.titulo}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/termos/${termo.slug}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Erro ao remover termo');
            return;
          }
          setSuccess('Termo removido com sucesso.');
          await carregarTermos();
        } catch {
          setError('Erro ao remover termo');
        }
      },
    });
  };

  if (authLoading || loading) {
    return <LoadingState />;
  }

  if (!user || !isAdmin) {
    return <LoadingState text="Carregando..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Termos"
        icon={<FileText className="w-7 h-7" />}
        description="Modelos em HTML para impressão de termos. Admins podem editar e salvar placeholders automaticamente."
        actions={<Button onClick={handleNovo} icon={<Plus className="w-4 h-4" />}>Novo termo</Button>}
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>}

      {mostrarFormulario && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">
            {editandoSlug ? 'Editar termo' : 'Novo termo'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Título"
                name="titulo"
                required
                value={form.titulo}
                onChange={handleTituloChange}
              />
              <Input
                label="Slug"
                name="slug"
                required
                value={form.slug}
                onChange={handleSlugChange}
                hint="Use apenas letras, números e hífen."
                error={slugErro}
              />
            </div>

            <Checkbox
              name="ativo"
              label="Termo ativo"
              checked={Boolean(form.ativo)}
              onChange={(checked) => setForm({ ...form, ativo: checked ? 1 : 0 })}
            />

            <Textarea
              label="Conteúdo HTML"
              name="conteudo_html"
              rows={16}
              value={form.conteudo_html}
              onChange={(value) => setForm({ ...form, conteudo_html: value })}
              required
              hint="Cole aqui o HTML do documento. Use placeholders como {{cliente_nome}}"
            />

            <div>
              <p className="text-sm text-muted-foreground mb-1">Placeholders disponíveis para uso:</p>
              <p className="text-sm font-mono break-words">{TERMO_PLACEHOLDER_KEYS.map((chave) => `{{${chave}}}`).join(' · ')}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Prévia de impressão</p>
                <p className="text-xs text-muted-foreground">A prévia usa valores de exemplo para preencher os placeholders.</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-white">
                <iframe
                  title="Prévia do termo"
                  srcDoc={previewDocument}
                  className="h-[980px] w-full bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={cancelarFormulario}>Cancelar</Button>
              <Button type="submit" loading={salvando}>Salvar</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold mb-4">Termos cadastrados</h2>
        {!termos.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum termo cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full detail-table">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Título</th>
                  <th className="px-4 py-3 text-left">Slug</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Atualizado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {termos.map((termo) => (
                  <tr key={termo.id} className="hover:bg-surface-secondary">
                    <td className="px-4 py-3">{termo.titulo}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{termo.slug}</td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(termo.ativo)}
                          onChange={() => handleToggleAtivo(termo, termo.ativo ? 0 : 1)}
                        />
                        {termo.ativo ? 'Ativo' : 'Inativo'}
                      </label>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{termo.updated_at}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => abrirEdicao(termo)}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Editar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleExcluir(termo)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel || 'Confirmar'}
        onConfirm={confirmDialog.onConfirm}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
